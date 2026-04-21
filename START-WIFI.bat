@echo off
REM  MAC WiFi Quick-Start
REM  Hosts the MAC platform on your WiFi network at http://10.10.13.30
REM  Double-click to start (no rebuild — fast launch).

echo.
echo   ================================================
echo       MAC — MBM AI Cloud
echo       WiFi Quick-Start  ^|  http://10.10.13.30
echo   ================================================
echo.

REM -- Elevate if not admin --
net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
    exit /b
)

REM -- Open firewall for port 80 --
netsh advfirewall firewall show rule name="MAC Web UI" >nul 2>&1
if %errorLevel% neq 0 (
    netsh advfirewall firewall add rule name="MAC Web UI" dir=in action=allow protocol=TCP localport=80 profile=private,domain >nul
    echo [OK] Port 80 opened in firewall
)
netsh advfirewall firewall show rule name="MAC API Server" >nul 2>&1
if %errorLevel% neq 0 (
    netsh advfirewall firewall add rule name="MAC API Server" dir=in action=allow protocol=TCP localport=8000 profile=private,domain >nul
    echo [OK] Port 8000 opened in firewall
)

REM -- Set WiFi to Private (needed for network sharing) --
powershell -Command "Set-NetConnectionProfile -InterfaceAlias 'Wi-Fi' -NetworkCategory Private" >nul 2>&1

REM -- Check Docker is running --
docker version >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Docker is not running. Starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo     Waiting 60 seconds for Docker to start...
    timeout /t 60 /nobreak >nul
    docker version >nul 2>&1
    if %errorLevel% neq 0 (
        echo [ERROR] Docker still not ready. Please start Docker Desktop manually and retry.
        pause
        exit /b 1
    )
)
echo [OK] Docker is running

REM -- Start MAC (no rebuild) --
echo.
echo [*] Starting MAC services...
cd /d "D:\MAC"
docker compose up -d

echo.
echo ================================================
echo.
echo   MAC is running!
echo.
echo   On THIS PC:      http://localhost
echo   On WiFi network: http://10.10.13.30
echo.
echo   Login accounts:
echo     Admin:   abhisek.cse@mbm.ac.in  /  Admin@1234
echo     Faculty: raj.cse@mbm.ac.in      /  Faculty@1234
echo     Student: 21CS045                /  Student@1234
echo.
echo   To stop:  docker compose down
echo   For logs: docker compose logs -f mac
echo ================================================
echo.
pause
