@echo off
cd /d "%~dp0"

echo =====================================
echo   SEMAFORO DE CAMARAS
echo =====================================
echo.

REM 1) Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo Python no detectado. Descargando...

    set PYTHON_URL=https://www.python.org/ftp/python/3.12.3/python-3.12.3-amd64.exe
    set PYTHON_INSTALLER=%TEMP%\python_installer.exe

    powershell -Command "Invoke-WebRequest '%PYTHON_URL%' -OutFile '%PYTHON_INSTALLER%'"

    echo Instalando Python...
    "%PYTHON_INSTALLER%" /quiet InstallAllUsers=0 PrependPath=1 Include_test=0

    echo Python instalado.
    timeout /t 5 >nul
)

REM 2) Verificar Python otra vez
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python no pudo instalarse correctamente.
    pause
    exit
)

REM 3) Crear entorno virtual si no existe
if not exist ".venv\Scripts\python.exe" (
    echo Creando entorno virtual...
    python -m venv .venv
)

REM 4) Instalar Flask si no esta
".\.venv\Scripts\pip.exe" show flask >nul 2>&1
if errorlevel 1 (
    echo Instalando Flask...
    ".\.venv\Scripts\pip.exe" install flask
)

REM 5) Iniciar backend
echo Iniciando servidor...
start "" ".\.venv\Scripts\python.exe" app.py

REM 6) Esperar y abrir navegador
timeout /t 2 >nul
start http://127.0.0.1:8080

echo.
echo Semaforo iniciado correctamente.
echo Esta ventana puede cerrarse.

