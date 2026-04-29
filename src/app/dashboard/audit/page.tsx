import Navbar from "@/components/Navbar";
import styles from "./Audit.module.css";
import { ShieldCheck, HardDrive, AlertTriangle } from "lucide-react";

export default function AuditPage() {
  return (
    <>
      <Navbar />
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Auditoría de Datos y Logs</h1>
          <p>Monitoreo de Procesos ETL y Tabla Maestra</p>
        </div>

        <div className={styles.placeholderCard}>
          <div className={styles.iconWrapper}>
            <ShieldCheck size={48} className={styles.mainIcon} />
          </div>
          <h2>Módulo en Desarrollo</h2>
          <p className={styles.description}>
            Próximamente aquí se visualizarán los registros de carga, errores de ingesta y todos los cambios 
            auditables en la tabla maestra de pacientes.
          </p>

          <div className={styles.featuresPreview}>
            <div className={styles.featureItem}>
              <HardDrive size={24} className={styles.fIcon} />
              <span>Logs del proceso ETL</span>
            </div>
            <div className={styles.featureItem}>
              <AlertTriangle size={24} className={styles.fIcon} />
              <span>Alertas de calidad de datos</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
