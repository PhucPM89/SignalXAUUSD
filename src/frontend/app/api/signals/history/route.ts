import { NextRequest, NextResponse } from 'next/server'
import { fbGet, fbSet } from '@/lib/firebase'

export const runtime = 'nodejs'
export const revalidate = 0

const VALID_DIRS    = new Set(['BUY', 'SELL'])
const VALID_RESULTS = new Set(['TP_HIT', 'SL_HIT', 'EXPIRED', 'TRAILED_SL'])

export interface ClosedSignalRecord {
  id:     string
  dir:    string
  entry:  number
  sl:     number
  tp:     number
  rr:     number
  conf:   number
  regime: string
  session:string
  at:     string   // generatedAt ISO
  closed: string   // closedAt ISO
  result: string   // SignalCloseType
  pnl:    number
}

export async function GET() {
  const signals = await fbGet<Record<string, ClosedSignalRecord>>('signals', {
    orderBy:     '"$key"',
    limitToLast: '100',
  })
  if (!signals) return NextResponse.json([])
  const list = Object.values(signals).sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  )
  return NextResponse.json(list)
}

export async function POST(req: NextRequest) {
  try {
    const body: ClosedSignalRecord = await req.json()

    // Basic validation to prevent junk writes to Firebase
    if (
      typeof body?.id     !== 'string' || body.id.length < 4 || body.id.length > 80 ||
      !VALID_DIRS.has(body?.dir)    ||
      !VALID_RESULTS.has(body?.result) ||
      typeof body?.entry !== 'number' || body.entry < 500 || body.entry > 10_000 ||
      typeof body?.pnl   !== 'number' || Math.abs(body.pnl) > 2_000
    ) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 })
    }

    const safeId = body.id.replace(/[.#$[\]/]/g, '_')
    await fbSet(`signals/${safeId}`, body)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }
}
