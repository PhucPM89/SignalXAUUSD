'use client'

import { useEffect, useState } from 'react'
import { useTradingStore } from '@/stores/tradingStore'
import { cn } from '@/lib/utils'
import type { ClosedSignalRecord, Signal } from '@/types/trading'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 15

// ── Unified row type ───────────────────────────────────────────────────────────

interface HistoryRow {
  id:       string
  dir:      string
  entry:    number
  sl:       number
  tp:       number
  rr:       number
  conf:     number
  at:       string          // entry time
  closed:   string | null   // close time (null if still open/session)
  result:   string | null
  pnl:      number | null
  isActive: boolean
  isSession: boolean        // in-memory only, not yet in Firebase
}

function fromClosed(r: ClosedSignalRecord): HistoryRow {
  return {
    id: r.id, dir: r.dir, entry: r.entry, sl: r.sl, tp: r.tp, rr: r.rr, conf: r.conf,
    at: r.at, closed: r.closed ?? null, result: r.result, pnl: r.pnl,
    isActive: false, isSession: false,
  }
}

function fromSignal(s: Signal, isActive: boolean): HistoryRow {
  return {
    id: s.id, dir: s.direction, entry: s.entryPrice, sl: s.stopLoss, tp: s.takeProfit,
    rr: s.riskRewardRatio, conf: s.confidenceScore,
    at: s.generatedAt, closed: null, result: null, pnl: null,
    isActive, isSession: true,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  )
}

function duration(from: string, to: string) {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  const h  = Math.floor(ms / 3_600_000)
  const m  = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const RESULT_LABEL: Record<string, string> = {
  TP_HIT: 'TP', SL_HIT: 'SL', TRAILED_SL: 'TRAIL', EXPIRED: 'EXP',
}
const RESULT_COLOR: Record<string, string> = {
  TP_HIT:     'text-emerald-400',
  TRAILED_SL: 'text-emerald-400',
  SL_HIT:     'text-red-400',
  EXPIRED:    'text-zinc-500',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
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

  // Merge Firebase records + in-memory session signals
  const fbIds = new Set(fbRecords.map(r => r.id))
  const sessionRows = signalHistory
    .filter(s => (s.direction === 'BUY' || s.direction === 'SELL') && !fbIds.has(s.id))
    .map(s => fromSignal(s, activeSignal?.id === s.id))
  const closedRows = fbRecords.map(fromClosed)
  const allRows: HistoryRow[] = [...closedRows, ...sessionRows]

  // Stats (from Firebase closed records only)
  const wins     = fbRecords.filter(r => r.result === 'TP_HIT' || r.result === 'TRAILED_SL').length
  const losses   = fbRecords.filter(r => r.result === 'SL_HIT').length
  const closed   = wins + losses
  const winRate  = closed > 0 ? Math.round((wins / closed) * 100) : null
  const totalPnl = fbRecords.reduce((s, r) => s + r.pnl, 0)

  let streak = 0
  for (const r of fbRecords) {
    const isWin = r.result === 'TP_HIT' || r.result === 'TRAILED_SL'
    if (streak === 0) { streak = isWin ? 1 : -1; continue }
    if ((streak > 0 && isWin) || (streak < 0 && !isWin)) streak += streak > 0 ? 1 : -1
    else break
  }

  const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE))
  const slice      = allRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Win Rate"
            value={winRate !== null ? `${winRate}%` : '—'}
            sub={closed > 0 ? `${wins}W · ${losses}L` : 'No closed trades'}
            color={winRate !== null ? (winRate >= 60 ? 'text-emerald-400' : winRate >= 45 ? 'text-amber-400' : 'text-red-400') : 'text-zinc-500'}
          />
          <StatCard
            label="Total P&L"
            value={fbRecords.length > 0 ? `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}` : '—'}
            sub="price pts"
            color={totalPnl > 0 ? 'text-emerald-400' : totalPnl < 0 ? 'text-red-400' : 'text-zinc-500'}
          />
          <StatCard
            label="Closed"
            value={closed > 0 ? String(closed) : '—'}
            sub={allRows.length > closed ? `+${allRows.length - closed} open` : 'total signals'}
          />
          <StatCard
            label="Streak"
            value={streak !== 0 ? `${streak > 0 ? '+' : ''}${streak}` : '—'}
            sub={streak > 0 ? 'wins' : streak < 0 ? 'losses' : '—'}
            color={streak > 0 ? 'text-emerald-400' : streak < 0 ? 'text-red-400' : 'text-zinc-500'}
          />
        </div>

        {/* Win/loss bar */}
        {closed > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-[9px] text-zinc-600 mb-1">
              <span className="text-emerald-400/70">{wins} wins</span>
              <span className="text-red-400/70">{losses} losses</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(wins / closed) * 100}%` }} />
              <div className="h-full bg-red-500/60 transition-all" style={{ width: `${(losses / closed) * 100}%` }} />
            </div>
          </div>
        )}

        {/* ── Table ── */}
        {loading ? (
          <div className="text-center py-12 text-zinc-600 text-sm">Loading history…</div>
        ) : allRows.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-zinc-500 text-sm">No signals yet</p>
            <p className="text-zinc-700 text-xs">History appears once the first BUY/SELL signal is generated</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block rounded-xl border border-zinc-800/60 overflow-hidden mb-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800/60 bg-zinc-900/60">
                    {['Entry Time', 'Close Time', 'Dir', 'Entry $', 'SL', 'TP', 'R:R', 'Result', 'P&L'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[9px] text-zinc-600 font-bold uppercase tracking-widest whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {slice.map((r, i) => (
                    <DesktopRow key={r.id ?? i} row={r} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-2 mb-4">
              {slice.map((r, i) => (
                <MobileCard key={r.id ?? i} row={r} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1 text-[10px] font-bold text-zinc-500 disabled:opacity-30 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded border border-zinc-800"
                >
                  <ChevronLeft size={11} /> Prev
                </button>
                <span className="text-[10px] text-zinc-600 font-mono tabular-nums">
                  {page + 1} / {totalPages} · {allRows.length} signals
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="flex items-center gap-1 text-[10px] font-bold text-zinc-500 disabled:opacity-30 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded border border-zinc-800"
                >
                  Next <ChevronRight size={11} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Desktop row ───────────────────────────────────────────────────────────────

function DesktopRow({ row }: { row: HistoryRow }) {
  const isBuy  = row.dir === 'BUY'
  const isWin  = row.result === 'TP_HIT' || row.result === 'TRAILED_SL'
  const isLoss = row.result === 'SL_HIT'

  return (
    <tr className={cn(
      'transition-colors',
      row.isActive   ? 'bg-amber-500/5' :
      row.isSession  ? 'bg-zinc-800/10' :
      'hover:bg-zinc-800/20',
    )}>
      {/* Entry time */}
      <td className="px-3 py-2 text-zinc-500 font-mono text-[10px] whitespace-nowrap">
        {fmtDate(row.at)}
      </td>

      {/* Close time + duration */}
      <td className="px-3 py-2 font-mono text-[10px] whitespace-nowrap">
        {row.closed ? (
          <span className="text-zinc-500">
            {fmtDate(row.closed)}
            <span className="text-zinc-700 ml-1.5">({duration(row.at, row.closed)})</span>
          </span>
        ) : row.isActive ? (
          <span className="text-amber-400 font-bold animate-pulse text-[9px] tracking-widest">LIVE</span>
        ) : (
          <span className="text-zinc-700 text-[9px]">open</span>
        )}
      </td>

      {/* Direction */}
      <td className="px-3 py-2">
        <span className={cn('font-black text-[9px] tracking-widest', isBuy ? 'text-emerald-400' : 'text-red-400')}>
          {row.dir}
        </span>
      </td>

      {/* Entry price */}
      <td className="px-3 py-2 font-mono text-zinc-200 tabular-nums">{row.entry.toFixed(2)}</td>

      {/* SL */}
      <td className="px-3 py-2 font-mono text-red-400/70 tabular-nums">{row.sl.toFixed(2)}</td>

      {/* TP */}
      <td className="px-3 py-2 font-mono text-emerald-400/70 tabular-nums">{row.tp.toFixed(2)}</td>

      {/* R:R */}
      <td className="px-3 py-2 font-mono text-zinc-500 tabular-nums">{row.rr.toFixed(1)}</td>

      {/* Result */}
      <td className="px-3 py-2">
        {row.result ? (
          <span className={cn('text-[9px] font-bold', RESULT_COLOR[row.result] ?? 'text-zinc-500')}>
            {RESULT_LABEL[row.result] ?? row.result}
          </span>
        ) : row.isActive ? (
          <span className="text-[9px] text-amber-400 font-bold">—</span>
        ) : (
          <span className="text-[9px] text-zinc-700">—</span>
        )}
      </td>

      {/* P&L */}
      <td className={cn(
        'px-3 py-2 font-mono font-bold tabular-nums',
        isWin  ? 'text-emerald-400' :
        isLoss ? 'text-red-400'     : 'text-zinc-500',
      )}>
        {row.pnl !== null
          ? `${row.pnl > 0 ? '+' : ''}${row.pnl.toFixed(2)}`
          : '—'}
      </td>
    </tr>
  )
}

// ── Mobile card ───────────────────────────────────────────────────────────────

function MobileCard({ row }: { row: HistoryRow }) {
  const isBuy = row.dir === 'BUY'
  const isWin = row.result === 'TP_HIT' || row.result === 'TRAILED_SL'

  return (
    <div className={cn(
      'rounded-lg border px-3 py-2.5 space-y-1.5',
      row.isActive  ? 'border-amber-400/20 bg-amber-400/5' :
      row.isSession ? 'border-zinc-800/40 bg-zinc-800/10' :
      'border-zinc-800/50',
    )}>
      {/* Row 1: Dir + Result + PnL */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('text-[9px] font-black tracking-widest', isBuy ? 'text-emerald-400' : 'text-red-400')}>
            {row.dir}
          </span>
          {row.result ? (
            <span className={cn('text-[9px] font-bold', RESULT_COLOR[row.result] ?? 'text-zinc-500')}>
              {RESULT_LABEL[row.result] ?? row.result}
            </span>
          ) : row.isActive ? (
            <span className="text-[9px] text-amber-400 font-bold animate-pulse">LIVE</span>
          ) : null}
        </div>
        {row.pnl !== null && (
          <span className={cn('text-sm font-mono font-black tabular-nums', isWin ? 'text-emerald-400' : 'text-red-400')}>
            {row.pnl > 0 ? '+' : ''}{row.pnl.toFixed(2)}
          </span>
        )}
      </div>

      {/* Row 2: E / SL / TP */}
      <div className="flex gap-2.5 text-[9px] font-mono">
        <span className="text-zinc-600">E <span className="text-zinc-200">{row.entry.toFixed(2)}</span></span>
        <span className="text-zinc-600">SL <span className="text-red-400/70">{row.sl.toFixed(2)}</span></span>
        <span className="text-zinc-600">TP <span className="text-emerald-400/70">{row.tp.toFixed(2)}</span></span>
        <span className="text-zinc-700 ml-auto">{row.rr.toFixed(1)}R</span>
      </div>

      {/* Row 3: Times */}
      <div className="flex items-center justify-between text-[9px] text-zinc-700 font-mono">
        <span>In: {fmtDate(row.at)}</span>
        {row.closed && (
          <span>Out: {fmtDate(row.closed)} <span className="text-zinc-800">({duration(row.at, row.closed)})</span></span>
        )}
      </div>
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color = 'text-zinc-200',
}: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4">
      <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mb-2">{label}</p>
      <p className={cn('text-2xl font-mono font-black tabular-nums', color)}>{value}</p>
      {sub && <p className="text-[9px] text-zinc-700 mt-1">{sub}</p>}
    </div>
  )
}
