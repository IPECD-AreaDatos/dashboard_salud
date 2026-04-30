# dev.ps1 - Script de desarrollo local para Dashboard Salud
# Levanta la aplicación Next.js (puerto 3000)

$root = $PSScriptRoot

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " Dashboard Salud - Entorno de Desarrollo Local " -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Web     -> http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "Levantando servicio..." -ForegroundColor Yellow
Write-Host ""

# Terminal 1: Next.js app
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
    `$host.UI.RawUI.WindowTitle = 'Dashboard Salud - Next.js (puerto 3000)';
    Write-Host '[WEB] Iniciando Next.js en modo dev...' -ForegroundColor Blue;
    Set-Location '$root';
    npm run dev
"

Write-Host "Servicio iniciado. Podés cerrar esta ventana original o usarla para otra cosa." -ForegroundColor Cyan
Write-Host ""
