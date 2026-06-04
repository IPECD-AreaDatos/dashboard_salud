/*src/app/dashboard/stats/page.tsx*/
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

import Image from "next/image";
import logoColorImg from "../../../../public/logo_color.png";
import logoSaludImg from "../../../../public/Logo_Salud_Publica_colorH.png";

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
  const isCAPS = session?.user?.role === 'Centro de Salud';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [zonaChart, setZonaChart] = useState<'Todos' | 'Capital' | 'Interior'>('Todos');

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

  // Filtrado y Sort explícito, no depende del orden de la API:
  const filterAndFormat = (arr: any[]) => {
    return arr
      .filter(item => {
        if (zonaChart === 'Todos') return true;
        if (zonaChart === 'Capital') return item.departamento === 'CAPITAL';
        return item.departamento !== 'CAPITAL';
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 15)
      .map(item => ({
        ...item,
        name: romanToArabic(item.name) // <--- Aplicamos la unificación aquí
      }));
  };

  const topGeneral = filterAndFormat(data.topGeneral || []);
  const topRiesgo = filterAndFormat(data.topRiesgoAtraso || []);

  const getBtnStyle = (zona: string) => ({
    padding: '6px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    border: '1px solid #587ba8',
    backgroundColor: zonaChart === zona ? '#587ba8' : 'transparent',
    color: zonaChart === zona ? '#fff' : '#587ba8',
    fontSize: '0.9rem',
    fontWeight: 600,
    transition: 'all 0.2s'
  });

  // 👈 CORREGIDO: Rangos dinámicos calculados a partir del día de ayer cerrado
  const obtenerEtiquetasActividad = () => {
    const hoy = new Date();
    
    // Definimos el día de ayer como nuestro punto de anclaje
    const ayer = new Date();
    ayer.setDate(hoy.getDate() - 1);
    
    // Formateador nativo para Argentina (DD/MM)
    const opciones: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' };
    const formatear = (d: Date) => d.toLocaleDateString('es-AR', opciones);

    // 1. Ayer (Día cerrado)
    const textoHoy = ayer.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // 2. Última semana cerrada (Ayer menos 6 días hasta Ayer, completando 7 días)
    const fechaSemanaPasada = new Date();
    fechaSemanaPasada.setDate(ayer.getDate() - 6);
    const textoSemana = `${formatear(fechaSemanaPasada)} al ${formatear(ayer)}`;

    // 3. Último mes cerrado (Ayer menos 29 días hasta Ayer, completando 30 días)
    const fechaMesPasado = new Date();
    fechaMesPasado.setDate(ayer.getDate() - 29);
    const textoMes = `${formatear(fechaMesPasado)} al ${formatear(ayer)}`;

    return { textoHoy, textoSemana, textoMes };
  };

  const { textoHoy, textoSemana, textoMes } = obtenerEtiquetasActividad();

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

        {isCAPS && (
          <>
            <h2 className={styles.sectionTitle} style={{ color: '#587ba8' }}>Gestión Prioritaria del Centro</h2>
            <div className={styles.kpiRow}>
              <div className={`${styles.kpiCard} ${styles.mainCard} ${styles.alertCard}`}>
                <span className={styles.kpiLabel}>Controles Vencidos (+30 días)</span>
                <span className={styles.kpiValue} style={{ color: '#ef4444' }}>{data.gestion?.controlesPendientes}</span>
              </div>
              <div className={`${styles.kpiCard} ${styles.mainCard}`}>
                <span className={styles.kpiLabel}>Partos en los próximos 30 días</span>
                <span className={styles.kpiValue} style={{ color: '#769FD3' }}>{data.gestion?.proximosPartos}</span>
              </div>
              <div className={`${styles.kpiCard} ${styles.mainCard}`}>
                <span className={styles.kpiLabel}>Sin Teléfono de Contacto</span>
                <span className={styles.kpiValue} style={{ color: '#4b5563' }}>{data.gestion?.sinTelefono}</span>
              </div>
              <div className={`${styles.kpiCard} ${styles.mainCard}`}>
                <span className={styles.kpiLabel}>Derivadas a otro Centro</span>
                <span className={styles.kpiValue} style={{ color: '#769FD3' }}>
                  {data.gestion?.derivadas}
                </span>
              </div>
              <div className={`${styles.kpiCard} ${styles.mainCard}`}>
                <span className={styles.kpiLabel}>Sin Contacto hace +30 días</span>
                <span className={styles.kpiValue} style={{ color: '#ef4444' }}>
                  {data.gestion?.sinContactoReciente}
                </span>
              </div>
            </div>
            {/* Cobertura de Controles Médicos Unificada con la Estética del Sistema */}
            <h2 className={styles.sectionTitle}>Cobertura de Controles Médicos</h2>
            <div className={styles.kpiRow}>
              
              {/* Tarjeta 1: Último Día */}
              <div className={styles.kpiCard}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span className={styles.kpiLabel}>Controles en el Último Día</span>
                  <small style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 550, marginTop: '2px' }}>
                    ({textoHoy})
                  </small>
                </div>
                <span className={styles.kpiValue} style={{ color: '#769FD3', marginTop: '0.5rem' }}>
                  {(data.actividad?.hoy || 0).toLocaleString('es-AR')}
                </span>
              </div>

              {/* Tarjeta 2: Última Semana */}
              <div className={styles.kpiCard}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span className={styles.kpiLabel}>Controles en la Última Semana</span>
                  <small style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 550, marginTop: '2px' }}>
                    ({textoSemana})
                  </small>
                </div>
                <span className={styles.kpiValue} style={{ color: '#769FD3', marginTop: '0.5rem' }}>
                  {(data.actividad?.semana || 0).toLocaleString('es-AR')}
                </span>
              </div>

              {/* Tarjeta 3: Último Mes */}
              <div className={styles.kpiCard}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span className={styles.kpiLabel}>Controles en el Último Mes</span>
                  <small style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 550, marginTop: '2px' }}>
                    ({textoMes})
                  </small>
                </div>
                <span className={styles.kpiValue} style={{ color: '#769FD3', marginTop: '0.5rem' }}>
                  {(data.actividad?.mes || 0).toLocaleString('es-AR')}
                </span>
              </div>

            </div>
          </>
        )}

        {!isCAPS && (
          <div className={styles.chartsSection}>
            {/* Solo mostramos los filtros si NO es Maternidad, ya que Maternidad ve solo sus derivaciones */}
            {!isMaternidad && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', justifyContent: 'center' }}>
                <button style={getBtnStyle('Todos')} onClick={() => setZonaChart('Todos')}>
                  Toda la Provincia
                </button>
                <button style={getBtnStyle('Capital')} onClick={() => setZonaChart('Capital')}>
                  Solo Capital
                </button>
                <button style={getBtnStyle('Interior')} onClick={() => setZonaChart('Interior')}>
                  Solo Interior
                </button>
              </div>
            )}
            
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
                    <Tooltip 
                      cursor={{ fill: '#f1f5f9' }} 
                      formatter={(value: number) => [value, "Cantidad de embarazadas"]}
                      labelFormatter={(label) => <span style={{ fontWeight: 'bold' }}>{label}</span>}
                    />
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
                    <Tooltip 
                      cursor={{ fill: '#f1f5f9' }} 
                      formatter={(value: number) => [value, "Cantidad de embarazadas"]}
                      labelFormatter={(label) => <span style={{ fontWeight: 'bold' }}>{label}</span>}
                    />
                    <Bar dataKey="value" fill="#ef4444" radius={[0, 7, 7, 0]}
                      barSize={20} />
                  </BarChart>
                  
                </ResponsiveContainer>
                
              </div>
              
            </div>
            
            </div>
          </div>
        )}
        
      </div>
    </>
  );
}
