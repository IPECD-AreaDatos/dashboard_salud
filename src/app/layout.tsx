import type { Metadata } from "next";
import { Barlow, Barlow_Semi_Condensed } from "next/font/google";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers"; // <--- IMPORTANTE

export const metadata: Metadata = {
  title: "SegEm - IMI",
  description: "Seguimiento de Embarazadas de Alto Riesgo - IMI",
};



// Configuramos Barlow Regular y Semibold
const barlow = Barlow({ 
  subsets: ["latin"], 
  weight: ["400", "600"],
  variable: "--font-barlow" 
});

// Configuramos Barlow Semi Condensed Extrabold
const barlowSemiCondensed = Barlow_Semi_Condensed({ 
  subsets: ["latin"], 
  weight: ["800"],
  variable: "--font-barlow-condensed" 
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${barlow.variable} ${barlowSemiCondensed.variable}`}>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});
