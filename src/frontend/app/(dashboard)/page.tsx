'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLiveData } from '@/hooks/useLiveData'
import { useTradingStore } from '@/stores/tradingStore'
import StatusBar from '@/components/layout/StatusBar'
import GoldChart from '@/components/charts/GoldChart'
import SignalCard from '@/components/signals/SignalCard'
import CorrelationPanel from '@/components/macro/CorrelationPanel'
import NewsPanel from '@/components/news/NewsPanel'
import LiveWinRatePanel from '@/components/signals/LiveWinRatePanel'
import { SessionPanel } from '@/components/panels/SessionPanel'
import { VolatilityPanel } from '@/components/panels/VolatilityPanel'
import { cn } from '@/lib/utils'
import { calcAtr } from '@/lib/market-data'
import type { Candle, Volatility } from '@/types/trading'
import { Activity, BarChart2 } from 'lucide-react'

/**
 * XAUUSD Institutional Trading Dashboard
 *
 * Three-column layout optimised for 1920×1080 and 2560×1440:
 *  Left (280px)  : Signal panel + Risk calculator
 *  Centre (flex) : Gold chart (main view)
 *  Right (320px) : Correlations + News + Economic calendar
 *
 * All panels receive live data via Zustand subscriptions.
 * No prop drilling — state flows: SignalR → store → components.
 */
export default function DashboardPage() {
  const { activeSignal, signalHistory, isConnected, hasHighImpactEventSoon, selectedTimeframe } = useTradingStore()
  const [candles, setCandles] = useState<Candle[]>([])
  const [expandedSignalId, setExpandedSignalId] = useState<string | null>(null)

  useLiveData()

  useEffect(() => {
    fetchCandles(selectedTimeframe)
  }, [selectedTimeframe])

  async function fetchCandles(timeframe: string) {
    try {
      const res = await fetch(`/api/market/candles?timeframe=${timeframe}&count=500`)
      if (res.ok) {
        const data: Candle[] = await res.json()
        setCandles(data)
      }
    } catch {
      // non-fatal — chart renders with empty state
    }
  }

  // Compute basic volatility from candles so VolatilityPanel shows data
  // even during Tokyo/Sydney sessions when the signal engine is suppressed
  const basicVolatility = useMemo<Volatility | undefined>(() => {
    if (candles.length < 20) return undefined
    const atr1H = calcAtr(candles.slice(-50))
    const atr4H = calcAtr(candles.slice(-14)) * 2.2  // H4 ≈ H1 ATR × 2.2
    const prices = candles.slice(-20).map(c => c.close)
    const high20 = Math.max(...prices)
    const low20  = Math.min(...prices)
    const adrPct = ((high20 - low20) / low20) * 100
    const recent5  = calcAtr(candles.slice(-5))
    const recent20 = calcAtr(candles.slice(-20))
    return {
      atr1H,
      atr4H,
      adrPercent:    adrPct,
      isExpanding:   recent5 > recent20 * 1.15,
      isContracting: recent5 < recent20 * 0.85,
      regime:        recent5 > recent20 * 1.15 ? 'Expanding' : recent5 < recent20 * 0.85 ? 'Contracting' : 'Normal',
    }
  }, [candles])

  const displayedHistory = signalHistory.slice(0, 8)

  return (
    <div className="h-screen bg-[#0a0a0f] text-white flex flex-col overflow-hidden">
      {/* Top status bar */}
      <StatusBar />

      {/* Main content area */}
      <div className="flex-1 flex min-h-0">

        {/* ── LEFT PANEL ── Signal + Risk ──────────────────────────────────── */}
        <aside className="w-72 flex-shrink-0 flex flex-col border-r border-zinc-800 overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
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

          {/* No-trade state */}
          {(!activeSignal || activeSignal.direction === 'NOTRADE') && (
            <div className="mx-3 mt-3 bg-zinc-800/40 border border-zinc-700/50 rounded-lg p-4 text-center">
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
            <div className="px-3 pt-3">
              <SignalCard
                signal={activeSignal}
                expanded={expandedSignalId === activeSignal.id}
                onExpand={() => setExpandedSignalId(
                  expandedSignalId === activeSignal.id ? null : activeSignal.id
                )}
              />
            </div>
          )}

          {/* Live win rate */}
          <div className="px-3 py-3">
            <LiveWinRatePanel />
          </div>

          {/* Signal history */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {displayedHistory.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 mb-2 pt-1">
                  <BarChart2 size={10} className="text-zinc-500" />
                  <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">
                    Recent Signals
                  </span>
                </div>
                <div className="space-y-1.5">
                  {displayedHistory.map((sig) => (
                    <div
                      key={sig.id}
                      className="flex items-center justify-between py-1.5 px-2 bg-zinc-800/30 rounded text-[10px] hover:bg-zinc-800/50 cursor-pointer"
                      onClick={() => setExpandedSignalId(sig.id === expandedSignalId ? null : sig.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'font-bold',
                          sig.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {sig.direction}
                        </span>
                        <span className="text-zinc-400 font-mono">{sig.entryPrice.toFixed(2)}</span>
                      </div>
                      <span className="text-zinc-500">{sig.confidenceScore}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>

        {/* ── CENTRE PANEL ── Chart ────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0">
          <GoldChart
            candles={candles}
            signal={activeSignal}
            className="flex-1"
          />
        </main>

        {/* ── RIGHT PANEL ── Macro + Session + Volatility + News ───────── */}
        <aside className="w-80 flex-shrink-0 flex flex-col border-l border-zinc-800 overflow-hidden">
          {/* Correlation — always visible, pinned at top */}
          <div className="flex-shrink-0 border-b border-zinc-800 p-3">
            <CorrelationPanel />
          </div>
          {/* Session + Volatility — scrollable, capped so News always has room */}
          <div className="flex-shrink-0 overflow-y-auto border-b border-zinc-800 max-h-[36%] no-scrollbar">
            <div className="p-3 space-y-3">
              <SessionPanel />
              <VolatilityPanel volatility={activeSignal?.volatility ?? basicVolatility} />
            </div>
          </div>
          {/* News fills remaining height */}
          <div className="flex-1 overflow-hidden">
            <NewsPanel />
          </div>
        </aside>
      </div>
    </div>
  )
}
