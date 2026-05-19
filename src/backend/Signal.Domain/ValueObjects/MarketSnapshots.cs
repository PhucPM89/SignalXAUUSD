using Signal.Domain.Enums;

namespace Signal.Domain.ValueObjects;

public sealed record CorrelationSnapshot
{
    public decimal DxyValue { get; init; }
    public decimal DxyChange1H { get; init; }
    public decimal Us10YYield { get; init; }
    public decimal Us10YChange1H { get; init; }
    public decimal Vix { get; init; }
    public decimal SpxChange1D { get; init; }
    public decimal OilPrice { get; init; }
    public decimal BtcChange1H { get; init; }
    public MacroSentiment DxyImpactOnGold => DxyChange1H > 0.1m ? MacroSentiment.Bearish : MacroSentiment.Bullish;
    public MacroSentiment YieldImpactOnGold => Us10YChange1H > 0.05m ? MacroSentiment.Bearish : MacroSentiment.Bullish;
    public bool IsRiskOff => Vix > 25;
    public bool IsRiskOn => Vix < 15 && SpxChange1D > 0;
}

public sealed record VolatilitySnapshot
{
    public decimal Atr1H { get; init; }
    public decimal Atr4H { get; init; }
    public decimal AdrPercent { get; init; }
    public decimal CurrentRangePercent { get; init; }
    public bool IsExpanding { get; init; }
    public bool IsContracting { get; init; }
    public string Regime { get; init; } = string.Empty;
    public bool IsLowVolatility => AdrPercent < 0.3m;
    public bool IsHighVolatility => AdrPercent > 1.5m;
}

public sealed record SignalReasoning
{
    public string HtfBias { get; init; } = string.Empty;
    public string LiquidityNarrative { get; init; } = string.Empty;
    public string MacroContext { get; init; } = string.Empty;
    public string NewsContext { get; init; } = string.Empty;
    public string EntryTrigger { get; init; } = string.Empty;
    public string RiskJustification { get; init; } = string.Empty;
    public List<string> BullishFactors { get; init; } = [];
    public List<string> BearishFactors { get; init; } = [];
    public List<string> RiskWarnings { get; init; } = [];
    public string VolatilityWarning { get; init; } = string.Empty;
}
