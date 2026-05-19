/**
 * XAUUSD instrument constants — mirrors Signal.Domain.Entities.GoldInstrument
 * Single source of truth for Gold math in the frontend.
 */
export const GoldInstrument = {
  Symbol: 'XAUUSD',
  PipSize: 0.01,
  PipValuePerLot: 1.0,    // $1 per pip per standard lot
  ContractSize: 100,       // 100 troy oz
  Decimals: 2,
  TypicalSpread: 0.25,

  MinTargetDollars: 15,
  MaxTargetDollars: 30,

  calculateLotSize(balance: number, riskPct: number, slPips: number): number {
    if (slPips <= 0) return 0
    const riskDollars = balance * (riskPct / 100)
    const lots = riskDollars / (slPips * this.PipValuePerLot)
    return Math.round(Math.max(0.01, Math.min(50, lots)) * 100) / 100
  },

  pipsToPrice(pips: number): number {
    return pips * this.PipSize
  },

  priceToPips(priceMove: number): number {
    return Math.abs(priceMove) / this.PipSize
  },
} as const
