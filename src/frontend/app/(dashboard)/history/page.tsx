'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ClosedSignalRecord } from '@/types/trading'

const PAGE_SIZE = 15

export default function HistoryPage() {
  const [records, setRecords] = useState<ClosedSignalRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(0)

  useEffect(() => {
    fetch('/api/signals/history', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((data: ClosedSignalRecord[]) => {
        setRecords(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const wins    = records.filter(r => r.result === 'TP_HIT' || r.result === 'TRAILED_SL').length
  const losses  = records.filter(r => r.result === 'SL_HIT').length
  const closed  = wins + losses
  const winRate = closed > 0 ? Math.round((wins / closed) * 100) : null
  const totalPnl = records.reduce((s, r) => s + r.pnl, 0)

  // Current streak
  let streak = 0
  for (const r of records) {
    const isWin = r.result === 'TP_HIT' || r.result === 'TRAILED_SL'
    if (streak === 0) {
      streak = isWin ? 1 : -1
      continue
    }
    if ((streak > 0 && isWin) || (streak < 0 && !isWin)) {
      streak += streak > 0 ? 1 : -1
    } else {
      break
    }
  }

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE))
  const slice = records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function formatDate(iso: string) {
    const d = new Date(iso)
    return (
      d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
      ' ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Win Rate"
            value={winRate !== null ? `${winRate}%` : '—'}
            color={
              winRate !== null
                ? winRate >= 60 ? 'text-emerald-400'
                : winRate >= 45 ? 'text-amber-400'
                : 'text-red-400'
                : 'text-zinc-500'
            }
          />
          <StatCard
            label="Total P&L"
            value={records.length > 0 ? `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}` : '—'}
            color={totalPnl > 0 ? 'text-emerald-400' : totalPnl < 0 ? 'text-red-400' : 'text-zinc-500'}
          />
          <StatCard
            label="Signals"
            value={records.length > 0 ? String(records.length) : '—'}
          />
          <StatCard
            label="Streak"
            value={streak !== 0 ? `${streak > 0 ? '+' : ''}${streak}` : '—'}
            color={streak > 0 ? 'text-emerald-400' : streak < 0 ? 'text-red-400' : 'text-zinc-500'}
          />
        </div>

        {/* Win/loss bar */}
        {closed > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-[9px] text-zinc-600 mb-1">
              <span>{wins} wins</span>
              <span>{losses} losses</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${(wins / closed) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-zinc-600 text-sm">Loading history…</div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <p className="text-zinc-500 text-sm">No closed signals yet</p>
            <p className="text-zinc-700 text-xs">History appears after the first signal closes</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block rounded-xl border border-zinc-800/60 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800/60 bg-zinc-900/60">
                    {['Date', 'Dir', 'Entry', 'SL', 'TP', 'R:R', 'Conf', 'Result', 'P&L'].map(h => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-[9px] text-zinc-600 font-bold uppercase tracking-widest"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {slice.map((r, i) => {
                    const isWin  = r.result === 'TP_HIT' || r.result === 'TRAILED_SL'
                    const isLoss = r.result === 'SL_HIT'
                    return (
                      <tr key={r.id ?? i} className="hover:bg-zinc-800/20 transition-colors">
                        <td className="px-3 py-2 text-zinc-500 font-mono text-[10px]">
                          {formatDate(r.at)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            'font-bold text-[9px] tracking-widest',
                            r.dir === 'BUY' ? 'text-emerald-400' : 'text-red-400',
                          )}>
                            {r.dir}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-zinc-200 tabular-nums">
                          {r.entry.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 font-mono text-red-400/70 tabular-nums">
                          {r.sl.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 font-mono text-emerald-400/70 tabular-nums">
                          {r.tp.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 font-mono text-zinc-400 tabular-nums">
                          {r.rr.toFixed(1)}
                        </td>
                        <td className="px-3 py-2 font-mono text-zinc-500 tabular-nums">
                          {r.conf}%
                        </td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            'text-[9px] font-bold',
                            isWin  ? 'text-emerald-400' :
                            isLoss ? 'text-red-400' :
                            'text-zinc-500',
                          )}>
                            {r.result === 'TP_HIT'    ? 'TP'    :
                             r.result === 'SL_HIT'    ? 'SL'    :
                             r.result === 'TRAILED_SL' ? 'TRAIL' :
                             r.result}
                          </span>
                        </td>
                        <td className={cn(
                          'px-3 py-2 font-mono font-bold tabular-nums',
                          r.pnl > 0 ? 'text-emerald-400' :
                          r.pnl < 0 ? 'text-red-400' :
                          'text-zinc-500',
                        )}>
                          {r.pnl > 0 ? '+' : ''}{r.pnl.toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {slice.map((r, i) => {
                const isWin = r.result === 'TP_HIT' || r.result === 'TRAILED_SL'
                return (
                  <div key={r.id ?? i} className="rounded-lg border border-zinc-800/50 px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'text-[9px] font-bold',
                          r.dir === 'BUY' ? 'text-emerald-400' : 'text-red-400',
                        )}>
                          {r.dir}
                        </span>
                        <span className={cn(
                          'text-[9px] font-bold',
                          isWin ? 'text-emerald-400' : 'text-red-400',
                        )}>
                          {r.result === 'TP_HIT' ? 'TP HIT' : r.result === 'SL_HIT' ? 'SL HIT' : r.result}
                        </span>
                      </div>
                      <span className={cn(
                        'text-sm font-mono font-black',
                        r.pnl > 0 ? 'text-emerald-400' :
                        r.pnl < 0 ? 'text-red-400' :
                        'text-zinc-500',
                      )}>
                        {r.pnl > 0 ? '+' : ''}{r.pnl.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex gap-2 text-[9px] font-mono text-zinc-600">
                      <span>E <span className="text-zinc-300">{r.entry.toFixed(2)}</span></span>
                      <span>SL <span className="text-red-400/70">{r.sl.toFixed(2)}</span></span>
                      <span>TP <span className="text-emerald-400/70">{r.tp.toFixed(2)}</span></span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-4">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="text-[10px] font-bold text-zinc-500 disabled:opacity-30 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded border border-zinc-800"
                >
                  ← Prev
                </button>
                <span className="text-[10px] text-zinc-600 font-mono">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="text-[10px] font-bold text-zinc-500 disabled:opacity-30 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded border border-zinc-800"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  color = 'text-zinc-200',
}: {
  label:  string
  value:  string
  color?: string
}) {
  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4">
      <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mb-2">{label}</p>
      <p className={cn('text-2xl font-mono font-black tabular-nums', color)}>{value}</p>
    </div>
  )
}
