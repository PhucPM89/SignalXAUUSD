'use client'

import { useEffect, useState } from 'react'
import { useTradingStore } from '@/stores/tradingStore'
import { cn } from '@/lib/utils'
import type { ClosedSignalRecord, Signal } from '@/types/trading'
import { History, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Wifi } from 'lucide-react'

const PAGE_SIZE = 10

const RESULT_LABEL: Record<string, string> = {
  TP_HIT:     'TP HIT',
  SL_HIT:     'SL HIT',
  TRAILED_SL: 'TRAIL',
  EXPIRED:    'EXPIRED',
}

const RESULT_COLOR: Record<string, string> = {
  TP_HIT:     'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  SL_HIT:     'text-red-400 bg-red-400/10 border-red-400/30',
  TRAILED_SL: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  EXPIRED:    'text-zinc-500 bg-zinc-500/10 border-zinc-500/30',
}

interface DisplayRow {
  id:       string
  dir:      string
  entry:    number
  sl:       number
  tp:       number
  rr:       number
  conf:     number
  at:       string
  result:   string | null   // null = active / not yet closed
  pnl:      number | null
  isActive: boolean
}

function fromClosed(r: ClosedSignalRecord): DisplayRow {
  return { id: r.id, dir: r.dir, entry: r.entry, sl: r.sl, tp: r.tp, rr: r.rr, conf: r.conf, at: r.at, result: r.result, pnl: r.pnl, isActive: false }
}

function fromSignal(s: Signal, isActive: boolean): DisplayRow {
  return { id: s.id, dir: s.direction, entry: s.entryPrice, sl: s.stopLoss, tp: s.takeProfit, rr: s.riskRewardRatio, conf: s.confidenceScore, at: s.generatedAt, result: null, pnl: null, isActive }
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function SignalHistoryPanel() {
  const [fbRecords, setFbRecords] = useState<ClosedSignalRecord[]>([])
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(0)

  const signalHistory = useTradingStore(s => s.signalHistory)
  const activeSignal  = useTradingStore(s => s.activeSignal)

  useEffect(() => {
    fetch('/api/signals/history', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((data: ClosedSignalRecord[]) => { setFbRecords(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Merge: Firebase closed records + in-memory session signals not yet in Firebase
  const fbIds = new Set(fbRecords.map(r => r.id))
  const sessionRows: DisplayRow[] = signalHistory
    .filter(s => !fbIds.has(s.id))
    .map(s => fromSignal(s, activeSignal?.id === s.id))
  const closedRows: DisplayRow[] = fbRecords.map(fromClosed)

  // Closed on top, then open/session signals
  const allRows = [...closedRows, ...sessionRows]

  // Stats from closed records
  const wins     = fbRecords.filter(r => r.result === 'TP_HIT' || r.result === 'TRAILED_SL').length
  const losses   = fbRecords.filter(r => r.result === 'SL_HIT').length
  const closed   = wins + losses
  const winRate  = closed > 0 ? Math.round((wins / closed) * 100) : null
  const totalPnl = fbRecords.reduce((sum, r) => sum + r.pnl, 0)

  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE))
  const slice      = allRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="flex flex-col h-full">

      {/* Header + summary stats */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <History size={11} className="text-zinc-500" />
          <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">Signal History</span>
          {allRows.length > 0 && (
            <span className="text-[9px] text-zinc-600 font-mono">({allRows.length})</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {winRate !== null && (
            <span className={cn(
              'text-[9px] font-bold px-1.5 py-0.5 rounded border font-mono',
              winRate >= 60 ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
                : winRate >= 45 ? 'text-amber-400 bg-amber-400/10 border-amber-400/30'
                : 'text-red-400 bg-red-400/10 border-red-400/30'
            )}>
              W {winRate}%
            </span>
          )}
          {fbRecords.length > 0 && (
            <span className={cn(
              'text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border',
              totalPnl >= 0 ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
                : 'text-red-400 bg-red-400/10 border-red-400/30'
            )}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(1)} pts
            </span>
          )}
        </div>
      </div>

      {/* Win/loss progress bar */}
      {closed > 0 && (
        <div className="mx-3 mb-2 h-1 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0">
          <div className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${(wins / closed) * 100}%` }} />
        </div>
      )}

      {/* Records list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-[10px] text-zinc-600">
            <Wifi size={11} className="animate-pulse" />
            <span>Loading history...</span>
          </div>
        ) : allRows.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-[10px] text-zinc-600">Chưa có lệnh nào được tạo</p>
            <p className="text-[9px] text-zinc-700 mt-1">Lịch sử sẽ hiện sau khi lệnh đầu tiên xuất hiện</p>
          </div>
        ) : (
          <div className="space-y-1.5 px-3 pb-2">
            {slice.map((row) => (
              <SignalRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>

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
          <span className="text-[9px] text-zinc-600 font-mono">{page + 1} / {totalPages}</span>
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

function SignalRow({ row }: { row: DisplayRow }) {
  const isBuy    = row.dir === 'BUY'
  const isProfit = row.pnl !== null && row.pnl > 0
  const isLoss   = row.pnl !== null && row.pnl < 0
  const isClosed = row.result !== null

  return (
    <div className={cn(
      'border rounded-lg p-2 text-[10px] transition-colors',
      row.isActive
        ? 'bg-amber-400/5 border-amber-400/20 hover:bg-amber-400/10'
        : 'bg-zinc-800/30 border-zinc-700/30 hover:bg-zinc-800/50',
    )}>
      {/* Row 1: direction + status + date */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'font-bold text-[9px] px-1.5 py-0.5 rounded-full border',
            isBuy ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
                  : 'text-red-400 bg-red-400/10 border-red-400/30',
          )}>
            {row.dir}
          </span>

          {isClosed ? (
            <span className={cn(
              'text-[9px] font-bold px-1.5 py-0.5 rounded border',
              RESULT_COLOR[row.result!] ?? 'text-zinc-500 bg-zinc-500/10 border-zinc-500/30',
            )}>
              {RESULT_LABEL[row.result!] ?? row.result}
            </span>
          ) : row.isActive ? (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border text-amber-400 bg-amber-400/10 border-amber-400/30 animate-pulse">
              LIVE
            </span>
          ) : (
            <span className="text-[9px] px-1.5 py-0.5 rounded border text-zinc-600 border-zinc-700/50">
              REPLACED
            </span>
          )}
        </div>
        <span className="text-zinc-600 font-mono text-[9px]">{formatDate(row.at)}</span>
      </div>

      {/* Row 2: E / SL / TP / R:R */}
      <div className="flex items-center gap-3 mb-1.5 font-mono">
        <span className="text-zinc-600">E <span className="text-zinc-200 font-semibold">{row.entry.toFixed(2)}</span></span>
        <span className="text-zinc-600">SL <span className="text-red-400/80">{row.sl.toFixed(2)}</span></span>
        <span className="text-zinc-600">TP <span className="text-emerald-400/80">{row.tp.toFixed(2)}</span></span>
        <span className="text-zinc-600 ml-auto">R:R <span className="text-zinc-400">{row.rr.toFixed(1)}</span></span>
      </div>

      {/* Row 3: PnL (closed) OR confidence (open) */}
      <div className="flex items-center justify-between">
        {isClosed ? (
          <div className={cn(
            'flex items-center gap-1 font-mono font-bold text-[11px]',
            isProfit ? 'text-emerald-400' : isLoss ? 'text-red-400' : 'text-zinc-500',
          )}>
            {isProfit ? <TrendingUp size={11} /> : isLoss ? <TrendingDown size={11} /> : <Minus size={11} />}
            <span>{row.pnl! > 0 ? '+' : ''}{row.pnl!.toFixed(2)} pts</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-zinc-600 text-[9px]">
            <Minus size={10} />
            <span>Chưa đóng</span>
          </div>
        )}
        <span className="text-zinc-700 font-mono text-[9px]">{row.conf}% conf</span>
      </div>
    </div>
  )
}
