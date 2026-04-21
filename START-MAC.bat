@echo off
setlocal EnableDelayedExpansion

echo.
echo  =========================================================
echo    MAC ^| MBM AI Cloud  ^|  Smart Start
echo  =========================================================
echo.

REM ── Elevate to administrator if not already ─────────────────
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  [*] Requesting admin privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
    exit /b
)

REM ── Auto-detect this machine's LAN / WiFi IP ────────────────
for /f "usebackq tokens=*" %%I in (`powershell -NoProfile -Command ^
    "$ip = (Get-NetIPAddress -AddressFamily IPv4 ^| ^
         Where-Object { $_.IPAddress -notmatch '^127\.' -and ^
                        $_.IPAddress -notmatch '^169\.254' -and ^
                        $_.PrefixOrigin -ne 'WellKnown' } ^| ^
         Sort-Object InterfaceMetric ^| ^
         Select-Object -ExpandProperty IPAddress -First 1); ^
     if ($ip) { $ip } else { 'localhost' }"`) do set WIFI_IP=%%I

echo  [*] Host IP detected: !WIFI_IP!

REM ── Open firewall ports if rules don't exist ────────────────
netsh advfirewall firewall show rule name="MAC Web UI" >nul 2>&1
if %errorLevel% neq 0 (
    netsh advfirewall firewall add rule name="MAC Web UI" dir=in action=allow protocol=TCP localport=80 profile=any >nul
    echo  [OK] Firewall: port 80 opened
)
netsh advfirewall firewall show rule name="MAC API Server" >nul 2>&1
if %errorLevel% neq 0 (
    netsh advfirewall firewall add rule name="MAC API Server" dir=in action=allow protocol=TCP localport=8000 profile=any >nul
    echo  [OK] Firewall: port 8000 opened
)
netsh advfirewall firewall show rule name="MAC vLLM" >nul 2>&1
if %errorLevel% neq 0 (
    netsh advfirewall firewall add rule name="MAC vLLM" dir=in action=allow protocol=TCP localport=8001 profile=any >nul
    echo  [OK] Firewall: port 8001 opened
)

REM ── Set all UP network adapters to Private (allows sharing) ─
powershell -NoProfile -Command ^
    "Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object { ^
         try { Set-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex ^
               -NetworkCategory Private -EA SilentlyContinue } catch {} }" >nul 2>&1
echo  [OK] Network profiles set to Private

REM ── Ensure Docker Engine is running ─────────────────────────
docker info >nul 2>&1
if %errorLevel% neq 0 (
    echo  [!] Docker not running. Searching for Docker Desktop...
    set DOCKER_FOUND=0
    for %%P in (
        "%PROGRAMFILES%\Docker\Docker\Docker Desktop.exe"
        "%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe"
        "%PROGRAMFILES(X86)%\Docker\Docker\Docker Desktop.exe"
    ) do (
        if exist %%P (
            echo  [*] Starting Docker Desktop...
            start "" %%P
            set DOCKER_FOUND=1
            goto :docker_wait
        )
    )
    if !DOCKER_FOUND!==0 (
        echo  [ERROR] Docker Desktop not found. Install it from https://www.docker.com and retry.
        pause & exit /b 1
    )
    :docker_wait
    echo  [*] Waiting for Docker Engine (up to 120s)...
    set /a WAITED=0
    :wait_loop
        timeout /t 6 /nobreak >nul
        set /a WAITED+=6
        docker info >nul 2>&1
        if %errorLevel%==0 goto :docker_ready
        if !WAITED! GEQ 120 (
            echo  [ERROR] Docker did not start in time. Run again after Docker is ready.
            pause & exit /b 1
        )
        echo     Still waiting... (!WAITED!s)
        goto :wait_loop
    :docker_ready
)
echo  [OK] Docker Engine is running

REM ── Navigate to MAC project folder ──────────────────────────
cd /d "%~dp0"
echo  [*] Project folder: %CD%
echo.

REM ── Smart compose: build only if main image is missing ──────
echo  [*] Checking container status...

docker image inspect mac-mac >nul 2>&1
set IMG_EXISTS=%errorLevel%

if %IMG_EXISTS% neq 0 (
    echo  [!] First run — building images. This takes 3-5 minutes...
    docker compose up -d --build
) else (
    echo  [*] Images found — starting any stopped services...
    docker compose up -d
)

if %errorLevel% neq 0 (
    echo.
    echo  [ERROR] Docker Compose failed. See errors above.
    pause & exit /b 1
)

REM ── Show final status ────────────────────────────────────────
echo.
echo  [*] Service status:
docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>nul
echo.
echo  =========================================================
echo.
echo   MAC is running!
echo.
echo   Open on this PC:      http://localhost
echo   Open on network:      http://!WIFI_IP!
echo.
echo   Share http://!WIFI_IP! with anyone on the same WiFi/LAN
echo.
echo   Accounts:
echo     Admin:   abhisek.cse@mbm.ac.in  /  Admin@1234
echo     Faculty: raj.cse@mbm.ac.in      /  Faculty@1234
echo     Student: 21CS045                /  Student@1234
echo.
echo   Commands:
echo     Stop all:  docker compose down
echo     Rebuild:   docker compose up -d --build
echo     API logs:  docker compose logs -f mac
echo.
echo  =========================================================
echo.
pause

