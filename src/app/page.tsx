"use client";

import { motion } from "framer-motion";
import { ArrowRight, BarChart3, Shield, Zap, HeartPulse } from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import styles from "./Landing.module.css";

export default function LandingPage() {
  return (
    <div className={styles.wrapper}>
      <Navbar />
      
      <main className={styles.main}>
        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.bgGlow}></div>
          <div className="container">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className={styles.heroContent}
            >
              <span className={styles.badge}>Monitoreo Inteligente 2.0</span>
              <h1 className={styles.title}>
                La salud de tu población, <br />
                <span className="text-gradient">en tiempo real.</span>
              </h1>
              <p className={styles.subtitle}>
                Transformamos datos complejos en decisiones estratégicas. Visualiza indicadores, 
                predice tendencias y mejora la calidad de atención con nuestra plataforma de analítica avanzada.
              </p>
              <div className={styles.actions}>
                <Link href="/dashboard" className={styles.primaryBtn}>
                  Explorar Tablero <ArrowRight size={20} />
                </Link>
                <Link href="#features" className={styles.secondaryBtn}>
                  Saber más
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className={styles.features}>
          <div className="container">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Potencia tu Gestión</h2>
              <p>Herramientas diseñadas para profesionales de la salud basados en datos.</p>
            </div>
            
            <div className="grid-cols-3">
              <FeatureCard 
                icon={<BarChart3 />}
                title="Analítica Predictiva"
                description="Identifica patrones y tendencias antes de que se conviertan en problemas críticos."
              />
              <FeatureCard 
                icon={<Shield />}
                title="Seguridad Total"
                description="Tus datos están protegidos con los estándares más altos de cifrado y privacidad."
              />
              <FeatureCard 
                icon={<Zap />}
                title="Actualización Viva"
                description="Conéctate directamente a tus fuentes de datos para una visión sin retrasos."
              />
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className="container flex-between">
          <div className={styles.footerBrand}>
            <HeartPulse className={styles.footerIcon} />
            <span>SaludDash © 2024</span>
          </div>
          <div className={styles.footerLinks}>
            <Link href="#">Privacidad</Link>
            <Link href="#">Términos</Link>
            <Link href="#">Contacto</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="card"
    >
      <div className={styles.cardIcon}>{icon}</div>
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.cardDesc}>{description}</p>
    </motion.div>
  );
}
