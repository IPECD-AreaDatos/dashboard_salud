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
import { Loader2, Download } from "lucide-react";
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

export default function StatsPage() {
  const { data: session } = useSession();
  const isMaternidad = session?.user?.role === 'Maternidad';
  const isCAPS = session?.user?.role === 'Centro de Salud';
  
  const userRole = session?.user?.role;
  const isAdminOrCoord = userRole === 'Administrador' || userRole === 'Coordinador';

  const [data, setData] = useState<any>(null);
  const [initialProvincialData, setInitialProvincialData] = useState<any>(null); // Nuevo estado para datos provinciales iniciales
  const [loading, setLoading] = useState({ initial: true, filtering: false }); // Estado de carga más detallado
  const [zonaChart, setZonaChart] = useState<'Todos' | 'Capital' | 'Interior'>('Todos');
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null);

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
    setLoading({ initial: true, filtering: false });
    // Carga inicial completa
    apiFetch(`/stats?establecimiento=Todos`) // Siempre carga la data provincial completa
      .then(res => res.json())
      .then(resData => {
        setData(resData);
        setInitialProvincialData(resData); // Guardamos la data provincial completa
        setUltimaActualizacion(resData.ultimaActualizacion || null);
        setLoading({ initial: false, filtering: false });
        registrarLog({ 
          modulo: "Estadísticas", 
          accion: "VISUALIZAR_ESTADISTICAS",
          detalles: `El usuario revisó el panel estadístico.`
        }).catch(err => console.error("Error al registrar log:", err));
      })
      .catch(err => {
        console.error("Error al cargar estadísticas:", err);
        setLoading({ initial: false, filtering: false });
      });
  }, []);

  // 🌟 EFFECT CORREGIDO: Escucha solo 'zonaChart' para actualizar solo los gráficos
  // Ahora depende de 'zonaChart' y 'initialProvincialData' (que es estable)
  useEffect(() => {
    if (!initialProvincialData) return; // Esperar a que la data provincial inicial se cargue
    
    setLoading(prev => ({ ...prev, filtering: true })); // Solo activamos el loader de filtrado
    apiFetch(`/stats?establecimiento=${zonaChart}`)
      .then(res => res.json())
      .then(filteredData => {
        // Construimos el nuevo estado 'data' combinando los KPIs globales con los datos de gráficos filtrados
        setData({
          ...initialProvincialData, // Mantenemos los KPIs globales (general, riesgo, gestion, actividad)
          distribucionEG: filteredData.distribucionEG,
          topGeneral: filteredData.topGeneral,
          topRiesgoAtraso: filteredData.topRiesgoAtraso,
          resumenCaps: filteredData.resumenCaps, // La tabla de CAPS también se filtra por zona
        });
        setLoading(prev => ({ ...prev, filtering: false }));
      })
      .catch(err => {
        console.error("Error al cargar estadísticas filtradas:", err);
        setLoading(prev => ({ ...prev, filtering: false }));
      });
    
    registrarLog({ 
      modulo: "Estadísticas", 
      accion: "FILTRAR_ZONA_GRAFICOS",
      detalles: `El usuario filtró los gráficos por zona: ${zonaChart}.`
    }).catch(err => console.error("Error al registrar log:", err));

  }, [zonaChart, initialProvincialData]); // Dependemos de 'zonaChart' y 'initialProvincialData'
  
  const totalPadron = data?.general?.total || 0;
  const getPct = (value: number) => {
    if (!totalPadron) return "0.0%";
    return ((value / totalPadron) * 100).toFixed(1) + "%";
  };

  const exportarAExcel = () => {
    if (!sortedCaps || sortedCaps.length === 0) {
      alert("No hay datos en la tabla para exportar.");
      return;
    }

    const encabezado = [
      ["ESTADÍSTICAS E INDICADORES PROVINCIALES"],
      ["Fecha de generación:", new Date().toLocaleDateString('es-AR') + " " + new Date().toLocaleTimeString('es-AR')],
      [],
      ["MÉTRICAS GENERALES"],
      ["Total Padrón Provincial", "Total en Alto Riesgo", "Total Controladas (Al Día)", "Total Contactadas", "Total Derivadas"],
      [
        `${totalPadron} (100%)`,
        `${data?.riesgo?.total || 0} (${getPct(data?.riesgo?.total || 0)})`, 
        `${data?.gestion?.controladas || 0} (${getPct(data?.gestion?.controladas || 0)})`, 
        `${data?.gestion?.contactadas || 0} (${getPct(data?.gestion?.contactadas || 0)})`, 
        `${data?.gestion?.derivadas || 0} (${getPct(data?.gestion?.derivadas || 0)})`
      ],
      [],
      ["DESEMPEÑO Y COBERTURA POR CAPS"]
    ];

    const hoja = XLSX.utils.aoa_to_sheet(encabezado);

    const datosFormateados = sortedCaps.map((caps: any) => ({
      "Centro de Salud (Efector)": romanToArabic(caps.capsName),
      "Padrón Activo": caps.total,
      "% Riesgo": caps.pctRiesgo,
      "% Controladas": caps.pctControl,
      "% Vínculo Activo": caps.pctVinculo, 
      "% Turnos Asignados x Tablero": caps.pctTurnosTablero
    }));

    XLSX.utils.sheet_add_json(hoja, datosFormateados, { origin: "A10" });
    hoja['!cols'] = [ { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 28 } ];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Reporte Provincial");

    const fechaDescarga = new Date().toISOString().split('T')[0];
    XLSX.writeFile(libro, `Reporte_Estadistico_Provincial_${fechaDescarga}.xlsx`);

    registrarLog({
      modulo: "Estadísticas",
      accion: "EXPORTAR_EXCEL",
      detalles: `Exportó reporte provincial integral incluyendo KPIs y desempeño de CAPS en formato Excel.`
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
              <span style={{ fontSize: '0.805rem', color: '#64748b', fontWeight: 500, backgroundColor: '#f1f5f9', padding: '3px 10px', borderRadius: '6px' }}>
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
          <>
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

            <div className={`${styles.kpiCardCompact} ${styles.kpiCardVerde}`}>
              <span className={styles.kpiLabel}>Total Controladas</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '0.25rem' }}>
                <span className={`${styles.kpiSubValue} ${styles.valGreen}`}>
                  {(data?.gestion?.controladas || 0).toLocaleString('es-AR')}
                </span>
                <span style={{ fontSize: '0.95rem', color: '#16a34a', fontWeight: 700 }}>({getPct(data?.gestion?.controladas || 0)})</span>
              </div>
              {/* 🌟 Etiqueta refinada con el período clínico */}
              <small className={styles.kpiSubtext}>Controles vigentes en el mes</small>
            </div>

            {/* Tarjeta de Total Contactadas mutada a Vínculo Activo */}
            <div className={styles.kpiCardCompact}>
              <span className={styles.kpiLabel}>Total Vínculo Activo</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '0.25rem' }}>
                <span className={styles.kpiSubValue} style={{ color: '#1276b8e0', margin: 0 }}>
                  {((data?.gestion?.contactadas || 0) + (data?.gestion?.acudieronSolas || 0)).toLocaleString('es-AR')}
                </span>
                {/* 🌟 Muestra el porcentaje consolidado de vínculo activo real sobre el padrón */}
                <span style={{ fontSize: '0.95rem', color: '#207ae9c7', fontWeight: 700 }}>
                  ({getPct((data?.gestion?.contactadas || 0) + (data?.gestion?.acudieronSolas || 0))})
                </span>
              </div>
              <small className={styles.kpiSubtext}>Gestión y demanda del último mes</small>
            </div>

            <div className={styles.kpiCardCompact}>
              <span className={styles.kpiLabel}>Total Derivadas</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '0.25rem' }}>
                <span className={styles.kpiSubValue} style={{ color: '#d67a10', margin: 0 }}>
                  {(data?.gestion?.derivadas || 0).toLocaleString('es-AR')}
                </span>
                <span style={{ fontSize: '0.95rem', color: '#f1a23a', fontWeight: 700 }}>({getPct(data?.gestion?.derivadas || 0)})</span>
              </div>
              <small className={styles.kpiSubtext}>Referidas a mayor nivel</small>
            </div>
            </div>

            {/* 🌟 NUEVA FILA DE DESGLOSE POR ZONA (MÁS COMPACTA) */}
            <div className={styles.kpiDesgloseGrid}>
              {/* --- PADRÓN --- */}
              <KpiDesgloseCard label="Padrón Capital" pct={getPct(data?.general?.desgloseZona?.capital || 0)} value={data?.general?.desgloseZona?.capital || 0} valueColor="#0f172a" pctColor="#94a3b8" />
              <KpiDesgloseCard label="Padrón Interior" pct={getPct(data?.general?.desgloseZona?.interior || 0)} value={data?.general?.desgloseZona?.interior || 0} valueColor="#0f172a" pctColor="#94a3b8" />
              {/* --- RIESGO --- */}
              <KpiDesgloseCard label="Riesgo Capital" pct={getPct(data?.riesgo?.desgloseZona?.capital || 0)} value={data?.riesgo?.desgloseZona?.capital || 0} valueColor="#dc2626" pctColor="#f87171" labelColor="#991b1b" />
              <KpiDesgloseCard label="Riesgo Interior" pct={getPct(data?.riesgo?.desgloseZona?.interior || 0)} value={data?.riesgo?.desgloseZona?.interior || 0} valueColor="#dc2626" pctColor="#f87171" labelColor="#991b1b" />
              {/* --- CONTROLADAS --- */}
              <KpiDesgloseCard label="Controladas Capital" pct={getPct(data?.gestion?.desgloseZona?.controladas?.capital || 0)} value={data?.gestion?.desgloseZona?.controladas?.capital || 0} className={styles.kpiCardVerde} valueColor="#15803d" pctColor="#16a34a" />
              <KpiDesgloseCard label="Controladas Interior" pct={getPct(data?.gestion?.desgloseZona?.controladas?.interior || 0)} value={data?.gestion?.desgloseZona?.controladas?.interior || 0} className={styles.kpiCardVerde} valueColor="#15803d" pctColor="#16a34a" />
              {/* --- NUEVO DESGLOSE: SEGUIMIENTO PROACTIVO VS ASISTENCIA ESPONTÁNEA --- */}
              <KpiDesgloseCard 
                label="Seguimiento Proactivo" 
                pct={getPct(data?.gestion?.contactadas || 0)} 
                value={data?.gestion?.contactadas || 0} 
                valueColor="#1276b8e0" 
                pctColor="#207ae9c7" 
              />
              <KpiDesgloseCard 
                label="Asistencia Espontánea" 
                pct={getPct(data?.gestion?.acudieronSolas || 0)} 
                value={data?.gestion?.acudieronSolas || 0} 
                valueColor="#1276b8e0" 
                pctColor="#207ae9c7" 
              />
              {/* --- DERIVADAS --- */}
              <KpiDesgloseCard label="Derivadas Capital" pct={getPct(data?.gestion?.desgloseZona?.derivadas?.capital || 0)} value={data?.gestion?.desgloseZona?.derivadas?.capital || 0} valueColor="#d67a10" pctColor="#f1a23a" />
              <KpiDesgloseCard label="Derivadas Interior" pct={getPct(data?.gestion?.desgloseZona?.derivadas?.interior || 0)} value={data?.gestion?.desgloseZona?.derivadas?.interior || 0} valueColor="#d67a10" pctColor="#f1a23a" />
            </div>
          </>
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
            <div className={styles.kpiGridAdmin}>
              <div className={styles.kpiCardCompact}>
                <span className={styles.kpiLabel}>Controles Atrasados</span>
                <span className={styles.kpiSubValue} style={{ color: '#ef4444' }}>{data?.gestion?.controlesPendientes}</span>
              </div>
              <div className={styles.kpiCardCompact}>
                <span className={styles.kpiLabel}>REQUIEREN CONTACTO</span>
                <span className={styles.kpiSubValue} style={{ color: '#ef4444' }}>{data?.gestion?.sinContactoReciente}</span>
              </div>
              <div className={styles.kpiCardCompact}>
                <span className={styles.kpiLabel}>Partos en 30 días</span>
                <span className={styles.kpiSubValue} style={{ color: '#769FD3' }}>{data?.gestion?.proximosPartos}</span>
              </div>
              <div className={styles.kpiCardCompact}>
                <span className={styles.kpiLabel}>Sin Teléfono</span>
                <span className={styles.kpiSubValue} style={{ color: '#4b5563' }}>{data?.gestion?.sinTelefono}</span>
              </div>
              <div className={styles.kpiCardCompact}>
                <span className={styles.kpiLabel}>Derivadas</span>
                <span className={styles.kpiSubValue} style={{ color: '#769FD3' }}>{data?.gestion?.derivadas}</span>
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

        {/* TABLA COMPARATIVA GERENCIAL POR PORCENTAJES PUROS */}
        {isAdminOrCoord && (
          <div className={styles.tableContainerCaps}>
            <div className={styles.tableHeaderArea}>
              <h2>Desempeño y Cobertura de Gestión por CAPS</h2>
              <p>
                Análisis de indicadores clave sobre las embarazadas activas de cada centro, excluyendo a las pacientes derivadas.
              </p>
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
                    <th onClick={() => handleSortCaps('total')} className={styles.sortableHeader} title="Padrón activo total del CAPS sin pacientes derivadas">
                      <div className={styles.headerContent} style={{ justifyContent: 'center' }}>
                        <span>Padrón Activo</span>
                        <span className={styles.sortIcon}>
                          {sortConfigCaps.key === 'total' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>
                    <th onClick={() => handleSortCaps('pctRiesgo')} className={styles.sortableHeader} title="Proporción de embarazadas con riesgo obstétrico sobre el padrón activo">
                      <div className={styles.headerContent} style={{ justifyContent: 'center' }}>
                        <span>% Riesgo</span>
                        <span className={styles.sortIcon}>
                          {sortConfigCaps.key === 'pctRiesgo' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSortCaps('pctControl')} 
                      className={styles.sortableHeader} 
                      title={`Se actualiza todos los días (Pacientes con controles al día)
                    • < 32 semanas: control en los últimos 30 días.
                    • 32 a 37 semanas: control en los últimos 15 días.
                    • ≥ 38 semanas: control en los últimos 7 días.`}
                    >
                      <div className={styles.headerContent} style={{ justifyContent: 'center' }}>
                        <span>% Controladas</span>
                        <span className={styles.sortIcon}>
                          {sortConfigCaps.key === 'pctControl' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>
                    <th onClick={() => handleSortCaps('pctVinculo')} className={styles.sortableHeader} title="Mide pacientes vinculadas por llamada o asistencia espontánea">
                      <div className={styles.headerContent} style={{ justifyContent: 'center' }}>
                        <span>% Vínculo Activo</span>
                        <span className={styles.sortIcon}>
                          {sortConfigCaps.key === 'pctVinculo' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>
                    <th onClick={() => handleSortCaps('pctTurnosTablero')} className={styles.sortableHeader} title="Pacientes que concretaron turnos como resultado directo de una gestión del tablero">
                      <div className={styles.headerContent} style={{ justifyContent: 'center' }}>
                        <span>% Turnos Asignados x Tablero</span>
                        <span className={styles.sortIcon}>
                          {sortConfigCaps.key === 'pctTurnosTablero' ? (sortConfigCaps.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
              {sortedCaps && sortedCaps.length > 0 ? (
                sortedCaps.map((caps: any, i: number) => {
                  
                  const totalCaps = caps.total || 0;
                  const absRiesgo = Math.round((totalCaps * (caps.pctRiesgo ?? 0)) / 100);
                  const absControladas = Math.round((totalCaps * (caps.pctControl ?? 0)) / 100);
                  const absVinculadas = Math.round((totalCaps * (caps.pctVinculo ?? 0)) / 100);
                  const absTurnos = Math.round((totalCaps * (caps.pctTurnosTablero ?? 0)) / 100);

                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 550, color: '#334155' }}>{romanToArabic(caps.capsName)}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{totalCaps}</td>
                      
                      <td 
                        style={{ textAlign: 'center', cursor: 'help' }}
                        title={`${absRiesgo} de ${totalCaps} pacientes activas presentan criterios de riesgo obstétrico bajo seguimiento.`}
                      >
                        <span className={styles.badgeRiesgo}>
                          {caps.pctRiesgo}%
                        </span>
                      </td>

                      {/* % Controladas con Tooltip explicatorio de períodos */}
                      <td 
                        style={{ textAlign: 'center', cursor: 'help' }}
                        title={`${absControladas} de ${totalCaps} pacientes se encuentran con controles al día:\n• < 32 semanas: control en los últimos 30 días.\n• 32 a 37 semanas: control en los últimos 15 días.\n• ≥ 38 semanas: control en los últimos 7 días.`}
                      >
                        <span className={caps.pctControl > 75 ? styles.badgeVerde : styles.badgeRojo}>
                          {caps.pctControl}%
                        </span>
                      </td>
                      
                      {/* % Vínculo Activo con Tooltip Desglosado */}
                      <td 
                        style={{ textAlign: 'center', cursor: 'help' }}
                        title={`${absVinculadas} de ${totalCaps} pacientes mantienen un vínculo activo:\n• ${caps.contactadasCaps || 0} por seguimiento proactivo (llamadas efectivas).\n• ${caps.acudieronSolas || 0} por asistencia espontánea (demanda propia).`}
                      >
                        <span className={styles.badgeAmarillo}>
                          {caps.pctVinculo}%
                        </span>
                      </td>

                      <td 
                        style={{ textAlign: 'center', cursor: 'help' }}
                        title={`${absTurnos} de ${totalCaps} pacientes obtuvieron un turno médico efectivo coordinado a través de este tablero.`}
                      >
                        <span className={styles.badgeCeleste}>
                          {caps.pctTurnosTablero}%
                        </span>
                      </td>
                    </tr>
                  );
                })
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

// NUEVO: Componente para las tarjetas de desglose
const KpiDesgloseCard = ({ label, pct, value, className, valueColor, pctColor, labelColor }: any) => (
  <div className={`${styles.kpiCardCompact} ${styles.kpiDesgloseCard} ${className || ''}`}>
    <span className={styles.kpiDesgloseLabel} style={{ color: labelColor }}>
      {label}
    </span>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', marginTop: '0.25rem' }}>
      <span className={styles.kpiDesgloseValue} style={{ color: valueColor }}>
        {pct}
      </span>
      <span style={{ fontSize: '0.75rem', color: pctColor, fontWeight: 600 }}>
        ({(value || 0).toLocaleString('es-AR')})
      </span>
    </div>
  </div>
);