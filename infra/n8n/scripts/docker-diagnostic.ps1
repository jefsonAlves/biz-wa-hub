param()

$ErrorActionPreference = 'Continue'
$infraDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$repoDir = Split-Path -Parent (Split-Path -Parent $infraDir)
$reportDir = Join-Path $repoDir 'work'
$reportPath = Join-Path $reportDir 'docker-diagnostic.json'
$composePath = Join-Path $infraDir 'docker-compose.yml'
$envPath = Join-Path $infraDir '.env'

New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$requiredVariables = @(
  'N8N_WEBHOOK_SECRET',
  'N8N_ENCRYPTION_KEY',
  'N8N_USER_MANAGEMENT_JWT_SECRET',
  'DB_POSTGRESDB_PASSWORD',
  'SUPABASE_URL',
  'WEBHOOK_URL',
  'N8N_EDITOR_BASE_URL',
  'OLLAMA_BASE_URL'
)

$envState = @{}
$envLines = if (Test-Path -LiteralPath $envPath) { Get-Content -LiteralPath $envPath } else { @() }
foreach ($name in $requiredVariables) {
  $line = $envLines | Where-Object { $_ -match ('^' + [regex]::Escape($name) + '=') } | Select-Object -Last 1
  $value = if ($null -eq $line) { $null } else { ($line -split '=', 2)[1] }
  $envState[$name] = if ($null -eq $value) { 'absent' } elseif ([string]::IsNullOrWhiteSpace($value)) { 'empty' } else { 'defined' }
}

$containers = @()
try {
  $containers = docker ps -a --format '{{json .}}' | ForEach-Object {
    $item = $_ | ConvertFrom-Json
    $inspection = docker inspect $item.Names | ConvertFrom-Json | Select-Object -First 1
    $environment = @{}
    foreach ($entry in @($inspection.Config.Env)) {
      $parts = $entry -split '=', 2
      $environment[$parts[0]] = if ($parts.Count -gt 1 -and -not [string]::IsNullOrWhiteSpace($parts[1])) { 'defined' } else { 'empty' }
    }
    $safeEnvironmentNames = @(
      'NODE_FUNCTION_ALLOW_BUILTIN', 'N8N_WEBHOOK_SECRET', 'N8N_ENCRYPTION_KEY',
      'DB_TYPE', 'EXECUTIONS_MODE', 'QUEUE_BULL_REDIS_HOST', 'WEBHOOK_URL',
      'AUTHENTICATION_API_KEY', 'SERVER_URL', 'WEBHOOK_GLOBAL_URL'
    )
    $safeEnvironment = @{}
    foreach ($name in $safeEnvironmentNames) {
      $safeEnvironment[$name] = if ($environment.ContainsKey($name)) { $environment[$name] } else { 'absent' }
    }
    [ordered]@{
      name = $item.Names
      image = $item.Image
      state = $item.State
      status = $item.Status
      ports = $item.Ports
      compose_project = $inspection.Config.Labels.'com.docker.compose.project'
      compose_service = $inspection.Config.Labels.'com.docker.compose.service'
      compose_working_dir = $inspection.Config.Labels.'com.docker.compose.project.working_dir'
      compose_config_files = $inspection.Config.Labels.'com.docker.compose.project.config_files'
      environment = $safeEnvironment
      mounts = @($inspection.Mounts | ForEach-Object {
        [ordered]@{ type = $_.Type; name = $_.Name; source = $_.Source; destination = $_.Destination }
      })
      networks = @($inspection.NetworkSettings.Networks.PSObject.Properties.Name)
    }
  }
} catch {
  $containers = @([ordered]@{ error = 'docker_ps_failed' })
}

$composeValid = $false
if (Test-Path -LiteralPath $envPath) {
  & docker compose --env-file $envPath -f $composePath config --quiet 1>$null 2>$null
  $composeValid = $LASTEXITCODE -eq 0
}

$report = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString('o')
  docker_server = (docker version --format '{{.Server.Version}}' 2>$null)
  compose_valid = $composeValid
  env_file_exists = (Test-Path -LiteralPath $envPath)
  variables = $envState
  containers = $containers
}

$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-Host "Diagnostico concluido: $reportPath"
Write-Host 'Nenhum valor secreto foi incluido no relatorio.'
