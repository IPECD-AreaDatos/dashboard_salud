/*src/app/dashboard/page.tsx*/
"use client";
import { useState, useEffect } from "react";
import { registrarLog } from "@/lib/analytics";
import styles from "./Dashboard.module.css";
import Navbar from "@/components/Navbar";
import { Info, Filter, Search, Phone, CheckCircle2, AlertCircle, RefreshCcw, X } from "lucide-react";
import RegistroContactoModal from "@/components/RegistroContactoModal";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import Image from "next/image";
import logoColorImg from "../../../public/logo_color.png";
import logoSaludImg from "../../../public/Logo_Salud_Publica_colorH.png";

interface Paciente {
  id: number;
  dni: string;
  nombre: string;
  telefono: string;
  fpp: string;
  ult_control: string;
  dias: number;
  // Cambiamos 'contactada' por el dato real que traeremos de la tabla seguimientos
  fecha_ultimo_contacto: string | null;
  dias_sin_contacto: number;
  fuente_principal: string;
  eg_actual: number | null;
  establecimiento: string;
  nombre_centro_derivado?: string | null;
  derivacion_maternidad_id?: string | null;
  cuie_seguimiento?: string | null;
  fecha_proximo_turno: string | null;
  dias_para_turno: number;
}

// Función helper para calcular la diferencia de días
const calcularDiasSinContacto = (fechaContacto: string) => {
  if (!fechaContacto || fechaContacto === "null") return 999; // Caso nunca contactada
  const inicio = new Date(fechaContacto);
  const hoy = new Date();
  const diferencia = hoy.getTime() - inicio.getTime();
  return Math.floor(diferencia / (1000 * 60 * 60 * 24));
};

const getSemaforoClass = (dias: number, eg: number | null) => {
  if (dias === 999) return styles.semaforoGris;
  
  // EG >= 38 semanas: control cada 7 días
  if (eg !== null && eg >= 38) {
    if (dias > 15) return styles.semaforoRojo;
    if (dias > 7)  return styles.semaforoAmarillo;
    return styles.semaforoVerde;
  }
  
  // EG 32-37 semanas: control cada 15 días
  if (eg !== null && eg >= 32) {
    if (dias > 30) return styles.semaforoRojo;
    if (dias > 15) return styles.semaforoAmarillo;
    return styles.semaforoVerde;
  }
  
  // EG < 32 semanas (o sin dato): control mensual
  if (dias > 60) return styles.semaforoRojo;
  if (dias > 30) return styles.semaforoAmarillo;
  return styles.semaforoVerde;
};

// 👈 NUEVA FUNCIÓN: Semáforo invertido para alertas de proximidad de turnos
const getSemaforoTurnoClass = (dias: number) => {
  if (dias === 999) return styles.semaforoGris;
  if (dias < 3) return styles.semaforoRojo;       // Menos de 3 días: ¡Crítico / Inminente!
  if (dias <= 7) return styles.semaforoAmarillo;  // Entre 3 y 7 días: Próximo
  return styles.semaforoVerde;                    // Más de 7 días: Programado con tiempo
};

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
  const { data: session } = useSession();
  const userRole = session?.user?.role;
  const isRestrictedRole = userRole === 'Centro de Salud' || userRole === 'Maternidad';

  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [establecimientos, setEstablecimientos] = useState<{ value: string, label: string, sisa?: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [sortConfig, setSortConfig] = useState<{ key: keyof Paciente | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });

  const handleSort = (key: keyof Paciente) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(null);
  // Estados para los filtros (Como Tony)
  const [filterDni, setFilterDni] = useState("");
  const [filterEst, setFilterEst] = useState("Todos");
  const [filterRiesgo, setFilterRiesgo] = useState("Si");
  const [filterDias, setFilterDias] = useState("30");
  const [filterTrimestre, setFilterTrimestre] = useState("Todos"); 
  const [aplicadoTrimestre, setAplicadoTrimestre] = useState("Todos");
  
  // Estados que reflejan lo que REALMENTE está aplicado (se actualizan solo al presionar Aplicar)
  const [aplicadoRiesgo, setAplicadoRiesgo] = useState("Si");
  const [aplicadoDias, setAplicadoDias] = useState("30");

  const [totalGlobal, setTotalGlobal] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Filtramos la lista de establecimientos según lo que el usuario escribe
  const filteredEsts = establecimientos.filter(est => {
    const searchLower = searchTerm.toLowerCase();
    return (
      est.label.toLowerCase().includes(searchLower) ||
      (est.value && est.value.toLowerCase().includes(searchLower)) ||
      (est.sisa && est.sisa.toLowerCase().includes(searchLower))
    );
  });

  // Modal de Contacto
  const [selectedPaciente, setSelectedPaciente] = useState<Paciente | null>(null);

  // Solo activo para Centro de Salud, por defecto excluye derivadas
  const [excluirDerivadas, setExcluirDerivadas] = useState(true);

  // Carga inicial
  useEffect(() => {
    fetchFiltros();
    fetchPacientes(undefined, false, undefined, "Todos", "Si", "30", undefined, true);
    // 👈 NUEVO: Logea que el centro o el administrador entró a la grilla de seguimiento
    registrarLog({ modulo: "Seguimiento", accion: "VISUALIZAR_LISTADO" });
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

    // Reseteamos el formulario de filtros
    setFilterRiesgo("Todas");
    setFilterDias("0");

    // Reseteamos las etiquetas del resumen
    setAplicadoRiesgo("Todas");
    setAplicadoDias("0");

    fetchPacientes(dni, true);
  };

  // Limpia el campo DNI, cierra el dropdown de sugerencias y relanza la búsqueda
  const limpiarDni = () => {
    setFilterDni("");
    setSugerencias([]);
    setMostrarSugerencias(false);

    // Restauramos estado del formulario
    setFilterRiesgo("Si");
    setFilterDias("30");
    setFilterTrimestre("Todos");

    // Restauramos etiquetas del resumen
    setAplicadoRiesgo("Si");
    setAplicadoDias("30");
    setAplicadoTrimestre("Todos");

    // Pasamos los valores directo para no depender del estado que aún no se actualizó
    fetchPacientes("", false, undefined, "Todos", "Si", "30", undefined, true);  };

  // Limpia el filtro de establecimiento y relanza la búsqueda con todos los centros
  const limpiarEst = () => {
    setFilterEst("Todos");
    setSearchTerm("");
    setIsOpen(false);
    fetchPacientes(undefined, false, "Todos"); // estDirecto explícito
  };

  // Limpia la fecha FPP Desde y relanza la búsqueda manteniendo el FPP Hasta actual
  const limpiarFppDesde = () => {
    setFilterFppDesde("");
  };

  // Limpia la fecha FPP Hasta y relanza la búsqueda manteniendo el FPP Desde actual
  const limpiarFppHasta = () => {
    setFilterFppHasta("");
  };

  const fetchFiltros = async () => {
    try {
      const res = await apiFetch("/filtros");
      const data = await res.json();

      // Mapeamos los establecimientos para unificar sus nombres
      const estsUnificados = data.map((est: { value: string, label: string, sisa?: string }) => ({
        ...est,
        label: romanToArabic(est.label) // <--- Aplicamos la limpieza aquí
      }));

      setEstablecimientos(estsUnificados);
    } catch (error) {
      console.error("Error cargando establecimientos");
    }
  };

  const fetchPacientes = async (
    dniDirecto?: string,
    esExacto: boolean = false,
    estDirecto?: string,
    trimestreDirecto?: string,
    riesgoDirecto?: string,    // ← nuevo
    diasDirecto?: string,
    excluirDerivadasDirecto?: boolean,
    esCargaInicial: boolean = false       // ← nuevo
  ) => {
    setLoading(true);
    try {
      const dniABuscar = dniDirecto !== undefined ? dniDirecto : filterDni;
      const estABuscar = estDirecto !== undefined ? estDirecto : filterEst;
      const trimestreABuscar = trimestreDirecto !== undefined ? trimestreDirecto : filterTrimestre; // 👈 Nuevo
      const riesgoABuscar = riesgoDirecto !== undefined ? riesgoDirecto : filterRiesgo;  // ← nuevo
      const diasABuscar = diasDirecto !== undefined ? diasDirecto : filterDias;
      const excluirDerivadasABuscar = excluirDerivadasDirecto !== undefined 
        ? excluirDerivadasDirecto 
        : excluirDerivadas;          // ← nuevo
      const queryParams: any = {
        dni: dniABuscar,
        establecimiento: estABuscar,
        riesgo: riesgoABuscar,   // ← cambiado
        dias: diasABuscar,
        trimestre: trimestreABuscar, // 👈 Nuevo
        excluirDerivadas: excluirDerivadasABuscar ? "true" : "false"        // ← cambiado
      };

      // 👈 LA REGLA DE ORO DE UX CORREGIDA:
      // El fallback solo se permite si es la carga inicial automática del sistema. 
      // Si el usuario gatilló la función mediante un evento manual, lo inhabilitamos.
      if (esCargaInicial) {
        queryParams.permitirFallback = "true";
      } else {
        queryParams.permitirFallback = "false";
      }

      // Si es una búsqueda exacta por DNI, agregamos el flag para el backend
      if (esExacto || (dniABuscar && dniABuscar.length > 7)) {
        queryParams.exact = "true";
      }
  
      const query = new URLSearchParams(queryParams);
      const res = await apiFetch(`/pacientes?${query}`);
      const data = await res.json();

      setUltimaActualizacion(data.ultimaActualizacion || null);
      setPacientes(data.data || []);
      setTotalGlobal(data.totalGlobal || 0);
    
      // Si el backend activó la contención, actualizamos la botonera lateral
      if (data.fallbackActivo) {
        setFilterRiesgo("Todas");
        setFilterDias("0");
        // Sincronizamos también las etiquetas del resumen para evitar desajustes visuales
        setAplicadoRiesgo("Todas");
        setAplicadoDias("0");
      }
    
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

    // 👈 REGRESA LOS NULOS O "SIN REGISTRO" AL FINAL SIEMPRE
    if (aValue === null || aValue === undefined || aValue === "null") return 1;
    if (bValue === null || bValue === undefined || bValue === "null") return -1;

    // 👈 TRATAMIENTO ESPECÍFICO PARA LAS COLUMNAS DE FECHA
    if (sortConfig.key === 'fpp' || sortConfig.key === 'ult_control' || sortConfig.key === 'fecha_ultimo_contacto') {
      const timeA = new Date(aValue).getTime();
      const timeB = new Date(bValue).getTime();
      
      // Si el parseo de fecha falla por algún string corrupto, lo mandamos al fondo
      if (isNaN(timeA)) return 1;
      if (isNaN(timeB)) return -1;

      return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
    }

    // Lógica para manejar fechas o números
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Generar el texto dinámico de filtros
  const getFiltrosAplicadosTexto = () => {
    const partes = [];

    if (aplicadoRiesgo === "Si") {
      partes.push("Embarazadas de Riesgo");
    }

    if (aplicadoDias !== "0") {
      partes.push(`+${aplicadoDias} días sin control`);
    }

    if (filterEst !== "Todos") {
      const estNombre = establecimientos.find(e => e.value === filterEst)?.label;
      if (estNombre) partes.push(estNombre);
    }

    if (aplicadoTrimestre !== "Todos") {
      partes.push(`${aplicadoTrimestre}° Trimestre`);
    }

    if (partes.length === 0) return "";

    return ` — ${partes.join(" — ")}`;
  };

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
                    placeholder="DNI de la embarazada..."
                    className={styles.searchInput}
                    style={filterDni ? { paddingRight: '2.2rem' } : undefined}
                    value={filterDni}
                    onChange={(e) => {
                      setFilterDni(e.target.value);
                      fetchSugerencias(e.target.value);
                    }}
                  />
                  {filterDni && (
                    <button
                      className={styles.clearBtn}
                      onClick={limpiarDni}
                      title="Limpiar búsqueda de DNI"
                    >
                      <X size={13} />
                    </button>
                  )}
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

            {!isRestrictedRole && (
              <div className={styles.filterGroup} style={{ position: 'relative' }}>
                <label className={styles.filterLabel}>Establecimiento</label>

                <div className={styles.selectWrapper}>
                  <input
                    type="text"
                    className={styles.selectInput}
                    placeholder="Buscar establecimiento..."
                    style={filterEst !== "Todos" ? { paddingRight: '2.2rem' } : undefined}
                    value={isOpen ? searchTerm : romanToArabic(establecimientos.find(e => e.value === filterEst)?.label || "Todos")}
                    onFocus={() => { setIsOpen(true); setSearchTerm(""); }}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onBlur={() => setTimeout(() => setIsOpen(false), 200)} // Delay para permitir el click en la opción
                  />
                  {filterEst !== "Todos" && !isOpen && (
                    <button
                      className={styles.clearBtn}
                      onClick={limpiarEst}
                      title="Ver todos los centros"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className={styles.customDropdown}>

                    {filteredEsts.map((est) => (
                      <div
                        key={est.value} // Esto quita el error de "unique key prop"
                        className={styles.dropdownOption}
                        onClick={() => {
                          const selectedValue = est.value || "Todos"; // Nos aseguramos de que nunca sea undefined
                          setFilterEst(selectedValue);
                          setSearchTerm(romanToArabic(est.label));
                          setIsOpen(false);
                          fetchPacientes(undefined, false, selectedValue);
                        }}
                      >
                        {est.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
              <label className={styles.filterLabel}>Trimestre Gesta</label>
              <select 
                className={styles.selectInput} 
                value={filterTrimestre} 
                onChange={(e) => setFilterTrimestre(e.target.value)}
              >
                <option value="Todos">Todos los trimestres</option>
                <option value="1">1° Trimestre (menos de 14 sem)</option> {/* 👈 Cambiado < por &lt; */}
                <option value="2">2° Trimestre (14 sem a 27 sem)</option>
                <option value="3">3° Trimestre (mas de 28 sem)</option>
              </select>
            </div>

              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>Derivadas</label>
                <button
                  onClick={() => {
                    const nuevoValor = !excluirDerivadas;
                    setExcluirDerivadas(nuevoValor);
                    fetchPacientes(undefined, false, undefined, filterTrimestre, undefined, undefined, nuevoValor, false);
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    border: `1px solid ${excluirDerivadas ? '#e2e8f0' : '#769FD3'}`,
                    background: excluirDerivadas ? '#f8fafc' : '#ede9fe',
                    color: excluirDerivadas ? '#64748b' : '#769FD3',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {excluirDerivadas ? 'No' : 'Sí'}
                </button>
              </div>
            

            <button
              className={styles.btnAction}
              style={{ width: '100%', marginTop: '1rem' }}
              onClick={() => {
                setAplicadoRiesgo(filterRiesgo);
                setAplicadoDias(filterDias);
                setAplicadoTrimestre(filterTrimestre);
                fetchPacientes(undefined, false, undefined, filterTrimestre, undefined, undefined, undefined, false);
              }}
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
                <span className={styles.statLabel}>Total Registradas</span>
                <div className={styles.statValueContainer}>
                  <span className={styles.statValue}>
                    {totalGlobal.toLocaleString('es-AR')}
                  </span>
                </div>
                <p className={styles.statSubtext}>Embarazos en curso</p>
              </div>
            </div>

            <div className={styles.tableHeader}>
              <h2 className={styles.tableTitle}>
                Listado de Seguimiento
                <span className={styles.filtrosBadge}>
                  {getFiltrosAplicadosTexto()}
                </span>
                {/* TÍTULO DINÁMICO E INTELIGENTE */}
                <span style={{ 
                  fontSize: '1rem', 
                  color: filterDni && pacientes.length === 1 && pacientes[0].establecimiento !== session?.user?.name 
                    ? '#e11d48' // Rojo si es de afuera
                    : '#587ba8', 
                  display: 'block', 
                  fontWeight: '600' 
                }}>
                  {filterDni && pacientes.length === 1 
                    ? ` — Paciente de: ${pacientes[0].establecimiento}` 
                    : ` — Institución: ${session?.user?.name || "Cargando..."}`
                  }
                </span>
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {ultimaActualizacion && (
                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    Datos al: {new Date(ultimaActualizacion).toLocaleDateString('es-AR')}
                  </span>
                )}
                <button
                  className={styles.btnRefresh}
                  onClick={() => fetchPacientes()}
                  disabled={loading}
                >
                  <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? "Actualizando..." : "Actualizar"}
                </button>
              </div>
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

                    <th onClick={() => handleSort('eg_actual')} className={styles.sortableHeader}>
                      <div className={styles.headerContent}>
                        <span>Edad Gestacional</span>
                        <span className={styles.sortIcon}>
                          {sortConfig.key === 'eg_actual' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
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

                    <th onClick={() => handleSort('fecha_ultimo_contacto')} className={styles.sortableHeader}>
                      <div className={styles.headerContent}>
                        <span>Último Contacto</span>
                        <span className={styles.sortIcon}>
                          {sortConfig.key === 'fecha_ultimo_contacto' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>

                    {/* 👈 NUEVA CABECERA: COLUMNA TURNO */}
                    <th onClick={() => handleSort('fecha_proximo_turno')} className={styles.sortableHeader}>
                      <div className={styles.headerContent}>
                        <span>Próximo Turno</span>
                        <span className={styles.sortIcon}>
                          {sortConfig.key === 'fecha_proximo_turno' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th className={styles.tableTh}>Fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                        Cargando base de datos Gold...
                      </td>
                    </tr>
                  ) : sortedPacientes.length > 0 ? (
                    sortedPacientes.map((p, index) => {
                      const diasSC = p.dias_sin_contacto;

                      // Marcamos derivadas usando el campo real de la tabla, no solo el CUIE
                      const esDerivada = Boolean(
                        p.nombre_centro_derivado ||
                        p.derivacion_maternidad_id
                      );
                      return (
                        <tr 
                          key={`${p.id}-${index}`} 
                          onClick={() => setSelectedPaciente(p)} 
                          // 👈 INYECTAMOS LA CLASE CONDICIONAL DE TU HOJA DE ESTILOS Module
                          className={`${styles.tableRow} ${esDerivada ? styles.derivadaRow : ''}`}
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
                          <td style={{ color: '#475569', textAlign: 'center' }}>
                            {p.eg_actual ? `${p.eg_actual}s` : "-"}
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ color: '#475569', fontWeight: 500 }}>
                                {p.ult_control ? new Date(p.ult_control).toLocaleDateString('es-AR') : "-"}
                              </span>
                              <div>
                                <span className={getSemaforoClass(p.dias, p.eg_actual)}>
                                  {p.dias === 999 ? "S/D" : `${p.dias} días`}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ color: '#475569', fontWeight: 500 }}>
                                {p.fecha_ultimo_contacto
                                  ? new Date(p.fecha_ultimo_contacto).toLocaleDateString('es-AR')
                                  : "-"}
                              </span>
                              <div>
                                <span className={getSemaforoClass(diasSC, p.eg_actual)}>
                                  {diasSC === 999 
                                    ? "S/D" 
                                    : diasSC <= 0 
                                      ? "Hoy"       // 👈 Si es 0 o menor por algún desajuste, muestra Hoy
                                      : diasSC === 1 
                                        ? "Ayer"      // 👈 Si es 1, muestra Ayer
                                        : `${diasSC} días`
                                  }
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 👈 NUEVA CELDA: DATOS DEL TURNO Y SU SEMÁFORO INVERTIDO */}
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ color: '#475569', fontWeight: 500 }}>
                                {p.fecha_proximo_turno ? new Date(p.fecha_proximo_turno).toLocaleDateString('es-AR') : "-"}
                              </span>
                              <div>
                                <span className={getSemaforoTurnoClass(p.dias_para_turno)}>
                                  {p.dias_para_turno === 999 
                                    ? "Sin Turno" 
                                    : p.dias_para_turno === 0 
                                      ? "Hoy" 
                                      : p.dias_para_turno === 1 
                                        ? "Mañana" 
                                        : `En ${p.dias_para_turno} días`
                                  }
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className={styles.tableTd}>
                            <span className={styles.fuenteBadge}>
                              {p.fuente_principal === 'sumar' 
                                ? 'SUMAR' 
                                : p.fuente_principal === 'v_embarazosdw' 
                                  ? 'POF' 
                                  : p.fuente_principal}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
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