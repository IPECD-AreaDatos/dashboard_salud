"use client";

import { useEffect, useState } from "react";
import { 
  Users, 
  AlertTriangle, 
  Activity, 
  TrendingUp, 
  Search, 
  Bell, 
  UserCircle 
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import styles from "./Dashboard.module.css";

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then(res => res.json())
      .then(data => {
        setData(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="flex-center" style={{ height: "100vh" }}>Cargando...</div>;

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Activity color="var(--primary)" />
          <span>SaludDash</span>
        </div>
        <nav className={styles.nav}>
          <button className={styles.active}>Vista General</button>
          <button>Pacientes</button>
          <button>Reportes</button>
          <button>Configuración</button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className={styles.main}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.searchBar}>
            <Search size={18} />
            <input type="text" placeholder="Buscar paciente o reporte..." />
          </div>
          <div className={styles.userActions}>
            <button className={styles.iconBtn}><Bell size={20} /></button>
            <div className={styles.user}>
              <UserCircle size={32} />
              <span>Admin Dr.</span>
            </div>
          </div>
        </header>

        <div className={styles.content}>
          <h1 className={styles.pageTitle}>Panel de Control</h1>
          
          {/* Stats Grid */}
          <div className={styles.statsGrid}>
            <StatCard 
              icon={<Users />} 
              label="Total Pacientes" 
              value={data.totalPatients.toLocaleString()} 
              change="+12%" 
            />
            <StatCard 
              icon={<AlertTriangle color="#f59e0b" />} 
              label="Alertas Activas" 
              value={data.activeAlerts} 
              change="-5%" 
            />
            <StatCard 
              icon={<Activity color="#10b981" />} 
              label="Nivel Sat." 
              value={`${data.avgSatisfaction}%`} 
              change="+2%" 
            />
            <StatCard 
              icon={<TrendingUp color="#8b5cf6" />} 
              label="Crecimiento" 
              value={`${data.growthRate}%`} 
              change="+0.4%" 
            />
          </div>

          {/* Charts Row */}
          <div className={styles.chartsRow}>
            <div className={`${styles.chartCard} card`}>
              <h3>Tendencia de Atenciones</h3>
              <div className={styles.chartWrapper}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trends}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--card-border)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--foreground)', opacity: 0.5}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--foreground)', opacity: 0.5}} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'var(--background)', 
                        border: '1px solid var(--card-border)',
                        borderRadius: '10px'
                      }} 
                    />
                    <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, change }: any) {
  return (
    <div className="card">
      <div className={styles.statHeader}>
        <div className={styles.statIcon}>{icon}</div>
        <span className={styles.change}>{change}</span>
      </div>
      <div className={styles.statInfo}>
        <h4 className={styles.statLabel}>{label}</h4>
        <p className={styles.statValue}>{value}</p>
      </div>
    </div>
  );
}
