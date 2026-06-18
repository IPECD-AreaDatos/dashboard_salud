/*src\app\dashboard\stats\page.tsx*/
"use client";
import React, { useEffect, useState, useMemo } from "react";
import { registrarLog } from "@/lib/analytics";
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
import { Loader2, PhoneCall, UserCheck, Download } from "lucide-react";
import { apiFetch } from "@/lib/api";
import * as XLSX from 'xlsx';

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
  
  // Condicional de Roles para el Padrón Gerencial
  const userRole = session?.user?.role;
  const isAdminOrCoord = userRole === 'Administrador' || userRole === 'Coordinador';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [zonaChart, setZonaChart] = useState<'Todos' | 'Capital' | 'Interior'>('Todos');

  // 🌟 ESTADO Y LÓGICA DE ORDENAMIENTO DE LA TABLA
  const [sortConfigCaps, setSortConfigCaps] = useState<{ key: string | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });

  const handleSortCaps = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfigCaps.key === key && sortConfigCaps.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfigCaps({ key, direction });
  };

  const sortedCaps = useMemo(() => {
    if (!data?.resumenCaps) return [];
    const sortableItems = [...data.resumenCaps];
    if (sortConfigCaps.key !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfigCaps.key!];
        const bValue = b[sortConfigCaps.key!];
        
        if (aValue < bValue) return sortConfigCaps.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfigCaps.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [data, sortConfigCaps]);

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
      
      registrarLog({ 
        modulo: "Estadísticas", 
        accion: "VISUALIZAR_ESTADISTICAS",
        detalles: "El usuario ingresó a revisar el panel de control de gestión y reportes estadísticos."
      });
  }, []);

  // 🌟 CALCULADORA DE PORCENTAJES SOBRE EL PADRÓN TOTAL
  const totalPadron = data?.general?.total || 0;
  const getPct = (value: number) => {
    if (!totalPadron) return "0.0%";
    return ((value / totalPadron) * 100).toFixed(1) + "%";
  };

  // 🌟 FUNCIÓN PARA EXPORTAR LA TABLA DE DESEMPEÑO DE CAPS A EXCEL
  const exportarAExcel = () => {
    if (!sortedCaps || sortedCaps.length === 0) {
      alert("No hay datos en la tabla para exportar.");
      return;
    }

    // 1. Construimos un bloque de encabezado y KPIs (Métricas Generales)
    const encabezado = [
      ["ESTADÍSTICAS E INDICADORES PROVINCIALES"],
      ["Fecha de generación:", new Date().toLocaleDateString('es-AR') + " " + new Date().toLocaleTimeString('es-AR')],
      [],
      ["MÉTRICAS GENERALES"],
      ["Total Padrón Provincial", "Total en Alto Riesgo", "Total Controladas (Al Día)", "Total Contactadas", "Total Derivadas"],
      [
        `${totalPadron} (100%)`,
        `${data.riesgo?.total || 0} (${getPct(data.riesgo?.total || 0)})`, 
        `${data.gestion?.controladas || 0} (${getPct(data.gestion?.controladas || 0)})`, 
        `${data.gestion?.contactadas || 0} (${getPct(data.gestion?.contactadas || 0)})`, 
        `${data.gestion?.derivadas || 0} (${getPct(data.gestion?.derivadas || 0)})`
      ],
      [],
      ["DESEMPEÑO Y COBERTURA POR CAPS"]
    ];

    // Convertimos las filas del encabezado a una hoja de cálculo
    const hoja = XLSX.utils.aoa_to_sheet(encabezado);

    // 2. Formateamos los datos de la tabla de desempeño
    const datosFormateados = sortedCaps.map((caps: any) => ({
      "Centro de Salud (Efector)": romanToArabic(caps.capsName),
      "Padrón Activo": caps.total,
      "% Controladas": caps.pctControl,
      "% Contactadas": caps.pctContacto,
      "Contactadas por CAPS": caps.contactadasCaps,
      "Acudieron Solas (Espontáneas)": caps.acudieronSolas
    }));

    // 3. Inyectamos la tabla debajo de nuestros KPIs (como quitamos filas, ahora arranca en A10)
    XLSX.utils.sheet_add_json(hoja, datosFormateados, { origin: "A10" });
    
    // 4. Anchos de columna dinámicos para que se lea bien en Excel
    hoja['!cols'] = [ { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 30 } ];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Reporte Provincial");

    const fechaDescarga = new Date().toISOString().split('T')[0];
    XLSX.writeFile(libro, `Reporte_Estadistico_Provincial_${fechaDescarga}.xlsx`);

    // Registro en auditoría
    registrarLog({
      modulo: "Estadísticas",
      accion: "EXPORTAR_EXCEL",
      detalles: `Exportó reporte provincial integral incluyendo KPIs y desempeño de CAPS en formato Excel.`
    }).catch(err => console.error("Error al registrar log:", err));
  };

  if (loading || !data) {
    return (
      <>
        <Navbar />
        <div className={styles.container} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
          <Loader2 className="animate-spin text-slate-400" size={48} />
        </div>
      </>
    );
  }

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
        name: romanToArabic(item.name)
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

  const obtenerEtiquetasActividad = () => {
    const hoy = new Date();
    const ayer = new Date();
    ayer.setDate(hoy.getDate() - 1);
    
    const opciones: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' };
    const formatear = (d: Date) => d.toLocaleDateString('es-AR', opciones);

    const textoHoy = ayer.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const fechaSemanaPasada = new Date();
    fechaSemanaPasada.setDate(ayer.getDate() - 6);
    const textoSemana = `${formatear(fechaSemanaPasada)} al ${formatear(ayer)}`;

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
        
        {/* Encabezado */}
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h1>Estadísticas e Indicadores Provinciales</h1>
            <p>Panel de control clínico y auditoría de gestión de efectores.</p>
          </div>
          {isAdminOrCoord && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button 
                onClick={exportarAExcel}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '8px',
                  backgroundColor: '#769FD3', color: 'white', 
                  border: '1px solid #587ba8', padding: '0.6rem 1.1rem', 
                  borderRadius: '0.8rem', fontSize: '0.875rem', 
                  fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                }}
              >
                <Download size={16} /> Descargar Reporte
              </button>
            </div>
          )}
        </div>

        {/* 🌟 KPIs COMPACTOS SÓLO SI ES ADMIN O COORDINADOR */}
        {isAdminOrCoord ? (
          <div className={styles.kpiGridAdmin}>
            <div className={styles.kpiCardAdminMain}>
              <span className={styles.kpiLabel}>Total Padrón Provincial</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '0.25rem' }}>
                <span className={styles.kpiValue} style={{ color: '#0f172a', margin: 0 }}>
                  {totalPadron.toLocaleString('es-AR')}
                </span>
                <span style={{ fontSize: '1.1rem', color: '#94a3b8', fontWeight: 700 }}>(100%)</span>
              </div>
              <small className={styles.kpiSubtext}>Embarazadas activas</small>
            </div>

            <div className={styles.kpiCardAdminRiesgo}>
              <span className={styles.kpiLabel} style={{ color: '#991b1b' }}>Total en Alto Riesgo</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '0.25rem' }}>
                <span className={styles.kpiValue} style={{ color: '#dc2626', margin: 0 }}>
                  {(data.riesgo?.total || 0).toLocaleString('es-AR')}
                </span>
                <span style={{ fontSize: '1.1rem', color: '#f87171', fontWeight: 700 }}>({getPct(data.riesgo?.total || 0)})</span>
              </div>
              <small className={styles.kpiSubtext} style={{ color: '#991b1b' }}>Seguimiento prioritario</small>
            </div>

            <div className={styles.kpiCardCompact}>
              <span className={styles.kpiLabel}>Total Controladas</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '0.25rem' }}>
                <span className={styles.kpiSubValue} style={{ color: '#19793cdc', margin: 0 }}>
                  {(data.gestion?.controladas || 0).toLocaleString('es-AR')}
                </span>
                <span style={{ fontSize: '0.95rem', color: '#14921f8f', fontWeight: 700 }}>({getPct(data.gestion?.controladas || 0)})</span>
              </div>
              <small className={styles.kpiSubtext}>Controles del último mes</small>
            </div>

            <div className={styles.kpiCardCompact}>
              <span className={styles.kpiLabel}>Total Contactadas</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '0.25rem' }}>
                <span className={styles.kpiSubValue} style={{ color: '#1276b8e0', margin: 0 }}>
                  {(data.gestion?.contactadas || 0).toLocaleString('es-AR')}
                </span>
                <span style={{ fontSize: '0.95rem', color: '#207ae9c7', fontWeight: 700 }}>({getPct(data.gestion?.contactadas || 0)})</span>
              </div>
              <small className={styles.kpiSubtext}>Gestión del último mes</small>
            </div>

            <div className={styles.kpiCardCompact}>
              <span className={styles.kpiLabel}>Total Derivadas</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '0.25rem' }}>
                <span className={styles.kpiSubValue} style={{ color: '#d67a10', margin: 0 }}>
                  {(data.gestion?.derivadas || 0).toLocaleString('es-AR')}
                </span>
                <span style={{ fontSize: '0.95rem', color: '#f1a23a', fontWeight: 700 }}>({getPct(data.gestion?.derivadas || 0)})</span>
              </div>
              <small className={styles.kpiSubtext}>Referidas a mayor nivel</small>
            </div>
          </div>
        ) : (
          /* 🌟 INTERFAZ TRADICIONAL ORIGINAL PARA CAPS O MATERNIDAD */
          <>
            <h2 className={styles.sectionTitle}>Embarazadas General</h2>
            <div className={styles.kpiRow}>
              <div className={`${styles.kpiCard} ${styles.genTotal}`}>
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
              <div className={`${styles.kpiCard} ${styles.rsgTotal}`}>
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
          </>
        )}

        {/* Módulo Operativo Exclusivo para Centros de Salud */}
        {isCAPS && (
          <>
            <h2 className={styles.sectionTitle}>Gestión Prioritaria del Centro</h2>
            <div className={styles.kpiGridAdmin}>
              <div className={styles.kpiCardCompact}>
                <span className={styles.kpiLabel}>Controles Atrasados</span>
                <span className={styles.kpiSubValue} style={{ color: '#ef4444' }}>{data.gestion?.controlesPendientes}</span>
              </div>
              <div className={styles.kpiCardCompact}>
                <span className={styles.kpiLabel}>REQUIEREN CONTACTO</span>
                <span className={styles.kpiSubValue} style={{ color: '#ef4444' }}>{data.gestion?.sinContactoReciente}</span>
              </div>
              <div className={styles.kpiCardCompact}>
                <span className={styles.kpiLabel}>Partos en 30 días</span>
                <span className={styles.kpiSubValue} style={{ color: '#769FD3' }}>{data.gestion?.proximosPartos}</span>
              </div>
              <div className={styles.kpiCardCompact}>
                <span className={styles.kpiLabel}>Sin Teléfono</span>
                <span className={styles.kpiSubValue} style={{ color: '#4b5563' }}>{data.gestion?.sinTelefono}</span>
              </div>
              <div className={styles.kpiCardCompact}>
                <span className={styles.kpiLabel}>Derivadas</span>
                <span className={styles.kpiSubValue} style={{ color: '#769FD3' }}>{data.gestion?.derivadas}</span>
              </div>              
            </div>

            <h2 className={styles.sectionTitle}>Cobertura de Controles Médicos</h2>
            <div className={styles.kpiGridAdmin}>
              <div className={styles.kpiCardCompact} style={{ textAlign: 'center' }}>
                <span className={styles.kpiLabel}>Último Día</span>
                <small className={styles.kpiSubtext}>({textoHoy})</small>
                <span className={styles.kpiSubValue} style={{ color: '#769FD3', marginTop: '0.5rem' }}>{(data.actividad?.hoy || 0).toLocaleString('es-AR')}</span>
              </div>
              <div className={styles.kpiCardCompact} style={{ textAlign: 'center' }}>
                <span className={styles.kpiLabel}>Última Semana</span>
                <small className={styles.kpiSubtext}>({textoSemana})</small>
                <span className={styles.kpiSubValue} style={{ color: '#769FD3', marginTop: '0.5rem' }}>{(data.actividad?.semana || 0).toLocaleString('es-AR')}</span>
              </div>
              <div className={styles.kpiCardCompact} style={{ textAlign: 'center' }}>
                <span className={styles.kpiLabel}>Último Mes</span>
                <small className={styles.kpiSubtext}>({textoMes})</small>
                <span className={styles.kpiSubValue} style={{ color: '#769FD3', marginTop: '0.5rem' }}>{(data.actividad?.mes || 0).toLocaleString('es-AR')}</span>
              </div>
            </div>
          </>
        )}

        {/* 🌟 TABLA COMPARATIVA SÓLO COMPILADA PARA ADMIN / COORD */}
        {isAdminOrCoord && (
          <div className={styles.tableContainerCaps}>
            <div className={styles.tableHeaderArea}>
              <h2>Desempeño y Cobertura de Gestión por CAPS</h2>
              <p>Monitoreo de actividad de seguimiento telefónico vs. demanda espontánea.</p>
            </div>

            <div className={styles.responsiveTableWrapper}>
              <table className={styles.capsTable}>
                <thead>
                  <tr>
                    <th onClick={() => handleSortCaps('capsName')} className={styles.sortableHeader}>
                      <div className={styles.headerContent}>
                        <span>Centro de Salud (Efector)</span>
                        <span className={styles.sortIcon}>
                          {sortConfigCaps.key === 'capsName' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>
                    <th onClick={() => handleSortCaps('total')} className={styles.sortableHeader} title="Se actualiza todos los días (Foto actual del padrón)">
                      <div className={styles.headerContent} style={{ justifyContent: 'center' }}>
                        <span>Padrón Activo</span>
                        <span className={styles.sortIcon}>
                          {sortConfigCaps.key === 'total' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>
                    <th onClick={() => handleSortCaps('pctControl')} className={styles.sortableHeader} title="Se actualiza todos los días (Pacientes al día)">
                      <div className={styles.headerContent} style={{ justifyContent: 'center' }}>
                        <span>% Controladas</span>
                        <span className={styles.sortIcon}>
                          {sortConfigCaps.key === 'pctControl' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>
                    <th onClick={() => handleSortCaps('pctContacto')} className={styles.sortableHeader} title="Dato histórico acumulado durante el embarazo">
                      <div className={styles.headerContent} style={{ justifyContent: 'center' }}>
                        <span>% Contactadas</span>
                        <span className={styles.sortIcon}>
                          {sortConfigCaps.key === 'pctContacto' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>
                    <th onClick={() => handleSortCaps('contactadasCaps')} className={styles.sortableHeader} title="Dato histórico acumulado durante el embarazo">
                      <div className={styles.headerContent} style={{ justifyContent: 'center' }}>
                        <span>Contactadas por CAPS</span>
                        <span className={styles.sortIcon}>
                          {sortConfigCaps.key === 'contactadasCaps' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>
                    <th onClick={() => handleSortCaps('acudieronSolas')} className={styles.sortableHeader}>
                      <div className={styles.headerContent} style={{ justifyContent: 'center' }}>
                        <span>Acudieron Solas (Espontáneas)</span>
                        <span className={styles.sortIcon}>
                          {sortConfigCaps.key === 'acudieronSolas' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
              {sortedCaps && sortedCaps.length > 0 ? (
                sortedCaps.map((caps: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 550, color: '#334155' }}>{romanToArabic(caps.capsName)}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{caps.total}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={caps.pctControl > 75 ? styles.badgeControlOk : styles.badgeControlAlert}>
                        {caps.pctControl}%
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 500, color: '#475569' }}>{caps.pctContacto}%</td>
                    <td className={styles.tdContactadas}>
                      <div>
                        <PhoneCall size={14} /> {caps.contactadasCaps} <small>pacs</small>
                      </div>
                    </td>
                    <td className={styles.tdSolas}>
                      <div>
                        <UserCheck size={15} /> {caps.acudieronSolas} <small>pacs</small>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                    No se encontraron embarazadas en los CAPS bajo los filtros actuales.
                  </td>
                </tr>
              )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Gráficos de barras abajo de todo */}
        {!isCAPS && (
          <div className={styles.chartsSection}>
            {!isMaternidad && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', justifyContent: 'center' }}>
                <button style={getBtnStyle('Todos')} onClick={() => setZonaChart('Todos')}>Toda la Provincia</button>
                <button style={getBtnStyle('Capital')} onClick={() => setZonaChart('Capital')}>Solo Capital</button>
                <button style={getBtnStyle('Interior')} onClick={() => setZonaChart('Interior')}>Solo Interior</button>
              </div>
            )}
            
            <div className={styles.chartsGrid}>
              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>
                  {isMaternidad ? "Top 15 — Centros de Salud que derivaron pacientes" : "Top 15 — Establecimientos con más embarazadas"}
                </h3>
                <div className={styles.chartWrapper}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topGeneral} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={240} tick={{ fill: '#475569', fontSize: 11 }} />
                      <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(value: number) => [value, "Cantidad"]} />
                      <Bar dataKey="value" fill="#608bc4" radius={[0, 7, 7, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>
                  {isMaternidad ? "Top 15 — Riesgo y sin control (>30 días) por centro de origen" : "Top 15 — Embarazadas de riesgo con control atrasado (>30 días)"}
                </h3>
                <div className={styles.chartWrapper}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topRiesgo} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={240} tick={{ fill: '#475569', fontSize: 11 }} />
                      <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(value: number) => [value, "Cantidad"]} />
                      <Bar dataKey="value" fill="#ef4444" radius={[0, 7, 7, 0]} barSize={16} />
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