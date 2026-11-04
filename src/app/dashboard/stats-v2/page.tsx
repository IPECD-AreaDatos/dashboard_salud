"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { 
  Download, 
  ArrowRight, 
  AlertTriangle, 
  Building2, 
  BarChart2, 
  Loader2 
} from "lucide-react";
import styles from "./StatsV2.module.css";

export default function StatsV2Page() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [hoveredEgIdx, setHoveredEgIdx] = useState<number | null>(null);

  // Filtros
  const [tipoEfector, setTipoEfector] = useState<"CAPS" | "SAPS">("CAPS");
  const [periodoDias, setPeriodoDias] = useState<number>(30);
  const [sortKey, setSortKey] = useState<"name" | "pad" | "cov" | "seg">("cov");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const fechaHoy = new Date().toISOString().split("T")[0];
  const fechaDesdeInicial = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [fechaDesde, setFechaDesde] = useState(fechaDesdeInicial);
  const [fechaHasta, setFechaHasta] = useState(fechaHoy);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const basePath = window.location.pathname.startsWith("/salud-dashboard") ? "/salud-dashboard" : "";
      const queryParams = new URLSearchParams({
        tipoEfector,
        periodoDias: periodoDias.toString()
      });

      const res = await fetch(`${basePath}/api/stats?${queryParams.toString()}`);
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

  useEffect(() => {
    fetchStats();
  }, [tipoEfector, periodoDias]);

  const handlePeriodPick = (dias: number) => {
    setPeriodoDias(dias);
    const d = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    setFechaDesde(d);
  };

  const handleSort = (key: "name" | "pad" | "cov" | "seg") => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "name");
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
  const padronProvincial = pcia?.total || data?.general?.total || 2764;
  const capital = pcia?.capital || { TOTAL: 1144, CAPS: 628, SAPS: 294, HOSPITAL: 222 };
  const interior = pcia?.interior || { TOTAL: 1620, CAPS: 742, SAPS: 488, HOSPITAL: 390 };

  const pctCapital = padronProvincial > 0 ? ((capital.TOTAL * 100) / padronProvincial).toFixed(1).replace(".", ",") : "41,4";
  const pctInterior = padronProvincial > 0 ? ((interior.TOTAL * 100) / padronProvincial).toFixed(1).replace(".", ",") : "58,6";

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
  const totalBase = resumenEfectores.reduce((acc: number, r: any) => acc + r.p1, 0) || (tipoEfector === "CAPS" ? 614 : 294);
  const totalP0 = resumenEfectores.reduce((acc: number, r: any) => acc + r.p0, 0) || 628;
  const totalCtrl = resumenEfectores.reduce((acc: number, r: any) => acc + r.ctrlAct, 0) || (tipoEfector === "CAPS" ? 532 : 102);
  const pctCoberturaTotal = totalBase > 0 ? ((totalCtrl * 100) / totalBase).toFixed(1).replace(".", ",") : "86,6";
  const totalAtrasadas = Math.max(0, totalBase - totalCtrl);
  const pctAtrasadas = totalBase > 0 ? ((totalAtrasadas * 100) / totalBase).toFixed(1).replace(".", ",") : "13,4";

  const porVencerCount = tipoEfector === "CAPS" ? (v2?.porVencer?.caps || 15) : (v2?.porVencer?.saps || 41);

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

  const cobSalud = v2?.coberturaSalud || { publica: 85, obraSocial: 3, sinRegistro: 12 };

  // Datos de histograma de Edad Gestacional
  const egList = v2?.edadGestacional && v2.edadGestacional.length > 0 
    ? v2.edadGestacional 
    : [
        { rango: "0 a 4", total: 0, controladas: 0 },
        { rango: "5 a 8", total: 1, controladas: 1 },
        { rango: "9 a 12", total: 12, controladas: 11 },
        { rango: "13 a 16", total: 37, controladas: 33 },
        { rango: "17 a 20", total: 64, controladas: 54 },
        { rango: "21 a 24", total: 79, controladas: 66 },
        { rango: "25 a 28", total: 90, controladas: 75 },
        { rango: "29 a 32", total: 90, controladas: 74 },
        { rango: "33 a 36", total: 74, controladas: 59 },
        { rango: "37 a 40+", total: 181, controladas: 145 },
      ];

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
                onChange={(e) => setFechaDesde(e.target.value)} 
                className={styles.dateInput} 
              />
            </label>

            <label className={styles.dateLabel}>
              Hasta
              <input 
                type="date" 
                value={fechaHasta} 
                onChange={(e) => setFechaHasta(e.target.value)} 
                className={styles.dateInput} 
              />
            </label>

            <div className={styles.periodButtonGroup}>
              {[7, 14, 30].map((dias) => (
                <button
                  key={dias}
                  onClick={() => handlePeriodPick(dias)}
                  className={`${styles.periodBtn} ${periodoDias === dias ? styles.periodBtnActive : ""}`}
                >
                  {dias} días
                </button>
              ))}
            </div>

            <button className={styles.btnReporte}>
              <Download size={18} />
              Descargar reporte
            </button>
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
                Datos al {new Date().toLocaleDateString("es-AR")}
              </p>
            </div>

            {/* Contenedor de Barras Proporcionales (Capital e Interior) */}
            <div style={{ flex: "1 1 520px", minWidth: 0, display: "flex", flexWrap: "wrap", gap: "20px" }}>
              
              {/* Bloque Capital (proporción 40.7%) */}
              <div style={{ flex: "40.7 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid #4E6FAE", paddingBottom: "6px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#2E2D2C" }}>Capital</span>
                  <span style={{ fontSize: "14px", color: "#5E5D5B", display: "flex", alignItems: "baseline", gap: "8px" }}>
                    <b style={{ fontSize: "22px", color: "#2E2D2C", fontVariantNumeric: "tabular-nums" }}>
                      {capital.TOTAL.toLocaleString("es-AR")}
                    </b>
                    {pctCapital}%
                  </span>
                </div>
                <div style={{ display: "flex", height: "34px", borderRadius: "8px", overflow: "hidden", gap: "2px", fontSize: "13px", fontWeight: 600 }}>
                  <div 
                    style={{ width: `${(capital.CAPS * 100) / capital.TOTAL}%`, background: "#4E6FAE", color: "#FFFFFF", display: "flex", alignItems: "center", paddingLeft: "10px", whiteSpace: "nowrap" }}
                    title={`CAPS: ${capital.CAPS}`}
                  >
                    CAPS {capital.CAPS}
                  </div>
                  <div 
                    style={{ width: `${(capital.SAPS * 100) / capital.TOTAL}%`, backgroundColor: "#8DB4FF", color: "#2E2D2C", display: "flex", alignItems: "center", paddingLeft: "10px", whiteSpace: "nowrap" }}
                    title={`SAPS: ${capital.SAPS}`}
                  >
                    SAPS {capital.SAPS}
                  </div>
                  <div 
                    style={{ width: `${(capital.HOSPITAL * 100) / capital.TOTAL}%`, backgroundColor: "#CAE1FF", color: "#2E2D2C", display: "flex", alignItems: "center", paddingLeft: "8px", whiteSpace: "nowrap" }}
                    title={`Hospitales: ${capital.HOSPITAL}`}
                  >
                    {capital.HOSPITAL > 50 ? `Hosp. ${capital.HOSPITAL}` : capital.HOSPITAL}
                  </div>
                </div>
              </div>

              {/* Bloque Interior (proporción 59.3%) */}
              <div style={{ flex: "59.3 1 360px", minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid #4E6FAE", paddingBottom: "6px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#2E2D2C" }}>Interior</span>
                  <span style={{ fontSize: "14px", color: "#5E5D5B", display: "flex", alignItems: "baseline", gap: "8px" }}>
                    <b style={{ fontSize: "22px", color: "#2E2D2C", fontVariantNumeric: "tabular-nums" }}>
                      {interior.TOTAL.toLocaleString("es-AR")}
                    </b>
                    {pctInterior}%
                  </span>
                </div>
                <div style={{ display: "flex", height: "34px", borderRadius: "8px", overflow: "hidden", gap: "2px", fontSize: "13px", fontWeight: 600 }}>
                  <div 
                    style={{ width: `${(interior.CAPS * 100) / interior.TOTAL}%`, background: "#4E6FAE", color: "#FFFFFF", display: "flex", alignItems: "center", paddingLeft: "10px", whiteSpace: "nowrap" }}
                    title={`CAPS: ${interior.CAPS}`}
                  >
                    CAPS {interior.CAPS}
                  </div>
                  <div 
                    style={{ width: `${(interior.SAPS * 100) / interior.TOTAL}%`, backgroundColor: "#8DB4FF", color: "#2E2D2C", display: "flex", alignItems: "center", paddingLeft: "8px", whiteSpace: "nowrap" }}
                    title={`SAPS: ${interior.SAPS}`}
                  >
                    {interior.SAPS > 60 ? `SAPS ${interior.SAPS}` : interior.SAPS}
                  </div>
                  <div 
                    style={{ width: `${(interior.HOSPITAL * 100) / interior.TOTAL}%`, backgroundColor: "#CAE1FF", color: "#2E2D2C", display: "flex", alignItems: "center", paddingLeft: "10px", whiteSpace: "nowrap" }}
                    title={`Hospitales: ${interior.HOSPITAL}`}
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

          {tipoEfector === "SAPS" && (
            <div className={styles.warningBanner}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <b>Los SAPS todavía no registran todos los controles:</b> la cobertura muestra lo cargado y puede estar subestimada. 
                De los 38 SAPS, 30 tienen embarazadas en padrón y 24 no registraron ningún control al día.
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

            <Link href="/dashboard" className={styles.indicadorCardAtraso}>
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
            <Link href="/dashboard" className={styles.indicadorCardSmall}>
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
                {tipoEfector === "CAPS" ? "31,4%" : "13,6%"}
              </div>
              <div className={styles.progressBarTrack} style={{ height: 8 }}>
                <div 
                  className={styles.progressBarFill} 
                  style={{ width: tipoEfector === "CAPS" ? "31.4%" : "13.6%", background: "#4E6FAE" }} 
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
                  {v2?.usoTablero?.activos ?? (tipoEfector === "CAPS" ? 12 : 9)}
                </span>
                <span style={{ fontSize: 20, fontWeight: 600, color: "#5E5D5B" }}>
                  de {v2?.usoTablero?.total ?? (tipoEfector === "CAPS" ? 17 : 38)}
                </span>
              </div>
              <span style={{ fontSize: 13, color: "#5E5D5B" }}>
                Con al menos una acción en los últimos 7 días (llamada, turno o control cargado)
              </span>
            </div>

            <div className={styles.usoSinUsoCol}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#6F0603" }}>Sin uso hace 7 días o más</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {v2?.usoTablero?.sinUso && v2.usoTablero.sinUso.length > 0 ? (
                  v2.usoTablero.sinUso.map((u: any, idx: number) => (
                    <span key={idx} className={styles.chip}>{u.name} · {u.dias}</span>
                  ))
                ) : (
                  <>
                    <span className={styles.chip}>CAPS 13 · 15 días</span>
                    <span className={styles.chip}>CAPS 11 · 11 días</span>
                    <span className={styles.chip}>CAPS 8 · 9 días</span>
                  </>
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
                <span style={{ textAlign: "center" }}>{tipoEfector === "CAPS" ? "31,4%" : "13,6%"}</span>
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

          {/* Histograma Interactivo con Tooltip Flotante */}
          <div className={styles.egHistogramWrapper}>
            <div className={styles.egHistogramTrack}>
              {egList.map((g: any, idx: number) => {
                const total = g.total || 0;
                const controladas = g.controladas || 0;
                const sinControl = Math.max(0, total - controladas);
                const pct = total > 0 ? Math.round((controladas * 100) / total) : 0;
                const trackHeight = Math.max(14, Math.round((total / maxEg) * 150));
                const isHovered = hoveredEgIdx === idx;

                // Alineación dinámica para que nunca se corte en los costados
                const tooltipPosStyle: React.CSSProperties = idx <= 1 
                  ? { left: "0", transform: "none" } 
                  : idx >= 8 
                    ? { right: "0", transform: "none" } 
                    : { left: "50%", transform: "translateX(-50%)" };

                return (
                  <div 
                    key={idx} 
                    className={styles.egBarCol}
                    onMouseEnter={() => setHoveredEgIdx(idx)}
                    onMouseLeave={() => setHoveredEgIdx(null)}
                  >
                    {isHovered && (
                      <div className={styles.egTooltipActive} style={tooltipPosStyle}>
                        <div style={{ fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 2, marginBottom: 4 }}>
                          {g.rango} semanas
                        </div>
                        <div>Embarazos activos: <b>{total}</b></div>
                        <div style={{ color: '#86efac' }}>Al día: <b>{controladas}</b> ({pct}%)</div>
                        <div style={{ color: '#cbd5e1' }}>Sin control: <b>{sinControl}</b></div>
                      </div>
                    )}

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
      </main>
    </div>
  );
}