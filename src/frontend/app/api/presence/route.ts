import { NextRequest, NextResponse } from 'next/server'
import { fbGet, fbSet, fbDelete, fbIncrement } from '@/lib/firebase'

export const runtime = 'nodejs'
export const revalidate = 0

const EXPIRY_MS = 2 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const id: unknown = body?.id
    const isNew: boolean = body?.isNew === true
    if (typeof id !== 'string' || id.length < 8 || id.length > 64) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }

    const now    = Date.now()
    const cutoff = now - EXPIRY_MS

    const writes: Promise<unknown>[] = [fbSet(`presence/sessions/${id}`, now)]
    if (isNew) writes.push(fbIncrement('presence/totalVisits'))
    await Promise.all(writes)

    const sessions = await fbGet<Record<string, number>>('presence/sessions')
    let online = 0
    const expiredIds: string[] = []
    if (sessions) {
      for (const [sid, ts] of Object.entries(sessions)) {
        if (ts >= cutoff) online++
        else expiredIds.push(sid)
      }
      expiredIds.forEach(sid => fbDelete(`presence/sessions/${sid}`))
    }

    const totalVisits = await fbGet<number>('presence/totalVisits') ?? 0
    return NextResponse.json({ online, totalVisits })
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }
}

export async function GET() {
  const cutoff = Date.now() - EXPIRY_MS
  const [sessions, totalVisits] = await Promise.all([
    fbGet<Record<string, number>>('presence/sessions'),
    fbGet<number>('presence/totalVisits'),
  ])
  let online = 0
  if (sessions) {
    for (const ts of Object.values(sessions)) {
      if (ts >= cutoff) online++
    }
  }
  return NextResponse.json({ online, totalVisits: totalVisits ?? 0 })
}
