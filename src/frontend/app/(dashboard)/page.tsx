'use client'

import { useEffect, useState } from 'react'
import { useLiveData } from '@/hooks/useLiveData'
import { useTradingStore } from '@/stores/tradingStore'
import StatusBar from '@/components/layout/StatusBar'
import GoldChart from '@/components/charts/GoldChart'
import SignalCard from '@/components/signals/SignalCard'
import CorrelationPanel from '@/components/macro/CorrelationPanel'
import NewsPanel from '@/components/news/NewsPanel'
import SignalHistoryPanel from '@/components/signals/SignalHistoryPanel'
import { cn } from '@/lib/utils'
import type { Candle } from '@/types/trading'
import { Activity, BarChart2, Globe } from 'lucide-react'

type MobileTab = 'signal' | 'chart' | 'market'

export default function DashboardPage() {
  const { activeSignal, isConnected, hasHighImpactEventSoon, selectedTimeframe, lastSignalResult, signalPhase } = useTradingStore()
  const [candles, setCandles] = useState<Candle[]>([])
  const [expandedSignalId, setExpandedSignalId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<MobileTab>('chart')

  useLiveData()

  useEffect(() => { fetchCandles(selectedTimeframe) }, [selectedTimeframe])

  async function fetchCandles(timeframe: string) {
    try {
      const res = await fetch(`/api/market/candles?timeframe=${timeframe}&count=500`)
      if (res.ok) setCandles(await res.json() as Candle[])
    } catch { /* non-fatal */ }
  }

  const hasActiveSignal = activeSignal && activeSignal.direction !== 'NOTRADE'

  return (
    <div className="h-full bg-[#0a0a0f] text-white flex flex-col overflow-hidden">
      <StatusBar />

      {/* Main content — 3-column desktop / single-panel mobile */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* ── LEFT PANEL ── Signal + History ───────────────────────────────── */}
        <aside className={cn(
          'flex-col border-zinc-800 overflow-y-auto',
          'lg:w-[17rem] lg:flex-shrink-0 lg:border-r lg:flex',
          activeTab === 'signal' ? 'flex w-full' : 'hidden',
        )}>

          {/* Result banner — TP or SL hit */}
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

          {/* No-trade state */}
          {(!activeSignal || activeSignal.direction === 'NOTRADE') && (
            <div className="mx-3 mt-3 border border-zinc-800/60 rounded-lg px-3 py-4 text-center flex-shrink-0">
              <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-widest">No Trade</p>
              <p className="text-[10px] text-zinc-700 mt-1 leading-relaxed">
                {hasHighImpactEventSoon
                  ? 'High-impact event — standing aside'
                  : activeSignal?.reasoning?.htfBias || 'Scanning for setup…'}
              </p>
            </div>
          )}

          {/* Active signal + phase badge */}
          {activeSignal && activeSignal.direction !== 'NOTRADE' && (
            <div className="px-3 pt-3 flex-shrink-0">
              {/* Phase badge — inline above card */}
              <div className="flex items-center gap-1.5 mb-2">
                <span className={cn(
                  'text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border',
                  signalPhase === 'OPEN'      && 'text-sky-400/80   border-sky-400/20   bg-sky-400/5',
                  signalPhase === 'BREAKEVEN' && 'text-amber-400/80 border-amber-400/20 bg-amber-400/5',
                  signalPhase === 'TRAILING'  && 'text-emerald-400/80 border-emerald-400/20 bg-emerald-400/5',
                )}>
                  {signalPhase === 'OPEN' ? 'Open' : signalPhase === 'BREAKEVEN' ? 'Breakeven' : 'Trailing SL'}
                </span>
              </div>
              <SignalCard
                signal={activeSignal}
                expanded={expandedSignalId === activeSignal.id}
                onExpand={() => setExpandedSignalId(
                  expandedSignalId === activeSignal.id ? null : activeSignal.id
                )}
              />
            </div>
          )}

          {/* Signal history */}
          <div className="mt-3 border-t border-zinc-800/40 flex-shrink-0">
            <SignalHistoryPanel />
          </div>
        </aside>

        {/* ── CENTRE PANEL ── Chart ────────────────────────────────────────── */}
        <main className={cn(
          'flex-col min-w-0 min-h-0',
          'lg:flex lg:flex-1',
          activeTab === 'chart' ? 'flex flex-1' : 'hidden',
        )}>
          <GoldChart
            candles={candles}
            signal={activeSignal}
            className="flex-1"
          />
        </main>

        {/* ── RIGHT PANEL ── Macro + News ──────────────────────────────── */}
        <aside className={cn(
          'flex-col border-zinc-800',
          'lg:w-[17rem] lg:flex-shrink-0 lg:border-l lg:flex',
          activeTab === 'market' ? 'flex w-full overflow-y-auto' : 'hidden',
        )}>
          <div className="flex-shrink-0 border-b border-zinc-800/40 px-3 pt-3 pb-3">
            <CorrelationPanel />
          </div>
          <div className="lg:flex-1 lg:overflow-hidden min-h-64">
            <NewsPanel />
          </div>
        </aside>
      </div>

      {/* ── MOBILE BOTTOM NAV — hidden on desktop ──────────────────────── */}
      <nav className="lg:hidden flex-shrink-0 h-14 bg-zinc-900/95 border-t border-zinc-800 flex">
        <MobileTabBtn
          icon={<Activity size={18} />}
          label="Signal"
          active={activeTab === 'signal'}
          badge={!!hasActiveSignal}
          onClick={() => setActiveTab('signal')}
        />
        <MobileTabBtn
          icon={<BarChart2 size={18} />}
          label="Chart"
          active={activeTab === 'chart'}
          onClick={() => setActiveTab('chart')}
        />
        <MobileTabBtn
          icon={<Globe size={18} />}
          label="Market"
          active={activeTab === 'market'}
          onClick={() => setActiveTab('market')}
        />
      </nav>
    </div>
  )
}

function MobileTabBtn({ icon, label, active, onClick, badge }: {
  icon:    React.ReactNode
  label:   string
  active:  boolean
  onClick: () => void
  badge?:  boolean
}) {
  return (
    <button
      className={cn(
        'flex-1 relative flex flex-col items-center justify-center gap-0.5 h-full',
        'transition-colors active:opacity-70',
        active ? 'text-amber-400' : 'text-zinc-500',
      )}
      onClick={onClick}
    >
      {icon}
      <span className="text-[9px] font-bold uppercase tracking-widest">{label}</span>
      {badge && (
        <span className="absolute top-2 right-[calc(50%-14px)] w-1.5 h-1.5 bg-emerald-500 rounded-full" />
      )}
    </button>
  )
}
