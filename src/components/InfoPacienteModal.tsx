/*src/components/InfoPacienteModal.tsx*/
import React from "react";
import styles from "./InfoPacienteModal.module.css";
import { X, User, ShieldAlert, CheckCircle } from "lucide-react";

export default function InfoPacienteModal({ paciente, onClose }: any) {
  if (!paciente) return null;

  const formatearFecha = (f: string | null) => {
    if (!f) return "Sin Registro";
    return new Date(f).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // 👈 NUEVA FUNCIÓN: Genera dinámicamente la guía de reparación en base a la alerta
  const obtenerInstruccionesCorreccion = (motivo: string) => {
    const motivoLower = motivo.toLowerCase();
    
    if (motivoLower.includes("fpp") || motivoLower.includes("edad gestacional")) {
      if (motivoLower.includes("pof")) {
        return "⚠️ La FPP tiene un año incorrecto (ej. 2027/2028). Por favor, ingresá al sistema POF, buscá la ficha de la paciente y corregí la Fecha Probable de Parto o la fecha del último control.";
      }
      return "⚠️ La Fecha Probable de Parto o la Edad Gestacional cargada es inconsistente. Revisar el registro original en la plataforma correspondiente (SUMAR/POF) para subsanar el campo.";
    }

    if (motivoLower.includes("edad calculada") || motivoLower.includes("años")) {
      return "⚠️ La Fecha de Nacimiento cargada genera una edad menor a 10 años o está ausente. Verificar el año de nacimiento en el sistema de origen para regularizar la ficha médica.";
    }

    if (motivoLower.includes("dni")) {
      return "⚠️ El documento de identidad es inválido, contiene caracteres incorrectos o está vacío. Solicitar el DNI físico a la paciente y actualizarlo en su efector de salud.";
    }

    return "⚠️ Revisar los campos inconsistentes de este registro en la base de datos de origen para asegurar la calidad de la información en la próxima sincronización.";
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        
        {/* Cabecera del Modal */}
        <div className={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={20} style={{ color: '#769FD3' }} />
            <h2>Información Consolidada de la Paciente</h2>
          </div>
          <button onClick={onClose} className={styles.closeBtn} title="Cerrar ventana">
            <X size={20} />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className={styles.modalBody}>
          
          {/* Alerta de Inconsistencia */}
          <div className={styles.alertCard}>
            <ShieldAlert size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Inconsistencia Detectada</strong>
              <p>{paciente.motivo_auditoria}</p>
            </div>
          </div>

          {/* 👈 NUEVO BLOQUE: Plan de Acción Minimalista para el Auditor */}
          <div style={{
            backgroundColor: '#fffbeb',
            border: '1px solid #fef3c7',
            padding: '0.85rem 1rem',
            borderRadius: '0.5rem',
            fontSize: '0.82rem',
            color: '#b45309',
            lineHeight: '1.4',
            fontWeight: 500
          }}>
            <div style={{ fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
               Acción Recomendada para Resolver:
            </div>
            {obtenerInstruccionesCorreccion(paciente.motivo_auditoria)}
          </div>

          {/* Grilla de Datos Médicos Extendida (3 columnas para mantener la simetría) */}
          <div className={styles.infoGrid} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            
            <div className={styles.infoItem} style={{ gridColumn: 'span 2' }}>
              <span className={styles.infoLabel}>Nombre Completo</span>
              <span className={styles.infoValue}>{paciente.nombre}</span>
            </div>

            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Documento (DNI)</span>
              <span className={styles.infoValue}>
                {paciente.dni !== "S/D" ? Number(paciente.dni).toLocaleString('es-AR') : "S/D"}
              </span>
            </div>

            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Fecha de Nacimiento</span>
              <span className={styles.infoValue}>{formatearFecha(paciente.fecha_nacimiento)}</span>
            </div>

            {/* 👈 NUEVO CAMPO: EDAD CRONOLÓGICA */}
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Edad Cronológica</span>
              <span className={styles.infoValue} style={paciente.edad && paciente.edad < 15 ? { color: '#dc2626' } : undefined}>
                {paciente.edad !== null ? `${paciente.edad} años` : "Sin Registro"}
              </span>
            </div>

            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Teléfono Cargado</span>
              <span className={styles.infoValue}>{paciente.telefono || "-"}</span>
            </div>

            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Fecha Probable de Parto (FPP)</span>
              <span className={styles.infoValue} style={{ textDecoration: 'underline', textDecorationColor: '#90B4E1' }}>
                {formatearFecha(paciente.fpp)}
              </span>
            </div>

            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Edad Gestacional Stage</span>
              <span className={styles.infoValue}>
                {paciente.eg_actual !== null ? `${paciente.eg_actual} semanas` : "Sin Registro"}
              </span>
            </div>

            {/* 👈 NUEVO CAMPO: FUENTE DE ORIGEN */}
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Fuente de Datos</span>
              <span className={styles.infoValue} style={{ color: '#475569', fontWeight: 700 }}>
                {paciente.fuente_limpia}
              </span>
            </div>

          </div>

          {/* Bloque de Infraestructura y Trazabilidad (Doble tarjeta inferior) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '1rem' }}>
            <div className={styles.institutionCard} style={{ margin: 0 }}>
              <span className={styles.infoLabel}>Establecimiento Responsable</span>
              <span className={styles.institutionValue}> {paciente.establecimiento}</span>
            </div>
            
            {/* 👈 NUEVO CAMPO: IDENTIFICADOR DE BATCH (Para trazabilidad del script de Manu) */}
            <div className={styles.infoItem} style={{ justifyContent: 'center' }}>
              <span className={styles.infoLabel}>ID de Lote (Batch)</span>
              <span className={styles.infoValue} style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#64748b' }}>
                #{paciente.lote}
              </span>
            </div>
          </div>

        </div>

        {/* 👈 FOOTER LIMPIO Y MINIMALISTA: Sin el botón duplicado de abajo */}
        <div className={styles.modalFooter} style={{ justifyContent: 'center', padding: '0.8rem' }}>
          <span className={styles.footerNote} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle size={12} style={{ color: '#94a3b8' }} /> Modo consulta de inconsistencias
          </span>
        </div>

      </div>
    </div>
  );
}