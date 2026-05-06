import React, { useState, useEffect } from "react";
import styles from "./RegistroContactoModal.module.css";
import { X, Save, Clock } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function RegistroContactoModal({ paciente, onClose, onSuccess }: any) {
  const [formData, setFormData] = useState({
    contacto_logrado: true,
    medio_contacto: "llamada",
    persona_contactada: "paciente",
    telefono_contactado: paciente.telefono !== "-" ? paciente.telefono : "",
    personal_salud: "", 
    proxima_cita: "",
    observaciones: ""
  });
  
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (paciente) fetchHistorial();
  }, [paciente]);

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

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  const handleLogradoChange = (logrado: boolean) => {
    setFormData({ ...formData, contacto_logrado: logrado });
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch("/seguimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paciente_id: paciente.id,
          ...formData
        })
      });
      if (res.ok) {
        onSuccess();
      } else {
        alert("Error al guardar el contacto");
      }
    } catch (error) {
      console.error(error);
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
            <p><strong>Domicilio:</strong> {paciente.domicilio}</p>
          </div>

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
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Personal de salud:</label>
                <input type="text" name="personal_salud" value={formData.personal_salud} onChange={handleChange} className={styles.input} placeholder="Nombre y apellido" required />
              </div>
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
