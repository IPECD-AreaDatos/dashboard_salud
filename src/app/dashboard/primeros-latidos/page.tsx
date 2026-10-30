"use client";

import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { Download, Search, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Image from "next/image";
import logoColorImg from "../../../../public/logo_color.png";
import logoSaludImg from "../../../../public/Logo_Salud_Publica_colorH.png";
import styles from "./PrimerosLatidos.module.css";

export default function PrimerosLatidosPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [search, setSearch] = useState("");
  const [zona, setZona] = useState("Todos");
  const [departamento, setDepartamento] = useState("Todos");
  const [corteDias, setCorteDias] = useState("Todos");

  const fetchData = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        search,
        zona,
        departamento,
        corteDias
      });

      const basePath = window.location.pathname.startsWith('/salud-dashboard') ? '/salud-dashboard' : '';
      const res = await fetch(`${basePath}/api/primeros-latidos?${queryParams.toString()}`);

      if (!res.ok) {
        console.error("Error en respuesta:", res.status);
        setData({ kpis: {}, pacientes: [], totalResultados: 0, departamentos: [] });
        return;
      }

      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Error al cargar datos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [zona, departamento, corteDias]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  // Descarga del reporte idéntico al Excel de Tony (13 columnas)
  const handleExportExcel = () => {
    if (!data?.pacientes || data.pacientes.length === 0) {
      alert("No hay registros para exportar con los filtros seleccionados.");
      return;
    }

    const exportRows = data.pacientes.map((p: any) => ({
      "dni": p.dni,
      "apellido": p.apellido,
      "nombre": p.nombre,
      "fecha_nacimiento": p.fecha_nacimiento ? p.fecha_nacimiento.split("T")[0] : "",
      "fecha_probable_parto": p.fecha_probable_parto ? p.fecha_probable_parto.split("T")[0] : "",
      "fecha_ultimo_control": p.fecha_ultimo_control ? p.fecha_ultimo_control.split("T")[0] : "",
      "dias_ultimo_control": p.dias_ultimo_control !== null ? p.dias_ultimo_control : "Sin control",
      "telefono": p.telefono || "",
      "calle_domicilio": p.calle_domicilio || "",
      "nro_puerta_domicilio": p.nro_puerta_domicilio || "",
      "barrio_paraje_domicilio": p.barrio_paraje_domicilio || "",
      "nombre_establecimiento": p.nombre_establecimiento || "",
      "localidad": p.localidad || ""
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "embarazos_en_curso");

    const fechaHoy = new Date().toISOString().split("T")[0];
    XLSX.writeFile(workbook, `Primeros_Latidos_Embarazos_en_curso_${fechaHoy}.xlsx`);
  };

  const kpis = data?.kpis || {};

  return (
    <div className={styles.mainWrapper}>
      {/* 🌟 1. NAVBAR OFICIAL */}
      <Navbar />

      <main className={styles.contentContainer}>
        {/* Cabecera de Página */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Primeros Latidos — Padrón y Control de Prestaciones</h1>
            <p className={styles.subtitle}>
              Monitoreo provincial de controles prenatales para asignación, suspensión o continuidad del beneficio.
            </p>
          </div>
          <button onClick={handleExportExcel} className={styles.btnExportar}>
            <Download size={18} />
            Descargar Reporte Excel
          </button>
        </div>

        {/* Fila de KPIs SegEm */}
        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total Padrón Activo</span>
            <span className={`${styles.kpiValue} ${styles.colorPadron}`}>
              {parseInt(kpis.total_activas || 0).toLocaleString("es-AR")}
            </span>
            <small className={styles.kpiSub}>Embarazadas vigentes</small>
          </div>

          <div className={`${styles.kpiCard} ${styles.cardVerde}`}>
            <span className={styles.kpiLabel} style={{ color: "#15803d" }}>Aptas (Control al día &le; 40d)</span>
            <span className={`${styles.kpiValue} ${styles.colorVerde}`}>
              {parseInt(kpis.aptas_al_dia || 0).toLocaleString("es-AR")}
            </span>
            <small className={styles.kpiSub}>
              {kpis.total_activas > 0 ? ((kpis.aptas_al_dia * 100) / kpis.total_activas).toFixed(1) : 0}% con controles vigentes
            </small>
          </div>

          <div className={`${styles.kpiCard} ${styles.cardAmarilla}`}>
            <span className={styles.kpiLabel} style={{ color: "#b45309" }}>Atraso &gt; 40 días</span>
            <span className={`${styles.kpiValue} ${styles.colorAmarillo}`}>
              {parseInt(kpis.atraso_mas_40 || 0).toLocaleString("es-AR")}
            </span>
            <small className={styles.kpiSub}>Alerta primer corte</small>
          </div>

          <div className={`${styles.kpiCard} ${styles.cardNaranja}`}>
            <span className={styles.kpiLabel} style={{ color: "#c2410c" }}>Atraso &gt; 60 días</span>
            <span className={`${styles.kpiValue} ${styles.colorNaranja}`}>
              {parseInt(kpis.atraso_mas_60 || 0).toLocaleString("es-AR")}
            </span>
            <small className={styles.kpiSub}>Revisión de continuidad</small>
          </div>

          <div className={`${styles.kpiCard} ${styles.cardRoja}`}>
            <span className={styles.kpiLabel} style={{ color: "#b91c1c" }}>Atraso &gt; 90 días</span>
            <span className={`${styles.kpiValue} ${styles.colorRojo}`}>
              {parseInt(kpis.atraso_mas_90 || 0).toLocaleString("es-AR")}
            </span>
            <small className={styles.kpiSub}>Sujetas a suspensión / baja</small>
          </div>
        </div>

        {/* Tarjeta de Filtros */}
        <div className={styles.filterCard}>
          <form onSubmit={handleSearchSubmit} className={styles.searchRow}>
            <div className={styles.searchBox}>
              <Search size={18} color="#94a3b8" />
              <input
                type="text"
                placeholder="Buscar por DNI o Apellido..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="submit" className={styles.btnBuscar}>Buscar</button>
          </form>

          <div className={styles.filterControls}>
            <div className={styles.filterItem}>
              <label>Corte por días:</label>
              <select value={corteDias} onChange={(e) => setCorteDias(e.target.value)}>
                <option value="Todos">Todas las embarazadas</option>
                <option value="al_dia">Al día (&le; 40 días)</option>
                <option value="40">Más de 40 días sin control</option>
                <option value="60">Más de 60 días sin control</option>
                <option value="90">Más de 90 días sin control</option>
                <option value="sin_control">Sin ningún control registrado</option>
              </select>
            </div>

            <div className={styles.filterItem}>
              <label>Zona:</label>
              <select value={zona} onChange={(e) => { setZona(e.target.value); setDepartamento("Todos"); }}>
                <option value="Todos">Toda la Provincia</option>
                <option value="Capital">Solo Capital</option>
                <option value="Interior">Solo Interior</option>
              </select>
            </div>

            <div className={styles.filterItem}>
              <label>Departamento:</label>
              <select value={departamento} onChange={(e) => setDepartamento(e.target.value)}>
                <option value="Todos">Todos los departamentos</option>
                {data?.departamentos?.map((dep: string) => (
                  <option key={dep} value={dep}>{dep}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 🌟 2. TARJETA DE TABLA CON SCROLL INTERNO Y CABECERA FIJA */}
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>
              Padrón de Embarazadas ({parseInt(data?.totalResultados || 0).toLocaleString("es-AR")} registradas)
            </h2>
          </div>

          {loading ? (
            <div className={styles.loadingContainer}>
              <Loader2 className={styles.spinner} size={38} />
              <p>Actualizando registros de Primeros Latidos...</p>
            </div>
          ) : (
            <div className={styles.scrollTableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>DNI</th>
                    <th>Paciente</th>
                    <th>FPP</th>
                    <th>Último Control</th>
                    <th style={{ textAlign: "center" }}>Días sin Control</th>
                    <th>Estado Prestación</th>
                    <th>Establecimiento</th>
                    <th>Localidad</th>
                    <th>Teléfono</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.pacientes?.length > 0 ? (
                    data.pacientes.map((p: any) => {
                      const dias = p.dias_ultimo_control;
                      let badgeStyle = styles.badgeVerde;
                      let estadoTexto = "Al día (Apta)";

                      if (dias === null) {
                        badgeStyle = styles.badgeGris;
                        estadoTexto = "Sin control";
                      } else if (dias > 90) {
                        badgeStyle = styles.badgeRojo;
                        estadoTexto = "Atraso crítico (>90d)";
                      } else if (dias > 60) {
                        badgeStyle = styles.badgeNaranja;
                        estadoTexto = "Atraso severo (>60d)";
                      } else if (dias > 40) {
                        badgeStyle = styles.badgeAmarillo;
                        estadoTexto = "Atraso moderado (>40d)";
                      }

                      return (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.dni}</td>
                          <td style={{ fontWeight: 600, color: "#0f172a" }}>
                            {p.apellido}, {p.nombre}
                          </td>
                          <td>{p.fecha_probable_parto ? new Date(p.fecha_probable_parto).toLocaleDateString("es-AR") : "-"}</td>
                          <td>{p.fecha_ultimo_control ? new Date(p.fecha_ultimo_control).toLocaleDateString("es-AR") : "Sin registro"}</td>
                          <td style={{ textAlign: "center", fontWeight: 700 }}>
                            {dias !== null ? `${dias} d` : "-"}
                          </td>
                          <td>
                            <span className={`${styles.badge} ${badgeStyle}`}>
                              {estadoTexto}
                            </span>
                          </td>
                          <td style={{ fontSize: "0.825rem", color: "#475569" }}>{p.nombre_establecimiento || "-"}</td>
                          <td>{p.localidad || "-"}</td>
                          <td>{p.telefono || "-"}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className={styles.noDataCell}>
                        No se encontraron registros con los filtros aplicados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* 🌟 3. FOOTER INSTITUCIONAL SEGEM */}
      <footer className={styles.footer}>
        <div className={styles.footerLogos}>
          <Image 
            src={logoColorImg} 
            alt="Modernización" 
            style={{ height: '32px', width: 'auto', objectFit: 'contain', opacity: 0.85 }}
          />
          <div className={styles.footerDivider}></div>
          <Image 
            src={logoSaludImg} 
            alt="Salud Pública" 
            style={{ height: '32px', width: 'auto', objectFit: 'contain', opacity: 0.85 }}
          />
        </div>
        <p className={styles.footerText}>
          Provincia de Corrientes — Ministerio de Salud Pública © 2026
        </p>
      </footer>
    </div>
  );
}