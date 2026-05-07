"use client";
import { useState, useEffect } from "react";
import styles from "./Dashboard.module.css";
import Navbar from "@/components/Navbar";
import { Info, Filter, Search, Phone, CheckCircle2, AlertCircle, RefreshCcw } from "lucide-react";
import RegistroContactoModal from "@/components/RegistroContactoModal";
import { apiFetch } from "@/lib/api";

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

const romanToArabic = (text: string) => {
  const map: { [key: string]: string } = {
    ' XVII': ' 17', ' XVI': ' 16', ' XV': ' 15', ' XIV': ' 14', ' XIII': ' 13',
    ' XII': ' 12', ' XI': ' 11', ' IX': ' 9', ' VIII': ' 8', ' VII': ' 7',
    ' VI': ' 6', ' IV': ' 4', ' V': ' 5', ' III': ' 3', ' II': ' 2', ' I': ' 1',
    ' Nº ': ' Nº ', ' No ': ' Nº ' // Normaliza el símbolo de número
  };

  let newText = text;
  // Reemplazamos cada ocurrencia romana por su número
  Object.keys(map).forEach(key => {
    // Usamos regex para asegurar que el número romano esté aislado (evita errores en palabras)
    const regex = new RegExp(`${key}(\\b|\\s|$)`, 'g');
    newText = newText.replace(regex, `${map[key]}$1`);
  });

  return newText;
};

export default function SeguimientoPage() {
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [establecimientos, setEstablecimientos] = useState<{value: string, label: string}[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Estados para los filtros (Como Tony)
  const [filterDni, setFilterDni] = useState("");
  const [filterEst, setFilterEst] = useState("Todos");
  const [filterRiesgo, setFilterRiesgo] = useState("Si");
  const [filterDias, setFilterDias] = useState("30");
  const [filterFppDesde, setFilterFppDesde] = useState("");
  const [filterFppHasta, setFilterFppHasta] = useState("");
  const [totalGlobal, setTotalGlobal] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Filtramos la lista de establecimientos según lo que el usuario escribe
  const filteredEsts = establecimientos.filter(est =>
    est.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Modal de Contacto
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);

  // Carga inicial
  useEffect(() => {
    fetchFiltros();
    fetchPacientes();
  }, []);

  // Nuevos estados para el Autocomplete
  const [sugerencias, setSugerencias] = useState<any[]>([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);

  // Función para buscar sugerencias (sin filtros, a toda la base)
  const fetchSugerencias = async (busqueda: string) => {
    // Si borra el texto, ocultamos la lista
    if (busqueda.length < 1) {
      setSugerencias([]);
      setMostrarSugerencias(false); // <--- Agregá esto
      return;
    }
    
    try {
      const res = await apiFetch(`/pacientes/sugerencias?q=${busqueda}`);
      
      // Si la API responde bien (200), procesamos
      if (res.ok) {
        const data = await res.json();
        setSugerencias(data);
        setMostrarSugerencias(true);
      } else {
        setMostrarSugerencias(false);
      }
    } catch (error) {
      console.error("Error en sugerencias");
      setMostrarSugerencias(false);
    }
  };

  const seleccionarPaciente = (dni: string) => {
    setFilterDni(dni);
    setMostrarSugerencias(false);
    
    // Al seleccionar una sugerencia, forzamos la búsqueda exacta
    fetchPacientes(dni, true); 
  };

  const fetchFiltros = async () => {
    try {
      const res = await apiFetch("/filtros");
      const data = await res.json();
      
      // Mapeamos los establecimientos para unificar sus nombres
      const estsUnificados = data.map((est: {value: string, label: string}) => ({
        ...est,
        label: romanToArabic(est.label) // <--- Aplicamos la limpieza aquí
      }));
  
      setEstablecimientos(estsUnificados);
    } catch (error) {
      console.error("Error cargando establecimientos");
    }
  };

  const fetchPacientes = async (dniDirecto?: string, esExacto: boolean = false) => {
    setLoading(true);
    try {
      const dniABuscar = dniDirecto !== undefined ? dniDirecto : filterDni;
      const queryParams: any = {
        dni: dniABuscar,
        establecimiento: filterEst,
        riesgo: filterRiesgo,
        dias: filterDias
      };

      // Si es una búsqueda exacta por DNI, agregamos el flag para el backend
      if (esExacto || (dniABuscar && dniABuscar.length > 7)) {
        queryParams.exact = "true";
      }

      if (filterFppDesde) queryParams.fppDesde = filterFppDesde;
      if (filterFppHasta) queryParams.fppHasta = filterFppHasta;

      const query = new URLSearchParams(queryParams);
      const res = await apiFetch(`/pacientes?${query}`);
      const data = await res.json();
      
      setPacientes(data.data || []);
      setTotalGlobal(data.totalGlobal || 0);
    } catch (error) {
      console.error("Error al obtener pacientes:", error);
    } finally {
      setLoading(false);
    }
  };

  const sortedPacientes = [...pacientes].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    // Lógica para manejar fechas o números
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });
  

  return (
    <>
      <Navbar />
      <div className={styles.container}>
        <div className={styles.mainGrid}>
          {/* Panel Lateral de Filtros */}
          <aside className={styles.filterCard}>
            <div className={styles.filterHeader}>
              <Filter className="w-4 h-4" />
              <span>Filtros de Búsqueda</span>
            </div>

            <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Buscar por DNI</label>
            <div className={styles.autocompleteWrapper}>
              <div className={styles.searchWrapper}>
                <Search className={styles.searchIcon} />
                <input 
                  type="text" 
                  placeholder="DNI de la paciente..." 
                  className={styles.searchInput}
                  value={filterDni}
                  onChange={(e) => {
                    setFilterDni(e.target.value);
                    fetchSugerencias(e.target.value);
                  }}
                />
              </div>

              {/* Lista Desplegable de Sugerencias */}
              {mostrarSugerencias && sugerencias.length > 0 && (
                <ul className={styles.suggestionList}>
                  {sugerencias.map((s) => (
                    <li key={s.dni} onClick={() => seleccionarPaciente(s.dni)}>
                      <span className={styles.suggestDni}>{s.dni}</span>
                      <span className={styles.suggestNombre}>{s.nombre}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className={styles.filterGroup} style={{ position: 'relative' }}>
            <label className={styles.filterLabel}>Establecimiento</label>
            
            <input
              type="text"
              className={styles.selectInput}
              placeholder="Buscar establecimiento..."
              value={isOpen ? searchTerm : romanToArabic(establecimientos.find(e => e.value === filterEst)?.label || "Todos los Centros")}
              onFocus={() => { setIsOpen(true); setSearchTerm(""); }}
              onChange={(e) => setSearchTerm(e.target.value)}
              onBlur={() => setTimeout(() => setIsOpen(false), 200)} // Delay para permitir el click en la opción
            />

            {isOpen && (
              <div className={styles.customDropdown}>
                <div 
                  className={styles.dropdownOption} 
                  onClick={() => { setFilterEst("Todos"); setIsOpen(false); }}
                >
                  Todos los Centros
                </div>
                {filteredEsts.map(est => (
                  <div 
                    key={est.value} 
                    className={styles.dropdownOption}
                    onClick={() => {
                      setFilterEst(est.value);
                      setSearchTerm(romanToArabic(est.label));
                      setIsOpen(false);
                    }}
                  >
                    {est.label}
                  </div>
                ))}
              </div>
            )}
          </div>
            
            <div className={styles.filterGroup}>
              <div className={styles.labelWithTooltip}>
                <label className={styles.filterLabel}>Riesgo</label>
                <div className={styles.tooltipContainer}>
                  <Info size={14} className={styles.infoIcon} />
                  <span className={styles.tooltipText}>
                    Muestra pacientes con derivación y/o factores de riesgo cargados.
                  </span>
                </div>
              </div>
              <select 
                className={styles.selectInput}
                value={filterRiesgo}
                onChange={(e) => setFilterRiesgo(e.target.value)}
              >
                <option value="Si">Si</option>
                <option value="Todas">Todas</option>
              </select>
            </div>
            
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Días sin Control</label>
              <select 
                className={styles.selectInput}
                value={filterDias}
                onChange={(e) => setFilterDias(e.target.value)}
              >
                <option value="30">+ 30 días</option>
                <option value="60">+ 60 días</option>
                <option value="90">+ 90 días</option>
                <option value="0">Ver todas</option>
              </select>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>FPP Desde</label>
              <input 
                type="date" 
                className={styles.searchInput}
                value={filterFppDesde}
                onChange={(e) => setFilterFppDesde(e.target.value)}
              />
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>FPP Hasta</label>
              <input 
                type="date" 
                className={styles.searchInput}
                value={filterFppHasta}
                onChange={(e) => setFilterFppHasta(e.target.value)}
              />
            </div>

              <button 
              className={styles.btnAction} 
              style={{ width: '100%', marginTop: '1rem' }}
              onClick={() => fetchPacientes()}
            >
              Aplicar Filtros
            </button>
          </aside>

          {/* Sección de Tabla */}
          <main className={styles.tableContainer}>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Pacientes Encontradas</span>
              <div className={styles.statValueContainer}>
                <span className={`${styles.statValue} ${styles.textHighlight}`}>
                  {pacientes.length.toLocaleString('es-AR')}
                </span>
              </div>
              <p className={styles.statSubtext}>Según filtros aplicados</p>
            </div>

            <div className={styles.statCard}>
              <span className={styles.statLabel}>Total en Padrón</span>
              <div className={styles.statValueContainer}>
                <span className={styles.statValue}>
                  {totalGlobal.toLocaleString('es-AR')}
                </span>
              </div>
              <p className={styles.statSubtext}>Base de datos consolidada</p>
            </div>
          </div>

          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>  Listado de Seguimiento</h2>
            <button 
              className={styles.btnRefresh}
              onClick={() => fetchPacientes()}
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
                    <th className={styles.sortableHeader}>Paciente</th>
                    
                    <th onClick={() => handleSort('dni')} className={styles.sortableHeader}>
                      <div className={styles.headerContent}>
                        <span>DNI</span>
                        <span className={styles.sortIcon}>
                          {sortConfig.key === 'dni' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th onClick={() => handleSort('fpp')} className={styles.sortableHeader}>
                      <div className={styles.headerContent}>
                        <span>FPP</span>
                        <span className={styles.sortIcon}>
                          {sortConfig.key === 'fpp' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th onClick={() => handleSort('ult_control')} className={styles.sortableHeader}>
                      <div className={styles.headerContent}>
                        <span>Último Control</span>
                        <span className={styles.sortIcon}>
                          {sortConfig.key === 'ult_control' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th onClick={() => handleSort('dias')} className={styles.sortableHeader}>
                      <div className={styles.headerContent}>
                        <span>Días sin Control</span>
                        <span className={styles.sortIcon}>
                          {sortConfig.key === 'dias' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>
                    
                    <th className={styles.sortableHeader}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                        Cargando base de datos Gold...
                      </td>
                    </tr>
                  ) : sortedPacientes.length > 0 ? (
                    sortedPacientes.map((p) => (
                      <tr key={p.id} 
                            onDoubleClick={() => setSelectedPaciente(p)} // <--- DOBLE CLIC AQUÍ
                      >
                        <td>
                          <div className={styles.pacienteInfo}>
                            <div className={styles.pacienteNombre}>{p.nombre}</div>
                            <div className={styles.pacienteSub}>
                              <Phone className="w-3 h-3 text-emerald-600" /> {p.telefono}
                            </div>
                          </div>
                        </td>
                        <td style={{ color: '#475569' }}>
                          {p.dni ? Number(p.dni).toLocaleString('es-AR') : "-"}
                        </td>
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
      
      {/* Modal de Contacto */}
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
    </>
  );
}