import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}
export default nextConfig
