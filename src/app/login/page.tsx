"use client";
// Forzando recompilación del cliente para solucionar desincronización de CSS Modules
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import styles from "./Login.module.css";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function LoginPage() {
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
    <div className={styles.loginWrapper}>
      <Link href="/" className={styles.backLink}>
        <ArrowLeft size={20} /> Volver
      </Link>
      <form onSubmit={handleSubmit} className={styles.loginCard}>
        <div className={styles.badgeBlue}>Gestión Provincial 2026</div>
        <h2 className={styles.loginTitle}>Ingreso al Sistema</h2>
        
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
          {loading ? "Verificando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}