# Start TeamSpeak Web gateway as a detached process (survives terminal close)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if ((Split-Path -Leaf $root) -eq 'deploy') { $root = Split-Path -Parent $root }
Set-Location $root

$port = if ($env:PORT) { $env:PORT } else { '8080' }

# Already listening?
$listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listen) {
  Write-Host "Gateway already listening on port $port (PID $($listen[0].OwningProcess))"
  exit 0
}

$node = if ($env:ProgramFiles) { Join-Path $env:ProgramFiles 'nodejs\node.exe' } else { 'node' }
if (-not (Test-Path $node)) { $node = (Get-Command node).Source }

$cli = Join-Path $root 'node_modules\tsx\dist\cli.mjs'
if (-not (Test-Path $cli)) {
  Write-Host 'node_modules missing — run npm install first'
  exit 1
}

$log = Join-Path $root 'gateway-run.log'
$cmd = "`"$node`" `"$cli`" gateway/src/index.ts"
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
  CommandLine = $cmd
  CurrentDirectory = $root
}
if ($r.ReturnValue -ne 0) {
  Write-Host "Failed to start process, code $($r.ReturnValue)"
  exit 1
}

Start-Sleep -Seconds 2
$ok = Test-NetConnection 127.0.0.1 -Port $port -WarningAction SilentlyContinue
if ($ok.TcpTestSucceeded) {
  Write-Host "Gateway started PID $($r.ProcessId) → http://127.0.0.1:$port"
} else {
  Write-Host "Process created but port $port not listening yet. Check: $log"
  exit 1
}
