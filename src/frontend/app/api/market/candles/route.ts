import { NextRequest, NextResponse } from 'next/server'
import { fetchCandles } from '@/lib/market-data'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const timeframe = searchParams.get('timeframe') ?? 'H1'
  const count     = Math.min(parseInt(searchParams.get('count') ?? '200'), 500)

  const candles = await fetchCandles('XAUUSD', timeframe, count)
  return NextResponse.json(candles)
}
