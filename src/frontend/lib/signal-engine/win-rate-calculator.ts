const PIP = 0.01
const MIN_TARGET = 15
const MAX_TARGET = 30

const REGIME_PRIORS: Record<string, number> = {
  STRONG_TREND:          0.668,
  TRENDING:              0.621,
  RANGE_BOUND:           0.513,
  VOLATILE_EXPANSION:    0.552,
  PRE_EVENT_SUPPRESSION: 0.421,
  NEWS_IMPACT:           0.478,
  LOW_LIQUIDITY:         0.351,
  MANIPULATION:          0.382,
  NORMAL:                0.541,
}

const LOG_ODDS: Record<string, number> = {
  bos_confirmed:       +0.42,
  choch_against:       -0.85,
  ob_mitigating:       +0.55,
  ob_nearby:           +0.28,
  fvg_filling:         +0.34,
  fvg_nearby:          +0.18,
  liquidity_swept:     +0.51,
  equal_highs_nearby:  +0.22,
  htf_aligned:         +0.44,
  htf_opposing:        -0.63,
  mtf_confluence:      +0.35,
  macro_3_aligned:     +0.63,
  macro_2_aligned:     +0.31,
  macro_divergent:     -0.72,
  session_overlap:     +0.29,
  session_london:      +0.18,
  session_ny:          +0.14,
  session_asia:        -0.11,
  session_dead:        -0.95,
  event_hi_lt1h:       -1.02,
  event_hi_1to2h:      -0.48,
  event_med_lt30m:     -0.31,
  vix_extreme:         -0.39,
  atr_compression:     -0.55,
  atr_expansion:       +0.18,
}

function logit(p: number): number {
  const clamped = Math.max(1e-6, Math.min(1 - 1e-6, p))
  return Math.log(clamped / (1 - clamped))
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, x))))
}

function probDelta(logitBefore: number, delta: number): number {
  return sigmoid(logitBefore + delta) - sigmoid(logitBefore)
}

export interface WinFactor {
  key: string
  label: string
  description: string
  impact_pct: number
  positive: boolean
}

export interface WinRateResult {
  regime: string
  regime_prior_pct: number
  final_probability: number
  percentage: number
  tier: 'ELITE' | 'HIGH' | 'MODERATE' | 'LOW'
  kelly_fraction: number
  quarter_kelly_pct: number
  factors: WinFactor[]
}

export interface WinRateInput {
  regime: string
  rrRatio: number
  bosConfirmed: boolean
  chochAgainst: boolean
  obMitigating: boolean
  obNearby: boolean
  fvgFilling: boolean
  fvgNearby: boolean
  liquiditySwept: boolean
  equalHighsNearby: boolean
  htfAligned: boolean
  htfOpposing: boolean
  mtfConfluence: boolean
  macroAligned: number   // 0-3
  macroDivergent: boolean
  session: string        // 'LONDON_NY_OVERLAP' | 'LONDON' | 'NY' | 'ASIA' | 'DEAD'
  eventHiLt1h: boolean
  eventHi1to2h: boolean
  eventMedLt30m: boolean
  vixExtreme: boolean
  atrCompression: boolean
  atrExpansion: boolean
}

export function calculateWinRate(input: WinRateInput): WinRateResult {
  const prior = REGIME_PRIORS[input.regime] ?? REGIME_PRIORS.NORMAL
  let currentLogit = logit(prior)
  const factors: WinFactor[] = []

  function add(key: string, active: boolean, label: string, description: string) {
    if (!active) return
    const w = LOG_ODDS[key]
    if (w === undefined) return
    const impact = probDelta(currentLogit, w)
    factors.push({ key, label, description, impact_pct: Math.round(impact * 1000) / 10, positive: w > 0 })
    currentLogit += w
  }

  add('bos_confirmed',   input.bosConfirmed,  'Break of Structure',    'Clean BOS confirms directional intent')
  add('choch_against',   input.chochAgainst,  'CHoCH Against Signal',  'Change-of-character opposing direction')
  add('ob_mitigating',   input.obMitigating,  'OB Mitigation Active',  'Price entering unmitigated order block now')
  add('ob_nearby',       input.obNearby && !input.obMitigating, 'OB Nearby', 'Unmitigated OB in close proximity')
  add('fvg_filling',     input.fvgFilling,    'FVG Fill In Progress',  'Price actively closing fair-value gap')
  add('fvg_nearby',      input.fvgNearby && !input.fvgFilling, 'FVG Present', 'FVG acts as magnet / support')
  add('liquidity_swept', input.liquiditySwept, 'Liquidity Swept',      'Equal highs/lows cleared')
  add('equal_highs_nearby', input.equalHighsNearby, 'Liquidity Pool Nearby', 'Untapped equal highs/lows as target')
  add('htf_aligned',     input.htfAligned,    'HTF Aligned',           'H4/Daily structure supports signal direction')
  add('htf_opposing',    input.htfOpposing,   'HTF Opposing',          'Higher timeframe directly opposes signal')
  add('mtf_confluence',  input.mtfConfluence, 'Multi-TF Confluence',   'M15 + H1 + H4 all structurally aligned')

  if (input.macroAligned >= 3)
    add('macro_3_aligned', true, 'Macro Trifecta', 'DXY + Yields + VIX all supporting signal direction')
  else if (input.macroAligned === 2)
    add('macro_2_aligned', true, 'Dual Macro Alignment', '2 of 3 macro factors supporting signal')
  add('macro_divergent', input.macroDivergent, 'Macro Divergence', 'Macro environment contradicts signal')

  const sessionMap: Record<string, [string, string, string]> = {
    LONDON_NY_OVERLAP: ['session_overlap', 'London/NY Overlap', 'Peak Gold liquidity 13:00–16:00 UTC'],
    LONDON:            ['session_london',  'London Session',    'Strong European institutional participation'],
    NY:                ['session_ny',      'New York Session',  'USD-driven Gold volatility'],
    ASIA:              ['session_asia',    'Asia Session',      'Reduced Gold liquidity and vol'],
    DEAD:              ['session_dead',    'Dead Session',      'Minimal liquidity — signal unreliable'],
  }
  const sm = sessionMap[input.session]
  if (sm) add(sm[0], true, sm[1], sm[2])

  add('event_hi_lt1h',   input.eventHiLt1h,  'High-Impact Event <1h',  'NFP/FOMC/CPI within 60 min — do not trade')
  add('event_hi_1to2h',  input.eventHi1to2h, 'High-Impact Event 1–2h', 'Major event approaching — elevated tail risk')
  add('event_med_lt30m', input.eventMedLt30m,'Medium Event <30m',      'Medium-impact release imminent')
  add('vix_extreme',     input.vixExtreme,   'VIX Extreme (>35)',      'Panic-driven chaos — directional edge collapses')
  add('atr_compression', input.atrCompression,'ATR Compression',       'Unusually low vol — false breakout risk')
  add('atr_expansion',   input.atrExpansion, 'ATR Expansion',          'Trending volatility favours momentum continuation')

  const finalProb = sigmoid(currentLogit)
  const p = finalProb
  const q = 1 - p
  const b = Math.max(input.rrRatio, 0.01)
  const kelly = Math.max(0, (p * b - q) / b)
  const quarterKelly = kelly * 0.25

  const tier: WinRateResult['tier'] =
    p >= 0.75 ? 'ELITE' : p >= 0.65 ? 'HIGH' : p >= 0.55 ? 'MODERATE' : 'LOW'

  const finalProbRounded = Math.round(finalProb * 10000) / 10000
  const percentageRounded = Math.round(finalProb * 100)
  return {
    regime: input.regime,
    regime_prior_pct: Math.round(prior * 1000) / 10,
    final_probability: finalProbRounded,
    percentage: percentageRounded,
    tier,
    kelly_fraction: Math.round(kelly * 10000) / 10000,
    quarter_kelly_pct: Math.round(quarterKelly * 10000) / 100,
    factors,
  }
}

// Map session string (from DetermineSession) to win-rate calc key
export function sessionToWinRateKey(session: string): string {
  const map: Record<string, string> = {
    Overlap: 'LONDON_NY_OVERLAP',
    London: 'LONDON',
    NewYork: 'NY',
    Tokyo: 'ASIA',
    Sydney: 'DEAD',
  }
  return map[session] ?? 'ASIA'
}

// Regime string to win-rate calculator regime key
export function regimeToWinRateKey(regime: string): string {
  const map: Record<string, string> = {
    Trending: 'TRENDING',
    RangeBound: 'RANGE_BOUND',
    Compression: 'PRE_EVENT_SUPPRESSION',
    Expansion: 'VOLATILE_EXPANSION',
    HighVolatility: 'VOLATILE_EXPANSION',
    LowLiquidity: 'LOW_LIQUIDITY',
    Manipulation: 'MANIPULATION',
    NewsImpact: 'NEWS_IMPACT',
  }
  return map[regime] ?? 'NORMAL'
}
