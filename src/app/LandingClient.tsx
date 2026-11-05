"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Image from "next/image";
import styles from "./Landing.module.css";

// Importaciones estáticas oficiales de tus recursos
import encabezadosImg from "../../public/encabezados.png";
import logoColorImg from "../../public/logo_color.png";
import logoSaludImg from "../../public/Logo_Salud Pública_AP2_color-NG_ H.png";

export default function LandingClient({ checkPortal }: { checkPortal: boolean }) {
  const [checkingPortal, setCheckingPortal] = useState(checkPortal);
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!checkPortal) return;
    let active = true;
    async function usePortalSession() {
      let redirecting = false;
      try {
        const res = await fetch('/salud-dashboard/api/central-estado', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
        const state = res.ok ? await res.json() : null;
        if (!active || !state?.disponible) return;
        const login = await signIn('imi-central', { redirect: false });
        if (!active || !login?.ok) return;
        redirecting = true;
        router.replace(state.primerosLatidos ? '/dashboard/primeros-latidos' : '/dashboard');
      } catch { /* El ingreso habitual sigue disponible. */ }
      finally { if (active && !redirecting) setCheckingPortal(false); }
    }
    void usePortalSession();
    return () => { active = false; };
  }, [checkPortal, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const basePath = window.location.pathname.startsWith('/salud-dashboard') ? '/salud-dashboard' : '';
    try {
      const centralLogin = await fetch(`${basePath}/api/auth/central-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ usuario: usuario.trim(), password: password.trim() }),
      });
      if (!centralLogin.ok) {
        if (centralLogin.status === 401) {
          const legacy = await signIn('credentials', {
            usuario: usuario.trim(),
            password: password.trim(),
            redirect: false,
          });
          if (legacy?.ok) {
            const sessionRes = await fetch(`${basePath}/api/auth/session`, { cache: 'no-store' });
            const sessionData = await sessionRes.json();
            router.replace(sessionData?.user?.role === 'Primeros Latidos' ? '/dashboard/primeros-latidos' : '/dashboard');
            return;
          }
        }
        const data = await centralLogin.json().catch(() => null);
        setError(data?.error || 'No se pudo iniciar sesión. Revisá tus credenciales e intentá de nuevo.');
        setLoading(false);
        return;
      }

      const res = await signIn('imi-central', { redirect: false });
      if (!res?.ok) {
        setError('La cuenta no tiene un acceso activo a Salud.');
        setLoading(false);
        return;
      }

      const sessionRes = await fetch(`${basePath}/api/auth/session`, { cache: 'no-store' });
      const sessionData = await sessionRes.json();
      router.replace(sessionData?.user?.role === 'Primeros Latidos' ? '/dashboard/primeros-latidos' : '/dashboard');
    } catch {
      setError('No se pudo conectar con el servicio de identidad. Intentá de nuevo en unos minutos.');
      setLoading(false);
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

          {/* Mientras se valida la sesión compartida, evitamos mostrar el formulario. */}
          {checkingPortal ? <p role="status" aria-live="polite" className={styles.checkingSession}>Ingresando con tu cuenta del portal…</p> : <form onSubmit={handleSubmit} className={styles.integratedForm}>
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
          </form>}
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
