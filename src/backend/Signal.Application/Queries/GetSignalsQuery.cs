using MediatR;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using Signal.Application.DTOs;
using Signal.Application.Interfaces;

namespace Signal.Application.Queries;

public record GetActiveSignalsQuery(string? Symbol = null) : IRequest<IReadOnlyList<SignalDto>>;

public sealed class GetActiveSignalsQueryHandler(
    ISignalRepository signalRepo,
    Microsoft.Extensions.Caching.Distributed.IDistributedCache cache,
    Microsoft.Extensions.Logging.ILogger<GetActiveSignalsQueryHandler> logger)
    : IRequestHandler<GetActiveSignalsQuery, IReadOnlyList<SignalDto>>
{
    public async Task<IReadOnlyList<SignalDto>> Handle(GetActiveSignalsQuery request, CancellationToken ct)
    {
        var cacheKey = $"signals:active:{request.Symbol ?? "all"}";

        // Warm path: try Redis first — signals are rebuilt every 1-2s by the engine anyway
        var cached = await cache.GetStringAsync(cacheKey, ct);
        if (cached is not null)
        {
            logger.LogDebug("Cache hit for {Key}", cacheKey);
            return System.Text.Json.JsonSerializer.Deserialize<List<SignalDto>>(cached) ?? [];
        }

        await signalRepo.InvalidateExpiredSignalsAsync(ct);
        var signals = await signalRepo.GetActiveSignalsAsync(request.Symbol, ct);
        var dtos = signals
            .Where(s => s.IsActive && !s.IsExpired && s.IsInstitutionalGrade)
            .OrderByDescending(s => s.ConfidenceScore)
            .Select(SignalDto.FromDomain)
            .ToList();

        // Cache for 10 seconds — short TTL because signals update rapidly
        await cache.SetStringAsync(cacheKey,
            System.Text.Json.JsonSerializer.Serialize(dtos),
            new Microsoft.Extensions.Caching.Distributed.DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(10)
            }, ct);

        return dtos;
    }
}

public record GetSignalHistoryQuery(string Symbol, DateTime From, DateTime To, int Page = 1, int PageSize = 50)
    : IRequest<PagedResult<SignalDto>>;

public sealed class GetSignalHistoryQueryHandler(ISignalRepository signalRepo)
    : IRequestHandler<GetSignalHistoryQuery, PagedResult<SignalDto>>
{
    public async Task<PagedResult<SignalDto>> Handle(GetSignalHistoryQuery request, CancellationToken ct)
    {
        var signals = await signalRepo.GetSignalHistoryAsync(request.Symbol, request.From, request.To, ct);
        var total = signals.Count;
        var items = signals
            .OrderByDescending(s => s.GeneratedAt)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(SignalDto.FromDomain)
            .ToList();

        return new PagedResult<SignalDto>(items, total, request.Page, request.PageSize);
    }
}

public record GetCandlesQuery(string Symbol, Domain.Enums.Timeframe Timeframe, int Count = 200)
    : IRequest<IReadOnlyList<CandleDto>>;

public sealed class GetCandlesQueryHandler(IMarketDataService marketData)
    : IRequestHandler<GetCandlesQuery, IReadOnlyList<CandleDto>>
{
    public async Task<IReadOnlyList<CandleDto>> Handle(GetCandlesQuery request, CancellationToken ct)
    {
        var candles = await marketData.GetCandlesAsync(request.Symbol, request.Timeframe, request.Count, ct);
        return candles
            .Select(c => new CandleDto(
                ((DateTimeOffset)c.OpenTime).ToUnixTimeSeconds(),
                c.Open, c.High, c.Low, c.Close, c.Volume))
            .ToList();
    }
}

public record GetMarketOverviewQuery(IReadOnlyList<string> Symbols) : IRequest<IReadOnlyList<MarketOverviewDto>>;

public sealed class GetMarketOverviewQueryHandler(
    IMarketDataService marketData,
    ISignalRepository signalRepo)
    : IRequestHandler<GetMarketOverviewQuery, IReadOnlyList<MarketOverviewDto>>
{
    public async Task<IReadOnlyList<MarketOverviewDto>> Handle(GetMarketOverviewQuery request, CancellationToken ct)
    {
        var results = await Task.WhenAll(request.Symbols.Select(async symbol =>
        {
            var priceTask = marketData.GetCurrentPriceAsync(symbol, ct);
            var signalsTask = signalRepo.GetActiveSignalsAsync(symbol, ct);
            await Task.WhenAll(priceTask, signalsTask);

            var price = await priceTask;
            var signals = await signalsTask;

            return new MarketOverviewDto(
                symbol, price, 0, 0,
                "Trending", "London",
                signals.Count(s => s.IsActive),
                DateTime.UtcNow);
        }));

        return results;
    }
}

public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize)
{
    public int TotalPages => (int)Math.Ceiling(Total / (double)PageSize);
    public bool HasNext => Page < TotalPages;
    public bool HasPrevious => Page > 1;
}
