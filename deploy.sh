#!/bin/bash
echo "🚀 Iniciando actualización del Dashboard de Salud..."

# 1. Bajar cambios
git pull origin main

# 2. Instalar dependencias (solo si cambiaron)
npm install

# 3. Limpiar build viejo y compilar
rm -rf .next
NODE_OPTIONS="--max-old-space-size=4096" npm run build

# 4. Reiniciar en PM2
pm2 restart salud-dashboard

echo "✅ ¡Dashboard actualizado y online!"
