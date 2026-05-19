using Signal.Domain.Aggregates;
using Signal.Domain.Enums;
using Signal.Domain.ValueObjects;
using System.Text.Json;

namespace Signal.Application.DTOs;

public sealed record SignalDto
{
    public Guid Id { get; init; }
    public string Symbol { get; init; } = default!;
    public string Direction { get; init; } = default!;
    public string Strength { get; init; } = default!;
    public decimal EntryPrice { get; init; }
    public decimal StopLoss { get; init; }
    public decimal TakeProfit { get; init; }
    public decimal RiskRewardRatio { get; init; }
    public decimal WinProbability { get; init; }
    public decimal ExpectedValue { get; init; }
    public int ConfidenceScore { get; init; }
    public string Regime { get; init; } = default!;
    public string Session { get; init; } = default!;
    public string MacroSentiment { get; init; } = default!;
    public string NewsImpact { get; init; } = default!;
    public bool IsInstitutionalGrade { get; init; }
    public ReasoningDto Reasoning { get; init; } = default!;
    public CorrelationDto Correlations { get; init; } = default!;
    public VolatilityDto Volatility { get; init; } = default!;
    public WinRateDto? WinRate { get; init; }
    public DateTime GeneratedAt { get; init; }
    public DateTime ExpiresAt { get; init; }

    public static SignalDto FromDomain(TradingSignal s) => new()
    {
        Id = s.Id,
        Symbol = s.Symbol,
        Direction = s.Direction.ToString().ToUpperInvariant(),
        Strength = s.Strength.ToString(),
        EntryPrice = s.Risk.EntryPrice,
        StopLoss = s.Risk.StopLoss,
        TakeProfit = s.Risk.TakeProfit,
        RiskRewardRatio = s.Risk.RiskRewardRatio,
        WinProbability = s.Risk.WinProbability,
        ExpectedValue = s.Risk.ExpectedValue,
        ConfidenceScore = s.ConfidenceScore,
        Regime = s.Regime.ToString(),
        Session = s.Session.ToString(),
        MacroSentiment = s.MacroSentiment.ToString(),
        NewsImpact = s.NewsImpact.ToString(),
        IsInstitutionalGrade = s.IsInstitutionalGrade,
        Reasoning = ReasoningDto.FromDomain(s.Reasoning),
        Correlations = CorrelationDto.FromDomain(s.Correlations),
        Volatility = VolatilityDto.FromDomain(s.Volatility),
        WinRate = s.WinRateJson is not null
            ? JsonSerializer.Deserialize<WinRateDto>(s.WinRateJson,
                new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower })
            : null,
        GeneratedAt = s.GeneratedAt,
        ExpiresAt = s.ExpiresAt
    };
}

public sealed record ReasoningDto
{
    public string HtfBias { get; init; } = default!;
    public string LiquidityNarrative { get; init; } = default!;
    public string MacroContext { get; init; } = default!;
    public string NewsContext { get; init; } = default!;
    public string EntryTrigger { get; init; } = default!;
    public string RiskJustification { get; init; } = default!;
    public List<string> BullishFactors { get; init; } = [];
    public List<string> BearishFactors { get; init; } = [];
    public List<string> RiskWarnings { get; init; } = [];
    public string VolatilityWarning { get; init; } = default!;

    public static ReasoningDto FromDomain(SignalReasoning r) => new()
    {
        HtfBias = r.HtfBias,
        LiquidityNarrative = r.LiquidityNarrative,
        MacroContext = r.MacroContext,
        NewsContext = r.NewsContext,
        EntryTrigger = r.EntryTrigger,
        RiskJustification = r.RiskJustification,
        BullishFactors = r.BullishFactors,
        BearishFactors = r.BearishFactors,
        RiskWarnings = r.RiskWarnings,
        VolatilityWarning = r.VolatilityWarning
    };
}

public sealed record CorrelationDto
{
    public decimal DxyValue { get; init; }
    public decimal DxyChange1H { get; init; }
    public decimal Us10YYield { get; init; }
    public decimal Us10YChange1H { get; init; }
    public decimal Vix { get; init; }
    public decimal SpxChange1D { get; init; }
    public bool IsRiskOff { get; init; }
    public bool IsRiskOn { get; init; }

    public static CorrelationDto FromDomain(Domain.ValueObjects.CorrelationSnapshot c) => new()
    {
        DxyValue = c.DxyValue,
        DxyChange1H = c.DxyChange1H,
        Us10YYield = c.Us10YYield,
        Us10YChange1H = c.Us10YChange1H,
        Vix = c.Vix,
        SpxChange1D = c.SpxChange1D,
        IsRiskOff = c.IsRiskOff,
        IsRiskOn = c.IsRiskOn
    };
}

public sealed record VolatilityDto
{
    public decimal Atr1H { get; init; }
    public decimal Atr4H { get; init; }
    public decimal AdrPercent { get; init; }
    public bool IsExpanding { get; init; }
    public bool IsContracting { get; init; }
    public string Regime { get; init; } = default!;

    public static VolatilityDto FromDomain(Domain.ValueObjects.VolatilitySnapshot v) => new()
    {
        Atr1H = v.Atr1H,
        Atr4H = v.Atr4H,
        AdrPercent = v.AdrPercent,
        IsExpanding = v.IsExpanding,
        IsContracting = v.IsContracting,
        Regime = v.Regime
    };
}

public sealed record CandleDto(
    long Time,
    decimal Open,
    decimal High,
    decimal Low,
    decimal Close,
    decimal Volume);

public sealed record MarketOverviewDto(
    string Symbol,
    decimal Price,
    decimal Change24H,
    decimal ChangePercent24H,
    string Regime,
    string Session,
    int ActiveSignals,
    DateTime UpdatedAt);

public sealed record WinRateFactorDto(
    string Key,
    string Label,
    string Description,
    float ImpactPct,
    bool Positive);

public sealed record WinRateDto(
    string Regime,
    float RegimePriorPct,
    float FinalProbability,
    int Percentage,
    string Tier,
    float KellyFraction,
    float QuarterKellyPct,
    List<WinRateFactorDto> Factors);
