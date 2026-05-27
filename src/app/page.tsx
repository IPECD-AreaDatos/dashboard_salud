"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import styles from "./Landing.module.css";

// Importaciones estáticas oficiales de tus recursos
import encabezadosImg from "../../public/encabezados.png";
import logoColorImg from "../../public/logo_color.png";
import logoSaludImg from "../../public/Logo_Salud Pública_AP2_color-NG_ H.png";

export default function LandingPage() {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", {
      usuario: usuario.trim(),
      password: password.trim(),
      redirect: false,
    });

    if (res?.error) {
      setError("Credenciales incorrectas");
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className={styles.wrapper}>
      {/* Encabezado institucional de ancho completo */}
      <header className={styles.headerFull}>
        <Image 
          src={encabezadosImg} 
          alt="Gobierno de Corrientes" 
          className={styles.headerImg}
          priority
        />
      </header>
      
      {/* Contenedor central único */}
      <main className={styles.main}>
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className={styles.heroContent}
        >
          <div className={styles.badgeBlue}>Gestión Provincial 2026</div>
          <h2 className={styles.projectShortName}>SegEm</h2>
          
          <h1 className={styles.title}>
            Seguimiento de Embarazadas <br />
            <span className={styles.highlight}>Alto Riesgo</span>
          </h1>

          {/* Formulario integrado directamente en el centro de la tarjeta */}
          <form onSubmit={handleSubmit} className={styles.integratedForm}>
            {error && <p className={styles.error}>{error}</p>}
            
            <input 
              type="text" 
              placeholder="Usuario" 
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)} 
              required 
              className={styles.inputField}
            />
            
            <input 
              type="password" 
              placeholder="Contraseña" 
              value={password}
              onChange={(e) => setPassword(e.target.value)} 
              required 
              className={styles.inputField}
            />
            
            <button type="submit" className={styles.loginBtn} disabled={loading}>
              {loading ? "Verificando..." : "Entrar al Sistema"}
            </button>
          </form>
        </motion.div>
      </main>

      {/* Footer unificado con logos institucionales a color */}
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