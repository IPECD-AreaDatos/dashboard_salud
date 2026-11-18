/*next.config.ts*/
import type { NextConfig } from "next";

const nextConfig = {
  basePath: '/salud-dashboard',
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
  // Esto es vital para que las imágenes y links no rompan
  assetPrefix: '/salud-dashboard', 

  /* 👈 NUEVO: Redirección automática de la ruta vieja a la raíz unificada */
  async redirects() {
    return [
      {
        source: '/login',      // Next.js automáticamente le antepone el basePath, interceptando /salud-dashboard/login
        destination: '/',      // Lo manda a la raíz unificada, que resuelve en /salud-dashboard
        permanent: true,       // Informa al navegador que la mudanza del enlace es definitiva
      },
    ];
  },
} satisfies NextConfig;

export default nextConfig;
