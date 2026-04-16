# ═══════════════════════════════════════════════════════════
#  MAC — Windows Firewall Rules for Cluster Communication
#  Run as Administrator on the Control Node (this PC)
#  
#  Opens ports for worker nodes to connect:
#    8000 = MAC API (enrollment, heartbeat)
#    5432 = PostgreSQL (if workers need direct DB — optional)
# ═══════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

# Check admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "Run as Administrator!" -ForegroundColor Red; exit 1 }

Write-Host "`n[MAC] Configuring Windows Firewall for cluster..." -ForegroundColor Cyan

# ── MAC API (port 8000) — REQUIRED ──────────────────────
$ruleName = "MAC API Server (8000)"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[OK]  Rule already exists: $ruleName" -ForegroundColor Green
} else {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private,Domain | Out-Null
    Write-Host "[OK]  Created: $ruleName" -ForegroundColor Green
}

# ── Web UI (port 80) — REQUIRED ─────────────────────────
$ruleName = "MAC Web UI (80)"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[OK]  Rule already exists: $ruleName" -ForegroundColor Green
} else {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Private,Domain | Out-Null
    Write-Host "[OK]  Created: $ruleName" -ForegroundColor Green
}

# ── vLLM inference (port 8001) — for local model on control node ──
$ruleName = "MAC vLLM Local (8001)"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "[OK]  Rule already exists: $ruleName" -ForegroundColor Green
} else {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 8001 -Action Allow -Profile Private,Domain | Out-Null
    Write-Host "[OK]  Created: $ruleName" -ForegroundColor Green
}

Write-Host "`n[MAC] Firewall configured. Workers can now connect to this PC." -ForegroundColor Green
Write-Host "  This PC's IP: $((Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like '*Wi-Fi*' -and $_.PrefixOrigin -eq 'Dhcp' } | Select-Object -First 1).IPAddress)" -ForegroundColor White
