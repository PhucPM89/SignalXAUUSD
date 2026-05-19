using Signal.Domain.Entities;
using Signal.Domain.Enums;
using Signal.Domain.Events;
using Signal.Domain.ValueObjects;

namespace Signal.Domain.Aggregates;

/// <summary>
/// Core aggregate — represents a fully-reasoned institutional trade signal.
/// Created only when ALL confidence thresholds are met across HTF, LTF, macro, and regime layers.
/// </summary>
public sealed class TradingSignal
{
    public Guid Id { get; private set; }
    public string Symbol { get; private set; } = default!;
    public SignalDirection Direction { get; private set; }
    public SignalStrength Strength { get; private set; }
    public RiskParameters Risk { get; private set; } = default!;
    public int ConfidenceScore { get; private set; }       // 0-100
    public MarketRegime Regime { get; private set; }
    public SessionType Session { get; private set; }
    public MacroSentiment MacroSentiment { get; private set; }
    public NewsImpact NewsImpact { get; private set; }

    // Contextual analysis layers
    public MarketStructure HtfStructure { get; private set; } = default!;  // H4/H1
    public MarketStructure LtfStructure { get; private set; } = default!;  // M15/M5
    public SignalReasoning Reasoning { get; private set; } = default!;
    public CorrelationSnapshot Correlations { get; private set; } = default!;
    public VolatilitySnapshot Volatility { get; private set; } = default!;

    public DateTime GeneratedAt { get; private set; }
    public DateTime ExpiresAt { get; private set; }
    public bool IsExpired => DateTime.UtcNow > ExpiresAt;
    public bool IsActive { get; private set; }

    // Populated after Create() — not persisted to DB, included in SignalR broadcast only
    [System.ComponentModel.DataAnnotations.Schema.NotMapped]
    public string? WinRateJson { get; private set; }
    public void SetWinRate(string json) => WinRateJson = json;
    public bool IsInstitutionalGrade =>
        ConfidenceScore >= 72 && Risk.IsInstitutionalGrade() && Strength >= SignalStrength.Strong;

    private readonly List<IDomainEvent> _domainEvents = [];
    public IReadOnlyList<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    private TradingSignal() { }

    public static TradingSignal Create(
        string symbol,
        SignalDirection direction,
        RiskParameters risk,
        int confidence,
        MarketRegime regime,
        SessionType session,
        MacroSentiment macro,
        NewsImpact newsImpact,
        MarketStructure htf,
        MarketStructure ltf,
        SignalReasoning reasoning,
        CorrelationSnapshot correlations,
        VolatilitySnapshot volatility,
        TimeSpan? validFor = null)
    {
        if (direction == SignalDirection.NoTrade)
            throw new InvalidOperationException("NoTrade direction cannot create a signal aggregate. Return null from the engine instead.");

        if (confidence < 60)
            throw new InvalidOperationException($"Signal confidence {confidence} is below the 60% minimum threshold. Engine should suppress this signal.");

        if (!risk.MeetsMinimumRR(1.5m))
            throw new InvalidOperationException($"RR ratio {risk.RiskRewardRatio} does not meet minimum 1.5 requirement.");

        var signal = new TradingSignal
        {
            Id = Guid.NewGuid(),
            Symbol = symbol.ToUpperInvariant(),
            Direction = direction,
            Risk = risk,
            ConfidenceScore = confidence,
            Regime = regime,
            Session = session,
            MacroSentiment = macro,
            NewsImpact = newsImpact,
            HtfStructure = htf,
            LtfStructure = ltf,
            Reasoning = reasoning,
            Correlations = correlations,
            Volatility = volatility,
            GeneratedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.Add(validFor ?? TimeSpan.FromHours(4)),
            IsActive = true
        };

        signal.Strength = signal.DetermineStrength();
        signal._domainEvents.Add(new SignalGeneratedEvent(signal.Id, symbol, direction, confidence));
        return signal;
    }

    public void Invalidate(string reason)
    {
        IsActive = false;
        _domainEvents.Add(new SignalInvalidatedEvent(Id, Symbol, reason));
    }

    public void UpdateConfidence(int newScore)
    {
        if (newScore < 0 || newScore > 100) return;
        if (newScore < 50) { Invalidate("Confidence dropped below threshold."); return; }
        ConfidenceScore = newScore;
    }

    private SignalStrength DetermineStrength()
    {
        if (ConfidenceScore >= 85 && Risk.RiskRewardRatio >= 3.0m) return SignalStrength.Institutional;
        if (ConfidenceScore >= 75 && Risk.RiskRewardRatio >= 2.5m) return SignalStrength.Strong;
        if (ConfidenceScore >= 65 && Risk.RiskRewardRatio >= 2.0m) return SignalStrength.Moderate;
        return SignalStrength.Weak;
    }

    public void ClearDomainEvents() => _domainEvents.Clear();
}

