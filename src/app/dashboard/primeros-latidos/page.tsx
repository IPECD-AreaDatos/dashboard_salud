"use client";

import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { Download, Search, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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

  // Estado de ordenamiento
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  }>({
    key: "dias_ultimo_control", // Orden inicial: por días sin control
    direction: "asc",
  });

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  // Lista ordenada en memoria con useMemo
  const sortedPacientes = useMemo(() => {
    if (!data?.pacientes) return [];
    const items = [...data.pacientes];

    return items.sort((a: any, b: any) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      // Manejo de valores nulos o indefinidos (van al final)
      if (valA === null || valA === undefined || valA === "") return 1;
      if (valB === null || valB === undefined || valB === "") return -1;

      // Orden numérico (DNI, Días)
      if (typeof valA === "number" && typeof valB === "number") {
        return sortConfig.direction === "asc" ? valA - valB : valB - valA;
      }

      // Orden fechas
      if (
        sortConfig.key.includes("fecha") &&
        Date.parse(valA) &&
        Date.parse(valB)
      ) {
        const timeA = new Date(valA).getTime();
        const timeB = new Date(valB).getTime();
        return sortConfig.direction === "asc" ? timeA - timeB : timeB - timeA;
      }

      // Orden alfabético (Strings)
      const strA = valA.toString().toLowerCase();
      const strB = valB.toString().toLowerCase();

      if (strA < strB) return sortConfig.direction === "asc" ? -1 : 1;
      if (strA > strB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [data?.pacientes, sortConfig]);

  // Componente auxiliar para pintar el ícono correspondiente
  const renderSortIcon = (colKey: string) => {
    if (sortConfig.key !== colKey) {
      return <ArrowUpDown size={13} style={{ opacity: 0.35, marginLeft: 4 }} />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp size={13} style={{ color: "#587ba8", marginLeft: 4 }} />
    ) : (
      <ArrowDown size={13} style={{ color: "#587ba8", marginLeft: 4 }} />
    );
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

        {/* Fila de KPIs SegEm: Ventanas de Cobro para Primeros Latidos */}
        <div className={styles.kpiGrid}>
          {/* Card: Total Padrón Activo */}
          <div 
            onClick={() => setCorteDias("Todos")}
            className={`${styles.kpiCard} ${corteDias === "Todos" ? styles.cardActive : ""}`}
            title="Ver todas las embarazadas en curso"
          >
            <span className={styles.kpiLabel}>Total Padrón Activo</span>
            <span className={`${styles.kpiValue} ${styles.colorPadron}`}>
              {parseInt(kpis.total_activas || 0).toLocaleString("es-AR")}
            </span>
            <small className={styles.kpiSub}>Universo total provincial</small>
          </div>

          {/* Card: Aptas <= 40 días */}
          <div 
            onClick={() => setCorteDias("40")}
            className={`${styles.kpiCard} ${styles.cardVerde} ${corteDias === "40" ? styles.cardActive : ""}`}
            title="Beneficiarias con control vigente dentro de los 40 días"
          >
            <span className={styles.kpiLabel} style={{ color: "#15803d" }}>Aptas (Control &le; 40 días)</span>
            <span className={`${styles.kpiValue} ${styles.colorVerde}`}>
              {parseInt(kpis.aptas_40 || 0).toLocaleString("es-AR")}
            </span>
            <small className={styles.kpiSub}>
              {kpis.total_activas > 0 ? ((kpis.aptas_40 * 100) / kpis.total_activas).toFixed(1) : 0}% del padrón provincial
            </small>
          </div>

          {/* Card: Aptas <= 60 días */}
          <div 
            onClick={() => setCorteDias("60")}
            className={`${styles.kpiCard} ${styles.cardAzul} ${corteDias === "60" ? styles.cardActive : ""}`}
            title="Beneficiarias si se amplía la ventana de corte a 60 días"
          >
            <span className={styles.kpiLabel} style={{ color: "#1d4ed8" }}>Aptas (Ventana &le; 60 días)</span>
            <span className={`${styles.kpiValue} ${styles.colorAzul}`}>
              {parseInt(kpis.aptas_60 || 0).toLocaleString("es-AR")}
            </span>
            <small className={styles.kpiSub}>
              {kpis.total_activas > 0 ? ((kpis.aptas_60 * 100) / kpis.total_activas).toFixed(1) : 0}% con ventana flexible
            </small>
          </div>

          {/* Card: Aptas <= 90 días */}
          <div 
            onClick={() => setCorteDias("90")}
            className={`${styles.kpiCard} ${styles.cardVioleta} ${corteDias === "90" ? styles.cardActive : ""}`}
            title="Beneficiarias si se amplía la ventana máxima a 90 días"
          >
            <span className={styles.kpiLabel} style={{ color: "#7e22ce" }}>Aptas (Ventana &le; 90 días)</span>
            <span className={`${styles.kpiValue} ${styles.colorVioleta}`}>
              {parseInt(kpis.aptas_90 || 0).toLocaleString("es-AR")}
            </span>
            <small className={styles.kpiSub}>
              {kpis.total_activas > 0 ? ((kpis.aptas_90 * 100) / kpis.total_activas).toFixed(1) : 0}% con ventana extendida
            </small>
          </div>

          {/* Card: No Aptas / Sin Control (> 90 días o sin registro) */}
          <div 
            onClick={() => setCorteDias("no_aptas")}
            className={`${styles.kpiCard} ${styles.cardGris} ${corteDias === "no_aptas" ? styles.cardActive : ""}`}
            title="Embarazadas sin control reciente o sin controles registrados"
          >
            <span className={styles.kpiLabel} style={{ color: "#64748b" }}>Inactivas / Sin Control</span>
            <span className={`${styles.kpiValue} ${styles.colorGris}`}>
              {parseInt(kpis.no_aptas_mas_90 || 0).toLocaleString("es-AR")}
            </span>
            <small className={styles.kpiSub}>Atraso &gt; 90d o sin registro</small>
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
              <label>Corte para beneficio:</label>
              <select value={corteDias} onChange={(e) => setCorteDias(e.target.value)}>
                <option value="Todos">Todas las embarazadas</option>
                <option value="40">Aptas corte estricto (&le; 40 días)</option>
                <option value="60">Aptas ventana ampliada (&le; 60 días)</option>
                <option value="90">Aptas ventana máxima (&le; 90 días)</option>
                <option value="no_aptas">Inactivas / Sin control (&gt; 90 días o S/D)</option>
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
                    <th className={`${styles.colDni} ${styles.thSortable}`} onClick={() => handleSort("dni")}>
                      <div className={styles.thContent}>DNI {renderSortIcon("dni")}</div>
                    </th>
                    <th className={`${styles.colPaciente} ${styles.thSortable}`} onClick={() => handleSort("apellido")}>
                      <div className={styles.thContent}>Paciente {renderSortIcon("apellido")}</div>
                    </th>
                    <th className={`${styles.colFecha} ${styles.thSortable}`} onClick={() => handleSort("fecha_probable_parto")}>
                      <div className={styles.thContent}>FPP {renderSortIcon("fecha_probable_parto")}</div>
                    </th>
                    <th className={`${styles.colFecha} ${styles.thSortable}`} onClick={() => handleSort("fecha_ultimo_control")}>
                      <div className={styles.thContent}>Último Control {renderSortIcon("fecha_ultimo_control")}</div>
                    </th>
                    <th className={`${styles.colDias} ${styles.thSortable}`} onClick={() => handleSort("dias_ultimo_control")}>
                      <div className={styles.thContent} style={{ justifyContent: "center" }}>
                        Días {renderSortIcon("dias_ultimo_control")}
                      </div>
                    </th>
                    <th className={styles.colEstado}>Estado Prestación</th>
                    <th className={`${styles.colEstablecimiento} ${styles.thSortable}`} onClick={() => handleSort("nombre_establecimiento")}>
                      <div className={styles.thContent}>Establecimiento {renderSortIcon("nombre_establecimiento")}</div>
                    </th>
                    <th className={`${styles.colLocalidad} ${styles.thSortable}`} onClick={() => handleSort("localidad")}>
                      <div className={styles.thContent}>Localidad {renderSortIcon("localidad")}</div>
                    </th>
                    <th className={styles.colTelefono}>Teléfono</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPacientes.length > 0 ? (
                    sortedPacientes.map((p: any) => {
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
                          <td className={styles.colDni} style={{ fontWeight: 600 }}>
                            {p.dni}
                          </td>
                          <td className={styles.colPaciente} title={`${p.apellido}, ${p.nombre}`}>
                            {p.apellido}, {p.nombre}
                          </td>
                          <td className={styles.colFecha}>
                            {p.fecha_probable_parto ? new Date(p.fecha_probable_parto).toLocaleDateString("es-AR") : "-"}
                          </td>
                          <td className={styles.colFecha}>
                            {p.fecha_ultimo_control ? new Date(p.fecha_ultimo_control).toLocaleDateString("es-AR") : "Sin registro"}
                          </td>
                          <td className={styles.colDias}>
                            {dias !== null ? `${dias} d` : "-"}
                          </td>
                          <td className={styles.colEstado}>
                            <span className={`${styles.badge} ${badgeStyle}`}>
                              {estadoTexto}
                            </span>
                          </td>
                          <td className={styles.colEstablecimiento} title={p.nombre_establecimiento || "-"}>
                            {p.nombre_establecimiento || "-"}
                          </td>
                          <td className={styles.colLocalidad} title={p.localidad || "-"}>
                            {p.localidad || "-"}
                          </td>
                          <td className={styles.colTelefono}>
                            {p.telefono || "-"}
                          </td>
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