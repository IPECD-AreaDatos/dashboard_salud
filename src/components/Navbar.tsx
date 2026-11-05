"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from "next-auth/react";
import { Activity, BarChart3, ShieldCheck, HeartHandshake, LogOut, Sparkles } from 'lucide-react';
import styles from "./Navbar.module.css";
import Image from "next/image";
import logoColorImg from "../../public/logo_color.png";
import logoSaludImg from "../../public/Logo_Salud_Publica_colorH.png";

export default function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userRole = session?.user?.role;
  const username = (session?.user as any)?.username || session?.user?.name;

  const isSupervisora = userRole === 'Supervisora';
  const isPrimerosLatidos = userRole === 'Primeros Latidos';
  
  // 🛡️ REGLA ESTRICTA DE ADMIN: Solo el rol Administrador o cuentas admin oficiales
  const isAdmin = userRole === 'Administrador' || username === 'admin' || username === 'admin1';
  
  // Roles autorizados para Auditoría
  const isAdminOrCoord = isAdmin || userRole === 'Coordinador';

  // 1. Construcción dinámica del menú según el rol
  const menuItems: { name: string; href: string; icon: any }[] = [];

  if (isPrimerosLatidos) {
    // 🌟 Rol exclusivo Primeros Latidos: solo ve su módulo
    menuItems.push({
      name: 'Primeros Latidos',
      href: '/dashboard/primeros-latidos',
      icon: HeartHandshake
    });
  } else {
    // 🌟 Roles operativos de SegEm (Admin, Coord, Efectores)
    menuItems.push({ name: 'Seguimiento', href: '/dashboard', icon: Activity });

    if (!isSupervisora) {
      menuItems.push({ name: 'Estadísticas', href: '/dashboard/stats', icon: BarChart3 });
    }

    if (
      !isSupervisora &&
      (isAdminOrCoord || 
      userRole === 'Centro de Salud' || 
      userRole === 'Maternidad' || 
      userRole?.toLowerCase() === 'lectura')
    ) {
      menuItems.push({ name: 'Auditoría', href: '/dashboard/audit', icon: ShieldCheck });
    }

    // 🔒 ACCESO EXCLUSIVO ADMINISTRADOR: "v2" y "Primeros Latidos"
    if (isAdmin) {
      menuItems.push({
        name: 'v2',
        href: '/dashboard/stats-v2',
        icon: Sparkles
      });

      menuItems.push({
        name: 'Primeros Latidos',
        href: '/dashboard/primeros-latidos',
        icon: HeartHandshake
      });
    }
  }

  // Identificamos si el rol requiere desagregar el ID de usuario abajo
  const esRolEfector = userRole === 'Centro de Salud' || userRole === 'Maternidad';

  // URL del logo principal
  const homeHref = isPrimerosLatidos ? '/dashboard/primeros-latidos' : '/dashboard';

  return (
    <nav className={styles.navbar}>
      <div className={styles.leftSection}>
        <Link href={homeHref} className={styles.brand}>
          <div className={styles.logoIcon}>
            <Activity size={20} />
          </div>
          <span className={styles.brandName}>SegEm</span>
        </Link>

        <div className={styles.navLinks}>
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.link} ${pathname === item.href ? styles.activeLink : ''}`}
            >
              <item.icon size={18} />
              {item.name}
            </Link>
          ))}
        </div>
      </div>

      <div className={styles.rightSection}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginRight: '1rem' }}>
          <Image 
            src={logoColorImg} 
            alt="Modernización" 
            style={{ height: '39px', width: 'auto', objectFit: 'contain', opacity: 0.9 }}
          />
          <div style={{ width: '1px', height: '20px', backgroundColor: '#cbd5e1' }} />
          <Image 
            src={logoSaludImg} 
            alt="Salud Pública" 
            style={{ height: '39px', width: 'auto', objectFit: 'contain', opacity: 0.9 }}
          />
        </div>

        <div className={styles.userInfo}>
          <span className={styles.userRole}>{userRole || 'Personal'}</span>
          <span className={styles.userName}>{session?.user?.name || 'Usuario'}</span>
          
          {esRolEfector && (session?.user as any)?.username && (
            <span 
              style={{ 
                fontSize: '0.85rem', 
                color: '#64748b', 
                fontWeight: 550, 
                marginTop: '1px', 
                textAlign: 'right' 
              }}
            >
              Usuario: {(session?.user as any)?.username}
            </span>
          )}
        </div>

        <button
          onClick={() => signOut({ callbackUrl: '/salud-dashboard' })}
          className={styles.logoutBtn}
          title="Cerrar Sesión"
        >
          <LogOut size={20} />
        </button>
      </div>
    </nav>
  );
}