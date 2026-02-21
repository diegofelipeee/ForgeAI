# ForgeAI SSH Tunnel — Secure access to VPS dashboard
# Usage: .\scripts\forge-tunnel.ps1 [start|stop|status]

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "status")]
    [string]$Action = "start"
)

$VPS_HOST = "167.86.85.73"
$VPS_USER = "root"
$LOCAL_PORT = 18800
$REMOTE_PORT = 18800
$PID_FILE = "$env:TEMP\forgeai-tunnel.pid"

function Start-Tunnel {
    $existing = Get-Process ssh -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*$LOCAL_PORT*$VPS_HOST*" -or $_.CommandLine -like "*forgeai*"
    }
    if ($existing) {
        Write-Host "[ForgeAI] Tunnel already running (PID: $($existing.Id))" -ForegroundColor Yellow
        Write-Host "[ForgeAI] Dashboard: http://127.0.0.1:$LOCAL_PORT" -ForegroundColor Cyan
        return
    }

    Write-Host "[ForgeAI] Starting SSH tunnel to $VPS_HOST..." -ForegroundColor Green
    Write-Host "[ForgeAI] You may be prompted for the SSH password." -ForegroundColor Gray

    $proc = Start-Process ssh -ArgumentList @(
        "-N", "-L", "${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}",
        "-o", "ServerAliveInterval=60",
        "-o", "ServerAliveCountMax=3",
        "-o", "ExitOnForwardFailure=yes",
        "$VPS_USER@$VPS_HOST"
    ) -PassThru

    Start-Sleep -Seconds 3

    if ($proc -and !$proc.HasExited) {
        $proc.Id | Out-File $PID_FILE -Force
        Write-Host ""
        Write-Host "  ====================================" -ForegroundColor DarkCyan
        Write-Host "  ForgeAI Tunnel Active" -ForegroundColor Green
        Write-Host "  ====================================" -ForegroundColor DarkCyan
        Write-Host "  Dashboard:  http://127.0.0.1:$LOCAL_PORT" -ForegroundColor Cyan
        Write-Host "  WebSocket:  ws://127.0.0.1:$LOCAL_PORT/ws" -ForegroundColor Cyan
        Write-Host "  PID:        $($proc.Id)" -ForegroundColor Gray
        Write-Host "  ====================================" -ForegroundColor DarkCyan
        Write-Host ""
        Write-Host "  Stop with: .\scripts\forge-tunnel.ps1 stop" -ForegroundColor Gray
    } else {
        Write-Host "[ForgeAI] Failed to start tunnel. Check SSH credentials." -ForegroundColor Red
    }
}

function Stop-Tunnel {
    $stopped = $false
    if (Test-Path $PID_FILE) {
        $pid = Get-Content $PID_FILE
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $pid -Force
            $stopped = $true
        }
        Remove-Item $PID_FILE -Force
    }

    # Also kill any lingering tunnel processes
    Get-Process ssh -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*$LOCAL_PORT*$VPS_HOST*"
    } | ForEach-Object {
        Stop-Process -Id $_.Id -Force
        $stopped = $true
    }

    if ($stopped) {
        Write-Host "[ForgeAI] Tunnel stopped." -ForegroundColor Yellow
    } else {
        Write-Host "[ForgeAI] No active tunnel found." -ForegroundColor Gray
    }
}

function Get-TunnelStatus {
    $running = $false
    if (Test-Path $PID_FILE) {
        $pid = Get-Content $PID_FILE
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) { $running = $true }
    }

    if ($running) {
        Write-Host "[ForgeAI] Tunnel ACTIVE (PID: $pid)" -ForegroundColor Green
        Write-Host "[ForgeAI] Dashboard: http://127.0.0.1:$LOCAL_PORT" -ForegroundColor Cyan
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$LOCAL_PORT/health" -TimeoutSec 3
            Write-Host "[ForgeAI] Gateway: $($health.status) | uptime: $([math]::Round($health.uptime/1000))s | v$($health.version)" -ForegroundColor Green
        } catch {
            Write-Host "[ForgeAI] Gateway: unreachable (tunnel may still be connecting)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[ForgeAI] Tunnel NOT active." -ForegroundColor Red
        Write-Host "[ForgeAI] Start with: .\scripts\forge-tunnel.ps1 start" -ForegroundColor Gray
    }
}

switch ($Action) {
    "start"  { Start-Tunnel }
    "stop"   { Stop-Tunnel }
    "status" { Get-TunnelStatus }
}
