@echo off
setlocal EnableDelayedExpansion
title MAC Platform — One-Click Setup
color 0A

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║         MAC Platform — One-Click Setup               ║
echo  ║   Multi-Agent Classroom  (c) 2025                    ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

:: ── Step 1: Check Docker Desktop is running ────────────────
echo [1/6] Checking Docker Desktop...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Docker Desktop is not running.
    echo  Please start Docker Desktop and run this script again.
    echo.
    pause
    exit /b 1
)
echo  OK — Docker is running.

:: ── Step 2: Check Python ───────────────────────────────────
echo [2/6] Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Python not found. Install Python 3.11+ from https://python.org
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo  OK — %%v

:: ── Step 3: Start Postgres + Redis via Docker Compose ──────
echo [3/6] Starting PostgreSQL and Redis...
docker compose up -d postgres redis
if %errorlevel% neq 0 (
    echo  ERROR: docker compose failed. Make sure docker-compose.yml is present.
    pause
    exit /b 1
)
echo  OK — Postgres and Redis started.
echo  Waiting 3 seconds for DB to be ready...
timeout /t 3 /nobreak >nul

:: ── Step 4: Install Python dependencies ───────────────────
echo [4/6] Installing Python dependencies...
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo  WARNING: Some packages may have failed. Check requirements.txt.
)
echo  OK — Dependencies installed.

:: ── Step 5: Detect LAN IP ──────────────────────────────────
echo [5/6] Detecting network address...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R "IPv4.*192\.\|IPv4.*10\.\|IPv4.*172\."') do (
    set LAN_IP=%%a
    set LAN_IP=!LAN_IP: =!
    goto :found_ip
)
set LAN_IP=localhost
:found_ip
echo  OK — LAN IP: %LAN_IP%

:: ── Step 6: Start the MAC server ──────────────────────────
echo [6/6] Starting MAC server...
echo.
echo  ┌───────────────────────────────────────────────────┐
echo  │  MAC is starting on:                              │
echo  │  Local:    http://localhost:8000                  │
echo  │  Network:  http://%LAN_IP%:8000                   │
echo  │                                                   │
echo  │  Press Ctrl+C to stop the server.                 │
echo  └───────────────────────────────────────────────────┘
echo.

uvicorn mac.main:app --host 0.0.0.0 --port 8000 --reload

endlocal
