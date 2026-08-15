param()

$ErrorActionPreference = 'Stop'
$infraDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envPath = Join-Path $infraDir '.env'
$backupRoot = Join-Path $infraDir 'backups'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $backupRoot $stamp
$oldName = "n8n-pre-phase1-$stamp"

if (-not (Test-Path -LiteralPath $envPath)) { throw 'infra/n8n/.env nao encontrado' }

$values = @{}
foreach ($line in Get-Content -LiteralPath $envPath) {
  if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
  $parts = $line -split '=', 2
  $values[$parts[0].Trim()] = $parts[1]
}

foreach ($required in @('N8N_WEBHOOK_SECRET','SUPABASE_URL','WEBHOOK_URL','N8N_EDITOR_BASE_URL','OLLAMA_BASE_URL')) {
  if (-not $values.ContainsKey($required) -or [string]::IsNullOrWhiteSpace($values[$required])) {
    throw "$required precisa estar definido no .env"
  }
}

$inspection = docker inspect n8n | ConvertFrom-Json | Select-Object -First 1
if ($inspection.Name -ne '/n8n') { throw 'Container alvo inesperado' }
$n8nMount = $inspection.Mounts | Where-Object { $_.Destination -eq '/home/node/.n8n' } | Select-Object -First 1
if ($null -eq $n8nMount -or $n8nMount.Type -ne 'volume' -or $n8nMount.Name -ne 'n8n_data') {
  throw 'Volume persistente esperado n8n_data nao foi confirmado'
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
docker cp 'n8n:/home/node/.n8n/.' $backupDir
if ($LASTEXITCODE -ne 0) { throw 'Backup do n8n falhou; container nao sera alterado' }

$image = $inspection.Config.Image
$restartPolicy = $inspection.HostConfig.RestartPolicy.Name
if ([string]::IsNullOrWhiteSpace($restartPolicy) -or $restartPolicy -eq 'no') { $restartPolicy = 'unless-stopped' }

$runtimeEnv = Join-Path $backupDir 'runtime.env'
@(
  "N8N_WEBHOOK_SECRET=$($values['N8N_WEBHOOK_SECRET'])"
  "SUPABASE_URL=$($values['SUPABASE_URL'])"
  "WEBHOOK_URL=$($values['WEBHOOK_URL'])"
  "N8N_EDITOR_BASE_URL=$($values['N8N_EDITOR_BASE_URL'])"
  "OLLAMA_BASE_URL=$($values['OLLAMA_BASE_URL'])"
  'NODE_FUNCTION_ALLOW_BUILTIN=crypto'
  'N8N_BLOCK_ENV_ACCESS_IN_NODE=false'
  'N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true'
) | Set-Content -LiteralPath $runtimeEnv -Encoding ASCII

try {
  docker stop n8n | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel parar o n8n atual' }
  docker rename n8n $oldName
  if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel preservar o container anterior' }

  docker run -d `
    --name n8n `
    --restart $restartPolicy `
    --env-file $runtimeEnv `
    -p 5678:5678 `
    -v n8n_data:/home/node/.n8n `
    $image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Novo container n8n nao iniciou' }

  $healthy = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 2
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5678/healthz' -TimeoutSec 3
      if ($response.StatusCode -eq 200) { $healthy = $true; break }
    } catch {}
  }
  if (-not $healthy) { throw 'Novo n8n nao passou no health check' }

  Remove-Item -LiteralPath $runtimeEnv -Force
  Write-Host 'n8n recriado com sucesso; volume e workflows preservados.'
  Write-Host "Container anterior preservado parado como: $oldName"
  Write-Host "Backup local criado em: $backupDir"
} catch {
  docker rm -f n8n 2>$null | Out-Null
  docker rename $oldName n8n 2>$null
  docker start n8n 2>$null | Out-Null
  Remove-Item -LiteralPath $runtimeEnv -Force -ErrorAction SilentlyContinue
  throw "Falha com rollback automatico executado: $($_.Exception.Message)"
}
