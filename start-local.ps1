$port = 8000
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  $pids = $listener | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $pids) {
    try {
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-Host "Stopped stale process on port ${port}: PID=${procId}"
    } catch {
      Write-Host "Failed to stop PID=${procId}: $($_.Exception.Message)"
    }
  }
}

Set-Location $PSScriptRoot
Write-Host "Serving D:\new_year at http://127.0.0.1:$port"
python -m http.server $port --bind 127.0.0.1 --directory $PSScriptRoot



