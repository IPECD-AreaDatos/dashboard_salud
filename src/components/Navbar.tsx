"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from "next-auth/react";
import { Activity, BarChart3, ShieldCheck, LogOut, User as UserIcon } from 'lucide-react';
import styles from "./Navbar.module.css";

export default function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const menuItems = [
    { name: 'Seguimiento', href: '/dashboard', icon: Activity },
    { name: 'Estadísticas', href: '/dashboard/stats', icon: BarChart3 },
  ];

  // Auditoría solo para Admin
  if (session?.user?.role === 'Administrador') {
    menuItems.push({ name: 'Auditoría', href: '/dashboard/audit', icon: ShieldCheck });
  }

  return (
    <nav className={styles.navbar}>
      <div className={styles.leftSection}>
        <Link href="/dashboard" className={styles.brand}>
          <div className={styles.logoIcon}>
            <Activity size={20} />
          </div>
          <span className={styles.brandName}>Salud Corrientes</span>
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
        <div className={styles.userInfo}>
          <span className={styles.userRole}>{session?.user?.role || 'Personal'}</span>
          <span className={styles.userName}>{session?.user?.name || 'Usuario'}</span>
        </div>
        
        <button 
          onClick={() => signOut({ callbackUrl: '/login' })}
          className={styles.logoutBtn}
          title="Cerrar Sesión"
        >
          <LogOut size={20} />
        </button>
      </div>
    </nav>
  );
}