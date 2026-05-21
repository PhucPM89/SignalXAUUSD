import { NextResponse } from 'next/server'
import { fetchEconomicCalendar, type CalendarEvent } from '@/lib/market-data'
import { fbGet, fbSet } from '@/lib/firebase'

export const dynamic = 'force-dynamic'

interface EventsCache { events: CalendarEvent[]; ts: number }
const FB_PATH = 'cache/economicEvents'

export async function GET() {
  const events = await fetchEconomicCalendar()

  if (events.length > 0) {
    // Store to Firebase so other instances + future failures have a fallback
    try { await fbSet(FB_PATH, { events, ts: Date.now() }) } catch { /* non-fatal */ }
    return NextResponse.json(events)
  }

  // ForexFactory failed — serve the most recent Firebase-cached week
  try {
    const cached = await fbGet<EventsCache>(FB_PATH)
    if (cached?.events?.length) return NextResponse.json(cached.events)
  } catch { /* ignore */ }

  return NextResponse.json([])
}
