import type { GoldFeatures } from './gold-features'

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

  // Confidence = signal STRENGTH. abs() on directional layers so strong bearish
  // setup gives same confidence as strong bullish setup.
  const rawScore =
    Math.abs(layerScores.structure)  * WEIGHTS.structure +
    Math.abs(layerScores.liquidity)  * WEIGHTS.liquidity +
    Math.abs(layerScores.macro)      * WEIGHTS.macro     +
    layerScores.volatility           * WEIGHTS.volatility +
    layerScores.session              * WEIGHTS.session   +
    layerScores.news                 * WEIGHTS.news
  const confidence = Math.round(sigmoidScale(rawScore) * 100)

  if (confidence < CONFIDENCE_THRESHOLD)
    return noTrade(`Confidence ${confidence} below ${CONFIDENCE_THRESHOLD} threshold`, warnings)

  const bullScore = directionalScore(features, true)
  const bearScore = directionalScore(features, false)
  if (Math.abs(bullScore - bearScore) < 0.08)
    return noTrade('Insufficient directional conviction — market ambiguous', warnings)

  const direction: 'Buy' | 'Sell' = bullScore > bearScore ? 'Buy' : 'Sell'
  const entryOffsetPips = features.obProximityScore > 0.7 ? 0 : features.obProximityScore > 0.4 ? 100 : 0

  return { direction, confidence, entryOffsetPips,
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
  const isBull = f.htfBullish > 0
  let score = 0

  if (isBull) { score += 0.4; bullish.push('H1 bullish market structure intact') }
  else        { score -= 0.4; bearish.push('H1 bearish market structure') }

  if (f.bosPresent > 0.5) {
    score += isBull ? 0.3 : -0.3
    ;(isBull ? bullish : bearish).push('Break of Structure confirmed')
  }

  if (f.unmitigatedObPresent > 0.5) {
    score += 0.2
    if (isBull) bullish.push('Unmitigated bullish OB acting as demand')
    else        bearish.push('Unmitigated bearish OB acting as supply')
  }

  if (f.obProximityScore > 0.7) {
    score += 0.1
    if (isBull) bullish.push('Price entering bullish OB demand zone')
    else        bearish.push('Price testing bearish OB supply zone')
  }

  if (f.fvgPresent > 0.5 && f.fvgProximityScore > 0.6) {
    score += 0.15
    if (isBull) bullish.push('Bullish FVG open — price drawn to fill imbalance')
    else        bearish.push('Bearish FVG open — price drawn to fill imbalance')
  }

  return Math.max(-1, Math.min(1, score))
}

function scoreLiquidity(f: GoldFeatures, bullish: string[], bearish: string[]): number {
  const isBull = f.htfBullish > 0
  let score = 0

  if (f.liquiditySweepRecent > 0.5) {
    score += 0.6
    ;(isBull ? bullish : bearish).push(
      isBull
        ? 'Sell-side liquidity sweep completed — smart money loaded long'
        : 'Buy-side liquidity sweep completed — smart money distributed short')
  }
  if (f.sslDistancePips > 2000 && isBull) {
    score += 0.2; bullish.push('Large SSL buffer below — SL breathing room')
  }
  if (f.liquidityImbalance > 0.3)       { score += 0.2; bullish.push('More BSL than SSL — buy-side pressure') }
  else if (f.liquidityImbalance < -0.3) { score += 0.2; bearish.push('More SSL than BSL — sell-side pressure') }

  return Math.max(-1, Math.min(1, score))
}

function scoreMacro(f: GoldFeatures, bullish: string[], bearish: string[]): number {
  let score = 0

  // DXY
  if (f.dxyMomentum > 0.3)       { score += 0.35; bullish.push('DXY weakening — bullish impulse for Gold') }
  else if (f.dxyMomentum < -0.3) { score -= 0.35; bearish.push('DXY strengthening — headwind for Gold') }

  // Yields
  if (f.yieldMomentum > 0.3)       { score += 0.30; bullish.push('US10Y yields declining — supports Gold') }
  else if (f.yieldMomentum < -0.3) { score -= 0.30; bearish.push('US10Y yields rising — pressure on Gold') }

  // Risk sentiment — both directions scored symmetrically
  if (f.riskOffScore > 0.5) {
    score += 0.25; bullish.push(`Risk-off (VIX ${f.vixLevel.toFixed(1)}) — safe-haven demand`)
  } else if (f.riskOnScore > 0.4) {
    score -= 0.20; bearish.push(`Risk-on (VIX ${f.vixLevel.toFixed(1)}, SPX bid) — reduces Gold safe-haven demand`)
  }

  // Composite macro alignment
  if (f.goldCorrelationScore > 0.6)       { score += 0.10; bullish.push('Multi-factor macro trifecta bullish') }
  else if (f.goldCorrelationScore < 0.15) { score -= 0.10; bearish.push('Macro factors not supporting Gold') }

  return Math.max(-1, Math.min(1, score))
}

function scoreVolatility(f: GoldFeatures, warnings: string[]): number {
  // Ideal: ATR $12–24 (regime 0.28–0.76) with expanding vol
  if (f.volatilityRegime > 0.28 && f.volatilityRegime < 0.76 && f.atrRatio > 0.8) return 0.8
  if (f.volatilityRegime < 0.08) {
    warnings.push('Extremely low volatility — avoid entries in dead compression'); return 0.1
  }
  if (f.volatilityRegime > 0.88) {
    warnings.push('Extreme volatility regime — widen SL by 25%'); return 0.4
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
  // Each factor is in [0,1]; divide by 7 for both sides to keep scale symmetric.
  // Sell side now has symmetric macro factors — no more BUY bias.
  if (buy) {
    return ([
      Math.max(0,  f.htfBullish),            // bullish H1 structure
      Math.max(0,  f.dxyMomentum),           // DXY weakening → gold up
      Math.max(0,  f.yieldMomentum),         // yields declining → gold up
      f.riskOffScore,                        // VIX spike / SPX drop → safe haven
      f.goldCorrelationScore,                // composite macro alignment score
      Math.max(0,  f.newsSentimentScore),    // positive gold news
      f.liquiditySweepRecent > 0.5 && f.htfBullish > 0 ? 1 : 0,
    ] as number[]).reduce((s, v) => s + v, 0) / 7
  } else {
    return ([
      Math.max(0, -f.htfBullish),            // bearish H1 structure
      Math.max(0, -f.dxyMomentum),           // DXY strengthening → gold down
      Math.max(0, -f.yieldMomentum),         // yields rising → gold down
      f.riskOnScore,                         // low VIX + SPX bid → risk-on → gold down
      Math.max(0, 1 - f.goldCorrelationScore), // macro NOT supporting gold
      Math.max(0, -f.newsSentimentScore),    // negative gold news
      f.liquiditySweepRecent > 0.5 && f.htfBullish < 0 ? 1 : 0,
    ] as number[]).reduce((s, v) => s + v, 0) / 7
  }
}

function sigmoidScale(raw: number): number {
  return 1 / (1 + Math.exp(-raw * 4))
}

function noTrade(reason: string, warnings: string[] = []): ScoringResult {
  return { direction: 'NoTrade', confidence: 0, entryOffsetPips: 0,
    layerScores: {}, noTradeReason: reason, bullishFactors: [], bearishFactors: [], riskWarnings: warnings }
}
