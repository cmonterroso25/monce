import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp'],
  outputFileTracingIncludes: {
    '/**': ['./node_modules/sharp/**/*', './node_modules/@img/**/*'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}
export default nextConfig
