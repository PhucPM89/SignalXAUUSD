'use client'

import { useEffect, useRef } from 'react'
import { useTradingStore } from '@/stores/tradingStore'
import type { SignalCloseType, SignalPhase } from '@/stores/tradingStore'
import type { Signal, Tick, NewsAlert, EconomicEvent, SessionType } from '@/types/trading'

// Tick matches server-side cache TTL — no wasted requests
const TICK_INTERVAL_MS    = 1_000
const SIGNAL_INTERVAL_MS  = 30_000
const MGMT_INTERVAL_MS    = 60_000
const CORR_INTERVAL_MS    = 60_000
const NEWS_INTERVAL_MS    =  2 * 60_000
const EVENTS_INTERVAL_MS  = 30 * 60_000
const SESSION_INTERVAL_MS =  60_000
const PRESENCE_INTERVAL_MS = 30_000

function deriveSession(): SessionType {
  const h = new Date().getUTCHours()
  if (h >= 22 || h <= 1)  return 'Sydney'
  if (h >= 2  && h <= 7)  return 'Tokyo'
  if (h >= 13 && h <= 16) return 'Overlap'
  if (h >= 8  && h <= 12) return 'London'
  return 'NewYork'
}

function getSessionId(): string {
  try {
    const key = '__signal_sid'
    let id = sessionStorage.getItem(key)
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36)
      sessionStorage.setItem(key, id)
    }
    return id
  } catch {
    return Math.random().toString(36).slice(2)
  }
}

function checkAndMarkNewVisit(): boolean {
  try {
    const key = '__signal_counted'
    if (sessionStorage.getItem(key)) return false
    sessionStorage.setItem(key, '1')
    return true
  } catch {
    return false
  }
}

export function useLiveData() {
  const {
    setTick, addSignalToHistory, setRegime, closeActiveSignal,
    updateCorrelations, setConnectionStatus,
    setNewsAlerts, setEconomicEvents, setSession,
    updateSignalSL, setOnlineUsers, setTotalVisits,
  } = useTradingStore()

  const timers      = useRef<ReturnType<typeof setInterval>[]>([])
  const deferTimers = useRef<ReturnType<typeof setTimeout>[]>([])

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

  async function closeAndRecord(type: SignalCloseType) {
    const { activeSignal } = useTradingStore.getState()
    if (!activeSignal || activeSignal.direction === 'NOTRADE') return

    closeActiveSignal(type)

    // Clear persisted lifecycle so next signal loads fresh
    fetch('/api/signals/lifecycle', { method: 'DELETE', cache: 'no-store' }).catch(() => {})

    const isBuy = activeSignal.direction === 'BUY'
    let pnl: number
    if (type === 'TP_HIT') {
      pnl = isBuy ? activeSignal.takeProfit - activeSignal.entryPrice : activeSignal.entryPrice - activeSignal.takeProfit
    } else if (type === 'EXPIRED') {
      pnl = 0
    } else {
      pnl = isBuy ? activeSignal.stopLoss - activeSignal.entryPrice : activeSignal.entryPrice - activeSignal.stopLoss
    }

    try {
      await fetch('/api/signals/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:      activeSignal.id,
          dir:     activeSignal.direction,
          entry:   activeSignal.entryPrice,
          sl:      activeSignal.stopLoss,
          tp:      activeSignal.takeProfit,
          rr:      activeSignal.riskRewardRatio,
          conf:    activeSignal.confidenceScore,
          regime:  activeSignal.regime  ?? '',
          session: activeSignal.session ?? '',
          at:      activeSignal.generatedAt,
          closed:  new Date().toISOString(),
          result:  type,
          pnl:     Math.round(pnl * 100) / 100,
        }),
        cache: 'no-store',
      })
    } catch { /* non-blocking */ }
  }

  function persistLifecycle(id: string, phase: SignalPhase, currentSL: number) {
    fetch('/api/signals/lifecycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, phase, currentSL }),
      cache: 'no-store',
    }).catch(() => {})
  }

  async function pollSignal() {
    const { activeSignal, currentPrice } = useTradingStore.getState()

    if (activeSignal && (activeSignal.direction === 'BUY' || activeSignal.direction === 'SELL')) {
      const isBuy = activeSignal.direction === 'BUY'
      const slHit = currentPrice > 0 && (isBuy
        ? currentPrice <= activeSignal.stopLoss
        : currentPrice >= activeSignal.stopLoss)
      const tpHit = currentPrice > 0 && (isBuy
        ? currentPrice >= activeSignal.takeProfit
        : currentPrice <= activeSignal.takeProfit)

      if (slHit)      { await closeAndRecord('SL_HIT') }
      else if (tpHit) { await closeAndRecord('TP_HIT') }
      else            { return }  // keep signal open until SL/TP regardless of expiry
    }

    try {
      const res = await fetch('/api/signals/generate', { cache: 'no-store' })
      if (!res.ok) return
      const signal: Signal | null = await res.json()
      if (signal) {
        addSignalToHistory(signal)
        if (signal.regime)  setRegime(signal.regime)
        if (signal.session) setSession(signal.session)

        // Restore persisted lifecycle (phase + trailing SL) after page refresh
        if (signal.direction === 'BUY' || signal.direction === 'SELL') {
          try {
            const lr = await fetch('/api/signals/lifecycle', { cache: 'no-store' })
            if (lr.ok) {
              const lifecycle: { id: string; phase: SignalPhase; currentSL: number } | null = await lr.json()
              if (lifecycle?.id === signal.id) {
                updateSignalSL(lifecycle.currentSL, lifecycle.phase)
              }
            }
          } catch { /* non-blocking */ }
        }
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

  async function pingPresence() {
    try {
      const res = await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: getSessionId(), isNew: checkAndMarkNewVisit() }),
        cache: 'no-store',
      })
      if (res.ok) {
        const data = await res.json()
        setOnlineUsers(data.online)
        if (typeof data.totalVisits === 'number') setTotalVisits(data.totalVisits)
      }
    } catch { /* non-blocking */ }
  }

  async function checkSignalManagement() {
    const { activeSignal, currentPrice, signalPhase } = useTradingStore.getState()
    if (!activeSignal || activeSignal.direction === 'NOTRADE') return

    const isBuy    = activeSignal.direction === 'BUY'
    const riskDist = Math.abs(activeSignal.stopLoss - activeSignal.entryPrice)
    if (riskDist <= 0) return

    const progress      = isBuy
      ? currentPrice - activeSignal.entryPrice
      : activeSignal.entryPrice - currentPrice
    const progressRatio = progress / riskDist

    if (signalPhase === 'OPEN' && progressRatio >= 1.0) {
      const buffer = 0.50
      const beSL   = isBuy
        ? activeSignal.entryPrice - buffer
        : activeSignal.entryPrice + buffer
      updateSignalSL(beSL, 'BREAKEVEN')
      persistLifecycle(activeSignal.id, 'BREAKEVEN', beSL)
      return
    }

    if (signalPhase === 'BREAKEVEN' && progressRatio >= 1.5) {
      const atr    = activeSignal.volatility?.atr1H ?? riskDist
      const trail  = atr * 0.5
      const newSL  = isBuy ? currentPrice - trail : currentPrice + trail
      const current = activeSignal.stopLoss
      if ((isBuy && newSL > current) || (!isBuy && newSL < current)) {
        updateSignalSL(newSL, 'TRAILING')
        persistLifecycle(activeSignal.id, 'TRAILING', newSL)
      }
      return
    }

    if (signalPhase === 'TRAILING') {
      const atr    = activeSignal.volatility?.atr1H ?? riskDist
      const trail  = atr * 0.5
      const newSL  = isBuy ? currentPrice - trail : currentPrice + trail
      const current = activeSignal.stopLoss
      if ((isBuy && newSL > current) || (!isBuy && newSL < current)) {
        updateSignalSL(newSL, 'TRAILING')
        persistLifecycle(activeSignal.id, 'TRAILING', newSL)
      }
    }
  }

  useEffect(() => {
    setConnectionStatus('connecting')

    const startPolling = () => {
      // Critical path: tick + signal fire immediately
      pollTick()
      pollSignal()
      syncSession()

      // Defer secondary polls to avoid network congestion on initial load
      deferTimers.current = [
        setTimeout(pollCorrelations,  600),
        setTimeout(pingPresence,     1200),
        setTimeout(pollNews,         2000),
        setTimeout(pollEvents,       3500),
      ]

      timers.current = [
        setInterval(pollTick,              TICK_INTERVAL_MS),
        setInterval(pollSignal,            SIGNAL_INTERVAL_MS),
        setInterval(checkSignalManagement, MGMT_INTERVAL_MS),
        setInterval(pollCorrelations,      CORR_INTERVAL_MS),
        setInterval(pollNews,              NEWS_INTERVAL_MS),
        setInterval(pollEvents,            EVENTS_INTERVAL_MS),
        setInterval(syncSession,           SESSION_INTERVAL_MS),
        setInterval(pingPresence,          PRESENCE_INTERVAL_MS),
      ]
    }

    const stopPolling = () => {
      timers.current.forEach(clearInterval)
      timers.current = []
      deferTimers.current.forEach(clearTimeout)
      deferTimers.current = []
    }

    // Pause all polling when the tab is hidden; resume on focus
    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling()
        setConnectionStatus('disconnected')
      } else {
        setConnectionStatus('connecting')
        startPolling()
      }
    }

    startPolling()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
      setConnectionStatus('disconnected')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
