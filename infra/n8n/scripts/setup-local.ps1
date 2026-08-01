[CmdletBinding()]
param([switch]$Force)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$infraDirectory = Split-Path -Parent $PSScriptRoot
$examplePath = Join-Path $infraDirectory ".env.example"
$envPath = Join-Path $infraDirectory ".env"

if ((Test-Path -LiteralPath $envPath) -and -not $Force) {
  throw "O arquivo .env já existe. Use -Force somente se deseja substituir a configuração local atual."
}

function New-RandomHex([int]$bytes = 32) {
  $buffer = [byte[]]::new($bytes)
  [Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  return [Convert]::ToHexString($buffer).ToLowerInvariant()
}

$content = Get-Content -Raw -LiteralPath $examplePath
$content = $content -replace 'N8N_ENCRYPTION_KEY=change-me-with-at-least-32-random-characters', "N8N_ENCRYPTION_KEY=$(New-RandomHex)"
$content = $content -replace 'N8N_USER_MANAGEMENT_JWT_SECRET=change-me-with-at-least-32-random-characters', "N8N_USER_MANAGEMENT_JWT_SECRET=$(New-RandomHex)"
$content = $content -replace 'N8N_WEBHOOK_SECRET=change-me-with-at-least-32-random-characters', "N8N_WEBHOOK_SECRET=$(New-RandomHex)"
$content = $content -replace 'DB_POSTGRESDB_PASSWORD=change-me-with-a-strong-database-password', "DB_POSTGRESDB_PASSWORD=$(New-RandomHex 24)"

[IO.File]::WriteAllText($envPath, $content, [Text.UTF8Encoding]::new($false))
Write-Host "Configuração local criada em infra/n8n/.env. O arquivo está ignorado pelo Git." -ForegroundColor Green
