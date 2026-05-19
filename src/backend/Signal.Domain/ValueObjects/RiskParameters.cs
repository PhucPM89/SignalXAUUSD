namespace Signal.Domain.ValueObjects;

public sealed record RiskParameters
{
    public decimal EntryPrice { get; }
    public decimal StopLoss { get; }
    public decimal TakeProfit { get; }
    public decimal RiskRewardRatio { get; }
    public decimal StopLossPips { get; }
    public decimal TakeProfitPips { get; }
    public decimal WinProbability { get; init; }  // 0.0 - 1.0
    public decimal ExpectedValue { get; init; }   // Kelly-weighted EV

    private RiskParameters(
        decimal entry, decimal sl, decimal tp,
        decimal pipSize = 0.01m)
    {
        EntryPrice = entry;
        StopLoss = sl;
        TakeProfit = tp;

        StopLossPips = Math.Abs(entry - sl) / pipSize;
        TakeProfitPips = Math.Abs(tp - entry) / pipSize;

        RiskRewardRatio = StopLossPips > 0
            ? Math.Round(TakeProfitPips / StopLossPips, 2)
            : 0;

        WinProbability = 0;
        ExpectedValue = 0;
    }

    public static RiskParameters Create(decimal entry, decimal sl, decimal tp, decimal pipSize = 0.01m)
    {
        if (sl <= 0 || tp <= 0 || entry <= 0)
            throw new ArgumentException("All prices must be positive.");

        return new RiskParameters(entry, sl, tp, pipSize);
    }

    public RiskParameters WithProbability(decimal winProbability)
    {
        if (winProbability is < 0 or > 1)
            throw new ArgumentOutOfRangeException(nameof(winProbability));

        var ev = (winProbability * TakeProfitPips) - ((1 - winProbability) * StopLossPips);
        return this with { WinProbability = winProbability, ExpectedValue = Math.Round(ev, 2) };
    }

    public decimal CalculatePositionSize(decimal accountBalance, decimal riskPercent = 1.0m)
    {
        // Position size = (Account * RiskPercent) / (SL pips * pip value)
        var riskAmount = accountBalance * (riskPercent / 100);
        return StopLossPips > 0 ? riskAmount / StopLossPips : 0;
    }

    public bool MeetsMinimumRR(decimal minRR = 1.5m) => RiskRewardRatio >= minRR;
    public bool IsHighProbability(decimal threshold = 0.70m) => WinProbability >= threshold;
    public bool IsInstitutionalGrade() => MeetsMinimumRR(2.0m) && IsHighProbability(0.72m);
}
