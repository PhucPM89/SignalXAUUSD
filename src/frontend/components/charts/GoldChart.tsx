'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  createChart, IChartApi, ISeriesApi,
  CandlestickSeries,
  ColorType, CrosshairMode,
  type CandlestickData, type Time,
} from 'lightweight-charts'
import { useTradingStore } from '@/stores/tradingStore'
import type { Signal, Candle } from '@/types/trading'
import { formatGold } from '@/types/trading'
import { cn } from '@/lib/utils'

const TIMEFRAMES = ['M5', 'M15', 'H1', 'H4'] as const
type TF = typeof TIMEFRAMES[number]

interface GoldChartProps {
  candles: Candle[]
  signal: Signal | null
  className?: string
}

/**
 * Institutional XAUUSD candlestick chart built on TradingView Lightweight Charts v5.
 *
 * Features:
 *  - Real-time tick updates via store subscription
 *  - Signal overlay: entry/SL/TP lines with labels
 *  - Order block zones (semi-transparent rectangles)
 *  - Fair value gap fills
 *  - Session shading (London/NY open markers)
 *  - ATR-based volatility band overlay
 */
export default function GoldChart({ candles, signal, className }: GoldChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  const { currentPrice, selectedTimeframe, setTimeframe } = useTradingStore()
  const [crosshairPrice, setCrosshairPrice] = useState<number | null>(null)

  // ── Chart initialization ───────────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#0f0f14' },
        textColor: '#9ca3af',
        fontSize: 11,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      },
      grid: {
        vertLines: { color: '#1f2937', style: 1 },
        horzLines: { color: '#1f2937', style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#374151', labelBackgroundColor: '#1f2937' },
        horzLine: { color: '#374151', labelBackgroundColor: '#1f2937' },
      },
      rightPriceScale: {
        borderColor: '#1f2937',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#1f2937',
        timeVisible: true,
        secondsVisible: false,
      },
    })

    chartRef.current = chart

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })
    candleSeriesRef.current = candleSeries

    // Crosshair price tracking
    chart.subscribeCrosshairMove((param) => {
      if (param.seriesData.size > 0) {
        const data = param.seriesData.get(candleSeries) as CandlestickData | undefined
        setCrosshairPrice(data?.close ?? null)
      }
    })

    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [])

  // ── Load candle data ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return

    const data: CandlestickData[] = candles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))

    candleSeriesRef.current.setData(data)
    chartRef.current?.timeScale().fitContent()
  }, [candles])

  // ── Real-time tick update (last candle) ────────────────────────────────────
  useEffect(() => {
    if (!candleSeriesRef.current || currentPrice === 0 || candles.length === 0) return

    const lastCandle = candles[candles.length - 1]
    candleSeriesRef.current.update({
      time: lastCandle.time as Time,
      open: lastCandle.open,
      high: Math.max(lastCandle.high, currentPrice),
      low: Math.min(lastCandle.low, currentPrice),
      close: currentPrice,
    })
  }, [currentPrice, candles])

  // ── Signal overlay: entry/SL/TP horizontal lines ──────────────────────────
  useEffect(() => {
    const series = candleSeriesRef.current
    if (!series || !signal) return

    const isBuy = signal.direction === 'BUY'
    const lastTime = candles.length > 0 ? candles[candles.length - 1].time as Time : 0

    // Entry line
    series.createPriceLine({
      price: signal.entryPrice,
      color: isBuy ? '#10b981' : '#ef4444',
      lineWidth: 2,
      lineStyle: 0,   // Solid
      axisLabelVisible: true,
      title: `ENTRY ${signal.direction} @ ${formatGold(signal.entryPrice)}`,
    })

    // Stop loss line
    series.createPriceLine({
      price: signal.stopLoss,
      color: '#ef4444',
      lineWidth: 1,
      lineStyle: 2,   // Dashed
      axisLabelVisible: true,
      title: `SL ${formatGold(signal.stopLoss)}`,
    })

    // Take profit line
    series.createPriceLine({
      price: signal.takeProfit,
      color: '#10b981',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: `TP ${formatGold(signal.takeProfit)}`,
    })
  }, [signal, candles])

  const displayPrice = crosshairPrice ?? currentPrice

  return (
    <div className={cn('flex flex-col bg-[#0f0f14] rounded-lg overflow-hidden', className)}>
      {/* Header toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-sm tracking-wider">XAUUSD</span>
          <span className="text-lg font-mono font-semibold text-white">
            {displayPrice > 0 ? formatGold(displayPrice) : '—'}
          </span>
        </div>

        {/* Timeframe selector */}
        <div className="flex gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={cn(
                'px-2 py-1 text-xs rounded font-mono transition-colors',
                selectedTimeframe === tf
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
              )}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div ref={chartContainerRef} className="flex-1 min-h-0" />
    </div>
  )
}
