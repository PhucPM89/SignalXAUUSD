'use client'

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
  const { percentage } = data

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-0.5">B/S Ratio</div>
          <div className="text-3xl font-black tabular-nums text-white">
            {percentage}<span className="text-xl">%</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold px-2 py-0.5 rounded border border-zinc-700 bg-zinc-800/80 text-zinc-300">
            ACTIVE
          </span>
        </div>
      </div>

      <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 bg-emerald-500"
          style={{ width: `${percentage}%` }}
        />
      </div>

    </div>
  )
}
