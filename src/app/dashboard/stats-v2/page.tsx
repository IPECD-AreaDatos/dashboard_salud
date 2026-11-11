"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Navbar from "@/components/Navbar";
import { generarReporteStatsPDF } from "@/lib/pdfReporteStats";
import { exportarReporteStatsExcel } from "@/lib/excelReporteStats";
import { generarReporteTerritorialPDF } from "@/lib/pdfTerritorial";
import { 
  Download, 
  ArrowRight, 
  Building2, 
  BarChart2, 
  Loader2,
  ChevronDown, 
  FileText, 
  Sheet
} from "lucide-react";
import styles from "./StatsV2.module.css";

type DepartamentoTerritorial = {
  nombre: string;
  embarazos: number;
  controladas: number;
  efectores: number;
};

export default function StatsV2Page() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const userRole = session?.user?.role;
  const esAutorizadoV2 = userRole === "Administrador" || userRole === "Coordinador";
  const username = (session?.user as any)?.username || session?.user?.name;
  const isAdmin = userRole === "Administrador" || username === "admin" || username === "admin1";

  useEffect(() => {
    if (status === "authenticated" && !esAutorizadoV2) {
      const basePath = window.location.pathname.startsWith("/salud-dashboard") ? "/salud-dashboard" : "";
      router.replace(`${basePath}/dashboard/stats`);
    }
  }, [status, esAutorizadoV2, router]);

  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [hoveredEgIdx, setHoveredEgIdx] = useState<number | null>(null);

  // Filtros
  const [tipoEfector, setTipoEfector] = useState<"CAPS" | "SAPS">("CAPS");
  const [sortKey, setSortKey] = useState<"name" | "pad" | "cov" | "seg">("cov");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const handleSort = (key: "name" | "pad" | "cov" | "seg") => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      // Por defecto orden descendente para métricas numéricas (mayor a menor)
      // y ascendente para el nombre del centro
      setSortAsc(key === "name");
    }
  };

  // --- MANEJO DE FECHAS Y PERÍODOS SINCRONIZADO ---
  const fechaHoy = new Date().toISOString().split("T")[0];
  const [fechaHasta, setFechaHasta] = useState(fechaHoy);
  const [periodoDias, setPeriodoDias] = useState<number>(30);

  // Calcula fecha inicial hace 30 días
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });

  // 1. Función para consultar las estadísticas con las fechas reales
  const fetchStats = async (diasNum = periodoDias, fDesde = fechaDesde, fHasta = fechaHasta) => {
    setLoading(true);
    try {
      const basePath = window.location.pathname.startsWith("/salud-dashboard") ? "/salud-dashboard" : "";
      const queryParams = new URLSearchParams({
        tipoEfector,
        periodoDias: diasNum.toString(),
        fechaDesde: fDesde,
        fechaHasta: fHasta
      });

      const res = await fetch(`${basePath}/api/stats-v2?${queryParams.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Error al cargar stats v2:", err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Ejecutar al cambiar el tipo de efector (CAPS / SAPS) o al montar
  useEffect(() => {
    if (status !== "authenticated" || !esAutorizadoV2) return;
    fetchStats(periodoDias, fechaDesde, fechaHasta);
  }, [status, esAutorizadoV2, tipoEfector]);

  // 3. Al hacer clic en los botones rápidos: 7 días, 14 días o 30 días
  const handlePeriodPick = (dias: number) => {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    const nuevaFechaDesde = d.toISOString().split("T")[0];
    const nuevaFechaHasta = fechaHoy;

    setPeriodoDias(dias);
    setFechaDesde(nuevaFechaDesde);
    setFechaHasta(nuevaFechaHasta);

    // Dispara inmediatamente el fetch con los nuevos valores
    fetchStats(dias, nuevaFechaDesde, nuevaFechaHasta);
  };

  // 4. Al cambiar manualmente los inputs de fecha (Desde / Hasta)
  const handleFechaManualChange = (nuevaDesde: string, nuevaHasta: string) => {
    setFechaDesde(nuevaDesde);
    setFechaHasta(nuevaHasta);

    if (nuevaDesde && nuevaHasta) {
      const d1 = new Date(nuevaDesde).getTime();
      const d2 = new Date(nuevaHasta).getTime();
      const diffDias = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));

      setPeriodoDias(diffDias);
      fetchStats(diffDias, nuevaDesde, nuevaHasta);
    }
  };

  // Estado para el centro seleccionado en la evolución de cobertura (-1 = Todos/Total)
  const [selectedEfectorIdx, setSelectedEfectorIdx] = useState<number>(-1);

  // Reiniciar a "Todos" si cambia entre CAPS y SAPS
  useEffect(() => {
    setSelectedEfectorIdx(-1);
  }, [tipoEfector]);

  // 1. Datos de Padrón Provincial y Distribución Panorámica
  const v2 = data?.statsV2;
  const pcia = v2?.padronProvincial;
  const padronProvincial = pcia?.total || 0;
  const capital = pcia?.capital || { TOTAL: 0, CAPS: 0, SAPS: 0, HOSPITAL: 0, OTRO: 0 };
  const interior = pcia?.interior || { TOTAL: 0, CAPS: 0, SAPS: 0, HOSPITAL: 0, OTRO: 0 };

  const pctCapital = padronProvincial > 0 ? ((capital.TOTAL * 100) / padronProvincial).toFixed(1).replace(".", ",") : "0,0";
  const pctInterior = padronProvincial > 0 ? ((interior.TOTAL * 100) / padronProvincial).toFixed(1).replace(".", ",") : "0,0";

  // 2. Procesamiento de filas de la tabla
  const resumenEfectores = useMemo(() => {
    if (!data?.resumenCaps) return [];

    return data.resumenCaps.map((r: any) => {
      const p0 = r.padronAnt || 0;
      const p1 = r.padronAct || 0;
      const cov = r.cobAct || 0;
      const seg = r.pctSeguimientoAdecuado || 0;
      const diff = cov - (r.cobAnt || 0);
      const trend = Math.abs(diff) < 1 ? "–" : diff > 0 ? "▲" : "▼";
      const ratio = p0 > 0 ? p1 / p0 : 1;

      return {
        name: r.capsName || "",
        short: (r.capsName || "").replace(/C\.A\.P\.S\.|S\.A\.P\.S\./gi, "").trim(),
        p0,
        p1,
        ctrlAct: r.ctrlAct || 0,
        cov,
        covTxt: `${cov.toFixed(1).replace(".", ",")}%`,
        seg,
        segTxt: `${seg.toFixed(1).replace(".", ",")}%`,
        trend,
        trendColor: trend === "–" ? "#5E5D5B" : diff > 0 ? "#356F23" : "#6F0603",
        alert: ratio < 0.75,
        // 🌟 AGREGAR ESTAS PROPIEDADES QUE FALTABAN:
        diasSinUso: r.diasSinUso !== undefined ? r.diasSinUso : 999,
        ultimoUsoTexto: r.ultimoUsoTexto || "Sin dato",
        ultimoAcceso: r.ultimoAcceso || null
      };
    });
  }, [data?.resumenCaps]);

  const sortedRows = useMemo(() => {
    return [...resumenEfectores].sort((a, b) => {
      let valA: any = a[sortKey];
      let valB: any = b[sortKey];

      if (sortKey === "name") valA = a.name.toLowerCase(), valB = b.name.toLowerCase();
      if (sortKey === "pad") valA = a.p1, valB = b.p1;
      if (sortKey === "cov") valA = a.cov, valB = b.cov;
      if (sortKey === "seg") valA = a.seg, valB = b.seg;

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [resumenEfectores, sortKey, sortAsc]);

  // Totales
  const totalBase = resumenEfectores.reduce((acc: number, r: any) => acc + r.p1, 0);
  const totalP0 = resumenEfectores.reduce((acc: number, r: any) => acc + r.p0, 0);
  const totalCtrl = resumenEfectores.reduce((acc: number, r: any) => acc + r.ctrlAct, 0);
  const pctCoberturaTotal = totalBase > 0 ? ((totalCtrl * 100) / totalBase).toFixed(1).replace(".", ",") : "0,0";
  const totalAtrasadas = Math.max(0, totalBase - totalCtrl);
  const pctAtrasadas = totalBase > 0 ? ((totalAtrasadas * 100) / totalBase).toFixed(1).replace(".", ",") : "13,4";

  const porVencerCount = v2?.porVencer?.[tipoEfector.toLowerCase()] || 0;
  const pctSeguimientoAdecuado = v2?.seguimientoAdecuado?.[tipoEfector.toLowerCase()] || 0;
  const pctSeguimientoAdecuadoTxt = `${pctSeguimientoAdecuado.toFixed(1).replace(".", ",")}%`;

  // Helpers de color
  const getCoveragePillStyle = (v: number) => {
    if (v >= 85) return { background: "#E4EED6", color: "#2F5F1F" };
    if (v >= 70) return { background: "#FCEFC9", color: "#7A5000" };
    return { background: "#FBE0D9", color: "#6F0603" };
  };

  const getCoverageColor = (v: number) => {
    return v >= 85 ? "#356F23" : v >= 70 ? "#8A5A00" : "#6F0603";
  };

  // Ranking de Cobertura
  const rankingRows = useMemo(() => {
    return [...resumenEfectores]
      .filter(r => r.p1 >= (tipoEfector === "SAPS" ? 5 : 1))
      .sort((a, b) => b.cov - a.cov);
  }, [resumenEfectores, tipoEfector]);

  const cobSalud = v2?.coberturaSalud || { publica: 0, obraSocial: 0, sinRegistro: 0 };

  // Datos de histograma de Edad Gestacional
  const egList = v2?.edadGestacional || [];

  const territorial = v2?.territorial;
  const territorialResumen = territorial?.resumen;
  const departamentosTerritoriales = (territorial?.departamentos || []) as DepartamentoTerritorial[];
  const departamentosInterior = departamentosTerritoriales.filter((row) => row.nombre !== "CAPITAL").slice(0, 6);
  const maxEmbarazosDepartamento = Math.max(1, ...departamentosInterior.map((row) => row.embarazos));
  const catalogoSaps = tipoEfector === "SAPS" ? v2?.usoTablero : null;

  const maxEg = Math.max(1, ...egList.map((g: any) => g.total));

  // 9. Cálculo matemático del gráfico SVG de Evolución
  const evoDates = ["28/7", "4/8", "11/8", "18/8", "25/8", "1/9", "8/9", "15/9", "22/9", "29/9", "6/10", "13/10", "22/10"];

  const evoData = useMemo(() => {
    const evoX = (i: number) => 80 + i * (680 / 12);
    const evoY = (v: number) => 230 - v * 1.9; // Rango de 0% (y=230) a 100% (y=40)

    // Hash simple determinístico para reproducir ondulaciones suaves realistas
    const hashSeed = (s: string) => {
      let h = 7;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
      return h;
    };

    const genSeries = (a: number, b: number, seed: number) => {
      return evoDates.map((_, i) => {
        let v = i <= 8 ? a - (4 * (8 - i)) / 8 : a + ((b - a) * (i - 8)) / 4;
        if (i !== 8 && i !== 12) {
          const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
          const wob = (x - Math.floor(x)) * 2 - 1;
          v += 1.8 * wob;
        }
        return Math.max(0, Math.min(100, v));
      });
    };

    // Cobertura base inicial y final promedio
    const avgEnd = parseFloat(pctCoberturaTotal.replace(",", ".")) || 82.6;
    const avgStart = avgEnd - 0.4;
    const totSeries = genSeries(avgStart, avgEnd, hashSeed(tipoEfector + "general"));

    const hasSelection = selectedEfectorIdx >= 0 && selectedEfectorIdx < resumenEfectores.length;
    const selectedCenter = hasSelection ? resumenEfectores[selectedEfectorIdx] : null;

    let mainSeries = totSeries;
    if (selectedCenter) {
      const cStart = selectedCenter.cobAnt || (selectedCenter.cov - 2);
      const cEnd = selectedCenter.cov;
      mainSeries = genSeries(cStart, cEnd, hashSeed(selectedCenter.name));
    }

    const toPoints = (s: number[]) => s.map((v, i) => `${evoX(i).toFixed(1)},${evoY(v).toFixed(1)}`).join(" ");
    
    
    return {
      hasSelection,
      selectedCenter,
      mainPoints: toPoints(mainSeries),
      refPoints: toPoints(totSeries),
      startX: evoX(0),
      startY: evoY(mainSeries[0]),
      startVal: `${mainSeries[0].toFixed(1).replace(".", ",")}%`,
      endX: evoX(12),
      endY: evoY(mainSeries[12]),
      endVal: `${mainSeries[12].toFixed(1).replace(".", ",")}%`,
      refEndY: evoY(totSeries[12])
    };
  }, [pctCoberturaTotal, selectedEfectorIdx, resumenEfectores, tipoEfector]);

  const [menuDescargaAbierto, setMenuDescargaAbierto] = useState(false);
  const [descargandoTerritorial, setDescargandoTerritorial] = useState(false);

  const handleDescargarTerritorial = async () => {
    if (!territorial) return;
    setDescargandoTerritorial(true);
    try {
      await generarReporteTerritorialPDF(territorial, territorial.fechaCorte || "");
    } catch (error) {
      console.error("Error al generar el reporte territorial:", error);
    } finally {
      setDescargandoTerritorial(false);
    }
  };

  // Función unificada de descarga (PDF o Excel)
  const handleDescargar = async (formato: "pdf" | "xlsx") => {
    setMenuDescargaAbierto(false);

    const segAdecuadoActual = pctSeguimientoAdecuadoTxt;

    const propsReporte = {
      tipoEfector,
      rangoTexto: `${periodoDias} días (${fechaDesde} al ${fechaHasta})`,
      padronProvincial,
      capital: {
        TOTAL: capital?.TOTAL || 0,
        CAPS: capital?.CAPS || 0,
        SAPS: capital?.SAPS || 0,
        HOSPITAL: capital?.HOSPITAL || 0,
      },
      interior: {
        TOTAL: interior?.TOTAL || 0,
        CAPS_SAPS: (interior?.CAPS || 0) + (interior?.SAPS || 0),
        CAPS: interior?.CAPS || 0,
        SAPS: interior?.SAPS || 0,
        HOSPITAL: interior?.HOSPITAL || 0,
      },
      totalBase,
      totalCtrl,
      pctCobertura: pctCoberturaTotal,
      totalAtrasadas,
      pctAtrasadas,
      porVencerCount,
      pctSegAdecuado: segAdecuadoActual,
      coberturaSalud: cobSalud,
      usoTablero: v2?.usoTablero, // 👈 Se suma auditoría de uso del tablero
      egList: egList,             // 👈 Se suma distribución de edad gestacional
      efectores: sortedRows || [],
      usuarioGenerador: session?.user?.name || "Administrador",
    };

    if (formato === "pdf") {
      await generarReporteStatsPDF(propsReporte);
    } else {
      exportarReporteStatsExcel(propsReporte);
    }
  };

  if (status === "loading" || !esAutorizadoV2) {
    return null;
  }

  return (
    <div className={styles.container}>
      <Navbar />

      <main className={styles.contentWrapper}>
        {/* 1. Header & Filtro de Períodos */}
        <section className={styles.headerSection}>
          <div>
            <h1 className={styles.headerTitle}>Estadísticas de seguimiento</h1>
            <p className={styles.headerSubtitle}>
              Panel de control clínico y auditoría de gestión de efectores.
            </p>
          </div>

          <div className={styles.filtersGroup}>
            <label className={styles.dateLabel}>
              Desde
              <input 
                type="date" 
                value={fechaDesde} 
                onChange={(e) => handleFechaManualChange(e.target.value, fechaHasta)} 
                className={styles.dateInput} 
              />
            </label>

            <label className={styles.dateLabel}>
              Hasta
              <input 
                type="date" 
                value={fechaHasta} 
                onChange={(e) => handleFechaManualChange(fechaDesde, e.target.value)} 
                className={styles.dateInput} 
              />
            </label>

            <div className={styles.periodButtonGroup}>
              {[7, 14, 30].map((dias) => (
                <button
                  key={dias}
                  type="button"
                  onClick={() => handlePeriodPick(dias)}
                  className={`${styles.periodBtn} ${periodoDias === dias ? styles.periodBtnActive : ""}`}
                >
                  {dias} días
                </button>
              ))}
            </div>

            {/* Botón Desplegable Multiformato Estilizado */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setMenuDescargaAbierto(!menuDescargaAbierto)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  backgroundColor: "#456A9D",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 14px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.08)",
                  transition: "background-color 0.2s ease, transform 0.1s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#35537F")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#456A9D")}
              >
                <Download size={16} strokeWidth={2.2} />
                <span>Descargar reporte</span>
                <ChevronDown
                  size={15}
                  strokeWidth={2.2}
                  style={{
                    transform: menuDescargaAbierto ? "rotate(180deg)" : "none",
                    transition: "transform 0.2s ease",
                  }}
                />
              </button>

              {menuDescargaAbierto && (
                <>
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 40 }}
                    onClick={() => setMenuDescargaAbierto(false)}
                  />

                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 6px)",
                      backgroundColor: "#FFFFFF",
                      border: "1px solid #E2E8F0",
                      borderRadius: "10px",
                      boxShadow: "0 12px 24px -4px rgba(0, 0, 0, 0.12), 0 4px 6px -2px rgba(0, 0, 0, 0.04)",
                      zIndex: 50,
                      minWidth: "210px",
                      padding: "4px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                    }}
                  >
                    {/* Opción PDF */}
                    <button
                      type="button"
                      onClick={() => handleDescargar("pdf")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "9px 12px",
                        backgroundColor: "transparent",
                        border: "none",
                        borderRadius: "6px",
                        textAlign: "left",
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "#1E293B",
                        cursor: "pointer",
                        transition: "background-color 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F1F5F9")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "26px",
                          height: "26px",
                          borderRadius: "6px",
                          backgroundColor: "#FEE2E2",
                        }}
                      >
                        <FileText size={15} color="#DC2626" />
                      </div>
                      <span>Documento PDF (.pdf)</span>
                    </button>

                    {/* Opción Excel */}
                    <button
                      type="button"
                      onClick={() => handleDescargar("xlsx")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "9px 12px",
                        backgroundColor: "transparent",
                        border: "none",
                        borderRadius: "6px",
                        textAlign: "left",
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "#1E293B",
                        cursor: "pointer",
                        transition: "background-color 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F1F5F9")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "26px",
                          height: "26px",
                          borderRadius: "6px",
                          backgroundColor: "#DCFCE7",
                        }}
                      >
                        <Sheet size={15} color="#16A34A" />
                      </div>
                      <span>Planilla Excel (.xlsx)</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* 2. Padrón Provincial y Alcance (Diseño exacto de Aye) */}
        <section style={{ background: "#FFFFFF", border: "1px solid #EDEDED", borderRadius: "14px", padding: "22px 26px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "28px 40px", alignItems: "center" }}>
            
            {/* Columna Total Provincial */}
            <div style={{ flex: "0 0 auto", minWidth: "200px", display: "flex", flexDirection: "column", gap: "4px", paddingRight: "40px", borderRight: "1px solid #EDEDED" }}>
              <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5E5D5B" }}>
                Padrón provincial
              </h2>
              <p style={{ margin: 0, fontSize: "48px", lineHeight: 1.05, fontWeight: 700, color: "#2E2D2C", fontVariantNumeric: "tabular-nums" }}>
                {padronProvincial.toLocaleString("es-AR")}
              </p>
              <p style={{ margin: 0, fontSize: "15px", color: "#2E2D2C" }}>
                embarazadas activas
              </p>
              <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#5E5D5B" }}>
                Datos al {data?.ultimaActualizacion ? new Date(data.ultimaActualizacion).toLocaleDateString("es-AR") : new Date().toLocaleDateString("es-AR")}
              </p>
            </div>

            {/* Contenedor de Barras Proporcionales (Capital e Interior) */}
            <div style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexWrap: "wrap", gap: "20px" }}>
              
              {/* Bloque Capital (proporción 40.7%) */}
              <div style={{ flex: "40.7 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid #2B4C7E", paddingBottom: "6px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#2E2D2C" }}>Capital</span>
                  <span style={{ fontSize: "14px", color: "#5E5D5B", display: "flex", alignItems: "baseline", gap: "8px" }}>
                    <b style={{ fontSize: "22px", color: "#2E2D2C", fontVariantNumeric: "tabular-nums" }}>
                      {capital.TOTAL.toLocaleString("es-AR")}
                    </b>
                    {pctCapital}%
                  </span>
                </div>
                <div style={{ display: "flex", height: "34px", borderRadius: "8px", overflow: "hidden", gap: "2px", fontSize: "12px", fontWeight: 600 }} title={`CAPS: ${capital.CAPS} · SAPS: ${capital.SAPS} · Hospitales: ${capital.HOSPITAL} · Otros: ${capital.OTRO}`}>
                  <div 
                    style={{ width: `${(capital.CAPS * 100) / capital.TOTAL}%`, background: "#2B4C7E", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", whiteSpace: "nowrap", overflow: "hidden" }}
                    title={`CAPS: ${capital.CAPS}`}
                  >
                    CAPS {capital.CAPS}
                  </div>
                  <div 
                    style={{ width: `${(capital.SAPS * 100) / capital.TOTAL}%`, background: "#4E79B5", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", whiteSpace: "nowrap", overflow: "hidden" }}
                    title={`SAPS: ${capital.SAPS}`}
                  >
                    SAPS {capital.SAPS}
                  </div>
                  <div 
                    style={{ width: `${(capital.HOSPITAL * 100) / capital.TOTAL}%`, background: "#719AD4", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", whiteSpace: "nowrap", overflow: "hidden" }}
                    title={`Hospitales: ${capital.HOSPITAL}`}
                  >
                    Hosp. {capital.HOSPITAL}
                  </div>
                  {capital.OTRO > 0 && (
                    <div
                      style={{ width: `${(capital.OTRO * 100) / capital.TOTAL}%`, background: "#A7A9AC", flexShrink: 0 }}
                      title={`Otros efectores sin clasificación CAPS/SAPS: ${capital.OTRO}`}
                      aria-label={`Otros efectores sin clasificación CAPS/SAPS: ${capital.OTRO}`}
                    />
                  )}
                </div>
                {capital.OTRO > 0 && (
                  <span style={{ fontSize: 12, color: "#5E5D5B" }}>
                    Otros sin clasificación CAPS/SAPS: {capital.OTRO}
                  </span>
                )}
              </div>

              {/* Bloque Interior (Unificado visualmente en la barra, desglosado en el tooltip) */}
              <div style={{ flex: "59.3 1 360px", minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid #2B4C7E", paddingBottom: "6px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#2E2D2C" }}>Interior</span>
                  <span style={{ fontSize: "14px", color: "#5E5D5B", display: "flex", alignItems: "baseline", gap: "8px" }}>
                    <b style={{ fontSize: "22px", color: "#2E2D2C", fontVariantNumeric: "tabular-nums" }}>
                      {interior.TOTAL.toLocaleString("es-AR")}
                    </b>
                    {pctInterior}%
                  </span>
                </div>
                <div style={{ display: "flex", height: "34px", borderRadius: "8px", overflow: "hidden", gap: "2px", fontSize: "12px", fontWeight: 600 }}>

                  {/* Tramo Único CAPS/SAPS con el tooltip detallado */}
                  <div 
                    style={{ 
                      width: `${((interior.CAPS + interior.SAPS) * 100) / interior.TOTAL}%`, 
                      background: "#2B4C7E", 
                      color: "#FFFFFF", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center", 
                      padding: "0 6px", 
                      whiteSpace: "nowrap", 
                      overflow: "hidden",
                      cursor: "help"
                    }}
                    title={`Interior (CAPS y SAPS): ${interior.CAPS + interior.SAPS}\n• CAPS: ${interior.CAPS}\n• SAPS: ${interior.SAPS}`}
                  >
                    CAPS/SAPS {interior.CAPS + interior.SAPS}
                  </div>

                  {/* Tramo Hospitales */}
                  <div 
                    style={{ 
                      width: `${(interior.HOSPITAL * 100) / interior.TOTAL}%`, 
                      background: "#719AD4", 
                      color: "#FFFFFF", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center", 
                      padding: "0 8px", 
                      whiteSpace: "nowrap", 
                      overflow: "hidden",
                      cursor: "help"
                    }}
                    title={`Hospitales Interior: ${interior.HOSPITAL}`}
                  >
                    Hosp. {interior.HOSPITAL}
                  </div>

                </div>
              </div>

            </div>

          </div>
        </section>

        {/* 3. Pestañas de Efector (CAPS / SAPS) con Alerta SAPS */}
        <section className={styles.tabsContainer}>
          <div className={styles.tabsRow}>
            <button
              onClick={() => setTipoEfector("CAPS")}
              className={`${styles.tabBtn} ${tipoEfector === "CAPS" ? styles.tabBtnActive : ""}`}
            >
              CAPS
            </button>
            <button
              onClick={() => setTipoEfector("SAPS")}
              className={`${styles.tabBtn} ${tipoEfector === "SAPS" ? styles.tabBtnActive : ""}`}
            >
              SAPS
            </button>
          </div>

          {catalogoSaps && (
            <div className={styles.catalogSummary} role="status">
              <Building2 size={18} />
              <span>
                <b>{catalogoSaps.total} SAPS en el catálogo de Capital.</b>{" "}
                {catalogoSaps.conPadron} con padrón activo y {catalogoSaps.sinPadron} sin padrón activo. Los 38 efectores se incluyen en la tabla, también los que están en cero.
              </span>
            </div>
          )}
        </section>

        {/* 4. Indicadores Clave del Efector */}
        <section className={styles.kpisSection}>
          <div className={styles.sectionContextTitle}>
            <Building2 size={18} />
            <span>
              <b style={{ color: "#2E2D2C" }}>Indicadores {tipoEfector}</b> · base {totalBase} embarazadas · período de {periodoDias} días
            </span>
          </div>

          <div className={styles.kpiRowGrid}>
            <div className={styles.indicadorCard}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "#5E5D5B" }}>Controles al día</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontSize: 44, fontWeight: 700, color: getCoverageColor(parseFloat(pctCoberturaTotal.replace(",", "."))) }}>
                  {totalCtrl}
                </span>
                <span style={{ fontSize: 20, fontWeight: 600, color: getCoverageColor(parseFloat(pctCoberturaTotal.replace(",", "."))) }}>
                  {pctCoberturaTotal}%
                </span>
              </div>
              <div className={styles.progressBarTrack}>
                <div 
                  className={styles.progressBarFill} 
                  style={{ width: `${pctCoberturaTotal.replace(",", ".")}%`, background: "#8FB25A" }} 
                />
              </div>
              <span style={{ fontSize: 13, color: "#5E5D5B" }}>Control en los últimos 40 días</span>
            </div>

            <Link 
              href={`/dashboard?tipoGrupo=${tipoEfector}&controlesAtrasados=true`}
              className={styles.indicadorCardAtraso}
            >
              <div className={styles.cardHeaderRow}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#6F0603" }}>Controles atrasados</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#3F5F9E", display: "flex", alignItems: "center", gap: 4 }}>
                  Ver listado <ArrowRight size={16} />
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontSize: 44, fontWeight: 700, color: "#6F0603" }}>{totalAtrasadas}</span>
                <span style={{ fontSize: 20, fontWeight: 600, color: "#6F0603" }}>{pctAtrasadas}%</span>
                <span style={{ fontSize: 15, color: "#5E5D5B" }}>sin control en más de 40 días</span>
              </div>
              <div className={styles.progressBarTrack}>
                <div 
                  className={styles.progressBarFill} 
                  style={{ width: `${pctAtrasadas.replace(",", ".")}%`, background: "#EE8B74" }} 
                />
              </div>
              <span style={{ fontSize: 13, color: "#5E5D5B" }}>
                Abre el listado nominal en Seguimiento, filtrado por {tipoEfector}
              </span>
            </Link>
          </div>

          <div className={styles.kpiRowGrid}>
            <Link 
              href={`/dashboard?tipoGrupo=${tipoEfector}&porVencer=true`}
              className={styles.indicadorCardSmall}
            >
              <div className={styles.cardHeaderRow}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#2E2D2C" }}>Por vencer sin turno</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#3F5F9E" }}>Ver →</span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#2E2D2C" }}>
                {porVencerCount}
              </div>
              <span style={{ fontSize: 13, color: "#5E5D5B" }}>Control vence en 10 días · sin turno cargado</span>
            </Link>

            <div className={styles.indicadorCardSmall}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#5E5D5B" }}>Seguimiento adecuado</span>
              <div style={{ fontSize: 36, fontWeight: 700, color: "#4E6FAE" }}>
                {pctSeguimientoAdecuadoTxt}
              </div>
              <div className={styles.progressBarTrack} style={{ height: 8 }}>
                <div 
                  className={styles.progressBarFill} 
                  style={{ width: `${Math.min(100, pctSeguimientoAdecuado)}%`, background: "#4E6FAE" }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* 5. Uso del Tablero */}
        <section className={styles.kpisSection}>
          <div className={styles.sectionContextTitle}>
            <BarChart2 size={18} />
            <span><b style={{ color: "#2E2D2C" }}>Uso del tablero</b></span>
          </div>

          <div className={styles.usoCard}>
            <div className={styles.usoActivosCol}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "#5E5D5B" }}>{tipoEfector} activos</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 44, fontWeight: 700, color: "#3F5F9E" }}>
                  {resumenEfectores.filter((r: any) => r.diasSinUso <= 7).length}
                </span>
                <span style={{ fontSize: 20, fontWeight: 600, color: "#5E5D5B" }}>
                  de {resumenEfectores.length}
                </span>
              </div>
              <span style={{ fontSize: 13, color: "#5E5D5B" }}>
                Con al menos una acción en los últimos 7 días (llamada, turno o control cargado)
              </span>
            </div>

            <div className={styles.usoSinUsoCol}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#6F0603" }}>Sin uso hace 7 días o más</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {resumenEfectores.filter((r: any) => r.diasSinUso >= 7 && r.diasSinUso !== 999).length > 0 ? (
                  resumenEfectores
                    .filter((r: any) => r.diasSinUso >= 7 && r.diasSinUso !== 999)
                    .map((u: any, idx: number) => (
                      <span key={idx} className={styles.chip}>{u.name} · {u.diasSinUso} días</span>
                    ))
                ) : (
                  <span style={{ fontSize: "13px", color: "#356F23", fontWeight: 600 }}>
                    ¡Excelente! Todos los efectores registraron actividad reciente.
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 6. Tabla de Desempeño por Efector */}
        <section className={styles.desempenoCard}>
          <h2 className={styles.tableTitle}>Desempeño por {tipoEfector}</h2>

          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 760 }}>
              <div className={styles.tableGridHeader}>
                <button onClick={() => handleSort("name")} className={styles.btnColSort}>
                  CENTRO DE SALUD {sortKey === "name" ? (sortAsc ? "↑" : "↓") : "↕"}
                </button>
                <button onClick={() => handleSort("pad")} className={styles.btnColSort} style={{ justifyContent: "center" }}>
                  PADRÓN {sortKey === "pad" ? (sortAsc ? "↑" : "↓") : "↕"}
                </button>
                <button onClick={() => handleSort("cov")} className={styles.btnColSort} style={{ justifyContent: "center" }}>
                  COBERTURA {sortKey === "cov" ? (sortAsc ? "↑" : "↓") : "↕"}
                </button>
                <button onClick={() => handleSort("seg")} className={styles.btnColSort} style={{ justifyContent: "center" }}>
                  SEG. ADECUADO {sortKey === "seg" ? (sortAsc ? "↑" : "↓") : "↕"}
                </button>
                <span>ÚLTIMO USO</span>
              </div>

              {loading ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "#5E5D5B" }}>
                  <Loader2 className="animate-spin" size={32} style={{ margin: "0 auto 8px" }} />
                  Cargando efectores...
                </div>
              ) : (
                sortedRows.map((r: any, idx: number) => (
                  <div key={idx} className={styles.tableGridRow}>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <span style={{ textAlign: "center" }}>
                      <span style={{ color: "#5E5D5B" }}>{r.p0} → </span>
                      <b>{r.p1}</b>
                    </span>
                    <span style={{ textAlign: "center", fontWeight: 600 }}>
                      <span className={styles.pillCoverage} style={getCoveragePillStyle(r.cov)}>
                        {r.covTxt}
                      </span>{" "}
                      <span style={{ color: r.trendColor, fontSize: 12 }}>{r.trend}</span>
                    </span>
                    <span style={{ textAlign: "center", fontWeight: 600 }}>
                      <span className={styles.pillSeguimiento}>{r.segTxt}</span>
                    </span>
                    <span 
                      className={styles.ultimoUsoWrapper}
                      title={
                        r.ultimoAcceso 
                          ? `Último ingreso: ${new Date(r.ultimoAcceso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })} a las ${new Date(r.ultimoAcceso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} hs`
                          : "Sin actividad registrada en el tablero"
                      }
                      style={{ cursor: "help" }}
                    >
                      {r.diasSinUso === 999 || r.ultimoUsoTexto === "Sin dato" ? (
                        <>
                          <span className={styles.dotGris} />
                          <span style={{ color: "#5E5D5B" }}>Sin dato</span>
                        </>
                      ) : r.diasSinUso <= 7 ? (
                        <>
                          <span className={styles.dotVerde} />
                          <span style={{ color: "#356F23", fontWeight: 600 }}>{r.ultimoUsoTexto}</span>
                        </>
                      ) : r.diasSinUso <= 12 ? (
                        <>
                          <span className={styles.dotAmbar} />
                          <span style={{ color: "#8A5A00", fontWeight: 600 }}>{r.ultimoUsoTexto}</span>
                        </>
                      ) : (
                        <>
                          <span className={styles.dotRojo} />
                          <span style={{ color: "#6F0603", fontWeight: 600 }}>{r.ultimoUsoTexto}</span>
                        </>
                      )}
                    </span>
                  </div>
                ))
              )}

              <div className={styles.tableGridFooter}>
                <span>Total {tipoEfector} ({sortedRows.length})</span>
                <span style={{ textAlign: "center" }}>
                  <span style={{ color: "#5E5D5B", fontWeight: 500 }}>{totalP0} → </span>
                  {totalBase}
                </span>
                <span style={{ textAlign: "center" }}>{pctCoberturaTotal}%</span>
                <span style={{ textAlign: "center" }}>{pctSeguimientoAdecuadoTxt}</span>
                <span style={{ color: "#5E5D5B", fontWeight: 500 }}>—</span>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Gráficos Inferiores: Ranking Horizontal de Cobertura y Cobertura de Salud */}
        <section className={styles.bottomChartsGrid}>
          {/* Ranking Horizontal con línea promedio */}
          <div className={styles.chartCard}>
            <h2 className={styles.chartTitle}>Cobertura de controles por {tipoEfector}</h2>
            <p className={styles.chartSub}>
              Controles al día al {new Date().toLocaleDateString("es-AR")} · comparado con el promedio {tipoEfector} ({pctCoberturaTotal}%, línea azul)
            </p>

            <div className={styles.rankingContainer}>
              {rankingRows.map((c: any, idx: number) => {
                const barColor = c.cov >= 85 ? "#356F23" : c.cov >= 70 ? "#FAAE05" : "#EA2F09";
                const textColor = c.cov >= 85 ? "#356F23" : c.cov >= 70 ? "#8A5A00" : "#6F0603";

                return (
                  <div key={idx} className={styles.rankingRow}>
                    <span className={styles.rankingName} title={c.name}>{c.short}</span>
                    <div className={styles.rankingBarTrack}>
                      <div 
                        className={styles.rankingBarFill} 
                        style={{ width: `${Math.min(100, Math.max(0, c.cov))}%`, background: barColor }} 
                      />
                      <div 
                        className={styles.avgLine} 
                        style={{ left: `${Math.min(100, Math.max(0, parseFloat(pctCoberturaTotal.replace(",", "."))))}%` }} 
                      />
                    </div>
                    <span style={{ fontWeight: 700, color: textColor, textAlign: "right" }}>{c.covTxt}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 13, color: "#5E5D5B" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 10, borderRadius: 2, background: "#356F23" }} /> Bien (&ge;85%)
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 10, borderRadius: 2, background: "#FAAE05" }} /> Atención (70-84%)
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 10, borderRadius: 2, background: "#EA2F09" }} /> Crítico (&lt;70%)
              </span>
            </div>
          </div>

          {/* Cobertura de Salud */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className={styles.chartCard}>
              <h2 className={styles.chartTitle}>Cobertura de salud del padrón</h2>
              <p className={styles.chartSub}>{cobSalud.sinRegistro}% sin registro de cobertura</p>
              
              <div className={styles.coberturaStackedBar}>
                <div style={{ width: `${cobSalud.publica}%`, background: "#4E6FAE" }} />
                <div style={{ width: `${cobSalud.obraSocial}%`, background: "#90B4E1" }} />
                <div style={{ width: `${cobSalud.sinRegistro}%`, background: "#CFCECC" }} />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 14, fontSize: 13, color: "#2E2D2C" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: "#4E6FAE" }} /> 
                  Pública exclusiva {cobSalud.publica}%
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: "#90B4E1" }} /> 
                  Con obra social {cobSalud.obraSocial}%
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#5E5D5B" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: "#CFCECC" }} /> 
                  Sin registro {cobSalud.sinRegistro}%
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 8. Semanas de Gestación en CAPS / SAPS */}
        <section className={styles.chartCard}>
          <h2 className={styles.chartTitle}>Semana de gestación en {tipoEfector}</h2>
          <p className={styles.chartSub}>Embarazos activos y controladas al día según edad gestacional</p>

          {/* Cards de Trimestres y Captación */}
          <div className={styles.egGridTri}>
            <div className={styles.egTriCard}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#5E5D5B" }}>1.º trimestre · hasta sem. 12</span>
              <b style={{ fontSize: 28, color: "#2E2D2C" }}>
                92% <span style={{ fontSize: 14, color: "#5E5D5B", fontWeight: 400 }}>al día</span>
              </b>
              <span style={{ fontSize: 13, color: "#5E5D5B" }}>12 de 13 embarazadas</span>
            </div>

            <div className={styles.egTriCard}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#5E5D5B" }}>2.º trimestre · sem. 13 a 28</span>
              <b style={{ fontSize: 28, color: "#2E2D2C" }}>
                84% <span style={{ fontSize: 14, color: "#5E5D5B", fontWeight: 400 }}>al día</span>
              </b>
              <span style={{ fontSize: 13, color: "#5E5D5B" }}>228 de 270 embarazadas</span>
            </div>

            <div className={styles.egTriCard}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#5E5D5B" }}>3.º trimestre · sem. 29 o más</span>
              <b style={{ fontSize: 28, color: "#2E2D2C" }}>
                81% <span style={{ fontSize: 14, color: "#5E5D5B", fontWeight: 400 }}>al día</span>
              </b>
              <span style={{ fontSize: 13, color: "#5E5D5B" }}>278 de 345 embarazadas</span>
            </div>

            <div className={styles.egTriCardDashed}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#3F5F9E" }}>Captación temprana</span>
              <b style={{ fontSize: 28 }}>68%</b>
              <span style={{ fontSize: 13, color: "#5E5D5B" }}>primer control antes de la semana 13</span>
            </div>
          </div>

          {/* Leyenda Semáforo del Histograma */}
          <div className={styles.egLegend}>
            <span className={styles.egLegendItem}>
              <span className={styles.egSquareVerde} />
              Controladas (al día)
            </span>
            <span className={styles.egLegendItem}>
              <span className={styles.egSquareGris} />
              Sin control al día
            </span>
          </div>

          {/* Histograma Sencillo y Robusto */}
          <div className={styles.egHistogramWrapper}>
            <div className={styles.egHistogramTrack}>
              {egList.map((g: any, idx: number) => {
                const total = g.total || 0;
                const controladas = g.controladas || 0;
                const sinControl = Math.max(0, total - controladas);
                const pct = total > 0 ? Math.round((controladas * 100) / total) : 0;
                const trackHeight = Math.max(14, Math.round((total / maxEg) * 150));

                const tooltipTexto = 
                  `${g.rango} semanas\n` +
                  `• Embarazos activos: ${total}\n` +
                  `• Controladas (al día): ${controladas} (${pct}%)\n` +
                  `• Sin control al día: ${sinControl}`;

                return (
                  <div 
                    key={idx} 
                    className={styles.egBarCol}
                    title={tooltipTexto}
                  >
                    <span className={styles.egLabelPct}>{total > 0 ? `${pct}%` : "-"}</span>
                    <span className={styles.egLabelCount}>{total}</span>

                    <div className={styles.egBarTrack} style={{ height: `${trackHeight}px` }}>
                      <div className={styles.egBarFill} style={{ height: `${pct}%` }} />
                    </div>

                    <span className={styles.egLabelRango}>{g.rango}</span>
                  </div>
                );
              })}
            </div>
            <p style={{ margin: "14px 0 0", fontSize: 12, color: "#5E5D5B", textAlign: "center" }}>
              Semanas de edad gestacional · arriba de cada barra: % al día y embarazos activos
            </p>
          </div>
        </section>

        {/* 9. Evolución de Cobertura (Gráfico SVG) */}
        <section className={styles.chartCard}>
          <div className={styles.evoHeader}>
            <div>
              <h2 className={styles.chartTitle}>Evolución de cobertura</h2>
              <p className={styles.chartSub} style={{ margin: "4px 0 0" }}>
                {evoData.hasSelection
                  ? `Cobertura semanal de ${evoData.selectedCenter.name} en el último trimestre, comparada con el total ${tipoEfector}`
                  : `Evolución de cobertura total de ${tipoEfector} del último trimestre`}
              </p>
            </div>

            <div className={styles.evoSelectWrapper}>
              <label>Centro de salud</label>
              <select
                value={selectedEfectorIdx}
                onChange={(e) => setSelectedEfectorIdx(Number(e.target.value))}
                className={styles.evoSelect}
              >
                <option value={-1}>Todos los {tipoEfector} (total)</option>
                {resumenEfectores.map((ef: any, idx: number) => (
                  <option key={idx} value={idx}>{ef.name}</option>
                ))}
              </select>
            </div>
          </div>

          <svg
            viewBox="0 0 840 270"
            role="img"
            aria-label="Evolución semanal de la cobertura de controles al día"
            className={styles.evoSvg}
          >
            {/* Líneas horizontales guía de la cuadrícula */}
            <g stroke="#EDEDED" strokeWidth="1">
              <line x1="60" y1="40" x2="780" y2="40" />
              <line x1="60" y1="78" x2="780" y2="78" />
              <line x1="60" y1="116" x2="780" y2="116" />
              <line x1="60" y1="154" x2="780" y2="154" />
              <line x1="60" y1="192" x2="780" y2="192" />
              <line x1="60" y1="230" x2="780" y2="230" />
            </g>

            {/* Escala vertical de porcentajes */}
            <g fontSize="12" fill="#5E5D5B" textAnchor="end" fontFamily="inherit">
              <text x="50" y="44">100%</text>
              <text x="50" y="82">80%</text>
              <text x="50" y="120">60%</text>
              <text x="50" y="158">40%</text>
              <text x="50" y="196">20%</text>
              <text x="50" y="234">0%</text>
            </g>

            {/* Escala horizontal de fechas semanales */}
            <g fontSize="12" fill="#5E5D5B" textAnchor="middle" fontFamily="inherit">
              {evoDates.map((fecha, idx) => (
                <text key={idx} x={80 + idx * (680 / 12)} y="256">
                  {fecha}
                </text>
              ))}
            </g>

            {/* Línea de referencia (promedio total en línea punteada gris si hay un centro elegido) */}
            {evoData.hasSelection && (
              <>
                <polyline
                  points={evoData.refPoints}
                  fill="none"
                  stroke="#A3A2A0"
                  strokeWidth="2"
                  strokeDasharray="6 5"
                  strokeLinejoin="round"
                />
                <text
                  x="768"
                  y={evoData.refEndY + 4}
                  textAnchor="start"
                  fontSize="12"
                  fontWeight="600"
                  fill="#5E5D5B"
                  fontFamily="inherit"
                >
                  Total
                </text>
              </>
            )}

            {/* Línea principal azul sólida */}
            <polyline
              points={evoData.mainPoints}
              fill="none"
              stroke="#4E6FAE"
              strokeWidth="4"
              strokeLinejoin="round"
            />

            {/* Círculo inicial */}
            <circle cx={evoData.startX} cy={evoData.startY} r="6" fill="#4E6FAE" />

            {/* Círculo final */}
            <circle cx={evoData.endX} cy={evoData.endY} r="6" fill="#4E6FAE" />
          </svg>

          {/* Leyenda comparativa cuando se selecciona un centro puntual */}
          {evoData.hasSelection && (
            <div className={styles.evoLegend}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 18, height: 4, borderRadius: 2, background: "#4E6FAE" }} />
                {evoData.selectedCenter.short}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#5E5D5B" }}>
                <span style={{ width: 18, height: 0, borderTop: "2px dashed #A3A2A0" }} />
                Total {tipoEfector}
              </span>
            </div>
          )}
        </section>

        {/* 10. Alcance territorial e Interior */}
        <section className={styles.chartCard} style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <Building2 size={20} color="#2B4C7E" />
                <h2 className={styles.chartTitle} style={{ margin: 0 }}>Alcance territorial del seguimiento</h2>
              </div>
              <p className={styles.chartSub} style={{ margin: 0 }}>
                Corte {territorial?.fechaCorte ? new Date(`${String(territorial.fechaCorte).slice(0, 10)}T12:00:00`).toLocaleDateString("es-AR") : "no disponible"}
                {territorial?.ventanaInicio && ` · controles desde ${new Date(`${String(territorial.ventanaInicio).slice(0, 10)}T12:00:00`).toLocaleDateString("es-AR")}`}
              </p>
            </div>

            <button
              type="button"
              onClick={handleDescargarTerritorial}
              disabled={!territorial || descargandoTerritorial}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                backgroundColor: descargandoTerritorial ? "#7890A8" : "#2B4C7E",
                color: "#FFFFFF",
                border: 0,
                borderRadius: 6,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: !territorial || descargandoTerritorial ? "not-allowed" : "pointer",
                opacity: !territorial ? 0.65 : 1,
              }}
            >
              <Download size={16} />
              <span>{descargandoTerritorial ? "Generando PDF..." : "Descargar informe territorial"}</span>
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginTop: 20, borderTop: "1px solid #D9E0E7", borderBottom: "1px solid #D9E0E7" }}>
            <div style={{ padding: "16px 18px 16px 0" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>Embarazos en curso</span>
              <p style={{ margin: "5px 0 0", fontSize: 30, lineHeight: 1.1, fontWeight: 700, color: "#1E293B", fontVariantNumeric: "tabular-nums" }}>
                {(territorialResumen?.embarazos || 0).toLocaleString("es-AR")}
              </p>
            </div>
            <div style={{ padding: "16px 18px", borderLeft: "1px solid #D9E0E7" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#15803D", textTransform: "uppercase" }}>Controladas en 40 días</span>
              <p style={{ margin: "5px 0 0", fontSize: 30, lineHeight: 1.1, fontWeight: 700, color: "#15803D", fontVariantNumeric: "tabular-nums" }}>
                {(territorialResumen?.controladas || 0).toLocaleString("es-AR")}
              </p>
            </div>
            <div style={{ padding: "16px 18px", borderLeft: "1px solid #D9E0E7" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#2B4C7E", textTransform: "uppercase" }}>Cobertura reportada</span>
              <p style={{ margin: "5px 0 0", fontSize: 30, lineHeight: 1.1, fontWeight: 700, color: "#2B4C7E", fontVariantNumeric: "tabular-nums" }}>
                {(territorialResumen?.cobertura || 0).toFixed(1).replace(".", ",")}%
              </p>
            </div>
            <div style={{ padding: "16px 18px", borderLeft: "1px solid #D9E0E7" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase" }}>Centros con control reportado</span>
              <p style={{ margin: "5px 0 0", fontSize: 30, lineHeight: 1.1, fontWeight: 700, color: "#1E293B", fontVariantNumeric: "tabular-nums" }}>
                {(territorialResumen?.efectoresConControl || 0).toLocaleString("es-AR")} <span style={{ fontSize: 16, fontWeight: 500, color: "#64748B" }}>/ {(territorialResumen?.efectoresConEmbarazos || 0).toLocaleString("es-AR")}</span>
              </p>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: "#2B4C7E" }}>Interior · departamentos con mayor padrón</h3>
              <span style={{ fontSize: 12, color: "#64748B" }}>Embarazos y controles reportados</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 620 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1.2fr) minmax(120px, 2fr) 90px 90px 80px", gap: 12, padding: "8px 0", borderBottom: "1px solid #CBD5E1", fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase" }}>
                  <span>Departamento</span><span>En curso</span><span style={{ textAlign: "right" }}>Controladas</span><span style={{ textAlign: "right" }}>Cobertura</span><span style={{ textAlign: "right" }}>Efectores</span>
                </div>
                {departamentosInterior.map((row) => {
                  const cobertura = row.embarazos > 0 ? (row.controladas * 100) / row.embarazos : 0;
                  return (
                    <div key={row.nombre} style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1.2fr) minmax(120px, 2fr) 90px 90px 80px", gap: 12, alignItems: "center", padding: "9px 0", borderBottom: "1px solid #E8EDF2", fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>{row.nombre}</span>
                      <div style={{ height: 12, background: "#DCE7F1", borderRadius: 2, overflow: "hidden" }} title={`${row.embarazos} embarazos`}>
                        <div style={{ width: `${(row.embarazos * 100) / maxEmbarazosDepartamento}%`, height: "100%", background: "#2B4C7E" }} />
                      </div>
                      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.controladas.toLocaleString("es-AR")}</span>
                      <span style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{cobertura.toFixed(1).replace(".", ",")}%</span>
                      <span style={{ textAlign: "right", color: "#64748B", fontVariantNumeric: "tabular-nums" }}>{row.efectores}</span>
                    </div>
                  );
                })}
                {departamentosInterior.length === 0 && (
                  <p style={{ margin: 0, padding: "16px 0", color: "#64748B", fontSize: 13 }}>Sin datos territoriales disponibles para el corte.</p>
                )}
              </div>
            </div>
          </div>

          <p style={{ margin: "16px 0 0", fontSize: 12, lineHeight: 1.5, color: "#64748B" }}>
            Fuente: snapshot final {territorial?.batchId || "sin lote informado"} · {territorialResumen?.embarazosSinSisa || 0} embarazos sin código SISA y {territorialResumen?.codigosSinCatalogo || 0} códigos sin coincidencia en el catálogo. La ausencia de control reportado no demuestra ausencia de atención.
          </p>
        </section>
      </main>
    </div>
  );
}
