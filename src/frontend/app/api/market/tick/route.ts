import { NextResponse } from 'next/server'
import { fetchCurrentPrice } from '@/lib/market-data'

// Module-level cache — avoids slamming Yahoo Finance on every 1s client poll
let _price = 0
let _ts = 0
const CACHE_MS = 1_500

export async function GET() {
  const now = Date.now()
  if (_price > 0 && now - _ts < CACHE_MS) {
    // Serve stale value immediately; background-refresh happens next cache miss
  } else {
    const fetched = await fetchCurrentPrice('XAUUSD')
    if (fetched > 0) { _price = fetched; _ts = now }
  }

  const price  = _price
  const spread = 0.02

  return NextResponse.json({
    symbol:    'XAUUSD',
    bid:       Math.round((price - spread / 2) * 100) / 100,
    ask:       Math.round((price + spread / 2) * 100) / 100,
    mid:       Math.round(price * 100) / 100,
    spread,
    timestamp: new Date().toISOString(),
  })
}
