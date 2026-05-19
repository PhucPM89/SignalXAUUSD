// ── Core XAUUSD Trading Types ─────────────────────────────────────────────────

export type SignalDirection = 'BUY' | 'SELL' | 'NOTRADE'
export type SignalStrength = 'Weak' | 'Moderate' | 'Strong' | 'Institutional'
export type MarketRegime =
  | 'Trending' | 'RangeBound' | 'Compression' | 'Expansion'
  | 'HighVolatility' | 'LowLiquidity' | 'Manipulation' | 'NewsImpact'
export type SessionType = 'Sydney' | 'Tokyo' | 'London' | 'NewYork' | 'Overlap' | 'OffSession'
export type NewsImpact = 'None' | 'Low' | 'Medium' | 'High' | 'Critical'

export interface SignalReasoning {
  htfBias: string
  liquidityNarrative: string
  macroContext: string
  newsContext: string
  entryTrigger: string
  riskJustification: string
  bullishFactors: string[]
  bearishFactors: string[]
  riskWarnings: string[]
  volatilityWarning: string
}

export interface Correlations {
  dxyValue: number
  dxyChange1H: number
  us10YYield: number
  us10YChange1H: number
  vix: number
  spxChange1D: number
  isRiskOff: boolean
  isRiskOn: boolean
}

export interface Volatility {
  atr1H: number
  atr4H: number
  adrPercent: number
  isExpanding: boolean
  isContracting: boolean
  regime: string
}

export interface WinRateFactor {
  key: string
  label: string
  description: string
  impact_pct: number
  positive: boolean
}

export interface WinRate {
  regime: string
  regime_prior_pct: number
  final_probability: number
  percentage: number
  tier: 'ELITE' | 'HIGH' | 'MODERATE' | 'LOW'
  kelly_fraction: number
  quarter_kelly_pct: number
  factors: WinRateFactor[]
}

export interface Signal {
  id: string
  symbol: 'XAUUSD'
  direction: SignalDirection
  strength: SignalStrength
  entryPrice: number
  stopLoss: number
  takeProfit: number
  riskRewardRatio: number
  winProbability: number
  expectedValue: number
  confidenceScore: number
  regime: MarketRegime
  session: SessionType
  macroSentiment: string
  newsImpact: NewsImpact
  isInstitutionalGrade: boolean
  reasoning: SignalReasoning
  correlations: Correlations
  volatility: Volatility
  winRate?: WinRate
  generatedAt: string
  expiresAt: string
}

export interface Candle {
  time: number     // Unix timestamp
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Tick {
  symbol: string
  bid: number
  ask: number
  mid: number
  spread: number
  timestamp: string
}

export interface NewsAlert {
  headline: string
  source: string
  impact: NewsImpact
  sentimentScore: number
  publishedAt: string
}

export interface EconomicEvent {
  name: string
  currency: string
  impact: NewsImpact
  scheduledAt: string
  actual?: number
  forecast?: number
}

// Gold-specific display helpers
export const GOLD_PIP = 0.01
export const formatGold = (price: number) => price.toFixed(2)
export const formatPips = (pips: number) => `${pips.toFixed(0)} pips`
export const formatDollar = (pips: number) => `$${(pips * GOLD_PIP).toFixed(2)}`

export const REGIME_COLORS: Record<MarketRegime, string> = {
  Trending: 'text-emerald-400',
  RangeBound: 'text-yellow-400',
  Compression: 'text-orange-400',
  Expansion: 'text-blue-400',
  HighVolatility: 'text-red-400',
  LowLiquidity: 'text-zinc-400',
  Manipulation: 'text-purple-400',
  NewsImpact: 'text-amber-400',
}

export const IMPACT_COLORS: Record<NewsImpact, string> = {
  None: 'text-zinc-500',
  Low: 'text-zinc-300',
  Medium: 'text-yellow-400',
  High: 'text-orange-400',
  Critical: 'text-red-400',
}
