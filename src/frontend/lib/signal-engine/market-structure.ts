import type { CandleData } from '@/lib/market-data'

export interface OrderBlock {
  high: number
  low: number
  isBullish: boolean
  isUnmitigated: boolean
  strength: number
  formedAt: number  // Unix seconds
}

export interface FairValueGap {
  upperBound: number
  lowerBound: number
  isBullish: boolean
  isFilled: boolean
  sizePips: number
  formedAt: number
}

export interface LiquidityLevel {
  price: number
  isSwept: boolean
  isBullishSweep: boolean
  description: string
}

export interface MarketStructure {
  bullishStructure: boolean
  breakOfStructure: boolean
  changeOfCharacter: boolean
  swingHigh: number
  swingLow: number
  currentPrice: number
  orderBlocks: OrderBlock[]
  fairValueGaps: FairValueGap[]
  liquidityLevels: LiquidityLevel[]
}

export function structureScore(ms: MarketStructure): number {
  let score = 0
  if (ms.bullishStructure) score += 20
  if (ms.breakOfStructure) score += 15
  if (ms.changeOfCharacter) score -= 10
  if (ms.orderBlocks.some(ob => ob.isBullish && ob.isUnmitigated)) score += 20
  if (ms.fairValueGaps.some(fvg => fvg.isBullish && !fvg.isFilled)) score += 15
  if (ms.liquidityLevels.some(l => l.isSwept && l.isBullishSweep)) score += 30
  return Math.max(-100, Math.min(100, score))
}

export function analyzeMarketStructure(candles: CandleData[]): MarketStructure {
  const empty: MarketStructure = {
    bullishStructure: false, breakOfStructure: false, changeOfCharacter: false,
    swingHigh: 0, swingLow: 0, currentPrice: 0,
    orderBlocks: [], fairValueGaps: [], liquidityLevels: [],
  }
  if (candles.length < 20) return empty

  // ATR drives adaptive thresholds for OB/FVG/liquidity detection
  const atr = calcAtrLocal(candles.slice(-14))

  const last50 = candles.slice(-50)
  const swingHigh = Math.max(...last50.map(c => c.high))
  const swingLow  = Math.min(...last50.map(c => c.low))
  const current   = candles[candles.length - 1].close
  const bullishStructure = current > (swingHigh + swingLow) / 2

  const orderBlocks     = detectOrderBlocks(candles, atr)
  const fairValueGaps   = detectFairValueGaps(candles, atr)
  const liquidityLevels = detectLiquidityLevels(candles, atr)

  // BOS: broke a meaningful prior swing
  const prior = candles.slice(-100, -10)
  const priorHigh = prior.length ? Math.max(...prior.map(c => c.high)) : swingHigh
  const priorLow  = prior.length ? Math.min(...prior.map(c => c.low)) : swingLow
  const breakOfStructure = bullishStructure ? current > priorHigh : current < priorLow

  // CHoCH: recent mid-history had opposite bias
  const mid = candles.slice(-30, -10)
  const midMid = mid.length
    ? (Math.max(...mid.map(c => c.high)) + Math.min(...mid.map(c => c.low))) / 2
    : 0
  const midBullish = mid.length ? mid[mid.length - 1].close > midMid : bullishStructure
  const changeOfCharacter = midBullish !== bullishStructure

  return { bullishStructure, breakOfStructure, changeOfCharacter,
    swingHigh, swingLow, currentPrice: current,
    orderBlocks, fairValueGaps, liquidityLevels }
}

function detectOrderBlocks(candles: CandleData[], _atr: number): OrderBlock[] {
  const blocks: OrderBlock[] = []

  for (let i = 2; i < candles.length - 1; i++) {
    const prev = candles[i - 1]
    const curr = candles[i]
    const prevBody = Math.abs(prev.close - prev.open)
    const currBody = Math.abs(curr.close - curr.open)

    // Bullish OB: bearish candle followed by bullish impulse — wick break is enough (relaxed from close-break)
    if (prev.close < prev.open && curr.close > curr.open &&
        currBody > prevBody * 1.2 && curr.high > prev.high) {
      const isUnmitigated = !candles.slice(i + 1).some(c => c.low <= prev.low)
      blocks.push({ high: prev.high, low: prev.low, isBullish: true, isUnmitigated,
        strength: Math.min(100, Math.round((currBody / Math.max(prevBody, 0.01)) * 50)),
        formedAt: prev.time })
    }

    // Bearish OB: bullish candle followed by bearish impulse — wick break is enough
    if (prev.close > prev.open && curr.close < curr.open &&
        currBody > prevBody * 1.2 && curr.low < prev.low) {
      const isUnmitigated = !candles.slice(i + 1).some(c => c.high >= prev.high)
      blocks.push({ high: prev.high, low: prev.low, isBullish: false, isUnmitigated,
        strength: Math.min(100, Math.round((currBody / Math.max(prevBody, 0.01)) * 50)),
        formedAt: prev.time })
    }
  }
  return blocks.slice(-10)
}

function detectFairValueGaps(candles: CandleData[], atr: number): FairValueGap[] {
  const fvgs: FairValueGap[] = []
  const PIP = 0.01
  // Adaptive minimum: at least 15% of ATR in dollar terms
  // ATR=$10 → min $1.50 = 150 pips; floor at 50 pips to avoid zero on tiny ATR
  const minPips = Math.max(50, Math.round(atr * 0.15 / PIP))

  for (let i = 1; i < candles.length - 1; i++) {
    const c1 = candles[i - 1]
    const c3 = candles[i + 1]

    if (c1.high < c3.low) {
      const size = (c3.low - c1.high) / PIP
      if (size >= minPips) {
        const isFilled = candles.slice(i + 1).some(c => c.low <= c1.high)
        fvgs.push({ upperBound: c3.low, lowerBound: c1.high, isBullish: true,
          isFilled, sizePips: size, formedAt: candles[i].time })
      }
    }

    if (c1.low > c3.high) {
      const size = (c1.low - c3.high) / PIP
      if (size >= minPips) {
        const isFilled = candles.slice(i + 1).some(c => c.high >= c1.low)
        fvgs.push({ upperBound: c1.low, lowerBound: c3.high, isBullish: false,
          isFilled, sizePips: size, formedAt: candles[i].time })
      }
    }
  }
  return fvgs.slice(-5)
}

function detectLiquidityLevels(candles: CandleData[], atr: number): LiquidityLevel[] {
  const levels: LiquidityLevel[] = []
  const recent = candles.slice(-50)
  // Adaptive tolerance: widens in volatile conditions so equal levels aren't missed
  const TOLERANCE = Math.max(0.30, atr * 0.02)

  for (let i = 0; i < recent.length - 2; i++) {
    for (let j = i + 2; j < recent.length; j++) {
      if (Math.abs(recent[i].high - recent[j].high) <= TOLERANCE) {
        const price = (recent[i].high + recent[j].high) / 2
        if (levels.some(l => Math.abs(l.price - price) < TOLERANCE)) continue
        const isSwept = recent.slice(j + 1).some(c => c.high > recent[j].high + TOLERANCE)
        levels.push({ price, isSwept, isBullishSweep: isSwept, description: 'Equal Highs (BSL)' })
      }
      if (Math.abs(recent[i].low - recent[j].low) <= TOLERANCE) {
        const price = (recent[i].low + recent[j].low) / 2
        if (levels.some(l => Math.abs(l.price - price) < TOLERANCE)) continue
        const isSwept = recent.slice(j + 1).some(c => c.low < recent[j].low - TOLERANCE)
        levels.push({ price, isSwept, isBullishSweep: false, description: 'Equal Lows (SSL)' })
      }
    }
  }
  return levels.slice(0, 8)
}

export function determineSession(): string {
  const h = new Date().getUTCHours()
  if (h >= 22 || h <= 1) return 'Sydney'
  if (h >= 2  && h <= 7)  return 'Tokyo'
  if (h >= 13 && h <= 16) return 'Overlap'
  if (h >= 8  && h <= 12) return 'London'
  return 'NewYork'
}

export function determineRegime(
  vol: { isExpanding: boolean; isContracting: boolean; atr1H: number },
  corr: { vix: number; isRiskOff: boolean },
  htf: MarketStructure,
): string {
  if (vol.atr1H > 20 && corr.isRiskOff) return 'HighVolatility'
  if (vol.atr1H < 5) return 'LowLiquidity'
  if (vol.isContracting) return 'Compression'
  if (vol.isExpanding && htf.bullishStructure) return 'Trending'
  if (vol.isExpanding && !htf.bullishStructure) return 'Expansion'
  if (htf.breakOfStructure || htf.changeOfCharacter) return 'Manipulation'
  return 'RangeBound'
}

export function calculateVolatility(candles1h: CandleData[], candles4h: CandleData[]) {
  const atr1H = calcAtrLocal(candles1h.slice(-14))
  const atr4H = calcAtrLocal(candles4h.slice(-14))
  const prevAtr = calcAtrLocal(candles1h.slice(-28, -14))
  const isExpanding  = prevAtr > 0 && atr1H > prevAtr * 1.1
  const isContracting = prevAtr > 0 && atr1H < prevAtr * 0.9
  const last = candles1h[candles1h.length - 1]
  const adrPercent = last
    ? (candles1h.slice(-20).reduce((s, c) => s + (c.high - c.low), 0) / 20) / last.close * 100
    : 0.5
  return {
    atr1H, atr4H, adrPercent, isExpanding, isContracting,
    regime: isExpanding ? 'Expanding' : isContracting ? 'Contracting' : 'Stable',
  }
}

function calcAtrLocal(candles: CandleData[]): number {
  if (candles.length < 2) return 8
  let sum = 0
  for (let i = 1; i < candles.length; i++) {
    sum += Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low  - candles[i - 1].close),
    )
  }
  return sum / (candles.length - 1)
}
