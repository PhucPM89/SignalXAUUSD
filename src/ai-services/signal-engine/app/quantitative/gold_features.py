"""
XAUUSD Feature Engineering Pipeline

Extracts institutional-grade features from raw market data for the signal model.
All features are Gold-specific — correlations, seasonality, and volatility
characteristics tuned to XAU/USD behavior.

Design principle: features must be explainable (no black-box inputs),
fast to compute (<10ms per symbol per cycle), and numerically stable
under all market conditions including extreme moves.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Optional


PIP = 0.01           # XAUUSD 1 pip = $0.01
MIN_TARGET = 15.0    # $15 minimum move target
MAX_TARGET = 30.0    # $30 maximum move target


@dataclass
class GoldFeatures:
    """
    Feature vector fed into both the quantitative scoring model
    and the confidence ensemble. All values are normalised to [-1, 1]
    or [0, 1] unless noted.
    """
    # --- Structure features ---
    htf_structure_score: float = 0.0      # [-100, 100] → normalised
    ltf_structure_score: float = 0.0
    htf_bullish: float = 0.0              # 1 / -1 / 0
    bos_present: float = 0.0
    choch_present: float = 0.0
    unmitigated_ob_present: float = 0.0
    ob_proximity_score: float = 0.0       # how close price is to an OB [0-1]
    fvg_present: float = 0.0
    fvg_proximity_score: float = 0.0

    # --- Liquidity features ---
    liquidity_sweep_recent: float = 0.0   # 1 if sweep in last 3 candles
    bsl_distance_pips: float = 0.0        # pips to nearest buy-side liquidity
    ssl_distance_pips: float = 0.0        # pips to nearest sell-side liquidity
    liquidity_imbalance: float = 0.0      # BSL vs SSL asymmetry

    # --- Correlation features (Gold-specific) ---
    dxy_momentum: float = 0.0            # negative → bullish Gold
    yield_momentum: float = 0.0          # negative → bullish Gold (real yields)
    vix_level: float = 0.0               # normalised VIX [0-1]
    risk_off_score: float = 0.0          # composite risk-off indicator
    gold_correlation_score: float = 0.0  # weighted macro alignment for Gold

    # --- Volatility features ---
    atr_ratio: float = 0.0               # current ATR / 20-period avg ATR
    adr_pct: float = 0.0                 # average daily range as % of price
    volatility_regime: float = 0.0       # 0=low, 0.5=normal, 1=high
    range_position: float = 0.0          # where in today's range (0=low, 1=high)

    # --- Session features ---
    session_london: float = 0.0
    session_ny: float = 0.0
    session_overlap: float = 0.0         # highest weight — peak Gold liquidity
    session_dead: float = 0.0            # penalise off-hours

    # --- News / sentiment features ---
    news_sentiment_score: float = 0.0    # [-1, 1]
    news_impact_score: float = 0.0       # [0, 1]
    high_impact_event_imminent: float = 0.0  # 1 if event < 30 min away
    event_surprise_score: float = 0.0    # actual vs forecast deviation

    # --- Momentum features ---
    momentum_1h: float = 0.0             # price change last 1H normalised by ATR
    momentum_4h: float = 0.0
    rsi_h1: float = 0.0                  # normalised RSI [0-1]
    macd_signal: float = 0.0             # MACD histogram sign and magnitude

    def to_vector(self) -> np.ndarray:
        return np.array([
            self.htf_structure_score / 100,
            self.ltf_structure_score / 100,
            self.htf_bullish,
            self.bos_present,
            self.choch_present,
            self.unmitigated_ob_present,
            self.ob_proximity_score,
            self.fvg_present,
            self.fvg_proximity_score,
            self.liquidity_sweep_recent,
            min(self.bsl_distance_pips / 5000, 1.0),
            min(self.ssl_distance_pips / 5000, 1.0),
            self.liquidity_imbalance,
            np.clip(self.dxy_momentum, -1, 1),
            np.clip(self.yield_momentum, -1, 1),
            min(self.vix_level / 50, 1.0),
            self.risk_off_score,
            self.gold_correlation_score,
            np.clip(self.atr_ratio, 0, 3) / 3,
            min(self.adr_pct / 2, 1.0),
            self.volatility_regime,
            self.range_position,
            self.session_london,
            self.session_ny,
            self.session_overlap,
            self.session_dead,
            np.clip(self.news_sentiment_score, -1, 1),
            self.news_impact_score,
            self.high_impact_event_imminent,
            np.clip(self.event_surprise_score, -2, 2) / 2,
            np.clip(self.momentum_1h, -3, 3) / 3,
            np.clip(self.momentum_4h, -3, 3) / 3,
            self.rsi_h1,
            np.clip(self.macd_signal, -1, 1),
        ], dtype=np.float32)


def extract_features(payload: dict) -> GoldFeatures:
    """Build GoldFeatures from the ASP.NET inference request payload."""
    htf = payload.get("htf_structure", {})
    ltf = payload.get("ltf_structure", {})
    corr = payload.get("correlations", {})
    vol = payload.get("volatility", {})
    news_list = payload.get("recent_news", [])
    events = payload.get("upcoming_events", [])
    session = payload.get("session", "")
    price = htf.get("current_price", 0.0)

    f = GoldFeatures()

    # ── Structure ──────────────────────────────────────────────────────────────
    f.htf_structure_score = float(htf.get("structure_score", 0))
    f.ltf_structure_score = float(ltf.get("structure_score", 0))
    f.htf_bullish = 1.0 if htf.get("bullish") else -1.0
    f.bos_present = 1.0 if htf.get("bos") else 0.0
    f.choch_present = 1.0 if htf.get("choch") else 0.0

    obs = htf.get("order_blocks", [])
    unmitigated = [ob for ob in obs if ob.get("unmitigated")]
    f.unmitigated_ob_present = 1.0 if unmitigated else 0.0

    if unmitigated and price > 0:
        nearest_ob = min(unmitigated, key=lambda ob: abs((ob["high"] + ob["low"]) / 2 - price))
        ob_mid = (nearest_ob["high"] + nearest_ob["low"]) / 2
        dist_pips = abs(price - ob_mid) / PIP
        # proximity: 1.0 = price is inside OB, 0 = >500 pips away
        f.ob_proximity_score = max(0.0, 1.0 - dist_pips / 500)

    fvgs = htf.get("fvgs", [])
    open_fvgs = [g for g in fvgs if not g.get("filled")]
    f.fvg_present = 1.0 if open_fvgs else 0.0
    if open_fvgs and price > 0:
        nearest_fvg = min(open_fvgs, key=lambda g: abs((g["upper"] + g["lower"]) / 2 - price))
        fvg_mid = (nearest_fvg["upper"] + nearest_fvg["lower"]) / 2
        dist_pips = abs(price - fvg_mid) / PIP
        f.fvg_proximity_score = max(0.0, 1.0 - dist_pips / 300)

    # ── Correlation (Gold-specific signs) ─────────────────────────────────────
    # DXY inverse: rising DXY → bearish Gold → negative feature for BUY
    dxy_chg = float(corr.get("dxy_change_1h", 0))
    f.dxy_momentum = -np.tanh(dxy_chg * 5)   # invert: DXY up → negative for Gold BUY

    # Real yields inverse: rising yields → bearish Gold
    yield_chg = float(corr.get("us10y_change_1h", 0))
    f.yield_momentum = -np.tanh(yield_chg * 10)

    vix = float(corr.get("vix", 20))
    f.vix_level = vix

    # Risk-off: high VIX + falling equities → Gold bullish
    risk_off = 1.0 if (vix > 25 or float(corr.get("spx_change_1d", 0)) < -1.0) else 0.0
    f.risk_off_score = risk_off

    # Composite Gold correlation score: sum of aligned factors
    gold_bull_factors = [
        1.0 if dxy_chg < -0.1 else 0.0,
        1.0 if yield_chg < -0.02 else 0.0,
        1.0 if risk_off else 0.0,
    ]
    f.gold_correlation_score = sum(gold_bull_factors) / 3.0

    # ── Volatility ─────────────────────────────────────────────────────────────
    atr_1h = float(vol.get("atr_1h", 8.0))
    atr_4h = float(vol.get("atr_4h", 15.0))
    adr_pct = float(vol.get("adr_pct", 0.5))
    expanding = bool(vol.get("expanding", False))

    # ATR ratio: current ATR vs long-run baseline ($10 for H1 Gold)
    f.atr_ratio = atr_1h / 10.0
    f.adr_pct = adr_pct
    f.volatility_regime = (
        0.0 if atr_1h < 5.0 else
        1.0 if atr_1h > 20.0 else
        (atr_1h - 5.0) / 15.0
    )

    # ── Session ────────────────────────────────────────────────────────────────
    utc_hour = __import__("datetime").datetime.utcnow().hour
    f.session_london = 1.0 if 7 <= utc_hour <= 12 else 0.0
    f.session_ny = 1.0 if 13 <= utc_hour <= 20 else 0.0
    f.session_overlap = 1.0 if 13 <= utc_hour <= 16 else 0.0
    f.session_dead = 1.0 if (utc_hour >= 22 or utc_hour <= 2) else 0.0

    # ── News ───────────────────────────────────────────────────────────────────
    if news_list:
        sentiments = [n.get("sentiment", 0.0) for n in news_list]
        impacts = [n.get("impact_score", 0.0) for n in news_list]
        f.news_sentiment_score = float(np.average(sentiments, weights=[abs(s) + 0.1 for s in sentiments]))
        f.news_impact_score = float(max(impacts)) if impacts else 0.0

    imminent = [e for e in events if e.get("minutes_until", 999) <= 30 and e.get("impact") in ("High", "Critical")]
    f.high_impact_event_imminent = 1.0 if imminent else 0.0

    return f
