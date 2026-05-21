import type { CandleData } from '@/lib/market-data'
import type { MarketStructure } from './market-structure'

export interface GoldFeatures {
  htfStructureScore: number
  ltfStructureScore: number
  htfBullish: number           // 1 / -1
  bosPresent: number
  chochPresent: number
  unmitigatedObPresent: number
  obProximityScore: number     // [0-1]
  fvgPresent: number
  fvgProximityScore: number
  liquiditySweepRecent: number
  bslDistancePips: number
  sslDistancePips: number
  liquidityImbalance: number
  dxyMomentum: number
  yieldMomentum: number
  vixLevel: number
  riskOffScore: number
  riskOnScore: number          // inverse of riskOff: low VIX + rising SPX = bearish gold
  goldCorrelationScore: number
  atrRatio: number
  adrPct: number
  volatilityRegime: number
  rangePosition: number
  sessionLondon: number
  sessionNy: number
  sessionOverlap: number
  sessionDead: number
  newsSentimentScore: number
  newsImpactScore: number
  highImpactEventImminent: number
  eventSurpriseScore: number
  momentum1h: number
  momentum4h: number
  rsiH1: number
  macdSignal: number
}

export function extractFeatures(
  htf: MarketStructure,
  ltf: MarketStructure,
  htfScore: number,
  ltfScore: number,
  correlations: {
    dxyChange1H: number
    us10YChange1H: number
    vix: number
    spxChange1D: number
    isRiskOff: boolean
  },
  volatility: {
    atr1H: number
    atrPercent?: number
    adrPercent: number
    isExpanding: boolean
  },
  candles: CandleData[],
): GoldFeatures {
  const price = htf.currentPrice || (candles.length ? candles[candles.length - 1].close : 0)
  const atr   = volatility.atr1H

  const f: GoldFeatures = {
    htfStructureScore: htfScore,
    ltfStructureScore: ltfScore,
    htfBullish: htf.bullishStructure ? 1 : -1,
    bosPresent:  htf.breakOfStructure ? 1 : 0,
    chochPresent: htf.changeOfCharacter ? 1 : 0,
    unmitigatedObPresent: 0, obProximityScore: 0,
    fvgPresent: 0, fvgProximityScore: 0,
    liquiditySweepRecent: 0, bslDistancePips: 0, sslDistancePips: 0, liquidityImbalance: 0,
    dxyMomentum: 0, yieldMomentum: 0, vixLevel: 20,
    riskOffScore: 0, riskOnScore: 0, goldCorrelationScore: 0.33,
    atrRatio: 1, adrPct: 0.5, volatilityRegime: 0.5, rangePosition: 0.5,
    sessionLondon: 0, sessionNy: 0, sessionOverlap: 0, sessionDead: 0,
    newsSentimentScore: 0, newsImpactScore: 0, highImpactEventImminent: 0, eventSurpriseScore: 0,
    momentum1h: 0, momentum4h: 0, rsiH1: 0.5, macdSignal: 0,
  }

  // ── Order blocks (ATR-adaptive proximity) ───────────────────────────────────
  const unmitigated = htf.orderBlocks.filter(ob => ob.isUnmitigated)
  f.unmitigatedObPresent = unmitigated.length > 0 ? 1 : 0
  if (unmitigated.length && price > 0) {
    const nearest = unmitigated.reduce((a, b) =>
      Math.abs((a.high + a.low) / 2 - price) < Math.abs((b.high + b.low) / 2 - price) ? a : b)
    const distDollar = Math.abs(price - (nearest.high + nearest.low) / 2)
    // Max proximity window = 1.5× ATR (e.g. $15 at ATR=$10); floor at $5 for low-ATR conditions
    const maxDist = Math.max(5, atr * 1.5)
    f.obProximityScore = Math.max(0, 1 - distDollar / maxDist)
  }

  // ── FVGs (ATR-adaptive proximity) ────────────────────────────────────────────
  const openFvgs = htf.fairValueGaps.filter(g => !g.isFilled)
  f.fvgPresent = openFvgs.length > 0 ? 1 : 0
  if (openFvgs.length && price > 0) {
    const nearest = openFvgs.reduce((a, b) =>
      Math.abs((a.upperBound + a.lowerBound) / 2 - price) <
      Math.abs((b.upperBound + b.lowerBound) / 2 - price) ? a : b)
    const distDollar = Math.abs(price - (nearest.upperBound + nearest.lowerBound) / 2)
    const maxDist = Math.max(4, atr * 1.2)
    f.fvgProximityScore = Math.max(0, 1 - distDollar / maxDist)
  }

  // ── Liquidity ───────────────────────────────────────────────────────────────
  f.liquiditySweepRecent = htf.liquidityLevels.some(l => l.isSwept) ? 1 : 0
  const bslLevels = htf.liquidityLevels.filter(l => l.description.includes('BSL'))
  const sslLevels = htf.liquidityLevels.filter(l => l.description.includes('SSL'))
  const PIP = 0.01
  if (bslLevels.length)
    f.bslDistancePips = Math.min(...bslLevels.map(l => Math.abs(l.price - price) / PIP))
  if (sslLevels.length)
    f.sslDistancePips = Math.min(...sslLevels.map(l => Math.abs(l.price - price) / PIP))
  const total = bslLevels.length + sslLevels.length
  f.liquidityImbalance = total > 0 ? (bslLevels.length - sslLevels.length) / total : 0

  // ── Macro (Gold-specific inverse signs) ─────────────────────────────────────
  // DXY up → Gold down → negative for BUY
  f.dxyMomentum   = -Math.tanh(correlations.dxyChange1H * 5)
  // Yields up → Gold down → negative for BUY
  f.yieldMomentum = -Math.tanh(correlations.us10YChange1H * 10)
  f.vixLevel      = correlations.vix

  // Risk-off: VIX spike OR SPX sharp drop → safe-haven demand → gold bullish
  f.riskOffScore = (correlations.vix > 25 || correlations.spxChange1D < -1.0) ? 1 : 0

  // Risk-on: VIX calm AND SPX rising → risk appetite → gold bearish
  // Score grades from 0 to 1 based on how "risk-on" the environment is
  const vixContrib = correlations.vix > 0 && correlations.vix < 18
    ? Math.max(0, (18 - correlations.vix) / 18)
    : 0
  const spxContrib = correlations.spxChange1D > 0.5
    ? Math.min(1, correlations.spxChange1D / 2)
    : 0
  f.riskOnScore = Math.min(1, (vixContrib + spxContrib) / 2)

  const dxyBull   = correlations.dxyChange1H < -0.1 ? 1 : 0
  const yieldBull = correlations.us10YChange1H < -0.02 ? 1 : 0
  f.goldCorrelationScore = (dxyBull + yieldBull + (f.riskOffScore > 0 ? 1 : 0)) / 3

  // ── Volatility (calibrated for gold ATR range $5–35) ─────────────────────────
  f.atrRatio       = atr / 12   // normalised around $12 typical gold H1 ATR
  f.adrPct         = volatility.adrPercent
  // Linear mapping: ATR<5 → 0 (dead), ATR>30 → 1 (extreme); normal ~$10-15 → 0.2-0.5
  f.volatilityRegime = atr < 5 ? 0 : atr > 30 ? 1 : (atr - 5) / 25

  // ── Session ─────────────────────────────────────────────────────────────────
  const h = new Date().getUTCHours()
  f.sessionLondon  = h >= 7 && h <= 12 ? 1 : 0
  f.sessionNy      = h >= 13 && h <= 20 ? 1 : 0
  f.sessionOverlap = h >= 13 && h <= 16 ? 1 : 0
  f.sessionDead    = h >= 22 || h <= 2 ? 1 : 0

  // ── Candle-based momentum ───────────────────────────────────────────────────
  if (candles.length >= 5) {
    const last  = candles[candles.length - 1]
    const prev1 = candles[candles.length - 2]
    const prev4 = candles[Math.max(0, candles.length - 5)]
    f.momentum1h = (last.close - prev1.close) / Math.max(atr, 0.01)
    f.momentum4h = (last.close - prev4.close) / Math.max(atr, 0.01)

    const gains: number[] = [], losses: number[] = []
    const rsiCandles = candles.slice(-15)
    for (let i = 1; i < rsiCandles.length; i++) {
      const d = rsiCandles[i].close - rsiCandles[i - 1].close
      if (d > 0) gains.push(d); else losses.push(-d)
    }
    const avgGain = gains.reduce((s, v) => s + v, 0) / 14
    const avgLoss = losses.reduce((s, v) => s + v, 0) / 14
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    f.rsiH1 = (100 - 100 / (1 + rs)) / 100
  }

  return f
}
