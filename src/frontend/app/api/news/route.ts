import { NextResponse } from 'next/server'
import { fetchGoldNews } from '@/lib/market-data'

export async function GET() {
  const news = await fetchGoldNews()
  return NextResponse.json(news)
}
