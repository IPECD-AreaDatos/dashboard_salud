"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import styles from "./Landing.module.css";

// Importamos estáticamente las imágenes para que Next.js maneje automáticamente
// los anchos, altos, el 'basePath' configurado y resuelva sin problemas los espacios en nombres.
import encabezadosImg from "../../public/encabezados.png";
import logoColorImg from "../../public/logo_color.png";
import logoSaludImg from "../../public/Logo_Salud Pública_AP2_color-NG_ H.png";

export default function LandingPage() {
  return (
    <div className={styles.wrapper}>
      {/* Encabezado que ocupa todo el ancho */}
      <header className={styles.headerFull}>
        <Image 
          src={encabezadosImg} 
          alt="Gobierno de Corrientes" 
          className={styles.headerImg}
          priority
        />
      </header>
      
      <main className={styles.main}>
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className={styles.heroContent}
        >
          <div className={styles.badgeBlue}>Gestión Provincial 2026</div>
          <h2 className={styles.projectShortName}>SegEm</h2>
          
          <h1 className={styles.title}>
            Seguimiento de Embarazadas <br />
            <span className={styles.highlight}>Alto Riesgo</span>
          </h1>
          
          <p className={styles.subtitle}>
            Plataforma centralizada y segura para la detección temprana, gestión y seguimiento integral de la salud materna en la Provincia de Corrientes.
          </p>

          <div className={styles.actions}>
            <Link href="/login" className={styles.primaryBtnBlue}>
              Ingresar al Sistema <ArrowRight size={20} />
            </Link>
          </div>
        </motion.div>
      </main>

      {/* Footer con los dos logos */}
      <footer className={styles.footer}>
        <div className={styles.footerLogos}>
          <div className={styles.logoRow}>
            <Image 
               src={logoColorImg} 
               alt="Modernización" 
               className={styles.footerLogoImg} 
            />
            <div className={styles.divider}></div>
            <Image 
              src={logoSaludImg} 
              alt="Salud Pública" 
              className={styles.footerLogoImg} 
            />
          </div>
        </div>
        <p className={styles.footerText}>
          Provincia de Corrientes — Ministerio de Salud Pública © 2026
        </p>
      </footer>
    </div>
  );
}