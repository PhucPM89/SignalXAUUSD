from __future__ import annotations
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from enum import Enum


class SignalDirection(str, Enum):
    BUY = "Buy"
    SELL = "Sell"
    NO_TRADE = "NoTrade"


class OrderBlock(BaseModel):
    high: float
    low: float
    bullish: bool
    unmitigated: bool
    strength: int = Field(ge=0, le=100)


class FairValueGap(BaseModel):
    upper: float
    lower: float
    bullish: bool
    filled: bool
    size_pips: float


class StructurePayload(BaseModel):
    bullish: bool
    bos: bool = False          # Break of Structure
    choch: bool = False        # Change of Character
    swing_high: float = 0
    swing_low: float = 0
    current_price: float = 0
    structure_score: int = 0
    order_blocks: list[OrderBlock] = []
    fvgs: list[FairValueGap] = []


class CorrelationPayload(BaseModel):
    dxy: float = 0
    dxy_change_1h: float = 0
    us10y: float = 0
    us10y_change_1h: float = 0
    vix: float = 0
    spx_change_1d: float = 0
    risk_off: bool = False


class VolatilityPayload(BaseModel):
    atr_1h: float = 0
    atr_4h: float = 0
    adr_pct: float = 0
    expanding: bool = False


class NewsItem(BaseModel):
    headline: str
    sentiment: float = Field(default=0, ge=-1, le=1)
    impact: str = "None"
    impact_score: float = Field(default=0, ge=0, le=1)


class UpcomingEvent(BaseModel):
    name: str
    currency: str
    impact: str
    minutes_until: float


class InferenceRequest(BaseModel):
    symbol: str
    session: str
    regime: str
    htf_structure: StructurePayload
    ltf_structure: StructurePayload
    correlations: CorrelationPayload
    volatility: VolatilityPayload
    recent_news: list[NewsItem] = []
    upcoming_events: list[UpcomingEvent] = []


class ReasoningResponse(BaseModel):
    htf_bias: str = ""
    liquidity_narrative: str = ""
    macro_context: str = ""
    news_context: str = ""
    entry_trigger: str = ""
    risk_justification: str = ""
    bullish_factors: list[str] = []
    bearish_factors: list[str] = []
    risk_warnings: list[str] = []
    volatility_warning: str = ""


class WinRateFactorResponse(BaseModel):
    key: str
    label: str
    description: str
    impact_pct: float
    positive: bool


class WinRateResponse(BaseModel):
    regime: str
    regime_prior_pct: float
    final_probability: float
    percentage: int
    tier: str
    kelly_fraction: float
    quarter_kelly_pct: float
    factors: list[WinRateFactorResponse] = []


class InferenceResponse(BaseModel):
    direction: str
    entry_price: float
    stop_loss: float
    take_profit: float
    confidence: int = Field(ge=0, le=100)
    should_trade: bool
    no_trade_reason: Optional[str] = None
    reasoning: ReasoningResponse = ReasoningResponse()
    win_rate: Optional[WinRateResponse] = None
