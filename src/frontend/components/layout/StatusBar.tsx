'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTradingStore } from '@/stores/tradingStore'
import { REGIME_COLORS, formatGold } from '@/types/trading'
import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'

function useStatusBarStore() {
  const currentPrice   = useTradingStore(s => s.currentPrice)
  const priceChange24H = useTradingStore(s => s.priceChange24H)
  const priceChangePct = useTradingStore(s => s.priceChangePct)
  const currentRegime  = useTradingStore(s => s.currentRegime)
  const currentSession = useTradingStore(s => s.currentSession)
  const isConnected    = useTradingStore(s => s.isConnected)
  const hasHighImpact  = useTradingStore(s => s.hasHighImpactEventSoon)
  const upcomingEvents = useTradingStore(s => s.upcomingEvents)
  const onlineUsers    = useTradingStore(s => s.onlineUsers)
  return { currentPrice, priceChange24H, priceChangePct, currentRegime, currentSession,
    isConnected, hasHighImpact, upcomingEvents, onlineUsers }
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
    currentPrice, priceChange24H, priceChangePct,
    currentRegime, currentSession, isConnected,
    hasHighImpact, upcomingEvents, onlineUsers,
  } = useStatusBarStore()

  const now = useNow()

  const nextEvent = useMemo(() =>
    upcomingEvents
      .filter(e => ['High', 'Critical'].includes(e.impact))
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0],
    [upcomingEvents]
  )

  const priceUp   = priceChange24H >= 0
  const minsUntil = nextEvent
    ? Math.max(0, Math.round((new Date(nextEvent.scheduledAt).getTime() - now) / 60_000))
    : 0

  return (
    <header className="h-10 bg-[#0c0c12] border-b border-zinc-800/60 flex items-center px-4 gap-4 flex-shrink-0 z-50">

      {/* Wordmark */}
      <span className="text-[10px] font-black tracking-[0.18em] text-zinc-600 uppercase select-none hidden sm:block">
        XAU/USD
      </span>

      <div className="hidden sm:block w-px h-3.5 bg-zinc-800" />

      {/* Live price */}
      <div className="flex items-center gap-2.5">
        <span className={cn(
          'font-mono font-bold text-sm tabular-nums',
          currentPrice > 0 ? 'text-white' : 'text-zinc-600',
        )}>
          {currentPrice > 0 ? formatGold(currentPrice) : '———'}
        </span>
        {currentPrice > 0 && (
          <span className={cn(
            'font-mono text-[11px] tabular-nums',
            priceUp ? 'text-emerald-400' : 'text-red-400',
          )}>
            {priceUp ? '+' : ''}{priceChange24H.toFixed(2)}
            <span className="opacity-50 ml-1 text-[9px]">({priceUp ? '+' : ''}{priceChangePct.toFixed(2)}%)</span>
          </span>
        )}
      </div>

      {/* Session + regime */}
      {(currentSession || currentRegime) && (
        <div className="hidden sm:flex items-center gap-1 text-[10px]">
          <div className="w-px h-3 bg-zinc-800 mr-2" />
          {currentSession && <span className="text-zinc-500">{currentSession}</span>}
          {currentRegime && (
            <span className={cn('font-semibold', REGIME_COLORS[currentRegime])}>
              &middot; {currentRegime}
            </span>
          )}
        </div>
      )}

      {/* High-impact event */}
      {hasHighImpact && nextEvent && (
        <div className="hidden sm:flex items-center gap-1.5 text-amber-400">
          <div className="w-px h-3 bg-zinc-800" />
          <AlertCircle size={9} className="animate-pulse ml-1" />
          <span className="text-[10px] font-semibold truncate max-w-[180px]">
            {nextEvent.currency} {nextEvent.name.split(' ').slice(0, 3).join(' ')}
          </span>
          <span className="text-[10px] text-amber-400/60 font-mono">{minsUntil}m</span>
        </div>
      )}

      <div className="flex-1" />

      {/* Online + connection */}
      <div className="flex items-center gap-2">
        {onlineUsers > 0 && (
          <span className="text-zinc-500 font-mono text-[10px] tabular-nums">{onlineUsers} online</span>
        )}
        <span className={cn(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          isConnected ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'bg-red-500',
          isConnected && 'animate-pulse',
        )} />
      </div>
    </header>
  )
}
