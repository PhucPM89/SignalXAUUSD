import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Signal — XAUUSD Institutional Intelligence',
  description: 'Institutional-grade AI trading intelligence for Gold (XAUUSD)',
  robots: 'noindex, nofollow',   // never index a trading terminal
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0a0f] text-white antialiased">{children}</body>
    </html>
  )
}
