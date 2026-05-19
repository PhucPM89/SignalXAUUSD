'use client'

import { useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useTradingStore } from '@/stores/tradingStore'
import type { Signal, Tick, NewsAlert, EconomicEvent } from '@/types/trading'

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'http://localhost:5000/hubs/trading'

/**
 * Manages a single persistent SignalR connection for the XAUUSD dashboard.
 *
 * Connection strategy:
 *  - Automatic reconnection with exponential backoff (1s, 2s, 5s, 10s, 30s)
 *  - JWT token auto-refresh via tokenFactory
 *  - Re-subscribes to "symbol:XAUUSD" and "institutional" groups after reconnect
 *  - Hub messages fan out to Zustand store (no prop drilling)
 */
export function useSignalR(accessToken: string) {
  const connectionRef = useRef<signalR.HubConnection | null>(null)
  const {
    setTick,
    addSignalToHistory,
    setRegime,
    addNewsAlert,
    setEconomicEvents,
    setConnectionStatus,
  } = useTradingStore()

  const buildConnection = useCallback(() => {
    return new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL, {
        accessTokenFactory: () => accessToken,
        transport: signalR.HttpTransportType.WebSockets,
        skipNegotiation: true,   // skip long-poll negotiation → reduces connection latency by ~200ms
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (ctx) => {
          const delays = [1000, 2000, 5000, 10000, 30000]
          return delays[Math.min(ctx.previousRetryCount, delays.length - 1)]
        },
      })
      .configureLogging(signalR.LogLevel.Warning)
      .build()
  }, [accessToken])

  const subscribeToGroups = useCallback(async (conn: signalR.HubConnection) => {
    await conn.invoke('SubscribeToSymbol', 'XAUUSD')
    await conn.invoke('SubscribeInstitutional')
  }, [])

  useEffect(() => {
    if (!accessToken) return

    const conn = buildConnection()
    connectionRef.current = conn

    // ── Event handlers ────────────────────────────────────────────────────────
    conn.on('OnTickReceived', (tick: Tick) => {
      setTick(tick)
    })

    conn.on('OnSignalReceived', (signal: Signal) => {
      if (signal.symbol === 'XAUUSD') {
        addSignalToHistory(signal)
      }
    })

    conn.on('OnInstitutionalSignal', (signal: Signal) => {
      if (signal.symbol === 'XAUUSD') {
        addSignalToHistory(signal)
        // Browser notification for high-confidence signals
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(`🔔 XAUUSD ${signal.direction} Signal`, {
            body: `Entry: $${signal.entryPrice.toFixed(2)} | Confidence: ${signal.confidenceScore}%`,
            icon: '/gold-icon.png',
          })
        }
      }
    })

    conn.on('OnRegimeChanged', (symbol: string, regime: string) => {
      if (symbol === 'XAUUSD') setRegime(regime as any)
    })

    conn.on('OnNewsAlert', (news: NewsAlert) => {
      addNewsAlert(news)
    })

    conn.on('OnEconomicEvent', (evt: EconomicEvent) => {
      // Update upcoming events list via store
      setEconomicEvents([evt])
    })

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    conn.onreconnecting(() => setConnectionStatus('connecting'))
    conn.onreconnected(async () => {
      setConnectionStatus('connected')
      await subscribeToGroups(conn)
    })
    conn.onclose(() => setConnectionStatus('disconnected'))

    // ── Start ──────────────────────────────────────────────────────────────────
    setConnectionStatus('connecting')
    conn.start()
      .then(() => {
        setConnectionStatus('connected')
        return subscribeToGroups(conn)
      })
      .catch(() => setConnectionStatus('error'))

    return () => {
      conn.stop()
    }
  }, [accessToken, buildConnection, subscribeToGroups,
      setTick, addSignalToHistory, setRegime, addNewsAlert,
      setEconomicEvents, setConnectionStatus])

  return connectionRef.current
}
