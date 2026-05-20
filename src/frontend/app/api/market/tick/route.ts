import { NextResponse } from 'next/server'
import { fetchCurrentPrice } from '@/lib/market-data'

export async function GET() {
  const price = await fetchCurrentPrice('XAUUSD')
  const spread = 0.02
  const now = new Date().toISOString()

  return NextResponse.json({
    symbol: 'XAUUSD',
    bid: Math.round((price - spread / 2) * 100) / 100,
    ask: Math.round((price + spread / 2) * 100) / 100,
    mid: Math.round(price * 100) / 100,
    spread,
    timestamp: now,
  })
}
