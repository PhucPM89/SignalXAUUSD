'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ClosedSignalRecord } from '@/types/trading'
import { History, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'

const PAGE_SIZE = 10

const RESULT_LABEL: Record<string, string> = {
  TP_HIT:     'TP',
  SL_HIT:     'SL',
  TRAILED_SL: 'TRAIL',
  EXPIRED:    'EXP',
}

const RESULT_COLOR: Record<string, string> = {
  TP_HIT:     'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  SL_HIT:     'text-red-400 bg-red-400/10 border-red-400/30',
  TRAILED_SL: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  EXPIRED:    'text-zinc-500 bg-zinc-500/10 border-zinc-500/30',
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function SignalHistoryPanel() {
  const [records, setRecords]   = useState<ClosedSignalRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(0)

  useEffect(() => {
    fetch('/api/signals/history', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((data: ClosedSignalRecord[]) => { setRecords(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const wins      = records.filter(r => r.result === 'TP_HIT' || r.result === 'TRAILED_SL').length
  const losses    = records.filter(r => r.result === 'SL_HIT').length
  const closed    = wins + losses
  const winRate   = closed > 0 ? Math.round((wins / closed) * 100) : null
  const totalPnl  = records.reduce((sum, r) => sum + r.pnl, 0)

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE))
  const slice      = records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="flex flex-col min-h-0">
      {/* Header + summary */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <History size={11} className="text-zinc-500" />
          <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">
            Signal History
          </span>
          {records.length > 0 && (
            <span className="text-[9px] text-zinc-600 font-mono">({records.length})</span>
          )}
        </div>
        {/* Summary badges */}
        <div className="flex items-center gap-1.5">
          {winRate !== null && (
            <span className={cn(
              'text-[9px] font-bold px-1.5 py-0.5 rounded border font-mono',
              winRate >= 60 ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' :
              winRate >= 45 ? 'text-amber-400 bg-amber-400/10 border-amber-400/30' :
                              'text-red-400 bg-red-400/10 border-red-400/30'
            )}>
              W {winRate}%
            </span>
          )}
          {records.length > 0 && (
            <span className={cn(
              'text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border',
              totalPnl >= 0
                ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
                : 'text-red-400 bg-red-400/10 border-red-400/30'
            )}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(1)} pts
            </span>
          )}
        </div>
      </div>

      {/* Win/Loss bar */}
      {closed > 0 && (
        <div className="mx-3 mb-2 h-1 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${(wins / closed) * 100}%` }}
          />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="px-3 py-4 text-center text-[10px] text-zinc-600">Loading...</div>
      ) : records.length === 0 ? (
        <div className="px-3 py-4 text-center text-[10px] text-zinc-600">
          No closed signals yet
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-1.5 px-3 pb-2">
            {slice.map((rec) => (
              <SignalRow key={rec.id} rec={rec} />
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800/60 flex-shrink-0">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-0.5 rounded text-zinc-500 disabled:opacity-30 hover:text-zinc-300 transition-colors"
          >
            <ChevronLeft size={13} />
          </button>
          <span className="text-[9px] text-zinc-600 font-mono">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="p-0.5 rounded text-zinc-500 disabled:opacity-30 hover:text-zinc-300 transition-colors"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

function SignalRow({ rec }: { rec: ClosedSignalRecord }) {
  const isBuy   = rec.dir === 'BUY'
  const isProfit = rec.pnl > 0
  const isLoss   = rec.pnl < 0

  return (
    <div className="bg-zinc-800/30 border border-zinc-700/30 rounded-lg p-2 text-[10px] hover:bg-zinc-800/50 transition-colors">
      {/* Row 1: direction + result + date */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'font-bold text-[9px] px-1.5 py-0.5 rounded-full border',
            isBuy
              ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
              : 'text-red-400 bg-red-400/10 border-red-400/30'
          )}>
            {rec.dir}
          </span>
          <span className={cn(
            'text-[9px] font-bold px-1.5 py-0.5 rounded border',
            RESULT_COLOR[rec.result] ?? 'text-zinc-500 bg-zinc-500/10 border-zinc-500/30'
          )}>
            {RESULT_LABEL[rec.result] ?? rec.result}
          </span>
          {rec.regime && (
            <span className="text-zinc-600 text-[9px]">{rec.regime}</span>
          )}
        </div>
        <span className="text-zinc-600 font-mono text-[9px]">{formatDate(rec.at)}</span>
      </div>

      {/* Row 2: Entry / SL / TP */}
      <div className="flex items-center gap-3 mb-1.5 font-mono">
        <div className="flex items-center gap-1">
          <span className="text-zinc-600">E</span>
          <span className="text-zinc-200 font-semibold">{rec.entry.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-zinc-600">SL</span>
          <span className="text-red-400/80">{rec.sl.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-zinc-600">TP</span>
          <span className="text-emerald-400/80">{rec.tp.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1 ml-auto text-zinc-600">
          <span>R:R</span>
          <span className="text-zinc-400">{rec.rr.toFixed(1)}</span>
        </div>
      </div>

      {/* Row 3: PnL result */}
      <div className="flex items-center justify-between">
        <div className={cn(
          'flex items-center gap-1 font-mono font-bold text-[11px]',
          isProfit ? 'text-emerald-400' : isLoss ? 'text-red-400' : 'text-zinc-500'
        )}>
          {isProfit ? <TrendingUp size={11} /> : isLoss ? <TrendingDown size={11} /> : <Minus size={11} />}
          <span>
            {rec.pnl > 0 ? '+' : ''}{rec.pnl.toFixed(2)} pts
          </span>
        </div>
        <span className="text-zinc-700 font-mono text-[9px]">
          {rec.conf}% conf
        </span>
      </div>
    </div>
  )
}
