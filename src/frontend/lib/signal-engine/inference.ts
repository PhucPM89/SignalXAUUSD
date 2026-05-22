/**
 * Full signal generation pipeline — TypeScript port of Python inference_service.py
 * and C# GenerateSignalCommand.cs. Outputs the Signal type consumed by the frontend.
 */
import { randomUUID } from 'crypto'
import { type CandleData, type CorrelationSnapshot } from '@/lib/market-data'
import { getCachedCandles, getCachedCorrelations } from '@/lib/data-cache'
import {
  analyzeMarketStructure, calculateVolatility, determineSession, determineRegime,
  structureScore, type MarketStructure,
} from './market-structure'
import { extractFeatures } from './gold-features'
import { scoreSignal } from './scoring-engine'
import { computeStructuredRisk, type StructuredRisk } from './risk-levels'
import { calculateWinRate, sessionToWinRateKey, regimeToWinRateKey } from './win-rate-calculator'
import type { Signal, ChartOverlays, LayerScores, SignalReasoning } from '@/types/trading'

const PIP = 0.01

export async function generateSignal(): Promise<Signal | null> {
  // 1. Fetch market data in parallel
  const [h1Candles, h4Candles, correlations] = await Promise.all([
    getCachedCandles('XAUUSD', 'H1', 100),
    getCachedCandles('XAUUSD', 'H4', 50),
    getCachedCorrelations(),
  ])

  if (h1Candles.length < 20) return null

  const currentPrice = h1Candles[h1Candles.length - 1].close

  // 2. Market structure (always run — needed for chart overlays)
  const htfStructure = analyzeMarketStructure(h1Candles)
  const ltfStructure = analyzeMarketStructure(h4Candles.length >= 20 ? h4Candles : h1Candles.slice(-50))
  const htfScore = structureScore(htfStructure)
  const ltfScore = structureScore(ltfStructure)

  // 3. Volatility + session + regime
  const volatility   = calculateVolatility(h1Candles, h4Candles)
  const session      = determineSession()
  const regime       = determineRegime(volatility, correlations, htfStructure)

  // Always build chart overlays so the chart shows OB/FVG zones regardless of signal quality
  const chartOverlays = buildChartOverlays(htfStructure)

  // Helper: return NOTRADE signal that still carries chart overlays
  const noTrade = (reason: string) =>
    makeNoTrade(currentPrice, session, regime, volatility, correlations, chartOverlays, reason)

  // 4. Session gate — only suppress true dead hours (Sydney = 22:00–02:00 UTC)
  //    Tokyo (02:00–08:00 UTC) is lower quality but Gold IS tradeable — let scoring decide
  if (session === 'Sydney') {
    return noTrade('Sydney / dead session — Gold liquidity minimal')
  }

  // 5. Feature extraction
  const features = extractFeatures(
    htfStructure, ltfStructure, htfScore, ltfScore,
    {
      dxyChange1H:   correlations.dxyChange1H,
      us10YChange1H: correlations.us10YChange1H,
      vix:           correlations.vix,
      spxChange1D:   correlations.spxChange1D,
      isRiskOff:     correlations.isRiskOff,
    },
    volatility,
    h1Candles,
  )

  // 7. Scoring
  const scoring = scoreSignal(features, currentPrice)
  if (scoring.direction === 'NoTrade') {
    return noTrade(scoring.noTradeReason ?? 'No institutional-grade setup detected')
  }

  // 8. Price computation — structure-based SL/TP
  const direction  = scoring.direction
  const isBuy      = direction === 'Buy'
  const entryPrice = round2(isBuy
    ? currentPrice - scoring.entryOffsetPips * PIP
    : currentPrice + scoring.entryOffsetPips * PIP)

  const structured = computeStructuredRisk(isBuy, entryPrice, htfStructure, volatility.atr1H)
  const stopLoss   = structured.stopLoss
  const takeProfit = structured.takeProfit
  const riskDist   = Math.abs(entryPrice - stopLoss)
  const rrRatio    = riskDist > 0 ? round2(Math.abs(takeProfit - entryPrice) / riskDist) : 0

  if (rrRatio < 0.5) return noTrade(`Structure R:R ${rrRatio.toFixed(1)} below minimum 0.5`)

  // 9. Bayesian win rate
  const bull = direction === 'Buy'
  const macroAlignedCount = countMacroAligned(features, bull)
  const winRateResult = calculateWinRate({
    regime:           regimeToWinRateKey(regime),
    rrRatio,
    bosConfirmed:     features.bosPresent > 0.5,
    chochAgainst:     features.chochPresent > 0.5 && !htfStructure.bullishStructure === bull,
    obMitigating:     features.obProximityScore > 0.75,
    obNearby:         features.obProximityScore > 0.4,
    fvgFilling:       features.fvgProximityScore > 0.75,
    fvgNearby:        features.fvgProximityScore > 0.4,
    liquiditySwept:   features.liquiditySweepRecent > 0.5,
    equalHighsNearby: htfStructure.liquidityLevels.some(l => !l.isSwept),
    htfAligned:       (bull && htfStructure.bullishStructure) || (!bull && !htfStructure.bullishStructure),
    htfOpposing:      (bull && !htfStructure.bullishStructure) || (!bull && htfStructure.bullishStructure),
    mtfConfluence:    Math.abs(htfScore) > 50,
    macroAligned:     macroAlignedCount,
    macroDivergent:   isMacroDivergent(features, bull),
    session:          sessionToWinRateKey(session),
    eventHiLt1h:      false,
    eventHi1to2h:     false,
    eventMedLt30m:    false,
    vixExtreme:       features.vixLevel > 35,
    atrCompression:   features.atrRatio < 0.5,
    atrExpansion:     features.atrRatio > 1.1,   // atr/12 > 1.1 → ATR > ~$13 (recalibrated)
  })

  // 10. Reasoning narrative
  const reasoning = buildReasoning(features, scoring, direction, currentPrice, volatility, structured)

  // 11. Layer scores
  const layerScores: LayerScores = {
    structure:  scoring.layerScores.structure  ?? 0,
    liquidity:  scoring.layerScores.liquidity  ?? 0,
    macro:      scoring.layerScores.macro      ?? 0,
    volatility: scoring.layerScores.volatility ?? 0,
    session:    scoring.layerScores.session    ?? 0,
    news:       scoring.layerScores.news       ?? 0,
  }

  // winProbability uses Bayesian result, not the directional conviction score
  const winProb     = winRateResult.final_probability
  const expectedVal = winProb * (takeProfit - entryPrice) - (1 - winProb) * Math.abs(entryPrice - stopLoss)
  const isInstitutional = scoring.confidence >= 80 && rrRatio >= 2.5

  const now       = new Date()
  const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000)

  const signal: Signal = {
    id:               randomUUID(),
    symbol:           'XAUUSD',
    direction:        direction === 'Buy' ? 'BUY' : 'SELL',
    strength:         scoring.confidence >= 85 ? 'Institutional'
                    : scoring.confidence >= 78 ? 'Strong'
                    : scoring.confidence >= 72 ? 'Moderate'
                    : 'Weak',
    entryPrice:       round2(entryPrice),
    stopLoss:         round2(stopLoss),
    takeProfit:       round2(takeProfit),
    riskRewardRatio:  round2(rrRatio),
    winProbability:   winProb,
    expectedValue:    round2(expectedVal),
    confidenceScore:  scoring.confidence,
    regime:           regime as Signal['regime'],
    session:          session as Signal['session'],
    macroSentiment:   correlations.isRiskOff ? 'Risk-off' : correlations.isRiskOn ? 'Risk-on' : 'Neutral',
    newsImpact:       'None',
    isInstitutionalGrade: isInstitutional,
    reasoning,
    correlations: {
      dxyValue:      correlations.dxyValue,
      dxyChange1H:   correlations.dxyChange1H,
      us10YYield:    correlations.us10YYield,
      us10YChange1H: correlations.us10YChange1H,
      vix:           correlations.vix,
      spxChange1D:   correlations.spxChange1D,
      isRiskOff:     correlations.isRiskOff,
      isRiskOn:      correlations.isRiskOn,
    },
    volatility: {
      atr1H:         volatility.atr1H,
      atr4H:         volatility.atr4H,
      adrPercent:    volatility.adrPercent,
      isExpanding:   volatility.isExpanding,
      isContracting: volatility.isContracting,
      regime:        volatility.regime,
    },
    winRate:      winRateResult,
    chartOverlays,
    layerScores,
    generatedAt:  now.toISOString(),
    expiresAt:    expiresAt.toISOString(),
  }

  return signal
}

// ── NOTRADE signal (carries chart overlays for chart display) ─────────────────

function makeNoTrade(
  price:        number,
  session:      string,
  regime:       string,
  vol:          ReturnType<typeof calculateVolatility>,
  corr:         CorrelationSnapshot,
  overlays:     ChartOverlays,
  reason:       string,
): Signal {
  return {
    id:               randomUUID(),
    symbol:           'XAUUSD',
    direction:        'NOTRADE',
    strength:         'Weak',
    entryPrice:       price,
    stopLoss:         0,
    takeProfit:       0,
    riskRewardRatio:  0,
    winProbability:   0,
    expectedValue:    0,
    confidenceScore:  0,
    regime:           regime as Signal['regime'],
    session:          session as Signal['session'],
    macroSentiment:   corr.isRiskOff ? 'Risk-off' : 'Neutral',
    newsImpact:       'None',
    isInstitutionalGrade: false,
    reasoning: {
      htfBias:             reason,
      liquidityNarrative:  '',
      macroContext:        '',
      newsContext:         '',
      entryTrigger:        '',
      riskJustification:   '',
      bullishFactors:      [],
      bearishFactors:      [],
      riskWarnings:        [reason],
      volatilityWarning:   '',
    },
    correlations: {
      dxyValue:      corr.dxyValue,
      dxyChange1H:   corr.dxyChange1H,
      us10YYield:    corr.us10YYield,
      us10YChange1H: corr.us10YChange1H,
      vix:           corr.vix,
      spxChange1D:   corr.spxChange1D,
      isRiskOff:     corr.isRiskOff,
      isRiskOn:      corr.isRiskOn ?? false,
    },
    volatility: {
      atr1H:         vol.atr1H,
      atr4H:         vol.atr4H,
      adrPercent:    vol.adrPercent,
      isExpanding:   vol.isExpanding,
      isContracting: vol.isContracting,
      regime:        vol.regime,
    },
    chartOverlays: overlays,
    layerScores:   { structure: 0, liquidity: 0, macro: 0, volatility: 0, session: 0, news: 0 },
    generatedAt:   new Date().toISOString(),
    expiresAt:     new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number { return Math.round(n * 100) / 100 }

function countMacroAligned(f: ReturnType<typeof extractFeatures>, bull: boolean): number {
  let count = 0
  if (bull) {
    if (f.dxyMomentum > 0.15)   count++
    if (f.yieldMomentum > 0.15) count++
    if (f.riskOffScore > 0.5)   count++
  } else {
    if (f.dxyMomentum < -0.15)   count++
    if (f.yieldMomentum < -0.15) count++
    if (f.riskOnScore > 0.5)     count++   // symmetric threshold to riskOffScore check above
  }
  return count
}

function isMacroDivergent(f: ReturnType<typeof extractFeatures>, bull: boolean): boolean {
  if (bull)  return f.dxyMomentum < -0.3 || f.yieldMomentum < -0.3 || f.riskOnScore > 0.6
  return f.dxyMomentum > 0.3 || f.yieldMomentum > 0.3 || f.riskOffScore > 0.6
}

function buildReasoning(
  f:          ReturnType<typeof extractFeatures>,
  scoring:    ReturnType<typeof scoreSignal>,
  direction:  'Buy' | 'Sell',
  price:      number,
  vol:        ReturnType<typeof calculateVolatility>,
  structured: StructuredRisk,
): SignalReasoning {
  const bull = direction === 'Buy'

  const htfBias = `H1 ${f.htfBullish > 0 ? 'bullish' : 'bearish'} structure (score ${f.htfStructureScore > 0 ? '+' : ''}${f.htfStructureScore.toFixed(0)}/100).${f.bosPresent > 0.5 ? ' Break of Structure confirms continuation.' : ''}`

  let liquidityNarrative = ''
  if (f.liquiditySweepRecent > 0.5)
    liquidityNarrative = bull
      ? 'Sell-side liquidity sweep completed — smart money loaded long positions.'
      : 'Buy-side liquidity sweep completed — smart money distributed short.'
  else if (f.obProximityScore > 0.6)
    liquidityNarrative = `Price trading at unmitigated order block zone (proximity ${(f.obProximityScore * 100).toFixed(0)}%).`

  const macroParts: string[] = []
  if (Math.abs(f.dxyMomentum) > 0.2)
    macroParts.push(`DXY ${f.dxyMomentum > 0 ? 'weakening' : 'strengthening'} (${f.dxyMomentum > 0 ? '+' : ''}${f.dxyMomentum.toFixed(2)})`)
  if (Math.abs(f.yieldMomentum) > 0.2)
    macroParts.push(`US10Y ${f.yieldMomentum > 0 ? 'declining' : 'rising'}`)
  if (f.riskOffScore > 0.5)
    macroParts.push(`Risk-off (VIX ${f.vixLevel.toFixed(1)})`)
  const macroContext = macroParts.length
    ? macroParts.join(' | ') + '.'
    : 'Macro environment neutral — no strong directional driver.'

  const entryTrigger = `Entry at $${price.toFixed(2)}. ${bull ? 'Bullish' : 'Bearish'} confirmation on M15 candle close above/below OB.`
  const riskJust = `SL: ${structured.slReason}. TP: ${structured.tpReason}. Session: ${f.sessionOverlap > 0.5 ? 'London/NY Overlap (peak liquidity)' : 'Active session'}.`

  let volatilityWarning = ''
  if (f.volatilityRegime > 0.8) volatilityWarning = '⚠ High volatility regime — ATR elevated. SL sized accordingly.'
  else if (f.volatilityRegime < 0.15) volatilityWarning = '⚠ Low volatility — wait for expansion confirmation.'

  const riskWarnings = [...scoring.riskWarnings]
  if (structured.usedStructure === false) riskWarnings.push('No nearby demand/supply zones — ATR-based SL/TP used as fallback')
  if ((scoring.layerScores.structure ?? 0) < 0.3) riskWarnings.push('Weak HTF structure alignment — reduce position size')
  if ((scoring.layerScores.macro ?? 0) < 0.3) riskWarnings.push('Weak macro confirmation — monitor DXY reaction')

  return {
    htfBias, liquidityNarrative, macroContext,
    newsContext:        '',
    entryTrigger,
    riskJustification:  riskJust,
    bullishFactors:     scoring.bullishFactors,
    bearishFactors:     scoring.bearishFactors,
    riskWarnings,
    volatilityWarning,
  }
}

function buildChartOverlays(htf: MarketStructure): ChartOverlays {
  return {
    orderBlocks: htf.orderBlocks.map(ob => ({
      formedAtTs: ob.formedAt,
      top:        ob.high,
      bottom:     ob.low,
      isBullish:  ob.isBullish,
      mitigated:  !ob.isUnmitigated,
      strength:   ob.strength,
    })),
    fvgZones: htf.fairValueGaps.map(fvg => ({
      formedAtTs: fvg.formedAt,
      upper:      fvg.upperBound,
      lower:      fvg.lowerBound,
      isBullish:  fvg.isBullish,
      filled:     fvg.isFilled,
      sizePips:   fvg.sizePips,
    })),
    liquidityLevels: htf.liquidityLevels.map(lv => ({
      price:       lv.price,
      swept:       lv.isSwept,
      bullishSweep: lv.isBullishSweep,
      description: lv.description,
    })),
    bosPresent:   htf.breakOfStructure,
    chochPresent: htf.changeOfCharacter,
    htfBullish:   htf.bullishStructure,
    swingHigh:    htf.swingHigh,
    swingLow:     htf.swingLow,
  }
}
