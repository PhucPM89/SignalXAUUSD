import type { GoldFeatures } from './gold-features'

const PIP = 0.01
const MIN_TARGET = 15
const MAX_TARGET = 30
const CONFIDENCE_THRESHOLD = 72

const WEIGHTS = {
  structure:  0.28,
  liquidity:  0.20,
  macro:      0.22,
  volatility: 0.12,
  session:    0.10,
  news:       0.08,
}

export interface ScoringResult {
  direction: 'Buy' | 'Sell' | 'NoTrade'
  confidence: number
  entryOffsetPips: number
  slPips: number
  tpPips: number
  layerScores: Record<string, number>
  noTradeReason?: string
  bullishFactors: string[]
  bearishFactors: string[]
  riskWarnings: string[]
}

export function scoreSignal(features: GoldFeatures, currentPrice: number): ScoringResult {
  const bullish: string[] = []
  const bearish: string[] = []
  const warnings: string[] = []

  const gateReason = applyHardGates(features, warnings)
  if (gateReason) return noTrade(gateReason, warnings)

  const layerScores = {
    structure:  scoreStructure(features, bullish, bearish),
    liquidity:  scoreLiquidity(features, bullish, bearish),
    macro:      scoreMacro(features, bullish, bearish),
    volatility: scoreVolatility(features, warnings),
    session:    scoreSession(features, warnings),
    news:       scoreNews(features, warnings),
  }

  const rawScore = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[])
    .reduce((s, k) => s + layerScores[k] * WEIGHTS[k], 0)
  const confidence = Math.round(sigmoidScale(rawScore) * 100)

  if (confidence < CONFIDENCE_THRESHOLD)
    return noTrade(`Confidence ${confidence} below ${CONFIDENCE_THRESHOLD} threshold`, warnings)

  const bullScore = directionalScore(features, true)
  const bearScore = directionalScore(features, false)
  if (Math.abs(bullScore - bearScore) < 0.05)
    return noTrade('Insufficient directional conviction — market ambiguous', warnings)

  const direction: 'Buy' | 'Sell' = bullScore > bearScore ? 'Buy' : 'Sell'
  const { slPips, tpPips, entryOffsetPips } = riskParams(features, confidence)

  if (slPips <= 0 || tpPips <= 0)
    return noTrade('Could not compute valid SL/TP', warnings)

  const rr = tpPips / slPips
  if (rr < 1.8)
    return noTrade(`RR ${rr.toFixed(1)} below minimum 1.8`, warnings)

  return { direction, confidence, entryOffsetPips, slPips, tpPips,
    layerScores, bullishFactors: bullish, bearishFactors: bearish, riskWarnings: warnings }
}

function applyHardGates(f: GoldFeatures, warnings: string[]): string | null {
  if (f.sessionDead > 0.5) return 'Dead session — no Gold liquidity'
  if (f.highImpactEventImminent > 0.5) {
    warnings.push('High-impact event imminent — circuit breaker active')
    return 'High-impact economic event within 30 minutes'
  }
  if (f.volatilityRegime < 0.05) return 'Volatility too low — Gold in dead compression'
  if (f.chochPresent > 0.5 && f.htfStructureScore < -30)
    return 'Change of character on HTF — structure invalidated'
  return null
}

function scoreStructure(f: GoldFeatures, bullish: string[], bearish: string[]): number {
  let score = 0
  if (f.htfBullish > 0) { score += 0.4; bullish.push('H1 bullish market structure intact') }
  else                  { score -= 0.4; bearish.push('H1 bearish market structure') }
  if (f.bosPresent > 0.5) {
    score += f.htfBullish > 0 ? 0.3 : -0.3
    ;(f.htfBullish > 0 ? bullish : bearish).push('Break of Structure confirmed')
  }
  if (f.unmitigatedObPresent > 0.5) {
    score += 0.2
    bullish.push(`Unmitigated ${f.htfBullish > 0 ? 'bullish' : 'bearish'} order block present`)
  }
  if (f.obProximityScore > 0.7) { score += 0.1; bullish.push('Price within order block zone') }
  if (f.fvgPresent > 0.5 && f.fvgProximityScore > 0.6) {
    score += 0.15; bullish.push('Fair Value Gap open — potential fill target')
  }
  return Math.max(-1, Math.min(1, score))
}

function scoreLiquidity(f: GoldFeatures, bullish: string[], bearish: string[]): number {
  let score = 0
  if (f.liquiditySweepRecent > 0.5) {
    score += 0.6
    ;(f.htfBullish > 0 ? bullish : bearish).push(
      f.htfBullish > 0
        ? 'Sell-side liquidity sweep completed — bullish continuation likely'
        : 'Buy-side liquidity sweep completed — bearish continuation likely')
  }
  if (f.sslDistancePips > 2000 && f.htfBullish > 0) {
    score += 0.2; bullish.push('Large SSL buffer below — SL breathing room available')
  }
  if (f.liquidityImbalance > 0.3)       { score += 0.2; bullish.push('Liquidity imbalance favours buy side') }
  else if (f.liquidityImbalance < -0.3) { score += 0.2; bearish.push('Liquidity imbalance favours sell side') }
  return Math.max(-1, Math.min(1, score))
}

function scoreMacro(f: GoldFeatures, bullish: string[], bearish: string[]): number {
  let score = 0
  if (f.dxyMomentum > 0.3)      { score += 0.35; bullish.push('DXY weakening — bullish Gold impulse') }
  else if (f.dxyMomentum < -0.3){ score -= 0.35; bearish.push('DXY strengthening — headwind for Gold') }
  if (f.yieldMomentum > 0.3)      { score += 0.3; bullish.push('US10Y yields declining — supports Gold') }
  else if (f.yieldMomentum < -0.3){ score -= 0.3; bearish.push('US10Y yields rising — pressure on Gold') }
  if (f.riskOffScore > 0.5) {
    score += 0.25; bullish.push(`Risk-off (VIX ${f.vixLevel.toFixed(1)}) — safe-haven demand`)
  }
  if (f.goldCorrelationScore > 0.6)      { score += 0.1; bullish.push('Multi-factor macro alignment bullish') }
  else if (f.goldCorrelationScore < 0.2) { score -= 0.1; bearish.push('Macro factors not aligned for Gold') }
  return Math.max(-1, Math.min(1, score))
}

function scoreVolatility(f: GoldFeatures, warnings: string[]): number {
  if (f.volatilityRegime > 0.3 && f.volatilityRegime < 0.75 && f.atrRatio > 1.0) return 0.8
  if (f.volatilityRegime < 0.1) {
    warnings.push('Extremely low volatility — avoid entries in dead compression'); return 0.1
  }
  if (f.volatilityRegime > 0.85) {
    warnings.push('High volatility regime — widen SL by 20%'); return 0.4
  }
  return 0.5
}

function scoreSession(f: GoldFeatures, warnings: string[]): number {
  if (f.sessionOverlap > 0.5) return 0.95
  if (f.sessionNy > 0.5)      return 0.80
  if (f.sessionLondon > 0.5)  return 0.75
  if (f.sessionDead > 0.5) {
    warnings.push('Off-session — Gold liquidity minimal'); return 0.05
  }
  return 0.40
}

function scoreNews(f: GoldFeatures, warnings: string[]): number {
  let base = 0.5
  if (Math.abs(f.newsSentimentScore) > 0.5 && f.newsImpactScore > 0.6)
    base += f.newsSentimentScore * 0.4
  if (f.highImpactEventImminent > 0.5) {
    base -= 0.4; warnings.push('High-impact event imminent — confidence suppressed')
  }
  return Math.max(0, Math.min(1, base))
}

function directionalScore(f: GoldFeatures, buy: boolean): number {
  // Neutral factors score 0 — only count active evidence, divide by 7 for both sides
  if (buy) {
    return ([
      Math.max(0,  f.htfBullish),             // bullish H1 structure
      Math.max(0,  f.dxyMomentum),            // DXY weakening → gold up
      Math.max(0,  f.yieldMomentum),          // yields declining → gold up
      f.riskOffScore,                         // risk-off (VIX spike, SPX sell-off)
      f.goldCorrelationScore,                 // composite macro alignment
      Math.max(0,  f.newsSentimentScore),     // positive gold news
      f.liquiditySweepRecent > 0.5 && f.htfBullish > 0 ? 1 : 0,
    ] as number[]).reduce((s, v) => s + v, 0) / 7
  } else {
    return ([
      Math.max(0, -f.htfBullish),             // bearish H1 structure
      Math.max(0, -f.dxyMomentum),            // DXY strengthening → gold down
      Math.max(0, -f.yieldMomentum),          // yields rising → gold down
      0,                                      // no symmetric risk-on metric
      0,                                      // no symmetric gold correlation metric
      Math.max(0, -f.newsSentimentScore),     // negative gold news
      f.liquiditySweepRecent > 0.5 && f.htfBullish < 0 ? 1 : 0,
    ] as number[]).reduce((s, v) => s + v, 0) / 7
  }
}

function riskParams(f: GoldFeatures, confidence: number) {
  const atrPips = f.atrRatio * 1000
  const slMult  = 0.8 + f.volatilityRegime * 0.7
  const slPips  = Math.max(500, Math.min(1500, atrPips * slMult))
  const tpMult  = 2.0 + ((confidence - 72) / 28) * 1.0
  const tpPips  = Math.max(MIN_TARGET / PIP, Math.min(MAX_TARGET / PIP, slPips * tpMult))
  const entryOffsetPips = f.obProximityScore > 0.7 ? 0 : f.obProximityScore > 0.4 ? 30 : 0
  return { slPips, tpPips, entryOffsetPips }
}

function sigmoidScale(raw: number): number {
  return 1 / (1 + Math.exp(-raw * 4))
}

function noTrade(reason: string, warnings: string[] = []): ScoringResult {
  return { direction: 'NoTrade', confidence: 0, entryOffsetPips: 0, slPips: 0, tpPips: 0,
    layerScores: {}, noTradeReason: reason, bullishFactors: [], bearishFactors: [], riskWarnings: warnings }
}
