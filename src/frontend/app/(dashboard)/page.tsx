'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLiveData } from '@/hooks/useLiveData'
import { useTradingStore } from '@/stores/tradingStore'
import StatusBar from '@/components/layout/StatusBar'
import GoldChart from '@/components/charts/GoldChart'
import SignalCard from '@/components/signals/SignalCard'
import CorrelationPanel from '@/components/macro/CorrelationPanel'
import NewsPanel from '@/components/news/NewsPanel'
import SignalHistoryPanel from '@/components/signals/SignalHistoryPanel'
import { SessionPanel } from '@/components/panels/SessionPanel'
import { VolatilityPanel } from '@/components/panels/VolatilityPanel'
import { cn } from '@/lib/utils'
import { calcAtr } from '@/lib/market-data'
import type { Candle, Volatility } from '@/types/trading'
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

  const basicVolatility = useMemo<Volatility | undefined>(() => {
    if (candles.length < 20) return undefined
    const atr1H = calcAtr(candles.slice(-50))
    const atr4H = calcAtr(candles.slice(-14)) * 2.2
    const prices = candles.slice(-20).map(c => c.close)
    const high20 = Math.max(...prices)
    const low20  = Math.min(...prices)
    const adrPct = ((high20 - low20) / low20) * 100
    const recent5  = calcAtr(candles.slice(-5))
    const recent20 = calcAtr(candles.slice(-20))
    return {
      atr1H, atr4H,
      adrPercent:    adrPct,
      isExpanding:   recent5 > recent20 * 1.15,
      isContracting: recent5 < recent20 * 0.85,
      regime:        recent5 > recent20 * 1.15 ? 'Expanding' : recent5 < recent20 * 0.85 ? 'Contracting' : 'Normal',
    }
  }, [candles])

  const hasActiveSignal = activeSignal && activeSignal.direction !== 'NOTRADE'

  return (
    <div className="h-full bg-[#0a0a0f] text-white flex flex-col overflow-hidden">
      <StatusBar />

      {/* Main content — 3-column desktop / single-panel mobile */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* ── LEFT PANEL ── Signal + Win Rate ──────────────────────────────── */}
        <aside className={cn(
          'flex-col border-zinc-800 overflow-y-auto',
          // Desktop: always visible, fixed width
          'lg:w-72 lg:flex-shrink-0 lg:border-r lg:flex lg:overflow-hidden lg:overflow-y-auto',
          // Mobile: full panel, scrollable, shown only on signal tab
          activeTab === 'signal' ? 'flex w-full' : 'hidden',
        )}>
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <Activity size={12} className="text-amber-400" />
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                Signal Engine
              </span>
            </div>
            <div className={cn(
              'h-2 w-2 rounded-full',
              isConnected ? 'bg-emerald-500 shadow-emerald-500/50 shadow' : 'bg-red-500'
            )} />
          </div>

          {/* TP / SL result banner */}
          {lastSignalResult && (
            <div className={cn(
              'mx-3 mt-3 rounded-lg border p-3 text-center flex-shrink-0',
              lastSignalResult.type === 'TP_HIT'
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-red-500/10 border-red-500/30'
            )}>
              <p className={cn(
                'text-xs font-bold uppercase tracking-widest',
                lastSignalResult.type === 'TP_HIT' ? 'text-emerald-400' : 'text-red-400'
              )}>
                {lastSignalResult.type === 'TP_HIT' ? '✓ Take Profit Hit' : '✗ Stop Loss Hit'}
              </p>
              <p className={cn(
                'text-lg font-mono font-black mt-0.5',
                lastSignalResult.type === 'TP_HIT' ? 'text-emerald-400' : 'text-red-400'
              )}>
                {lastSignalResult.pnl >= 0 ? '+' : ''}{lastSignalResult.pnl.toFixed(2)}
              </p>
            </div>
          )}

          {/* No-trade state */}
          {(!activeSignal || activeSignal.direction === 'NOTRADE') && (
            <div className="mx-3 mt-3 bg-zinc-800/40 border border-zinc-700/50 rounded-lg p-4 text-center flex-shrink-0">
              <div className="text-2xl mb-1">—</div>
              <p className="text-[11px] text-zinc-400 font-semibold">NO TRADE</p>
              <p className="text-[10px] text-zinc-600 mt-1">
                {hasHighImpactEventSoon
                  ? 'High-impact event imminent — standing aside'
                  : activeSignal?.reasoning?.htfBias
                    || 'Waiting for institutional-grade setup'}
              </p>
            </div>
          )}

          {/* Active BUY / SELL signal */}
          {activeSignal && activeSignal.direction !== 'NOTRADE' && (
            <div className="px-3 pt-3 flex-shrink-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className={cn(
                  'text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border',
                  signalPhase === 'OPEN'      && 'text-sky-400 border-sky-400/40 bg-sky-400/10',
                  signalPhase === 'BREAKEVEN' && 'text-amber-400 border-amber-400/40 bg-amber-400/10',
                  signalPhase === 'TRAILING'  && 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
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

          {/* Signal history — Firebase-backed, paginated */}
          <div className="border-t border-zinc-800/60 flex-shrink-0">
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

        {/* ── RIGHT PANEL ── Macro + Session + Volatility + News ───────── */}
        <aside className={cn(
          'flex-col border-zinc-800 overflow-hidden',
          // Desktop: always visible, fixed width
          'lg:w-80 lg:flex-shrink-0 lg:border-l lg:flex',
          // Mobile: full panel, scrollable, shown only on market tab
          activeTab === 'market' ? 'flex w-full overflow-y-auto' : 'hidden',
        )}>
          {/* Correlations */}
          <div className="flex-shrink-0 border-b border-zinc-800 p-3">
            <CorrelationPanel />
          </div>
          {/* Session + Volatility — capped on desktop so News always shows; natural on mobile */}
          <div className="flex-shrink-0 overflow-y-auto border-b border-zinc-800 lg:max-h-[36%] no-scrollbar">
            <div className="p-3 space-y-3">
              <SessionPanel />
              <VolatilityPanel volatility={activeSignal?.volatility ?? basicVolatility} />
            </div>
          </div>
          {/* News — fills remaining height on desktop, natural height on mobile */}
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
