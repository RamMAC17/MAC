@echo off
REM  MAC Control Node - Start Everything
REM  Double-click this file to start MAC.

echo.
echo   ================================================
echo       MAC Control Node - MBM AI Cloud
echo       Starting API + DB + GPU + Search + RAG
echo   ================================================
echo.

REM -- Check admin for firewall --
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Requesting Administrator privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
    exit /b
)

REM -- Open firewall ports --
echo [1/3] Configuring firewall and network...

powershell -Command "Set-NetConnectionProfile -InterfaceAlias 'Wi-Fi' -NetworkCategory Private" >nul 2>&1
echo       WiFi set to Private (file sharing enabled)

netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes profile=private >nul 2>&1
netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes profile=private >nul 2>&1

netsh advfirewall firewall show rule name="MAC API Server" >nul 2>&1
if %errorLevel% neq 0 (
    netsh advfirewall firewall add rule name="MAC API Server" dir=in action=allow protocol=TCP localport=8000 profile=private,domain >nul
    echo       Port 8000 opened
)
netsh advfirewall firewall show rule name="MAC Web UI" >nul 2>&1
if %errorLevel% neq 0 (
    netsh advfirewall firewall add rule name="MAC Web UI" dir=in action=allow protocol=TCP localport=80 profile=private,domain >nul
    echo       Port 80 opened
)
netsh advfirewall firewall show rule name="MAC vLLM Local" >nul 2>&1
if %errorLevel% neq 0 (
    netsh advfirewall firewall add rule name="MAC vLLM Local" dir=in action=allow protocol=TCP localport=8001 profile=private,domain >nul
    echo       Port 8001 opened
)
echo [OK] Firewall configured
echo.

REM -- Share worker packages on network --
echo [1b] Setting up network share...
net share mac-workers >nul 2>&1
if %errorLevel% neq 0 (
    net share mac-workers="D:\MAC\worker-packages" /GRANT:Everyone,READ >nul 2>&1
    if %errorLevel% equ 0 (
        echo [OK] Shared: \\%COMPUTERNAME%\mac-workers
    ) else (
        echo [!] Could not create share - non-critical
    )
) else (
    echo [OK] Share already exists: \\%COMPUTERNAME%\mac-workers
)
echo.

REM -- Check Docker --
echo [2/3] Checking Docker...
docker version >nul 2>&1
if %errorLevel% neq 0 (
    if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
        echo [!] Starting Docker Desktop...
        start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
        echo     Waiting 60 seconds for Docker to start...
        timeout /t 60 /nobreak >nul
        docker version >nul 2>&1
        if %errorLevel% neq 0 (
            echo [!] Docker still starting. Wait and re-run.
            pause
            exit /b
        )
    ) else (
        echo [ERROR] Docker Desktop not installed!
        pause
        exit /b 1
    )
)
echo [OK] Docker is running
echo.

REM -- Start MAC --
echo [3/3] Starting MAC services...
cd /d "D:\MAC"
docker compose up -d --build

echo.
echo ================================================
echo.
echo   MAC Control Node is starting!
echo.
echo   Web UI:      http://localhost  (or http://10.10.13.30)
echo   API:         http://localhost:8000
echo   Admin Panel: http://localhost/#admin
echo.
echo   To generate enrollment tokens for worker PCs:
echo     Admin Panel -- Cluster tab -- Generate Token
echo.
echo   Worker packages: D:\MAC\worker-packages\
echo     pc2-coder\      -- Copy to PC2, run SETUP-PC2.bat
echo     pc3-reasoning\  -- Copy to PC3, run SETUP-PC3.bat
echo.
echo   Monitor logs: docker compose logs -f
echo ================================================
echo.
pause
