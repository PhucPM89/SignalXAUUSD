import { NextResponse } from 'next/server'
import { generateSignal } from '@/lib/signal-engine/inference'
import type { Signal } from '@/types/trading'

export const dynamic = 'force-dynamic'

// Server-side cache — reduces cold-start cost on Vercel free tier.
// The frontend already locks active BUY/SELL signals, so repeated calls within
// the 30s poll window only hit this cache, not the full 2-3s pipeline.
let _cache: Signal | null = null
let _cacheTs = 0
const CACHE_MS = 28_000  // just under the 30s frontend poll interval

export async function GET() {
  const now = Date.now()
  if (_cache && now - _cacheTs < CACHE_MS) {
    return NextResponse.json(_cache)
  }
  try {
    const signal = await generateSignal()
    if (signal) {
      _cache   = signal
      _cacheTs = now
    }
    return NextResponse.json(signal ?? _cache)
  } catch (err) {
    console.error('Signal generation error:', err)
    return NextResponse.json(_cache)  // return stale rather than null on error
  }
}
