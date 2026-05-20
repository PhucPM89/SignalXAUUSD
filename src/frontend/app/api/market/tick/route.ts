import { NextResponse } from 'next/server'
import { fetchTickData } from '@/lib/market-data'

export async function GET() {
  const td     = await fetchTickData('XAUUSD')
  const spread = 0.02
  const price  = td.price

  return NextResponse.json({
    symbol:       'XAUUSD',
    bid:          Math.round((price - spread / 2) * 100) / 100,
    ask:          Math.round((price + spread / 2) * 100) / 100,
    mid:          Math.round(price * 100) / 100,
    spread,
    change24H:    Math.round(td.change24H * 100) / 100,
    changePct24H: Math.round(td.changePct24H * 100) / 100,
    timestamp:    new Date().toISOString(),
  })
}
