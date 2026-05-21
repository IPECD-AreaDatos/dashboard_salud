/*src/app/dashboard/audit/page.tsx*/
"use client";
import { useState, useEffect, useMemo } from "react";
import styles from "../Dashboard.module.css";
import Navbar from "@/components/Navbar";
import { Info, Search, Phone, ShieldAlert, RefreshCcw, Filter } from "lucide-react";
import RegistroContactoModal from "@/components/RegistroContactoModal";
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
  ult_control: string;
  establecimiento: string;
  dias: number;
  motivo_auditoria: string;
  fecha_ultimo_contacto: string | null;
}

export default function AuditPage() {
  const { data: session } = useSession();
  
  const [pacientes, setPacientes] = useState<PacienteAuditoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [globalTotal, setGlobalTotal] = useState(0);

  // Estados para manejar el criterio y la dirección del ordenamiento
  const [sortConfig, setSortConfig] = useState<{ key: 'dni' | 'fpp' | 'ult_control'; direction: 'asc' | 'desc' } | null>(null);

  // Filtros
  const [filterDNI, setFilterDNI] = useState("");
  const [filterEst, setFilterEst] = useState("Todos");
  
  const [establecimientos, setEstablecimientos] = useState<{label: string, value: string, sisa?: string}[]>([]);

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
      setPacientes(resData.data || []);
      setGlobalTotal(resData.totalGlobal || 0);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFiltros = async () => {
    try {
      const response = await apiFetch("/filtros");
      if (!response.ok) throw new Error("Error fetching filtros");
      const data = await response.json();
      setEstablecimientos(data.establecimientos || []);
    } catch (error) {
      console.error("Error obteniendo filtros:", error);
    }
  };

  useEffect(() => {
    fetchFiltros();
    fetchPacientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    fetchPacientes();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Sin registro";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Sin registro";
    return date.toLocaleDateString("es-AR", { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

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

  const handleSort = (key: 'dni' | 'fpp' | 'ult_control') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  // FIX REALIZADO AQUÍ: Se eliminó 'React.' para usar directamente 'useMemo'
  const sortedPacientes = useMemo(() => {
    let sortablePacientes = [...pacientes];
    if (sortConfig !== null) {
      sortablePacientes.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
  
        // Tratamiento para valores nulos o S/D (los mandamos al final)
        if (!aVal || aVal === "S/D") return 1;
        if (!bVal || bVal === "S/D") return -1;
  
        // Si es fecha, convertimos a objeto Date para comparar correctamente
        if (sortConfig.key === 'fpp' || sortConfig.key === 'ult_control') {
          return sortConfig.direction === 'asc' 
            ? new Date(aVal).getTime() - new Date(bVal).getTime()
            : new Date(bVal).getTime() - new Date(aVal).getTime();
        }
  
        // Si es DNI (orden alfanumérico)
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
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h1>Auditoría de Inconsistencias</h1>
            <p>Supervisión de embarazos con datos faltantes, controles atrasados o FPP vencidas.</p>
          </div>
        </div>

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

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Establecimiento</label>
              <select
                value={filterEst}
                onChange={(e) => {
                  setFilterEst(e.target.value);
                  fetchPacientes(filterDNI, e.target.value);
                }}
                className={styles.selectInput}
              >
                <option value="Todos">Todos los establecimientos</option>
                {establecimientos.map((est) => (
                  <option key={est.value} value={est.value}>
                    {est.label}
                  </option>
                ))}
              </select>
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
                <p className={styles.statSubtext}>Casos totales con inconsistencias</p>
              </div>
            </div>

            <div className={styles.tableHeader}>
              <h2 className={styles.tableTitle}>
                Listado de Auditoría
              </h2>
              <button
                className={styles.btnRefresh}
                onClick={handleRefresh}
                disabled={loading}
              >
                <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? "Actualizando..." : "Actualizar"}
              </button>
            </div>

            <div className={styles.tableResponsive}>
              <table className={styles.pacientesTable}>
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th onClick={() => handleSort('dni')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      DNI {sortConfig?.key === 'dni' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </th>
                    <th onClick={() => handleSort('fpp')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      FPP {sortConfig?.key === 'fpp' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </th>
                    <th onClick={() => handleSort('ult_control')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Último Control {sortConfig?.key === 'ult_control' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                    </th>
                    <th>Motivo Auditoría</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                        Buscando anomalías...
                      </td>
                    </tr>
                  ) : sortedPacientes.length > 0 ? (
                    sortedPacientes.map((p) => (
                      <tr key={p.id} onClick={() => setSelectedPaciente(p)}>
                        <td>
                          <div className={styles.pacienteInfo}>
                            <div className={styles.pacienteNombre}>{p.nombre}</div>
                            <div className={styles.pacienteSub}>
                              <Phone className="w-3 h-3 text-emerald-600" /> {p.telefono}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                              {p.establecimiento}
                            </div>
                          </div>
                        </td>
                        <td style={{ color: '#475569', fontWeight: 600 }}>{p.dni}</td>
                        <td>
                          <span className={styles.fppCell}>{formatDate(p.fpp)}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 500, color: '#334155' }}>
                              {formatDate(p.ult_control)}
                            </span>
                            {p.dias !== 999 && p.dias > 0 && (
                              <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 700 }}>
                                Hace {p.dias} días
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#dc2626', fontWeight: 700, fontSize: '0.8rem', backgroundColor: '#fef2f2', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fecaca' }}>
                            <ShieldAlert size={14} />
                            {p.motivo_auditoria}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                          <Info size={40} color="#cbd5e1" />
                          <p>No se encontraron anomalías con los filtros actuales.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </main>
        </div>

        {/* Modal Reutilizado */}
        {selectedPaciente && (
          <RegistroContactoModal
            paciente={selectedPaciente}
            onClose={() => setSelectedPaciente(null)}
            onSuccess={() => {
                setSelectedPaciente(null);
                fetchPacientes();
            }}
          />
        )}
      </div>

      {/* Logos institucionales fijos en la esquina */}
      <div className={styles.fixedLogos}>
        <Image 
          src={logoColorImg} 
          alt="Modernización" 
          className={styles.sidebarLogo}
          style={{ height: '35px', width: 'auto' }}
        />
        <div className={styles.verticalDivider}></div>
        <Image 
          src={logoSaludImg} 
          alt="Salud Pública" 
          className={styles.sidebarLogo}
          style={{ height: '35px', width: 'auto' }}
        />
      </div>
    </>
  );
}