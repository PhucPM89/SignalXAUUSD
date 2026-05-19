using Microsoft.Extensions.Logging;
using Signal.Application.Interfaces;
using System.Net.Http.Json;
using System.Text.Json;

namespace Signal.Infrastructure.ExternalServices;

/// <summary>
/// HTTP client to the Python FastAPI signal engine.
/// Uses Polly for retry + circuit breaker — if the AI service is down,
/// we degrade gracefully to NO TRADE rather than crashing the ASP.NET host.
/// </summary>
public sealed class SignalInferenceService(
    IHttpClientFactory httpFactory,
    ILogger<SignalInferenceService> logger) : ISignalInferenceService
{
    public async Task<SignalInferenceResult> InferAsync(
        SignalInferenceRequest request, CancellationToken ct = default)
    {
        var client = httpFactory.CreateClient("SignalEngine");

        var payload = MapToPayload(request);

        try
        {
            using var response = await client.PostAsJsonAsync("/infer", payload, ct);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Signal engine returned {Status} for {Symbol}",
                    response.StatusCode, request.Symbol);
                return NoTrade($"Signal engine HTTP {(int)response.StatusCode}");
            }

            var result = await response.Content.ReadFromJsonAsync<InferenceApiResponse>(ct);
            if (result is null) return NoTrade("Null response from signal engine.");

            string? winRateJson = result.WinRate is not null
                ? JsonSerializer.Serialize(result.WinRate)
                : null;

            return new SignalInferenceResult(
                Enum.Parse<Domain.Enums.SignalDirection>(result.Direction, ignoreCase: true),
                result.EntryPrice,
                result.StopLoss,
                result.TakeProfit,
                result.Confidence,
                MapReasoning(result.Reasoning),
                result.ShouldTrade,
                result.NoTradeReason ?? string.Empty,
                winRateJson);
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Signal engine unreachable for {Symbol}", request.Symbol);
            return NoTrade("Signal engine unreachable — circuit open.");
        }
        catch (TaskCanceledException)
        {
            logger.LogWarning("Signal engine timed out for {Symbol}", request.Symbol);
            return NoTrade("Signal engine timeout.");
        }
    }

    private static SignalInferenceResult NoTrade(string reason) =>
        new(Domain.Enums.SignalDirection.NoTrade, 0, 0, 0, 0,
            new Domain.ValueObjects.SignalReasoning(), false, reason);

    private static object MapToPayload(SignalInferenceRequest r) => new
    {
        symbol = r.Symbol,
        session = r.CurrentSession.ToString(),
        regime = r.CurrentRegime.ToString(),
        htf_structure = new
        {
            bullish = r.HtfStructure.BullishStructure,
            bos = r.HtfStructure.BreakOfStructure,
            choch = r.HtfStructure.ChangeOfCharacter,
            swing_high = r.HtfStructure.SwingHigh,
            swing_low = r.HtfStructure.SwingLow,
            current_price = r.HtfStructure.CurrentPrice,
            structure_score = r.HtfStructure.StructureScore(),
            order_blocks = r.HtfStructure.OrderBlocks.Select(ob => new
            {
                high = ob.High, low = ob.Low, bullish = ob.IsBullish,
                unmitigated = ob.IsUnmitigated, strength = ob.Strength
            }),
            fvgs = r.HtfStructure.FairValueGaps.Select(fvg => new
            {
                upper = fvg.UpperBound, lower = fvg.LowerBound,
                bullish = fvg.IsBullish, filled = fvg.IsFilled, size_pips = fvg.SizeInPips
            })
        },
        ltf_structure = new
        {
            bullish = r.LtfStructure.BullishStructure,
            bos = r.LtfStructure.BreakOfStructure,
            choch = r.LtfStructure.ChangeOfCharacter,
            structure_score = r.LtfStructure.StructureScore(),
            current_price = r.LtfStructure.CurrentPrice
        },
        correlations = new
        {
            dxy = r.Correlations.DxyValue,
            dxy_change_1h = r.Correlations.DxyChange1H,
            us10y = r.Correlations.Us10YYield,
            us10y_change_1h = r.Correlations.Us10YChange1H,
            vix = r.Correlations.Vix,
            spx_change_1d = r.Correlations.SpxChange1D,
            risk_off = r.Correlations.IsRiskOff
        },
        volatility = new
        {
            atr_1h = r.Volatility.Atr1H,
            atr_4h = r.Volatility.Atr4H,
            adr_pct = r.Volatility.AdrPercent,
            expanding = r.Volatility.IsExpanding
        },
        recent_news = r.RecentNews.Take(10).Select(n => new
        {
            headline = n.Headline,
            sentiment = n.SentimentScore,
            impact = n.Impact.ToString(),
            impact_score = n.MarketImpactScore
        }),
        upcoming_events = r.UpcomingEvents.Take(5).Select(ev => new
        {
            name = ev.Name,
            currency = ev.Currency,
            impact = ev.Impact.ToString(),
            minutes_until = (ev.ScheduledAt - DateTime.UtcNow).TotalMinutes
        })
    };

    private static Domain.ValueObjects.SignalReasoning MapReasoning(ApiReasoning? r) =>
        r is null
            ? new Domain.ValueObjects.SignalReasoning()
            : new Domain.ValueObjects.SignalReasoning
            {
                HtfBias = r.HtfBias ?? string.Empty,
                LiquidityNarrative = r.LiquidityNarrative ?? string.Empty,
                MacroContext = r.MacroContext ?? string.Empty,
                NewsContext = r.NewsContext ?? string.Empty,
                EntryTrigger = r.EntryTrigger ?? string.Empty,
                RiskJustification = r.RiskJustification ?? string.Empty,
                BullishFactors = r.BullishFactors ?? [],
                BearishFactors = r.BearishFactors ?? [],
                RiskWarnings = r.RiskWarnings ?? [],
                VolatilityWarning = r.VolatilityWarning ?? string.Empty
            };

    private record InferenceApiResponse(
        string Direction, decimal EntryPrice, decimal StopLoss, decimal TakeProfit,
        int Confidence, bool ShouldTrade, string? NoTradeReason, ApiReasoning? Reasoning,
        System.Text.Json.JsonElement? WinRate = null);

    private record ApiReasoning(
        string? HtfBias, string? LiquidityNarrative, string? MacroContext,
        string? NewsContext, string? EntryTrigger, string? RiskJustification,
        List<string>? BullishFactors, List<string>? BearishFactors,
        List<string>? RiskWarnings, string? VolatilityWarning);
}

public sealed class SignalEngineOptions
{
    public string BaseUrl { get; set; } = "http://signal-engine:8000";
    public int TimeoutSeconds { get; set; } = 5;
    public int RetryCount { get; set; } = 2;
}
