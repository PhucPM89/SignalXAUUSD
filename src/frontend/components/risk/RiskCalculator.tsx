'use client'

import { useState, useMemo } from 'react'
import { useTradingStore } from '@/stores/tradingStore'
import { formatGold } from '@/types/trading'
import { GoldInstrument } from '@/lib/goldInstrument'
import { cn } from '@/lib/utils'
import { Calculator, DollarSign } from 'lucide-react'

/**
 * XAUUSD-specific position size calculator.
 * All math uses Gold constants: pip = $0.01, lot = 100oz, pipValue = $1/pip/lot.
 */
export default function RiskCalculator() {
  const { activeSignal } = useTradingStore()
  const [balance, setBalance] = useState<string>('10000')
  const [riskPct, setRiskPct] = useState<string>('1')

  const calc = useMemo(() => {
    const bal = parseFloat(balance) || 0
    const risk = parseFloat(riskPct) || 0
    if (!activeSignal || bal <= 0 || risk <= 0) return null

    const slPips = Math.abs(activeSignal.entryPrice - activeSignal.stopLoss) / 0.01
    const tpPips = Math.abs(activeSignal.takeProfit - activeSignal.entryPrice) / 0.01
    const riskDollars = bal * (risk / 100)
    const lots = riskDollars / (slPips * 1.0)    // $1/pip/lot
    const lotsRounded = Math.max(0.01, Math.min(50, Math.round(lots * 100) / 100))
    const potentialLoss = lotsRounded * slPips * 1.0
    const potentialProfit = lotsRounded * tpPips * 1.0

    return {
      lots: lotsRounded,
      slPips: slPips.toFixed(0),
      tpPips: tpPips.toFixed(0),
      slDollars: (slPips * 0.01).toFixed(2),
      tpDollars: (tpPips * 0.01).toFixed(2),
      riskDollars: potentialLoss.toFixed(2),
      rewardDollars: potentialProfit.toFixed(2),
      rr: activeSignal.riskRewardRatio.toFixed(1),
    }
  }, [activeSignal, balance, riskPct])

  return (
    <div className="bg-zinc-900/80 rounded-lg border border-zinc-800 p-3">
      <div className="flex items-center gap-1.5 mb-3">
        <Calculator size={11} className="text-amber-400" />
        <h3 className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
          Position Calculator
        </h3>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-[9px] text-zinc-500 uppercase tracking-wider">Account Balance ($)</label>
          <input
            type="number"
            value={balance}
            onChange={e => setBalance(e.target.value)}
            className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500/50"
            placeholder="10000"
          />
        </div>
        <div>
          <label className="text-[9px] text-zinc-500 uppercase tracking-wider">Risk Per Trade (%)</label>
          <input
            type="number"
            value={riskPct}
            onChange={e => setRiskPct(e.target.value)}
            step="0.1"
            min="0.1"
            max="5"
            className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500/50"
            placeholder="1"
          />
        </div>
      </div>

      {/* No signal state */}
      {!activeSignal && (
        <p className="text-center text-zinc-600 text-[11px] py-3">
          Waiting for signal to calculate position size
        </p>
      )}

      {/* Calculation results */}
      {calc && activeSignal && (
        <div className="space-y-2">
          {/* Lot size — primary output */}
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-3 text-center">
            <p className="text-[10px] text-amber-400/70 uppercase tracking-widest">Recommended Lot Size</p>
            <p className="text-2xl font-mono font-black text-amber-400">{calc.lots}</p>
            <p className="text-[10px] text-zinc-500">lots ({(calc.lots * 100).toFixed(0)} oz gold)</p>
          </div>

          {/* Risk/reward breakdown */}
          <div className="grid grid-cols-2 gap-2">
            <StatBox
              label="Risk Amount"
              value={`$${calc.riskDollars}`}
              sub={`${calc.slPips} pips ($${calc.slDollars})`}
              color="text-red-400"
            />
            <StatBox
              label="Reward Target"
              value={`$${calc.rewardDollars}`}
              sub={`${calc.tpPips} pips ($${calc.tpDollars})`}
              color="text-emerald-400"
            />
          </div>

          <div className="flex justify-between text-[10px] text-zinc-500 px-1">
            <span>Risk:Reward</span>
            <span className="text-white font-semibold">1:{calc.rr}</span>
          </div>
        </div>
      )}

      {/* Gold info footer */}
      <p className="mt-3 text-[9px] text-zinc-700 text-center">
        XAUUSD: 1 pip = $0.01 | Pip value = $1/pip/lot | 1 lot = 100 troy oz
      </p>
    </div>
  )
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-2">
      <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={cn('text-sm font-mono font-bold', color ?? 'text-white')}>{value}</p>
      {sub && <p className="text-[10px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}
