'use client'

import { useTradingStore } from '@/stores/tradingStore'
import { cn } from '@/lib/utils'

export default function CorrelationPanel() {
  const { dxyValue, dxyChange, us10YYield, vix, isRiskOff } = useTradingStore()

  return (
    <div className="space-y-2.5">
      <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">Macro Context</p>
      <div className="grid grid-cols-3 gap-2">
        <MacroCell
          label="DXY"
          value={dxyValue.toFixed(2)}
          change={dxyChange}
          changeInverted  // DXY up = bad for gold
        />
        <MacroCell
          label="US10Y"
          value={`${us10YYield.toFixed(2)}%`}
          bullishForGold={us10YYield < 3.8}
          bearishForGold={us10YYield > 4.5}
        />
        <MacroCell
          label="VIX"
          value={vix.toFixed(1)}
          bullishForGold={vix > 25}
          bearishForGold={vix < 15}
        />
      </div>
      {isRiskOff && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/8 border border-amber-500/20 rounded-lg">
          <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          <span className="text-[9px] text-amber-400 font-bold tracking-wider">RISK-OFF · Safe-haven demand elevated</span>
        </div>
      )}
    </div>
  )
}

function MacroCell({
  label, value, change, changeInverted, bullishForGold, bearishForGold,
}: {
  label: string
  value: string
  change?: number
  changeInverted?: boolean
  bullishForGold?: boolean
  bearishForGold?: boolean
}) {
  // For change-based coloring (DXY): invert means DXY down = bullish gold
  const isUpChange   = (change ?? 0) > 0.005
  const isDownChange = (change ?? 0) < -0.005
  const effectiveBull = changeInverted ? isDownChange : (bullishForGold ?? false)
  const effectiveBear = changeInverted ? isUpChange  : (bearishForGold ?? false)

  const valueColor = effectiveBull ? 'text-emerald-400' : effectiveBear ? 'text-red-400' : 'text-zinc-300'
  const arrow = change !== undefined
    ? (Math.abs(change) > 0.005 ? (change > 0 ? '↑' : '↓') : '')
    : ''
  const arrowColor = changeInverted
    ? (change! > 0 ? 'text-red-400' : 'text-emerald-400')
    : (change! > 0 ? 'text-emerald-400' : 'text-red-400')

  return (
    <div className="bg-zinc-800/40 rounded-lg p-2.5">
      <p className="text-[9px] text-zinc-600 font-bold tracking-widest mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className={cn('font-mono font-bold text-xs tabular-nums', valueColor)}>{value}</span>
        {arrow && <span className={cn('text-[9px]', arrowColor)}>{arrow}</span>}
      </div>
    </div>
  )
}
