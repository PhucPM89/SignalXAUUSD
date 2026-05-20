const YAHOO_BASE = 'https://query1.finance.yahoo.com'

const YAHOO_SYMBOLS: Record<string, string> = {
  XAUUSD: 'GC=F',
  DXY: 'DX-Y.NYB',
  US10Y: '^TNX',
  VIX: '^VIX',
  SPX: '^GSPC',
}

function toYahooParams(tf: string): { interval: string; range: string } {
  switch (tf) {
    case 'M5':  return { interval: '5m',  range: '5d' }
    case 'M15': return { interval: '15m', range: '7d' }
    case 'M30': return { interval: '30m', range: '14d' }
    case 'H4':  return { interval: '1h',  range: '60d' }
    case 'D1':  return { interval: '1d',  range: '1y' }
    default:    return { interval: '1h',  range: '30d' }  // H1
  }
}

export interface CandleData {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export async function fetchCandles(
  symbol: string,
  timeframe: string,
  count: number,
): Promise<CandleData[]> {
  const yahooSym = YAHOO_SYMBOLS[symbol] ?? symbol
  const { interval, range } = toYahooParams(timeframe)
  const url = `${YAHOO_BASE}/v8/finance/chart/${yahooSym}?interval=${interval}&range=${range}`

  try {
    const res = await fetch(url, { next: { revalidate: 60 } })
    if (!res.ok) throw new Error(`Yahoo returned ${res.status}`)
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    const timestamps: number[] = result?.timestamp ?? []
    const quotes = result?.indicators?.quote?.[0]

    if (!timestamps.length || !quotes) throw new Error('No data')

    const candles: CandleData[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const o = quotes.open?.[i]
      const h = quotes.high?.[i]
      const l = quotes.low?.[i]
      const c = quotes.close?.[i]
      if (o == null || h == null || l == null || c == null) continue
      if (h < l || h < Math.min(o, c) || l > Math.max(o, c)) continue

      if (timeframe === 'H4') {
        const d = new Date(timestamps[i] * 1000)
        if (d.getUTCHours() % 4 !== 0) continue
      }

      candles.push({ time: timestamps[i], open: o, high: h, low: l, close: c,
        volume: quotes.volume?.[i] ?? 0 })
    }
    return candles.slice(-count)
  } catch {
    return tryTwelveData(symbol, timeframe, count)
  }
}

async function tryTwelveData(symbol: string, timeframe: string, count: number): Promise<CandleData[]> {
  const key = process.env.TWELVEDATA_API_KEY ?? ''
  if (!key) return generateSyntheticCandles(count)

  const tdSym = symbol === 'XAUUSD' ? 'XAU/USD' : symbol
  const tfMap: Record<string, string> = { M5: '5min', M15: '15min', M30: '30min', H1: '1h', H4: '4h', D1: '1day' }
  const url = `https://api.twelvedata.com/time_series?symbol=${tdSym}&interval=${tfMap[timeframe] ?? '1h'}&outputsize=${count}&apikey=${key}`

  try {
    const r = await fetch(url, { next: { revalidate: 60 } })
    const d = await r.json()
    if (!Array.isArray(d.values)) return generateSyntheticCandles(count)
    return (d.values as Record<string, string>[])
      .reverse()
      .map(v => ({
        time: Math.floor(new Date(v.datetime).getTime() / 1000),
        open: parseFloat(v.open), high: parseFloat(v.high),
        low: parseFloat(v.low), close: parseFloat(v.close),
        volume: parseFloat(v.volume ?? '0'),
      }))
  } catch {
    return generateSyntheticCandles(count)
  }
}

export async function fetchCurrentPrice(symbol: string): Promise<number> {
  const yahooSym = YAHOO_SYMBOLS[symbol] ?? symbol
  try {
    const res = await fetch(`${YAHOO_BASE}/v8/finance/chart/${yahooSym}?interval=1m&range=1d`,
      { cache: 'no-store' })
    const data = await res.json()
    return (data?.chart?.result?.[0]?.meta?.regularMarketPrice as number) ?? 0
  } catch {
    return 0
  }
}

export interface CorrelationSnapshot {
  dxyValue: number
  dxyChange1H: number
  us10YYield: number
  us10YChange1H: number
  vix: number
  spxChange1D: number
  isRiskOff: boolean
  isRiskOn: boolean
}

export async function fetchCorrelations(): Promise<CorrelationSnapshot> {
  const symbols = ['DX-Y.NYB', '^TNX', '^VIX', '^GSPC']

  const prices = await Promise.all(
    symbols.map(sym =>
      fetch(`${YAHOO_BASE}/v8/finance/chart/${sym}?interval=1h&range=2d`,
        { next: { revalidate: 60 } })
        .then(r => r.json())
        .then(d => (d?.chart?.result?.[0]?.meta?.regularMarketPrice as number) ?? 0)
        .catch(() => 0)
    )
  )

  const [dxy, us10y, vix, spx] = prices

  return {
    dxyValue: dxy,
    dxyChange1H: 0,
    us10YYield: us10y,
    us10YChange1H: 0,
    vix,
    spxChange1D: 0,
    isRiskOff: vix > 25,
    isRiskOn: vix > 0 && vix < 15,
  }
}

export function generateSyntheticCandles(count: number): CandleData[] {
  const candles: CandleData[] = []
  let price = 3285
  const now = Math.floor(Date.now() / 1000)
  for (let i = count - 1; i >= 0; i--) {
    const open = price
    const change = (Math.random() * 2 - 1) * 8
    const close = open + change
    const wick = Math.random() * 4
    candles.push({
      time: now - i * 3600,
      open, high: Math.max(open, close) + wick,
      low: Math.min(open, close) - wick,
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
    const lc = Math.abs(candles[i].low - candles[i - 1].close)
    sum += Math.max(hl, hc, lc)
  }
  return sum / (candles.length - 1)
}
