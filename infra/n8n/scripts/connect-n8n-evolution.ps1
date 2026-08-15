param()

$ErrorActionPreference = 'Stop'
$infraDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$backupRoot = Join-Path $infraDir 'backups'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $backupRoot $stamp
$oldName = "n8n-pre-whatsapp-$stamp"

$n8n = docker inspect n8n | ConvertFrom-Json | Select-Object -First 1
$evolution = docker inspect evolution_api | ConvertFrom-Json | Select-Object -First 1
if ($n8n.Name -ne '/n8n' -or $evolution.Name -ne '/evolution_api') { throw 'Containers esperados nao encontrados' }

$n8nMount = $n8n.Mounts | Where-Object { $_.Destination -eq '/home/node/.n8n' } | Select-Object -First 1
if ($null -eq $n8nMount -or $n8nMount.Name -ne 'n8n_data') { throw 'Volume n8n_data nao confirmado' }

$n8nEnv = @{}
foreach ($entry in @($n8n.Config.Env)) { $parts = $entry -split '=', 2; if ($parts.Count -eq 2) { $n8nEnv[$parts[0]] = $parts[1] } }
$evolutionEnv = @{}
foreach ($entry in @($evolution.Config.Env)) { $parts = $entry -split '=', 2; if ($parts.Count -eq 2) { $evolutionEnv[$parts[0]] = $parts[1] } }

if ([string]::IsNullOrWhiteSpace($n8nEnv['N8N_WEBHOOK_SECRET'])) { throw 'N8N_WEBHOOK_SECRET ausente no n8n atual' }
if ([string]::IsNullOrWhiteSpace($evolutionEnv['AUTHENTICATION_API_KEY'])) { throw 'Chave da Evolution API ausente' }

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
docker cp 'n8n:/home/node/.n8n/.' $backupDir
if ($LASTEXITCODE -ne 0) { throw 'Backup falhou; nada sera alterado' }

$runtimeEnv = Join-Path $backupDir 'runtime.env'
$lines = @()
foreach ($name in @('N8N_WEBHOOK_SECRET','SUPABASE_URL','WEBHOOK_URL','N8N_EDITOR_BASE_URL','OLLAMA_BASE_URL')) {
  if (-not [string]::IsNullOrWhiteSpace($n8nEnv[$name])) { $lines += "$name=$($n8nEnv[$name])" }
}
$lines += @(
  'NODE_FUNCTION_ALLOW_BUILTIN=crypto,http,https'
  'N8N_BLOCK_ENV_ACCESS_IN_NODE=false'
  'N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true'
  'EVOLUTION_API_URL=http://evolution_api:8080'
  "EVOLUTION_API_KEY=$($evolutionEnv['AUTHENTICATION_API_KEY'])"
)
$lines | Set-Content -LiteralPath $runtimeEnv -Encoding ASCII

$image = $n8n.Config.Image
$restartPolicy = $n8n.HostConfig.RestartPolicy.Name
if ([string]::IsNullOrWhiteSpace($restartPolicy) -or $restartPolicy -eq 'no') { $restartPolicy = 'unless-stopped' }

try {
  docker stop n8n | Out-Null
  docker rename n8n $oldName
  docker run -d --name n8n --restart $restartPolicy --env-file $runtimeEnv `
    -p 5678:5678 -v n8n_data:/home/node/.n8n $image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Novo n8n nao iniciou' }
  docker network connect evolution-api_default n8n
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao conectar n8n a rede da Evolution API' }

  $healthy = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 2
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5678/healthz' -TimeoutSec 3
      if ($response.StatusCode -eq 200) { $healthy = $true; break }
    } catch {}
  }
  if (-not $healthy) { throw 'n8n nao passou no health check' }

  Remove-Item -LiteralPath $runtimeEnv -Force
  Write-Host 'n8n conectado com seguranca a Evolution API.'
  Write-Host "Container anterior preservado parado como: $oldName"
} catch {
  docker rm -f n8n 2>$null | Out-Null
  docker rename $oldName n8n 2>$null
  docker start n8n 2>$null | Out-Null
  Remove-Item -LiteralPath $runtimeEnv -Force -ErrorAction SilentlyContinue
  throw "Falha com rollback automatico: $($_.Exception.Message)"
}
