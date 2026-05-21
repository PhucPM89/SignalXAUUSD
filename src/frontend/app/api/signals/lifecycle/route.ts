import { NextRequest, NextResponse } from 'next/server'
import { fbGet, fbSet, fbDelete } from '@/lib/firebase'

export const dynamic = 'force-dynamic'

interface LifecycleState {
  id:        string
  phase:     string
  currentSL: number
}

const PATH = 'state/lifecycle'

export async function GET() {
  try {
    const data = await fbGet<LifecycleState>(PATH)
    return NextResponse.json(data ?? null)
  } catch {
    return NextResponse.json(null)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, phase, currentSL } = body ?? {}

    if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'bad id' }, { status: 400 })
    if (!['OPEN', 'BREAKEVEN', 'TRAILING'].includes(phase)) return NextResponse.json({ error: 'bad phase' }, { status: 400 })
    if (typeof currentSL !== 'number' || currentSL <= 0) return NextResponse.json({ error: 'bad sl' }, { status: 400 })

    await fbSet(PATH, { id, phase, currentSL })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }
}

export async function DELETE() {
  try {
    await fbDelete(PATH)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
