/*src/app/dashboard/page.tsx*/
"use client";
import { useState, useEffect } from "react";
import { registrarLog } from "@/lib/analytics";
import styles from "./Dashboard.module.css";
import Navbar from "@/components/Navbar";
import { Info, Filter, Search, Phone, CheckCircle2, AlertCircle, RefreshCcw, X, Download} from "lucide-react";
import RegistroContactoModal from "@/components/RegistroContactoModal";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import Image from "next/image";
import logoColorImg from "../../../public/logo_color.png";
import logoSaludImg from "../../../public/Logo_Salud_Publica_colorH.png";

import * as XLSX from 'xlsx';

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

  /* 🌟 NUEVOS CAMPOS ADAPTADOS DE LA API DE MATERNIDAD */
  observaciones_riesgo: string;
  nombre_establecimiento: string;
  fecha_derivacion: string;
  motivo_diagnostico_derivacion: string;
  medico_deriva: string;
  medico_recibe: string;
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

  const verColumnasAmpliadas = userRole === 'Administrador' || userRole === 'Coordinador' || userRole?.toLowerCase() === 'lectura' || userRole === 'Maternidad';

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
  const [filterTrimestre, setFilterTrimestre] = useState("Todos"); 
  const [aplicadoTrimestre, setAplicadoTrimestre] = useState("Todos");

  const [filterAtrasados, setFilterAtrasados] = useState("Si"); 
  const [aplicadoAtrasados, setAplicadoAtrasados] = useState("Si");
  
  // Estados que reflejan lo que REALMENTE está aplicado (se actualizan solo al presionar Aplicar)
  const [aplicadoRiesgo, setAplicadoRiesgo] = useState("Si");

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
    fetchPacientes(undefined, false, undefined, "Todos", "Si", "Si", undefined, true);
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
    setFilterAtrasados("Todas");

    // Reseteamos las etiquetas del resumen
    setAplicadoRiesgo("Todas");
    setAplicadoAtrasados("Todas");

    fetchPacientes(dni, true);
  };

  // Limpia el campo DNI, cierra el dropdown de sugerencias y relanza la búsqueda
  const limpiarDni = () => {
    setFilterDni("");
    setSugerencias([]);
    setMostrarSugerencias(false);

    // Restauramos estado del formulario
    setFilterRiesgo("Si");
    setFilterAtrasados("Si");
    setFilterTrimestre("Todos");

    // Restauramos etiquetas del resumen
    setAplicadoRiesgo("Si");
    setAplicadoAtrasados("Si");
    setAplicadoTrimestre("Todos");

    // Pasamos los valores directo para no depender del estado que aún no se actualizó
    fetchPacientes("", false, undefined, "Todos", "Si", "Si", undefined, true);
  };

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
    atrasadosDirecto?: string,
    excluirDerivadasDirecto?: boolean,
    esCargaInicial: boolean = false       // ← nuevo
  ) => {
    setLoading(true);
    try {
      const dniABuscar = dniDirecto !== undefined ? dniDirecto : filterDni;
      const estABuscar = estDirecto !== undefined ? estDirecto : filterEst;
      const trimestreABuscar = trimestreDirecto !== undefined ? trimestreDirecto : filterTrimestre; // 👈 Nuevo
      const riesgoABuscar = riesgoDirecto !== undefined ? riesgoDirecto : filterRiesgo;  // ← nuevo
      const atrasadosABuscar = atrasadosDirecto !== undefined ? atrasadosDirecto : filterAtrasados;
      const excluirDerivadasABuscar = excluirDerivadasDirecto !== undefined 
        ? excluirDerivadasDirecto 
        : excluirDerivadas;          // ← nuevo
      const queryParams: any = {
        dni: dniABuscar,
        establecimiento: estABuscar,
        riesgo: riesgoABuscar,   // ← cambiado
        controlesAtrasados: atrasadosABuscar === "Si" ? "true" : (atrasadosABuscar === "No" ? "false" : "todos"),
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

      const pacientesObtenidos = data.data || [];

      // 👈 FALLBACK INTELIGENTE: Si al cargar la página por primera vez pedimos "Atrasadas" y no hay ninguna, cambiamos automáticamente a "Todas"
      if (esCargaInicial && atrasadosABuscar === "Si" && !data.fallbackActivo) {
        const atrasadasReales = pacientesObtenidos.filter((p: Paciente) => {
          const clase = getSemaforoClass(p.dias, p.eg_actual);
          return clase === styles.semaforoRojo || clase === styles.semaforoAmarillo || clase === styles.semaforoGris;
        });

        if (atrasadasReales.length === 0) {
          setFilterAtrasados("Todas");
          setAplicadoAtrasados("Todas");
          await fetchPacientes(dniABuscar, esExacto, estABuscar, trimestreABuscar, riesgoABuscar, "Todas", excluirDerivadasABuscar, false);
          return; // Finalizamos el ciclo para que la función recursiva de arriba tome el control
        }
      }

      setUltimaActualizacion(data.ultimaActualizacion || null);
      setPacientes(pacientesObtenidos);
      setTotalGlobal(data.totalGlobal || 0);
    
      // Si el backend activó la contención, actualizamos la botonera lateral
      if (data.fallbackActivo) {
        setFilterRiesgo("Todas");
        setFilterAtrasados("Todas");
        // Sincronizamos también las etiquetas del resumen para evitar desajustes visuales
        setAplicadoRiesgo("Todas");
        setAplicadoAtrasados("Todas");
      }
    
    } catch (error) {
      console.error("Error al obtener pacientes:", error);
    } finally {
      setLoading(false);
    }
  };

  const pacientesFiltrados = pacientes.filter(p => {
    // 👈 FILTRADO CLIENT-SIDE: Aseguramos la precisión de "Controles Atrasados" pase lo que pase con la API
    if (aplicadoAtrasados === "Si") {
      const clase = getSemaforoClass(p.dias, p.eg_actual);
      return clase === styles.semaforoRojo || clase === styles.semaforoAmarillo || clase === styles.semaforoGris;
    } else if (aplicadoAtrasados === "No") {
      const clase = getSemaforoClass(p.dias, p.eg_actual);
      return clase === styles.semaforoVerde;
    }
    return true; // "Todas"
  });

  const sortedPacientes = [...pacientesFiltrados].sort((a, b) => {
    if (!sortConfig.key) return 0;

    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    // 👈 REGRESA LOS NULOS O "SIN REGISTRO" AL FINAL SIEMPRE
    if (aValue === null || aValue === undefined || aValue === "null") return 1;
    if (bValue === null || bValue === undefined || bValue === "null") return -1;

    // 👈 TRATAMIENTO ESPECÍFICO PARA LAS COLUMNAS DE FECHA
    if (sortConfig.key === 'fpp' || sortConfig.key === 'ult_control' || sortConfig.key === 'fecha_ultimo_contacto' || sortConfig.key === 'fecha_derivacion') {
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

    if (aplicadoAtrasados === "Si") {
      partes.push("Controles Atrasados");
    } else if (aplicadoAtrasados === "No") {
      partes.push("Controles al día");
    }

    if (filterEst !== "Todos") {
      const estNombre = establecimientos.find(e => e.value === filterEst)?.label;
      if (estNombre) partes.push(estNombre);
    }

    if (aplicadoTrimestre !== "Todos") {
      partes.push(`${aplicadoTrimestre}° Trimestre`);
    }

    // 👈 AGREGADO: Ahora también mostramos si se están incluyendo las derivadas
    if (!excluirDerivadas) {
      partes.push("Incluyendo Derivadas");
    }

    if (partes.length === 0) return "";

    return ` — ${partes.join(" — ")}`;
  };

  const exportarAExcel = () => {
    if (!pacientesFiltrados || pacientesFiltrados.length === 0) {
      alert("No hay datos en la tabla para exportar con los filtros actuales.");
      return;
    }

    // Estructuramos las columnas del reporte con nombres claros y profesionales
    const datosFormateados = pacientesFiltrados.map((p: any) => ({
      "Paciente / Embarazada": p.nombre,
      "DNI": p.dni,
      "Fecha Probable Parto (FPP)": p.fpp ? new Date(p.fpp).toLocaleDateString('es-AR') : 'Sin Registro',
      "Edad Gestacional Actual": p.eg_actual ? `${p.eg_actual} semanas` : 'S/D',
      "Último Control Médico": p.ult_control ? new Date(p.ult_control).toLocaleDateString('es-AR') : 'Sin Registro',
      "Días desde Último Control": p.dias === 999 ? 'Sin controles' : `${p.dias} días`,
      "Último Contacto Logrado": p.fecha_ultimo_contacto ? new Date(p.fecha_ultimo_contacto).toLocaleDateString('es-AR') : 'S/D',
      "Fecha Próximo Turno": p.fecha_proximo_turno ? new Date(p.fecha_proximo_turno).toLocaleDateString('es-AR') : 'Sin Turno',
      "Teléfono": p.telefono,
      "Domicilio Declarado": p.domicilio,
      "Fuente de Sincronización": p.fuente_principal || 'S/D'
    }));

    // Creación del libro de Excel mediante SheetJS
    const hoja = XLSX.utils.json_to_sheet(datosFormateados);

    // 🌟 3. INYECCIÓN DE LOS FILTROS APLICADOS AL FINAL DE LA PLANILLA
    // Obtenemos el texto limpio de los filtros (Ej: " — Embarazadas de Riesgo — +30 días sin control")
    const textoFiltros = getFiltrosAplicadosTexto();
    const filtrosLimpios = textoFiltros ? textoFiltros.replace(/^ — /, "") : "Ninguno (Listado Total)";

    // Calculamos dónde termina la tabla para dejar un renglón en blanco y escribir abajo
    const filaVacia = datosFormateados.length + 2; // +1 por el encabezado, +1 para dejar libre
    const filaMetadatos = filaVacia + 1;

    // Escribimos los metadatos de control directo en las celdas de la hoja
    XLSX.utils.sheet_add_aoa(hoja, [
      [`📌 FILTROS APLICADOS EN EL SISTEMA: ${filtrosLimpios}`],
      [`📅 Fecha de generación del reporte: ${new Date().toLocaleDateString('es-AR')} a las ${new Date().toLocaleTimeString('es-AR')}`]
    ], { origin: `A${filaVacia}` }); // 👈 Arranca a escribir en la columna A abajo de la tabla
    
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Listado de Seguimiento");

    // Autoajuste dinámico de los anchos de columna para evitar textos solapados
    const anchosColumnas = Object.keys(datosFormateados[0]).map(key => ({
      wch: Math.max(key.length + 3, 16)
    }));
    hoja['!cols'] = anchosColumnas;

    // Nombre dinámico con la fecha de la descarga y el nombre del CAPS/Maternidad
    const nombreEfector = session?.user?.name?.replace(/\s+/g, '_') || 'Efector';
    const fechaDescarga = new Date().toISOString().split('T')[0];
    
    XLSX.writeFile(libro, `Listado_Seguimiento_${nombreEfector}_${fechaDescarga}.xlsx`);

    // Inyección automática a tu capa de Logs de Auditoría
    registrarLog({
      modulo: "Seguimiento",
      accion: "EXPORTAR_EXCEL",
      detalles: `Exportó planilla Excel con ${pacientesFiltrados.length} registros usando filtros activos.`
    }).catch(err => console.error("Error al registrar log de exportación:", err));
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
                <label className={styles.filterLabel}>Incluye Riesgo</label>
                <div className={styles.tooltipContainer}>
                  <Info size={14} className={styles.infoIcon} />
                  <span className={styles.tooltipText}>
                    Muestra pacientes con derivación y/o factores de riesgo cargados.
                  </span>
                </div>
              </div>
              
              {/* 🌟 NUEVO BOTÓN TOGGLE PARA RIESGO */}
              <button
                type="button"
                onClick={() => {
                  // Si está en 'Si' pasa a 'Todas', y viceversa
                  const nuevoValorRiesgo = filterRiesgo === "Si" ? "Todas" : "Si";
                  setFilterRiesgo(nuevoValorRiesgo);
                  
                  // Disparamos la búsqueda al instante pasando el nuevo valor directo
                  fetchPacientes(
                    undefined, 
                    false, 
                    undefined, 
                    filterTrimestre, 
                    nuevoValorRiesgo, // 👈 Pasamos el valor fresco recién calculado
                    filterAtrasados, 
                    excluirDerivadas, 
                    false
                  );
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  // Cambia de color según esté activo ("Si") o mostrando todo ("Todas")
                  border: `1px solid ${filterRiesgo === "Si" ? '#769FD3' : '#e2e8f0'}`,
                  background: filterRiesgo === "Si" ? '#ede9fe' : '#f8fafc',
                  color: filterRiesgo === "Si" ? '#769FD3' : '#64748b',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {filterRiesgo === "Si" ? 'Sí' : 'No'}
              </button>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Controles Atrasados</label>
              <select
                className={styles.selectInput}
                value={filterAtrasados}
                onChange={(e) => setFilterAtrasados(e.target.value)}
              >
                <option value="Si">Sí (Atrasadas)</option>
                <option value="No">No (Al día)</option>
                <option value="Todas">Todas</option>
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
                <label className={styles.filterLabel}>Incluye Derivadas</label>
                <button
                  onClick={() => {
                    const nuevoValor = !excluirDerivadas;
                    setExcluirDerivadas(nuevoValor);
                    fetchPacientes(undefined, false, undefined, filterTrimestre, filterRiesgo, filterAtrasados, nuevoValor, false);
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
                setAplicadoAtrasados(filterAtrasados);
                setAplicadoTrimestre(filterTrimestre);
                fetchPacientes(undefined, false, undefined, filterTrimestre, filterRiesgo, filterAtrasados, undefined, false);
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
                    {pacientesFiltrados.length.toLocaleString('es-AR')}
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
                {userRole === 'Centro de Salud' && (
                  <button 
                    className={styles.btnRefresh} /* Usa la misma clase para que mantenga el tamaño y radio */
                    onClick={exportarAExcel}
                    style={{ backgroundColor: '#769FD3', color: 'white', borderColor: '#769FD3' }} /* Un verde esmeralda bien de Excel */
                    type="button"
                  >
                    <Download size={16} style={{ marginRight: '4px', display: 'inline' }} />
                  </button>
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
                    <th className={styles.sortableHeader} style={{ verticalAlign: 'middle' }}>Paciente</th>

                    <th onClick={() => handleSort('dni')} className={styles.sortableHeader}>
                      <div className={styles.headerContent} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>DNI</span>
                        <span className={styles.sortIcon}>
                          {sortConfig.key === 'dni' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>

                    <th onClick={() => handleSort('fpp')} className={styles.sortableHeader}>
                      <div className={styles.headerContent} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>FPP</span>
                        <span className={styles.sortIcon}>
                          {sortConfig.key === 'fpp' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>

                    {/* 👈 MODIFICADO: Agregamos ancho máximo y permitimos quiebre normal de línea */}
                    <th onClick={() => handleSort('eg_actual')} className={styles.sortableHeader} style={{ maxWidth: '95px', whiteSpace: 'normal' }}>
                      <div className={styles.headerContent} style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'space-between' }}>
                        <span style={{ lineHeight: '1.2' }}>Edad<br />Gestacional</span>
                        <span className={styles.sortIcon}>
                          {sortConfig.key === 'eg_actual' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>

                    {/* 👈 MODIFICADO: Permitimos quiebre */}
                    <th onClick={() => handleSort('ult_control')} className={styles.sortableHeader} style={{ maxWidth: '95px', whiteSpace: 'normal' }}>
                      <div className={styles.headerContent} style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'space-between' }}>
                        <span style={{ lineHeight: '1.2' }}>Último<br />Control</span>
                        <span className={styles.sortIcon}>
                          {sortConfig.key === 'ult_control' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>

                    {/* 👈 MODIFICADO: Permitimos quiebre */}
                    <th onClick={() => handleSort('fecha_ultimo_contacto')} className={styles.sortableHeader} style={{ maxWidth: '100px', whiteSpace: 'normal' }}>
                      <div className={styles.headerContent} style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'space-between' }}>
                        <span style={{ lineHeight: '1.2' }}>Último<br />Contacto</span>
                        <span className={styles.sortIcon}>
                          {sortConfig.key === 'fecha_ultimo_contacto' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>

                    {/* 👈 MODIFICADO: Permitimos quiebre */}
                    <th onClick={() => handleSort('fecha_proximo_turno')} className={styles.sortableHeader} style={{ maxWidth: '95px', whiteSpace: 'normal' }}>
                      <div className={styles.headerContent} style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'space-between' }}>
                        <span style={{ lineHeight: '1.2' }}>Próximo<br />Turno</span>
                        <span className={styles.sortIcon}>
                          {sortConfig.key === 'fecha_proximo_turno' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </div>
                    </th>

                    {/* 🌟 Títulos de Maternidad con quiebres controlados */}
                    {verColumnasAmpliadas && (
                      <>
                        <th className={styles.tableTh} style={{ whiteSpace: 'normal', maxWidth: '100px', lineHeight: '1.2', verticalAlign: 'middle' }}>
                          Observación<br />Riesgo
                        </th>
                        <th className={styles.tableTh} style={{ whiteSpace: 'normal', maxWidth: '120px', lineHeight: '1.2', verticalAlign: 'middle' }}>
                          Establecimiento<br />Origen
                        </th>
                        <th className={styles.tableTh} style={{ whiteSpace: 'normal', maxWidth: '100px', lineHeight: '1.2', verticalAlign: 'middle' }}>
                          Centro<br />Derivado
                        </th>
                        
                        <th onClick={() => handleSort('fecha_derivacion')} className={styles.sortableHeader} style={{ maxWidth: '110px', whiteSpace: 'normal' }}>
                          <div className={styles.headerContent} style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'space-between' }}>
                            <span style={{ lineHeight: '1.2' }}>Fecha<br />Derivación</span>
                            <span className={styles.sortIcon}>
                              {sortConfig.key === 'fecha_derivacion' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                            </span>
                          </div>
                        </th>

                        <th className={styles.tableTh} style={{ whiteSpace: 'normal', maxWidth: '110px', lineHeight: '1.2', verticalAlign: 'middle' }}>
                          Motivo<br />Diagnóstico
                        </th>
                        <th className={styles.tableTh} style={{ whiteSpace: 'normal', maxWidth: '90px', lineHeight: '1.2', verticalAlign: 'middle' }}>
                          Médico<br />Deriva
                        </th>
                        <th className={styles.tableTh} style={{ whiteSpace: 'normal', maxWidth: '90px', lineHeight: '1.2', verticalAlign: 'middle' }}>
                          Médico<br />Recibe
                        </th>
                      </>
                    )}

                    <th className={styles.tableTh} style={{ verticalAlign: 'middle' }}>Fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={17} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
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

                          {/* 🌟 NUEVO: Celdas de datos clínicas exclusivas para rol Maternidad */}
                          {verColumnasAmpliadas && (
                            <>
                              <td style={{ color: '#475569', fontSize: '0.85rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.observaciones_riesgo}>
                                {p.observaciones_riesgo}
                              </td>
                              <td style={{ color: '#475569', fontSize: '0.85rem' }}>{p.nombre_establecimiento}</td>
                              <td style={{ color: '#475569', fontSize: '0.85rem' }}>{p.nombre_centro_derivado || "-"}</td>
                              <td style={{ color: '#475569', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{p.fecha_derivacion}</td>
                              <td style={{ color: '#475569', fontSize: '0.85rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.motivo_diagnostico_derivacion}>
                                {p.motivo_diagnostico_derivacion}
                              </td>
                              <td style={{ color: '#475569', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{p.medico_deriva}</td>
                              <td style={{ color: '#475569', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{p.medico_recibe}</td>
                            </>
                          )}

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
                      <td colSpan={17} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
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