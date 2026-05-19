'use client'

import { Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { Volatility } from '@/types/trading'

interface Props {
  volatility?: Volatility
}

const REGIME_CONFIG = {
  expanding: { label: 'Expanding',   color: 'text-amber-400',  bar: 'bg-amber-500',  Icon: TrendingUp   },
  contracting:{ label: 'Contracting',color: 'text-blue-400',   bar: 'bg-blue-500',   Icon: TrendingDown },
  normal:    { label: 'Normal',      color: 'text-zinc-300',   bar: 'bg-zinc-500',   Icon: Minus        },
}

function resolveRegimeKey(v: Volatility): keyof typeof REGIME_CONFIG {
  if (v.isExpanding)   return 'expanding'
  if (v.isContracting) return 'contracting'
  return 'normal'
}

export function VolatilityPanel({ volatility }: Props) {
  if (!volatility) return <VolatilitySkeleton />

  const key     = resolveRegimeKey(volatility)
  const cfg     = REGIME_CONFIG[key]
  const { Icon } = cfg

  // atr_ratio proxy: atr1H / 10 (Gold H1 ATR baseline $10)
  const atrRatio = volatility.atr1H / 10
  const atrPips  = volatility.atr1H / 0.01   // pips
  const adrPips  = (volatility.adrPercent / 100) * 2000 * 100  // rough

  // ATR bar fill: ratio 0.5–2.0 → 0–100%
  const barFill  = Math.min(100, Math.max(0, ((atrRatio - 0.5) / 1.5) * 100))

  return (
    <div className="bg-zinc-900/80 rounded-lg border border-zinc-800 p-3 space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-zinc-500" />
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Volatility</span>
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-semibold ${cfg.color}`}>
          <Icon className="w-3 h-3" />
          {cfg.label}
        </div>
      </div>

      {/* ATR ratio bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[9px] text-zinc-700">
          <span>Low ATR</span>
          <span className="text-zinc-500">{atrRatio.toFixed(2)}× baseline</span>
          <span>High ATR</span>
        </div>
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
            style={{ width: `${barFill}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="ATR H1"  value={`${atrPips.toFixed(0)} pips`} sub={`$${volatility.atr1H.toFixed(2)}`} />
        <Stat label="ATR H4"  value={`${(volatility.atr4H / 0.01).toFixed(0)} pips`} sub={`$${volatility.atr4H.toFixed(2)}`} />
        <Stat label="ADR"     value={`${volatility.adrPercent.toFixed(2)}%`} />
        <Stat label="Regime"  value={volatility.regime || cfg.label} />
      </div>

      {/* Warnings */}
      {atrRatio < 0.5 && (
        <p className="text-[9px] text-blue-400 bg-blue-950/40 border border-blue-900/30 rounded px-2 py-1">
          Low ATR — false breakout risk elevated
        </p>
      )}
      {atrRatio > 1.8 && (
        <p className="text-[9px] text-amber-400 bg-amber-950/40 border border-amber-900/30 rounded px-2 py-1">
          Elevated ATR — widen SL vs normal
        </p>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-800/50 rounded px-2 py-1.5">
      <div className="text-[9px] text-zinc-600 uppercase tracking-wide">{label}</div>
      <div className="text-xs font-mono font-semibold text-zinc-200">{value}</div>
      {sub && <div className="text-[9px] text-zinc-600 font-mono">{sub}</div>}
    </div>
  )
}

function VolatilitySkeleton() {
  return (
    <div className="bg-zinc-900/80 rounded-lg border border-zinc-800 p-3 space-y-3 animate-pulse">
      <div className="h-3 w-20 bg-zinc-800 rounded" />
      <div className="h-1.5 bg-zinc-800 rounded-full" />
      <div className="grid grid-cols-2 gap-1.5">
        {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-zinc-800 rounded" />)}
      </div>
    </div>
  )
}
