"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import styles from "./Landing.module.css";

export default function LandingPage() {
  return (
    <div className={styles.wrapper}>
      {/* Encabezado que ocupa todo el ancho */}
      <header className={styles.headerFull}>
        <img 
          src="/encabezados.png" 
          alt="Gobierno de Corrientes" 
          className={styles.headerImg} 
        />
      </header>
      
      <main className={styles.main}>
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className={styles.heroContent}
        >
          <h2 className={styles.projectShortName}>SegEm</h2>
          <div className={styles.badgeBlue}>Gestión Provincial 2026</div>
          
          <h1 className={styles.title}>
            Seguimiento de Embarazadas <br />
            <span className={styles.highlight}>Alto Riesgo</span>
          </h1>
          
          <p className={styles.subtitle}>
            Plataforma centralizada para la detección temprana, gestión y seguimiento 
            integral de la salud materna en la Provincia de Corrientes.
          </p>

          <div className={styles.actions}>
            <Link href="/login" className={styles.primaryBtnBlue}>
              Ingresar al Sistema <ArrowRight size={20} />
            </Link>
          </div>
        </motion.div>
      </main>

      {/* Footer con los dos logos */}
      <footer className={styles.footerLogos}>
        <div className={styles.logoRow}>
          <img src="/logo_color.png" alt="Modernización" className={styles.footerLogoImg} />
          {/* El nombre del archivo debe ser exacto. Si tiene espacios, Next.js lo resuelve con /nombre%20archivo.png */}
          <img 
            src="/Logo_Salud Pública_AP2_color-NG_ H.png" 
            alt="Salud Pública" 
            className={styles.footerLogoImg} 
          />
        </div>
        <p className={styles.footerText}>
          Provincia de Corrientes — Ministerio de Salud Pública © 2026
        </p>
      </footer>
    </div>
  );
}