"use client";

import { motion } from "framer-motion";
import { ArrowRight, HeartPulse } from "lucide-react";
import Link from "next/link";
import styles from "./Landing.module.css";

export default function LandingPage() {
  return (
    <div className={styles.wrapper}>
      {/* Las dos capas de fondo */}
      <div className={styles.heroBgOverlay}></div>
      <div className={styles.heroOverlay}></div>
      
      <nav className={styles.navbarSimple}>
        <div className={styles.brandCenter}>
          <HeartPulse color="#16a34a" size={28} />
          <span className={styles.brandText}>Ministerio de Salud Corrientes</span>
        </div>
      </nav>
      
      <main className={styles.main}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={styles.heroContent}
        >
          <span className={styles.badgeGreen}>Gestión Provincial 2026</span>
          
          <h1 className={styles.title}>
            Seguimiento de Embarazadas <br />
            <span className={styles.textGradientGreen}>Alto Riesgo</span>
          </h1>
          
          <p className={styles.subtitle}>
            Plataforma provincial para la detección temprana y seguimiento integral. 
            Unificamos fuentes para salvar vidas.
          </p>

          <div className={styles.actions}>
            <Link href="/login" className={styles.primaryBtnGreen}>
              Ingresar al Sistema <ArrowRight size={20} />
            </Link>
          </div>
        </motion.div>
      </main>

      <footer className={styles.footerCenter}>
        <p>Provincia de Corrientes - Ministerio de Salud Pública © 2026</p>
      </footer>
    </div>
  );
}