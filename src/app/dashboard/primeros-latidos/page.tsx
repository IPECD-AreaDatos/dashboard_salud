"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { generarReportePrimerosLatidosPDF } from "@/lib/pdfPrimerosLatidos";
import * as XLSX from "xlsx";
import { 
  Download, 
  Search, 
  Loader2, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  ChevronDown, 
  FileText, 
  Sheet 
} from "lucide-react";import Navbar from "@/components/Navbar";
import Image from "next/image";
import logoColorImg from "../../../../public/logo_nuevo.png";
import styles from "./PrimerosLatidos.module.css";

export default function PrimerosLatidosPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const userRole = session?.user?.role;
  const isAdmin = userRole === "Administrador" || session?.user?.name === "admin" || (session?.user as any)?.username === "admin1";
  const isPrimerosLatidos = userRole === "Primeros Latidos";

  // 🛡️ 1. Control de acceso: Si es un Coordinador u otro rol, se redirige a /dashboard
  useEffect(() => {
    if (status === "authenticated") {
      if (!isPrimerosLatidos && !isAdmin) {
        const basePath = window.location.pathname.startsWith('/salud-dashboard') ? '/salud-dashboard' : '';
        router.replace(`${basePath}/dashboard`);
      }
    }
  }, [userRole, isAdmin, isPrimerosLatidos, status, router]);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [menuDescargaAbierto, setMenuDescargaAbierto] = useState(false);

  // Filtros
  const [search, setSearch] = useState("");
  const [zona, setZona] = useState("Todos");
  const [departamentos, setDepartamentos] = useState<string[]>([]); // 👈 Array de seleccionados
  const [menuDeptosAbierto, setMenuDeptosAbierto] = useState(false); // 👈 Controla el desplegable
  const [corteDias, setCorteDias] = useState("Todos");

  const fetchData = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        search,
        zona,
        departamento: departamentos.length > 0 ? departamentos.join(",") : "Todos",
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
    if (status === "authenticated" && (isPrimerosLatidos || isAdmin)) {
      fetchData();
    }
  }, [zona, departamentos, corteDias, status, isPrimerosLatidos, isAdmin]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData();
  };

  // Estado de ordenamiento
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  }>({
    key: "dias_ultimo_control", // Orden inicial: controles más recientes primero
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

      // Manejo de valores nulos o vacíos (se ubican al final)
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

  // Ícono de ordenamiento
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

  // Función unificada para descargar PDF o Excel
  const handleDescargar = async (formato: "pdf" | "xlsx") => {
    setMenuDescargaAbierto(false);

    if (formato === "xlsx") {
      handleExportExcel();
      return;
    }

    // Textos limpios de los filtros aplicados para la barra del PDF
    const corteMap: Record<string, string> = {
      Todos: "Todas las embarazadas",
      "40": "Aptas ≤ 40 días",
      "60": "Ventana ≤ 60 días",
      "90": "Ventana ≤ 90 días",
      no_aptas: "Inactivas / Sin control (>90d)",
    };

    const propsPDF = {
      kpis: data?.kpis || {},
      filtros: {
        corteTexto: corteMap[corteDias] || corteDias,
        zonaTexto: zona === "Todos" ? "Toda la Provincia" : zona,
        deptosTexto:
          departamentos.length === 0
            ? "Todos los departamentos"
            : departamentos.join(", "),
        busquedaTexto: search || undefined,
      },
      pacientes: sortedPacientes,
      totalResultados: data?.totalResultados || sortedPacientes.length,
      usuarioGenerador: session?.user?.name || "Administrador",
    };
    await generarReportePrimerosLatidosPDF(propsPDF);
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

  // 🛡️ 2. Si la sesión está cargando o el usuario no tiene permisos, no renderiza la interfaz
  if (status === "loading" || (!isPrimerosLatidos && !isAdmin)) {
    return null;
  }

  const toggleDepto = (dep: string) => {
    setDepartamentos((prev) =>
      prev.includes(dep) ? prev.filter((d) => d !== dep) : [...prev, dep]
    );
  };

  return (
    <div className={styles.mainWrapper}>
      {/* 🌟 1. NAVBAR OFICIAL */}
      <Navbar />

      <main className={styles.contentContainer}>
        {/* Cabecera de Página con Botón Desplegable Multiformato */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Primeros Latidos — Padrón y Control de Prestaciones</h1>
            <p className={styles.subtitle}>
              Monitoreo provincial de controles prenatales para asignación, suspensión o continuidad del beneficio.
            </p>
          </div>

          {/* Menú de Descarga (PDF / Excel) */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className={styles.btnExportar}
              onClick={() => setMenuDescargaAbierto(!menuDescargaAbierto)}
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <Download size={18} />
              <span>Descargar Reporte</span>
              <ChevronDown
                size={15}
                style={{
                  transform: menuDescargaAbierto ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s ease",
                }}
              />
            </button>

            {menuDescargaAbierto && (
              <>
                {/* Backdrop invisible para cerrar al hacer clic afuera */}
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 40 }}
                  onClick={() => setMenuDescargaAbierto(false)}
                />

                {/* Dropdown flotante */}
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
                    minWidth: "215px",
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
              {/* 1. Corte para beneficio */}
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

              {/* 2. Zona */}
              <div className={styles.filterItem}>
                <label>Zona:</label>
                <select 
                  value={zona} 
                  onChange={(e) => { 
                    setZona(e.target.value); 
                    setDepartamentos([]); 
                  }}
                >
                  <option value="Todos">Toda la Provincia</option>
                  <option value="Capital">Solo Capital</option>
                  <option value="Interior">Solo Interior</option>
                </select>
              </div>

              {/* 3. Selector Múltiple de Departamento */}
              <div className={styles.filterItem} style={{ position: "relative" }}>
                <label>Departamento / Municipio:</label>
                
                <button
                  type="button"
                  onClick={() => setMenuDeptosAbierto(!menuDeptosAbierto)}
                  style={{
                    width: "100%",
                    minWidth: "230px",
                    height: "38px",
                    padding: "0 0.85rem",
                    borderRadius: "8px",
                    border: departamentos.length > 0 ? "1.5px solid #456A9D" : "1px solid #cbd5e1",
                    backgroundColor: departamentos.length > 0 ? "#F8FAFC" : "#ffffff",
                    fontSize: "0.875rem",
                    color: departamentos.length > 0 ? "#1e293b" : "#64748b",
                    fontWeight: departamentos.length > 0 ? 600 : 400,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: "6px" }}>
                    {departamentos.length === 0
                      ? "Todos los departamentos"
                      : departamentos.length <= 2
                      ? departamentos.join(", ")
                      : `${departamentos.length} departamentos seleccionados`}
                  </span>
                  <ChevronDown 
                    size={15} 
                    style={{ 
                      color: departamentos.length > 0 ? "#456A9D" : "#64748b", 
                      transform: menuDeptosAbierto ? "rotate(180deg)" : "none", 
                      transition: "transform 0.2s ease" 
                    }} 
                  />
                </button>

                {/* Dropdown flotante */}
                {menuDeptosAbierto && (
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 40 }}
                      onClick={() => setMenuDeptosAbierto(false)}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 5px)",
                        left: 0,
                        width: "100%",
                        minWidth: "260px",
                        maxHeight: "300px",
                        backgroundColor: "#ffffff",
                        border: "1px solid #E2E8F0",
                        borderRadius: "10px",
                        boxShadow: "0 12px 24px -4px rgba(0, 0, 0, 0.12), 0 4px 6px -2px rgba(0, 0, 0, 0.04)",
                        zIndex: 50,
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                      }}
                    >
                      {/* Barra superior de acciones */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          backgroundColor: "#F8FAFC",
                          borderBottom: "1px solid #E2E8F0",
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setDepartamentos(data?.departamentos || [])}
                          style={{ background: "none", border: "none", color: "#456A9D", cursor: "pointer", padding: 0 }}
                        >
                          Seleccionar todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setDepartamentos([])}
                          style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", padding: 0 }}
                        >
                          Limpiar
                        </button>
                      </div>

                      {/* Lista con scroll de checkboxes */}
                      <div style={{ overflowY: "auto", padding: "4px 0", flex: 1 }}>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "9px",
                            padding: "7px 14px",
                            fontSize: "13px",
                            fontWeight: 600,
                            cursor: "pointer",
                            color: "#1e293b",
                            backgroundColor: departamentos.length === 0 ? "#F1F5F9" : "transparent",
                          }}
                          onClick={() => setDepartamentos([])}
                        >
                          <input
                            type="checkbox"
                            checked={departamentos.length === 0}
                            readOnly
                            style={{ cursor: "pointer", accentColor: "#456A9D" }}
                          />
                          <span>Todos los departamentos</span>
                        </label>

                        {data?.departamentos?.map((dep: string) => {
                          const checked = departamentos.includes(dep);
                          return (
                            <label
                              key={dep}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "9px",
                                padding: "6px 14px",
                                fontSize: "13px",
                                color: checked ? "#1e293b" : "#475569",
                                fontWeight: checked ? 600 : 400,
                                cursor: "pointer",
                                backgroundColor: checked ? "#F8FAFC" : "transparent",
                                transition: "background-color 0.1s ease",
                              }}
                              onMouseEnter={(e) => {
                                if (!checked) e.currentTarget.style.backgroundColor = "#F1F5F9";
                              }}
                              onMouseLeave={(e) => {
                                if (!checked) e.currentTarget.style.backgroundColor = "transparent";
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleDepto(dep)}
                                style={{ cursor: "pointer", accentColor: "#456A9D" }}
                              />
                              <span>{dep}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* 🌟 Renglón Inferior de Pastillas (Chips) Activas */}
            {departamentos.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "14px",
                  paddingTop: "12px",
                  borderTop: "1px solid #E2E8F0",
                }}
              >
                <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748B", marginRight: "4px" }}>
                  Filtrando {departamentos.length} {departamentos.length === 1 ? "departamento" : "departamentos"}:
                </span>

                {departamentos.map((dep) => (
                  <span
                    key={dep}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      backgroundColor: "#EDF2F7",
                      color: "#2B4C7E",
                      border: "1px solid #CBD5E1",
                      borderRadius: "9999px",
                      padding: "3px 10px 3px 12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      letterSpacing: "0.01em",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)",
                    }}
                  >
                    {dep}
                    <button
                      type="button"
                      onClick={() => toggleDepto(dep)}
                      title={`Quitar ${dep}`}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#64748B",
                        cursor: "pointer",
                        padding: "2px",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "color 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#DC2626")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#64748B")}
                    >
                      ✕
                    </button>
                  </span>
                ))}

                <button
                  type="button"
                  onClick={() => setDepartamentos([])}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#94A3B8",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                    marginLeft: "4px",
                    padding: "4px 6px",
                    borderRadius: "4px",
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#DC2626";
                    e.currentTarget.style.textDecoration = "underline";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#94A3B8";
                    e.currentTarget.style.textDecoration = "none";
                  }}
                >
                  Limpiar todos
                </button>
              </div>
            )}
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
          
        </div>
        <p className={styles.footerText}>
          Provincia de Corrientes - Ministerio de Salud Pública © 2026
        </p>
      </footer>
    </div>
  );
}