'use client'

import { useEffect, useRef } from 'react'
import { useTradingStore } from '@/stores/tradingStore'
import type { Signal, Tick } from '@/types/trading'

const TICK_INTERVAL_MS    = 2_000
const SIGNAL_INTERVAL_MS  = 30_000
const CORR_INTERVAL_MS    = 60_000

export function useLiveData() {
  const {
    setTick, addSignalToHistory, setRegime,
    updateCorrelations, setConnectionStatus,
  } = useTradingStore()

  const tickTimer   = useRef<ReturnType<typeof setInterval> | null>(null)
  const signalTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const corrTimer   = useRef<ReturnType<typeof setInterval> | null>(null)

  async function pollTick() {
    try {
      const res = await fetch('/api/market/tick', { cache: 'no-store' })
      if (res.ok) {
        const tick: Tick = await res.json()
        setTick(tick)
        setConnectionStatus('connected')
      }
    } catch {
      setConnectionStatus('error')
    }
  }

  async function pollSignal() {
    try {
      const res = await fetch('/api/signals/generate', { cache: 'no-store' })
      if (!res.ok) return
      const signal: Signal | null = await res.json()
      if (signal) {
        addSignalToHistory(signal)
        if (signal.regime) setRegime(signal.regime)
      }
    } catch {
      // non-blocking
    }
  }

  async function pollCorrelations() {
    try {
      const res = await fetch('/api/market/correlations', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      updateCorrelations(data.dxyValue, data.dxyChange1H, data.us10YYield, data.vix)
    } catch {
      // non-blocking
    }
  }

  useEffect(() => {
    setConnectionStatus('connecting')

    // Immediate first calls
    pollTick()
    pollSignal()
    pollCorrelations()

    tickTimer.current   = setInterval(pollTick,   TICK_INTERVAL_MS)
    signalTimer.current = setInterval(pollSignal, SIGNAL_INTERVAL_MS)
    corrTimer.current   = setInterval(pollCorrelations, CORR_INTERVAL_MS)

    return () => {
      if (tickTimer.current)   clearInterval(tickTimer.current)
      if (signalTimer.current) clearInterval(signalTimer.current)
      if (corrTimer.current)   clearInterval(corrTimer.current)
      setConnectionStatus('disconnected')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
