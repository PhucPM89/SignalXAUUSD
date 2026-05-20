import { NextResponse } from 'next/server'
import { generateSignal } from '@/lib/signal-engine/inference'

export async function GET() {
  try {
    const signal = await generateSignal()
    if (!signal) return NextResponse.json(null)
    return NextResponse.json(signal)
  } catch (err) {
    console.error('Signal generation error:', err)
    return NextResponse.json(null)
  }
}
