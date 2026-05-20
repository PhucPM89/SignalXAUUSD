const YAHOO_BASE = 'https://query1.finance.yahoo.com'
const YAHOO_BASE2 = 'https://query2.finance.yahoo.com'

const YAHOO_SYMBOLS: Record<string, string> = {
  XAUUSD: 'GC=F',
  DXY:    'DX-Y.NYB',
  US10Y:  '^TNX',
  VIX:    '^VIX',
  SPX:    '^GSPC',
}

function toYahooParams(tf: string, count: number): { interval: string; range: string } {
  switch (tf) {
    case 'M5':  return { interval: '5m',  range: '5d'   }
    case 'M15': return { interval: '15m', range: '14d'  }
    case 'M30': return { interval: '30m', range: '14d'  }
    case 'H4': {
      // H4 downloads 1h bars then filters every 4h — need count×4h of 1h data + 50% buffer.
      // Previously hardcoded 180d (4320 candles) regardless of count — now dynamic.
      const days = Math.max(10, Math.min(180, Math.ceil(count * 4 / 24 * 1.5)))
      return { interval: '1h', range: `${days}d` }
    }
    case 'D1':  return { interval: '1d',  range: '2y'   }
    default: {
      // H1: add 50% buffer for weekends/gaps, cap at 60d
      const days = Math.max(5, Math.min(60, Math.ceil(count / 24 * 1.5)))
      return { interval: '1h', range: `${days}d` }
    }
  }
}

export interface CandleData {
  time:   number
  open:   number
  high:   number
  low:    number
  close:  number
  volume: number
}

export async function fetchCandles(
  symbol: string,
  timeframe: string,
  count: number,
): Promise<CandleData[]> {
  const yahooSym = YAHOO_SYMBOLS[symbol] ?? symbol
  const { interval, range } = toYahooParams(timeframe, count)
  const url = `${YAHOO_BASE}/v8/finance/chart/${yahooSym}?interval=${interval}&range=${range}`

  try {
    const ac  = new AbortController()
    const tid = setTimeout(() => ac.abort(), 5_000)
    const res = await fetch(url, { next: { revalidate: 30 }, signal: ac.signal }).finally(() => clearTimeout(tid))
    if (!res.ok) throw new Error(`Yahoo ${res.status}`)
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    const timestamps: number[] = result?.timestamp ?? []
    const quotes = result?.indicators?.quote?.[0]

    if (!timestamps.length || !quotes) throw new Error('No data')

    const raw: CandleData[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const o = quotes.open?.[i]
      const h = quotes.high?.[i]
      const l = quotes.low?.[i]
      const c = quotes.close?.[i]
      if (o == null || h == null || l == null || c == null) continue
      if (h < l || h < Math.min(o, c) || l > Math.max(o, c)) continue
      raw.push({ time: timestamps[i], open: o, high: h, low: l, close: c,
        volume: quotes.volume?.[i] ?? 0 })
    }

    // H4: properly aggregate 4× H1 candles → correct OHLCV per 4-hour window
    if (timeframe === 'H4') return aggregateToH4(raw, count)

    return raw.slice(-count)
  } catch {
    return tryTwelveData(symbol, timeframe, count)
  }
}

function aggregateToH4(h1: CandleData[], count: number): CandleData[] {
  const PERIOD = 4 * 3600  // seconds per 4-hour window
  const map = new Map<number, CandleData>()
  for (const c of h1) {
    const bucket = Math.floor(c.time / PERIOD) * PERIOD
    const agg = map.get(bucket)
    if (!agg) {
      map.set(bucket, { ...c, time: bucket })
    } else {
      agg.high   = Math.max(agg.high, c.high)
      agg.low    = Math.min(agg.low,  c.low)
      agg.close  = c.close   // last H1 close = H4 close
      agg.volume += c.volume
    }
  }
  return [...map.values()]
    .sort((a, b) => a.time - b.time)
    .slice(-count)
}

async function tryTwelveData(symbol: string, timeframe: string, count: number): Promise<CandleData[]> {
  const key = process.env.TWELVEDATA_API_KEY ?? ''
  if (!key) return generateSyntheticCandles(count)

  const tdSym = symbol === 'XAUUSD' ? 'XAU/USD' : symbol
  const tfMap: Record<string, string> = { M5: '5min', M15: '15min', M30: '30min', H1: '1h', H4: '4h', D1: '1day' }
  const url = `https://api.twelvedata.com/time_series?symbol=${tdSym}&interval=${tfMap[timeframe] ?? '1h'}&outputsize=${count}&apikey=${key}`

  try {
    const r = await fetch(url, { next: { revalidate: 30 } })
    const d = await r.json()
    if (!Array.isArray(d.values)) return generateSyntheticCandles(count)
    return (d.values as Record<string, string>[])
      .reverse()
      .map(v => ({
        time:   Math.floor(new Date(v.datetime).getTime() / 1000),
        open:   parseFloat(v.open),
        high:   parseFloat(v.high),
        low:    parseFloat(v.low),
        close:  parseFloat(v.close),
        volume: parseFloat(v.volume ?? '0'),
      }))
  } catch {
    return generateSyntheticCandles(count)
  }
}

// ── Tick data (price + 24H change) ────────────────────────────────────────────

export interface TickData {
  price:        number
  change24H:    number
  changePct24H: number
}

let _tickCache: TickData = { price: 0, change24H: 0, changePct24H: 0 }
let _tickTs = 0
const TICK_CACHE_MS = 800   // fits within 500ms frontend poll cycle

export async function fetchTickData(symbol: string): Promise<TickData> {
  const now = Date.now()
  if (_tickCache.price > 0 && now - _tickTs < TICK_CACHE_MS) return _tickCache

  const yahooSym = YAHOO_SYMBOLS[symbol] ?? symbol

  // Primary: v7 quote endpoint — returns only current price metadata, no OHLCV array
  try {
    const ac1  = new AbortController()
    const tid1 = setTimeout(() => ac1.abort(), 3_000)
    const res   = await fetch(
      `${YAHOO_BASE}/v7/finance/quote?symbols=${encodeURIComponent(yahooSym)}`,
      { cache: 'no-store', signal: ac1.signal }
    ).finally(() => clearTimeout(tid1))
    const data  = await res.json()
    const quote = data?.quoteResponse?.result?.[0]
    const price = (quote?.regularMarketPrice as number) ?? 0
    if (price > 0) {
      const prev         = (quote?.regularMarketPreviousClose as number) ?? price
      const change24H    = price - prev
      const changePct24H = prev > 0 ? (change24H / prev) * 100 : 0
      _tickCache = { price, change24H, changePct24H }
      _tickTs    = now
      return _tickCache
    }
  } catch { /* fall through to chart fallback */ }

  // Fallback: chart endpoint with minimal 5-minute range
  try {
    const ac2  = new AbortController()
    const tid2 = setTimeout(() => ac2.abort(), 3_000)
    const res       = await fetch(
      `${YAHOO_BASE}/v8/finance/chart/${yahooSym}?interval=1m&range=5m`,
      { cache: 'no-store', signal: ac2.signal }
    ).finally(() => clearTimeout(tid2))
    const data      = await res.json()
    const meta      = data?.chart?.result?.[0]?.meta
    const price     = (meta?.regularMarketPrice as number) ?? 0
    const prevClose = (meta?.chartPreviousClose as number) ?? price
    if (price > 0) {
      const change24H    = price - prevClose
      const changePct24H = prevClose > 0 ? (change24H / prevClose) * 100 : 0
      _tickCache = { price, change24H, changePct24H }
      _tickTs    = now
    }
  } catch { /* keep last cached value */ }

  return _tickCache
}

// ── Correlations (with actual 1H changes) ─────────────────────────────────────

export interface CorrelationSnapshot {
  dxyValue:      number
  dxyChange1H:   number  // absolute index-point change (e.g. 0.1 = DXY moved 0.1 pts)
  us10YYield:    number
  us10YChange1H: number  // absolute yield change in pct-pts (e.g. 0.02 = 2 bps)
  vix:           number
  spxChange1D:   number  // daily % change (e.g. -1.5 = SPX -1.5%)
  isRiskOff:     boolean
  isRiskOn:      boolean
}

async function fetchSymbolHourly(sym: string) {
  try {
    const ac  = new AbortController()
    const tid = setTimeout(() => ac.abort(), 4_000)
    const res = await fetch(
      `${YAHOO_BASE}/v8/finance/chart/${sym}?interval=1h&range=1d`,
      { next: { revalidate: 60 }, signal: ac.signal }
    ).finally(() => clearTimeout(tid))
    const data  = await res.json()
    const result = data?.chart?.result?.[0]
    const meta   = result?.meta
    const closes = (result?.indicators?.quote?.[0]?.close ?? []) as (number | null)[]

    const price     = (meta?.regularMarketPrice  as number) ?? 0
    const prevDay   = (meta?.chartPreviousClose  as number) ?? price
    const valid     = closes.filter((c): c is number => c != null)
    const prev1H    = valid.length >= 2 ? valid[valid.length - 2] : price
    const change1H  = price - prev1H
    const changePct1D = prevDay > 0 ? (price - prevDay) / prevDay * 100 : 0
    return { price, change1H, changePct1D }
  } catch {
    return { price: 0, change1H: 0, changePct1D: 0 }
  }
}

export async function fetchCorrelations(): Promise<CorrelationSnapshot> {
  const [dxy, us10y, vix, spx] = await Promise.all([
    fetchSymbolHourly('DX-Y.NYB'),
    fetchSymbolHourly('^TNX'),
    fetchSymbolHourly('^VIX'),
    fetchSymbolHourly('^GSPC'),
  ])

  return {
    dxyValue:      dxy.price,
    dxyChange1H:   dxy.change1H,
    us10YYield:    us10y.price,
    us10YChange1H: us10y.change1H,
    vix:           vix.price,
    spxChange1D:   spx.changePct1D,
    isRiskOff:     vix.price > 25,
    isRiskOn:      vix.price > 0 && vix.price < 15,
  }
}

// ── News ──────────────────────────────────────────────────────────────────────

export interface NewsItem {
  headline:       string
  source:         string
  publishedAt:    string
  sentimentScore: number  // –1 to +1 (Gold perspective)
  impact:         'Critical' | 'High' | 'Medium' | 'Low' | 'None'
}

const BULLISH_GOLD = [
  'inflation', 'rate cut', 'dovish', 'safe-haven', 'safe haven', 'geopolit', 'war',
  'crisis', 'recession', 'fear', 'uncertainty', 'debt', 'deficit', 'surge', 'rally',
  'rate pause', 'weaker dollar', 'dollar weakness', 'rate hold',
]
const BEARISH_GOLD = [
  'rate hike', 'hawkish', 'dollar strength', 'strong economy', 'taper', 'recovery',
  'growth', 'risk-on', 'equities rise', 'stock market rally', 'plunge gold',
]
const HIGH_IMPACT_KEYWORDS = [
  'fed', 'federal reserve', 'powell', 'fomc', 'cpi', 'nfp', 'non-farm', 'jobs report',
  'interest rate', 'rate decision', 'ecb', 'boe', 'central bank',
]
const MED_IMPACT_KEYWORDS = [
  'gold', 'xau', 'inflation', 'gdp', 'pce', 'pmi', 'retail sales', 'employment',
]

function scoreNewsSentiment(headline: string): number {
  const h = headline.toLowerCase()
  let score = 0
  BULLISH_GOLD.forEach(w => { if (h.includes(w)) score += 0.25 })
  BEARISH_GOLD.forEach(w => { if (h.includes(w)) score -= 0.25 })
  return Math.max(-1, Math.min(1, score))
}

function classifyNewsImpact(headline: string): NewsItem['impact'] {
  const h = headline.toLowerCase()
  if (HIGH_IMPACT_KEYWORDS.some(w => h.includes(w))) return 'High'
  if (MED_IMPACT_KEYWORDS.some(w => h.includes(w)))  return 'Medium'
  return 'Low'
}

export async function fetchGoldNews(): Promise<NewsItem[]> {
  try {
    const url = `${YAHOO_BASE2}/v1/finance/search?q=gold+XAU+GC%3DF&newsCount=20&enableFuzzyQuery=false&region=US&lang=en-US`
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) throw new Error(`Yahoo news ${res.status}`)
    const data = await res.json()
    const articles: Record<string, unknown>[] = data?.news ?? []

    return articles
      .filter(a => a.title && a.providerPublishTime)
      .map(a => {
        const headline = a.title as string
        return {
          headline,
          source:         (a.publisher as string) ?? 'Yahoo Finance',
          publishedAt:    new Date((a.providerPublishTime as number) * 1000).toISOString(),
          sentimentScore: scoreNewsSentiment(headline),
          impact:         classifyNewsImpact(headline),
        }
      })
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
  } catch {
    return []
  }
}

// ── Economic calendar (ForexFactory) ─────────────────────────────────────────

export interface CalendarEvent {
  name:        string
  currency:    string
  scheduledAt: string
  impact:      'Critical' | 'High' | 'Medium' | 'Low' | 'None'
  forecast?:   string
  previous?:   string
}

const FF_IMPACT: Record<string, CalendarEvent['impact']> = {
  'High':    'High',
  'Medium':  'Medium',
  'Low':     'Low',
  'Holiday': 'None',
}

// USD events of any impact; other currencies only High/Medium
const ALWAYS_SHOW = new Set(['USD'])
const SOMETIMES_SHOW = new Set(['EUR', 'GBP', 'JPY', 'CNY', 'CHF'])

export async function fetchEconomicCalendar(): Promise<CalendarEvent[]> {
  try {
    const res = await fetch(
      'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Signal-Dashboard/1.0)',
          'Accept':     'application/json',
        },
        next: { revalidate: 3600 },
      }
    )
    if (!res.ok) throw new Error(`FF calendar ${res.status}`)
    const text = await res.text()
    if (text.trim().startsWith('<')) throw new Error('Rate limited — got HTML')
    const data = JSON.parse(text)
    if (!Array.isArray(data)) return []

    return (data as Record<string, string>[])
      .filter(e => {
        if (e.impact === 'Holiday') return false
        if (ALWAYS_SHOW.has(e.country))    return true
        if (SOMETIMES_SHOW.has(e.country)) return e.impact === 'High' || e.impact === 'Medium'
        return false
      })
      .map(e => ({
        name:        e.title || e.event || 'Event',
        currency:    e.country,
        scheduledAt: e.date,
        impact:      FF_IMPACT[e.impact] ?? 'None',
        forecast:    e.forecast  || undefined,
        previous:    e.previous  || undefined,
      }))
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
  } catch {
    return []
  }
}

// ── Synthetic fallback ────────────────────────────────────────────────────────

export function generateSyntheticCandles(count: number): CandleData[] {
  const candles: CandleData[] = []
  let price = 3285
  const now = Math.floor(Date.now() / 1000)
  for (let i = count - 1; i >= 0; i--) {
    const open   = price
    const change = (Math.random() * 2 - 1) * 8
    const close  = open + change
    const wick   = Math.random() * 4
    candles.push({
      time: now - i * 3600,
      open, high: Math.max(open, close) + wick,
      low:  Math.min(open, close) - wick,
      close, volume: Math.floor(Math.random() * 5000 + 500),
    })
    price = close
  }
  return candles
}

export function calcAtr(candles: CandleData[]): number {
  if (candles.length < 2) return 8
  let sum = 0
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low
    const hc = Math.abs(candles[i].high - candles[i - 1].close)
    const lc = Math.abs(candles[i].low  - candles[i - 1].close)
    sum += Math.max(hl, hc, lc)
  }
  return sum / (candles.length - 1)
}
