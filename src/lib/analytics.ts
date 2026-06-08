/* src/lib/analytics.ts */
import { apiFetch } from "./api";

interface LogParams {
  modulo: "Seguimiento" | "Auditoría" | "Estadísticas";
  accion: string;
  detalles?: string;
  paciente_dni?: string;
  contacto_exitoso?: boolean;
  fecha_turno_asignado?: string | null;
}

/**
 * Dispara de forma silenciosa un registro de actividad hacia la tabla logs_actividad_dashboard
 */
export const registrarLog = async (params: LogParams) => {
  try {
    await apiFetch("/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch (error) {
    // Lo manejamos silenciosamente en consola para que un fallo de red en analíticas jamás le rompa la UX al usuario
    console.error("⚠️ Error silencioso registrando métrica de uso:", error);
  }
};