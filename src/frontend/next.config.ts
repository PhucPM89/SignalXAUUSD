import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000'
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/v1/:path*`,
      },
    ]
  },
}

export default nextConfig
