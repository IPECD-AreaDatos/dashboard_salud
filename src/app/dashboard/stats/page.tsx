"use client";
import React, { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { useSession } from "next-auth/react";
import styles from "./Stats.module.css";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

const romanToArabic = (text: string) => {
  if (!text) return text;
  const map: { [key: string]: string } = {
    ' XVII': ' 17', ' XVI': ' 16', ' XV': ' 15', ' XIV': ' 14', ' XIII': ' 13',
    ' XII': ' 12', ' XI': ' 11', ' IX': ' 9', ' VIII': ' 8', ' VII': ' 7',
    ' VI': ' 6', ' IV': ' 4', ' V': ' 5', ' III': ' 3', ' II': ' 2', ' I': ' 1'
  };

  let newText = text;
  Object.keys(map).forEach(key => {
    const regex = new RegExp(`${key}(\\b|\\s|$)`, 'g');
    newText = newText.replace(regex, `${map[key]}$1`);
  });
  return newText;
};

export default function StatsPage() {
  const { data: session } = useSession();
  const isMaternidad = session?.user?.role === 'Maternidad';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/stats")
      .then(res => res.json())
      .then(resData => {
        setData(resData);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading || !data) {
    return (
      <>
        <Navbar />
        <div className={styles.container} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Loader2 className="animate-spin text-slate-400" size={48} />
        </div>
      </>
    );
  }

  // Sort explícito, no depende del orden de la API):
  const topGeneral = [...(data.topGeneral || [])]
    .sort((a, b) => b.value - a.value)
    .map(item => ({
      ...item,
      name: romanToArabic(item.name) // <--- Aplicamos la unificación aquí
    }));

  const topRiesgo = [...(data.topRiesgoAtraso || [])]
    .sort((a, b) => b.value - a.value)
    .map(item => ({
      ...item,
      name: romanToArabic(item.name) // <--- Y aquí también
    }));

  return (
    <>
      <Navbar />
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Estadísticas e Indicadores</h1>
          <p>Métricas provinciales sobre la población de embarazadas activas.</p>
        </div>

        <h2 className={styles.sectionTitle}>Embarazadas General</h2>
        <div className={styles.kpiRow}>
          <div className={`${styles.kpiCard} ${styles.mainCard} ${styles.genTotal}`}>
            <span className={styles.kpiLabel}>Total</span>
            <span className={`${styles.kpiValue} ${styles.valBlack}`}>{(data.general?.total || 0).toLocaleString('es-AR')}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Menores a 15 años</span>
            <span className={`${styles.kpiValue} ${styles.valRed}`}>{(data.general?.sub15 || 0).toLocaleString('es-AR')}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>15 a 19 años</span>
            <span className={`${styles.kpiValue} ${styles.valBlack}`}>{(data.general?.age15_19 || 0).toLocaleString('es-AR')}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>20 a 34 años</span>
            <span className={`${styles.kpiValue} ${styles.valBlack}`}>{(data.general?.age20_34 || 0).toLocaleString('es-AR')}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Mayores a 34 años</span>
            <span className={`${styles.kpiValue} ${styles.valRed}`}>{(data.general?.age34plus || 0).toLocaleString('es-AR')}</span>
          </div>
        </div>

        <h2 className={styles.sectionTitle}>Embarazadas Riesgo</h2>
        <div className={styles.kpiRow}>
          <div className={`${styles.kpiCard} ${styles.mainCard} ${styles.rsgTotal}`}>
            <span className={styles.kpiLabel}>Total Riesgo</span>
            <span className={`${styles.kpiValue} ${styles.valRed}`}>{(data.riesgo?.total || 0).toLocaleString('es-AR')}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Menores a 15 años</span>
            <span className={`${styles.kpiValue} ${styles.valBlack}`}>{(data.riesgo?.sub15 || 0).toLocaleString('es-AR')}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>15 a 19 años</span>
            <span className={`${styles.kpiValue} ${styles.valBlack}`}>{(data.riesgo?.age15_19 || 0).toLocaleString('es-AR')}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>20 a 34 años</span>
            <span className={`${styles.kpiValue} ${styles.valBlack}`}>{(data.riesgo?.age20_34 || 0).toLocaleString('es-AR')}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Mayores a 34 años</span>
            <span className={`${styles.kpiValue} ${styles.valBlack}`}>{(data.riesgo?.age34plus || 0).toLocaleString('es-AR')}</span>
          </div>
        </div>

        <div className={styles.chartsGrid}>
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>
              {isMaternidad
                ? "Top 15 — Centros de Salud que derivaron pacientes"
                : "Top 15 — Establecimientos con más embarazadas"}
            </h3>
            <div className={styles.chartWrapper}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topGeneral} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={250} tick={{ fill: '#475569', fontSize: 12 }} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="value" fill="#608bc4" radius={[0, 7, 7, 0]}
                    barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>
              {isMaternidad
                ? "Top 15 — Riesgo y sin control (más de 30 días) por centro de origen"
                : "Top 15 — Embarazadas de riesgo con control más de 30 días"}
            </h3>
            <div className={styles.chartWrapper}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topRiesgo} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={250} tick={{ fill: '#475569', fontSize: 12 }} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="value" fill="#ef4444" radius={[0, 7, 7, 0]}
                    barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
