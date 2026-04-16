@echo off
REM  MAC Worker Setup - PC3 (Reasoning Model)
REM  Double-click this file to set up everything.

echo.
echo   ================================================
echo       MAC Worker Setup - PC3 Reasoning Model
echo       DeepSeek-R1-7B on RTX 3060
echo   ================================================
echo.

REM -- Check if running as admin --
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Requesting Administrator privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
    exit /b
)

echo [OK] Running as Administrator
echo.

REM -- Step 1: Check NVIDIA GPU --
echo [1/6] Checking NVIDIA GPU...
nvidia-smi >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] No NVIDIA GPU or driver found!
    echo         Install drivers from: https://www.nvidia.com/Download/index.aspx
    pause
    exit /b 1
)
echo [OK] NVIDIA GPU detected
echo.

REM -- Step 2: Install WSL2 --
echo [2/6] Checking WSL2...
wsl --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Installing WSL2... This may take a few minutes.
    wsl --install --no-distribution
    echo.
    echo [!] WSL2 installed. You may need to REBOOT.
    echo     After reboot, double-click this file again.
    echo.
    pause
    exit /b
)
echo [OK] WSL2 is ready
echo.

REM -- Step 3: Check Docker Desktop --
echo [3/6] Checking Docker Desktop...
docker version >nul 2>&1
if %errorLevel% neq 0 (
    if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
        echo [!] Docker Desktop installed but not running. Starting...
        start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
        echo     Waiting for Docker to start (30-60 seconds)...
        timeout /t 60 /nobreak >nul
        docker version >nul 2>&1
        if %errorLevel% neq 0 (
            echo [!] Docker still starting. Wait a bit more and re-run.
            pause
            exit /b
        )
    ) else (
        echo [!] Docker Desktop not found. Downloading...
        powershell -Command "Invoke-WebRequest -Uri 'https://desktop.docker.com/win/main/amd64/Docker%%20Desktop%%20Installer.exe' -OutFile '%TEMP%\DockerInstaller.exe' -UseBasicParsing"
        echo [!] Installing Docker Desktop...
        "%TEMP%\DockerInstaller.exe" install --quiet --accept-license
        echo.
        echo [!] Docker installed! Please:
        echo     1. Start Docker Desktop from Start Menu
        echo     2. Wait for it to fully start
        echo     3. Double-click this file again
        echo.
        pause
        exit /b
    )
)
echo [OK] Docker is running
echo.

REM -- Step 4: Open firewall --
echo [4/6] Configuring firewall...
netsh advfirewall firewall show rule name="MAC vLLM Worker" >nul 2>&1
if %errorLevel% neq 0 (
    netsh advfirewall firewall add rule name="MAC vLLM Worker" dir=in action=allow protocol=TCP localport=8001 profile=private,domain >nul
    echo [OK] Firewall port 8001 opened
) else (
    echo [OK] Firewall rule already exists
)
echo.

REM -- Step 5: Setup worker directory --
echo [5/6] Setting up worker files...
set "WORKER_DIR=%USERPROFILE%\mac-worker"
if not exist "%WORKER_DIR%" mkdir "%WORKER_DIR%"

copy /Y "%~dp0docker-compose.yml" "%WORKER_DIR%\docker-compose.yml" >nul
copy /Y "%~dp0worker-agent.py" "%WORKER_DIR%\worker-agent.py" >nul
copy /Y "%~dp0.env" "%WORKER_DIR%\.env" >nul
echo [OK] Files copied to %WORKER_DIR%
echo.

REM -- Step 6: Get enrollment token --
echo [6/6] Almost done!
echo.
echo   You need an enrollment token from the admin.
echo   Go to: http://10.10.13.30 -- Admin -- Cluster -- Generate Token
echo.
set /p TOKEN="Paste enrollment token here: "
if "%TOKEN%"=="" (
    echo [!] No token entered. Edit %WORKER_DIR%\.env later.
) else (
    powershell -Command "(Get-Content '%WORKER_DIR%\.env') -replace 'ENROLLMENT_TOKEN=__PASTE_TOKEN_HERE__', 'ENROLLMENT_TOKEN=%TOKEN%' | Set-Content '%WORKER_DIR%\.env'"
    echo [OK] Token saved
)
echo.

echo ================================================
echo  Starting MAC Worker...
echo  First run downloads the model (~4GB).
echo  May take 15-20 minutes on WiFi.
echo ================================================
echo.

cd /d "%WORKER_DIR%"
docker compose up -d

echo.
echo ================================================
echo  DONE! Worker is starting in background.
echo.
echo  Monitor: cd %WORKER_DIR% then docker compose logs -f
echo  Look for "vLLM ready" and "Enrolled" messages.
echo ================================================
echo.
pause
