#!/bin/bash
# Evitar que el build falle por falta de memoria en el EC2 de 8GB
export NODE_OPTIONS="--max-old-space-size=4096"

echo "?? Iniciando actualización robusta del Dashboard de Salud..."

# 1. Limpiar cualquier cambio accidental en el servidor y bajar lo nuevo
echo "?? Trayendo cambios de GitHub..."
git fetch origin main
git reset --hard origin/main

# 2. Instalar dependencias
echo "?? Instalando dependencias..."
npm install --quiet

# 3. Limpieza total y Build
echo "???  Compilando aplicación (Next.js)..."
rm -rf .next
if npm run build; then
    echo "? Build completado con éxito."
else
    echo "? Error en el build. Abortando deploy."
    exit 1
fi

# 4. Reinicio inteligente en PM2
# startOrRestart asegura que si el proceso no existe, lo crea; y si existe, lo refresca.
echo "?? Reiniciando proceso en PM2..."
pm2 startOrRestart ecosystem.config.js --name "salud-dashboard" || pm2 restart salud-dashboard

pm2 save
echo "? ¡Dashboard online en http://54.94.131.196/salud-dashboard!"