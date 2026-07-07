"use client";
import { useState, useEffect, useMemo } from "react";
import { registrarLog } from "@/lib/analytics";
import styles from "../Dashboard.module.css"; 
import Navbar from "@/components/Navbar";
// 👈 Agregamos Download (lucide-react)
import { Search, Phone, RefreshCcw, Filter, X, Download } from "lucide-react";
import InfoPacienteModal from "@/components/InfoPacienteModal";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
// 👈 Importamos xlsx para generar el archivo en el cliente
import { utils, writeFile } from "xlsx";

interface PacienteAuditoria {
  id: number;
  dni: string;
  nombre: string;
  telefono: string;
  fpp: string;
  fecha_nacimiento: string | null;
  eg_actual: number | null;
  establecimiento: string;
  motivo_auditoria: string;
  edad: number | null;
  fuente_limpia: string;
  lote: string;
}

export default function AuditPage() {
  const { data: session } = useSession();
  
  const [pacientes, setPacientes] = useState<PacienteAuditoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [globalTotal, setGlobalTotal] = useState(0);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null); 
  const [totalAbsoluto, setTotalAbsoluto] = useState<number | null>(null);

  const [sortConfig, setSortConfig] = useState<{ key: 'dni' | 'fpp' | 'fecha_nacimiento' | 'eg_actual'; direction: 'asc' | 'desc' } | null>(null);
  
  // Filtros
  const [filterDNI, setFilterDNI] = useState("");
  const [filterEst, setFilterEst] = useState("Todos");
  
  // Estados para el Autocomplete dinámico de Auditoría
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Modal
  const [selectedPaciente, setSelectedPaciente] = useState<PacienteAuditoria | null>(null);

  const esPerfilGestion = session?.user?.role === 'Administrador' || session?.user?.role === 'Coordinador' || session?.user?.role?.toLowerCase() === 'lectura' || session?.user?.name === 'admin';
  const centroNombreOId = session?.user?.name || "Mi Centro";

  const fetchPacientes = async (
    dniVal = filterDNI,
    estVal = filterEst
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dniVal) params.append("dni", dniVal);
      
      if (esPerfilGestion) {
        if (estVal && estVal !== "Todos") params.append("establecimiento", estVal);
      }

      const response = await apiFetch(`/auditoria?${params.toString()}`);
      if (!response.ok) throw new Error("Error fetching data");

      const resData = await response.json();
      const listaPacientes = resData.data || [];

      setPacientes(resData.data || []);
      setGlobalTotal(resData.totalGlobal || 0);
      setUltimaActualizacion(resData.ultimaActualizacion || null);

      if (totalAbsoluto === null && estVal === "Todos") {
        setTotalAbsoluto(resData.totalGlobal || 0);
      }

      if (estVal === "Todos" && esPerfilGestion) {
        const conteo: { [key: string]: number } = {};
        listaPacientes.forEach((p: any) => {
          if (p.establecimiento) {
            conteo[p.establecimiento] = (conteo[p.establecimiento] || 0) + 1;
          }
        });

        const listaMapeada = Object.keys(conteo).sort().map((nombreEst) => ({
          label: nombreEst,
          value: nombreEst,
          cantidad: conteo[nombreEst]
        }));

        setEstablecimientosConCasos(listaMapeada);
      }

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const [establecimientosConCasos, setEstablecimientosConCasos] = useState<{label: string, value: string, cantidad: number}[]>([]);

  const filteredEsts = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return establecimientosConCasos.filter(est => 
      est.label.toLowerCase().includes(searchLower)
    );
  }, [establecimientosConCasos, searchTerm]);
  
  useEffect(() => {
    if (session) {
      fetchPacientes();
      registrarLog({ modulo: "Auditoría", accion: "VISUALIZAR_LISTADO" });
    }
  }, [session]);

  // 👈 NUEVA FUNCIÓN: Descarga a Excel estructurado y con metadatos
  const handleDescargarExcel = () => {
    if (pacientes.length === 0) return alert("No hay datos para descargar");

    const fechaHoraDescarga = new Date().toLocaleString('es-AR');
    const centroFiltrado = esPerfilGestion ? filterEst : centroNombreOId;

    // 1. Definimos las filas de Metadatos de cabecera en el Excel
    const infoFilas = [
      ["REPORTE DE AUDITORÍA Y CALIDAD DE DATOS OBSTÉTRICOS"],
      [`Fecha y Hora de Descarga: ${fechaHoraDescarga}`],
      [`Filtro Establecimiento: ${centroFiltrado}`],
      [`Filtro DNI: ${filterDNI || "Ninguno"}`],
      [], // Fila en blanco de separación
    ];

    // 2. Mapeamos el listado actual (respetando el ordenamiento en pantalla `sortedPacientes`)
    const headers = [
      "ID Ficha", "Nombre de la Embarazada", "DNI", "Teléfono", 
      "Fecha de Nacimiento", "FPP", "EG Actual (Semanas)", 
      "Establecimiento", "Motivo de Auditoría", "Lote"
    ];

    const datosMapeados = sortedPacientes.map(p => [
      p.id,
      p.nombre,
      p.dni,
      p.telefono || "S/R",
      p.fecha_nacimiento ? new Date(p.fecha_nacimiento).toLocaleDateString('es-AR') : "Sin registro",
      p.fpp ? new Date(p.fpp).toLocaleDateString('es-AR') : "Sin registro",
      p.eg_actual !== null ? `${p.eg_actual}s` : "-",
      p.establecimiento || "S/D",
      p.motivo_auditoria,
      p.lote || "-"
    ]);

    // Combinamos metadatos + encabezado de la tabla + registros
    const contenidoCompleto = [...infoFilas, headers, ...datosMapeados];

    // 3. Crear el libro de Excel
    const wb = utils.book_new();
    const ws = utils.aoa_to_sheet(contenidoCompleto);

    // Añadir la hoja al libro
    utils.book_append_sheet(wb, ws, "Auditoría");

    // Generar la descarga del archivo comprimido de excel (.xlsx)
    const nombreArchivo = `Auditoria_${centroFiltrado.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
    writeFile(wb, nombreArchivo);

    // Auditoría opcional: Registrar log de descarga si el sistema lo requiere
    registrarLog({ modulo: "Auditoría", accion: "DESCARGAR_EXCEL", detalles: `Filtro: ${centroFiltrado}` });
  };


  const handleSort = (key: 'dni' | 'fpp' | 'fecha_nacimiento' | 'eg_actual') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const sortedPacientes = useMemo(() => {
    let sortablePacientes = [...pacientes];
    if (sortConfig !== null) {
      sortablePacientes.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
  
        if (aVal === null || aVal === undefined || aVal === "S/D" || aVal === "-") return 1;
        if (bVal === null || bVal === undefined || bVal === "S/D" || bVal === "-") return -1;
  
        if (sortConfig.key === 'fpp' || sortConfig.key === 'fecha_nacimiento') {
          return sortConfig.direction === 'asc' 
            ? new Date(aVal).getTime() - new Date(bVal).getTime()
            : new Date(bVal).getTime() - new Date(aVal).getTime();
        }
  
        if (sortConfig.key === 'eg_actual') {
          return sortConfig.direction === 'asc'
            ? Number(aVal) - Number(bVal)
            : Number(bVal) - Number(aVal);
        }
  
        return sortConfig.direction === 'asc'
          ? String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
          : String(bVal).localeCompare(String(aVal), undefined, { numeric: true });
      });
    }
    return sortablePacientes;
  }, [pacientes, sortConfig]);

  if (!session) return null;

  return (
    <>
      <Navbar />
      <div className={styles.container}>

        <div className={styles.mainGrid}>
          {/* CONTROLES Y FILTROS (Lateral) */}
          <aside className={styles.filterCard}>
            <h2 className={styles.filterHeader}>
              <Filter size={18} /> Filtros de Búsqueda
            </h2>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Buscar por DNI</label>
              <div className={styles.searchWrapper}>
                <Search className={styles.searchIcon} size={16} />
                <input
                  type="text"
                  placeholder="DNI de la embarazada..."
                  value={filterDNI}
                  onChange={(e) => setFilterDNI(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') fetchPacientes(filterDNI, filterEst);
                  }}
                  className={styles.searchInput}
                />
              </div>
            </div>

            {esPerfilGestion ? (
              <div className={styles.filterGroup} style={{ position: 'relative' }}>
                <label className={styles.filterLabel}>Establecimiento</label>

                <div className={styles.selectWrapper}>
                  <input
                    type="text"
                    className={styles.selectInput}
                    placeholder="Buscar establecimiento..."
                    style={filterEst !== "Todos" ? { paddingRight: '2.2rem' } : undefined}
                    value={isOpen ? searchTerm : (filterEst === "Todos" ? `Todos los centros (${pacientes.length})` : filterEst)}
                    onFocus={() => { setIsOpen(true); setSearchTerm(""); }}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onBlur={() => setTimeout(() => setIsOpen(false), 200)} 
                  />
                  
                  {filterEst !== "Todos" && !isOpen && (
                    <button
                      className={styles.clearBtn}
                      onClick={() => {
                        setFilterEst("Todos");
                        setSearchTerm("");
                        fetchPacientes(filterDNI, "Todos");
                      }}
                      title="Ver todos los centros"
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className={styles.customDropdown}>
                    <div
                      className={styles.dropdownOption}
                      onClick={() => {
                        setFilterEst("Todos");
                        setSearchTerm("");
                        setIsOpen(false);
                        fetchPacientes(filterDNI, "Todos");
                      }}
                      style={{ 
                        fontWeight: 700, 
                        color: '#0284c7', 
                        borderBottom: '1px dashed #e2e8f0',
                        paddingBottom: '8px',
                        marginBottom: '4px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span>Todos los establecimientos</span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>
                        ({totalAbsoluto !== null ? totalAbsoluto : globalTotal} casos)
                      </span>
                    </div>

                    {filteredEsts.length === 0 ? (
                      searchTerm !== "" && (
                        <div className={styles.dropdownOption} style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                          No hay centros que coincidan
                        </div>
                      )
                    ) : (
                      filteredEsts
                        .filter((est) => est.value !== "Todos") 
                        .map((est) => (
                          <div
                            key={est.value}
                            className={styles.dropdownOption}
                            onClick={() => {
                              setFilterEst(est.value);
                              setSearchTerm(est.label);
                              setIsOpen(false);
                              fetchPacientes(filterDNI, est.value);
                            }}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}
                          >
                            <span>{est.label}</span>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap', paddingRight: '4px' }}>
                              ({est.cantidad} {est.cantidad === 1 ? 'caso' : 'casos'})
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Establecimiento Auditado</label>
                <div style={{
                  backgroundColor: '#f0f7ff',
                  border: '1px solid #e0f2fe',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#0369a1'
                }}>
                  🏢 {centroNombreOId}
                </div>
              </div>
            )}
        
          </aside>

          {/* Sección de Tabla */}
          <main className={styles.tableContainer}>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Inconsistencias Localizadas</span>
                <div className={styles.statValueContainer}>
                  <span className={`${styles.statValue} ${styles.textHighlight}`}>
                    {pacientes.length.toLocaleString('es-AR')}
                  </span>
                </div>
                <p className={styles.statSubtext}>{esPerfilGestion ? "Según filtros aplicados" : "Total de fichas a corregir"}</p>
              </div>

              <div className={styles.statCard}>
                <span className={styles.statLabel}>{esPerfilGestion ? "Total Auditables Provincial" : "Estado del Efector"}</span>
                <div className={styles.statValueContainer}>
                  <span className={styles.statValue}>
                    {esPerfilGestion ? globalTotal.toLocaleString('es-AR') : "Activo"}
                  </span>
                </div>
                <p className={styles.statSubtext}>{esPerfilGestion ? "Casos con inconsistencias" : "Monitoreo de calidad de datos"}</p>
              </div>
            </div>

            <div className={styles.tableHeader}>
              <h2 className={styles.tableTitle}>
                {esPerfilGestion ? "Listado de Auditoría Provincial" : `Panel de Calidad: ${centroNombreOId}`}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {ultimaActualizacion && (
                  <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 550 }}>
                    Datos al: {new Date(ultimaActualizacion).toLocaleDateString('es-AR')}
                  </span>
                )}
                
                {/* 👈 NUEVO: Botón de descarga Excel */}
                <button 
                  className={styles.btnRefresh} 
                  onClick={handleDescargarExcel} 
                  disabled={pacientes.length === 0}
                  style={{ backgroundColor: '#769FD3', color: 'white', borderColor: '#769FD3' }}
                  title="Descargar listado en Excel"
                >
                  <Download className="w-4 h-4" size={16} />
                </button>
                
      

                <button className={styles.btnRefresh} onClick={() => fetchPacientes()} disabled={loading}>
                  <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} size={16} />
                  {loading ? "Actualizando..." : "Actualizar"}
                </button>
              </div>
            </div>

            <div className={styles.tableResponsive}>
              <table className={styles.pacientesTable}>
                <thead>
                  <tr>
                    <th>{esPerfilGestion ? "Paciente / Establecimiento" : "Paciente / Contacto"}</th>
                    
                    {/* Corregido: cambiados los </td> por </th> */}
                    <th onClick={() => handleSort('dni')} className={styles.sortableHeader}>
                      DNI {sortConfig?.key === 'dni' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </th>
                    
                    <th onClick={() => handleSort('fecha_nacimiento')} className={styles.sortableHeader}>
                      Fecha de Nacimiento {sortConfig?.key === 'fecha_nacimiento' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </th>
                    
                    <th onClick={() => handleSort('fpp')} className={styles.sortableHeader}>
                      FPP {sortConfig?.key === 'fpp' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </th>
                    
                    <th onClick={() => handleSort('eg_actual')} className={styles.sortableHeader} style={{ textAlign: 'center' }}>
                      Edad Gestacional {sortConfig?.key === 'eg_actual' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </th>
                    
                    <th>Motivo Auditoría</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPacientes.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '3rem 1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ color: '#334155', fontSize: '1rem' }}>¡Excelente! No se localizaron inconsistencias</strong>
                          <p style={{ color: '#64748b', margin: 0, fontSize: '0.85rem' }}>
                            Este establecimiento tiene todas sus fichas obstétricas validadas y sincronizadas de forma correcta.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    sortedPacientes.map((p) => (
                      <tr key={p.id} onClick={() => setSelectedPaciente(p)} style={{ cursor: 'pointer' }}>
                        <td>
                          <div className={styles.pacienteInfo}>
                            <div className={styles.pacienteNombre}>{p.nombre}</div>
                            <div className={styles.pacienteSub}>
                              {esPerfilGestion && p.establecimiento && (
                                <span style={{ marginRight: '8px', color: '#64748b', fontWeight: 600 }}>🏢 {p.establecimiento}</span>
                              )}
                              <Phone className="w-3 h-3 text-emerald-600" size={12} style={{ display: 'inline', marginRight: '4px' }} /> 
                              {p.telefono}
                            </div>
                          </div>
                        </td>

                        <td style={{ color: '#475569', fontWeight: 500 }}>
                          {p.dni !== "S/D" ? Number(p.dni).toLocaleString('es-AR') : "S/D"}
                        </td>

                        <td style={{ color: '#475569' }}>
                          {p.fecha_nacimiento ? new Date(p.fecha_nacimiento).toLocaleDateString('es-AR') : "Sin registro"}
                        </td>

                        <td className={styles.fppCell} style={{ color: '#475569' }}>
                          {p.fpp ? new Date(p.fpp).toLocaleDateString('es-AR') : "Sin registro"}
                        </td>

                        <td style={{ color: '#475569', textAlign: 'center', fontWeight: 700 }}>
                          {p.eg_actual !== null ? `${p.eg_actual}s` : "-"}
                        </td>

                        <td className={styles.columnaMotivo}>
                          <span className={styles.badgeAlerta}>
                            {p.motivo_auditoria}
                          </span>
                        </td>

                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </main>
        </div>
      </div>
      
      {selectedPaciente && (
        <InfoPacienteModal
          paciente={selectedPaciente}
          onClose={() => setSelectedPaciente(null)}
        />
      )}
    </>
  );
}