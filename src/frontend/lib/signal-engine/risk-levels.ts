/**
 * Structure-based SL/TP calculation.
 *
 * Instead of fixed R:R multiples, SL is placed below/above the nearest real
 * demand/supply zone and TP targets the next significant level in the direction
 * of the trade. ATR is only used as bounds-checking and fallback.
 */

import type { MarketStructure } from './market-structure'

export interface StructuredRisk {
  stopLoss:      number
  takeProfit:    number
  slReason:      string
  tpReason:      string
  usedStructure: boolean  // false = fell back to ATR on both sides
}

export function computeStructuredRisk(
  isBuy: boolean,
  entry: number,
  htf:   MarketStructure,
  atr:   number,   // H1 ATR in dollars (e.g. $12)
): StructuredRisk {
  // Placement buffer — small gap so price doesn't immediately clip the level
  const buffer = Math.max(atr * 0.08, 0.50)    // ~$0.50–$2 depending on volatility
  // SL must be at least 0.5 ATR away (no premature stops) and at most 3 ATR away
  const minRisk = Math.max(atr * 0.5, 5.0)
  const maxRisk = atr * 3.0

  return isBuy
    ? computeBuy(entry, htf, atr, buffer, minRisk, maxRisk)
    : computeSell(entry, htf, atr, buffer, minRisk, maxRisk)
}

// ── BUY ──────────────────────────────────────────────────────────────────────

function computeBuy(
  entry:   number,
  htf:     MarketStructure,
  atr:     number,
  buffer:  number,
  minRisk: number,
  maxRisk: number,
): StructuredRisk {
  // ── Stop Loss — below nearest demand zone ─────────────────────────────────
  const slCandidates: { price: number; reason: string }[] = []

  // 1. Low of nearest unmitigated bullish OB (demand zone)
  const bullOBsBelow = htf.orderBlocks
    .filter(ob => ob.isBullish && ob.isUnmitigated && ob.low < entry - minRisk)
    .sort((a, b) => b.low - a.low)
  if (bullOBsBelow.length)
    slCandidates.push({ price: bullOBsBelow[0].low - buffer, reason: 'Below bullish OB demand zone' })

  // 2. SSL equal lows not yet swept (strong support below)
  const sslBelow = htf.liquidityLevels
    .filter(l => l.description.includes('SSL') && !l.isSwept && l.price < entry - minRisk)
    .sort((a, b) => b.price - a.price)
  if (sslBelow.length)
    slCandidates.push({ price: sslBelow[0].price - buffer, reason: 'Below SSL support level' })

  // 3. Swing low (last structural low)
  if (htf.swingLow < entry - minRisk)
    slCandidates.push({ price: htf.swingLow - buffer, reason: 'Below swing low' })

  // Filter: must be in [entry − maxRisk, entry − minRisk]; prefer tightest (highest)
  const validSL = slCandidates
    .filter(c => c.price < entry - minRisk && c.price > entry - maxRisk)
    .sort((a, b) => b.price - a.price)

  const sl      = validSL[0] ?? { price: entry - atr * 1.5, reason: 'ATR-based SL (no nearby demand zone)' }
  const slPrice = r2(sl.price)
  const riskDist = entry - slPrice

  // ── Take Profit — nearest supply zone above entry (no R:R minimum) ─────────
  // Minimum: $2 or 0.25 ATR (prevents micro-TPs); Maximum: 6 ATR (prevents fantasy TPs)
  const minTPDist = Math.max(atr * 0.25, 2.0)
  const minTP     = entry + minTPDist
  const maxTP     = entry + atr * 6

  const tpCandidates: { price: number; reason: string }[] = []

  // 1. Base of nearest unmitigated bearish OB (supply zone overhead)
  const bearOBsAbove = htf.orderBlocks
    .filter(ob => !ob.isBullish && ob.isUnmitigated && ob.low > minTP && ob.low < maxTP)
    .sort((a, b) => a.low - b.low)
  if (bearOBsAbove.length)
    tpCandidates.push({ price: bearOBsAbove[0].low - buffer, reason: 'Bearish OB supply zone' })

  // 2. BSL equal highs not yet swept (price hunts liquidity above)
  const bslAbove = htf.liquidityLevels
    .filter(l => l.description.includes('BSL') && !l.isSwept && l.price > minTP && l.price < maxTP)
    .sort((a, b) => a.price - b.price)
  if (bslAbove.length)
    tpCandidates.push({ price: bslAbove[0].price - buffer, reason: 'BSL equal highs liquidity target' })

  // 3. Swing high (structural resistance)
  if (htf.swingHigh > minTP && htf.swingHigh < maxTP)
    tpCandidates.push({ price: htf.swingHigh - buffer, reason: 'Swing high resistance' })

  // 4. Open bullish FVG upper bound (imbalance fill draw)
  const bullFVGs = htf.fairValueGaps
    .filter(fvg => !fvg.isFilled && fvg.isBullish && fvg.upperBound > minTP && fvg.upperBound < maxTP)
    .sort((a, b) => a.upperBound - b.upperBound)
  if (bullFVGs.length)
    tpCandidates.push({ price: bullFVGs[0].upperBound, reason: 'FVG imbalance fill target' })

  const validTP = tpCandidates
    .filter(c => c.price > minTP && c.price < maxTP)
    .sort((a, b) => a.price - b.price)  // take nearest valid level

  const tp = validTP[0] ?? { price: r2(entry + Math.max(riskDist * 1.5, minTPDist * 2)), reason: 'ATR-based TP (no supply zone detected)' }

  return {
    stopLoss:      slPrice,
    takeProfit:    r2(tp.price),
    slReason:      sl.reason,
    tpReason:      tp.reason,
    usedStructure: validSL.length > 0 || validTP.length > 0,
  }
}

// ── SELL ─────────────────────────────────────────────────────────────────────

function computeSell(
  entry:   number,
  htf:     MarketStructure,
  atr:     number,
  buffer:  number,
  minRisk: number,
  maxRisk: number,
): StructuredRisk {
  // ── Stop Loss — above nearest supply zone ─────────────────────────────────
  const slCandidates: { price: number; reason: string }[] = []

  // 1. High of nearest unmitigated bearish OB (supply zone)
  const bearOBsAbove = htf.orderBlocks
    .filter(ob => !ob.isBullish && ob.isUnmitigated && ob.high > entry + minRisk)
    .sort((a, b) => a.high - b.high)
  if (bearOBsAbove.length)
    slCandidates.push({ price: bearOBsAbove[0].high + buffer, reason: 'Above bearish OB supply zone' })

  // 2. BSL equal highs not yet swept (overhead resistance)
  const bslAbove = htf.liquidityLevels
    .filter(l => l.description.includes('BSL') && !l.isSwept && l.price > entry + minRisk)
    .sort((a, b) => a.price - b.price)
  if (bslAbove.length)
    slCandidates.push({ price: bslAbove[0].price + buffer, reason: 'Above BSL resistance level' })

  // 3. Swing high (last structural high)
  if (htf.swingHigh > entry + minRisk)
    slCandidates.push({ price: htf.swingHigh + buffer, reason: 'Above swing high' })

  const validSL = slCandidates
    .filter(c => c.price > entry + minRisk && c.price < entry + maxRisk)
    .sort((a, b) => a.price - b.price)  // prefer tightest (lowest above entry)

  const sl      = validSL[0] ?? { price: entry + atr * 1.5, reason: 'ATR-based SL (no nearby supply zone)' }
  const slPrice = r2(sl.price)
  const riskDist = slPrice - entry

  // ── Take Profit — nearest demand zone below entry (no R:R minimum) ─────────
  const minTPDist = Math.max(atr * 0.25, 2.0)
  const minTP     = entry - minTPDist     // nearest acceptable TP (just below entry)
  const maxTP     = entry - atr * 6      // furthest acceptable TP

  const tpCandidates: { price: number; reason: string }[] = []

  // 1. Top of nearest unmitigated bullish OB below entry (demand zone)
  const bullOBsBelow = htf.orderBlocks
    .filter(ob => ob.isBullish && ob.isUnmitigated && ob.high < minTP && ob.high > maxTP)
    .sort((a, b) => b.high - a.high)
  if (bullOBsBelow.length)
    tpCandidates.push({ price: bullOBsBelow[0].high + buffer, reason: 'Bullish OB demand zone' })

  // 2. SSL equal lows below entry (price hunts sell-side liquidity)
  const sslBelow = htf.liquidityLevels
    .filter(l => l.description.includes('SSL') && !l.isSwept && l.price < minTP && l.price > maxTP)
    .sort((a, b) => b.price - a.price)
  if (sslBelow.length)
    tpCandidates.push({ price: sslBelow[0].price + buffer, reason: 'SSL equal lows liquidity target' })

  // 3. Swing low (structural support)
  if (htf.swingLow < minTP && htf.swingLow > maxTP)
    tpCandidates.push({ price: htf.swingLow + buffer, reason: 'Swing low support' })

  // 4. Open bearish FVG lower bound (imbalance fill draw)
  const bearFVGs = htf.fairValueGaps
    .filter(fvg => !fvg.isFilled && !fvg.isBullish && fvg.lowerBound < minTP && fvg.lowerBound > maxTP)
    .sort((a, b) => b.lowerBound - a.lowerBound)
  if (bearFVGs.length)
    tpCandidates.push({ price: bearFVGs[0].lowerBound, reason: 'FVG imbalance fill target' })

  const validTP = tpCandidates
    .filter(c => c.price < minTP && c.price > maxTP)
    .sort((a, b) => b.price - a.price)  // take nearest valid level

  const tp = validTP[0] ?? { price: r2(entry - Math.max(riskDist * 1.5, minTPDist * 2)), reason: 'ATR-based TP (no demand zone detected)' }

  return {
    stopLoss:      slPrice,
    takeProfit:    r2(tp.price),
    slReason:      sl.reason,
    tpReason:      tp.reason,
    usedStructure: validSL.length > 0 || validTP.length > 0,
  }
}

function r2(n: number): number { return Math.round(n * 100) / 100 }
