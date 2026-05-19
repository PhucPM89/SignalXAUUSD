using Signal.Domain.Enums;

namespace Signal.Domain.Entities;

/// <summary>
/// Platform is scoped to a single instrument: XAUUSD (Gold/USD).
/// All pip math, ATR targets, and session logic are Gold-specific.
///
/// Gold characteristics:
///   - Pip size: $0.01 (1 pip = $0.01 price move)
///   - 1 standard lot = 100 oz → pip value = $1 per pip per lot
///   - Target move: $15–$30 = 1500–3000 pips
///   - Typical H1 ATR: $8–$18 depending on regime
///   - Primary drivers: DXY, US10Y real yields, geopolitics, risk sentiment
///   - Key sessions: London open (08:00 UTC), NY open (13:00 UTC), London/NY overlap (13:00–17:00 UTC)
/// </summary>
public sealed class GoldInstrument
{
    // These are compile-time constants — no runtime mutation needed
    public const string Symbol = "XAUUSD";
    public const string DisplayName = "Gold / US Dollar";
    public const decimal PipSize = 0.01m;
    public const decimal PipValuePerLot = 1.0m;   // $1 per pip per standard lot (100 oz)
    public const decimal TickSize = 0.01m;
    public const int Decimals = 2;
    public const decimal TypicalSpread = 0.25m;   // ~25 pips at most brokers
    public const decimal ContractSize = 100m;     // 100 troy oz per standard lot

    // XAUUSD swing trade targeting: 1500–3000 pips = $15–$30
    public const decimal MinTargetPips = 1500m;
    public const decimal MaxTargetPips = 3000m;
    public const decimal MinStopPips = 500m;      // minimum $5 SL
    public const decimal MaxStopPips = 1500m;     // maximum $15 SL
    public const decimal MinRR = 1.8m;

    // ATR thresholds for Gold
    public const decimal LowAtrThreshold = 5.0m;     // below $5/H1 → dead session
    public const decimal HighAtrThreshold = 25.0m;   // above $25/H1 → extreme volatility

    // Session windows (UTC hours) — Gold liquidity is London/NY centric
    public static bool IsLondonSession(int utcHour) => utcHour is >= 7 and <= 12;
    public static bool IsNewYorkSession(int utcHour) => utcHour is >= 13 and <= 20;
    public static bool IsLondonNyOverlap(int utcHour) => utcHour is >= 13 and <= 16;  // peak liquidity
    public static bool IsDeadSession(int utcHour) => utcHour is >= 21 or <= 1;         // Asia early / off-session

    public static decimal PipsToPrice(decimal pips) => pips * PipSize;
    public static decimal PriceToPips(decimal priceMove) => priceMove / PipSize;

    /// <summary>Calculate lot size given account balance, risk %, and SL in pips.</summary>
    public static decimal CalculateLotSize(decimal balance, decimal riskPct, decimal slPips)
    {
        if (slPips <= 0) return 0;
        var riskDollars = balance * (riskPct / 100m);
        // riskDollars = slPips * pipValuePerLot * lots
        var lots = riskDollars / (slPips * PipValuePerLot);
        return Math.Round(Math.Clamp(lots, 0.01m, 50m), 2);
    }
}
