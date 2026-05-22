'use client'

import { useLiveData } from '@/hooks/useLiveData'
import StatusBar from '@/components/layout/StatusBar'
import TerminalNav from '@/components/layout/TerminalNav'

function DataProvider() {
  useLiveData()
  return null
}

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen bg-[#0a0a0f] text-white flex flex-col overflow-hidden">
      <DataProvider />
      <StatusBar />
      <TerminalNav />
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
