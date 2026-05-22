'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createChart, IChartApi, ISeriesApi,
  CandlestickSeries,
  ColorType, CrosshairMode,
  type Time,
} from 'lightweight-charts'
import { useTradingStore } from '@/stores/tradingStore'
import type { Signal, Candle } from '@/types/trading'
import { formatGold } from '@/types/trading'
import { cn } from '@/lib/utils'
import AIConfidenceOverlay from './AIConfidenceOverlay'

const TIMEFRAMES = ['M5', 'M15', 'H1', 'H4'] as const

interface GoldChartProps {
  candles:   Candle[]
  signal:    Signal | null
  className?: string
}

function useCountdown(expiresAt: string | undefined): string {
  const [display, setDisplay] = useState('')
  useEffect(() => {
    if (!expiresAt) return
    const update = () => {
      const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now())
      if (remaining <= 0) { setDisplay('EXPIRED'); return }
      const h = Math.floor(remaining / 3_600_000)
      const m = Math.floor((remaining % 3_600_000) / 60_000)
      const s = Math.floor((remaining % 60_000) / 1000)
      setDisplay(h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  return display
}

export default function GoldChart({ candles, signal, className }: GoldChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef       = useRef<IChartApi | null>(null)
  const seriesRef      = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const entryLineRef   = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(null)
  const staticLinesRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[]>([])

  const { currentPrice, selectedTimeframe, setTimeframe } = useTradingStore()
  const countdown = useCountdown(signal?.expiresAt)

  // ── 1. Chart initialisation ────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#06060b' },
        textColor: '#52525b',
        fontSize: 11,
        fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
      },
      grid: {
        vertLines: { color: '#0f0f1a', style: 1 },
        horzLines: { color: '#0f0f1a', style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#27272a', labelBackgroundColor: '#18181b' },
        horzLine: { color: '#27272a', labelBackgroundColor: '#18181b' },
      },
      rightPriceScale: {
        borderColor: '#18181b',
        scaleMargins: { top: 0.12, bottom: 0.08 },
        textColor: '#52525b',
      },
      timeScale: {
        borderColor: '#18181b',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 8,
        minBarSpacing: 3,
      },
    })

    chartRef.current = chart

    seriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor:         '#10b981',
      downColor:       '#ef4444',
      borderUpColor:   '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor:     '#059669',
      wickDownColor:   '#dc2626',
    })

    return () => {
      chart.remove()
      chartRef.current     = null
      seriesRef.current    = null
      entryLineRef.current = null
      staticLinesRef.current = []
    }
  }, [])

  // ── 2. Candle history ──────────────────────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current
    if (!series || candles.length === 0) return
    series.setData(candles.map(c => ({
      time:  c.time as Time,
      open:  c.open,
      high:  c.high,
      low:   c.low,
      close: c.close,
    })))
    chartRef.current?.timeScale().fitContent()
  }, [candles])

  // ── 3. Live tick — update last candle ─────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current
    if (!series || currentPrice === 0 || candles.length === 0) return
    const last = candles[candles.length - 1]
    series.update({
      time:  last.time as Time,
      open:  last.open,
      high:  Math.max(last.high, currentPrice),
      low:   Math.min(last.low,  currentPrice),
      close: currentPrice,
    })
  }, [currentPrice, candles])

  // ── 4a. SL / TP static lines (recreate only when signal identity changes) ──
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return

    staticLinesRef.current.forEach(l => { try { series.removePriceLine(l) } catch {} })
    staticLinesRef.current = []

    if (!signal || signal.direction === 'NOTRADE') {
      if (entryLineRef.current) {
        try { series.removePriceLine(entryLineRef.current) } catch {}
        entryLineRef.current = null
      }
      return
    }

    staticLinesRef.current.push(
      series.createPriceLine({
        price: signal.stopLoss,
        color: '#dc2626',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `✕ SL  ${formatGold(signal.stopLoss)}`,
      }),
      series.createPriceLine({
        price: signal.takeProfit,
        color: '#059669',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `◎ TP  ${formatGold(signal.takeProfit)}`,
      }),
    )
  }, [signal])

  // ── 4b. Entry line with live countdown (updates every second) ──────────────
  useEffect(() => {
    const series = seriesRef.current
    if (!series || !signal || signal.direction === 'NOTRADE' || !countdown) return

    if (entryLineRef.current) {
      try { series.removePriceLine(entryLineRef.current) } catch {}
      entryLineRef.current = null
    }

    const isBuy  = signal.direction === 'BUY'
    const accent = isBuy ? '#10b981' : '#ef4444'
    const mark   = isBuy ? '▲' : '▼'

    entryLineRef.current = series.createPriceLine({
      price: signal.entryPrice,
      color: accent,
      lineWidth: 2,
      lineStyle: 0,
      axisLabelVisible: true,
      title: `${mark} ENTRY  ${formatGold(signal.entryPrice)}  ⏱ ${countdown}`,
    })
  }, [countdown, signal])

  return (
    <div className={cn('flex flex-col bg-[#06060b] rounded-lg overflow-hidden relative', className)}>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-900 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-white font-bold text-sm tracking-wider font-mono">XAU/USD</span>
          </div>
          <span className={cn(
            'text-lg font-mono font-semibold tabular-nums',
            currentPrice > 0 ? 'text-white' : 'text-zinc-600'
          )}>
            {currentPrice > 0 ? formatGold(currentPrice) : '———'}
          </span>
        </div>

        {/* Timeframe selector */}
        <div className="flex gap-0.5">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={cn(
                'px-2 py-1 text-[11px] rounded font-mono transition-all',
                selectedTimeframe === tf
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/60 border border-transparent'
              )}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart canvas ── */}
      <div className="relative flex-1 min-h-0">
        <div ref={chartContainerRef} className="absolute inset-0" />

        {signal && signal.direction !== 'NOTRADE' && (
          <AIConfidenceOverlay signal={signal} />
        )}

        {(!signal || signal.direction === 'NOTRADE') && (
          <div className="absolute bottom-4 right-4 z-20 pointer-events-none">
            <div className="bg-zinc-950/80 backdrop-blur-sm border border-zinc-800/60 rounded-lg px-3 py-1.5">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                — No Trade —
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
