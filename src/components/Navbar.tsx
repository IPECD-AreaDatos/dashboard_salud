"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from "next-auth/react";
import { Activity, BarChart3, ShieldCheck, HeartHandshake, LogOut } from 'lucide-react';
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
  
  // 🛡️ Perfiles con privilegios de gestión
  const isAdmin = userRole === 'Administrador';
  const isCoordinador = userRole === 'Coordinador';
  const esAdminOCoord = isAdmin || isCoordinador;

  // 1. Construcción dinámica del menú según el rol
  const menuItems: { name: string; href: string; icon: any }[] = [];

  if (isPrimerosLatidos) {
    menuItems.push({
      name: 'Primeros Latidos',
      href: '/dashboard/primeros-latidos',
      icon: HeartHandshake
    });
  } else {
    menuItems.push({ name: 'Seguimiento', href: '/dashboard', icon: Activity });

    // 📊 Estadísticas: Admin ha Coordinador oho V2-pe, ambue katu V1-pe
    if (!isSupervisora) {
      menuItems.push({
        name: 'Estadísticas',
        href: esAdminOCoord ? '/dashboard/stats-v2' : '/dashboard/stats',
        icon: BarChart3
      });
    }

    if (
      !isSupervisora &&
      (esAdminOCoord || 
      userRole === 'Centro de Salud' || 
      userRole === 'Maternidad' || 
      userRole?.toLowerCase() === 'lectura')
    ) {
      menuItems.push({ name: 'Auditoría', href: '/dashboard/audit', icon: ShieldCheck });
    }

    if (isAdmin) {
      menuItems.push({
        name: 'Primeros Latidos',
        href: '/dashboard/primeros-latidos',
        icon: HeartHandshake
      });
    }
  }

  const esRolEfector = userRole === 'Centro de Salud' || userRole === 'Maternidad';
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
          {menuItems.map((item) => {
            // Se mantiene activa si coincide exactamente o si es la sección de estadísticas
            const isActive = pathname === item.href || (item.name === 'Estadísticas' && pathname.startsWith('/dashboard/stats'));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.link} ${isActive ? styles.activeLink : ''}`}
              >
                <item.icon size={18} />
                {item.name}
              </Link>
            );
          })}
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
          onClick={async () => {
            await signOut({ redirect: false });
            // Redirige directamente al inicio (donde está el formulario de login)
            const basePath = window.location.pathname.startsWith('/salud-dashboard') 
              ? '/salud-dashboard' 
              : '';
            window.location.href = `${basePath}/`;
          }}
          className={styles.logoutBtn}
          title="Cerrar Sesión"
        >
          <LogOut size={20} />
        </button>
      </div>
    </nav>
  );
}
