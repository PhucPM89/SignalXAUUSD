import { NextResponse } from 'next/server'
import { generateSignal } from '@/lib/signal-engine/inference'
import { fbGet, fbSet } from '@/lib/firebase'
import type { Signal } from '@/types/trading'

export const dynamic = 'force-dynamic'

interface CachedSignal {
  signal: Signal
  ts:     number
}

// Firebase path keeps signal state shared across ALL Vercel instances.
// Without this, each cold-started instance has its own in-memory cache
// and different users can hit different instances → different signals.
const STATE_PATH = 'state/activeSignal'
const CACHE_MS   = 28_000   // just under the 30s frontend poll interval

export async function GET() {
  const now = Date.now()

  // Check Firebase for a valid shared signal (same for all users/instances)
  try {
    const cached = await fbGet<CachedSignal>(STATE_PATH)
    if (cached?.signal) {
      const fresh    = now - cached.ts < CACHE_MS
      const notExpired = now < new Date(cached.signal.expiresAt).getTime()
      if (fresh && notExpired) {
        return NextResponse.json(cached.signal)
      }
    }
  } catch { /* fall through to generation on Firebase read failure */ }

  // Generate fresh signal and share it via Firebase
  try {
    const signal = await generateSignal()
    if (signal) {
      // Write to Firebase so all subsequent instances/users get the same signal
      try { await fbSet(STATE_PATH, { signal, ts: now }) } catch { /* non-fatal */ }
    }
    return NextResponse.json(signal)
  } catch (err) {
    console.error('Signal generation error:', err)
    // Return whatever is in Firebase rather than null
    try {
      const stale = await fbGet<CachedSignal>(STATE_PATH)
      if (stale?.signal) return NextResponse.json(stale.signal)
    } catch { /* ignore */ }
    return NextResponse.json(null)
  }
}
