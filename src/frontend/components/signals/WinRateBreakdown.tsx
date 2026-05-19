'use client'

import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react'
import type { WinRate, WinRateFactor } from '@/types/trading'

// Re-export for consumers that imported the old local types
export type { WinRate as WinRateData, WinRateFactor as WinFactor }

interface Props {
  data: WinRate
}

const TIER_COLORS: Record<string, string> = {
  ELITE:    'text-emerald-400',
  HIGH:     'text-green-400',
  MODERATE: 'text-yellow-400',
  LOW:      'text-red-400',
}

const TIER_BAR: Record<string, string> = {
  ELITE:    'bg-emerald-500',
  HIGH:     'bg-green-500',
  MODERATE: 'bg-yellow-500',
  LOW:      'bg-red-500',
}

export function WinRateBreakdown({ data }: Props) {
  const { regime, regime_prior_pct, percentage, tier, quarter_kelly_pct, factors } = data

  const positiveFactors = factors.filter(f => f.positive)
  const negativeFactors = factors.filter(f => !f.positive)

  return (
    <div className="space-y-3">

      {/* ── Win probability header ───────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">Win Probability</div>
          <div className={`text-3xl font-black tabular-nums ${TIER_COLORS[tier]}`}>
            {percentage}<span className="text-xl">%</span>
          </div>
        </div>
        <div className="text-right">
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${TIER_COLORS[tier]} border border-current/30 bg-current/10`}>
            {tier}
          </span>
          <div className="text-[10px] text-zinc-500 mt-1">¼-Kelly: {quarter_kelly_pct.toFixed(1)}% equity</div>
        </div>
      </div>

      {/* ── Waterfall bar ────────────────────────────────────────────────── */}
      <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${TIER_BAR[tier]}`}
          style={{ width: `${percentage}%` }}
        />
        {/* Confidence threshold marker at 65% */}
        <div className="absolute inset-y-0 w-px bg-zinc-600" style={{ left: '65%' }} />
      </div>
      <div className="flex justify-between text-[10px] text-zinc-600">
        <span>0%</span>
        <span className="text-zinc-500">65% threshold</span>
        <span>100%</span>
      </div>

      {/* ── Bayesian breakdown ───────────────────────────────────────────── */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 space-y-1.5">
        <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
          Bayesian Attribution
        </div>

        {/* Regime prior row */}
        <FactorRow
          label={`${regime.replace('_', ' ')} regime prior`}
          value={`${regime_prior_pct}%`}
          delta={null}
          neutral
        />

        {/* Positive factors */}
        {positiveFactors.map(f => (
          <FactorRow
            key={f.key}
            label={f.label}
            value={`+${f.impact_pct.toFixed(1)}%`}
            delta="positive"
            tooltip={f.description}
          />
        ))}

        {/* Negative factors */}
        {negativeFactors.map(f => (
          <FactorRow
            key={f.key}
            label={f.label}
            value={`${f.impact_pct.toFixed(1)}%`}
            delta="negative"
            tooltip={f.description}
          />
        ))}

        {/* Divider + total */}
        <div className="border-t border-zinc-700/50 pt-1.5 mt-1 flex justify-between text-xs font-semibold">
          <span className="text-zinc-400">Final probability</span>
          <span className={TIER_COLORS[tier]}>{percentage}%</span>
        </div>
      </div>

      {/* ── Factor summary chips ─────────────────────────────────────────── */}
      {(positiveFactors.length > 0 || negativeFactors.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {positiveFactors.slice(0, 4).map(f => (
            <span key={f.key} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-900">
              ↑ {f.label}
            </span>
          ))}
          {negativeFactors.slice(0, 3).map(f => (
            <span key={f.key} className="text-[10px] px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-900">
              ↓ {f.label}
            </span>
          ))}
        </div>
      )}

    </div>
  )
}

// ── Internal row component ────────────────────────────────────────────────────

interface RowProps {
  label: string
  value: string
  delta: 'positive' | 'negative' | null
  neutral?: boolean
  tooltip?: string
}

function FactorRow({ label, value, delta, neutral, tooltip }: RowProps) {
  const valueColor = neutral
    ? 'text-zinc-400'
    : delta === 'positive'
    ? 'text-emerald-400'
    : 'text-red-400'

  const Icon = neutral ? Minus : delta === 'positive' ? TrendingUp : TrendingDown

  return (
    <div className="flex items-center justify-between group" title={tooltip}>
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 min-w-0">
        <Icon className={`w-3 h-3 shrink-0 ${valueColor}`} />
        <span className="truncate">{label}</span>
        {tooltip && (
          <Info className="w-2.5 h-2.5 shrink-0 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
        )}
      </div>
      <span className={`text-[11px] font-mono font-semibold ml-2 shrink-0 ${valueColor}`}>
        {value}
      </span>
    </div>
  )
}
