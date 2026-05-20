/**
 * ZonePrimitive — lightweight-charts v5 series primitive that draws
 * time-bounded, price-bounded filled rectangles for Order Blocks and FVGs.
 *
 * Each zone spans from its formation candle to the right edge of the
 * visible chart, between its top and bottom price levels.
 */
import type {
  ISeriesPrimitive,
  ISeriesPrimitiveBase,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'

export interface ZoneInput {
  startTimeTs: number   // Unix seconds — left edge of the rectangle
  priceTop: number
  priceBottom: number
  fillColor: string     // e.g. 'rgba(16,185,129,0.15)'
  borderColor: string   // e.g. 'rgba(16,185,129,0.5)'
}

interface ComputedZone {
  xLeft: number   // CSS px — left edge (clamped to 0 if off-screen)
  yTop: number    // CSS px
  yBottom: number // CSS px
  fillColor: string
  borderColor: string
}

// ── Renderer: does the actual canvas drawing ──────────────────────────────────

class ZoneRenderer implements IPrimitivePaneRenderer {
  private _zones: ComputedZone[]

  constructor(zones: ComputedZone[]) {
    this._zones = zones
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace(scope => {
      const { context, bitmapSize, verticalPixelRatio, horizontalPixelRatio } = scope as {
        context: CanvasRenderingContext2D
        bitmapSize: { width: number; height: number }
        verticalPixelRatio: number
        horizontalPixelRatio: number
      }

      this._zones.forEach(z => {
        const top    = Math.min(z.yTop, z.yBottom) * verticalPixelRatio
        const bottom = Math.max(z.yTop, z.yBottom) * verticalPixelRatio
        const height = bottom - top
        const left   = Math.max(0, z.xLeft) * horizontalPixelRatio
        const width  = bitmapSize.width - left
        if (height < 1 || width < 1) return

        context.save()

        // Filled background
        context.fillStyle = z.fillColor
        context.fillRect(left, top, width, height)

        // Top and bottom border lines
        context.strokeStyle = z.borderColor
        context.lineWidth   = Math.max(1, verticalPixelRatio * 0.75)
        context.setLineDash([])
        context.beginPath()
        context.moveTo(left, top)
        context.lineTo(left + width, top)
        context.moveTo(left, bottom)
        context.lineTo(left + width, bottom)
        context.stroke()

        // Left edge marker
        context.lineWidth = Math.max(1.5, horizontalPixelRatio)
        context.beginPath()
        context.moveTo(left, top)
        context.lineTo(left, bottom)
        context.stroke()

        context.restore()
      })
    })
  }
}

// ── Pane view: provides the renderer and specifies draw order ─────────────────

class ZonePaneView implements IPrimitivePaneView {
  private _renderer: ZoneRenderer

  constructor(zones: ComputedZone[]) {
    this._renderer = new ZoneRenderer(zones)
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer
  }

  zOrder(): 'bottom' {
    return 'bottom'   // drawn behind candle bodies and wicks
  }
}

// ── Public primitive class ────────────────────────────────────────────────────
//
// v5 type hierarchy:
//   ISeriesPrimitive<HorzScaleItem> = ISeriesPrimitiveBase<SeriesAttachedParameter<HorzScaleItem, SeriesType>>

type AttachParam = SeriesAttachedParameter<Time>

export class ZonePrimitive implements ISeriesPrimitiveBase<AttachParam> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _series: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _chart: any = null
  private _zones: ZoneInput[] = []
  private _computed: ComputedZone[] = []
  private _requestUpdate?: () => void

  constructor(zones: ZoneInput[] = []) {
    this._zones = zones
  }

  attached(param: AttachParam): void {
    this._series = param.series
    this._chart  = param.chart
    this._requestUpdate = param.requestUpdate
    this.updateAllViews?.()
  }

  detached(): void {
    this._series = null
    this._chart  = null
    this._requestUpdate = undefined
  }

  setZones(zones: ZoneInput[]): void {
    this._zones = zones
    this._requestUpdate?.()
  }

  updateAllViews(): void {
    if (!this._series || !this._chart) {
      this._computed = []
      return
    }

    const timeScale = this._chart.timeScale()

    this._computed = this._zones
      .map((z): ComputedZone | null => {
        const yTop    = this._series.priceToCoordinate(z.priceTop)    as number | null
        const yBottom = this._series.priceToCoordinate(z.priceBottom) as number | null
        if (yTop === null || yBottom === null) return null

        // If the formation candle is off-screen to the left, start from edge (0)
        const xLeftRaw = timeScale.timeToCoordinate(z.startTimeTs as Time) as number | null
        const xLeft    = xLeftRaw !== null ? xLeftRaw : 0

        return { xLeft, yTop, yBottom, fillColor: z.fillColor, borderColor: z.borderColor }
      })
      .filter((z): z is ComputedZone => z !== null)
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [new ZonePaneView(this._computed)]
  }
}
