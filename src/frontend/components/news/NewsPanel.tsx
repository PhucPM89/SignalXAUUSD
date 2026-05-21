'use client'

import { useState } from 'react'
import { useTradingStore } from '@/stores/tradingStore'
import { formatDistanceToNow, format, isToday, isTomorrow, isPast } from 'date-fns'
import { IMPACT_COLORS } from '@/types/trading'
import { cn } from '@/lib/utils'
import { Newspaper, Calendar, AlertCircle, Clock } from 'lucide-react'
import type { NewsAlert, EconomicEvent } from '@/types/trading'

type Tab = 'news' | 'calendar'

export default function NewsPanel() {
  const { newsAlerts, upcomingEvents } = useTradingStore()
  const [activeTab, setActiveTab] = useState<Tab>('news')

  const highImpactCount = upcomingEvents.filter(
    e => ['High', 'Critical'].includes(e.impact) && !isPast(new Date(e.scheduledAt))
  ).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab header */}
      <div className="flex border-b border-zinc-800/60 flex-shrink-0">
        <button
          onClick={() => setActiveTab('news')}
          className={cn(
            'flex items-center gap-1 px-3 py-2 text-[9px] font-bold uppercase tracking-widest transition-colors',
            activeTab === 'news'
              ? 'text-zinc-200 border-b border-zinc-400'
              : 'text-zinc-600 hover:text-zinc-400',
          )}
        >
          <Newspaper size={9} />
          News
          {newsAlerts.length > 0 && (
            <span className="ml-1 text-zinc-600 font-mono text-[8px]">{newsAlerts.length}</span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('calendar')}
          className={cn(
            'flex items-center gap-1 px-3 py-2 text-[9px] font-bold uppercase tracking-widest transition-colors',
            activeTab === 'calendar'
              ? 'text-zinc-200 border-b border-zinc-400'
              : 'text-zinc-600 hover:text-zinc-400',
          )}
        >
          <Calendar size={9} />
          Calendar
          {highImpactCount > 0 && (
            <span className="ml-1 text-red-400 font-mono text-[8px]">{highImpactCount}</span>
          )}
        </button>
      </div>

      {/* Imminent event banner — shown in both tabs */}
      <ImminentEventBanner events={upcomingEvents} />

      {/* Content */}
      {activeTab === 'news' ? (
        <NewsFeed alerts={newsAlerts} />
      ) : (
        <CalendarView events={upcomingEvents} />
      )}
    </div>
  )
}

// ── Imminent event banner ──────────────────────────────────────────────────────

function ImminentEventBanner({ events }: { events: EconomicEvent[] }) {
  const upcoming = events
    .filter(e => {
      const minsUntil = (new Date(e.scheduledAt).getTime() - Date.now()) / 60_000
      return minsUntil >= 0 && minsUntil <= 60 && ['High', 'Critical', 'Medium'].includes(e.impact)
    })
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, 3)

  if (upcoming.length === 0) return null

  return (
    <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-800/30 flex-shrink-0">
      <p className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
        <AlertCircle size={8} className="text-amber-400" />
        Upcoming Events
      </p>
      <div className="space-y-1">
        {upcoming.map((evt, i) => {
          const minsUntil = Math.max(0, Math.round(
            (new Date(evt.scheduledAt).getTime() - Date.now()) / 60_000
          ))
          const isHot = minsUntil <= 30 && ['High', 'Critical'].includes(evt.impact)
          return (
            <div key={i} className={cn(
              'flex items-center justify-between text-[10px] px-2 py-1 rounded',
              isHot ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-zinc-800/40'
            )}>
              <div className="flex items-center gap-1.5 min-w-0">
                {isHot && <AlertCircle size={9} className="text-amber-400 animate-pulse flex-shrink-0" />}
                <span className={cn('font-bold flex-shrink-0', IMPACT_COLORS[evt.impact])}>{evt.impact}</span>
                <span className="text-zinc-500 flex-shrink-0">{evt.currency}</span>
                <span className="text-zinc-300 truncate">{evt.name}</span>
              </div>
              <span className={cn('font-mono font-bold ml-2 flex-shrink-0', isHot ? 'text-amber-400' : 'text-zinc-400')}>
                {minsUntil}m
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── News Feed ──────────────────────────────────────────────────────────────────

function NewsFeed({ alerts }: { alerts: NewsAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs">
        No recent news
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/30">
      {alerts.slice(0, 30).map((news, i) => (
        <div key={i} className="px-3 py-2 hover:bg-zinc-800/20 transition-colors">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <p className="text-[10px] text-zinc-300 leading-snug flex-1">{news.headline}</p>
            <span className={cn('text-[8px] font-bold uppercase whitespace-nowrap pt-0.5 flex-shrink-0', IMPACT_COLORS[news.impact])}>
              {news.impact}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[8px] text-zinc-600">
            <span>{news.source}</span>
            <span className="text-zinc-800">·</span>
            <span>{formatDistanceToNow(new Date(news.publishedAt), { addSuffix: true })}</span>
            {news.sentimentScore !== 0 && (
              <>
                <span className="text-zinc-800">·</span>
                <span className={news.sentimentScore > 0 ? 'text-emerald-500/70' : 'text-red-500/70'}>
                  {news.sentimentScore > 0 ? '↑ Bullish' : '↓ Bearish'}
                </span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Calendar View ──────────────────────────────────────────────────────────────

function CalendarView({ events }: { events: EconomicEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-zinc-600 text-xs p-4 text-center">
        <Calendar size={24} className="text-zinc-700" />
        <p>No events loaded yet</p>
        <p className="text-[10px] text-zinc-700">Calendar updates every 30 minutes</p>
      </div>
    )
  }

  // Group events by day
  const grouped = events.reduce<Record<string, typeof events>>((acc, evt) => {
    const day = format(new Date(evt.scheduledAt), 'yyyy-MM-dd')
    acc[day] = acc[day] ?? []
    acc[day].push(evt)
    return acc
  }, {})

  const days = Object.keys(grouped).sort()

  return (
    <div className="flex-1 overflow-y-auto">
      {days.map(day => {
        const date = new Date(day + 'T12:00:00Z')
        const label = isToday(date) ? 'Today' : isTomorrow(date) ? 'Tomorrow' : format(date, 'EEE, MMM d')

        return (
          <div key={day}>
            {/* Day header */}
            <div className="sticky top-0 px-3 py-1 bg-zinc-800/90 backdrop-blur-sm border-b border-zinc-700/50">
              <span className={cn(
                'text-[10px] font-bold uppercase tracking-widest',
                isToday(date) ? 'text-amber-400' : 'text-zinc-400'
              )}>
                {label}
              </span>
            </div>

            {/* Events for this day */}
            <div className="divide-y divide-zinc-800/40">
              {grouped[day].map((evt, i) => {
                const past    = isPast(new Date(evt.scheduledAt))
                const minsUntil = Math.max(0, Math.round(
                  (new Date(evt.scheduledAt).getTime() - Date.now()) / 60_000
                ))
                const isImminent = !past && minsUntil <= 30 && ['High', 'Critical'].includes(evt.impact)

                return (
                  <div
                    key={i}
                    className={cn(
                      'px-3 py-2 transition-colors',
                      isImminent ? 'bg-amber-500/5 border-l-2 border-amber-500/50' : '',
                      past ? 'opacity-50' : 'hover:bg-zinc-800/30'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isImminent && <AlertCircle size={9} className="text-amber-400 animate-pulse flex-shrink-0" />}
                        <span className={cn(
                          'text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0',
                          IMPACT_COLORS[evt.impact],
                          'bg-zinc-800'
                        )}>
                          {evt.impact}
                        </span>
                        <span className="text-zinc-600 text-[9px] flex-shrink-0 bg-zinc-800 px-1 py-0.5 rounded">
                          {evt.currency}
                        </span>
                        <span className="text-zinc-200 text-[11px] truncate">{evt.name}</span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Clock size={9} className="text-zinc-600" />
                        <span className={cn(
                          'text-[10px] font-mono',
                          isImminent ? 'text-amber-400 font-bold' : past ? 'text-zinc-600' : 'text-zinc-400'
                        )}>
                          {isImminent
                            ? `${minsUntil}m`
                            : format(new Date(evt.scheduledAt), 'HH:mm')}
                        </span>
                      </div>
                    </div>

                    {/* Forecast / Previous */}
                    {(evt.forecast != null || evt.previous != null) && (
                      <div className="flex gap-3 mt-1 ml-5">
                        {evt.forecast != null && (
                          <span className="text-[9px] text-zinc-500">
                            F: <span className="text-zinc-400">{String(evt.forecast)}</span>
                          </span>
                        )}
                        {evt.previous != null && (
                          <span className="text-[9px] text-zinc-500">
                            P: <span className="text-zinc-400">{String(evt.previous)}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
