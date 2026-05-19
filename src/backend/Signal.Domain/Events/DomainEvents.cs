using Signal.Domain.Enums;

namespace Signal.Domain.Events;

public interface IDomainEvent
{
    Guid EventId { get; }
    DateTime OccurredAt { get; }
    string EventType { get; }
}

public abstract record DomainEventBase : IDomainEvent
{
    public Guid EventId { get; init; } = Guid.NewGuid();
    public DateTime OccurredAt { get; init; } = DateTime.UtcNow;
    public abstract string EventType { get; }
}

public sealed record SignalGeneratedEvent(
    Guid SignalId,
    string Symbol,
    SignalDirection Direction,
    int Confidence) : DomainEventBase
{
    public override string EventType => "signal.generated";
}

public sealed record SignalInvalidatedEvent(
    Guid SignalId,
    string Symbol,
    string Reason) : DomainEventBase
{
    public override string EventType => "signal.invalidated";
}

public sealed record MarketRegimeChangedEvent(
    string Symbol,
    MarketRegime PreviousRegime,
    MarketRegime NewRegime) : DomainEventBase
{
    public override string EventType => "market.regime_changed";
}

public sealed record LiquiditySweepDetectedEvent(
    string Symbol,
    decimal SweepPrice,
    bool IsBullishSweep,
    decimal LiquidityLevel) : DomainEventBase
{
    public override string EventType => "liquidity.sweep_detected";
}

public sealed record NewsHighImpactEvent(
    string Headline,
    string Currency,
    NewsImpact Impact,
    DateTime ScheduledAt) : DomainEventBase
{
    public override string EventType => "news.high_impact";
}

public sealed record VolatilityExpansionEvent(
    string Symbol,
    decimal CurrentAtr,
    decimal BaselineAtr,
    decimal ExpansionRatio) : DomainEventBase
{
    public override string EventType => "volatility.expansion";
}
