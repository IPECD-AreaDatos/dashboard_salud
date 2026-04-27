"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import styles from "./Navbar.module.css";

export default function Navbar() {
  return (
    <nav className={`${styles.navbar} glass`}>
      <div className="container flex-between">
        <Link href="/" className={styles.logo}>
          <Activity className={styles.icon} />
          <span>SaludDash</span>
        </Link>
        <div className={styles.links}>
          <Link href="#features">Características</Link>
          <Link href="/dashboard" className={styles.cta}>
            Acceder al Panel
          </Link>
        </div>
      </div>
    </nav>
  );
}
