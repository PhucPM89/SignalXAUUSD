'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTradingStore } from '@/stores/tradingStore'

const TABS = [
  { href: '/',        label: 'Signal'  },
  { href: '/chart',   label: 'Chart'   },
  { href: '/intel',   label: 'Intel'   },
  { href: '/history', label: 'History' },
] as const

export default function TerminalNav() {
  const pathname = usePathname()
  const hasActiveSignal = useTradingStore(s =>
    s.activeSignal !== null && s.activeSignal.direction !== 'NOTRADE'
  )

  return (
    <nav className="h-9 bg-[#0c0c12] border-b border-zinc-800/60 flex items-end px-4 gap-0 flex-shrink-0">
      {TABS.map(tab => {
        const isActive = tab.href === '/'
          ? pathname === '/'
          : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'relative px-4 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.12em]',
              'border-b-2 -mb-px transition-colors duration-150',
              isActive
                ? 'text-white border-zinc-300'
                : 'text-zinc-600 border-transparent hover:text-zinc-400 hover:border-zinc-700',
            )}
          >
            {tab.label}
            {tab.href === '/' && hasActiveSignal && !isActive && (
              <span className="absolute top-1.5 right-2 w-1 h-1 rounded-full bg-emerald-500" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
