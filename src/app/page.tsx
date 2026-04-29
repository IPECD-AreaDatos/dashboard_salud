"use client";

import { motion } from "framer-motion";
import { ArrowRight, BarChart3, Shield, Zap, HeartPulse } from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import styles from "./Landing.module.css";

export default function LandingPage() {
  return (
    <div className={styles.wrapper}>
      {/* Capa de fondo con la imagen de la carpeta public */}
      <div className={styles.heroBgOverlay}></div>
      
      <nav className={styles.navbarSimple}>
        <div className={styles.brandCenter}>
          <HeartPulse color="#16a34a" size={28} />
          <span className={styles.brandText}>Ministerio de Salud</span>
        </div>
      </nav>
      
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className="container">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className={styles.heroContent}
            >
              <span className={styles.badgeGreen}>Gestión Provincial</span>
              
              <h1 className={styles.title}>
                Seguimiento de Embarazadas <br />
                <span className={styles.textGradientGreen}>Alto Riesgo - Corrientes</span>
              </h1>
              
              <p className={styles.subtitle}>
                Plataforma provincial para la detección temprana y seguimiento integral 
                de pacientes. Unificamos fuentes para salvar vidas.
              </p>

              <div className={styles.actions}>
                <Link href="/login" className={styles.primaryBtnGreen}>
                  Ingresar al Sistema <ArrowRight size={22} />
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <footer className={styles.footerCenter}>
        <p>Provincia de Corrientes - Ministerio de Salud Pública © 2026</p>
      </footer>
    </div>
  );
}