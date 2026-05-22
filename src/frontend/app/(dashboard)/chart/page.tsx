'use client'

import { useEffect, useState } from 'react'
import { useTradingStore } from '@/stores/tradingStore'
import GoldChart from '@/components/charts/GoldChart'
import type { Candle } from '@/types/trading'

export default function ChartPage() {
  const { activeSignal, selectedTimeframe } = useTradingStore()
  const [candles, setCandles] = useState<Candle[]>([])

  useEffect(() => {
    fetch(`/api/market/candles?timeframe=${selectedTimeframe}&count=500`)
      .then(r => r.ok ? r.json() : [])
      .then((data: Candle[]) => setCandles(data))
      .catch(() => {})
  }, [selectedTimeframe])

  return (
    <div className="h-full">
      <GoldChart candles={candles} signal={activeSignal} className="h-full" />
    </div>
  )
}
