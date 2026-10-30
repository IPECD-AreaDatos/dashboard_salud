/*src/components/Navbar.tsx*/ 
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
  const isSupervisora = userRole === 'Supervisora';
  const isPrimerosLatidos = userRole === 'Primeros Latidos';
  const isAdminOrCoord = userRole === 'Administrador' || userRole === 'Coordinador' || session?.user?.name === 'admin';

  // 1. Construcción dinámica del menú según el rol
  const menuItems: { name: string; href: string; icon: any }[] = [];

  if (isPrimerosLatidos) {
    // 🌟 Rol exclusivo: solo accede a su panel de gestión de bonos y corte de días
    menuItems.push({
      name: 'Primeros Latidos',
      href: '/dashboard/primeros-latidos',
      icon: HeartHandshake
    });
  } else {
    // 🌟 Roles habituales de SegEm
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

    // Administradores y Coordinadores también pueden supervisar la vista de Primeros Latidos
    if (isAdminOrCoord) {
      menuItems.push({
        name: 'Primeros Latidos',
        href: '/dashboard/primeros-latidos',
        icon: HeartHandshake
      });
    }
  }

  // Identificamos si el rol requiere desagregar el ID de usuario abajo
  const esRolEfector = userRole === 'Centro de Salud' || userRole === 'Maternidad';

  // URL del logo principal (si es Primeros Latidos lo lleva a su sección)
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
          <div style={{ width: '1px', height: '20px', backgroundColor: '#cbd5e1' }}></div>
          <Image 
            src={logoSaludImg} 
            alt="Salud Pública" 
            style={{ height: '39px', width: 'auto', objectFit: 'contain', opacity: 0.9 }}
          />
        </div>

        <div className={styles.userInfo}>
          <span className={styles.userRole}>{userRole || 'Personal'}</span>
          <span className={styles.userName}>{session?.user?.name || 'Usuario'}</span>
          
          {esRolEfector && session?.user?.username && (
            <span 
              style={{ 
                fontSize: '0.85rem', 
                color: '#64748b', 
                fontWeight: 550,
                marginTop: '1px',
                textAlign: 'right'
              }}
            >
              Usuario: {session.user.username}
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