'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTradingStore } from '@/stores/tradingStore'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, RefreshCw, Zap } from 'lucide-react'

interface WinFactor {
  key:        string
  label:      string
  description: string
  impact_pct: number
  positive:   boolean
}

interface WinRateResult {
  regime:            string
  regime_prior_pct:  number
  final_probability: number
  percentage:        number
  tier:             'ELITE' | 'HIGH' | 'MODERATE' | 'LOW'
  kelly_fraction:    number
  quarter_kelly_pct: number
  factors:           WinFactor[]
}

interface WinRateData {
  buy:  WinRateResult
  sell: WinRateResult
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

const TIER: Record<string, { bg: string; border: string; text: string; label: string }> = {
  ELITE:    { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-400', label: 'ELITE' },
  HIGH:     { bg: 'bg-blue-500/15',   border: 'border-blue-500/35',    text: 'text-blue-400',    label: 'HIGH' },
  MODERATE: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30',  text: 'text-yellow-400',  label: 'MODERATE' },
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

  // Initial load + 15 s refresh
  useEffect(() => {
    loadData()
    const id = setInterval(loadData, 15_000)
    return () => clearInterval(id)
  }, [loadData])

  // Immediate refresh when a new High/Critical news item arrives
  useEffect(() => {
    const highCount = newsAlerts.filter(n => ['High', 'Critical'].includes(n.impact)).length
    if (highCount > prevHighCount.current) loadData()
    prevHighCount.current = highCount
  }, [newsAlerts, loadData])

  if (!data) {
    return (
      <div className="bg-zinc-900/80 rounded-lg border border-zinc-800 p-3 animate-pulse space-y-2">
        <div className="h-2.5 w-20 bg-zinc-800 rounded" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-[72px] bg-zinc-800 rounded-lg" />
          <div className="h-[72px] bg-zinc-800 rounded-lg" />
        </div>
        <div className="space-y-1.5">
          {[1,2,3,4].map(i => <div key={i} className="h-2 bg-zinc-800 rounded" />)}
        </div>
      </div>
    )
  }

  const { buy, sell, context } = data

  // Memoized: only recompute when buy/sell factors actually change
  const topFactors = useMemo(() => {
    const all = [
      ...buy.factors.map(f => ({ ...f, dir: 'buy' })),
      ...sell.factors.map(f => ({ ...f, dir: 'sell' })),
    ]
    const map = new Map<string, typeof all[0]>()
    for (const f of all) {
      const prev = map.get(f.key)
      if (!prev || Math.abs(f.impact_pct) > Math.abs(prev.impact_pct)) map.set(f.key, f)
    }
    return [...map.values()]
      .sort((a, b) => Math.abs(b.impact_pct) - Math.abs(a.impact_pct))
      .slice(0, 5)
  }, [buy.factors, sell.factors])

  const buyTier  = TIER[buy.tier]  ?? TIER.LOW
  const sellTier = TIER[sell.tier] ?? TIER.LOW

  return (
    <div className="bg-zinc-900/80 rounded-lg border border-zinc-800 p-3 space-y-2.5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap size={10} className="text-amber-400" />
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
            Live Win Rate
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {loading && <RefreshCw size={9} className="text-zinc-600 animate-spin" />}
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>

      {/* BUY / SELL tiles */}
      <div className="grid grid-cols-2 gap-2">
        {/* BUY */}
        <div className={cn('rounded-lg border p-2.5 text-center', buyTier.bg, buyTier.border)}>
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <TrendingUp size={9} className="text-emerald-400" />
            <span className="text-[9px] font-bold text-emerald-400 tracking-widest">BUY</span>
          </div>
          <p className={cn('text-[28px] font-mono font-black leading-none', buyTier.text)}>
            {buy.percentage}<span className="text-[14px]">%</span>
          </p>
          <p className={cn('text-[8px] font-bold tracking-widest mt-0.5', buyTier.text)}>
            {buyTier.label}
          </p>
        </div>

        {/* SELL */}
        <div className={cn('rounded-lg border p-2.5 text-center', sellTier.bg, sellTier.border)}>
          <div className="flex items-center justify-center gap-1 mb-0.5">
            <TrendingDown size={9} className="text-red-400" />
            <span className="text-[9px] font-bold text-red-400 tracking-widest">SELL</span>
          </div>
          <p className={cn('text-[28px] font-mono font-black leading-none', sellTier.text)}>
            {sell.percentage}<span className="text-[14px]">%</span>
          </p>
          <p className={cn('text-[8px] font-bold tracking-widest mt-0.5', sellTier.text)}>
            {sellTier.label}
          </p>
        </div>
      </div>

      {/* Driving factors */}
      <div>
        <p className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1.5 font-bold">
          Key Factors
        </p>
        <div className="space-y-1">
          {topFactors.map(f => (
            <div key={f.key} className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 min-w-0">
                <span className={cn('text-[9px] font-black flex-shrink-0', f.positive ? 'text-emerald-400' : 'text-red-400')}>
                  {f.positive ? '+' : '−'}
                </span>
                <span className="text-[10px] text-zinc-400 truncate">{f.label}</span>
              </div>
              <span className={cn(
                'text-[10px] font-mono font-bold flex-shrink-0',
                f.positive ? 'text-emerald-400' : 'text-red-400'
              )}>
                {f.impact_pct > 0 ? '+' : ''}{f.impact_pct.toFixed(1)}%
              </span>
            </div>
          ))}
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
              context.dxyChange1H > 0.05 ? 'text-red-400' : context.dxyChange1H < -0.05 ? 'text-emerald-400' : 'text-zinc-500'
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

        {/* News sentiment */}
        {Math.abs(context.newsSentiment) > 0.05 && (
          <div className={cn(
            'text-[9px] font-semibold text-center py-0.5 rounded',
            context.newsSentiment >  0.1 ? 'bg-emerald-500/10 text-emerald-400' :
            context.newsSentiment < -0.1 ? 'bg-red-500/10 text-red-400' :
                                            'text-zinc-600'
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
