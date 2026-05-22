'use client'

import { useState, useEffect } from 'react'
import { useTradingStore } from '@/stores/tradingStore'
import SignalCard from '@/components/signals/SignalCard'
import GoldChart from '@/components/charts/GoldChart'
import { cn } from '@/lib/utils'
import type { Candle } from '@/types/trading'

export default function SignalPage() {
  const {
    activeSignal,
    signalPhase,
    lastSignalResult,
    hasHighImpactEventSoon,
    selectedTimeframe,
    currentRegime,
    currentSession,
    vix,
    dxyValue,
    us10YYield,
    isRiskOff,
  } = useTradingStore()

  const [expanded, setExpanded] = useState(false)
  const [candles, setCandles]   = useState<Candle[]>([])

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/market/candles?timeframe=${selectedTimeframe}&count=200`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : [])
      .then((data: Candle[]) => setCandles(data))
      .catch(() => {})
    return () => ctrl.abort()
  }, [selectedTimeframe])

  const hasActive = activeSignal && activeSignal.direction !== 'NOTRADE'

  return (
    <div className="h-full flex">

      {/* ── Left panel: Signal info ─────────────────────────────────── */}
      <div className={cn(
        'flex flex-col overflow-y-auto bg-[#0a0a0f]',
        'lg:w-72 lg:flex-shrink-0 lg:border-r lg:border-zinc-800/60',
        'w-full',
      )}>

        {/* Result banner */}
        {lastSignalResult && (
          <div className={cn(
            'mx-3 mt-3 rounded-lg border px-3 py-2 flex items-center justify-between flex-shrink-0',
            lastSignalResult.type === 'TP_HIT'
              ? 'bg-emerald-500/8 border-emerald-500/25'
              : 'bg-red-500/8 border-red-500/25',
          )}>
            <span className={cn(
              'text-[9px] font-bold uppercase tracking-widest',
              lastSignalResult.type === 'TP_HIT' ? 'text-emerald-400' : 'text-red-400',
            )}>
              {lastSignalResult.type === 'TP_HIT' ? 'Take Profit' : 'Stop Loss'}
            </span>
            <span className={cn(
              'text-sm font-mono font-black tabular-nums',
              lastSignalResult.type === 'TP_HIT' ? 'text-emerald-400' : 'text-red-400',
            )}>
              {lastSignalResult.pnl >= 0 ? '+' : ''}{lastSignalResult.pnl.toFixed(2)}
            </span>
          </div>
        )}

        {/* Signal area */}
        <div className="px-3 pt-3 flex-shrink-0">
          {hasActive ? (
            <div className="space-y-2">
              <PhaseChip phase={signalPhase} />
              <SignalCard
                signal={activeSignal}
                expanded={expanded}
                onExpand={() => setExpanded(e => !e)}
              />
            </div>
          ) : (
            <NoTradeCard
              reason={
                hasHighImpactEventSoon
                  ? 'High-impact event — standing aside'
                  : activeSignal?.reasoning?.htfBias || 'Scanning for setup…'
              }
              session={currentSession}
              regime={currentRegime}
            />
          )}
        </div>

        {/* Context footer */}
        <div className="mx-3 mt-3 mb-3 rounded-lg border border-zinc-800/50 p-3 space-y-2 flex-shrink-0">
          <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">Context</p>
          <div className="grid grid-cols-3 gap-2">
            <ContextCell
              label="VIX"
              value={vix > 0 ? vix.toFixed(1) : '—'}
              color={vix > 25 ? 'text-amber-400' : 'text-zinc-300'}
            />
            <ContextCell
              label="DXY"
              value={dxyValue > 0 ? dxyValue.toFixed(2) : '—'}
            />
            <ContextCell
              label="10Y"
              value={us10YYield > 0 ? `${us10YYield.toFixed(2)}%` : '—'}
              color={us10YYield > 4.5 ? 'text-red-400' : 'text-zinc-300'}
            />
          </div>
          {isRiskOff && (
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[9px] text-amber-400 font-semibold">Risk-off environment</span>
            </div>
          )}
        </div>

      </div>

      {/* ── Right: Chart (desktop only) ─────────────────────────────── */}
      <div className="hidden lg:flex lg:flex-1 min-w-0">
        <GoldChart candles={candles} signal={activeSignal} className="flex-1" />
      </div>

    </div>
  )
}

function PhaseChip({ phase }: { phase: 'OPEN' | 'BREAKEVEN' | 'TRAILING' }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn(
        'text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border',
        phase === 'OPEN'      && 'text-sky-400/80 border-sky-400/20 bg-sky-400/5',
        phase === 'BREAKEVEN' && 'text-amber-400/80 border-amber-400/20 bg-amber-400/5',
        phase === 'TRAILING'  && 'text-emerald-400/80 border-emerald-400/20 bg-emerald-400/5',
      )}>
        {phase === 'OPEN' ? 'Open' : phase === 'BREAKEVEN' ? 'Breakeven' : 'Trailing SL'}
      </span>
    </div>
  )
}

function NoTradeCard({
  reason,
  session,
  regime,
}: {
  reason:  string
  session: string | null
  regime:  string | null
}) {
  return (
    <div className="rounded-xl border border-zinc-800/60 p-5 text-center space-y-2">
      <div className="flex items-center justify-center gap-1.5 mb-3">
        <div className="h-px flex-1 bg-zinc-800/80" />
        <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">No Trade</span>
        <div className="h-px flex-1 bg-zinc-800/80" />
      </div>
      <p className="text-[11px] text-zinc-500 leading-relaxed">{reason}</p>
      {(session || regime) && (
        <p className="text-[10px] text-zinc-700">
          {[session, regime].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  )
}

function ContextCell({
  label,
  value,
  color = 'text-zinc-300',
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[8px] text-zinc-700 font-bold uppercase tracking-widest">{label}</p>
      <p className={cn('text-xs font-mono font-bold tabular-nums', color)}>{value}</p>
    </div>
  )
}
