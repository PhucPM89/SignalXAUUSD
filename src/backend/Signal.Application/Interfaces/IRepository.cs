using System.Linq.Expressions;

namespace Signal.Application.Interfaces;

public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<T>> GetAllAsync(CancellationToken ct = default);
    Task<IReadOnlyList<T>> FindAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default);
    Task<T> AddAsync(T entity, CancellationToken ct = default);
    Task UpdateAsync(T entity, CancellationToken ct = default);
    Task DeleteAsync(Guid id, CancellationToken ct = default);
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}

public interface ISignalRepository : IRepository<Domain.Aggregates.TradingSignal>
{
    Task<IReadOnlyList<Domain.Aggregates.TradingSignal>> GetActiveSignalsAsync(string? symbol = null, CancellationToken ct = default);
    Task<IReadOnlyList<Domain.Aggregates.TradingSignal>> GetSignalHistoryAsync(string symbol, DateTime from, DateTime to, CancellationToken ct = default);
    Task<Domain.Aggregates.TradingSignal?> GetLatestSignalAsync(string symbol, CancellationToken ct = default);
    Task InvalidateExpiredSignalsAsync(CancellationToken ct = default);
}

public interface ICandleRepository
{
    Task<IReadOnlyList<Domain.Entities.Candle>> GetCandlesAsync(string symbol, Domain.Enums.Timeframe tf, DateTime from, DateTime to, CancellationToken ct = default);
    Task<Domain.Entities.Candle?> GetLatestCandleAsync(string symbol, Domain.Enums.Timeframe tf, CancellationToken ct = default);
    Task BulkInsertAsync(IEnumerable<Domain.Entities.Candle> candles, CancellationToken ct = default);
    Task<IReadOnlyList<Domain.Entities.Candle>> GetLastNCandlesAsync(string symbol, Domain.Enums.Timeframe tf, int count, CancellationToken ct = default);
}

public interface INewsRepository : IRepository<Domain.Entities.NewsArticle>
{
    Task<IReadOnlyList<Domain.Entities.NewsArticle>> GetUnprocessedAsync(int batchSize = 50, CancellationToken ct = default);
    Task<IReadOnlyList<Domain.Entities.NewsArticle>> GetHighImpactAsync(DateTime since, CancellationToken ct = default);
    Task<IReadOnlyList<Domain.Entities.EconomicEvent>> GetUpcomingEventsAsync(TimeSpan window, CancellationToken ct = default);
    Task<IReadOnlyList<Domain.Entities.EconomicEvent>> GetTodayHighImpactAsync(CancellationToken ct = default);
}

public interface IMarketDataService
{
    Task<decimal> GetCurrentPriceAsync(string symbol, CancellationToken ct = default);
    Task<Domain.ValueObjects.CorrelationSnapshot> GetCorrelationSnapshotAsync(CancellationToken ct = default);
    Task<Domain.ValueObjects.VolatilitySnapshot> GetVolatilitySnapshotAsync(string symbol, CancellationToken ct = default);
    Task<IReadOnlyList<Domain.Entities.Candle>> GetCandlesAsync(string symbol, Domain.Enums.Timeframe tf, int count, CancellationToken ct = default);
    IAsyncEnumerable<TickData> StreamTicksAsync(string symbol, CancellationToken ct = default);
}

public record TickData(string Symbol, decimal Bid, decimal Ask, decimal Last, decimal Volume, DateTime Timestamp)
{
    public decimal Mid => (Bid + Ask) / 2;
    public decimal Spread => Ask - Bid;
}

public interface ISignalInferenceService
{
    Task<SignalInferenceResult> InferAsync(SignalInferenceRequest request, CancellationToken ct = default);
}

public record SignalInferenceRequest(
    string Symbol,
    Domain.ValueObjects.MarketStructure HtfStructure,
    Domain.ValueObjects.MarketStructure LtfStructure,
    Domain.ValueObjects.CorrelationSnapshot Correlations,
    Domain.ValueObjects.VolatilitySnapshot Volatility,
    IReadOnlyList<Domain.Entities.NewsArticle> RecentNews,
    IReadOnlyList<Domain.Entities.EconomicEvent> UpcomingEvents,
    Domain.Enums.MarketRegime CurrentRegime,
    Domain.Enums.SessionType CurrentSession);

public record SignalInferenceResult(
    Domain.Enums.SignalDirection Direction,
    decimal EntryPrice,
    decimal StopLoss,
    decimal TakeProfit,
    int Confidence,
    Domain.ValueObjects.SignalReasoning Reasoning,
    bool ShouldTrade,
    string NoTradeReason = "",
    string? WinRateJson = null);

public interface INotificationService
{
    Task SendSignalAlertAsync(Domain.Aggregates.TradingSignal signal, CancellationToken ct = default);
    Task SendRegimeChangeAlertAsync(Domain.Enums.MarketRegime regime, string symbol, CancellationToken ct = default);
}

// Abstracts SignalR broadcasting so Infrastructure has no reference to the API project.
public interface ISignalBroadcaster
{
    Task BroadcastSignalAsync(DTOs.SignalDto dto, string symbol, bool institutionalGrade, CancellationToken ct = default);
    Task BroadcastRegimeChangeAsync(string symbol, string regime, CancellationToken ct = default);
    Task BroadcastTickAsync(string symbol, decimal bid, decimal ask, DateTime timestamp, CancellationToken ct = default);
}
