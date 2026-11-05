#!/usr/bin/env bash
set -Eeuo pipefail

# Limitar el heap para el build en la EC2 de 8 GB.
export NODE_OPTIONS="--max-old-space-size=4096"

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_dir"

# Los comandos SSH no interactivos no cargan NVM desde .bashrc.
if [[ -s /home/ubuntu/.nvm/nvm.sh ]]; then
  # shellcheck disable=SC1091
  source /home/ubuntu/.nvm/nvm.sh
fi

for command_name in git npm pm2 curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'No se encontró %s en PATH. Abortando.\n' "$command_name" >&2
    exit 1
  fi
done

echo "Actualizando Dashboard de Salud en EC2..."
git fetch origin main
git reset --hard origin/main

echo "Instalando dependencias..."
npm install --quiet

# Conservar el último build completo hasta comprobar el nuevo.
backup_dir=".next.rollback.$$"
if [[ -d .next ]]; then
  mv .next "$backup_dir"
fi

restore_previous_build() {
  if [[ -d "$backup_dir" ]]; then
    rm -rf .next
    mv "$backup_dir" .next
  fi
}

echo "Compilando Next.js..."
if ! npm run build; then
  restore_previous_build
  echo "Falló el build; se restauró el artefacto anterior." >&2
  exit 1
fi

echo "Reiniciando salud-dashboard en el puerto 3005..."
if ! pm2 restart salud-dashboard; then
  restore_previous_build
  echo "PM2 no pudo reiniciar salud-dashboard." >&2
  exit 1
fi

http_status=""
for attempt in {1..30}; do
  http_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:3005/salud-dashboard || true)"
  if [[ "$http_status" =~ ^[23][0-9][0-9]$ ]]; then
    rm -rf "$backup_dir"
    pm2 save
    echo "Dashboard respondió HTTP $http_status en EC2."
    exit 0
  fi
  sleep 1
done

restore_previous_build
pm2 restart salud-dashboard || true
printf 'El dashboard no respondió tras el reinicio (HTTP %s).\n' "$http_status" >&2
exit 1
