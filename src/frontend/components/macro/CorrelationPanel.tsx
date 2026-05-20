'use client'

import { useTradingStore } from '@/stores/tradingStore'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

/**
 * XAUUSD Correlation Panel
 *
 * Gold has specific, well-documented inverse relationships:
 *  - DXY ↑ → Gold ↓  (Dollar strength reduces Gold attractiveness)
 *  - US10Y ↑ → Gold ↓  (Higher real yields increase opportunity cost of holding Gold)
 *  - VIX ↑ → Gold ↑  (Fear/risk-off increases safe-haven demand)
 *  - SPX ↑ → Gold ↓  (Risk-on reduces safe-haven demand)
 *
 * Color coding follows Gold's directional implication, not the raw change.
 */
export default function CorrelationPanel() {
  const { dxyValue, dxyChange, us10YYield, vix, isRiskOff } = useTradingStore()

  return (
    <div className="bg-zinc-900/80 rounded-lg border border-zinc-800 p-3">
      <h3 className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-3">
        Macro Correlations — Gold Impact
      </h3>

      <div className="space-y-2">
        <CorrelationRow
          label="DXY"
          sublabel="US Dollar Index"
          value={dxyValue.toFixed(3)}
          change={dxyChange}
          changeLabel={dxyChange >= 0 ? `+${dxyChange.toFixed(3)}` : dxyChange.toFixed(3)}
          goldImpact={dxyChange > 0.1 ? 'bearish' : dxyChange < -0.1 ? 'bullish' : 'neutral'}
          goldImpactLabel={dxyChange > 0.1 ? 'Bearish Gold' : dxyChange < -0.1 ? 'Bullish Gold' : 'Neutral'}
        />

        <CorrelationRow
          label="US10Y"
          sublabel="10-Year Treasury Yield"
          value={`${us10YYield.toFixed(3)}%`}
          change={0}
          changeLabel=""
          goldImpact={us10YYield > 4.5 ? 'bearish' : us10YYield < 3.5 ? 'bullish' : 'neutral'}
          goldImpactLabel={us10YYield > 4.5 ? 'Yield Headwind' : us10YYield < 3.5 ? 'Yield Tailwind' : 'Neutral'}
        />

        <CorrelationRow
          label="VIX"
          sublabel="Volatility Index"
          value={vix.toFixed(1)}
          change={0}
          changeLabel=""
          goldImpact={vix > 25 ? 'bullish' : vix < 15 ? 'bearish' : 'neutral'}
          goldImpactLabel={vix > 25 ? 'Risk-Off → Gold ↑' : vix < 15 ? 'Risk-On → Gold ↓' : 'Normal'}
        />
      </div>

      {/* Risk sentiment summary */}
      <div className={cn(
        'mt-3 rounded-lg px-3 py-2 text-[11px] font-semibold text-center',
        isRiskOff
          ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
          : 'bg-zinc-800/60 border border-zinc-700 text-zinc-400'
      )}>
        {isRiskOff ? '⚠ RISK-OFF ENVIRONMENT — Safe-Haven Demand Elevated' : 'Risk-On / Neutral Environment'}
      </div>
    </div>
  )
}

type GoldImpact = 'bullish' | 'bearish' | 'neutral'

function CorrelationRow({
  label, sublabel, value, change, changeLabel,
  goldImpact, goldImpactLabel
}: {
  label: string
  sublabel: string
  value: string
  change: number
  changeLabel: string
  goldImpact: GoldImpact
  goldImpactLabel: string
}) {
  const impactColor: Record<GoldImpact, string> = {
    bullish: 'text-emerald-400',
    bearish: 'text-red-400',
    neutral: 'text-zinc-400',
  }

  const Icon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-800/60 last:border-0">
      <div>
        <span className="text-white text-xs font-semibold">{label}</span>
        <span className="text-zinc-500 text-[10px] ml-1.5">{sublabel}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-zinc-300 font-mono">{value}</span>
          {changeLabel && (
            <span className={cn(
              'font-mono',
              change > 0 ? 'text-emerald-400' : change < 0 ? 'text-red-400' : 'text-zinc-400'
            )}>
              {changeLabel}
            </span>
          )}
        </div>
        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-800', impactColor[goldImpact])}>
          {goldImpactLabel}
        </span>
      </div>
    </div>
  )
}
