import { create } from 'zustand'
import { devtools, subscribeWithSelector, persist, createJSONStorage } from 'zustand/middleware'
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
  onlineUsers: number
  totalVisits: number

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
  setTimeframe:   (tf: string) => void
  toggleDarkMode: () => void
  setOnlineUsers: (n: number) => void
  setTotalVisits: (n: number) => void
}

export const useTradingStore = create<TradingState>()(
  devtools(
    persist(
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
      onlineUsers: 0,
      totalVisits: 0,

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
        const isTradeable    = signal.direction === 'BUY' || signal.direction === 'SELL'
        const hasActiveTrade = s.activeSignal?.direction === 'BUY' || s.activeSignal?.direction === 'SELL'

        // Replacement policy constants (tweak as needed)
        const REPLACE_MIN_AGE_MS = 5 * 60_000           // don't replace within first 5 minutes unless institutional upgrade
        const CONFIDENCE_DELTA = 12                     // incoming must beat current by this to replace
        const DIRECTION_CONFIDENCE_DELTA = 20           // stronger threshold for opposite-direction replacement

        function shouldReplace(existing: Signal | null, incoming: Signal): {ok: boolean; reason?: string} {
          if (!existing) return { ok: true, reason: 'no existing' }
          // If existing is not a tradeable signal, allow replace
          const existingIsTradeable = existing.direction === 'BUY' || existing.direction === 'SELL'
          if (!existingIsTradeable) return { ok: true, reason: 'existing not tradeable' }

          const now = Date.now()
          const existingExpired = now > new Date(existing.expiresAt).getTime()
          if (existingExpired) return { ok: true, reason: 'existing expired' }

          const age = now - new Date(existing.generatedAt).getTime()
          const incomingInstitutionalUpgrade = !!incoming.isInstitutionalGrade && !existing.isInstitutionalGrade
          const incomingConf = incoming.confidenceScore ?? 0
          const existingConf = existing.confidenceScore ?? 0
          const confidentUpgrade = incomingConf >= existingConf + CONFIDENCE_DELTA
          const directionFlipUpgrade = incoming.direction !== existing.direction && incomingConf >= existingConf + DIRECTION_CONFIDENCE_DELTA

          if (incomingInstitutionalUpgrade) return { ok: true, reason: 'institutional upgrade' }
          if (confidentUpgrade) {
            if (age >= REPLACE_MIN_AGE_MS) return { ok: true, reason: 'confidence upgrade after min age' }
            return { ok: false, reason: 'confidence upgrade too soon' }
          }
          if (directionFlipUpgrade) {
            if (age >= REPLACE_MIN_AGE_MS) return { ok: true, reason: 'direction flip with strong confidence after min age' }
            return { ok: false, reason: 'direction flip too soon' }
          }

          return { ok: false, reason: 'no replacement criteria met' }
        }

        // Decide new activeSignal according to policy
        let newActive = s.activeSignal
        let replaceReason: string | undefined
        if (isTradeable) {
          if (!hasActiveTrade) {
            newActive = signal
            replaceReason = 'no active trade'
          } else {
            const check = shouldReplace(s.activeSignal, signal)
            if (check.ok) {
              newActive = signal
              replaceReason = check.reason
            } else {
              newActive = s.activeSignal
            }
          }
        } else {
          // incoming NOTRADE never overwrites an existing active trade
          newActive = isTradeable || !hasActiveTrade ? signal : s.activeSignal
        }

        if (replaceReason) {
          try {
            // Lightweight audit log in the browser console for troubleshooting
            // eslint-disable-next-line no-console
            console.info('[signals] replace activeSignal', {
              oldId: s.activeSignal?.id,
              oldGeneratedAt: s.activeSignal?.generatedAt,
              oldExpiresAt: s.activeSignal?.expiresAt,
              oldConf: s.activeSignal?.confidenceScore,
              newId: signal.id,
              newGeneratedAt: signal.generatedAt,
              newExpiresAt: signal.expiresAt,
              newConf: signal.confidenceScore,
              reason: replaceReason,
            })
          } catch {}
        }

        return {
          signalHistory:    isTradeable ? [signal, ...s.signalHistory].slice(0, 100) : s.signalHistory,
          signalCount:      isTradeable ? s.signalCount + 1 : s.signalCount,
          // Apply replacement policy: only set activeSignal to incoming when allowed by policy
          activeSignal:     newActive,
          signalPhase:      isTradeable && newActive === signal ? 'OPEN' : s.signalPhase,
          lastSignalResult: isTradeable && newActive === signal ? null : s.lastSignalResult,
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
      setOnlineUsers: (n) => set({ onlineUsers: n }),
      setTotalVisits: (n) => set({ totalVisits: n }),
    })),
      {
        name: 'xauusd-signal-store',
        storage: createJSONStorage(() => localStorage),
        // Only persist signal history — live market data is always re-fetched
        partialize: (state) => ({
          signalHistory: state.signalHistory,
          signalCount:   state.signalCount,
        }),
        onRehydrateStorage: () => (state) => {
          if (!state) return
          // Drop signals older than 7 days so localStorage doesn't grow stale
          const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
          state.signalHistory = state.signalHistory.filter(
            s => new Date(s.generatedAt).getTime() > cutoff
          )
        },
      }
    ),
    { name: 'XAUUSDTradingStore' }
  )
)
