$ErrorActionPreference = "Stop"
$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $appRoot
$port = if ($env:BC_CRM_PORT) { $env:BC_CRM_PORT } else { "8787" }
$ip = (Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1 -ExpandProperty IPAddress)
Write-Host "BC Soluciones CRM"
Write-Host "Equipo local: http://localhost:$port"
if ($ip) { Write-Host "Acceso desde la red: http://$ip`:$port" }
Write-Host "Mantén esta ventana abierta mientras el equipo use el CRM."
npm start
