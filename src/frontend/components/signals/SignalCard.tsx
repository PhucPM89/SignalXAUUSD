'use client'

import { useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { TrendingUp, TrendingDown, AlertTriangle, Shield, Clock, Target } from 'lucide-react'
import type { Signal } from '@/types/trading'
import { formatGold, REGIME_COLORS } from '@/types/trading'
import { cn } from '@/lib/utils'
import { WinRateBreakdown } from './WinRateBreakdown'

interface SignalCardProps {
  signal: Signal
  expanded?: boolean
  onExpand?: () => void
}

/**
 * Primary signal card — the centrepiece of the dashboard.
 * Displays the full institutional analysis for a XAUUSD signal.
 *
 * Visual hierarchy:
 *  1. Direction badge + confidence meter (instant read)
 *  2. Price levels: Entry / SL / TP / RR
 *  3. Reasoning accordion (click to expand)
 *  4. Macro correlations strip
 *  5. Risk warnings (if any)
 */
export default function SignalCard({ signal, expanded = false, onExpand }: SignalCardProps) {
  const isBuy = signal.direction === 'BUY'
  const directionColor = isBuy ? 'text-emerald-400' : 'text-red-400'
  const directionBg = isBuy ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'
  const directionGlow = isBuy ? 'shadow-emerald-500/10' : 'shadow-red-500/10'

  const age = useMemo(
    () => formatDistanceToNow(new Date(signal.generatedAt), { addSuffix: true }),
    [signal.generatedAt]
  )

  const slDollars = Math.abs(signal.entryPrice - signal.stopLoss).toFixed(2)
  const tpDollars = Math.abs(signal.takeProfit - signal.entryPrice).toFixed(2)
  const slPips = Math.abs(signal.entryPrice - signal.stopLoss) / 0.01
  const tpPips = Math.abs(signal.takeProfit - signal.entryPrice) / 0.01

  return (
    <div
      className={cn(
        'relative rounded-xl border bg-zinc-900/80 backdrop-blur-sm p-4',
        'shadow-xl transition-all duration-200 cursor-pointer',
        directionBg, directionGlow,
        expanded && 'shadow-2xl'
      )}
      onClick={onExpand}
    >
      {/* Institutional grade badge */}
      {signal.isInstitutionalGrade && (
        <div className="absolute top-3 right-3 flex items-center gap-1 text-amber-400 text-[10px] font-bold tracking-widest uppercase">
          <Shield size={10} />
          INSTITUTIONAL
        </div>
      )}

      {/* Header: Direction + Confidence */}
      <div className="flex items-start gap-3 mb-4">
        <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2', directionBg)}>
          {isBuy ? <TrendingUp size={18} className={directionColor} /> : <TrendingDown size={18} className={directionColor} />}
          <span className={cn('text-lg font-black tracking-widest', directionColor)}>
            {signal.direction}
          </span>
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-zinc-400 text-xs">Confidence</span>
            <span className={cn('text-sm font-bold', signal.confidenceScore >= 80 ? 'text-emerald-400' : 'text-amber-400')}>
              {signal.confidenceScore}%
            </span>
          </div>
          {/* Confidence bar */}
          <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', isBuy ? 'bg-emerald-500' : 'bg-red-500')}
              style={{ width: `${signal.confidenceScore}%` }}
            />
          </div>
          <div className="flex gap-2 mt-1">
            <span className={cn('text-[10px] capitalize', REGIME_COLORS[signal.regime])}>
              {signal.regime}
            </span>
            <span className="text-[10px] text-zinc-500">•</span>
            <span className="text-[10px] text-zinc-400">{signal.session}</span>
          </div>
        </div>
      </div>

      {/* Price levels grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <PriceLevel
          label="ENTRY"
          price={signal.entryPrice}
          color="text-white"
          sub={`Market`}
        />
        <PriceLevel
          label="STOP LOSS"
          price={signal.stopLoss}
          color="text-red-400"
          sub={`$${slDollars} (${slPips.toFixed(0)} pips)`}
        />
        <PriceLevel
          label="TAKE PROFIT"
          price={signal.takeProfit}
          color="text-emerald-400"
          sub={`$${tpDollars} (${tpPips.toFixed(0)} pips)`}
        />
      </div>

      {/* RR strip */}
      <div className="flex gap-4 mb-3 py-2 border-t border-zinc-800">
        <Stat label="Risk:Reward" value={`1:${signal.riskRewardRatio.toFixed(1)}`} />
        <Stat label="Expected Value" value={`${signal.expectedValue > 0 ? '+' : ''}${signal.expectedValue.toFixed(0)} pips`} />
        <Stat label="Strength" value={signal.strength} />
      </div>

      {/* Bayesian win-rate breakdown — the core analytical value */}
      {signal.winRate ? (
        <div className="mb-4">
          <WinRateBreakdown data={signal.winRate} />
        </div>
      ) : (
        <div className="flex gap-4 mb-4">
          <Stat label="Win Probability" value={`${(signal.winProbability * 100).toFixed(0)}%`} />
        </div>
      )}

      {/* Macro strip */}
      <div className="flex gap-3 text-[10px] mb-3 flex-wrap">
        <MacroBadge
          label="DXY"
          value={signal.correlations.dxyValue.toFixed(2)}
          change={signal.correlations.dxyChange1H}
          invertColor  // DXY up = bad for Gold
        />
        <MacroBadge
          label="US10Y"
          value={`${signal.correlations.us10YYield.toFixed(2)}%`}
          change={signal.correlations.us10YChange1H}
          invertColor  // Yields up = bad for Gold
        />
        <MacroBadge
          label="VIX"
          value={signal.correlations.vix.toFixed(1)}
          positiveColor={signal.correlations.vix > 25}
        />
        {signal.correlations.isRiskOff && (
          <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-400 rounded text-[10px] font-semibold">
            RISK-OFF
          </span>
        )}
      </div>

      {/* Reasoning (expanded) */}
      {expanded && (
        <div className="border-t border-zinc-800 pt-3 mt-1 space-y-3">
          <ReasoningBlock title="HTF Bias" content={signal.reasoning.htfBias} />
          <ReasoningBlock title="Liquidity" content={signal.reasoning.liquidityNarrative} />
          <ReasoningBlock title="Macro" content={signal.reasoning.macroContext} />
          {signal.reasoning.newsContext && (
            <ReasoningBlock title="News" content={signal.reasoning.newsContext} />
          )}
          <ReasoningBlock title="Entry" content={signal.reasoning.entryTrigger} />

          {signal.reasoning.bullishFactors.length > 0 && (
            <FactorList
              title="Bullish Factors"
              items={signal.reasoning.bullishFactors}
              color="text-emerald-400"
              dot="•"
            />
          )}
          {signal.reasoning.bearishFactors.length > 0 && (
            <FactorList
              title="Bearish Factors"
              items={signal.reasoning.bearishFactors}
              color="text-red-400"
              dot="•"
            />
          )}
          {signal.reasoning.riskWarnings.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-2">
              <div className="flex items-center gap-1 text-amber-400 text-[10px] font-bold mb-1">
                <AlertTriangle size={10} />
                RISK WARNINGS
              </div>
              {signal.reasoning.riskWarnings.map((w, i) => (
                <p key={i} className="text-amber-300/80 text-[11px]">{w}</p>
              ))}
            </div>
          )}
          {signal.reasoning.volatilityWarning && (
            <p className="text-orange-400/80 text-[11px] italic">{signal.reasoning.volatilityWarning}</p>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-800">
        <div className="flex items-center gap-1 text-zinc-500 text-[10px]">
          <Clock size={9} />
          {age}
        </div>
        <span className="text-[10px] text-zinc-600 font-mono">{signal.id.slice(0, 8)}</span>
      </div>
    </div>
  )
}

function PriceLevel({ label, price, color, sub }: { label: string; price: number; color: string; sub?: string }) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-2">
      <p className="text-[9px] text-zinc-500 font-bold tracking-widest uppercase mb-0.5">{label}</p>
      <p className={cn('text-sm font-mono font-bold', color)}>{formatGold(price)}</p>
      {sub && <p className="text-[10px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className="text-xs text-white font-semibold">{value}</p>
    </div>
  )
}

function MacroBadge({ label, value, change, invertColor = false, positiveColor }: {
  label: string; value: string; change?: number; invertColor?: boolean; positiveColor?: boolean
}) {
  const isPositive = change !== undefined ? (invertColor ? change < 0 : change > 0) : positiveColor
  const changeColor = isPositive ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="flex items-center gap-1 bg-zinc-800/60 rounded px-1.5 py-0.5">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300 font-mono">{value}</span>
      {change !== undefined && (
        <span className={cn('font-mono', changeColor)}>
          {change > 0 ? '↑' : '↓'}{Math.abs(change).toFixed(2)}
        </span>
      )}
    </div>
  )
}

function ReasoningBlock({ title, content }: { title: string; content: string }) {
  if (!content) return null
  return (
    <div>
      <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5">{title}</p>
      <p className="text-[11px] text-zinc-300 leading-relaxed">{content}</p>
    </div>
  )
}

function FactorList({ title, items, color, dot }: { title: string; items: string[]; color: string; dot: string }) {
  return (
    <div>
      <p className={cn('text-[9px] font-bold uppercase tracking-widest mb-1', color)}>{title}</p>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1 text-[11px] text-zinc-300">
            <span className={color}>{dot}</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
