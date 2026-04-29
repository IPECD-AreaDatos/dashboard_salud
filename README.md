# Dashboard Seguimiento Obstétrico - Corrientes

## Visión General
Este repositorio aloja la versión modernizada del **Dashboard de Seguimiento de Pacientes Obstétricos** del Ministerio de Salud (Corrientes). Se ha migrado desde una arquitectura basada puramente en Python/Dash hacia un stack web moderno y escalable utilizando **Next.js (React)**, manteniendo intacta la lógica de negocio, filtros avanzados (RBAC) y la integridad de los datos de la base de datos PostgreSQL.

El objetivo principal de esta plataforma es proveer a los **Centros de Salud** y **Maternidades** una herramienta ágil para:
1. Buscar y filtrar pacientes activas según riesgo, FPP, y atraso en sus controles.
2. Registrar los resultados de seguimientos (contactos telefónicos/presenciales).
3. Visualizar estadísticas en tiempo real sobre la población objetivo.

---

## Stack Tecnológico 💻
- **Frontend**: [Next.js (App Router)](https://nextjs.org/) + React 19
- **Estilos**: CSS Modules (`.module.css`) nativo, con diseño adaptativo y moderno (inspirado en System UI).
- **Gráficos**: [Recharts](https://recharts.org/) (Componentes interactivos para Top 15 y métricas).
- **Autenticación**: [NextAuth.js](https://next-auth.js.org/) con soporte de manejo de sesiones y encriptación de contraseñas (`bcrypt`).
- **Base de Datos**: PostgreSQL (`pg` module) consumiendo la capa _Gold_ del pipeline ETL de datos médicos (`pacientes_gold`).
- **Iconografía**: [Lucide React](https://lucide.dev/).

---

## Distribución del Repositorio 📁

\`\`\`text
dashboard_salud/
├── src/
│   ├── app/
│   │   ├── api/                   # Backend: Endpoints RESTful para la App
│   │   │   ├── auth/              # Lógica de NextAuth (login, sesión)
│   │   │   ├── pacientes/         # GET pacientes_gold con filtros y RBAC
│   │   │   ├── seguimientos/      # POST de nuevo contacto, GET de historial
│   │   │   └── stats/             # GET métricas agregadas para Recharts
│   │   ├── dashboard/             # Frontend: Rutas protegidas
│   │   │   ├── audit/             # Módulo de auditoría (En desarrollo)
│   │   │   ├── stats/             # Dashboard de Estadísticas Recharts
│   │   │   └── page.tsx           # Dashboard Principal (Tabla Seguimiento)
│   │   ├── login/                 # Pantalla de Autenticación
│   │   ├── globals.css            # Estilos globales y reseteos
│   │   └── layout.tsx             # Layout base de Next.js
│   ├── components/                # Componentes Reusables
│   │   ├── Navbar.tsx             # Menú de navegación principal (y RBAC links)
│   │   └── RegistroContactoModal  # Modal interactivo para registrar contactos
│   └── lib/
│       └── db.ts                  # Pool de conexiones a PostgreSQL
├── .env                           # Variables de Entorno (DB, NextAuth URLs)
└── package.json                   # Dependencias del proyecto
\`\`\`

---

## Características Implementadas (Migración desde Tony/Dash) 🚀

### 1. Sistema de Autenticación (RBAC)
- Autenticación por medio de **NextAuth** utilizando credenciales extraídas de la tabla PostgreSQL `users`.
- Manejo de roles: `Centro de Salud`, `Maternidad`, `Administrador`. Los datos que devuelve la API están filtrados **estrictamente** a nivel servidor según el rol de la sesión iniciada.

### 2. Dashboard de Seguimiento (Grilla Principal)
- Interfaz fluida y limpia (sin paginación obligatoria) con **Scroll interno y Encabezados Fijos** para agilizar la búsqueda del personal médico.
- **Filtros Avanzados Dinámicos**:
  - Búsqueda por DNI (Coincidencia parcial).
  - Filtro por Establecimiento.
  - Filtro booleano por "Riesgo" (Sí/Todas).
  - Filtro numérico de Días de Atraso en control ("+ 30 días", "+ 60 días", etc).
  - Filtros opcionales de "FPP Desde" y "FPP Hasta".

### 3. Registro de Contacto (Modal Interactivo)
- Nuevo modal que permite realizar una trazabilidad de los contactos telefónicos o presenciales con la embarazada.
- Muestra de antemano el **Domicilio** e información útil para el llamador.
- **Formulario integral**: 
  - ¿Se logró contacto? (Sí/No).
  - Persona contactada (Paciente/Familiar/Vecino).
  - Medio utilizado, teléfono efectivo, observaciones de texto libre y programación de Próxima Cita.
- **Historial Integrado**: Incluye un acordeón inferior que lista en orden cronológico los contactos previos intentados con la paciente sin salir de la vista actual.
- Actualización sincrónica: Al guardar, la tabla principal se recarga automáticamente y la paciente recibe un tilde verde indicando que fue "Contactada".

### 4. Dashboard de Estadísticas (Recharts)
- Replicación nativa en React de las métricas creadas por Tony en Python.
- Respeto total a la **Lógica de Filtrado SQL Base**:
  - `fecha_probable_parto >= CURRENT_DATE`
  - Filtros condicionales por `fecha_ultimo_control > '2025-03-01'`.
- Gráficos renderizados del lado del cliente para las estadísticas poblacionales y un Ranking (Top 15) para Establecimientos generales y de Riesgo con atraso.

### 5. Página de Auditoría (Placeholder)
- Acceso restringido **únicamente al Rol Administrador**.
- Diseño pre-armado y estructurado listo para consumir los logs de trazabilidad del proceso ETL en fases futuras.

---

## Guía de Despliegue Rápido ⚙️

### 1. Variables de Entorno (\`.env\`)
Es vital asegurar que el archivo `.env` exista en la raíz con el siguiente formato:

\`\`\`env
# Cadena de conexión Postgres
DATABASE_URL=postgresql+psycopg2://USUARIO:PASSWORD@HOST:5432/salud

# Configuración de NextAuth (Imprescindibles para que el Login funcione)
NEXTAUTH_SECRET=un_string_super_seguro
NEXTAUTH_URL=http://localhost:3000   # (O el dominio de producción)
\`\`\`

### 2. Instalación de Dependencias
Asegurate de estar usando Node.js v18 o superior.
\`\`\`bash
npm install
\`\`\`

### 3. Iniciar Servidor en Desarrollo
\`\`\`bash
npm run dev
\`\`\`
El proyecto levantará en \`http://localhost:3000\`.
*(Nota: Si recibes errores de redirección al intentar cerrar sesión o logearte, verifica que tu puerto de ejecución coincida con el puerto declarado en `NEXTAUTH_URL`).*

### 4. Compilación de Producción
\`\`\`bash
npm run build
npm run start
\`\`\`

---

## Mantenimiento y Extensibilidad 🛠️

- **Agregar Nuevos Campos de BD**: Si la tabla `pacientes_gold` se amplía, debes actualizar la query principal ubicada en `src/app/api/pacientes/route.ts` y luego ajustar la UI de la tarjeta o modal en el Frontend.
- **Diseño General**: Toda la paleta de colores y tamaños reside en los módulos CSS locales. Las variables principales se heredan del contenedor general, fomentando una fácil transición si alguna vez se decide migrar a TailwindCSS.

**Creado y optimizado por el equipo para mejorar la usabilidad del sistema de salud pública provincial.**
