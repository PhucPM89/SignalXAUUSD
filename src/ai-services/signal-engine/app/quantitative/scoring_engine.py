"""
XAUUSD Quantitative Scoring Engine

Multi-layer scoring architecture:
  Layer 1: Rule-based institutional filters (hard gates — must pass to proceed)
  Layer 2: SMC scoring (Structure, OB, FVG, Liquidity)
  Layer 3: Macro correlation scoring (DXY, yields, VIX, risk sentiment)
  Layer 4: Volatility regime scoring (ATR, ADR, expansion)
  Layer 5: Session weighting (London/NY overlap = highest multiplier)
  Layer 6: News/event gating (circuit breaker pre-events)
  Layer 7: Ensemble confidence score (weighted sum → 0–100)

Confidence ≥ 72 required for signal emission (institutional threshold).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import math

from app.quantitative.gold_features import GoldFeatures, MIN_TARGET, MAX_TARGET, PIP


@dataclass
class ScoringResult:
    direction: str              # "Buy" | "Sell" | "NoTrade"
    confidence: int             # 0–100
    entry_offset_pips: float    # pips from current price to suggested entry
    sl_pips: float
    tp_pips: float
    layer_scores: dict[str, float]
    no_trade_reason: Optional[str] = None
    bullish_factors: list[str] = None
    bearish_factors: list[str] = None
    risk_warnings: list[str] = None

    def __post_init__(self):
        self.bullish_factors = self.bullish_factors or []
        self.bearish_factors = self.bearish_factors or []
        self.risk_warnings = self.risk_warnings or []


# Minimum confidence to emit a signal
CONFIDENCE_THRESHOLD = 72

# Layer weights — must sum to 1.0
LAYER_WEIGHTS = {
    "structure":    0.28,
    "liquidity":    0.20,
    "macro":        0.22,
    "volatility":   0.12,
    "session":      0.10,
    "news":         0.08,
}

assert abs(sum(LAYER_WEIGHTS.values()) - 1.0) < 1e-9


def score_signal(features: GoldFeatures, current_price: float) -> ScoringResult:
    """
    Main scoring entry point. Returns a ScoringResult with direction and confidence.
    Returns NoTrade if hard gates fail or confidence < threshold.
    """
    bullish: list[str] = []
    bearish: list[str] = []
    warnings: list[str] = []

    # ── Hard Gates (instant NoTrade) ───────────────────────────────────────────
    gate_result = _apply_hard_gates(features, warnings)
    if gate_result:
        return _no_trade(gate_result, warnings=warnings)

    # ── Layer Scoring ──────────────────────────────────────────────────────────
    structure_score = _score_structure(features, bullish, bearish)
    liquidity_score = _score_liquidity(features, bullish, bearish)
    macro_score     = _score_macro(features, bullish, bearish)
    volatility_score = _score_volatility(features, warnings)
    session_score   = _score_session(features, warnings)
    news_score      = _score_news(features, warnings)

    layer_scores = {
        "structure":   structure_score,
        "liquidity":   liquidity_score,
        "macro":       macro_score,
        "volatility":  volatility_score,
        "session":     session_score,
        "news":        news_score,
    }

    # ── Weighted Confidence ────────────────────────────────────────────────────
    raw_score = sum(layer_scores[k] * LAYER_WEIGHTS[k] for k in LAYER_WEIGHTS)
    confidence = int(round(_sigmoid_scale(raw_score) * 100))

    # ── Direction Decision ─────────────────────────────────────────────────────
    bull_score = _directional_score(features, buy=True)
    bear_score = _directional_score(features, buy=False)
    direction_gap = abs(bull_score - bear_score)

    if confidence < CONFIDENCE_THRESHOLD:
        return _no_trade(f"Confidence {confidence} below {CONFIDENCE_THRESHOLD} threshold", warnings=warnings)

    # Require decisive directional edge (≥0.15 gap) to avoid 50/50 signals
    if direction_gap < 0.15:
        return _no_trade("Insufficient directional conviction — market ambiguous", warnings=warnings)

    direction = "Buy" if bull_score > bear_score else "Sell"

    # ── Risk Parameters (XAUUSD $15–$30 targets) ──────────────────────────────
    sl_pips, tp_pips, entry_offset = _calculate_risk_params(
        features, direction, confidence, current_price)

    if sl_pips <= 0 or tp_pips <= 0:
        return _no_trade("Could not compute valid SL/TP", warnings=warnings)

    rr = tp_pips / sl_pips
    if rr < 1.8:
        return _no_trade(f"RR {rr:.1f} below minimum 1.8", warnings=warnings)

    return ScoringResult(
        direction=direction,
        confidence=confidence,
        entry_offset_pips=entry_offset,
        sl_pips=sl_pips,
        tp_pips=tp_pips,
        layer_scores=layer_scores,
        bullish_factors=bullish,
        bearish_factors=bearish,
        risk_warnings=warnings,
    )


def _apply_hard_gates(f: GoldFeatures, warnings: list[str]) -> Optional[str]:
    """Returns reason string if signal should be suppressed, None if clear to proceed."""
    if f.session_dead > 0.5:
        return "Dead session — no Gold liquidity"
    if f.high_impact_event_imminent > 0.5:
        warnings.append("High-impact event imminent — circuit breaker active")
        return "High-impact economic event within 30 minutes"
    if f.volatility_regime < 0.05:
        return "Volatility too low — Gold in dead compression"
    if f.volatility_regime > 0.95:
        warnings.append("Extreme volatility — widening SL to compensate")
        # Don't block, but warn (extreme vol can still give clean setups post-spike)
    if f.choch_present > 0.5 and f.htf_structure_score < -30:
        return "Change of character on HTF — structure invalidated"
    return None


def _score_structure(f: GoldFeatures, bullish: list[str], bearish: list[str]) -> float:
    score = 0.0
    if f.htf_bullish > 0:
        score += 0.4
        bullish.append("H1 bullish market structure intact")
    else:
        score -= 0.4
        bearish.append("H1 bearish market structure")

    if f.bos_present > 0.5:
        score += 0.3 if f.htf_bullish > 0 else -0.3
        (bullish if f.htf_bullish > 0 else bearish).append("Break of Structure confirmed")

    if f.unmitigated_ob_present > 0.5:
        score += 0.2
        side = "bullish" if f.htf_bullish > 0 else "bearish"
        bullish.append(f"Unmitigated {side} order block present")

    if f.ob_proximity_score > 0.7:
        score += 0.1
        bullish.append(f"Price within order block zone (proximity {f.ob_proximity_score:.0%})")

    if f.fvg_present > 0.5 and f.fvg_proximity_score > 0.6:
        score += 0.15
        bullish.append("Fair Value Gap open — potential fill target")

    # Normalise to [-1, 1]
    return max(-1.0, min(1.0, score))


def _score_liquidity(f: GoldFeatures, bullish: list[str], bearish: list[str]) -> float:
    score = 0.0
    if f.liquidity_sweep_recent > 0.5:
        if f.htf_bullish > 0:
            score += 0.6
            bullish.append("Sell-side liquidity sweep completed — bullish continuation likely")
        else:
            score += 0.6
            bearish.append("Buy-side liquidity sweep completed — bearish continuation likely")

    # Price far from SSL → more room to move up for BUY
    if f.ssl_distance_pips > 2000 and f.htf_bullish > 0:
        score += 0.2
        bullish.append("Large SSL buffer below — SL breathing room available")

    imbalance = f.liquidity_imbalance
    if imbalance > 0.3:
        score += 0.2
        bullish.append("Liquidity imbalance favours buy side")
    elif imbalance < -0.3:
        score += 0.2
        bearish.append("Liquidity imbalance favours sell side")

    return max(-1.0, min(1.0, score))


def _score_macro(f: GoldFeatures, bullish: list[str], bearish: list[str]) -> float:
    score = 0.0

    # DXY: inverse relationship with Gold
    if f.dxy_momentum > 0.3:
        score += 0.35
        bullish.append(f"DXY weakening — bullish Gold impulse (Δ={f.dxy_momentum:.2f})")
    elif f.dxy_momentum < -0.3:
        score -= 0.35
        bearish.append(f"DXY strengthening — headwind for Gold (Δ={f.dxy_momentum:.2f})")

    # Real yields: inverse relationship
    if f.yield_momentum > 0.3:
        score += 0.3
        bullish.append("US10Y yields declining — real yield drop supports Gold")
    elif f.yield_momentum < -0.3:
        score -= 0.3
        bearish.append("US10Y yields rising — pressure on Gold")

    # Risk sentiment
    if f.risk_off_score > 0.5:
        score += 0.25
        bullish.append(f"Risk-off environment (VIX={f.vix_level:.1f}) — safe-haven demand for Gold")

    if f.gold_correlation_score > 0.6:
        score += 0.1
        bullish.append("Multi-factor macro alignment bullish for Gold")
    elif f.gold_correlation_score < 0.2:
        score -= 0.1
        bearish.append("Macro factors not aligned for Gold rally")

    return max(-1.0, min(1.0, score))


def _score_volatility(f: GoldFeatures, warnings: list[str]) -> float:
    score = 0.5  # neutral baseline

    # Ideal volatility window for Gold swing entries: moderate expansion
    if 0.3 < f.volatility_regime < 0.75 and f.atr_ratio > 1.0:
        score = 0.8
    elif f.volatility_regime < 0.1:
        score = 0.1
        warnings.append("Extremely low volatility — avoid entries in dead compression")
    elif f.volatility_regime > 0.85:
        score = 0.4
        warnings.append(f"High volatility regime — widen SL by 20%")

    if f.atr_ratio > 1.5:
        score = min(score + 0.1, 1.0)
        # Expanding ATR → momentum environment → favour trend entries
    return score


def _score_session(f: GoldFeatures, warnings: list[str]) -> float:
    # London/NY overlap: peak Gold liquidity, institutional participation highest
    if f.session_overlap > 0.5:
        return 0.95
    if f.session_ny > 0.5:
        return 0.80
    if f.session_london > 0.5:
        return 0.75
    if f.session_dead > 0.5:
        warnings.append("Off-session — Gold liquidity minimal")
        return 0.05
    return 0.40  # Asia session or transition


def _score_news(f: GoldFeatures, warnings: list[str]) -> float:
    base = 0.5
    # Strong aligned sentiment amplifies confidence
    if abs(f.news_sentiment_score) > 0.5 and f.news_impact_score > 0.6:
        base += f.news_sentiment_score * 0.4
    # High-impact upcoming event → penalise (wait for release)
    if f.high_impact_event_imminent > 0.5:
        base -= 0.4
        warnings.append("High-impact event imminent — signal confidence suppressed")
    return max(0.0, min(1.0, base))


def _directional_score(f: GoldFeatures, buy: bool) -> float:
    """Separate buy vs sell strength score for direction disambiguation."""
    sign = 1 if buy else -1
    factors = [
        f.htf_bullish * sign,
        f.dxy_momentum * sign,
        f.yield_momentum * sign,
        f.risk_off_score if buy else 0.0,
        f.gold_correlation_score if buy else (1 - f.gold_correlation_score),
        f.news_sentiment_score * sign,
        (1 if f.liquidity_sweep_recent and f.htf_bullish * sign > 0 else 0),
    ]
    return sum(max(0, v) for v in factors) / len(factors)


def _calculate_risk_params(
    f: GoldFeatures,
    direction: str,
    confidence: int,
    current_price: float,
) -> tuple[float, float, float]:
    """
    Returns (sl_pips, tp_pips, entry_offset_pips).

    SL sizing: ATR-based. Gold H1 ATR ~$8–15.
    1.0–1.5× ATR for SL → $8–$22 SL depending on regime.
    TP: 2.0–3.0× SL → targets $15–$30 moves.
    Entry: at nearest OB/FVG if available, else market.
    """
    atr_pips = f.atr_ratio * 1000  # ATR in pips (atr_ratio=1.0 → $10 = 1000 pips)

    # ATR multiplier scales with volatility regime — tighter in low-vol, wider in high-vol
    sl_atr_mult = 0.8 + f.volatility_regime * 0.7   # 0.8× to 1.5× ATR
    sl_pips = max(500, min(1500, atr_pips * sl_atr_mult))  # $5–$15

    # Confidence-adjusted TP: higher confidence → reach for the $25–$30 target
    tp_atr_mult = 2.0 + (confidence - 72) / 28 * 1.0   # 2.0× to 3.0× for 72–100% confidence
    tp_pips = sl_pips * tp_atr_mult

    # Clamp to our $15–$30 target window
    tp_pips = max(MIN_TARGET / PIP, min(MAX_TARGET / PIP, tp_pips))

    # Entry offset: pull back to OB/FVG if proximate, else 0 (market entry)
    if f.ob_proximity_score > 0.7:
        entry_offset = 0    # at OB — enter at current price
    elif f.ob_proximity_score > 0.4:
        entry_offset = 30   # slight pullback to OB midpoint
    else:
        entry_offset = 0

    return sl_pips, tp_pips, entry_offset


def _sigmoid_scale(raw: float) -> float:
    """Map [-1, 1] raw score to (0, 1) using a steepened sigmoid."""
    return 1 / (1 + math.exp(-raw * 4))


def _no_trade(reason: str, warnings: list[str] | None = None) -> ScoringResult:
    return ScoringResult(
        direction="NoTrade",
        confidence=0,
        entry_offset_pips=0,
        sl_pips=0,
        tp_pips=0,
        layer_scores={},
        no_trade_reason=reason,
        risk_warnings=warnings or [],
    )
