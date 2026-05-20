'use client'

import { useEffect, useRef } from 'react'
import { useTradingStore } from '@/stores/tradingStore'
import type { Signal, Tick, NewsAlert, EconomicEvent, SessionType } from '@/types/trading'

const TICK_INTERVAL_MS    =  1_000
const SIGNAL_INTERVAL_MS  = 30_000
const CORR_INTERVAL_MS    = 60_000
const NEWS_INTERVAL_MS    =  2 * 60_000   // 2 min — tighter for breaking news detection
const EVENTS_INTERVAL_MS  = 30 * 60_000   // 30 min
const SESSION_INTERVAL_MS =  60_000       // 1 min

function deriveSession(): SessionType {
  const h = new Date().getUTCHours()
  if (h >= 22 || h <= 2)             return 'Sydney'
  if (h >= 2  && h < 8)              return 'Tokyo'
  if (h >= 13 && h <= 16)            return 'Overlap'
  if (h >= 8  && h < 13)             return 'London'
  if (h >= 13 && h < 22)             return 'NewYork'
  return 'OffSession'
}

export function useLiveData() {
  const {
    setTick, addSignalToHistory, setRegime, closeActiveSignal,
    updateCorrelations, setConnectionStatus,
    setNewsAlerts, setEconomicEvents, setSession,
  } = useTradingStore()

  const timers = useRef<ReturnType<typeof setInterval>[]>([])

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
    // Read current state imperatively — avoids stale closure over store values
    const { activeSignal, currentPrice } = useTradingStore.getState()

    // Lock active BUY/SELL signals — only replace when closed or expired
    if (activeSignal && (activeSignal.direction === 'BUY' || activeSignal.direction === 'SELL')) {
      const expired = Date.now() > new Date(activeSignal.expiresAt).getTime()

      if (!expired) {
        const isBuy = activeSignal.direction === 'BUY'
        const slHit = currentPrice > 0 && (isBuy
          ? currentPrice <= activeSignal.stopLoss
          : currentPrice >= activeSignal.stopLoss)
        const tpHit = currentPrice > 0 && (isBuy
          ? currentPrice >= activeSignal.takeProfit
          : currentPrice <= activeSignal.takeProfit)

        if (slHit) { closeActiveSignal('SL_HIT') }
        else if (tpHit) { closeActiveSignal('TP_HIT') }
        else { return }  // signal still valid — keep Entry/SL/TP locked
      }
      // expired or SL/TP hit → fall through and fetch new signal
    }

    try {
      const res = await fetch('/api/signals/generate', { cache: 'no-store' })
      if (!res.ok) return
      const signal: Signal | null = await res.json()
      if (signal) {
        addSignalToHistory(signal)
        if (signal.regime)  setRegime(signal.regime)
        if (signal.session) setSession(signal.session)
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

  async function pollNews() {
    try {
      const res = await fetch('/api/news', { cache: 'no-store' })
      if (!res.ok) return
      const alerts: NewsAlert[] = await res.json()
      if (alerts.length > 0) setNewsAlerts(alerts)
    } catch {
      // non-blocking
    }
  }

  async function pollEvents() {
    try {
      const res = await fetch('/api/events', { cache: 'no-store' })
      if (!res.ok) return
      const events: EconomicEvent[] = await res.json()
      setEconomicEvents(events)
    } catch {
      // non-blocking
    }
  }

  function syncSession() {
    setSession(deriveSession())
  }

  useEffect(() => {
    setConnectionStatus('connecting')

    // Immediate first calls
    pollTick()
    pollSignal()
    pollCorrelations()
    pollNews()
    pollEvents()
    syncSession()

    timers.current = [
      setInterval(pollTick,        TICK_INTERVAL_MS),
      setInterval(pollSignal,      SIGNAL_INTERVAL_MS),
      setInterval(pollCorrelations, CORR_INTERVAL_MS),
      setInterval(pollNews,        NEWS_INTERVAL_MS),
      setInterval(pollEvents,      EVENTS_INTERVAL_MS),
      setInterval(syncSession,     SESSION_INTERVAL_MS),
    ]

    return () => {
      timers.current.forEach(clearInterval)
      setConnectionStatus('disconnected')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
