"""
XAUUSD Inference Service

Orchestrates the full signal generation pipeline:
  1. Feature extraction from ASP.NET payload
  2. Rule-based quantitative scoring
  3. Reasoning generation (human-readable explanation)
  4. Entry/SL/TP price computation
  5. Response packaging

Kept synchronous within a single request — no async AI calls here.
All ML models are loaded at startup and kept in memory (see main.py).
"""
from __future__ import annotations

from app.models.signal_models import (
    InferenceRequest, InferenceResponse, ReasoningResponse,
    WinRateResponse, WinRateFactorResponse,
)
from app.quantitative.gold_features import extract_features, PIP
from app.quantitative.scoring_engine import score_signal, ScoringResult
from app.quantitative.win_rate_calculator import calculate_win_rate, WinRateBreakdown


def run_inference(request: InferenceRequest) -> InferenceResponse:
    payload = request.model_dump()
    current_price = float(request.htf_structure.current_price)

    if current_price <= 0:
        return _no_trade("Invalid current price in payload")

    # 1. Extract feature vector
    features = extract_features(payload)

    # 2. Quantitative scoring
    result: ScoringResult = score_signal(features, current_price)

    if result.direction == "NoTrade":
        return _no_trade(result.no_trade_reason or "No trade", result.risk_warnings)

    # 3. Compute actual prices from pip offsets
    direction = result.direction
    entry_price, sl_price, tp_price = _compute_prices(
        current_price, direction,
        result.entry_offset_pips, result.sl_pips, result.tp_pips)

    rr = result.tp_pips / max(result.sl_pips, 1)

    # 4. Bayesian win-rate calculation
    win_rate_breakdown = _compute_win_rate(features, result, request, rr)
    win_rate_resp = _pack_win_rate(win_rate_breakdown)

    # 5. Build reasoning narrative
    reasoning = _build_reasoning(features, result, direction, current_price)

    return InferenceResponse(
        direction=direction,
        entry_price=round(entry_price, 2),
        stop_loss=round(sl_price, 2),
        take_profit=round(tp_price, 2),
        confidence=result.confidence,
        should_trade=True,
        no_trade_reason=None,
        reasoning=reasoning,
        win_rate=win_rate_resp,
    )


def _compute_prices(
    current: float,
    direction: str,
    entry_offset_pips: float,
    sl_pips: float,
    tp_pips: float,
) -> tuple[float, float, float]:
    offset_price = entry_offset_pips * PIP

    if direction == "Buy":
        entry = current - offset_price   # pull back to OB if applicable
        sl = entry - sl_pips * PIP
        tp = entry + tp_pips * PIP
    else:  # Sell
        entry = current + offset_price
        sl = entry + sl_pips * PIP
        tp = entry - tp_pips * PIP

    return entry, sl, tp


def _build_reasoning(
    features,
    result: ScoringResult,
    direction: str,
    price: float,
) -> ReasoningResponse:
    bull = direction == "Buy"

    htf_bias = (
        f"H1 {'bullish' if features.htf_bullish > 0 else 'bearish'} structure "
        f"(score {features.htf_structure_score:+.0f}/100). "
        + ("Break of Structure confirms continuation." if features.bos_present > 0.5 else "")
    )

    liquidity = ""
    if features.liquidity_sweep_recent > 0.5:
        liquidity = (
            "Sell-side liquidity sweep completed — smart money loaded long positions."
            if bull else
            "Buy-side liquidity sweep completed — smart money distributed short."
        )
    elif features.ob_proximity_score > 0.6:
        liquidity = f"Price trading at unmitigated order block zone (proximity {features.ob_proximity_score:.0%})."

    macro = _format_macro(features, bull)

    news_ctx = ""
    if features.news_impact_score > 0.5:
        sentiment_word = "positive" if features.news_sentiment_score > 0 else "negative"
        news_ctx = f"Recent news flow {sentiment_word} for Gold (impact={features.news_impact_score:.0%})."
    if features.high_impact_event_imminent > 0.5:
        news_ctx += " WARNING: High-impact event imminent — position sizing reduced."

    entry_trigger = (
        f"Entry at current price ${price:.2f}. "
        f"{'Bullish' if bull else 'Bearish'} confirmation on M15 candle close above/below OB."
    )

    risk_just = (
        f"ATR-based SL ({features.atr_ratio:.1f}× ATR), "
        f"target ${features.atr_ratio * result.tp_pips * PIP:.1f}. "
        f"Session: {'London/NY Overlap (peak liquidity)' if features.session_overlap else 'Active session'}."
    )

    vol_warn = ""
    if features.volatility_regime > 0.8:
        vol_warn = f"⚠ High volatility regime — ATR elevated. SL sized accordingly."
    elif features.volatility_regime < 0.15:
        vol_warn = "⚠ Low volatility — wait for expansion confirmation."

    layer = result.layer_scores
    risk_warnings = result.risk_warnings or []
    if layer.get("structure", 0) < 0.3:
        risk_warnings.append("Weak HTF structure alignment — reduce position size")
    if layer.get("macro", 0) < 0.3:
        risk_warnings.append("Weak macro confirmation — monitor DXY reaction")

    return ReasoningResponse(
        htf_bias=htf_bias,
        liquidity_narrative=liquidity,
        macro_context=macro,
        news_context=news_ctx,
        entry_trigger=entry_trigger,
        risk_justification=risk_just,
        bullish_factors=result.bullish_factors,
        bearish_factors=result.bearish_factors,
        risk_warnings=risk_warnings,
        volatility_warning=vol_warn,
    )


def _format_macro(features, bull: bool) -> str:
    parts = []
    if abs(features.dxy_momentum) > 0.2:
        direction = "weakening" if features.dxy_momentum > 0 else "strengthening"
        parts.append(f"DXY {direction} ({'+' if features.dxy_momentum > 0 else ''}{features.dxy_momentum:.2f})")
    if abs(features.yield_momentum) > 0.2:
        direction = "declining" if features.yield_momentum > 0 else "rising"
        parts.append(f"US10Y yields {direction}")
    if features.risk_off_score > 0.5:
        parts.append(f"Risk-off environment (VIX {features.vix_level:.1f})")
    if not parts:
        return "Macro environment neutral — no strong directional macro driver."
    return " | ".join(parts) + "."


def _compute_win_rate(features, result: ScoringResult, request: InferenceRequest, rr: float) -> WinRateBreakdown:
    f = features
    bull = result.direction == "Buy"

    # Map session string → enum key expected by calculator
    session_map = {
        "LondonNyOverlap": "LONDON_NY_OVERLAP",
        "London":          "LONDON",
        "NewYork":         "NY",
        "Asia":            "ASIA",
        "Sydney":          "DEAD",
        "OffSession":      "DEAD",
    }
    session = session_map.get(request.session, "ASIA")

    # Count macro factors aligned with signal direction
    macro_count = 0
    if bull:
        if f.dxy_momentum  > 0.15: macro_count += 1  # DXY weakening → Gold ↑
        if f.yield_momentum > 0.15: macro_count += 1  # Yields falling → Gold ↑
        if f.risk_off_score > 0.5:  macro_count += 1  # Risk-off → Gold ↑
    else:
        if f.dxy_momentum  < -0.15: macro_count += 1
        if f.yield_momentum < -0.15: macro_count += 1
        if f.risk_off_score < 0.3:   macro_count += 1

    macro_divergent = (
        (bull and (f.dxy_momentum < -0.3 or f.yield_momentum < -0.3)) or
        (not bull and (f.dxy_momentum > 0.3 or f.yield_momentum > 0.3))
    )

    upcoming = request.upcoming_events or []
    event_hi_lt1h  = any(e.impact in ("High","Critical") and e.minutes_until <= 60  for e in upcoming)
    event_hi_1to2h = any(e.impact in ("High","Critical") and 60 < e.minutes_until <= 120 for e in upcoming)
    event_med_30m  = any(e.impact == "Medium"            and e.minutes_until <= 30  for e in upcoming)

    return calculate_win_rate(
        regime=request.regime,
        rr_ratio=rr,
        bos_confirmed=     f.bos_present > 0.5,
        choch_against=     f.choch_present > 0.5 and (
                               (bull and not request.htf_structure.bullish) or
                               (not bull and request.htf_structure.bullish)),
        ob_mitigating=     f.ob_proximity_score > 0.75,
        ob_nearby=         f.ob_proximity_score > 0.4,
        fvg_filling=       f.fvg_proximity_score > 0.75,
        fvg_nearby=        f.fvg_proximity_score > 0.4,
        liquidity_swept=   f.liquidity_sweep_recent > 0.5,
        htf_aligned=       (bull and request.htf_structure.bullish) or
                           (not bull and not request.htf_structure.bullish),
        htf_opposing=      (bull and not request.htf_structure.bullish and f.htf_bullish < -0.3) or
                           (not bull and request.htf_structure.bullish and f.htf_bullish > 0.3),
        mtf_confluence=    f.htf_structure_score * (1 if bull else -1) > 50,
        macro_aligned=     macro_count,
        macro_divergent=   macro_divergent,
        session=           session,
        event_hi_lt1h=     event_hi_lt1h,
        event_hi_1to2h=    event_hi_1to2h,
        event_med_lt30m=   event_med_30m,
        vix_extreme=       f.vix_level > 35,
        atr_compression=   f.atr_ratio < 0.5,
        atr_expansion=     f.atr_ratio > 1.3,
    )


def _pack_win_rate(b: WinRateBreakdown) -> WinRateResponse:
    return WinRateResponse(
        regime=b.regime,
        regime_prior_pct=round(b.regime_prior * 100, 1),
        final_probability=round(b.final_probability, 4),
        percentage=b.percentage,
        tier=b.tier,
        kelly_fraction=round(b.kelly_fraction, 4),
        quarter_kelly_pct=round(b.quarter_kelly * 100, 2),
        factors=[
            WinRateFactorResponse(
                key=f.key,
                label=f.label,
                description=f.description,
                impact_pct=round(f.prob_impact * 100, 1),
                positive=f.positive,
            )
            for f in b.factors
        ],
    )


def _no_trade(reason: str, warnings: list[str] | None = None) -> InferenceResponse:
    return InferenceResponse(
        direction="NoTrade",
        entry_price=0,
        stop_loss=0,
        take_profit=0,
        confidence=0,
        should_trade=False,
        no_trade_reason=reason,
        reasoning=ReasoningResponse(risk_warnings=warnings or []),
    )
