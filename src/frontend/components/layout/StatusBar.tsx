'use client'

import { useTradingStore } from '@/stores/tradingStore'
import { REGIME_COLORS, IMPACT_COLORS, formatGold } from '@/types/trading'
import { cn } from '@/lib/utils'
import { Wifi, WifiOff, AlertCircle, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

/**
 * Always-visible status bar — top of the dashboard.
 * Shows: connection status | live XAUUSD price | regime | session | event warnings
 */
export default function StatusBar() {
  const {
    currentPrice, bid, ask, spread,
    priceChange24H, priceChangePct,
    currentRegime, currentSession,
    isConnected, connectionStatus,
    hasHighImpactEventSoon, upcomingEvents,
    lastTickAt,
  } = useTradingStore()

  const priceUp = priceChange24H >= 0
  const nextEvent = upcomingEvents
    .filter(e => ['High', 'Critical'].includes(e.impact))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0]

  return (
    <div className="h-10 bg-zinc-900/95 border-b border-zinc-800 flex items-center px-4 gap-6 text-xs flex-shrink-0 z-50">

      {/* Connection indicator */}
      <div className={cn('flex items-center gap-1.5', isConnected ? 'text-emerald-400' : 'text-red-400')}>
        {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
        <span className="font-medium uppercase tracking-widest text-[10px]">
          {connectionStatus}
        </span>
      </div>

      <Divider />

      {/* XAUUSD live price */}
      <div className="flex items-center gap-3">
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

      {/* Regime + Session */}
      <div className="flex items-center gap-2 text-[10px]">
        {currentRegime && (
          <span className={cn('font-semibold', REGIME_COLORS[currentRegime])}>
            {currentRegime.toUpperCase()}
          </span>
        )}
        {currentSession && (
          <span className="text-zinc-500">
            {currentSession} Session
          </span>
        )}
      </div>

      {/* Upcoming high-impact event warning */}
      {hasHighImpactEventSoon && nextEvent && (
        <>
          <Divider />
          <div className="flex items-center gap-1.5 text-amber-400 animate-pulse">
            <AlertCircle size={11} />
            <span className="text-[10px] font-bold uppercase">
              {nextEvent.name} ({nextEvent.currency}) in{' '}
              {Math.max(0, Math.round((new Date(nextEvent.scheduledAt).getTime() - Date.now()) / 60_000))}m
            </span>
          </div>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Last tick time */}
      {lastTickAt && (
        <span className="text-zinc-600 text-[10px] font-mono">
          {new Date(lastTickAt).toLocaleTimeString('en-US', { hour12: false })} UTC
        </span>
      )}
    </div>
  )
}

function Divider() {
  return <div className="h-4 w-px bg-zinc-700" />
}
