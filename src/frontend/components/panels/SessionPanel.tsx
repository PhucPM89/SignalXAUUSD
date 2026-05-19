'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

interface Session {
  name:  string
  short: string
  start: number   // UTC hour
  end:   number   // UTC hour
  color: string
  textColor: string
}

const SESSIONS: Session[] = [
  { name: 'Sydney',          short: 'SYD', start: 21, end: 6,  color: 'bg-blue-900/40',    textColor: 'text-blue-400'    },
  { name: 'Tokyo',           short: 'TKY', start: 0,  end: 9,  color: 'bg-purple-900/40',  textColor: 'text-purple-400'  },
  { name: 'London',          short: 'LON', start: 8,  end: 17, color: 'bg-amber-900/40',   textColor: 'text-amber-400'   },
  { name: 'New York',        short: 'NY',  start: 13, end: 22, color: 'bg-green-900/40',   textColor: 'text-green-400'   },
]

const OVERLAP: Session = {
  name: 'London / NY Overlap', short: 'OVLP', start: 13, end: 16,
  color: 'bg-emerald-900/60', textColor: 'text-emerald-300',
}

function isInSession(s: Session, utcHour: number): boolean {
  if (s.start <= s.end) return utcHour >= s.start && utcHour < s.end
  return utcHour >= s.start || utcHour < s.end   // wraps midnight
}

function minutesUntil(targetHour: number, utcHour: number, utcMin: number): number {
  let diff = (targetHour * 60) - (utcHour * 60 + utcMin)
  if (diff < 0) diff += 24 * 60
  return diff
}

function fmt(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function SessionPanel() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!now) return null

  const utcHour = now.getUTCHours()
  const utcMin  = now.getUTCMinutes()
  const isOverlap = isInSession(OVERLAP, utcHour)
  const activeSessions = SESSIONS.filter(s => isInSession(s, utcHour))
  const isDeadSession  = utcHour >= 21 || utcHour < 2

  // Next high-value session start
  const londonMinsAway = minutesUntil(OVERLAP.start, utcHour, utcMin)
  const overlapActive  = isOverlap

  return (
    <div className="bg-chart-surface border border-chart-border rounded-xl p-4 space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Session Clock</span>
        </div>
        <span className="text-xs font-mono text-zinc-500">
          {now.toUTCString().slice(17, 22)} UTC
        </span>
      </div>

      {/* Overlap highlight */}
      {overlapActive && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-950 border border-emerald-800 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-emerald-300">LONDON / NY OVERLAP — Peak Gold Liquidity</span>
        </div>
      )}

      {isDeadSession && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-950/50 border border-red-900/50 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-xs text-red-400">Dead session — signals suppressed</span>
        </div>
      )}

      {/* Session bars */}
      <div className="space-y-1.5">
        {SESSIONS.map(s => {
          const active = isInSession(s, utcHour)
          return (
            <div key={s.name} className="flex items-center gap-2">
              <span className={`text-[10px] font-mono w-8 ${active ? s.textColor : 'text-zinc-600'}`}>
                {s.short}
              </span>
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                {/* Mark the session window on 24h timeline */}
                <SessionBar session={s} utcHour={utcHour} active={active} />
              </div>
              {active && (
                <span className={`text-[10px] font-semibold ${s.textColor}`}>OPEN</span>
              )}
              {!active && (
                <span className="text-[10px] text-zinc-700">
                  in {fmt(minutesUntil(s.start, utcHour, utcMin))}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Next overlap countdown */}
      {!overlapActive && (
        <div className="text-[11px] text-zinc-500 text-center">
          London/NY Overlap in{' '}
          <span className="text-amber-400 font-mono font-semibold">{fmt(londonMinsAway)}</span>
          <span className="text-zinc-700"> — highest Gold win-rate window</span>
        </div>
      )}
    </div>
  )
}

function SessionBar({ session, utcHour, active }: { session: Session; utcHour: number; active: boolean }) {
  const startPct  = (session.start / 24) * 100
  let   widthPct  = ((session.end - session.start) / 24) * 100
  if   (widthPct < 0) widthPct += 100

  const barColor = active ? session.color.replace('/40', '') : 'bg-zinc-700'

  return (
    <div className="relative w-full h-full">
      <div
        className={`absolute inset-y-0 rounded-full ${active ? session.color.replace('bg-', 'bg-') : 'bg-zinc-700/50'}`}
        style={{ left: `${startPct}%`, width: `${widthPct}%` }}
      />
      {/* Current time marker */}
      <div
        className="absolute inset-y-0 w-0.5 bg-white/40 rounded-full"
        style={{ left: `${(utcHour / 24) * 100}%` }}
      />
    </div>
  )
}
