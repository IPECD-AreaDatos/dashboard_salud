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
  ResponsiveContainer,
  Label,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { Loader2, Download, Info } from "lucide-react";
import { apiFetch } from "@/lib/api";
import * as XLSX from 'xlsx';

// 🌟 FUNCIONES AUXILIARES DECLARADAS ARRIBA DE TODO (Evitan ReferenceErrors globales)
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

const getSemaforoBadgeClass = (porcentaje: number) => {
  if (porcentaje >= 70) return styles.badgeVerde;
  if (porcentaje >= 50) return styles.badgeAmarillo;
  return styles.badgeRojo;
};

const formatCapsDisplayName = (rawName: string): string => {
  if (!rawName) return '';

  let name = rawName.toUpperCase();
  name = romanToArabic(name);

  const capsMatch = name.match(/C\.?A\.?P\.?S\.?\s*N?º?°?\s*(\d+)/i);
  const capsNum = capsMatch ? capsMatch[1] : null;

  let cleanName = name
    .replace(/C\.?A\.?P\.?S\.?\s*N?º?°?\s*\d*/gi, '')
    .replace(/\b(BARRIO|B°|Bº|B\.|BO\.|DR\.|DOCTOR|EX|N°|Nº|NO\.)\b/gi, '')
    .replace(/["'“”]/g, '')
    .replace(/^[\s\-–—:]+/, '')
    .replace(/TAGLIALEGNE/gi, 'TAGLIALENE')
    .replace(/\s+/g, ' ')
    .trim();

  if (capsNum) {
    return cleanName ? `CAPS ${capsNum} - ${cleanName}` : `CAPS ${capsNum}`;
  }

  return cleanName || rawName.trim();
};

// 🌟 NUEVO: Componente para las tarjetas con Tooltip (MOVIDO AQUÍ)
const KpiCardConTooltip = ({ label, value, tooltip, color }: { label: string, value: number, tooltip: string, color: string }) => (
  <div className={styles.kpiCardCompact}>
    <div className={styles.labelWithTooltip}>
      <span className={styles.kpiLabel}>{label}</span>
      <div className={styles.tooltipContainer}>
        <Info size={13} className={styles.infoIcon} />
        <span className={styles.tooltipText}>
          {tooltip}
        </span>
      </div>
    </div>
    <span className={styles.kpiSubValue} style={{ color: color }}>
      {value}
    </span>
  </div>
);

export default function StatsPage() {
  const { data: session } = useSession();
  const isMaternidad = session?.user?.role === 'Maternidad';
  const isCAPS = session?.user?.role === 'Centro de Salud';
  const userRole = session?.user?.role;
  const isAdminOrCoord = userRole === 'Administrador' || userRole === 'Coordinador';
  const isSupervisora = userRole === 'Supervisora';

  const [data, setData] = useState<any>(null);
  const [initialProvincialData, setInitialProvincialData] = useState<any>(null); // Nuevo estado para datos provinciales iniciales
  const [loading, setLoading] = useState({ initial: true, filtering: false }); // Estado de carga más detallado
  const [zonaChart, setZonaChart] = useState<'Todos' | 'Capital' | 'Interior'>('Todos');
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null);

  const [sortConfigCaps, setSortConfigCaps] = useState<{ 
      key: 'displayName' | 'padronAct' | 'cobAct' | 'variacionCob' | 'pctSeguimientoAdecuado' | 'pctGestion' | 'turnosAsignadosCaps'; 
      direction: 'asc' | 'desc' 
    }>({ key: 'padronAct', direction: 'desc' });

  const handleSortCaps = (key: any) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfigCaps.key === key && sortConfigCaps.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfigCaps({ key, direction });
  };

  const normalizeCapsName = (name: string) => {
    if (!name) return '';
    return name
      .toUpperCase() // 1. A MAYÚSCULAS para unificar
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // 2. Quitar acentos
      .replace(/C\.?A\.?P\.?S\.?/g, 'CAPS') // 3. Unificar C.A.P.S.
      // 4. Reemplazar números romanos (ajustado para ser más preciso)
      .replace(/\bVIII\b/g, '8')
      .replace(/\bVII\b/g, '7')
      .replace(/\bVI\b/g, '6')
      .replace(/\bIV\b/g, '4')
      .replace(/\bV\b/g, '5')
      .replace(/\bIII\b/g, '3')
      .replace(/\bII\b/g, '2')
      .replace(/\bI\b/g, '1')
      // 5. Eliminar palabras y abreviaturas comunes que generan ruido
      .replace(/\b(BARRIO|B°|Bº|DR|DOCTOR|EX|PRESIDENTE|UNIDOS DEL PALMAR|N°|Nº|NO\.)\b/g, '')
      // 6. Corregir errores de tipeo y abreviaturas específicas
      .replace(/\bSTA\b/g, 'SANTA')
      .replace(/TAGLIALEGNE/g, 'TAGLIALENE') // Corregir error de tipeo
      .replace(/"/g, '') // 7. Eliminar comillas
      .replace(/[^A-Z0-9]/g, ' ') // 8. Eliminar todos los caracteres no alfanuméricos restantes
      .replace(/\s+/g, ' ') // 9. Colapsar múltiples espacios a uno solo
      .trim(); // 10. Limpiar espacios al inicio y final
  };

  const [periodoComparativa, setPeriodoComparativa] = useState<7 | 15 | 30>(30);

  // Agrupamos la comparativa normalizando los nombres para evitar duplicados
  const comparativaProcesada = useMemo(() => {
    if (!data?.comparativaCaps) return [];
    
    return data.comparativaCaps.map((c: any) => ({
      ...c,
      displayName: formatCapsDisplayName(c.capsName)
    }));
  }, [data?.comparativaCaps]);

  const sortedCaps = useMemo(() => {
    if (!data?.resumenCaps) return [];

    // 🌟 Mapeamos y garantizamos la propiedad displayName para la tabla y el Excel
    const items = data.resumenCaps.map((c: any) => ({
      ...c,
      displayName: formatCapsDisplayName(c.capsName || '')
    }));

    if (sortConfigCaps.key !== null) {
      items.sort((a: any, b: any) => {
        const aVal = a[sortConfigCaps.key];
        const bVal = b[sortConfigCaps.key];
        if (typeof aVal === 'string') {
          return sortConfigCaps.direction === 'asc' 
            ? aVal.localeCompare(bVal) 
            : bVal.localeCompare(aVal);
        }
        return sortConfigCaps.direction === 'asc' 
          ? (Number(aVal) || 0) - (Number(bVal) || 0) 
          : (Number(bVal) || 0) - (Number(aVal) || 0);
      });
    }
    return items;
  }, [data?.resumenCaps, sortConfigCaps]);

  // 1️⃣ Carga inicial (trae todo por defecto con período de 30 días)
  useEffect(() => {
    setLoading({ initial: true, filtering: false });

    apiFetch(`/stats?establecimiento=Todos&periodoDias=30`)
      .then(res => res.json())
      .then(resData => {
        setData(resData);
        setInitialProvincialData(resData);
        setUltimaActualizacion(resData.ultimaActualizacion || null);
        setLoading({ initial: false, filtering: false });

        registrarLog({ 
          modulo: "Estadísticas", 
          accion: "VISUALIZAR_ESTADISTICAS",
          detalles: "El usuario ingresó a revisar el panel de control de gestión y reportes estadísticos."
        }).catch(err => console.error("Error al registrar log:", err));
      })
      .catch(err => {
        console.error("Error al cargar estadísticas iniciales:", err);
        setLoading({ initial: false, filtering: false });
      });
  }, []);

  // 2️⃣ Carga dinámica (se dispara al cambiar de zona O al cambiar de 7, 15 o 30 días)
  useEffect(() => {
    if (!initialProvincialData) return; // Espera a que termine la carga inicial

    setLoading(prev => ({ ...prev, filtering: true }));

    // 🌟 Enviamos tanto la zona como el período de días seleccionado
    apiFetch(`/stats?establecimiento=${zonaChart}&periodoDias=${periodoComparativa}`)
      .then(res => res.json())
      .then(filteredData => {
        setData((prev: any) => ({
          ...prev,
          distribucionEG: filteredData.distribucionEG,
          topGeneral: filteredData.topGeneral,
          topRiesgoAtraso: filteredData.topRiesgoAtraso,
          resumenCaps: filteredData.resumenCaps,
          coberturaStats: filteredData.coberturaStats || initialProvincialData.coberturaStats,
          comparativaCaps: filteredData.comparativaCaps // <-- Se actualiza con el nuevo período
        }));
        setLoading(prev => ({ ...prev, filtering: false }));
      })
      .catch(err => {
        console.error(err);
        setLoading(prev => ({ ...prev, filtering: false }));
      });
  }, [zonaChart, periodoComparativa, initialProvincialData]);

  // 🌟 Cálculo para la tarjeta de Efectividad de Contacto
  const contactosConTurno = data?.gestion?.desgloseZona?.contactosConTurnoCaps || 0;
  const contactosTotales = data?.gestion?.desgloseZona?.contactosTotalesCaps || 0;
  const efectividadContactoPct = contactosTotales > 0 
    ? ((contactosConTurno / contactosTotales) * 100).toFixed(0) 
    : 0;
  
  const totalPadron = data?.general?.total || 0;
  const getPct = (value: number) => {
    if (!totalPadron) return "0.0%";
    return ((value / totalPadron) * 100).toFixed(1) + "%";
  };

  // 🌟 FUNCIÓN PARA CALCULAR SOBRE EL PADRÓN DE CAPITAL (1.171)
  const totalPadronCapital = data?.general?.desgloseZona?.capital || 0;
  const getPctCapital = (value: number) => {
    if (!totalPadronCapital) return "0.0%";
    return ((value / totalPadronCapital) * 100).toFixed(1) + "%";
  };

  const exportarAExcel = () => {
    if (!sortedCaps || sortedCaps.length === 0) {
      alert("No hay datos en la tabla para exportar.");
      return;
    }

    const fechaHoraDescarga = new Date().toLocaleDateString('es-AR') + " " + new Date().toLocaleTimeString('es-AR');
    const fechaT0 = sortedCaps[0]?.fechaT0 ? new Date(sortedCaps[0].fechaT0).toLocaleDateString('es-AR') : `Hace ${periodoComparativa} días`;
    const fechaT1 = sortedCaps[0]?.fechaT1 ? new Date(sortedCaps[0].fechaT1).toLocaleDateString('es-AR') : 'Actual';

    const encabezado = [
      ["REPORTE INTEGRAL DE GESTIÓN Y COBERTURA POR CAPS (CAPITAL)"],
      [`Período analizado: Últimos ${periodoComparativa} días (${fechaT0} → ${fechaT1})`],
      [`Fecha de descarga: ${fechaHoraDescarga}`],
      [],
      ["MÉTRICAS GENERALES PROVINCIALES"],
      ["Padrón Provincial Activo", "Total en Alto Riesgo", "Total en Riesgo Controladas", "Total Controladas (Al Día)", "Total Seguimiento Adecuado"],
      [
        `${totalPadron} (100%)`,
        `${data?.riesgo?.total || 0} (${getPct(data?.riesgo?.total || 0)})`, 
        `${data?.gestion?.riesgoControladas || 0} (${getPct(data?.gestion?.riesgoControladas || 0)})`,
        `${data?.gestion?.controladas || 0} (${getPct(data?.gestion?.controladas || 0)})`, 
        `${data?.gestion?.seguimientoAdecuado || 0} (${getPct(data?.gestion?.seguimientoAdecuado || 0)})`
      ],
      [],
      ["MÉTRICAS DEPARTAMENTO CAPITAL"],
      ["Padrón Capital", "Riesgo Capital", "Riesgo Controlado Capital", "Controladas Capital", "Seguimiento Adecuado Capital"],
      [
        `${data?.general?.desgloseZona?.capital || 0} (${getPct(data?.general?.desgloseZona?.capital || 0)})`,
        `${data?.riesgo?.desgloseZona?.capital || 0} (${getPct(data?.riesgo?.desgloseZona?.capital || 0)})`,
        `${data?.gestion?.desgloseZona?.riesgoControladas?.capital || 0} (${getPct(data?.gestion?.desgloseZona?.riesgoControladas?.capital || 0)})`,
        `${data?.gestion?.desgloseZona?.controladas?.capital || 0} (${getPct(data?.gestion?.desgloseZona?.controladas?.capital || 0)})`,
        `${data?.gestion?.desgloseZona?.seguimientoAdecuado?.capital || 0} (${getPct(data?.gestion?.desgloseZona?.seguimientoAdecuado?.capital || 0)})`
      ],
      [],
      ["DESEMPEÑO Y EVOLUCIÓN POR CENTRO DE SALUD"]
    ];

    const hoja = XLSX.utils.aoa_to_sheet(encabezado);

    const datosFormateados = sortedCaps.map((c: any) => ({
      "Centro de Salud": c.displayName,
      [`Padrón (${fechaT0})`]: c.padronAnt,
      [`Padrón (${fechaT1})`]: c.padronAct,
      [`Controladas (${fechaT0})`]: c.ctrlAnt,
      [`Controladas (${fechaT1})`]: c.ctrlAct,
      [`Cobertura (${fechaT0})`]: `${c.cobAnt}%`,
      [`Cobertura (${fechaT1})`]: `${c.cobAct}%`,
      "Variación Cobertura": `${c.variacionCob >= 0 ? '+' : ''}${c.variacionCob} p.p.`,
      "% Seguimiento Adecuado": `${c.pctSeguimientoAdecuado}%`,
      "% Gestión Proactiva": `${c.pctGestion}%`,
      "Controladas x Gestión": c.controladasGestion,
      "Controladas Espontáneas": c.controladasEspontaneas,
      "Próximos Turnos": c.turnosAsignadosCaps
    }));

    XLSX.utils.sheet_add_json(hoja, datosFormateados, { origin: "A14" });
    hoja['!cols'] = [
      { wch: 38 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 },
      { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 24 }, { wch: 22 },
      { wch: 22 }, { wch: 24 }, { wch: 16 }
    ];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Reporte CAPS Capital");

    const fechaDescargaISO = new Date().toISOString().split('T')[0];
    XLSX.writeFile(libro, `Reporte_CAPS_Capital_${fechaDescargaISO}.xlsx`);

    registrarLog({
      modulo: "Estadísticas",
      accion: "EXPORTAR_EXCEL",
      detalles: `Exportó reporte consolidado de CAPS (${periodoComparativa} días).`
    }).catch(err => console.error("Error al registrar log:", err));
  };

  // 🌟 SE MOVIÓ ESTA FUNCIÓN AQUÍ PARA QUE ESTÉ DISPONIBLE ANTES DE SER LLAMADA
  const filterAndFormat = (arr: any[]) => {
    // El backend ahora maneja el filtrado por 'departamento' y el top 15.
    // Esta función solo necesita aplicar romanToArabic y el slice para el top 15 (si el backend no lo hace).
    return arr
      .slice(0, 15)
      .map(item => ({
        ...item,
        name: romanToArabic(item.name)
      }));
  };

  // Safe checks con optional chaining preventivo
  const topGeneral = filterAndFormat(data?.topGeneral || []);
  const topRiesgo = filterAndFormat(data?.topRiesgoAtraso || []);

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

  if (isSupervisora) {
    return (
      <>
        <Navbar />
        <div className={styles.container} style={{ padding: '2rem', minHeight: '72vh' }}>
          <div style={{ background: '#fff', borderRadius: '1rem', padding: '2rem', boxShadow: '0 12px 24px rgba(15,23,42,0.08)', maxWidth: '720px', margin: '2rem auto' }}>
            <h1 style={{ marginBottom: '1rem', color: '#0f172a' }}>Acceso denegado</h1>
            <p style={{ color: '#475569', lineHeight: '1.7' }}>
              El rol <strong>Supervisora</strong> sólo puede acceder a la sección de Seguimiento. No tiene permiso para ver Estadísticas.
            </p>
          </div>
        </div>
      </>
    );
  }

  if (loading.initial || !data) {
    return (
      <>
        <Navbar />
        <div className={styles.container} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
          <Loader2 className="animate-spin text-slate-400" size={48} />
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className={styles.container}>
        
        {/* Encabezado */}
        <div className={styles.header}>
          <div className={styles.titleArea}>
            {isCAPS ? (
              <>
                <h1>Estadísticas del Centro: {session?.user?.name}</h1>
                <p>Datos sobre embarazadas activas en su centro, excluyendo pacientes derivadas.</p>
              </>
            ) : isMaternidad ? (
              <>
                <h1>Estadísticas de la Maternidad: {session?.user?.name}</h1>
                <p>Datos sobre embarazadas bajo su seguimiento y pacientes derivadas a esta institución.</p>
              </>
            ) : (
              <>
                <h1>Estadísticas e Indicadores Provinciales</h1>
                <p>Panel de control clínico y auditoría de gestión de efectores.</p>
              </>
            )}
          </div>
          {/* 🌟 SECCIÓN DE LA DERECHA ACOMODADA PROLIJAMENTE */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
            {ultimaActualizacion && (
              <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 550,  padding: '3px 10px', borderRadius: '6px' }}>
                Datos al: {new Date(ultimaActualizacion).toLocaleDateString('es-AR')}
              </span>
            )}
            {isAdminOrCoord && (
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
            )}
          </div>
        </div>

        {/* KPIs COMPACTOS SÓLO SI ES ADMIN O COORDINADOR */}
        {isAdminOrCoord ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
            
            {/* 🌟 FILA 1: MÉTRICAS GENERALES PROVINCIALES */}
            <div className={styles.kpiGridAdmin}>
              <div className={styles.kpiCardCompact}>
                <span className={styles.kpiLabel}>Total Padrón Provincial</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '0.25rem' }}>
                  <span className={styles.kpiSubValue} style={{ color: '#0f172a', margin: 0 }}>
                    {(data?.general?.total || 0).toLocaleString('es-AR')}
                  </span>
                  <span style={{ fontSize: '0.95rem', color: '#94a3b8', fontWeight: 700 }}>(100%)</span>
                </div>
                <small className={styles.kpiSubtext}>Embarazadas activas</small>
              </div>
              
              <div className={styles.kpiCardCompact}>
                <span className={styles.kpiLabel} style={{ color: '#991b1b' }}>Total en Alto Riesgo</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '0.25rem' }}>
                  <span className={styles.kpiSubValue} style={{ color: '#dc2626', margin: 0 }}>
                    {(data?.riesgo?.total || 0).toLocaleString('es-AR')}
                  </span>
                  <span style={{ fontSize: '0.95rem', color: '#f87171', fontWeight: 700 }}>({getPct(data?.riesgo?.total || 0)})</span>
                </div>
                <small className={styles.kpiSubtext} style={{ color: '#991b1b' }}>Seguimiento prioritario</small>
              </div>

              <div className={styles.kpiCardCompact}>
                <span className={styles.kpiLabel} style={{ color: '#c76d07' }}>Total en Riesgo Controladas</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '0.25rem' }}>
                  <span className={styles.kpiSubValue} style={{ color: '#f18913', margin: 0 }}>
                    {(data?.gestion?.riesgoControladas || 0).toLocaleString('es-AR')}
                  </span>
                  <span style={{ fontSize: '0.95rem', color: '#f1a23a', fontWeight: 700 }}>({getPct(data?.gestion?.riesgoControladas || 0)})</span>
                </div>
                <small className={styles.kpiSubtext} style={{ color: '#c76d07' }}>Pacientes de riesgo con controles al día</small>
              </div>

              <div className={`${styles.kpiCardCompact} ${styles.kpiCardVerde}`}>
                <span className={styles.kpiLabel}>Total Controladas</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '0.25rem' }}>
                  <span className={`${styles.kpiSubValue} ${styles.valGreen}`}>
                    {(data?.gestion?.controladas || 0).toLocaleString('es-AR')}
                  </span>
                  <span style={{ fontSize: '0.95rem', color: '#16a34a', fontWeight: 700 }}>({getPct(data?.gestion?.controladas || 0)})</span>
                </div>
                <small className={styles.kpiSubtext}>Controles vigentes en los últimos 30 días</small>
              </div>

              <div className={styles.kpiCardCompact}>
                <span className={styles.kpiLabel} style={{ color: '#0b6aa8e0' }}>Total Seguimiento Adecuado</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '0.25rem' }}>
                  <span className={styles.kpiSubValue} style={{ color: '#1276b8e0', margin: 0 }}>
                    {(data?.gestion?.seguimientoAdecuado || 0).toLocaleString('es-AR')}
                  </span>
                  <span style={{ fontSize: '0.95rem', color: '#207ae9c7', fontWeight: 700 }}>
                    ({getPct(data?.gestion?.seguimientoAdecuado || 0)})
                  </span>
                </div>
                <small className={styles.kpiSubtext} style={{ color: '#0b6aa8e0' }}>Seguimiento adecuado durante el embarazo</small>
              </div>
            </div>

            {/* 🌟 FILA 2: DEPARTAMENTO CAPITAL (CALCULADO SOBRE PADRÓN CAPITAL) */}
            <div className={styles.kpiGridAdmin}>
              <KpiDesgloseCard 
                label="Padrón Capital" 
                pct={getPct(data?.general?.desgloseZona?.capital || 0)} 
                value={data?.general?.desgloseZona?.capital || 0} 
                valueColor="#0f172a" 
                pctColor="#94a3b8" 
                labelColor="#64748b"
                subtext="del padrón provincial total"
              />

              <KpiDesgloseCard 
                label="Riesgo Capital" 
                pct={getPctCapital(data?.riesgo?.desgloseZona?.capital || 0)} 
                value={data?.riesgo?.desgloseZona?.capital || 0} 
                valueColor="#dc2626" 
                pctColor="#f87171" 
                labelColor="#991b1b" 
                subtext="Alto riesgo sobre padrón Capital"
              />

              <KpiDesgloseCard 
                label="Riesgo Controlado Capital" 
                pct={getPctCapital(data?.gestion?.desgloseZona?.riesgoControladas?.capital || 0)} 
                value={data?.gestion?.desgloseZona?.riesgoControladas?.capital || 0} 
                valueColor="#f18913" 
                pctColor="#f1a23a" 
                labelColor="#c76d07" 
                subtext="Riesgo con control al día en Capital"
              />

              <KpiDesgloseCard 
                label="Controladas Capital" 
                pct={getPctCapital(data?.gestion?.desgloseZona?.controladas?.capital || 0)} 
                value={data?.gestion?.desgloseZona?.controladas?.capital || 0} 
                className={styles.kpiCardVerde} 
                valueColor="#15803d" 
                pctColor="#16a34a" 
                labelColor="#166534"
                subtext="Cobertura de controles en Capital"
              />

              <KpiDesgloseCard 
                label="Seguimiento Adecuado Capital" 
                pct={getPctCapital(data?.gestion?.desgloseZona?.seguimientoAdecuado?.capital || 0)} 
                value={data?.gestion?.desgloseZona?.seguimientoAdecuado?.capital || 0} 
                valueColor="#1276b8e0" 
                pctColor="#207ae9c7" 
                labelColor="#0b6aa8e0"
                subtext="Continuidad clínica en Capital"
              />
            </div>
          </div>
        ) : (
          /* 🌟 INTERFAZ TRADICIONAL ORIGINAL TOTALMENTE BLINDADA CONTRA NULLS */
          <>
            <h2 className={styles.sectionTitle}>Embarazadas General</h2>
            <div className={styles.kpiRow}>
              <div className={`${styles.kpiCard} ${styles.genTotal}`}>
                <span className={styles.kpiLabel}>Total</span>
                <span className={`${styles.kpiValue} ${styles.valBlack}`}>{(data?.general?.total || 0).toLocaleString('es-AR')}</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Menores a 15 años</span>
                <span className={`${styles.kpiValue} ${styles.valRed}`}>{(data?.general?.sub15 || 0).toLocaleString('es-AR')}</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>15 a 19 años</span>
                <span className={`${styles.kpiValue} ${styles.valBlack}`}>{(data?.general?.age15_19 || 0).toLocaleString('es-AR')}</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>20 a 34 años</span>
                <span className={`${styles.kpiValue} ${styles.valBlack}`}>{(data?.general?.age20_34 || 0).toLocaleString('es-AR')}</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Mayores a 34 años</span>
                <span className={`${styles.kpiValue} ${styles.valRed}`}>{(data?.general?.age34plus || 0).toLocaleString('es-AR')}</span>
              </div>
            </div>

            <h2 className={styles.sectionTitle}>Embarazadas Riesgo</h2>
            <div className={styles.kpiRow}>
              <div className={`${styles.kpiCard} ${styles.rsgTotal}`}>
                <span className={styles.kpiLabel}>Total Riesgo</span>
                <span className={`${styles.kpiValue} ${styles.valRed}`}>{(data?.riesgo?.total || 0).toLocaleString('es-AR')}</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Menores a 15 años</span>
                <span className={`${styles.kpiValue} ${styles.valBlack}`}>{(data?.riesgo?.sub15 || 0).toLocaleString('es-AR')}</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>15 a 19 años</span>
                <span className={`${styles.kpiValue} ${styles.valBlack}`}>{(data?.riesgo?.age15_19 || 0).toLocaleString('es-AR')}</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>20 a 34 años</span>
                <span className={`${styles.kpiValue} ${styles.valBlack}`}>{(data?.riesgo?.age20_34 || 0).toLocaleString('es-AR')}</span>
              </div>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Mayores a 34 años</span>
                <span className={`${styles.kpiValue} ${styles.valBlack}`}>{(data?.riesgo?.age34plus || 0).toLocaleString('es-AR')}</span>
              </div>
            </div>
          </>
        )}

        {/* Módulo Operativo Exclusivo para Centros de Salud */}
        {isCAPS && (
          <>
            <h2 className={styles.sectionTitle}>Gestión Prioritaria del Centro</h2>
            {/* 🌟 PRIMERA FILA: Alertas Críticas e Inmediatas */}
            <div className={styles.kpiGridAdmin}>
              <KpiCardConTooltip
                label="Partos en 30 días"
                value={data?.gestion?.proximosPartos}
                tooltip="Total de embarazadas en la recta final (semana 36+ o FPP en los próximos 30 días)."
                color="#769FD3"
              />
              <KpiCardConTooltip
                label="Riesgo sin Control"
                value={data?.gestion?.desgloseZona?.riesgoSinControl || 0}
                tooltip="Cantidad de embarazadas con riesgo alto/moderado que llevan más de 30 días sin control médico."
                color="#c76d07"
              />
              <KpiCardConTooltip
                label="Controles Atrasados"
                value={data?.gestion?.controlesPendientes}
                tooltip="Pacientes que superaron los 30 días desde su último control médico."
                color="#ef4444"
              />
              <KpiCardConTooltip
                label="Requieren Contacto"
                value={data?.gestion?.sinContactoReciente}
                tooltip="Pacientes que superaron los 30 días desde su último contacto registrado o con turnos perdidos."
                color="#ef4444"
              />
              <KpiCardConTooltip
                label="Sin Teléfono"
                value={data?.gestion?.sinTelefono}
                tooltip="Embarazadas sin un número de contacto válido."
                color="#4b5563"
              />
            </div>

            {/* 🌟 SEGUNDA FILA: Gestión, Logros y Calidad */}
            <div className={styles.kpiGridAdmin} style={{ marginTop: '1rem' }}>
              <KpiCardConTooltip
                label="Seguimiento Adecuado"
                value={data?.gestion?.desgloseZona?.seguimientoAdecuadoCaps || 0}
                tooltip="Total de embarazadas con sus controles médicos y contactos al día (últimos 30 días)."
                color="#1276b8e0"
              />
              <KpiCardConTooltip
                label="Turnos Asignados x Tablero"
                value={data?.gestion?.desgloseZona?.turnosAsignadosCaps || 0}
                tooltip="Pacientes contactadas y agendadas con un turno directamente a través de las acciones del tablero."
                color="#1276b8e0"
              />
              <KpiCardConTooltip
                label="Derivadas"
                value={data?.gestion?.derivadas}
                tooltip="Pacientes derivadas a un nivel de mayor complejidad (hospitales, maternidades) por complicaciones o estudios específicos."
                color="#769FD3"
              />
              <KpiCardConTooltip
                label="Captación Precoz (< 12 sem)"
                value={data?.gestion?.desgloseZona?.captacionPrecozCaps || 0}
                tooltip="Total de embarazadas que iniciaron su primer control médico dentro del primer trimestre."
                color="#15803d"
              />
              <div className={styles.kpiCardCompact}>
                <div className={styles.labelWithTooltip}>
                  <span className={styles.kpiLabel}>Efectividad de Contacto</span>
                  <div className={styles.tooltipContainer}>
                    <Info size={13} className={styles.infoIcon} />
                    <span className={styles.tooltipText}>Porcentaje de contactos efectivos (llamadas, mensajes) que resultaron en un turno agendado en los últimos 30 días.</span>
                  </div>
                </div>
                <span className={styles.kpiSubValue} style={{ color: '#15803d' }}>{efectividadContactoPct}%</span>
                <small className={styles.kpiSubtext} style={{marginTop: '4px'}}>{`(${contactosConTurno} de ${contactosTotales} contactos)`}</small>
              </div>
            </div>

            <h2 className={styles.sectionTitle}>Cobertura de Controles Médicos</h2>
            <div className={styles.kpiGridCentered}>
              <div className={styles.kpiCardCompact} style={{ textAlign: 'center' }}>
                <span className={styles.kpiLabel}>Último Día</span>
                <small className={styles.kpiSubtext}>({textoHoy})</small>
                <span className={styles.kpiSubValue} style={{ color: '#769FD3', marginTop: '0.5rem' }}>{(data?.actividad?.hoy || 0).toLocaleString('es-AR')}</span>
              </div>
              <div className={styles.kpiCardCompact} style={{ textAlign: 'center' }}>
                <span className={styles.kpiLabel}>Última Semana</span>
                <small className={styles.kpiSubtext}>({textoSemana})</small>
                <span className={styles.kpiSubValue} style={{ color: '#769FD3', marginTop: '0.5rem' }}>{(data?.actividad?.semana || 0).toLocaleString('es-AR')}</span>
              </div>
              <div className={styles.kpiCardCompact} style={{ textAlign: 'center' }}>
                <span className={styles.kpiLabel}>Último Mes</span>
                <small className={styles.kpiSubtext}>({textoMes})</small>
                <span className={styles.kpiSubValue} style={{ color: '#769FD3', marginTop: '0.5rem' }}>{(data?.actividad?.mes || 0).toLocaleString('es-AR')}</span>
              </div>
            </div>
          </>
        )}

        {/* 🌟 TABLA CONSOLIDADA: DESEMPEÑO Y EVOLUCIÓN POR CAPS */}
        {isAdminOrCoord && (
          <div className={styles.tableContainerCaps} style={{ marginTop: '2rem', marginBottom: '2.5rem' }}>
            <div className={styles.tableHeaderArea} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2>Desempeño y Evolución de Cobertura por CAPS</h2>
                <p>
                  Monitoreo integral de padrón activo, controles médicos al día, gestión proactiva y variación de cobertura.
                </p>
              </div>

              {/* ⏸️ BOTONES OCULTADOS MOMENTÁNEAMENTE HASTA TENER HISTORIAL COMPLETO
              <div style={{ display: 'flex', gap: '6px', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
                <button type="button" onClick={() => setPeriodoComparativa(7)}>Últimos 7 días</button>
                <button type="button" onClick={() => setPeriodoComparativa(15)}>Últimos 15 días</button>
                <button type="button" onClick={() => setPeriodoComparativa(30)}>Últimos 30 días</button>
              </div>
              */}
            </div>

            <div className={styles.responsiveTableWrapper}>
              <table className={styles.capsTable}>
                <thead>
                  <tr>
                    <th onClick={() => handleSortCaps('displayName')} className={styles.sortableHeader}>
                      <div className={styles.headerContent}>
                        <span>Centro de Salud (Efector)</span>
                        <span className={styles.sortIcon}>{sortConfigCaps.key === 'displayName' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </div>
                    </th>
                    <th onClick={() => handleSortCaps('padronAct')} className={styles.sortableHeader} title="Evolución del padrón de embarazadas activas entre el corte anterior y el actual.">
                      <div className={styles.headerContent} style={{ justifyContent: 'center' }}>
                        <span>Padrón Evolutivo</span>
                        <span className={styles.sortIcon}>{sortConfigCaps.key === 'padronAct' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </div>
                    </th>
                    <th style={{ textAlign: 'center' }} title="Evolución de embarazadas con control médico vigente entre ambos cortes.">
                      Controladas
                    </th>
                    <th onClick={() => handleSortCaps('cobAct')} className={styles.sortableHeader} title="% de controladas sobre el padrón activo actual y variación en puntos porcentuales contra el período anterior.">
                      <div className={styles.headerContent} style={{ justifyContent: 'center' }}>
                        <span>% Cobertura</span>
                        <span className={styles.sortIcon}>{sortConfigCaps.key === 'cobAct' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </div>
                    </th>
                    <th onClick={() => handleSortCaps('pctSeguimientoAdecuado')} className={styles.sortableHeader} title="Cumplen con captación temprana (1er trimestre) y frecuencia adecuada de controles según EG.">
                      <div className={styles.headerContent} style={{ justifyContent: 'center' }}>
                        <span>% Seg. Adecuado</span>
                        <span className={styles.sortIcon}>{sortConfigCaps.key === 'pctSeguimientoAdecuado' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </div>
                    </th>
                    <th onClick={() => handleSortCaps('pctGestion')} className={styles.sortableHeader} title="% de embarazadas controladas que tuvieron un contacto previo registrado desde el tablero (Gestión Proactiva).">
                      <div className={styles.headerContent} style={{ justifyContent: 'center' }}>
                        <span>% Gestión Proactiva</span>
                        <span className={styles.sortIcon}>{sortConfigCaps.key === 'pctGestion' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </div>
                    </th>
                    <th onClick={() => handleSortCaps('turnosAsignadosCaps')} className={styles.sortableHeader} title="Pacientes con fecha de próximo turno agendada a partir de hoy.">
                      <div className={styles.headerContent} style={{ justifyContent: 'center' }}>
                        <span>Próximos Turnos</span>
                        <span className={styles.sortIcon}>{sortConfigCaps.key === 'turnosAsignadosCaps' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCaps.length > 0 ? (
                    sortedCaps.map((caps: any, idx: number) => {
                      const isPositive = caps.variacionCob >= 0;
                      const diffPadron = caps.padronAct - caps.padronAnt;
                      const signoPadron = diffPadron > 0 ? `+${diffPadron}` : `${diffPadron}`;

                      return (
                        <tr key={idx}>
                          {/* Centro de Salud */}
                          <td style={{ fontWeight: 550, color: '#334155' }}>
                            {caps.displayName}
                          </td>

                          {/* 🌟 Padrón Evolutivo con Tooltip */}
                          <td 
                            style={{ textAlign: 'center', cursor: 'help' }}
                            title={`Evolución del Padrón:\n• Corte Anterior: ${caps.padronAnt} embarazadas activas\n• Corte Actual: ${caps.padronAct} embarazadas activas\n• Variación neta: ${signoPadron} pacientes`}
                          >
                            <span style={{ color: '#94a3b8' }}>{caps.padronAnt}</span>
                            <span style={{ color: '#cbd5e1', margin: '0 4px' }}>→</span>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>{caps.padronAct}</span>
                          </td>

                          {/* 🌟 Controladas Evolutivo con Tooltip en toda la celda */}
                          <td 
                            style={{ textAlign: 'center', cursor: 'help' }}
                            title={`Control Médico Vigente (últimos 30 días):\n• Corte Anterior: ${caps.ctrlAnt} controladas\n• Corte Actual: ${caps.ctrlAct} controladas\n\nDesglose Corte Actual:\n• ${caps.controladasGestion} por Gestión Proactiva (llamada/turno previo)\n• ${caps.controladasEspontaneas} por Asistencia Espontánea`}
                          >
                            <span style={{ color: '#94a3b8' }}>{caps.ctrlAnt}</span>
                            <span style={{ color: '#cbd5e1', margin: '0 4px' }}>→</span>
                            <span style={{ fontWeight: 700, color: '#15803d' }}>{caps.ctrlAct}</span>
                          </td>

                          {/* 🌟 % Cobertura + Variación con Tooltip detallado */}
                          <td 
                            style={{ textAlign: 'center', cursor: 'help' }}
                            title={`Cobertura de Controles:\n• Actual: ${caps.cobAct}% (${caps.ctrlAct} de ${caps.padronAct} pacientes)\n• Anterior: ${caps.cobAnt}% (${caps.ctrlAnt} de ${caps.padronAnt} pacientes)\n• Variación: ${isPositive ? `+${caps.variacionCob}` : caps.variacionCob} p.p.`}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                              <span className={getSemaforoBadgeClass(caps.cobAct)}>
                                {caps.cobAct}%
                              </span>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                backgroundColor: isPositive ? '#dcfce7' : '#fee2e2',
                                color: isPositive ? '#15803d' : '#b91c1c'
                              }}>
                                {isPositive ? `+${caps.variacionCob}` : caps.variacionCob} p.p.
                              </span>
                            </div>
                          </td>

                          {/* % Seguimiento Adecuado */}
                          <td 
                            style={{ textAlign: 'center', cursor: 'help' }}
                            title={`${caps.absSeguimientoAdecuado} de ${caps.padronAct} pacientes cumplen con la captación precoz y continuidad esperada.`}
                          >
                            <span className={styles.badgeAmarillo}>
                              {caps.pctSeguimientoAdecuado}%
                            </span>
                          </td>

                          {/* % Gestión Proactiva */}
                          <td 
                            style={{ textAlign: 'center', cursor: 'help' }}
                            title={`${caps.controladasGestion} de las ${caps.ctrlAct} controladas fueron contactadas desde el tablero.`}
                          >
                            <span className={styles.badgeCeleste}>
                              {caps.pctGestion}%
                            </span>
                          </td>

                          {/* Próximos Turnos */}
                          <td 
                            style={{ textAlign: 'center', fontWeight: 600, color: '#334155', cursor: 'help' }}
                            title={`${caps.turnosAsignadosCaps} pacientes tienen turno agendado desde hoy en adelante.`}
                          >
                            {caps.turnosAsignadosCaps}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        No se encontraron registros de CAPS para el período seleccionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}




        {/* 🌟 GRÁFICOS DE BARRAS AHORA VISIBLES PARA TODOS, CON LÓGICA CONDICIONAL */}
        {(isAdminOrCoord || isMaternidad || isCAPS) && (
          <div className={styles.chartsSection}>
            {loading.filtering && <div className={styles.filteringOverlay}><Loader2 className="animate-spin" size={32} /></div>}

            {/* Los filtros de zona solo son para Admin/Coordinador y se deshabilitan mientras se filtra */}
            {isAdminOrCoord && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', justifyContent: 'center' }}>
                <button style={getBtnStyle('Todos')} onClick={() => setZonaChart('Todos')}>Toda la Provincia</button>
                <button style={getBtnStyle('Capital')} onClick={() => setZonaChart('Capital')}>Solo Capital</button>
                <button style={getBtnStyle('Interior')} onClick={() => setZonaChart('Interior')}>Solo Interior</button>
              </div>
            )}

            {/* 🌟 GRÁFICOS PRINCIPALES EN PARALELO */}
            <div className={styles.chartsGrid} style={{ marginBottom: '1.5rem' }}>
              {/* Gráfico de semanas de gestación */}
              <div className={styles.chartCard} style={{ paddingBottom: '2.5rem' }}>
                <h3 className={styles.chartTitle}>
                  Distribución por Semanas de Embarazo (EG)
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '-0.5rem 0 1.5rem 0' }}>
                  Captación y controles de control prenatal según edad gestacional.
                </p>
                <div className={styles.chartWrapper} style={{ height: '350px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.distribucionEG || []} margin={{ top: 20, right: 10, left: 10, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis 
                        dataKey="rango" 
                        tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }}
                      >
                        <Label value="Semanas de Edad Gestacional (EG)" offset={-15} position="insideBottom" fill="#475569" style={{ fontWeight: 600, fontSize: 11 }} />
                      </XAxis>
                      <YAxis tick={{ fill: '#475569', fontSize: 11 }}>
                        <Label value="Embarazadas" angle={-90} position="insideLeft" offset={0} fill="#475569" style={{ fontWeight: 600, fontSize: 11 }} />
                      </YAxis>
                      <Tooltip 
                        cursor={{ fill: '#f1f5f9' }} 
                        labelFormatter={(label) => `${label} semanas`}
                      />
                      <Bar dataKey="Embarazos Activos" fill="#608bc4" radius={[4, 4, 0, 0]} barSize={18} />
                      <Bar dataKey="Controladas (Al día)" fill="#16a34a" radius={[4, 4, 0, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Gráfico de Obras Sociales (Mamá Mbareté) */}
              <div className={styles.chartCard} style={{ paddingBottom: '2.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                  <h3 className={styles.chartTitle} style={{ margin: 0, paddingRight: '1rem' }}>
                    Distribución de Coberturas de Salud
                  </h3>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '-0.5rem 0 1.5rem 0' }}>
                  Distribución de cobertura de salud y elegibilidad del programa.
                </p>
                <div className={styles.chartWrapper} style={{ height: '350px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data?.coberturaStats || []}
                        cx="50%"
                        cy="45%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={90}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {(data?.coberturaStats || []).map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={["#608bc4", "#16a34a", "#94a3b8"][index % 3]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [value, "Cantidad"]} />
                      <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '11px', fontWeight: 600 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            
            {/* Los gráficos de TOPs solo se muestran para Admin, Coord y Maternidad */}
            {(isAdminOrCoord || isMaternidad) && (
              <div className={styles.chartsGrid}>
                <div className={styles.chartCard}>
                  <h3 className={styles.chartTitle}>
                    {isMaternidad ? "Top 15 — Centros de Salud que derivaron pacientes" : "Top 15 — Establecimientos con más embarazadas"}
                  </h3>
                  <div className={styles.chartWrapper}>
                    <ResponsiveContainer width="100%" height="100%" minHeight={350}>
                      {/* 🌟 AJUSTE: Aumentamos margen izquierdo y inferior para dar espacio a las etiquetas */}
                      <BarChart data={topGeneral} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        {/* 🌟 AJUSTE: Añadimos la etiqueta al eje X */}
                        <XAxis type="number">
                          <Label value="Cantidad de Embarazadas" offset={-15} position="insideBottom" fill="#475569" style={{ fontWeight: 600, fontSize: 13 }} />
                        </XAxis>
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          width={220} // Un poco menos de ancho para compensar el margen
                          tick={{ fill: '#475569', fontSize: 11 }} 
                          tickFormatter={(value) => value.length > 35 ? `${value.substring(0, 35)}...` : value} // Trunca texto largo
                        />
                        <Tooltip 
                          cursor={{ fill: '#f1f5f9' }} 
                          formatter={(value: number) => [value, "Cantidad"]} 
                        />
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
                    <ResponsiveContainer width="100%" height="100%" minHeight={350}>
                      {/* 🌟 AJUSTE: Aumentamos margen izquierdo y inferior para dar espacio a las etiquetas */}
                      <BarChart data={topRiesgo} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        {/* 🌟 AJUSTE: Añadimos la etiqueta al eje X */}
                        <XAxis type="number">
                          <Label value="Cantidad de Embarazadas" offset={-15} position="insideBottom" fill="#475569" style={{ fontWeight: 600, fontSize: 13 }} />
                        </XAxis>
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          width={220} // Un poco menos de ancho para compensar el margen
                          tick={{ fill: '#475569', fontSize: 11 }} 
                          tickFormatter={(value) => value.length > 35 ? `${value.substring(0, 35)}...` : value} // Trunca texto largo
                        />
                        <Tooltip 
                          cursor={{ fill: '#f1f5f9' }} 
                          formatter={(value: number) => [value, "Cantidad"]} 
                        />
                        <Bar dataKey="value" fill="#ef4444" radius={[0, 7, 7, 0]} barSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </>
  );
}

// Componente unificado con la misma jerarquía y estilo que las cards principales
const KpiDesgloseCard = ({ label, pct, value, className, valueColor, pctColor, labelColor, subtext }: any) => (
  <div className={`${styles.kpiCardCompact} ${className || ''}`}>
    <span className={styles.kpiLabel} style={{ color: labelColor }}>
      {label}
    </span>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '0.25rem' }}>
      <span className={styles.kpiSubValue} style={{ color: valueColor || '#0f172a', margin: 0 }}>
        {pct}
      </span>
      <span style={{ fontSize: '0.95rem', color: pctColor || '#94a3b8', fontWeight: 700 }}>
        ({(value || 0).toLocaleString('es-AR')})
      </span>
    </div>
    <small className={styles.kpiSubtext} style={{ color: labelColor || '#94a3b8' }}>
      {subtext || "Métrica Departamento Capital"}
    </small>
  </div>
);