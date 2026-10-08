"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { utils, writeFile } from "xlsx";
import { Download, Filter, RefreshCcw, Search, ShieldAlert, UserRound, X } from "lucide-react";
import Navbar from "@/components/Navbar";
import { apiFetch } from "@/lib/api";
import { registrarLog } from "@/lib/analytics";
import styles from "../Audit.module.css";

interface PacienteRedPerinatal {
  id: number;
  dni: string;
  nombre: string;
  telefono: string;
  fecha_nacimiento: string | null;
  fpp: string | null;
  fecha_ultimo_control: string | null;
  eg_actual: number | null;
  establecimiento: string;
  motivo_derivacion: string;
  motivo_revision: string;
  fuente: string;
  batch_id: string;
  ingestion_at: string;
}

interface ResponseRedPerinatal {
  data: PacienteRedPerinatal[];
  totalGlobal: number;
  ultimaActualizacion: string | null;
  batch_id: string | null;
}

interface EstablecimientoOption {
  label: string;
  value: string;
  cantidad: number;
}

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "Sin registro";

export default function RedPerinatalAuditPage() {
  const { data: session } = useSession();
  const isSupervisora = session?.user?.role === "Supervisora";
  const isGestion =
    session?.user?.role === "Administrador" ||
    session?.user?.role === "Coordinador" ||
    session?.user?.role?.toLowerCase() === "lectura" ||
    session?.user?.name === "admin";
  const centroNombreOId = session?.user?.name || "Mi Centro";

  const [pacientes, setPacientes] = useState<PacienteRedPerinatal[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterDNI, setFilterDNI] = useState("");
  const [filterEst, setFilterEst] = useState("Todos");
  const [establecimientos, setEstablecimientos] = useState<EstablecimientoOption[]>([]);
  const [globalTotal, setGlobalTotal] = useState(0);
  const [totalAbsoluto, setTotalAbsoluto] = useState<number | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPaciente, setSelectedPaciente] = useState<PacienteRedPerinatal | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: "dni" | "fpp" | "fecha_nacimiento" | "eg_actual"; direction: "asc" | "desc" } | null>(null);

  const fetchPacientes = useCallback(async (dniVal = filterDNI, estVal = filterEst) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (dniVal) params.set("dni", dniVal);
      if (isGestion && estVal !== "Todos") params.set("establecimiento", estVal);

      const response = await apiFetch(`/auditoria/red-perinatal?${params.toString()}`);
      if (!response.ok) throw new Error("No se pudo consultar la auditoría de Red Perinatal");

      const result: ResponseRedPerinatal = await response.json();
      const lista = result.data || [];
      const conteo: Record<string, number> = {};
      lista.forEach((paciente) => {
        conteo[paciente.establecimiento] = (conteo[paciente.establecimiento] || 0) + 1;
      });

      setPacientes(lista);
      setGlobalTotal(result.totalGlobal || 0);
      setUltimaActualizacion(result.ultimaActualizacion || null);
      setBatchId(result.batch_id || null);
      setTotalAbsoluto((actual) => actual ?? result.totalGlobal);
      setEstablecimientos(Object.keys(conteo).sort().map((label) => ({ label, value: label, cantidad: conteo[label] })));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [filterDNI, filterEst, isGestion]);

  useEffect(() => {
    if (session) {
      fetchPacientes();
      registrarLog({ modulo: "Auditoría", accion: "VISUALIZAR_RED_PERINATAL" });
    }
  }, [fetchPacientes, session]);

  const filteredEstablecimientos = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return establecimientos.filter((est) => est.label.toLowerCase().includes(search));
  }, [establecimientos, searchTerm]);

  const sortedPacientes = useMemo(() => {
    const result = [...pacientes];
    if (!sortConfig) return result;

    result.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      const comparison = String(aValue ?? "").localeCompare(String(bValue ?? ""), undefined, { numeric: true });
      return sortConfig.direction === "asc" ? comparison : -comparison;
    });
    return result;
  }, [pacientes, sortConfig]);

  const handleSort = (key: "dni" | "fpp" | "fecha_nacimiento" | "eg_actual") => {
    setSortConfig((current) =>
      current?.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  const handleExport = () => {
    if (pacientes.length === 0) return alert("No hay datos para descargar");
    const rows = sortedPacientes.map((paciente) => [
      paciente.dni, paciente.nombre, paciente.telefono, formatDate(paciente.fecha_nacimiento),
      formatDate(paciente.fpp), formatDate(paciente.fecha_ultimo_control),
      paciente.eg_actual !== null ? `${paciente.eg_actual}s` : "-", paciente.establecimiento,
      paciente.motivo_derivacion, paciente.motivo_revision, paciente.fuente, paciente.batch_id, paciente.ingestion_at,
    ]);
    const workbook = utils.book_new();
    const worksheet = utils.aoa_to_sheet([
      ["RED PERINATAL AUDIT", ""],
      ["Fecha de descarga", new Date().toLocaleString("es-AR")],
      ["Batch", batchId || "S/D"],
      ["Última actualización", ultimaActualizacion ? formatDate(ultimaActualizacion) : "S/D"],
      ["Filtros", `DNI=${filterDNI || "Todos"}; Establecimiento=${filterEst}`],
      [],
      ["DNI", "Paciente", "Teléfono", "Fecha de nacimiento", "FPP", "Último control", "Edad gestacional", "Establecimiento", "Motivo de derivación", "Motivo de revisión", "Fuente", "Batch", "Ingestión"],
      ...rows,
    ]);
    utils.book_append_sheet(workbook, worksheet, "Red Perinatal");
    writeFile(workbook, `Red_Perinatal_${batchId || "batch"}.xlsx`);
    registrarLog({ modulo: "Auditoría", accion: "DESCARGAR_EXCEL_RED_PERINATAL" });
  };

  if (isSupervisora) {
    return (
      <>
        <Navbar />
        <div className={styles.container} style={{ padding: "2rem", minHeight: "72vh" }}>
          <div className={styles.placeholderCard}>
            <div className={styles.iconWrapper}><ShieldAlert className={styles.mainIcon} size={32} /></div>
            <h2>Acceso denegado</h2>
            <p className={styles.description}>El rol <strong>Supervisora</strong> no puede acceder a la auditoría de Red Perinatal.</p>
          </div>
        </div>
      </>
    );
  }

  if (!session) return null;

  return (
    <>
      <Navbar />
      <div className={styles.container}>
        <div className={styles.auditTabs}>
            <div className={styles.auditTabGroup}>
                <a className={styles.auditTab} href="/salud-dashboard/dashboard/audit">Auditoría</a>
                <a className={styles.auditTabActive} href="/salud-dashboard/dashboard/audit/red-perinatal">Red Perinatal</a>
            </div>
            <button 
                className={styles.auditBackButton} 
                onClick={() => window.location.assign("/salud-dashboard/dashboard/audit")}
            >
                ← Volver a Auditoría
            </button>
        </div>

        <div className={styles.mainGrid}>
          <aside className={styles.filterCard}>
            <h2 className={styles.filterHeader}><Filter size={18} /> Filtros de búsqueda</h2>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Buscar por DNI</label>
              <div className={styles.searchWrapper}>
                <Search className={styles.searchIcon} size={16} />
                <input
                  type="text" className={styles.searchInput} placeholder="DNI de la embarazada..."
                  value={filterDNI} onChange={(event) => setFilterDNI(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && fetchPacientes(filterDNI, filterEst)}
                />
              </div>
            </div>

            {isGestion ? (
              <div className={styles.filterGroup} style={{ position: "relative" }}>
                <label className={styles.filterLabel}>Establecimiento</label>
                <div className={styles.selectWrapper}>
                  <input
                    type="text" className={styles.selectInput}
                    placeholder="Buscar establecimiento..."
                    style={filterEst !== "Todos" ? { paddingRight: "2.2rem" } : undefined}
                    value={isOpen ? searchTerm : (filterEst === "Todos" ? `Todos los centros (${pacientes.length})` : filterEst)}
                    onFocus={() => { setIsOpen(true); setSearchTerm(""); }}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                  />
                  {filterEst !== "Todos" && !isOpen && (
                    <button className={styles.clearBtn} type="button" title="Ver todos los centros" onClick={() => { setFilterEst("Todos"); setSearchTerm(""); fetchPacientes(filterDNI, "Todos"); }}><X size={13} /></button>
                  )}
                </div>
                {isOpen && (
                  <div className={styles.customDropdown}>
                    <div className={styles.dropdownOption} onClick={() => { setFilterEst("Todos"); setSearchTerm(""); setIsOpen(false); fetchPacientes(filterDNI, "Todos"); }} style={{ fontWeight: 700, color: "#0284c7", borderBottom: "1px dashed #e2e8f0", paddingBottom: "8px", marginBottom: "4px", display: "flex", justifyContent: "space-between" }}>
                      <span>Todos los establecimientos</span><span style={{ fontSize: "0.75rem", color: "#64748b" }}>({totalAbsoluto ?? globalTotal} casos)</span>
                    </div>
                    {filteredEstablecimientos.length === 0 ? (
                      searchTerm && <div className={styles.dropdownOption} style={{ color: "#94a3b8", fontStyle: "italic" }}>No hay centros que coincidan</div>
                    ) : filteredEstablecimientos.map((est) => (
                      <div key={est.value} className={styles.dropdownOption} onClick={() => { setFilterEst(est.value); setSearchTerm(est.label); setIsOpen(false); fetchPacientes(filterDNI, est.value); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                        <span>{est.label}</span><span style={{ fontSize: "0.75rem", color: "#64748b", whiteSpace: "nowrap" }}>({est.cantidad} {est.cantidad === 1 ? "caso" : "casos"})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Establecimiento responsable</label>
                <div style={{ backgroundColor: "#f0f7ff", border: "1px solid #e0f2fe", padding: "0.75rem 1rem", borderRadius: "0.5rem", fontSize: "0.85rem", fontWeight: 600, color: "#0369a1" }}>
                  🏢 {centroNombreOId}
                </div>
              </div>
            )}
          </aside>

          <main className={styles.tableContainer}>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Casos del último batch</span>
                <div className={styles.statValueContainer}><span className={`${styles.statValue} ${styles.textHighlight}`}>{globalTotal.toLocaleString("es-AR")}</span></div>
                <p className={styles.statSubtext}>Registros de Red Perinatal</p>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Batch activo</span>
                <div className={styles.statValueContainer}><span className={styles.statValue}>{batchId || "S/D"}</span></div>
                <p className={styles.statSubtext}>{ultimaActualizacion ? `Ingestado ${new Date(ultimaActualizacion).toLocaleDateString("es-AR")}` : "Sin fecha de ingreso"}</p>
              </div>
            </div>

            <div className={styles.tableHeader}>
              <h2 className={styles.tableTitle}>Detalle de derivación <span className={styles.filtrosBadge}>Red Perinatal</span></h2>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                {ultimaActualizacion && <span style={{ fontSize: "1rem", color: "#64748b", fontWeight: 550 }}>Datos al: {new Date(ultimaActualizacion).toLocaleDateString("es-AR")}</span>}
                <button className={styles.btnRefresh} onClick={handleExport} disabled={pacientes.length === 0} style={{ backgroundColor: "#769FD3", color: "white", borderColor: "#769FD3" }} title="Descargar listado en Excel"><Download size={16} /></button>
                <button className={styles.btnRefresh} onClick={() => fetchPacientes(filterDNI, filterEst)} disabled={loading}><RefreshCcw size={16} className={loading ? "animate-spin" : ""} />{loading ? "Actualizando..." : "Actualizar"}</button>
              </div>
            </div>

            {error && <div className={styles.redPerinatalError} role="alert">{error}</div>}

            <div className={styles.tableResponsive}>
              <table className={styles.pacientesTable}>
                <thead>
                  <tr>
                    <th>Paciente / Establecimiento</th>
                    <th onClick={() => handleSort("dni")} className={styles.sortableHeader}>DNI {sortConfig?.key === "dni" ? (sortConfig.direction === "asc" ? "↑" : "↓") : "↕"}</th>
                    <th onClick={() => handleSort("fecha_nacimiento")} className={styles.sortableHeader}>Fecha de nacimiento {sortConfig?.key === "fecha_nacimiento" ? (sortConfig.direction === "asc" ? "↑" : "↓") : "↕"}</th>
                    <th onClick={() => handleSort("fpp")} className={styles.sortableHeader}>FPP {sortConfig?.key === "fpp" ? (sortConfig.direction === "asc" ? "↑" : "↓") : "↕"}</th>
                    <th onClick={() => handleSort("eg_actual")} className={styles.sortableHeader} style={{ textAlign: "center" }}>Edad gestacional {sortConfig?.key === "eg_actual" ? (sortConfig.direction === "asc" ? "↑" : "↓") : "↕"}</th>
                    <th>Motivo de derivación</th>
                    <th>Revisión</th>
                    <th>Fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPacientes.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: "3rem 1rem", textAlign: "center" }}><div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}><strong style={{ color: "#334155", fontSize: "1rem" }}>No se encontraron registros</strong><p style={{ color: "#64748b", margin: 0, fontSize: "0.85rem" }}>Pruebe con otros filtros o espere a que se ingrese un nuevo batch.</p></div></td></tr>
                  ) : sortedPacientes.map((paciente) => (
                    <tr key={paciente.id} onClick={() => setSelectedPaciente(paciente)} style={{ cursor: "pointer" }}>
                      <td><div className={styles.pacienteInfo}><div className={styles.pacienteNombre}>{paciente.nombre}</div><div className={styles.pacienteSub}><span style={{ marginRight: "8px", color: "#64748b", fontWeight: 600 }}>🏢 {paciente.establecimiento}</span><span style={{ color: "#64748b" }}>{paciente.telefono}</span></div></div></td>
                      <td style={{ color: "#475569", fontWeight: 500 }}>{paciente.dni !== "S/D" ? Number(paciente.dni).toLocaleString("es-AR") : "S/D"}</td>
                      <td style={{ color: "#475569" }}>{formatDate(paciente.fecha_nacimiento)}</td>
                      <td className={styles.fppCell} style={{ color: "#475569" }}>{formatDate(paciente.fpp)}</td>
                      <td style={{ color: "#475569", textAlign: "center", fontWeight: 700 }}>{paciente.eg_actual !== null ? `${paciente.eg_actual}s` : "-"}</td>
                      <td className={styles.redPerinatalMotivo}>{paciente.motivo_derivacion}</td>
                      <td className={styles.redPerinatalRevision}>{paciente.motivo_revision}</td>
                      <td><span className={styles.redPerinatalBadge}>{paciente.fuente}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </main>
        </div>
      </div>

      {selectedPaciente && (
        <div className={styles.redPerinatalModalOverlay} onClick={() => setSelectedPaciente(null)}>
          <section className={styles.redPerinatalModal} onClick={(event) => event.stopPropagation()}>
            <button className={styles.redPerinatalClose} onClick={() => setSelectedPaciente(null)} aria-label="Cerrar">×</button>
            <h2>{selectedPaciente.nombre}</h2>
            <div className={styles.redPerinatalDetailGrid}>
              <div><span>DNI</span><strong>{selectedPaciente.dni}</strong></div>
              <div><span>Teléfono</span><strong>{selectedPaciente.telefono}</strong></div>
              <div><span>Edad gestacional</span><strong>{selectedPaciente.eg_actual !== null ? `${selectedPaciente.eg_actual}s` : "Sin registro"}</strong></div>
              <div><span>Establecimiento</span><strong>{selectedPaciente.establecimiento}</strong></div>
              <div><span>Motivo de derivación</span><strong>{selectedPaciente.motivo_derivacion}</strong></div>
              <div><span>Motivo de revisión</span><strong>{selectedPaciente.motivo_revision}</strong></div>
              <div><span>Batch</span><strong>{selectedPaciente.batch_id}</strong></div>
              <div><span>Ingestión</span><strong>{new Date(selectedPaciente.ingestion_at).toLocaleString("es-AR")}</strong></div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
