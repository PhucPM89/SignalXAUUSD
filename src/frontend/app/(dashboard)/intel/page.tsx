'use client'

import { useTradingStore } from '@/stores/tradingStore'
import { cn } from '@/lib/utils'
import NewsPanel from '@/components/news/NewsPanel'
import { SessionPanel } from '@/components/panels/SessionPanel'

export default function IntelPage() {
  const {
    dxyValue,
    dxyChange,
    us10YYield,
    vix,
    isRiskOff,
  } = useTradingStore()

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden">

      {/* Left: Macro */}
      <div className="lg:w-72 lg:flex-shrink-0 lg:border-r border-zinc-800/60 overflow-y-auto p-4 space-y-4">

        <section>
          <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mb-3">Macro Context</p>
          <div className="space-y-2">
            <MacroRow
              label="DXY"
              sublabel="US Dollar Index"
              value={dxyValue > 0 ? dxyValue.toFixed(3) : '—'}
              change={dxyChange}
              goldImpact={dxyChange > 0.1 ? 'bearish' : dxyChange < -0.1 ? 'bullish' : 'neutral'}
            />
            <MacroRow
              label="US 10Y"
              sublabel="Treasury Yield"
              value={us10YYield > 0 ? `${us10YYield.toFixed(3)}%` : '—'}
              goldImpact={us10YYield > 4.5 ? 'bearish' : us10YYield < 3.5 ? 'bullish' : 'neutral'}
            />
            <MacroRow
              label="VIX"
              sublabel="Volatility Index"
              value={vix > 0 ? vix.toFixed(1) : '—'}
              goldImpact={vix > 25 ? 'bullish' : vix < 15 ? 'bearish' : 'neutral'}
            />
          </div>
        </section>

        {isRiskOff && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
            <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1">
              Risk-Off Environment
            </p>
            <p className="text-[10px] text-amber-300/60">
              Safe-haven demand for gold is elevated. Macro conditions support long positions.
            </p>
          </div>
        )}

        <SessionPanel />

      </div>

      {/* Right: News */}
      <div className="flex-1 min-h-0 overflow-hidden border-t lg:border-t-0 border-zinc-800/60">
        <NewsPanel />
      </div>

    </div>
  )
}

function MacroRow({
  label,
  sublabel,
  value,
  change,
  goldImpact,
}: {
  label:      string
  sublabel:   string
  value:      string
  change?:    number
  goldImpact: 'bullish' | 'bearish' | 'neutral'
}) {
  const impactColor =
    goldImpact === 'bullish' ? 'text-emerald-400' :
    goldImpact === 'bearish' ? 'text-red-400' :
    'text-zinc-500'

  const impactLabel =
    goldImpact === 'bullish' ? '↑ Gold' :
    goldImpact === 'bearish' ? '↓ Gold' :
    'Neutral'

  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
      <div>
        <p className="text-xs font-semibold text-zinc-200">{label}</p>
        <p className="text-[9px] text-zinc-600">{sublabel}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-xs font-mono font-bold text-zinc-200 tabular-nums">{value}</p>
          {change !== undefined && Math.abs(change) > 0.005 && (
            <p className="text-[9px] font-mono text-zinc-400">
              {change > 0 ? '+' : ''}{change.toFixed(3)}
            </p>
          )}
        </div>
        <span className={cn('text-[9px] font-bold w-12 text-right', impactColor)}>
          {impactLabel}
        </span>
      </div>
    </div>
  )
}
