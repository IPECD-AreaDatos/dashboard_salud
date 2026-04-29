import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers"; // <--- IMPORTANTE

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  // Actualizamos el título para que sea profesional
  title: "Sistema de Seguimiento Obstétrico | Ministerio de Salud Corrientes",
  description: "Plataforma provincial de monitoreo de embarazadas de alto riesgo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${outfit.variable}`}>
      <body className={inter.className}>
        {/* Envolvemos los hijos con el Provider de sesión */}
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}