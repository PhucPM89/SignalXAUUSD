import { NextResponse } from 'next/server'
import { fetchEconomicCalendar } from '@/lib/market-data'

export async function GET() {
  const events = await fetchEconomicCalendar()
  return NextResponse.json(events)
}
