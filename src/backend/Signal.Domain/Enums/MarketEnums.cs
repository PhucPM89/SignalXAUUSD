namespace Signal.Domain.Enums;

public enum SignalDirection { Buy, Sell, NoTrade }

public enum SignalStrength { Weak, Moderate, Strong, Institutional }

public enum MarketRegime
{
    Trending,
    RangeBound,
    Compression,
    Expansion,
    HighVolatility,
    LowLiquidity,
    NewsImpact,
    Manipulation
}

public enum Timeframe
{
    M1 = 1,
    M5 = 5,
    M15 = 15,
    M30 = 30,
    H1 = 60,
    H4 = 240,
    D1 = 1440,
    W1 = 10080
}

public enum InstrumentType { Forex, Metal, Index, Crypto, Futures, Commodity }

public enum SessionType { Sydney, Tokyo, London, NewYork, Overlap, OffSession }

public enum LiquidityEventType
{
    StopHunt,
    LiquiditySweep,
    OrderBlockMitigation,
    FairValueGapFill,
    InstitutionalEntry,
    BreakOfStructure,
    ChangeOfCharacter
}

public enum MacroSentiment { Bullish, Bearish, Neutral, Mixed, Risk_On, Risk_Off }

public enum NewsImpact { None, Low, Medium, High, Critical }

public enum PositionStatus { Pending, Active, PartialClose, Closed, Cancelled }

public enum RiskLevel { Conservative, Moderate, Aggressive }
