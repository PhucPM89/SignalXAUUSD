'use client'

import React, { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, AlertTriangle, Timer } from 'lucide-react'
import type { Signal } from '@/types/trading'
import { formatGold } from '@/types/trading'
import { cn } from '@/lib/utils'

interface SignalCardProps {
  signal:    Signal
  expanded?: boolean
  onExpand?: () => void
}

function useCountdown(expiresAt: string) {
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    const target = new Date(expiresAt).getTime()
    const tick = () => setRemaining(Math.max(0, target - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  if (remaining <= 0) return { display: 'EXPIRED', expired: true }
  const h = Math.floor(remaining / 3_600_000)
  const m = Math.floor((remaining % 3_600_000) / 60_000)
  const s = Math.floor((remaining % 60_000) / 1000)
  return {
    display: h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
    expired: false,
  }
}

export default function SignalCard({ signal, expanded = false, onExpand }: SignalCardProps) {
  const isBuy         = signal.direction === 'BUY'
  const dirColor      = isBuy ? 'text-emerald-400'                  : 'text-red-400'
  const dirBorder     = isBuy ? 'border-emerald-500/25'             : 'border-red-500/25'
  const dirBarColor   = isBuy ? 'bg-emerald-500'                    : 'bg-red-500'
  const confColor     = signal.confidenceScore >= 80 ? 'text-emerald-400' : 'text-amber-400'

  const countdown = useCountdown(signal.expiresAt)

  const slDist  = Math.abs(signal.entryPrice - signal.stopLoss)
  const tpDist  = Math.abs(signal.takeProfit - signal.entryPrice)

  return (
    <div
      className={cn(
        'rounded-xl border bg-zinc-900/80 p-3 cursor-pointer transition-colors duration-150',
        'hover:bg-zinc-900',
        dirBorder,
      )}
      onClick={onExpand}
    >
      {/* ── Direction + Confidence ─────────────────────────────── */}
      <div className="flex items-center gap-3 mb-3">

        {/* Direction pill */}
        <div className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border flex-shrink-0',
          isBuy
            ? 'bg-emerald-500/10 border-emerald-500/25'
            : 'bg-red-500/10 border-red-500/25',
        )}>
          {isBuy
            ? <TrendingUp  size={13} className="text-emerald-400" />
            : <TrendingDown size={13} className="text-red-400" />}
          <span className={cn('font-black text-sm tracking-widest leading-none', dirColor)}>
            {signal.direction}
          </span>
        </div>

        {/* Confidence bar + value */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-zinc-600 uppercase tracking-widest">Confidence</span>
            <span className={cn('text-xs font-mono font-bold tabular-nums', confColor)}>
              {signal.confidenceScore}%
            </span>
          </div>
          <div className="h-[3px] bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-700', dirBarColor)}
              style={{ width: `${signal.confidenceScore}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Price levels ───────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">

        {/* Entry */}
        <div className="bg-zinc-800/40 rounded-lg p-2">
          <p className="text-[9px] text-zinc-600 font-bold tracking-widest uppercase mb-1">Entry</p>
          <p className="text-[13px] font-mono font-bold text-white tabular-nums leading-none">
            {formatGold(signal.entryPrice)}
          </p>
          <div className={cn(
            'flex items-center gap-0.5 mt-1 text-[9px] font-mono font-bold tabular-nums',
            countdown.expired ? 'text-zinc-600' : 'text-amber-400',
          )}>
            <Timer size={7} />
            {countdown.display}
          </div>
        </div>

        {/* SL */}
        <div className="bg-zinc-800/40 rounded-lg p-2">
          <p className="text-[9px] text-zinc-600 font-bold tracking-widest uppercase mb-1">SL</p>
          <p className="text-[13px] font-mono font-bold text-red-400 tabular-nums leading-none">
            {formatGold(signal.stopLoss)}
          </p>
          <p className="text-[9px] text-zinc-600 font-mono mt-1">
            ${slDist.toFixed(1)} · {(slDist / 0.01).toFixed(0)}p
          </p>
        </div>

        {/* TP */}
        <div className="bg-zinc-800/40 rounded-lg p-2">
          <p className="text-[9px] text-zinc-600 font-bold tracking-widest uppercase mb-1">TP</p>
          <p className="text-[13px] font-mono font-bold text-emerald-400 tabular-nums leading-none">
            {formatGold(signal.takeProfit)}
          </p>
          <p className="text-[9px] text-zinc-600 font-mono mt-1">
            ${tpDist.toFixed(1)} · {(tpDist / 0.01).toFixed(0)}p
          </p>
        </div>
      </div>

      {/* ── R:R + Win rate tier ────────────────────────────────── */}
      <div className="flex items-center justify-between py-2 border-t border-b border-zinc-800/60 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-zinc-600 uppercase tracking-widest">R:R</span>
          <span className="text-xs font-mono font-bold text-zinc-200 tabular-nums">
            1:{signal.riskRewardRatio.toFixed(1)}
          </span>
        </div>

        {signal.winRate ? (
          <div className={cn(
            'flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-bold',
            signal.winRate.tier === 'ELITE'    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
            signal.winRate.tier === 'HIGH'     ? 'text-sky-400    bg-sky-500/10    border-sky-500/20'    :
            signal.winRate.tier === 'MODERATE' ? 'text-amber-400  bg-amber-500/10  border-amber-500/20'  :
                                                  'text-zinc-500   bg-zinc-800      border-zinc-700/60',
          )}>
            <span className="font-mono tabular-nums">{signal.winRate.percentage}%</span>
            <span className="opacity-60 tracking-widest uppercase text-[8px]">{signal.winRate.tier}</span>
          </div>
        ) : (
          <span className="text-xs font-mono text-zinc-500 tabular-nums">
            {(signal.winProbability * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {/* ── Reasoning accordion ───────────────────────────────── */}
      {expanded && (
        <div className="space-y-2.5 mb-2">
          <ReasoningBlock title="HTF Bias"   content={signal.reasoning.htfBias} />
          <ReasoningBlock title="Liquidity"  content={signal.reasoning.liquidityNarrative} />
          <ReasoningBlock title="Macro"      content={signal.reasoning.macroContext} />
          {signal.reasoning.newsContext && (
            <ReasoningBlock title="News" content={signal.reasoning.newsContext} />
          )}
          <ReasoningBlock title="Entry"      content={signal.reasoning.entryTrigger} />

          {signal.reasoning.bullishFactors.length > 0 && (
            <FactorList title="Bullish" items={signal.reasoning.bullishFactors} color="text-emerald-400" />
          )}
          {signal.reasoning.bearishFactors.length > 0 && (
            <FactorList title="Bearish" items={signal.reasoning.bearishFactors} color="text-red-400" />
          )}
          {signal.reasoning.riskWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
              <div className="flex items-center gap-1 text-amber-400 text-[9px] font-bold uppercase tracking-widest mb-1">
                <AlertTriangle size={9} />
                Risk Warnings
              </div>
              {signal.reasoning.riskWarnings.map((w, i) => (
                <p key={i} className="text-[10px] text-amber-300/70 leading-relaxed">{w}</p>
              ))}
            </div>
          )}
          {signal.reasoning.volatilityWarning && (
            <p className="text-[10px] text-orange-400/60 italic">{signal.reasoning.volatilityWarning}</p>
          )}
        </div>
      )}

      {/* ── Expand hint ───────────────────────────────────────── */}
      <div className="flex justify-center pt-2 border-t border-zinc-800/40">
        <span className="text-[9px] text-zinc-700 select-none">
          {expanded ? '▲ collapse' : '▼ analysis'}
        </span>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ReasoningBlock({ title, content }: { title: string; content: string }) {
  if (!content) return null
  return (
    <div>
      <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mb-0.5">{title}</p>
      <p className="text-[11px] text-zinc-300 leading-relaxed">{content}</p>
    </div>
  )
}

function FactorList({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div>
      <p className={cn('text-[9px] font-bold uppercase tracking-widest mb-1', color)}>{title}</p>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[10px] text-zinc-400 leading-snug">
            <span className={cn('mt-0.5 flex-shrink-0', color)}>·</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
