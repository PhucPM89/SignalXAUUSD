'use client'

import { useEffect, useState } from 'react'
import type { Signal, LayerScores } from '@/types/trading'
import { cn } from '@/lib/utils'

interface Props {
  signal: Signal
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
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    if (!signal.expiresAt) {
      setTimeLeft('')
      return
    }

    function formatRemaining(ms: number) {
      if (ms <= 0) return 'Expired'
      const totalSeconds = Math.floor(ms / 1000)
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60

      if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
      if (minutes > 0) return `${minutes}m ${seconds}s`
      return `${seconds}s`
    }

    const expiresAt = new Date(signal.expiresAt).getTime()
    const tick = () => setTimeLeft(formatRemaining(expiresAt - Date.now()))

    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [signal.expiresAt])

  return (
    <div className="absolute top-3 right-3 z-20 pointer-events-none select-none">
      <div className="bg-zinc-950/92 backdrop-blur-md border border-zinc-800/80 rounded-xl p-3 w-[11.5rem] shadow-2xl shadow-black/60">

        {/* Title row */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-[0.15em]">
            AI Analysis
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

        <div className="flex items-center justify-between text-[9px] text-zinc-500 mb-1">
          <span>Expires</span>
          <span className={cn('font-mono font-semibold', timeLeft === 'Expired' ? 'text-red-400' : 'text-amber-400')}>
            {timeLeft || '--'}
          </span>
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

      </div>
    </div>
  )
}
