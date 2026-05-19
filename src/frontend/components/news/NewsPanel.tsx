'use client'

import { useTradingStore } from '@/stores/tradingStore'
import { formatDistanceToNow } from 'date-fns'
import { IMPACT_COLORS } from '@/types/trading'
import { cn } from '@/lib/utils'
import { Newspaper, Calendar, AlertCircle } from 'lucide-react'

export default function NewsPanel() {
  const { newsAlerts, upcomingEvents } = useTradingStore()

  return (
    <div className="flex flex-col bg-zinc-900/80 rounded-lg border border-zinc-800 overflow-hidden">
      {/* Tab header */}
      <div className="flex border-b border-zinc-800 text-[10px] font-bold uppercase tracking-widest">
        <div className="flex items-center gap-1.5 px-3 py-2 text-amber-400 border-b-2 border-amber-400">
          <Newspaper size={10} />
          News Feed
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 text-zinc-500">
          <Calendar size={10} />
          Calendar
          {upcomingEvents.filter(e => ['High', 'Critical'].includes(e.impact)).length > 0 && (
            <span className="ml-1 bg-red-500/20 text-red-400 rounded-full px-1 text-[9px]">
              {upcomingEvents.filter(e => ['High', 'Critical'].includes(e.impact)).length}
            </span>
          )}
        </div>
      </div>

      {/* Upcoming high-impact events */}
      {upcomingEvents.filter(e => e.impact !== 'None' && e.impact !== 'Low').length > 0 && (
        <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-800/30">
          <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-2">Upcoming Events</p>
          <div className="space-y-1.5">
            {upcomingEvents
              .filter(e => e.impact !== 'None')
              .slice(0, 5)
              .map((evt, i) => {
                const minsUntil = Math.max(0, Math.round(
                  (new Date(evt.scheduledAt).getTime() - Date.now()) / 60_000
                ))
                const isImminent = minsUntil <= 30 && ['High', 'Critical'].includes(evt.impact)
                return (
                  <div key={i} className={cn(
                    'flex items-center justify-between text-[10px] p-1.5 rounded',
                    isImminent ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-zinc-800/40'
                  )}>
                    <div className="flex items-center gap-2">
                      {isImminent && <AlertCircle size={10} className="text-amber-400 animate-pulse" />}
                      <span className="text-zinc-300">{evt.name}</span>
                      <span className="text-zinc-500 bg-zinc-700/50 px-1 rounded">{evt.currency}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('font-semibold', IMPACT_COLORS[evt.impact])}>{evt.impact}</span>
                      <span className={cn('font-mono', isImminent ? 'text-amber-400' : 'text-zinc-400')}>
                        {minsUntil}m
                      </span>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {/* News articles */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/50">
        {newsAlerts.length === 0 ? (
          <div className="p-4 text-center text-zinc-600 text-xs">No recent news</div>
        ) : (
          newsAlerts.slice(0, 30).map((news, i) => (
            <div key={i} className="px-3 py-2 hover:bg-zinc-800/30 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] text-zinc-200 leading-snug flex-1">{news.headline}</p>
                <span className={cn('text-[9px] font-bold uppercase whitespace-nowrap pt-0.5', IMPACT_COLORS[news.impact])}>
                  {news.impact}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] text-zinc-600">{news.source}</span>
                <span className="text-[9px] text-zinc-700">•</span>
                <span className="text-[9px] text-zinc-600">
                  {formatDistanceToNow(new Date(news.publishedAt), { addSuffix: true })}
                </span>
                {news.sentimentScore !== 0 && (
                  <>
                    <span className="text-[9px] text-zinc-700">•</span>
                    <span className={cn('text-[9px]', news.sentimentScore > 0 ? 'text-emerald-500' : 'text-red-500')}>
                      {news.sentimentScore > 0 ? '↑ Bullish Gold' : '↓ Bearish Gold'}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
