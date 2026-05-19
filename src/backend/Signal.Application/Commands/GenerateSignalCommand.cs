using MediatR;
using Microsoft.Extensions.Logging;
using Signal.Application.Behaviors;
using Signal.Application.DTOs;
using Signal.Application.Interfaces;
using Signal.Domain.Aggregates;
using Signal.Domain.Enums;
using Signal.Domain.ValueObjects;

namespace Signal.Application.Commands;

public record GenerateSignalCommand(string Symbol, bool ForceAnalysis = false)
    : IRequest<SignalDto?>, IMarketSensitiveRequest;

public sealed class GenerateSignalCommandHandler(
    ISignalInferenceService inferenceService,
    IMarketDataService marketDataService,
    ISignalRepository signalRepository,
    INewsRepository newsRepository,
    INotificationService notificationService,
    ILogger<GenerateSignalCommandHandler> logger)
    : IRequestHandler<GenerateSignalCommand, SignalDto?>
{
    public async Task<SignalDto?> Handle(GenerateSignalCommand request, CancellationToken ct)
    {
        // 1. Gather market data concurrently — parallelism is critical for <200ms latency
        var (correlations, volatility, htfCandles, ltfCandles, recentNews, upcomingEvents) =
            await GatherMarketDataAsync(request.Symbol, ct);

        // 2. Build market structure from candle series (HTF + LTF)
        var htfStructure = AnalyzeMarketStructure(htfCandles, Timeframe.H1);
        var ltfStructure = AnalyzeMarketStructure(ltfCandles, Timeframe.M15);

        // 3. Detect current session and regime
        var session = DetermineSession(DateTime.UtcNow);
        var regime = DetermineRegime(volatility, correlations, htfStructure);

        // 4. NoTrade gate — check macro/regime conditions before calling expensive inference
        if (!request.ForceAnalysis && ShouldSuppressAnalysis(regime, session, volatility, correlations))
        {
            logger.LogDebug("Signal suppressed for {Symbol}: unfavorable conditions (Regime={Regime}, Session={Session})",
                request.Symbol, regime, session);
            return null;
        }

        // 5. AI inference — send to FastAPI signal engine
        var inferenceRequest = new SignalInferenceRequest(
            request.Symbol, htfStructure, ltfStructure,
            correlations, volatility, recentNews, upcomingEvents, regime, session);

        var inferenceResult = await inferenceService.InferAsync(inferenceRequest, ct);

        if (!inferenceResult.ShouldTrade)
        {
            logger.LogInformation("Signal engine: NO TRADE for {Symbol}. Reason: {Reason}",
                request.Symbol, inferenceResult.NoTradeReason);
            return null;
        }

        // 6. Build risk parameters with probability from AI model
        var risk = RiskParameters.Create(
            inferenceResult.EntryPrice,
            inferenceResult.StopLoss,
            inferenceResult.TakeProfit,
            pipSize: request.Symbol == "XAUUSD" ? 0.01m : 0.0001m)
            .WithProbability(inferenceResult.Confidence / 100.0m);

        if (!risk.MeetsMinimumRR(1.8m))
        {
            logger.LogDebug("Signal filtered: RR {RR} below minimum for {Symbol}", risk.RiskRewardRatio, request.Symbol);
            return null;
        }

        // 7. Construct the TradingSignal aggregate — domain invariants enforced here
        TradingSignal signal;
        try
        {
            signal = TradingSignal.Create(
                request.Symbol, inferenceResult.Direction, risk,
                inferenceResult.Confidence, regime, session,
                MacroSentiment.Neutral, NewsImpact.None,
                htfStructure, ltfStructure,
                inferenceResult.Reasoning, correlations, volatility);
        }
        catch (InvalidOperationException ex)
        {
            logger.LogDebug("Signal creation rejected by domain: {Reason}", ex.Message);
            return null;
        }

        // Attach win-rate breakdown (in-memory only — not persisted)
        if (inferenceResult.WinRateJson is not null)
            signal.SetWinRate(inferenceResult.WinRateJson);

        // 8. Persist and broadcast
        await signalRepository.AddAsync(signal, ct);
        await notificationService.SendSignalAlertAsync(signal, ct);

        logger.LogInformation(
            "Signal generated: {Dir} {Symbol} @ {Entry} | SL:{SL} TP:{TP} | Conf:{Conf}% RR:{RR}",
            signal.Direction, signal.Symbol, risk.EntryPrice,
            risk.StopLoss, risk.TakeProfit, signal.ConfidenceScore, risk.RiskRewardRatio);

        return SignalDto.FromDomain(signal);
    }

    private async Task<(CorrelationSnapshot, VolatilitySnapshot,
        IReadOnlyList<Domain.Entities.Candle>, IReadOnlyList<Domain.Entities.Candle>,
        IReadOnlyList<Domain.Entities.NewsArticle>, IReadOnlyList<Domain.Entities.EconomicEvent>)>
        GatherMarketDataAsync(string symbol, CancellationToken ct)
    {
        var correlationsTask = marketDataService.GetCorrelationSnapshotAsync(ct);
        var volatilityTask = marketDataService.GetVolatilitySnapshotAsync(symbol, ct);
        var htfTask = marketDataService.GetCandlesAsync(symbol, Timeframe.H1, 200, ct);
        var ltfTask = marketDataService.GetCandlesAsync(symbol, Timeframe.M15, 100, ct);
        var newsTask = newsRepository.GetHighImpactAsync(DateTime.UtcNow.AddHours(-4), ct);
        var eventsTask = newsRepository.GetUpcomingEventsAsync(TimeSpan.FromHours(24), ct);

        await Task.WhenAll(correlationsTask, volatilityTask, htfTask, ltfTask, newsTask, eventsTask);

        return (await correlationsTask, await volatilityTask,
                await htfTask, await ltfTask,
                await newsTask, await eventsTask);
    }

    private static MarketStructure AnalyzeMarketStructure(
        IReadOnlyList<Domain.Entities.Candle> candles, Timeframe tf)
    {
        if (candles.Count < 20)
            return new MarketStructure { Timeframe = tf };

        var highs = candles.Select(c => c.High).ToList();
        var lows = candles.Select(c => c.Low).ToList();
        var swingHigh = highs.TakeLast(50).Max();
        var swingLow = lows.TakeLast(50).Min();
        var current = candles.Last().Close;
        var bullish = current > (swingHigh + swingLow) / 2;

        // Detect order blocks: last bearish candle before a bullish impulse (simplified)
        var orderBlocks = DetectOrderBlocks(candles, tf);
        var fvgs = DetectFairValueGaps(candles, tf);
        var liquidityLevels = DetectLiquidityLevels(candles);

        return new MarketStructure
        {
            Timeframe = tf,
            BullishStructure = bullish,
            SwingHigh = swingHigh,
            SwingLow = swingLow,
            CurrentPrice = current,
            OrderBlocks = orderBlocks,
            FairValueGaps = fvgs,
            LiquidityLevels = liquidityLevels
        };
    }

    private static List<OrderBlock> DetectOrderBlocks(
        IReadOnlyList<Domain.Entities.Candle> candles, Timeframe tf)
    {
        var blocks = new List<OrderBlock>();
        for (int i = 2; i < candles.Count - 1; i++)
        {
            var prev = candles[i - 1];
            var curr = candles[i];
            var next = candles[i + 1];

            // Bullish OB: bearish candle followed by strong bullish impulse breaking structure
            if (prev.IsBearish && curr.IsBullish &&
                curr.Body > prev.Body * 1.5m &&
                curr.Close > prev.High)
            {
                blocks.Add(new OrderBlock
                {
                    High = prev.High,
                    Low = prev.Low,
                    IsBullish = true,
                    IsUnmitigated = !candles.Skip(i + 1).Any(c => c.Low <= prev.Low),
                    Strength = (int)Math.Min(100, (curr.Body / prev.Body) * 50),
                    OriginTimeframe = tf,
                    FormedAt = prev.OpenTime
                });
            }

            // Bearish OB: bullish candle followed by strong bearish impulse
            if (prev.IsBullish && curr.IsBearish &&
                curr.Body > prev.Body * 1.5m &&
                curr.Close < prev.Low)
            {
                blocks.Add(new OrderBlock
                {
                    High = prev.High,
                    Low = prev.Low,
                    IsBullish = false,
                    IsUnmitigated = !candles.Skip(i + 1).Any(c => c.High >= prev.High),
                    Strength = (int)Math.Min(100, (curr.Body / prev.Body) * 50),
                    OriginTimeframe = tf,
                    FormedAt = prev.OpenTime
                });
            }
        }
        return blocks.TakeLast(10).ToList();
    }

    private static List<FairValueGap> DetectFairValueGaps(
        IReadOnlyList<Domain.Entities.Candle> candles, Timeframe tf)
    {
        var fvgs = new List<FairValueGap>();
        for (int i = 1; i < candles.Count - 1; i++)
        {
            var c1 = candles[i - 1];
            var c3 = candles[i + 1];
            var pipSize = c1.High > 100 ? 0.01m : 0.0001m;

            // Bullish FVG: c1 high < c3 low
            if (c1.High < c3.Low)
            {
                var size = (c3.Low - c1.High) / pipSize;
                if (size >= 5) // minimum 5 pips
                    fvgs.Add(new FairValueGap
                    {
                        UpperBound = c3.Low,
                        LowerBound = c1.High,
                        IsBullish = true,
                        IsFilled = candles.Skip(i + 1).Any(c => c.Low <= c1.High),
                        OriginTimeframe = tf,
                        FormedAt = candles[i].OpenTime,
                        SizeInPips = size
                    });
            }

            // Bearish FVG: c1 low > c3 high
            if (c1.Low > c3.High)
            {
                var size = (c1.Low - c3.High) / pipSize;
                if (size >= 5)
                    fvgs.Add(new FairValueGap
                    {
                        UpperBound = c1.Low,
                        LowerBound = c3.High,
                        IsBullish = false,
                        IsFilled = candles.Skip(i + 1).Any(c => c.High >= c1.Low),
                        OriginTimeframe = tf,
                        FormedAt = candles[i].OpenTime,
                        SizeInPips = size
                    });
            }
        }
        return fvgs.TakeLast(5).ToList();
    }

    private static List<LiquidityLevel> DetectLiquidityLevels(
        IReadOnlyList<Domain.Entities.Candle> candles)
    {
        var levels = new List<LiquidityLevel>();
        var recent = candles.TakeLast(50).ToList();

        // Equal highs / equal lows as liquidity pools
        for (int i = 0; i < recent.Count - 2; i++)
        {
            var tolerance = recent[i].High > 100 ? 0.10m : 0.00010m;

            for (int j = i + 2; j < recent.Count; j++)
            {
                if (Math.Abs(recent[i].High - recent[j].High) <= tolerance)
                    levels.Add(new LiquidityLevel
                    {
                        Price = (recent[i].High + recent[j].High) / 2,
                        Description = "Equal Highs (BSL)",
                        IsSwept = recent.Skip(j + 1).Any(c => c.High > recent[j].High + tolerance)
                    });

                if (Math.Abs(recent[i].Low - recent[j].Low) <= tolerance)
                    levels.Add(new LiquidityLevel
                    {
                        Price = (recent[i].Low + recent[j].Low) / 2,
                        Description = "Equal Lows (SSL)",
                        IsSwept = recent.Skip(j + 1).Any(c => c.Low < recent[j].Low - tolerance),
                        IsBullishSweep = true
                    });
            }
        }
        return levels.Take(8).ToList();
    }

    private static SessionType DetermineSession(DateTime utcNow)
    {
        var hour = utcNow.Hour;
        return hour switch
        {
            >= 22 or <= 1 => SessionType.Sydney,
            >= 2 and <= 7 => SessionType.Tokyo,
            >= 8 and <= 11 => SessionType.Overlap,   // London/Tokyo overlap
            17 => SessionType.Overlap,               // London/NY overlap — highest liquidity
            >= 12 and <= 16 => SessionType.London,
            _ => SessionType.NewYork                 // 18–21
        };
    }

    private static MarketRegime DetermineRegime(
        VolatilitySnapshot vol, CorrelationSnapshot corr, MarketStructure htf)
    {
        if (vol.IsHighVolatility && corr.IsRiskOff) return MarketRegime.HighVolatility;
        if (vol.IsLowVolatility) return MarketRegime.LowLiquidity;
        if (vol.IsContracting) return MarketRegime.Compression;
        if (vol.IsExpanding && htf.BullishStructure) return MarketRegime.Trending;
        if (vol.IsExpanding && !htf.BullishStructure) return MarketRegime.Expansion;
        if (htf.BreakOfStructure || htf.ChangeOfCharacter) return MarketRegime.Manipulation;
        return MarketRegime.RangeBound;
    }

    private static bool ShouldSuppressAnalysis(
        MarketRegime regime, SessionType session,
        VolatilitySnapshot vol, CorrelationSnapshot corr)
    {
        // Suppress in low-liquidity sessions for non-24h instruments
        if (session == SessionType.Sydney || session == SessionType.OffSession) return true;
        // Suppress in extreme volatility unless it's a known safe regime
        if (regime == MarketRegime.HighVolatility && corr.Vix > 35) return true;
        // Suppress in dead compression with no expansion signal
        if (regime == MarketRegime.Compression && !vol.IsExpanding) return true;
        return false;
    }
}
