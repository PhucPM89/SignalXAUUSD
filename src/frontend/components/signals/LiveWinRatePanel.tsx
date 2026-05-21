'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTradingStore } from '@/stores/tradingStore'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, RefreshCw, Zap } from 'lucide-react'

interface WinRateData {
  buy:  number
  sell: number
  favored: 'BUY' | 'SELL'
  favoredPct: number
  context: {
    session:          string
    regime:           string
    vix:              number
    dxyValue:         number
    dxyChange1H:      number
    isRiskOff:        boolean
    htfBullish:       boolean
    bosPresent:       boolean
    chochPresent:     boolean
    newsSentiment:    number
    geopoliticalRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME'
    updatedAt:        string
  }
}

const TIER_STYLE: Record<string, { bg: string; border: string; text: string; label: string }> = {
  ELITE:    { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-400', label: 'ELITE' },
  HIGH:     { bg: 'bg-blue-500/15',   border: 'border-blue-500/35',    text: 'text-blue-400',    label: 'HIGH' },
  MODERATE: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30',  text: 'text-yellow-400',  label: 'MOD' },
  LOW:      { bg: 'bg-zinc-800/60',   border: 'border-zinc-700/60',    text: 'text-zinc-500',    label: 'LOW' },
}

const GEO: Record<string, string> = {
  LOW:     'text-emerald-400',
  MEDIUM:  'text-yellow-400',
  HIGH:    'text-orange-400',
  EXTREME: 'text-red-400 animate-pulse',
}

export default function LiveWinRatePanel() {
  const { newsAlerts } = useTradingStore()
  const [data, setData]       = useState<WinRateData | null>(null)
  const [loading, setLoading] = useState(false)
  const prevHighCount = useRef(0)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/signals/winrate', { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } catch { /* non-fatal */ }
    finally   { setLoading(false) }
  }, [])

  useEffect(() => {
    loadData()
    const id = setInterval(loadData, 15_000)
    return () => clearInterval(id)
  }, [loadData])

  useEffect(() => {
    const highCount = newsAlerts.filter(n => ['High', 'Critical'].includes(n.impact)).length
    if (highCount > prevHighCount.current) loadData()
    prevHighCount.current = highCount
  }, [newsAlerts, loadData])

  if (!data) {
    return (
      <div className="bg-zinc-900/80 rounded-lg border border-zinc-800 p-3 animate-pulse space-y-2">
        <div className="h-2.5 w-24 bg-zinc-800 rounded" />
        <div className="h-5 bg-zinc-800 rounded-full" />
        <div className="h-[56px] bg-zinc-800 rounded-lg" />
        <div className="space-y-1.5">
          {[1,2,3,4].map(i => <div key={i} className="h-2 bg-zinc-800 rounded" />)}
        </div>
      </div>
    )
  }

  const { buy, sell, favored, favoredPct, context } = data
  const activeIsBuy = favored === 'BUY'
  const activePct = favoredPct

  return (
    <div className="bg-zinc-900/80 rounded-lg border border-zinc-800 p-3 space-y-2.5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap size={10} className="text-amber-400" />
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
            Directional Edge
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {loading && <RefreshCw size={9} className="text-zinc-600 animate-spin" />}
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>

      {/* Conviction bar — sums to 100% */}
      <div>
        <div className="flex items-center justify-between mb-1 text-[9px] font-bold">
          <div className="flex items-center gap-0.5 text-emerald-400">
            <TrendingUp size={8} />
            <span>BUY {buy}%</span>
          </div>
          <span className="text-zinc-600 text-[8px]">directional conviction</span>
          <div className="flex items-center gap-0.5 text-red-400">
            <span>SELL {sell}%</span>
            <TrendingDown size={8} />
          </div>
        </div>
        <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden flex">
          <div
            className="h-full bg-emerald-500 transition-all duration-700"
            style={{ width: `${buy}%` }}
          />
          <div
            className="h-full bg-red-500 flex-1 transition-all duration-700"
          />
        </div>
      </div>

      {/* Active direction win rate — large card */}
      <div className="rounded-lg border p-2.5 border-zinc-700 bg-zinc-900/70">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {activeIsBuy
              ? <TrendingUp  size={11} className="text-emerald-400" />
              : <TrendingDown size={11} className="text-red-400" />}
            <div>
              <p className={cn('text-[9px] font-bold tracking-widest', activeIsBuy ? 'text-emerald-400' : 'text-red-400')}>
                {activeIsBuy ? 'BUY' : 'SELL'} FAVORED
              </p>
              <p className="text-[8px] text-zinc-600">single B/S ratio</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[30px] font-mono font-black leading-none text-white">
              {activePct}<span className="text-[14px]">%</span>
            </p>
          </div>
        </div>
      </div>

      {/* Market context footer */}
      <div className="pt-1.5 border-t border-zinc-800/60 space-y-1">
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-zinc-600">{context.session} · {context.regime}</span>
          <span className="text-zinc-500 font-mono">VIX {context.vix.toFixed(1)}</span>
        </div>
        <div className="flex items-center justify-between text-[9px]">
          <div className="flex items-center gap-1">
            <span className="text-zinc-600">DXY</span>
            <span className={cn(
              'font-mono font-bold',
              context.dxyChange1H > 0.05 ? 'text-red-400' : context.dxyChange1H < -0.05 ? 'text-emerald-400' : 'text-zinc-500',
            )}>
              {context.dxyChange1H >= 0 ? '+' : ''}{context.dxyChange1H.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-zinc-600">Geo:</span>
            <span className={cn('font-bold', GEO[context.geopoliticalRisk])}>
              {context.geopoliticalRisk}
            </span>
          </div>
        </div>

        {Math.abs(context.newsSentiment) > 0.05 && (
          <div className={cn(
            'text-[9px] font-semibold text-center py-0.5 rounded',
            context.newsSentiment >  0.1 ? 'bg-emerald-500/10 text-emerald-400' :
            context.newsSentiment < -0.1 ? 'bg-red-500/10 text-red-400' : 'text-zinc-600',
          )}>
            {context.newsSentiment >  0.1 ? '▲ News: Bullish Gold' :
             context.newsSentiment < -0.1 ? '▼ News: Bearish Gold' : ''}
          </div>
        )}

        <p className="text-[8px] text-zinc-700 text-right">
          {new Date(context.updatedAt).toLocaleTimeString()}
        </p>
      </div>
    </div>
  )
}
