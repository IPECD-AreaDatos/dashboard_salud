/*src/app/dashboard/audit/page.tsx*/
"use client";
import { useState, useEffect, useMemo } from "react";
import styles from "../Dashboard.module.css"; // 👈 Unificamos el estilo delicado aquí
import Navbar from "@/components/Navbar";
import { Info, Search, Phone, RefreshCcw, Filter, X } from "lucide-react";
import InfoPacienteModal from "@/components/InfoPacienteModal";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

import Image from "next/image";
import logoColorImg from "../../../../public/logo_color.png";
import logoSaludImg from "../../../../public/Logo_Salud_Publica_colorH.png";

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
  /* 👈 NUEVOS CAMPOS AGREGADOS AL TIPADO DEL FRONT */
  edad: number | null;
  fuente_limpia: string;
  lote: string;
}

export default function AuditPage() {
  const { data: session } = useSession();
  
  const [pacientes, setPacientes] = useState<PacienteAuditoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [globalTotal, setGlobalTotal] = useState(0);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null); // 👈 NUEVO ESTADO

  // Estados para manejar el criterio y la dirección del ordenamiento
  const [sortConfig, setSortConfig] = useState<{ key: 'dni' | 'fpp' | 'fecha_nacimiento' | 'eg_actual'; direction: 'asc' | 'desc' } | null>(null);
  // Filtros
  const [filterDNI, setFilterDNI] = useState("");
  const [filterEst, setFilterEst] = useState("Todos");
  
  // Estados para el Autocomplete dinámico de Auditoría
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Modal
  const [selectedPaciente, setSelectedPaciente] = useState<PacienteAuditoria | null>(null);

  const fetchPacientes = async (
    dniVal = filterDNI,
    estVal = filterEst
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dniVal) params.append("dni", dniVal);
      if (estVal && estVal !== "Todos") params.append("establecimiento", estVal);

      const response = await apiFetch(`/auditoria?${params.toString()}`);
      if (!response.ok) throw new Error("Error fetching data");

      const resData = await response.json();
      const listaPacientes = resData.data || [];

      setPacientes(resData.data || []);
      setGlobalTotal(resData.totalGlobal || 0);
      setUltimaActualizacion(resData.ultimaActualizacion || null);

      // 👈 NUEVO: Guardamos la lista completa de CAPS SOLO si navegamos en el listado general ("Todos")
      if (estVal === "Todos") {
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

  // 👈 CONSERVAMOS SOLO EL STATE (Línea 116):
  const [establecimientosConCasos, setEstablecimientosConCasos] = useState<{label: string, value: string, cantidad: number}[]>([]);

  // El filtrado por tipeo de la lista congelada
  const filteredEsts = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return establecimientosConCasos.filter(est => 
      est.label.toLowerCase().includes(searchLower)
    );
  }, [establecimientosConCasos, searchTerm]);
  
  useEffect(() => {
    fetchPacientes();
  }, []);

  if (session && session.user?.role !== 'Administrador' && session.user?.role !== 'Coordinador' && session.user?.name !== 'admin') {
    return (
      <>
        <Navbar />
        <div className={styles.container}>
          <h2 style={{ textAlign: 'center', marginTop: '3rem' }}>Acceso Denegado</h2>
        </div>
      </>
    );
  }

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
  
        // Tratamiento universal para valores nulos, vacíos o "S/D" (siempre al fondo)
        if (aVal === null || aVal === undefined || aVal === "S/D" || aVal === "-") return 1;
        if (bVal === null || bVal === undefined || bVal === "S/D" || bVal === "-") return -1;
  
        // 1. ORDENAMIENTO DE FECHAS (FPP y Fecha de Nacimiento)
        if (sortConfig.key === 'fpp' || sortConfig.key === 'fecha_nacimiento') {
          return sortConfig.direction === 'asc' 
            ? new Date(aVal).getTime() - new Date(bVal).getTime()
            : new Date(bVal).getTime() - new Date(aVal).getTime();
        }
  
        // 2. ORDENAMIENTO NUMÉRICO / DECIMAL (Edad Gestacional actual de Stage)
        if (sortConfig.key === 'eg_actual') {
          return sortConfig.direction === 'asc'
            ? Number(aVal) - Number(bVal)
            : Number(bVal) - Number(aVal);
        }
  
        // 3. ORDENAMIENTO ALFANUMÉRICO (DNI)
        return sortConfig.direction === 'asc'
          ? String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
          : String(bVal).localeCompare(String(aVal), undefined, { numeric: true });
      });
    }
    return sortablePacientes;
  }, [pacientes, sortConfig]);

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

            <div className={styles.filterGroup} style={{ position: 'relative' }}>
              <label className={styles.filterLabel}>Establecimiento</label>

              <div className={styles.selectWrapper}>
                <input
                  type="text"
                  className={styles.selectInput}
                  placeholder="Buscar establecimiento..."
                  style={filterEst !== "Todos" ? { paddingRight: '2.2rem' } : undefined}
                  // Si está abierto muestra el término de búsqueda; si está cerrado muestra el centro seleccionado o "Todos"
                  value={isOpen ? searchTerm : (filterEst === "Todos" ? `Todos los establecimientos (${pacientes.length})` : filterEst)}
                  onFocus={() => { setIsOpen(true); setSearchTerm(""); }}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onBlur={() => setTimeout(() => setIsOpen(false), 200)} // Delay seguro para registrar el clic de las opciones
                />
                
                {/* Botón X minimalista para restablecer el filtro rápido */}
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

              {/* Lista desplegable flotante con scroll y sombreado elegante */}
              {isOpen && (
                <div className={styles.customDropdown}>
                  {filteredEsts.length === 0 ? (
                    <div className={styles.dropdownOption} style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                      No hay centros con inconsistencias que coincidan
                    </div>
                  ) : (
                    filteredEsts.map((est) => (
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
                        {/* El nombre del establecimiento hereda el estilo nativo */}
                        <span> {est.label}</span>
                        
                        {/* 👈 MODIFICADO: Estilo idéntico a seguimiento, ultra sutil, gris y sin fondo */}
                        <span style={{ 
                          fontSize: '0.75rem', 
                          color: '#64748b', // Slate 500, el gris delicado que usás en las subs
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          paddingRight: '4px'
                        }}>
                          ({est.cantidad} {est.cantidad === 1 ? 'caso' : 'casos'})
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            
            <button 
                className={styles.btnAction} 
                onClick={() => fetchPacientes(filterDNI, filterEst)}
                style={{ width: '100%', marginTop: '1rem' }}
            >
              Aplicar Filtros
            </button>
          </aside>

          {/* Sección de Tabla */}
          <main className={styles.tableContainer}>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Embarazadas Encontradas</span>
                <div className={styles.statValueContainer}>
                  <span className={`${styles.statValue} ${styles.textHighlight}`}>
                    {pacientes.length.toLocaleString('es-AR')}
                  </span>
                </div>
                <p className={styles.statSubtext}>Según filtros aplicados</p>
              </div>

              <div className={styles.statCard}>
                <span className={styles.statLabel}>Total Auditables</span>
                <div className={styles.statValueContainer}>
                  <span className={styles.statValue}>
                    {globalTotal.toLocaleString('es-AR')}
                  </span>
                </div>
                <p className={styles.statSubtext}>Casos con inconsistencias</p>
              </div>
            </div>

            <div className={styles.tableHeader}>
              <h2 className={styles.tableTitle}>Listado de Auditoría</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {ultimaActualizacion && (
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    Datos al: {new Date(ultimaActualizacion).toLocaleDateString('es-AR')}
                  </span>
                )}
                <button className={styles.btnRefresh} onClick={() => fetchPacientes()} disabled={loading}>
                  <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? "Actualizando..." : "Actualizar"}
                </button>
              </div>
            </div>

            {/* Render de Tabla Nativa Delicada */}
            <div className={styles.tableResponsive}>
              <table className={styles.pacientesTable}>
                <thead>
                  <tr>
                    <th>Paciente / Establecimiento</th>
                    <th onClick={() => handleSort('dni')} className={styles.sortableHeader}>
                      DNI {sortConfig?.key === 'dni' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </th>
                    {/* 👈 NUEVO: Clasp interactivo para Fecha de Nacimiento */}
                    <th onClick={() => handleSort('fecha_nacimiento')} className={styles.sortableHeader}>
                      Fecha de Nacimiento {sortConfig?.key === 'fecha_nacimiento' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </th>

                    <th onClick={() => handleSort('fpp')} className={styles.sortableHeader}>
                      FPP {sortConfig?.key === 'fpp' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </th>

                    {/* 👈 NUEVO: Clasp interactivo para Edad Gestacional */}
                    <th onClick={() => handleSort('eg_actual')} className={styles.sortableHeader} style={{ textAlign: 'center' }}>
                      Edad Gestacional {sortConfig?.key === 'eg_actual' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </th>
                    <th>Motivo Auditoría</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPacientes.map((p) => (
                    <tr key={p.id} onClick={() => setSelectedPaciente(p)}>
                      <td>
                        <div className={styles.pacienteInfo}>
                          <div className={styles.pacienteNombre}>{p.nombre}</div>
                          
                          {/* Teléfono con ícono de Lucide */}
                          <div className={styles.pacienteSub}>
                            <Phone className="w-3 h-3 text-emerald-600" size={12} /> {p.telefono}
                          </div>
                        
                        </div>
                      </td>
                      <td style={{ color: '#475569', fontWeight: 500 }}>
                        {p.dni !== "S/D" ? Number(p.dni).toLocaleString('es-AR') : "S/D"}
                      </td>
                      <td style={{ color: '#475569' }}>
                        {p.fecha_nacimiento ? new Date(p.fecha_nacimiento).toLocaleDateString('es-AR') : "Sin registro"}
                      </td>
                      <td className={styles.fppCell}>
                        {p.fpp ? new Date(p.fpp).toLocaleDateString('es-AR') : "Sin registro"}
                      </td>
                      <td style={{ color: '#475569', textAlign: 'center', fontWeight: 700 }}>
                        {p.eg_actual !== null ? `${p.eg_actual}s` : "-"}
                      </td>
                      <td>
                        <span style={{
                          background: '#fef2f2',
                          color: '#ef4444',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 550,
                          border: '1px solid #fee2e2'
                        }}>
                          {p.motivo_auditoria}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </main>
        </div>
      </div>
      {/* 👈 NUEVO MODAL DE LECTURA */}
      {selectedPaciente && (
        <InfoPacienteModal
          paciente={selectedPaciente}
          onClose={() => setSelectedPaciente(null)}
        />
      )}
    </>
  );
}