using Signal.Domain.Enums;

namespace Signal.Domain.ValueObjects;

/// <summary>
/// Encodes HTF → LTF market structure state used by the signal engine.
/// Immutable snapshot — rebuilt each analysis cycle.
/// </summary>
public sealed record MarketStructure
{
    public Timeframe Timeframe { get; init; }
    public bool BullishStructure { get; init; }
    public bool BreakOfStructure { get; init; }   // BOS — continuation
    public bool ChangeOfCharacter { get; init; }  // CHoCH — reversal signal
    public decimal SwingHigh { get; init; }
    public decimal SwingLow { get; init; }
    public decimal CurrentPrice { get; init; }
    public List<LiquidityLevel> LiquidityLevels { get; init; } = [];
    public List<OrderBlock> OrderBlocks { get; init; } = [];
    public List<FairValueGap> FairValueGaps { get; init; } = [];
    public DateTime LastUpdated { get; init; } = DateTime.UtcNow;

    public bool IsAboveMidpoint => CurrentPrice > (SwingHigh + SwingLow) / 2;
    public bool HasBullishOrderBlock => OrderBlocks.Any(ob => ob.IsBullish && ob.IsUnmitigated);
    public bool HasBearishOrderBlock => OrderBlocks.Any(ob => !ob.IsBullish && ob.IsUnmitigated);
    public bool HasBullishFVG => FairValueGaps.Any(fvg => fvg.IsBullish && !fvg.IsFilled);
    public bool HasBearishFVG => FairValueGaps.Any(fvg => !fvg.IsBullish && !fvg.IsFilled);

    public int StructureScore()
    {
        var score = 0;
        if (BullishStructure) score += 20;
        if (BreakOfStructure) score += 15;
        if (ChangeOfCharacter) score -= 10;
        if (HasBullishOrderBlock) score += 20;
        if (HasBullishFVG) score += 15;
        if (LiquidityLevels.Any(l => l.IsSwept && l.IsBullishSweep)) score += 30;
        return Math.Clamp(score, -100, 100);
    }
}

public sealed record LiquidityLevel
{
    public decimal Price { get; init; }
    public bool IsSwept { get; init; }
    public bool IsBullishSweep { get; init; }
    public DateTime? SweptAt { get; init; }
    public string Description { get; init; } = string.Empty;  // e.g. "Equal Highs", "BSL"
}

public sealed record OrderBlock
{
    public decimal High { get; init; }
    public decimal Low { get; init; }
    public decimal Midpoint => (High + Low) / 2;
    public bool IsBullish { get; init; }
    public bool IsUnmitigated { get; init; }
    public int Strength { get; init; }  // 1-100
    public Timeframe OriginTimeframe { get; init; }
    public DateTime FormedAt { get; init; }
    public bool IsMitigated => !IsUnmitigated;
}

public sealed record FairValueGap
{
    public decimal UpperBound { get; init; }
    public decimal LowerBound { get; init; }
    public decimal Midpoint => (UpperBound + LowerBound) / 2;
    public bool IsBullish { get; init; }
    public bool IsFilled { get; init; }
    public Timeframe OriginTimeframe { get; init; }
    public DateTime FormedAt { get; init; }
    public decimal SizeInPips { get; init; }
}
