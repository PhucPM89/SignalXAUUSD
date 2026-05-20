'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createChart, IChartApi, ISeriesApi,
  CandlestickSeries,
  ColorType, CrosshairMode,
  createSeriesMarkers,
  type CandlestickData, type Time,
  type SeriesMarker,
  type ISeriesMarkersPluginApi,
} from 'lightweight-charts'
import { useTradingStore } from '@/stores/tradingStore'
import type { Signal, Candle, ChartOverlays } from '@/types/trading'
import { formatGold } from '@/types/trading'
import { cn } from '@/lib/utils'
import { ZonePrimitive, type ZoneInput } from './primitives/ZonePrimitive'
import AIConfidenceOverlay from './AIConfidenceOverlay'

const TIMEFRAMES = ['M5', 'M15', 'H1', 'H4'] as const
type TF = typeof TIMEFRAMES[number]

interface GoldChartProps {
  candles: Candle[]
  signal: Signal | null
  className?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function obToZones(overlays: ChartOverlays): ZoneInput[] {
  return overlays.orderBlocks
    .filter(ob => !ob.mitigated)
    .slice(0, 6)
    .map(ob => ({
      startTimeTs: ob.formedAtTs,
      priceTop:    ob.top,
      priceBottom: ob.bottom,
      fillColor:   ob.isBullish
        ? `rgba(16,185,129,${0.08 + ob.strength * 0.0012})`
        : `rgba(239,68,68,${0.08 + ob.strength * 0.0012})`,
      borderColor: ob.isBullish
        ? 'rgba(16,185,129,0.55)'
        : 'rgba(239,68,68,0.55)',
    }))
}

function fvgToZones(overlays: ChartOverlays): ZoneInput[] {
  return overlays.fvgZones
    .filter(z => !z.filled)
    .slice(0, 5)
    .map(z => ({
      startTimeTs: z.formedAtTs,
      priceTop:    z.upper,
      priceBottom: z.lower,
      fillColor:   z.isBullish
        ? 'rgba(59,130,246,0.10)'
        : 'rgba(245,158,11,0.10)',
      borderColor: z.isBullish
        ? 'rgba(59,130,246,0.40)'
        : 'rgba(245,158,11,0.40)',
    }))
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GoldChart({ candles, signal, className }: GoldChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const seriesRef    = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const obPrimRef    = useRef<ZonePrimitive | null>(null)
  const fvgPrimRef   = useRef<ZonePrimitive | null>(null)
  // Refs to currently-drawn signal price lines so we can remove them on update
  const sigLinesRef  = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[]>([])
  const liqLinesRef  = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef   = useRef<ISeriesMarkersPluginApi<Time> | null>(null)

  const { currentPrice, selectedTimeframe, setTimeframe } = useTradingStore()
  const [crosshairPrice, setCrosshairPrice] = useState<number | null>(null)

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

    const series = chart.addSeries(CandlestickSeries, {
      upColor:        '#10b981',
      downColor:      '#ef4444',
      borderUpColor:  '#10b981',
      borderDownColor:'#ef4444',
      wickUpColor:    '#059669',
      wickDownColor:  '#dc2626',
    })
    seriesRef.current = series

    // Attach zone primitives (drawn behind candles)
    const obPrim  = new ZonePrimitive()
    const fvgPrim = new ZonePrimitive()
    series.attachPrimitive(obPrim)
    series.attachPrimitive(fvgPrim)
    obPrimRef.current  = obPrim
    fvgPrimRef.current = fvgPrim

    chart.subscribeCrosshairMove(param => {
      if (!param.point) {
        // Mouse left the chart — revert to live price
        setCrosshairPrice(null)
        return
      }
      // Only update when the cursor is directly on a candle; ignore gaps between bars
      const d = param.seriesData.get(series) as CandlestickData | undefined
      if (d) setCrosshairPrice(d.close)
    })

    return () => {
      chart.remove()
      chartRef.current    = null
      seriesRef.current   = null
      obPrimRef.current   = null
      fvgPrimRef.current  = null
      markersRef.current  = null
      sigLinesRef.current = []
      liqLinesRef.current = []
    }
  }, [])

  // ── 2. Candle history ──────────────────────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current
    if (!series || candles.length === 0) return

    series.setData(
      candles.map(c => ({
        time:  c.time as Time,
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close,
      }))
    )
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

  // ── 4. Signal price lines (entry / SL / TP / structural markers) ──────────
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return

    // Remove previous signal lines
    sigLinesRef.current.forEach(l => { try { series.removePriceLine(l) } catch {} })
    sigLinesRef.current = []

    if (!signal || signal.direction === 'NOTRADE') return

    const isBuy   = signal.direction === 'BUY'
    const accent  = isBuy ? '#10b981' : '#ef4444'
    const dirMark = isBuy ? '▲' : '▼'

    sigLinesRef.current.push(
      // Entry
      series.createPriceLine({
        price: signal.entryPrice,
        color: accent,
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `${dirMark} ENTRY  ${formatGold(signal.entryPrice)}`,
      }),
      // Stop loss
      series.createPriceLine({
        price: signal.stopLoss,
        color: '#dc2626',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `✕ SL  ${formatGold(signal.stopLoss)}`,
      }),
      // Take profit
      series.createPriceLine({
        price: signal.takeProfit,
        color: '#059669',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `◎ TP  ${formatGold(signal.takeProfit)}`,
      }),
    )

    // BOS label line at the entry level (ultra-thin, label only)
    const overlays = signal.chartOverlays
    if (overlays?.bosPresent) {
      sigLinesRef.current.push(
        series.createPriceLine({
          price: signal.entryPrice,
          color: 'rgba(0,0,0,0)',      // transparent — title is all that shows
          lineWidth: 1,
          lineStyle: 0,
          axisLabelVisible: false,
          title: isBuy ? '▲ BOS confirmed' : '▼ BOS confirmed',
        })
      )
    }
    if (overlays?.chochPresent) {
      sigLinesRef.current.push(
        series.createPriceLine({
          price: isBuy ? signal.stopLoss * 1.002 : signal.stopLoss * 0.998,
          color: '#f59e0b44',
          lineWidth: 1,
          lineStyle: 3,
          axisLabelVisible: false,
          title: '↕ CHoCH',
        })
      )
    }
  }, [signal])

  // ── 5. Liquidity zone price lines ─────────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return

    liqLinesRef.current.forEach(l => { try { series.removePriceLine(l) } catch {} })
    liqLinesRef.current = []

    const levels = signal?.chartOverlays?.liquidityLevels ?? []
    levels.slice(0, 6).forEach(lv => {
      liqLinesRef.current.push(
        series.createPriceLine({
          price: lv.price,
          color: lv.swept
            ? (lv.bullishSweep ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)')
            : 'rgba(161,161,170,0.35)',
          lineWidth: 1,
          lineStyle: 3,  // Dotted
          axisLabelVisible: false,
          title: lv.swept ? `✓ ${lv.description}` : lv.description,
        })
      )
    })

    // Swing high / swing low as reference levels
    if (signal?.chartOverlays?.swingHigh) {
      liqLinesRef.current.push(
        series.createPriceLine({
          price: signal.chartOverlays.swingHigh,
          color: 'rgba(99,102,241,0.4)',
          lineWidth: 1,
          lineStyle: 3,
          axisLabelVisible: false,
          title: `— Swing H  ${formatGold(signal.chartOverlays.swingHigh)}`,
        })
      )
    }
    if (signal?.chartOverlays?.swingLow) {
      liqLinesRef.current.push(
        series.createPriceLine({
          price: signal.chartOverlays.swingLow,
          color: 'rgba(99,102,241,0.4)',
          lineWidth: 1,
          lineStyle: 3,
          axisLabelVisible: false,
          title: `— Swing L  ${formatGold(signal.chartOverlays.swingLow)}`,
        })
      )
    }
  }, [signal])

  // ── 6. BOS / CHoCH / Liquidity markers on last candle ────────────────────
  useEffect(() => {
    const series = seriesRef.current
    if (!series || candles.length === 0) return

    const markers: SeriesMarker<Time>[] = []
    const overlays = signal?.chartOverlays
    const lastTime = candles[candles.length - 1].time as Time
    const isBuy    = signal?.direction === 'BUY'

    if (overlays?.bosPresent) {
      markers.push({
        time:     lastTime,
        position: isBuy ? 'belowBar' : 'aboveBar',
        color:    isBuy ? '#10b981' : '#ef4444',
        shape:    'arrowUp',
        text:     'BOS',
        size:     1,
      })
    }
    if (overlays?.chochPresent) {
      markers.push({
        time:     lastTime,
        position: isBuy ? 'aboveBar' : 'belowBar',
        color:    '#f59e0b',
        shape:    'circle',
        text:     'CHoCH',
        size:     1,
      })
    }
    if (overlays?.liquidityLevels?.some(l => l.swept && l.bullishSweep)) {
      markers.push({
        time:     lastTime,
        position: 'belowBar',
        color:    '#a78bfa',
        shape:    'arrowDown',
        text:     'LIQ',
        size:     1,
      })
    }

    // createSeriesMarkers is the v5 API (replaces series.setMarkers)
    if (markersRef.current) {
      markersRef.current.setMarkers(markers)
    } else if (markers.length > 0) {
      markersRef.current = createSeriesMarkers(series, markers)
    }
  }, [signal, candles])

  // ── 7. Order Block zones ───────────────────────────────────────────────────
  useEffect(() => {
    const prim = obPrimRef.current
    if (!prim) return
    const overlays = signal?.chartOverlays
    prim.setZones(overlays ? obToZones(overlays) : [])
  }, [signal])

  // ── 8. FVG zones ──────────────────────────────────────────────────────────
  useEffect(() => {
    const prim = fvgPrimRef.current
    if (!prim) return
    const overlays = signal?.chartOverlays
    prim.setZones(overlays ? fvgToZones(overlays) : [])
  }, [signal])

  const displayPrice = crosshairPrice ?? currentPrice

  return (
    <div className={cn('flex flex-col bg-[#06060b] rounded-lg overflow-hidden relative', className)}>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-900 z-10 shrink-0">
        <div className="flex items-center gap-3">
          {/* Symbol + live dot */}
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-white font-bold text-sm tracking-wider font-mono">XAU/USD</span>
          </div>

          {/* Price */}
          <span className={cn(
            'text-lg font-mono font-semibold tabular-nums',
            displayPrice > 0 ? 'text-white' : 'text-zinc-600'
          )}>
            {displayPrice > 0 ? formatGold(displayPrice) : '———'}
          </span>

          {/* Market structure badges */}
          {signal?.chartOverlays && (
            <StructureBadgeRow overlays={signal.chartOverlays} />
          )}
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

      {/* ── Chart canvas + overlays ── */}
      <div className="relative flex-1 min-h-0">
        <div ref={chartContainerRef} className="absolute inset-0" />

        {/* AI Confidence floating widget */}
        {signal && signal.direction !== 'NOTRADE' && (
          <AIConfidenceOverlay signal={signal} />
        )}

        {/* NO-TRADE indicator */}
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

// ── Sub-components ────────────────────────────────────────────────────────────

function StructureBadgeRow({ overlays }: { overlays: ChartOverlays }) {
  return (
    <div className="flex items-center gap-1.5 text-[9px] font-bold">
      <span className={cn(
        'px-1.5 py-0.5 rounded border tracking-wider',
        overlays.htfBullish
          ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
          : 'text-red-400 border-red-500/30 bg-red-500/10'
      )}>
        {overlays.htfBullish ? '▲ BULL' : '▼ BEAR'}
      </span>

      {overlays.bosPresent && (
        <span className="text-emerald-500/90 tracking-wider">BOS</span>
      )}
      {overlays.chochPresent && (
        <span className="text-amber-400/90 tracking-wider">CHoCH</span>
      )}
      {overlays.liquidityLevels?.some(l => l.swept && l.bullishSweep) && (
        <span className="text-purple-400/80 tracking-wider">LIQ.SWP</span>
      )}
    </div>
  )
}
