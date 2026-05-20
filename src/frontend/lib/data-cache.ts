/**
 * Shared in-memory cache for expensive external data fetches.
 *
 * On Vercel, multiple API routes run in the same Node.js process on a warm
 * instance. Without this cache, routes like /api/signals/generate and
 * /api/signals/winrate each independently call Yahoo Finance even when they
 * fire seconds apart. This module deduplicates those calls.
 *
 * TTLs match the revalidate windows already set in market-data.ts.
 */

import { fetchCandles, fetchCorrelations } from './market-data'
import type { CandleData, CorrelationSnapshot } from './market-data'

interface CacheEntry<T> {
  data: T
  ts:   number
}

const CANDLE_TTL = 30_000   // 30 s — matches fetchCandles revalidate
const CORR_TTL   = 60_000   // 60 s — matches fetchSymbolHourly revalidate

const _candles = new Map<string, CacheEntry<CandleData[]>>()
let   _corr:    CacheEntry<CorrelationSnapshot> | null = null

/** Returns candles from cache if fresh; otherwise fetches and caches. */
export async function getCachedCandles(
  symbol: string,
  tf:     string,
  count:  number,
): Promise<CandleData[]> {
  const key = `${symbol}:${tf}:${count}`
  const hit = _candles.get(key)
  if (hit && Date.now() - hit.ts < CANDLE_TTL) return hit.data
  const data = await fetchCandles(symbol, tf, count)
  _candles.set(key, { data, ts: Date.now() })
  return data
}

/** Returns correlations from cache if fresh; otherwise fetches and caches. */
export async function getCachedCorrelations(): Promise<CorrelationSnapshot> {
  if (_corr && Date.now() - _corr.ts < CORR_TTL) return _corr.data
  const data = await fetchCorrelations()
  _corr = { data, ts: Date.now() }
  return data
}
