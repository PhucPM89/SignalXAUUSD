'use client'

import type { Signal, LayerScores } from '@/types/trading'
import { cn } from '@/lib/utils'

interface Props {
  signal: Signal
}

const TIER_STYLE: Record<string, string> = {
  ELITE:    'text-amber-300  border-amber-500/50  bg-amber-500/10',
  HIGH:     'text-emerald-300 border-emerald-500/50 bg-emerald-500/10',
  MODERATE: 'text-sky-300    border-sky-500/50    bg-sky-500/10',
  LOW:      'text-zinc-400   border-zinc-600/50   bg-zinc-800/50',
}

const LAYER_DEFS: { key: keyof LayerScores; label: string }[] = [
  { key: 'structure',  label: 'Structure'  },
  { key: 'liquidity',  label: 'Liquidity'  },
  { key: 'macro',      label: 'Macro'      },
  { key: 'volatility', label: 'Volatility' },
  { key: 'session',    label: 'Session'    },
  { key: 'news',       label: 'News'       },
]

export default function AIConfidenceOverlay({ signal }: Props) {
  const { layerScores, winRate, confidenceScore, direction } = signal
  const isBuy = direction === 'BUY'
  const tier  = winRate?.tier ?? 'MODERATE'
  const tierStyle = TIER_STYLE[tier] ?? TIER_STYLE.MODERATE

  return (
    <div className="absolute top-3 right-3 z-20 pointer-events-none select-none">
      <div className="bg-zinc-950/92 backdrop-blur-md border border-zinc-800/80 rounded-xl p-3 w-[11.5rem] shadow-2xl shadow-black/60">

        {/* Title row */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-[0.15em]">
            AI Analysis
          </span>
          <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded border tracking-wider', tierStyle)}>
            {tier}
          </span>
        </div>

        {/* Confidence + Win probability */}
        <div className="flex items-end gap-2 mb-2.5">
          <div>
            <span className={cn(
              'text-3xl font-black font-mono leading-none',
              confidenceScore >= 80 ? 'text-emerald-400' :
              confidenceScore >= 70 ? 'text-amber-400' :
              'text-zinc-400'
            )}>
              {confidenceScore}
            </span>
            <span className="text-zinc-600 text-[10px] ml-0.5">%</span>
          </div>
          {winRate && (
            <div className="flex flex-col items-end ml-auto">
              <span className={cn('text-base font-black font-mono leading-none', isBuy ? 'text-emerald-400' : 'text-red-400')}>
                {winRate.percentage}%
              </span>
              <span className="text-[9px] text-zinc-600">P(win)</span>
            </div>
          )}
        </div>

        {/* Win-probability bar */}
        {winRate && (
          <div className="mb-3">
            <div className="h-1.5 bg-zinc-800/80 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full', isBuy ? 'bg-emerald-500' : 'bg-red-500')}
                style={{ width: `${winRate.percentage}%`, transition: 'width 0.6s ease' }}
              />
            </div>
            <div className="flex justify-between mt-0.5 text-[9px] text-zinc-600">
              <span>Bayesian</span>
              <span className="font-mono">RR {signal.riskRewardRatio.toFixed(1)}</span>
            </div>
          </div>
        )}

        {/* Layer scores — bidirectional bars */}
        {layerScores && (
          <>
            <div className="text-[8px] text-zinc-700 font-bold uppercase tracking-[0.12em] mb-1.5">
              Layer Scores
            </div>
            <div className="space-y-1.5">
              {LAYER_DEFS.map(({ key, label }) => {
                const raw  = layerScores[key]
                // structure/liquidity/macro are [-1,+1]; volatility/session/news are [0,1]
                // Normalise everything to [-1,+1] for display
                const norm = (key === 'volatility' || key === 'session' || key === 'news')
                  ? raw * 2 - 1   // [0,1] → [-1,+1]
                  : raw
                const pct       = Math.abs(norm) * 50   // percentage width from centre (max 50%)
                const positive  = norm >= 0

                return (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className="text-[8px] text-zinc-600 w-12 text-right shrink-0 font-mono">{label}</span>
                    {/* Bidirectional bar */}
                    <div className="flex-1 h-[5px] bg-zinc-800 rounded-full relative overflow-hidden">
                      {/* Center divider */}
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600 z-10" />
                      {/* Fill */}
                      <div
                        className={cn(
                          'absolute top-0 bottom-0 rounded-full',
                          positive ? 'bg-emerald-500/70 left-1/2' : 'bg-red-500/70 right-1/2'
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={cn(
                      'text-[8px] font-mono w-7 text-right shrink-0',
                      positive ? 'text-emerald-500' : 'text-red-500'
                    )}>
                      {norm >= 0 ? '+' : ''}{norm.toFixed(2)}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Kelly sizing footer */}
        {winRate && winRate.quarter_kelly_pct > 0 && (
          <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex justify-between items-center">
            <span className="text-[8px] text-zinc-600">¼-Kelly size</span>
            <span className="text-[9px] text-amber-400 font-mono font-bold">
              {winRate.quarter_kelly_pct.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
