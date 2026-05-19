import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatGoldPrice(price: number): string {
  return price.toFixed(2)
}

export function pipsToPrice(pips: number): number {
  return pips * 0.01
}

export function priceToPips(priceMove: number): number {
  return priceMove / 0.01
}
