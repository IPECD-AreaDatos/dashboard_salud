"use client";
import { useState, useEffect } from "react";
import styles from "./Dashboard.module.css";
import Navbar from "@/components/Navbar";
import { Search, Filter, Phone, CheckCircle2, AlertCircle, RefreshCcw } from "lucide-react";

interface Paciente {
  id: number;
  dni: string;
  nombre: string;
  telefono: string;
  fpp: string;
  ult_control: string;
  dias: number;
  contactada: string;
}

export default function SeguimientoPage() {
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [establecimientos, setEstablecimientos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para los filtros (Como Tony)
  const [filterDni, setFilterDni] = useState("");
  const [filterEst, setFilterEst] = useState("Todos");
  const [filterDias, setFilterDias] = useState("30");

  // Carga inicial
  useEffect(() => {
    fetchFiltros();
    fetchPacientes();
  }, []);

  const fetchFiltros = async () => {
    try {
      const res = await fetch("/api/filtros");
      const data = await res.json();
      setEstablecimientos(data);
    } catch (error) {
      console.error("Error cargando establecimientos");
    }
  };

  const fetchPacientes = async () => {
    setLoading(true);
    try {
      // Pasamos los filtros reales a la API
      const query = new URLSearchParams({
        dni: filterDni,
        establecimiento: filterEst,
        dias: filterDias
      });
      
      const res = await fetch(`/api/pacientes?${query}`);
      if (!res.ok) throw new Error("Error en la carga");
      const data = await res.json();
      setPacientes(data);
    } catch (error) {
      console.error("Error al obtener pacientes:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.titleArea}>
            <h1>Seguimiento de Pacientes</h1>
            <p>Gestión de alertas obstétricas de alto riesgo.</p>
          </div>
          <button 
            className={styles.btnRefresh}
            onClick={fetchPacientes}
            disabled={loading}
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? "Actualizando..." : "Actualizar Datos"}
          </button>
        </header>

        <div className={styles.mainGrid}>
          {/* Panel Lateral de Filtros */}
          <aside className={styles.filterCard}>
            <div className={styles.filterHeader}>
              <Filter className="w-4 h-4" />
              <span>Filtros de Búsqueda</span>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Buscar por DNI</label>
              <div className={styles.searchWrapper} style={{maxWidth: '100%'}}>
                <Search className={styles.searchIcon} />
                <input 
                  type="text" 
                  placeholder="DNI de la paciente..." 
                  className={styles.searchInput}
                  value={filterDni}
                  onChange={(e) => setFilterDni(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchPacientes()}
                />
              </div>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Establecimiento</label>
              <select 
                className={styles.selectInput}
                value={filterEst}
                onChange={(e) => setFilterEst(e.target.value)}
              >
                <option value="Todos">Todos los Centros</option>
                {establecimientos.map(est => (
                  <option key={est} value={est}>{est}</option>
                ))}
              </select>
            </div>
            
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Días sin Control</label>
              <select 
                className={styles.selectInput}
                value={filterDias}
                onChange={(e) => setFilterDias(e.target.value)}
              >
                <option value="30">{">"} 30 días</option>
                <option value="60">{">"} 60 días</option>
                <option value="90">{">"} 90 días</option>
                <option value="0">Ver todas</option>
              </select>
            </div>

            <button 
              className={styles.btnAction} 
              style={{ width: '100%', marginTop: '1rem' }}
              onClick={fetchPacientes}
            >
              Aplicar Filtros
            </button>
          </aside>

          {/* Sección de Tabla */}
          <main className={styles.tableContainer}>
            <div className={styles.tableHeader}>
              <span className={styles.counterBadge}>
                {pacientes.length} Pacientes encontradas
              </span>
            </div>

            <div className={styles.tableResponsive}>
              <table className={styles.pacientesTable}>
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>DNI</th>
                    <th>FPP</th>
                    <th>Últ. Control</th>
                    <th>Días S/C</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                        Cargando base de datos Gold...
                      </td>
                    </tr>
                  ) : pacientes.length > 0 ? (
                    pacientes.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className={styles.pacienteInfo}>
                            <div className={styles.pacienteNombre}>{p.nombre}</div>
                            <div className={styles.pacienteSub}>
                              <Phone className="w-3 h-3 text-emerald-600" /> {p.telefono}
                            </div>
                          </div>
                        </td>
                        <td style={{ color: '#475569' }}>{p.dni}</td>
                        <td className={styles.fppCell}>
                          {p.fpp ? new Date(p.fpp).toLocaleDateString('es-AR') : "-"}
                        </td>
                        <td style={{ color: '#475569' }}>
                          {p.ult_control ? new Date(p.ult_control).toLocaleDateString('es-AR') : "-"}
                        </td>
                        <td>
                          <span className={styles.diasAtraso} style={{ 
                            color: p.dias > 60 ? '#dc2626' : (p.dias > 30 ? '#ea580c' : '#1e293b') 
                          }}>
                            {p.dias === 999 ? "S/D" : p.dias}
                          </span>
                        </td>
                        <td>
                          {p.contactada && (
                            <span className={styles.badgeContactada}>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Contactada
                            </span>
                          )}
                        </td>
                        <td>
                          <button 
                            className={styles.btnAction}
                            onClick={() => alert(`Iniciando seguimiento para: ${p.nombre}`)}
                          >
                            REGISTRAR
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                        <AlertCircle className="w-8 h-8 text-orange-400 mx-auto mb-2" />
                        No se encontraron registros para estos filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}