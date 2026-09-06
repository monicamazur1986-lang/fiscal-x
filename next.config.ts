import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.imgur.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'prudentopolis.pr.gov.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'brasilapi.com.br',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Indicador de desenvolvimento do Next.js (bolinha "N" no canto) — só
  // aparece com `npm run dev`, nunca em produção; desligado por ser só ruído
  // visual durante os testes.
  devIndicators: false,
};

export default nextConfig;
