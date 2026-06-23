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
  const [loading, setLoading] = useState(true);
  const [zonaChart, setZonaChart] = useState<'Todos' | 'Capital' | 'Interior'>('Todos');

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

        {/* KPIs COMPACTOS SÓLO SI ES ADMIN O COORDINADOR */}
        {isAdminOrCoord ? (
          <div className={styles.kpiGridAdmin}>
            <div className={styles.kpiCardAdminMain}>
              <span className={styles.kpiLabel}>Total Padrón Provincial</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '0.25rem' }}>
                <span className={styles.kpiValue} style={{ color: '#0f172a', margin: 0 }}>
                  {(data?.general?.total || 0).toLocaleString('es-AR')}
                </span>
                <span style={{ fontSize: '1.1rem', color: '#94a3b8', fontWeight: 700 }}>(100%)</span>
              </div>
              <small className={styles.kpiSubtext}>Embarazadas activas</small>
            </div>

            <div className={styles.kpiCardAdminRiesgo}>
              <span className={styles.kpiLabel} style={{ color: '#991b1b' }}>Total en Alto Riesgo</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '0.25rem' }}>
                <span className={styles.kpiValue} style={{ color: '#dc2626', margin: 0 }}>
                  {(data?.riesgo?.total || 0).toLocaleString('es-AR')}
                </span>
                <span style={{ fontSize: '1.1rem', color: '#f87171', fontWeight: 700 }}>({getPct(data?.riesgo?.total || 0)})</span>
              </div>
              <small className={styles.kpiSubtext} style={{ color: '#991b1b' }}>Seguimiento prioritario</small>
            </div>

            <div className={styles.kpiCardCompact}>
              <span className={styles.kpiLabel}>Total Controladas</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '0.25rem' }}>
                <span className={styles.kpiSubValue} style={{ color: '#19793cdc', margin: 0 }}>
                  {(data?.gestion?.controladas || 0).toLocaleString('es-AR')}
                </span>
                <span style={{ fontSize: '0.95rem', color: '#14921f8f', fontWeight: 700 }}>({getPct(data?.gestion?.controladas || 0)})</span>
              </div>
              <small className={styles.kpiSubtext}>Controles del último mes</small>
            </div>

            <div className={styles.kpiCardCompact}>
              <span className={styles.kpiLabel}>Total Contactadas</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '0.25rem' }}>
                <span className={styles.kpiSubValue} style={{ color: '#1276b8e0', margin: 0 }}>
                  {(data?.gestion?.contactadas || 0).toLocaleString('es-AR')}
                </span>
                <span style={{ fontSize: '0.95rem', color: '#207ae9c7', fontWeight: 700 }}>({getPct(data?.gestion?.contactadas || 0)})</span>
              </div>
              <small className={styles.kpiSubtext}>Gestión del último mes</small>
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
            <div className={styles.kpiGridAdmin}>
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
                    <th onClick={() => handleSortCaps('pctControl')} className={styles.sortableHeader} title="Se actualiza todos los días (Pacientes al día)">
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
                      
                      {/* % Riesgo (Texto simple rojo) */}
                      <td 
                        style={{ textAlign: 'center', fontWeight: 550, color: '#b91c1c', cursor: 'help' }}
                        title={`${absRiesgo} de ${totalCaps} pacientes activas presentan criterios de riesgo obstétrico bajo seguimiento.`}
                      >
                        {caps.pctRiesgo}%
                      </td>

                      {/* % Controladas (Usa tus clases CSS condicionales) */}
                      <td 
                        style={{ textAlign: 'center', cursor: 'help' }}
                        title={`${absControladas} de ${totalCaps} pacientes se encuentran con controles médicos al día.`}
                      >
                        <span className={caps.pctControl > 75 ? styles.badgeControlOk : styles.badgeControlAlert}>
                          {caps.pctControl}%
                        </span>
                      </td>
                      
                      {/* 🌟 % Vínculo Activo CORREGIDO: Celda limpia + span para el badge amarillo */}
                      <td 
                        style={{ textAlign: 'center', cursor: 'help' }}
                        title={`${absVinculadas} de ${totalCaps} pacientes mantienen un vínculo activo (seguimiento proactivo o asistencia espontánea).`}
                      >
                        <span style={{ backgroundColor: '#fef9c3', color: '#a16207', padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, display: 'inline-block' }}>
                          {caps.pctVinculo}%
                        </span>
                      </td>

                      {/* 🌟 % Turnos Asignados CORREGIDO: Celda limpia + span para el badge celeste */}
                      <td 
                        style={{ textAlign: 'center', cursor: 'help' }}
                        title={`${absTurnos} de ${totalCaps} pacientes obtuvieron un turno médico efectivo coordinado a través de este tablero.`}
                      >
                        <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, display: 'inline-block' }}>
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
                  <ResponsiveContainer width="100%" height="100%" minHeight={350}>
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
                  <ResponsiveContainer width="100%" height="100%" minHeight={350}>
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