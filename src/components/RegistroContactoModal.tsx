import React, { useState, useEffect } from "react";
import styles from "./RegistroContactoModal.module.css";
import { X, Save, Clock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useSession } from "next-auth/react"; // Importamos el hook de sesión
import { registrarLog } from "@/lib/analytics";

export default function RegistroContactoModal({ paciente, onClose, onSuccess }: any) {
  const { data: session } = useSession(); // Obtenemos la sesión actual
  
  const [formData, setFormData] = useState({
    contacto_logrado: true,
    medio_contacto: "llamada",
    persona_contactada: "paciente",
    telefono_contactado: paciente.telefono !== "-" ? paciente.telefono : "",
    proxima_cita: "",
    observaciones: ""
  });
  
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchHistorial = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/seguimientos?pacienteId=${paciente.id}`);
      const data = await res.json();
      if (Array.isArray(data)) setHistorial(data);
    } catch (error) {
      console.error("Error historial", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (paciente) fetchHistorial();
  }, [paciente]);

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  const handleLogradoChange = (logrado: boolean) => {
    setFormData({ ...formData, contacto_logrado: logrado });
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    
    if (!session || !session.user) {
      alert("Tu sesión expiró o es inestable. Por favor, refrescá la página y volvé a iniciar sesión para guardar el contacto.");
      return;
    }

    setSaving(true);
    
    const identificadorUsuario = session.user.username || session.user.name || "Anonimo";
    const usuarioId = session.user.id ? parseInt(session.user.id, 10) : null;
    
    try {
      const res = await apiFetch("/seguimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paciente_id: paciente.id,
          ...formData,
          personal_salud: identificadorUsuario, 
          usuario_id: usuarioId                  
        })
      });
      
      if (res.ok) {
        // 🚀 2. CAPA DE MÉTRICAS COMPAÑERO MATI: El contacto se insertó con éxito, registramos el log de negocio
        
        // Acción A: Registramos de forma obligatoria el intento de comunicación (Exitoso o Fallido)
        await registrarLog({
          modulo: "Seguimiento",
          accion: "REGISTRAR_CONTACTO",
          paciente_dni: paciente.dni ? paciente.dni.toString() : null,
          contacto_exitoso: formData.contacto_logrado, // TRUE o FALSE directo del radio button
          detalles: `Medio: ${formData.medio_contacto}. Dirigido a: ${formData.persona_contactada}. Obs: ${formData.observaciones}`
        });

        // Acción B: Si el contacto fue logrado Y el operador le cargó una fecha de próxima cita, ¡hay un turno asignado!
        if (formData.contacto_logrado && formData.proxima_cita) {
          await registrarLog({
            modulo: "Seguimiento",
            accion: "ASIGNAR_TURNO",
            paciente_dni: paciente.dni ? paciente.dni.toString() : null,
            fecha_turno_asignado: formData.proxima_cita, // Mandamos la fecha del calendario
            detalles: `Turno coordinado de forma directa durante la llamada por ${identificadorUsuario}`
          });
        }

        onSuccess();
      } else {
        alert("Error al guardar el contacto en el servidor");
      }
    } catch (error) {
      console.error("Error enviando seguimiento:", error);
      alert("Ocurrió un error de red al intentar guardar");
    } finally {
      setSaving(false);
    }
  };

  if (!paciente) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2>Registro de Contacto</h2>
          <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.pacienteInfoCard}>
            <h3 className={styles.pacienteName}>{paciente.nombre}</h3>
            <p><strong>DNI:</strong> {paciente.dni} | <strong>FPP:</strong> {paciente.fpp ? new Date(paciente.fpp).toLocaleDateString('es-AR') : '-'}</p>
            <p><strong>Teléfono:</strong> {paciente.telefono}</p>
            <p>
              <strong>Domicilio:</strong> {paciente.domicilio} 
              {paciente.localidad && ` (${paciente.localidad})`}
            </p>

            {/* 🌟 NUEVO: Módulo exclusivo para Maternidad con los bloques de texto completos */}
            {session?.user?.role === 'Maternidad' && (
              <div style={{ 
                marginTop: '12px', 
                paddingTop: '12px', 
                borderTop: '1px dashed #cbd5e1', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '8px' 
              }}>
                <div style={{ backgroundColor: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9b1734', display: 'block', marginBottom: '2px', textTransform: 'uppercase' }}>
                    Observación de Riesgo / Antecedentes:
                  </span>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: '#334155', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>
                    {paciente.observaciones_riesgo || "Sin observaciones cargadas."}
                  </p>
                </div>

                <div style={{ backgroundColor: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3079ce', display: 'block', marginBottom: '2px', textTransform: 'uppercase' }}>
                    Motivo / Diagnóstico de Derivación:
                  </span>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: '#334155', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>
                    {paciente.motivo_diagnostico_derivacion || "No se especificó motivo clínico."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Formulario de registro de llamadas queda exactamente igual abajo */}
          {session?.user?.role?.toLowerCase() === 'lectura' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{
                padding: '1.2rem',
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                color: '#475569',
                fontSize: '0.9rem',
                textAlign: 'center',
                fontWeight: 550,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}>
                🔒 Modo de consulta: No posee permisos para registrar contactos o realizar modificaciones.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={onClose} className={styles.btnCancel} style={{ padding: '0.6rem 1.5rem' }}>
                  Cerrar
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>¿Se logró el contacto?</label>
                <div className={styles.radioGroup}>
                  <label className={styles.radioLabel}>
                    <input type="radio" name="contacto_logrado" checked={formData.contacto_logrado} onChange={() => handleLogradoChange(true)} />
                    Sí, logrado
                  </label>
                  <label className={styles.radioLabel}>
                    <input type="radio" name="contacto_logrado" checked={!formData.contacto_logrado} onChange={() => handleLogradoChange(false)} />
                    No, fallido
                  </label>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Medio de contacto:</label>
                  <select name="medio_contacto" value={formData.medio_contacto} onChange={handleChange} className={styles.input}>
                    <option value="llamada">📞 Llamada telefónica</option>
                    <option value="whatsapp">💬 WhatsApp</option>
                    <option value="sms">📱 SMS</option>
                    <option value="visita_domiciliaria">🏠 Visita domiciliaria</option>
                    <option value="email">📧 Email</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Persona contactada:</label>
                  <select name="persona_contactada" value={formData.persona_contactada} onChange={handleChange} className={styles.input}>
                    <option value="paciente">La paciente</option>
                    <option value="familiar">Familiar directo</option>
                    <option value="vecino">Vecino/Referente</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Teléfono contactado:</label>
                  <input type="tel" name="telefono_contactado" value={formData.telefono_contactado} onChange={handleChange} className={styles.input} placeholder="Ej: 3784..." />
                </div>
                {/* CAMBIO: Se eliminó el campo visual de Personal de Salud */}
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup} style={{maxWidth: '50%'}}>
                  <label className={styles.formLabel}>Próxima cita (opcional):</label>
                  <input type="date" name="proxima_cita" value={formData.proxima_cita} onChange={handleChange} className={styles.input} />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Observaciones:</label>
                <textarea name="observaciones" value={formData.observaciones} onChange={handleChange} className={styles.textarea} placeholder="Describa el resultado del contacto, indicaciones dadas, etc." rows={3} required></textarea>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" onClick={onClose} className={styles.btnCancel}>Cancelar</button>
                <button type="submit" disabled={saving} className={styles.btnSave}>
                  <Save size={16} style={{marginRight: '8px'}} />
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          )}

          <div className={styles.historialContainer}>
            <h4 className={styles.historialTitle}>
              <Clock size={16} /> Últimos contactos ({historial.length})
            </h4>
            <div className={styles.historialList}>
              {loading ? (
                <p className={styles.historialStatus}>Cargando historial...</p>
              ) : historial.length === 0 ? (
                <p className={styles.historialStatus}>No hay contactos previos registrados.</p>
              ) : (
                historial.map((h: any) => (
                  <div key={h.id} className={styles.historialItem}>
                    <div className={styles.hHeader}>
                      <strong>{new Date(h.fecha_contacto).toLocaleDateString('es-AR')}</strong> - {h.personal_salud}
                      <span className={h.contacto_logrado ? styles.tagSuccess : styles.tagError}>
                        {h.contacto_logrado ? 'Logrado' : 'Fallido'}
                      </span>
                      {h.medio_contacto && (
                        <span style={{ marginLeft: '0.75rem', color: '#475569', fontSize: '0.82rem' }}>
                          Fuente: {h.medio_contacto.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <div className={styles.hBody}>
                      <p>{h.observaciones}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}