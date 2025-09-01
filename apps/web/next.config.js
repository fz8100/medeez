/** @type {import('next').NextConfig} */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  poweredByHeader: false,
  
  // Performance optimizations
  experimental: {
    optimizeCss: true,
    scrollRestoration: true,
  },
  
  // Image optimization
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    domains: [],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
  
  // Redirect API calls to backend
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
  
  // Environment variables validation
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version,
  },
  
  // Webpack optimizations for medical app
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Optimize bundle splitting
    config.optimization.splitChunks = {
      chunks: 'all',
      cacheGroups: {
        default: false,
        vendors: false,
        // Vendor chunk for React ecosystem
        react: {
          name: 'react',
          chunks: 'all',
          test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
          priority: 40,
          enforce: true,
        },
        // UI library chunk
        ui: {
          name: 'ui',
          chunks: 'all',
          test: /[\\/]node_modules[\\/](@radix-ui|lucide-react|framer-motion)[\\/]/,
          priority: 30,
          enforce: true,
        },
        // Medical-specific libraries
        medical: {
          name: 'medical',
          chunks: 'all',
          test: /[\\/]node_modules[\\/](react-big-calendar|react-konva|konva|react-pdf)[\\/]/,
          priority: 25,
          enforce: true,
        },
        // Common vendor chunk
        vendor: {
          name: 'vendor',
          chunks: 'all',
          test: /[\\/]node_modules[\\/]/,
          priority: 20,
          enforce: true,
        },
      },
    };
    
    // Alias for cleaner imports
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, './src'),
      '@/components': require('path').resolve(__dirname, './src/components'),
      '@/lib': require('path').resolve(__dirname, './src/lib'),
      '@/hooks': require('path').resolve(__dirname, './src/hooks'),
      '@/types': require('path').resolve(__dirname, './src/types'),
    };
    
    return config;
  },
};

module.exports = withBundleAnalyzer(nextConfig);