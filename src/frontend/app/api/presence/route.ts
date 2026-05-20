import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const revalidate = 0

// Module-level session map — persists across requests on warm Vercel instances.
// Sessions expire after 2 minutes of no heartbeat.
const sessions = new Map<string, number>()  // sessionId → lastSeen (ms)
const EXPIRY_MS = 2 * 60 * 1000

function sweep() {
  const cutoff = Date.now() - EXPIRY_MS
  for (const [id, ts] of sessions) {
    if (ts < cutoff) sessions.delete(id)
  }
}

// POST — heartbeat from client (every 30 s)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const id: unknown = body?.id
    if (typeof id !== 'string' || id.length < 8 || id.length > 64) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    sessions.set(id, Date.now())
    sweep()
    return NextResponse.json({ online: sessions.size })
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }
}

// GET — read current count (no side effects)
export async function GET() {
  sweep()
  return NextResponse.json({ online: sessions.size })
}
