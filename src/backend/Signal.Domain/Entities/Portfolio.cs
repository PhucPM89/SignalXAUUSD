using Signal.Domain.Enums;

namespace Signal.Domain.Entities;

public sealed class Portfolio
{
    public Guid Id { get; private set; }
    public string UserId { get; private set; } = default!;
    public decimal Balance { get; private set; }
    public decimal Equity { get; private set; }
    public decimal Margin { get; private set; }
    public decimal FreeMargin => Equity - Margin;
    public decimal MarginLevel => Margin > 0 ? (Equity / Margin) * 100 : 0;
    public RiskLevel RiskProfile { get; private set; }
    public decimal MaxDailyDrawdown { get; private set; }   // %
    public decimal CurrentDailyDrawdown { get; private set; }
    public decimal MaxRiskPerTrade { get; private set; }    // %
    public bool IsTradingAllowed => CurrentDailyDrawdown < MaxDailyDrawdown && FreeMargin > 0;
    public List<Position> OpenPositions { get; private set; } = [];
    public DateTime LastUpdated { get; private set; }

    private Portfolio() { }

    public static Portfolio Create(
        string userId, decimal initialBalance,
        RiskLevel riskProfile = RiskLevel.Moderate)
    {
        var (maxDD, maxRisk) = riskProfile switch
        {
            RiskLevel.Conservative => (3.0m, 0.5m),
            RiskLevel.Moderate => (5.0m, 1.0m),
            RiskLevel.Aggressive => (10.0m, 2.0m),
            _ => (5.0m, 1.0m)
        };

        return new Portfolio
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Balance = initialBalance,
            Equity = initialBalance,
            Margin = 0,
            RiskProfile = riskProfile,
            MaxDailyDrawdown = maxDD,
            MaxRiskPerTrade = maxRisk,
            LastUpdated = DateTime.UtcNow
        };
    }

    public decimal CalculatePositionSize(decimal stopLossPips, decimal pipValue, string symbol)
    {
        // Kelly/fixed-fractional: riskAmount / (SL pips * pip value per lot)
        var riskAmount = Balance * (MaxRiskPerTrade / 100);
        var lotSize = riskAmount / (stopLossPips * pipValue);
        return Math.Round(Math.Max(0.01m, Math.Min(lotSize, 10.0m)), 2);
    }

    public void UpdateEquity(decimal unrealizedPnL)
    {
        Equity = Balance + unrealizedPnL;
        LastUpdated = DateTime.UtcNow;
    }
}

public sealed class Position
{
    public Guid Id { get; private set; }
    public Guid SignalId { get; private set; }
    public string Symbol { get; private set; } = default!;
    public SignalDirection Direction { get; private set; }
    public decimal EntryPrice { get; private set; }
    public decimal CurrentPrice { get; private set; }
    public decimal StopLoss { get; private set; }
    public decimal TakeProfit { get; private set; }
    public decimal LotSize { get; private set; }
    public decimal UnrealizedPnL { get; private set; }
    public decimal RealizedPnL { get; private set; }
    public PositionStatus Status { get; private set; }
    public DateTime OpenedAt { get; private set; }
    public DateTime? ClosedAt { get; private set; }

    private Position() { }

    public static Position Open(
        Guid signalId, string symbol, SignalDirection direction,
        decimal entry, decimal sl, decimal tp, decimal lotSize)
    {
        return new Position
        {
            Id = Guid.NewGuid(),
            SignalId = signalId,
            Symbol = symbol,
            Direction = direction,
            EntryPrice = entry,
            CurrentPrice = entry,
            StopLoss = sl,
            TakeProfit = tp,
            LotSize = lotSize,
            Status = PositionStatus.Active,
            OpenedAt = DateTime.UtcNow
        };
    }

    public void UpdatePrice(decimal price, decimal pipValue)
    {
        CurrentPrice = price;
        var pips = Direction == SignalDirection.Buy
            ? (price - EntryPrice) / 0.01m
            : (EntryPrice - price) / 0.01m;
        UnrealizedPnL = pips * pipValue * LotSize;
    }
}
