import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import type { Signal, Tick, NewsAlert, EconomicEvent, MarketRegime, SessionType } from '@/types/trading'

export type SignalPhase = 'OPEN' | 'BREAKEVEN' | 'TRAILING'
export type SignalCloseType = 'TP_HIT' | 'SL_HIT' | 'EXPIRED' | 'TRAILED_SL'

interface TradingState {
  // Live market data
  currentPrice: number
  bid: number
  ask: number
  spread: number
  priceChange24H: number
  priceChangePct: number
  lastTickAt: string | null

  // Signal state
  activeSignal: Signal | null
  signalPhase: SignalPhase
  signalHistory: Signal[]
  signalCount: number
  lastSignalResult: { type: SignalCloseType; pnl: number } | null

  // Market context
  currentRegime: MarketRegime | null
  currentSession: SessionType | null
  isInstitutionalHours: boolean

  // News
  newsAlerts: NewsAlert[]
  upcomingEvents: EconomicEvent[]
  hasHighImpactEventSoon: boolean

  // Correlation panel
  dxyValue: number
  dxyChange: number
  us10YYield: number
  vix: number
  isRiskOff: boolean

  // UI state
  selectedTimeframe: string
  isConnected: boolean
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
  isDarkMode: boolean

  // Actions
  setTick: (tick: Tick) => void
  setActiveSignal: (signal: Signal | null) => void
  addSignalToHistory: (signal: Signal) => void
  updateSignalSL: (newSL: number, phase: SignalPhase) => void
  closeActiveSignal: (type: SignalCloseType) => void
  setRegime: (regime: MarketRegime) => void
  setSession: (session: SessionType) => void
  addNewsAlert: (news: NewsAlert) => void
  setNewsAlerts: (alerts: NewsAlert[]) => void
  setEconomicEvents: (events: EconomicEvent[]) => void
  updateCorrelations: (dxy: number, dxyChg: number, yield10y: number, vix: number) => void
  setConnectionStatus: (status: TradingState['connectionStatus']) => void
  setTimeframe: (tf: string) => void
  toggleDarkMode: () => void
}

export const useTradingStore = create<TradingState>()(
  devtools(
    subscribeWithSelector((set) => ({
      currentPrice: 0,
      bid: 0,
      ask: 0,
      spread: 0,
      priceChange24H: 0,
      priceChangePct: 0,
      lastTickAt: null,
      activeSignal: null,
      signalPhase: 'OPEN',
      signalHistory: [],
      signalCount: 0,
      lastSignalResult: null,
      currentRegime: null,
      currentSession: null,
      isInstitutionalHours: false,
      newsAlerts: [],
      upcomingEvents: [],
      hasHighImpactEventSoon: false,
      dxyValue: 0,
      dxyChange: 0,
      us10YYield: 0,
      vix: 0,
      isRiskOff: false,
      selectedTimeframe: 'H1',
      isConnected: false,
      connectionStatus: 'disconnected',
      isDarkMode: true,

      setTick: (tick) => set({
        currentPrice:   tick.mid,
        bid:            tick.bid,
        ask:            tick.ask,
        spread:         tick.spread,
        priceChange24H: tick.change24H,
        priceChangePct: tick.changePct24H,
        lastTickAt:     tick.timestamp,
      }),

      setActiveSignal: (signal) => set({ activeSignal: signal }),

      addSignalToHistory: (signal) => set((s) => {
        const isTradeable = signal.direction === 'BUY' || signal.direction === 'SELL'
        return {
          signalHistory:    isTradeable ? [signal, ...s.signalHistory].slice(0, 100) : s.signalHistory,
          signalCount:      isTradeable ? s.signalCount + 1 : s.signalCount,
          activeSignal:     signal,
          signalPhase:      isTradeable ? 'OPEN' : s.signalPhase,
          lastSignalResult: isTradeable ? null : s.lastSignalResult,
          currentSession:   signal.session ?? s.currentSession,
          currentRegime:    signal.regime  ?? s.currentRegime,
        }
      }),

      // Move SL in-place on the active signal (breakeven / trailing)
      updateSignalSL: (newSL, phase) => set((s) => {
        if (!s.activeSignal) return {}
        return {
          activeSignal: { ...s.activeSignal, stopLoss: Math.round(newSL * 100) / 100 },
          signalPhase: phase,
        }
      }),

      closeActiveSignal: (type) => set((s) => {
        if (!s.activeSignal) return {}
        const sig   = s.activeSignal
        const isBuy = sig.direction === 'BUY'
        let pnl: number
        if (type === 'TP_HIT') {
          pnl = isBuy ? sig.takeProfit - sig.entryPrice : sig.entryPrice - sig.takeProfit
        } else if (type === 'EXPIRED') {
          pnl = 0
        } else {
          // SL_HIT or TRAILED_SL — use current (possibly trailed) SL
          pnl = isBuy ? sig.stopLoss - sig.entryPrice : sig.entryPrice - sig.stopLoss
        }
        return {
          lastSignalResult: { type, pnl: Math.round(pnl * 100) / 100 },
          activeSignal:     null,
          signalPhase:      'OPEN',
        }
      }),

      setRegime: (regime) => set({
        currentRegime:        regime,
        isInstitutionalHours: new Date().getUTCHours() >= 8 && new Date().getUTCHours() <= 20,
      }),

      setSession: (session) => set({ currentSession: session }),

      addNewsAlert: (news) => set((s) => ({
        newsAlerts: [news, ...s.newsAlerts].slice(0, 50),
      })),

      setNewsAlerts: (alerts) => set({ newsAlerts: alerts }),

      setEconomicEvents: (events) => set({
        upcomingEvents: events,
        hasHighImpactEventSoon: events.some((e) => {
          const minsUntil = (new Date(e.scheduledAt).getTime() - Date.now()) / 60_000
          return minsUntil <= 30 && minsUntil >= 0 && ['High', 'Critical'].includes(e.impact)
        }),
      }),

      updateCorrelations: (dxy, dxyChg, yield10y, vix) => set({
        dxyValue:   dxy,
        dxyChange:  dxyChg,
        us10YYield: yield10y,
        vix,
        isRiskOff:  vix > 25,
      }),

      setConnectionStatus: (status) => set({
        connectionStatus: status,
        isConnected:      status === 'connected',
      }),

      setTimeframe:   (tf) => set({ selectedTimeframe: tf }),
      toggleDarkMode: () => set((s) => ({ isDarkMode: !s.isDarkMode })),
    })),
    { name: 'XAUUSDTradingStore' }
  )
)
