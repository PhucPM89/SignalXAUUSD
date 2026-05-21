import { NextResponse } from 'next/server'
import { fetchGoldNews } from '@/lib/market-data'
import { getCachedCandles, getCachedCorrelations } from '@/lib/data-cache'
import {
  analyzeMarketStructure, calculateVolatility, determineSession, determineRegime,
  structureScore,
} from '@/lib/signal-engine/market-structure'
import { extractFeatures, type GoldFeatures } from '@/lib/signal-engine/gold-features'
import { calculateWinRate, sessionToWinRateKey, regimeToWinRateKey } from '@/lib/signal-engine/win-rate-calculator'

export const runtime = 'nodejs'
export const revalidate = 0

// 15-second server-side cache — rate-limits Yahoo while still feeling live
let _cache: WinRateResponse | null = null
let _cacheTs = 0

export interface WinRateResponse {
  buy:  number
  sell: number
  favored: 'BUY' | 'SELL'
  favoredPct: number
  context: {
    session:          string
    regime:           string
    vix:              number
    dxyValue:         number
    dxyChange1H:      number
    isRiskOff:        boolean
    htfBullish:       boolean
    bosPresent:       boolean
    chochPresent:     boolean
    newsSentiment:    number   // –1 bearish gold … +1 bullish gold
    geopoliticalRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME'
    updatedAt:        string
  }
}

export async function GET() {
  const now = Date.now()
  if (_cache && now - _cacheTs < 15_000) {
    return NextResponse.json(_cache)
  }

  try {
    const [h1Candles, h4Candles, correlations, newsAlerts] = await Promise.all([
      getCachedCandles('XAUUSD', 'H1', 100),
      getCachedCandles('XAUUSD', 'H4', 50),
      getCachedCorrelations(),
      fetchGoldNews().catch(() => [] as Awaited<ReturnType<typeof fetchGoldNews>>),
    ])

    if (h1Candles.length < 20) {
      return NextResponse.json({ error: 'insufficient candle data' }, { status: 503 })
    }

    const htfStructure = analyzeMarketStructure(h1Candles)
    const ltfStructure = analyzeMarketStructure(h4Candles.length >= 20 ? h4Candles : h1Candles.slice(-50))
    const htfScore     = structureScore(htfStructure)
    const ltfScore     = structureScore(ltfStructure)
    const volatility   = calculateVolatility(h1Candles, h4Candles)
    const session      = determineSession()
    const regime       = determineRegime(volatility, correlations, htfStructure)

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

    // News sentiment: weighted average of latest gold headlines
    const recentNews    = newsAlerts.slice(0, 8)
    const newsSentiment = recentNews.length > 0
      ? recentNews.reduce((s, n) => s + n.sentimentScore, 0) / recentNews.length
      : 0

    // Geopolitical risk tier derived from VIX (global fear gauge)
    const geopoliticalRisk: WinRateResponse['context']['geopoliticalRisk'] =
      correlations.vix > 40 ? 'EXTREME' :
      correlations.vix > 30 ? 'HIGH'    :
      correlations.vix > 22 ? 'MEDIUM'  : 'LOW'

    // Shared flags
    const sessionKey     = sessionToWinRateKey(session)
    const regimeKey      = regimeToWinRateKey(regime)
    const bosPresent     = features.bosPresent > 0.5
    const chochPresent   = features.chochPresent > 0.5
    const obMitigating   = features.obProximityScore > 0.75
    const obNearby       = features.obProximityScore > 0.4
    const fvgFilling     = features.fvgProximityScore > 0.75
    const fvgNearby      = features.fvgProximityScore > 0.4
    const liquiditySwept = features.liquiditySweepRecent > 0.5
    const equalHighsNearby = htfStructure.liquidityLevels.some(l => !l.isSwept)
    const mtfConfluence  = Math.abs(htfScore) > 50
    const vixExtreme     = features.vixLevel > 35
    const atrCompression = features.atrRatio < 0.5
    const atrExpansion   = features.atrRatio > 1.1   // atr/12 > 1.1 → ATR > ~$13

    // BUY scenario — compute once, then derive SELL as complement so the pair sums to 100%
    const buyWinRate = calculateWinRate({
      regime:   regimeKey,
      rrRatio:  2.0,
      bosConfirmed: bosPresent,
      chochAgainst: chochPresent && !htfStructure.bullishStructure,
      obMitigating, obNearby, fvgFilling, fvgNearby,
      liquiditySwept, equalHighsNearby, mtfConfluence,
      htfAligned:  htfStructure.bullishStructure,
      htfOpposing: !htfStructure.bullishStructure,
      macroAligned:   countMacroAligned(features, true),
      macroDivergent: isMacroDivergent(features, true),
      session: sessionKey,
      eventHiLt1h: false, eventHi1to2h: false, eventMedLt30m: false,
      vixExtreme, atrCompression, atrExpansion,
    })

    const buyPct = buyWinRate.percentage
    const sellPct = 100 - buyPct
    const favored: WinRateResponse['favored'] = buyPct >= sellPct ? 'BUY' : 'SELL'
    const favoredPct = Math.max(buyPct, sellPct)

    const result: WinRateResponse = {
      buy:  buyPct,
      sell: sellPct,
      favored,
      favoredPct,
      context: {
        session, regime,
        vix:          correlations.vix,
        dxyValue:     correlations.dxyValue,
        dxyChange1H:  correlations.dxyChange1H,
        isRiskOff:    correlations.isRiskOff,
        htfBullish:   htfStructure.bullishStructure,
        bosPresent, chochPresent,
        newsSentiment,
        geopoliticalRisk,
        updatedAt: new Date().toISOString(),
      },
    }

    _cache   = result
    _cacheTs = now

    return NextResponse.json(result)
  } catch (err) {
    console.error('[winrate]', err)
    return NextResponse.json({ error: 'computation failed' }, { status: 500 })
  }
}

function countMacroAligned(f: GoldFeatures, bull: boolean): number {
  let n = 0
  if (bull) {
    if (f.dxyMomentum   >  0.15) n++
    if (f.yieldMomentum >  0.15) n++
    if (f.riskOffScore  >  0.5)  n++
  } else {
    if (f.dxyMomentum   < -0.15) n++
    if (f.yieldMomentum < -0.15) n++
    if (f.riskOnScore   >  0.5)  n++   // symmetric threshold to riskOffScore > 0.5 above
  }
  return n
}

function isMacroDivergent(f: GoldFeatures, bull: boolean): boolean {
  if (bull)  return f.dxyMomentum < -0.3 || f.yieldMomentum < -0.3 || f.riskOnScore  > 0.6
  return f.dxyMomentum > 0.3 || f.yieldMomentum > 0.3 || f.riskOffScore > 0.6
}
