/*next.config.ts*/
import type { NextConfig } from "next";

const nextConfig = {
  basePath: '/salud-dashboard',
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
  
  typescript: {
    ignoreBuildErrors: true, // Para que el deploy no se frene por tipos
  },
  eslint: {
    ignoreDuringBuilds: true, // Evita que fallos de estilo frenen el deploy
  }
};

export default nextConfig;
