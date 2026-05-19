"""
XAUUSD Market Regime Detector

Classifies the current market environment into one of 7 regimes.
The regime directly controls:
  - Signal emission (some regimes → hard NoTrade)
  - SL/TP multipliers (volatile regimes → wider)
  - Confidence weighting in the scoring engine
  - Position sizing in the risk engine

Regime detection uses a 3-layer decision process:
  1. Volatility clustering (ATR-based)
  2. Price structure topology (trend vs range)
  3. Correlation anomaly detection (DXY/yield divergence signals manipulation)
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
import numpy as np


class Regime(str, Enum):
    TRENDING       = "Trending"
    RANGE_BOUND    = "RangeBound"
    COMPRESSION    = "Compression"
    EXPANSION      = "Expansion"
    HIGH_VOLATILITY = "HighVolatility"
    LOW_LIQUIDITY  = "LowLiquidity"
    MANIPULATION   = "Manipulation"
    NEWS_DRIVEN    = "NewsImpact"


@dataclass
class RegimeResult:
    regime: Regime
    confidence: float          # 0-1
    atr_ratio: float           # current ATR / baseline
    volatility_percentile: float
    is_tradeable: bool
    description: str
    sl_multiplier: float       # multiply base SL by this
    tp_multiplier: float


class RegimeRequest(BaseModel):
    atr_1h: float
    atr_4h: float
    adr_pct: float
    htf_bullish: bool
    bos_present: bool
    choch_present: bool
    dxy_change_1h: float
    yield_change_1h: float
    vix: float
    price_range_pct: float          # % of ADR consumed today
    candle_body_ratio_avg: float    # avg body/range last 10 candles [0-1]
    high_impact_event_active: bool
    session: str


class RegimeResponse(BaseModel):
    regime: str
    confidence: float
    is_tradeable: bool
    description: str
    sl_multiplier: float
    tp_multiplier: float
    signal_frequency: str   # "Normal" | "Reduced" | "Suppressed"


# Gold ATR baseline (H1): ~$8–10 in normal conditions
GOLD_ATR_BASELINE_H1 = 10.0
GOLD_ATR_HIGH = 20.0
GOLD_ATR_LOW = 4.0


def detect_regime(req: RegimeRequest) -> RegimeResponse:
    atr_ratio = req.atr_1h / GOLD_ATR_BASELINE_H1

    # ── Hard overrides ──────────────────────────────────────────────────────
    if req.high_impact_event_active:
        return RegimeResponse(
            regime=Regime.NEWS_DRIVEN,
            confidence=0.95,
            is_tradeable=False,
            description="High-impact economic event active — stand aside until dust settles.",
            sl_multiplier=2.0, tp_multiplier=1.0,
            signal_frequency="Suppressed",
        )

    if req.session in ("Sydney", "OffSession") or atr_ratio < 0.4:
        return RegimeResponse(
            regime=Regime.LOW_LIQUIDITY,
            confidence=0.90,
            is_tradeable=False,
            description="Gold liquidity insufficient — dead session or ATR collapsed below $4.",
            sl_multiplier=1.0, tp_multiplier=1.0,
            signal_frequency="Suppressed",
        )

    # ── Extreme volatility ──────────────────────────────────────────────────
    if atr_ratio > 2.5 or req.vix > 40:
        return RegimeResponse(
            regime=Regime.HIGH_VOLATILITY,
            confidence=0.85,
            is_tradeable=True,    # tradeable but with wider SL
            description=f"Extreme volatility (ATR {req.atr_1h:.1f}, VIX {req.vix:.1f}). "
                        "Widen SL 50%, reduce position size.",
            sl_multiplier=1.5, tp_multiplier=1.2,
            signal_frequency="Reduced",
        )

    # ── Manipulation detection ──────────────────────────────────────────────
    # Divergence: Gold rallying while DXY rising → institutional accumulation or news divergence
    gold_dxy_divergence = req.dxy_change_1h > 0.15 and req.price_range_pct > 0.7
    if gold_dxy_divergence or req.choch_present:
        return RegimeResponse(
            regime=Regime.MANIPULATION,
            confidence=0.75,
            is_tradeable=False,
            description="Potential manipulation: Gold/DXY divergence or CHoCH detected. "
                        "Wait for structure resolution.",
            sl_multiplier=1.3, tp_multiplier=0.8,
            signal_frequency="Suppressed",
        )

    # ── Compression (pre-expansion) ─────────────────────────────────────────
    compression = (
        req.candle_body_ratio_avg < 0.35 and     # small bodies = indecision
        atr_ratio < 0.7 and
        req.price_range_pct < 0.4                # consumed < 40% of ADR
    )
    if compression:
        return RegimeResponse(
            regime=Regime.COMPRESSION,
            confidence=0.80,
            is_tradeable=False,
            description="Gold in compression phase — wait for breakout with volume confirmation.",
            sl_multiplier=0.9, tp_multiplier=0.9,
            signal_frequency="Suppressed",
        )

    # ── Trending (ideal) ────────────────────────────────────────────────────
    trending = (
        req.bos_present and
        not req.choch_present and
        atr_ratio > 0.9 and
        req.candle_body_ratio_avg > 0.55
    )
    if trending:
        description = (
            f"{'Bullish' if req.htf_bullish else 'Bearish'} trend in force. "
            "BOS confirmed, momentum intact. Prime institutional environment."
        )
        return RegimeResponse(
            regime=Regime.TRENDING,
            confidence=0.88,
            is_tradeable=True,
            description=description,
            sl_multiplier=1.0, tp_multiplier=1.15,    # reach further in trends
            signal_frequency="Normal",
        )

    # ── Expansion (breakout) ────────────────────────────────────────────────
    if atr_ratio > 1.5 and req.price_range_pct > 0.6:
        return RegimeResponse(
            regime=Regime.EXPANSION,
            confidence=0.82,
            is_tradeable=True,
            description="Volatility expanding from compression. Momentum entry favoured.",
            sl_multiplier=1.2, tp_multiplier=1.1,
            signal_frequency="Normal",
        )

    # ── Range-bound (default) ───────────────────────────────────────────────
    return RegimeResponse(
        regime=Regime.RANGE_BOUND,
        confidence=0.70,
        is_tradeable=True,
        description="Gold range-bound. Mean-reversion bias near boundaries, "
                    "avoid mid-range entries.",
        sl_multiplier=0.95, tp_multiplier=0.9,
        signal_frequency="Reduced",
    )


# ── FastAPI App ───────────────────────────────────────────────────────────────
app = FastAPI(title="XAUUSD Regime Detector", version="1.0.0")
app.add_middleware(GZipMiddleware, minimum_size=300)


@app.post("/detect", response_model=RegimeResponse)
def detect(req: RegimeRequest) -> RegimeResponse:
    return detect_regime(req)


@app.get("/health")
def health():
    return {"status": "ok", "service": "regime-detector"}
