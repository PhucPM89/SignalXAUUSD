'use client'

import { useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import { useTradingStore } from '@/stores/tradingStore'
import type { Signal, Tick, NewsAlert, EconomicEvent } from '@/types/trading'

const HUB_URL = (process.env.NEXT_PUBLIC_HUB_URL ?? 'http://localhost:5000') + '/hubs/trading'

export function useSignalR() {
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
      .withUrl(HUB_URL)
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (ctx) => {
          const delays = [1000, 2000, 5000, 10000, 30000]
          return delays[Math.min(ctx.previousRetryCount, delays.length - 1)]
        },
      })
      .configureLogging(signalR.LogLevel.Warning)
      .build()
  }, [])

  const subscribeToGroups = useCallback(async (conn: signalR.HubConnection) => {
    await conn.invoke('SubscribeToSymbol', 'XAUUSD')
    await conn.invoke('SubscribeInstitutional')
  }, [])

  useEffect(() => {
    const conn = buildConnection()
    connectionRef.current = conn

    conn.on('OnTickReceived', (tick: Tick) => setTick(tick))
    conn.on('OnSignalReceived', (signal: Signal) => {
      if (signal.symbol === 'XAUUSD') addSignalToHistory(signal)
    })
    conn.on('OnInstitutionalSignal', (signal: Signal) => {
      if (signal.symbol === 'XAUUSD') addSignalToHistory(signal)
    })
    conn.on('OnRegimeChanged', (symbol: string, regime: string) => {
      if (symbol === 'XAUUSD') setRegime(regime as any)
    })
    conn.on('OnNewsAlert', (news: NewsAlert) => addNewsAlert(news))
    conn.on('OnEconomicEvent', (evt: EconomicEvent) => setEconomicEvents([evt]))

    conn.onreconnecting(() => setConnectionStatus('connecting'))
    conn.onreconnected(async () => {
      setConnectionStatus('connected')
      await subscribeToGroups(conn)
    })
    conn.onclose(() => setConnectionStatus('disconnected'))

    setConnectionStatus('connecting')
    conn.start()
      .then(() => {
        setConnectionStatus('connected')
        return subscribeToGroups(conn)
      })
      .catch(() => setConnectionStatus('error'))

    return () => { conn.stop() }
  }, [buildConnection, subscribeToGroups,
      setTick, addSignalToHistory, setRegime, addNewsAlert,
      setEconomicEvents, setConnectionStatus])

  return connectionRef.current
}
