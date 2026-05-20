'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTradingStore } from '@/stores/tradingStore'
import { REGIME_COLORS, formatGold } from '@/types/trading'
import { cn } from '@/lib/utils'
import { Wifi, WifiOff, AlertCircle } from 'lucide-react'

// Selective store subscriptions — component only re-renders when its own fields change
function useStatusBarStore() {
  const currentPrice      = useTradingStore(s => s.currentPrice)
  const bid               = useTradingStore(s => s.bid)
  const ask               = useTradingStore(s => s.ask)
  const spread            = useTradingStore(s => s.spread)
  const priceChange24H    = useTradingStore(s => s.priceChange24H)
  const priceChangePct    = useTradingStore(s => s.priceChangePct)
  const currentRegime     = useTradingStore(s => s.currentRegime)
  const currentSession    = useTradingStore(s => s.currentSession)
  const isConnected       = useTradingStore(s => s.isConnected)
  const connectionStatus  = useTradingStore(s => s.connectionStatus)
  const hasHighImpact     = useTradingStore(s => s.hasHighImpactEventSoon)
  const upcomingEvents    = useTradingStore(s => s.upcomingEvents)
  const lastTickAt        = useTradingStore(s => s.lastTickAt)
  const onlineUsers       = useTradingStore(s => s.onlineUsers)
  return { currentPrice, bid, ask, spread, priceChange24H, priceChangePct,
    currentRegime, currentSession, isConnected, connectionStatus,
    hasHighImpact, upcomingEvents, lastTickAt, onlineUsers }
}

// Live clock — starts at 0 (stable server/client hydration), updates after mount
function useNow() {
  const [now, setNow] = useState(0)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(id)
  }, [])
  return now
}

export default function StatusBar() {
  const {
    currentPrice, bid, ask, spread, priceChange24H, priceChangePct,
    currentRegime, currentSession, isConnected, connectionStatus,
    hasHighImpact, upcomingEvents, lastTickAt, onlineUsers,
  } = useStatusBarStore()

  const now = useNow()

  const nextEvent = useMemo(() =>
    upcomingEvents
      .filter(e => ['High', 'Critical'].includes(e.impact))
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0],
    [upcomingEvents]
  )

  const priceUp = priceChange24H >= 0
  const minsUntil = nextEvent
    ? Math.max(0, Math.round((new Date(nextEvent.scheduledAt).getTime() - now) / 60_000))
    : 0

  return (
    <div className="h-10 bg-zinc-900/95 border-b border-zinc-800 flex items-center px-4 gap-4 sm:gap-6 text-xs flex-shrink-0 z-50">

      {/* Connection indicator — always visible */}
      <div className={cn('flex items-center gap-1.5', isConnected ? 'text-emerald-400' : 'text-red-400')}>
        {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
        <span className="font-medium uppercase tracking-widest text-[10px]">
          {connectionStatus}
        </span>
      </div>

      <Divider />

      {/* XAUUSD live price — always visible */}
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="text-zinc-400 font-bold text-[10px] tracking-widest">XAUUSD</span>
        <span className="text-white font-mono font-bold text-sm">
          {currentPrice > 0 ? formatGold(currentPrice) : '—'}
        </span>
        {currentPrice > 0 && (
          <span className={cn('font-mono text-[11px]', priceUp ? 'text-emerald-400' : 'text-red-400')}>
            {priceUp ? '+' : ''}{formatGold(priceChange24H)} ({priceUp ? '+' : ''}{priceChangePct.toFixed(2)}%)
          </span>
        )}
      </div>

      {/* Secondary info — hidden on mobile, shown sm+ */}
      <div className="hidden sm:contents">
        {bid > 0 && (
          <>
            <Divider />
            <div className="flex gap-3 text-[10px]">
              <span className="text-zinc-500">B <span className="text-zinc-300 font-mono">{formatGold(bid)}</span></span>
              <span className="text-zinc-500">A <span className="text-zinc-300 font-mono">{formatGold(ask)}</span></span>
              <span className="text-zinc-500">Spd <span className="text-zinc-300 font-mono">{(spread / 0.01).toFixed(0)}</span></span>
            </div>
          </>
        )}
        <Divider />
        <div className="flex items-center gap-2 text-[10px]">
          {currentRegime && (
            <span className={cn('font-semibold', REGIME_COLORS[currentRegime])}>
              {currentRegime.toUpperCase()}
            </span>
          )}
          {currentSession && (
            <span className="text-zinc-500">{currentSession} Session</span>
          )}
        </div>
      </div>

      {/* High-impact event warning — always visible */}
      {hasHighImpact && nextEvent && (
        <>
          <Divider />
          <div className="flex items-center gap-1.5 text-amber-400 animate-pulse">
            <AlertCircle size={11} />
            <span className="text-[10px] font-bold uppercase">
              <span className="hidden sm:inline">{nextEvent.name} ({nextEvent.currency}) </span>
              <span className="sm:hidden">⚠ </span>
              in {minsUntil}m
            </span>
          </div>
        </>
      )}

      <div className="flex-1" />

      {/* Online users counter */}
      {onlineUsers > 0 && (
        <div className="flex items-center gap-1 text-[10px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-zinc-400 font-mono font-semibold">{onlineUsers}</span>
          <span className="hidden sm:inline text-zinc-600">online</span>
        </div>
      )}

      {/* Last tick — hidden on mobile */}
      {lastTickAt && (
        <>
          <div className="hidden sm:block"><Divider /></div>
          <span className="hidden sm:block text-zinc-600 text-[10px] font-mono">
            {new Date(lastTickAt).toLocaleTimeString('en-US', { hour12: false })} UTC
          </span>
        </>
      )}
    </div>
  )
}

function Divider() {
  return <div className="h-4 w-px bg-zinc-700" />
}
