import { NextResponse } from 'next/server'
import { fetchCorrelations } from '@/lib/market-data'

export async function GET() {
  const data = await fetchCorrelations()
  return NextResponse.json(data)
}
