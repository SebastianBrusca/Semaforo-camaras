$ErrorActionPreference = "Stop"

$base = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $base

Write-Host "====================================="
Write-Host " Iniciando Semáforo de Cámaras (LOCAL)"
Write-Host "====================================="
Write-Host ""

$python = Join-Path $base ".venv\Scripts\python.exe"

if (!(Test-Path $python)) {
    Write-Host "ERROR: No se encontró Python en .venv" -ForegroundColor Red
    Write-Host "Ruta esperada:"
    Write-Host $python
    Write-Host ""
    Read-Host "Presione ENTER para cerrar"
    exit
}

Write-Host "Usando Python:"
& $python --version
Write-Host ""

Write-Host "Iniciando backend..."
Write-Host ""

# Levanta Flask (LOCAL)
Start-Process `
    -FilePath $python `
    -ArgumentList "app.py" `
    -WorkingDirectory $base `
    -NoNewWindow

Start-Sleep -Seconds 2

Write-Host "Abriendo navegador..."
Start-Process "http://127.0.0.1:8080"

Write-Host ""
Write-Host "Si el semáforo no abre, el backend no inició correctamente."
Write-Host "Esta ventana puede cerrarse cuando termine de usar el sistema."
