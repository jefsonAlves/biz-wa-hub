[CmdletBinding()]
param(
  [switch]$PullDefaultModel
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$infraDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $infraDirectory

if (-not (Test-Path -LiteralPath ".env")) {
  throw "Crie infra/n8n/.env a partir de .env.example e substitua todos os valores change-me antes de iniciar."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop não está acessível. Abra-o e execute este script novamente em um PowerShell do seu usuário."
}

docker compose config --quiet
if ($LASTEXITCODE -ne 0) { throw "A configuração do Compose é inválida." }

docker compose up -d
if ($LASTEXITCODE -ne 0) { throw "Não foi possível iniciar os containers." }

docker compose ps

if ($PullDefaultModel) {
  docker compose exec -T ollama ollama pull llama3.2:3b
  if ($LASTEXITCODE -ne 0) { throw "Falha ao baixar o modelo padrão do Ollama." }
}

docker compose exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL não está saudável." }

$redisResponse = docker compose exec -T redis redis-cli ping
if ($LASTEXITCODE -ne 0 -or $redisResponse.Trim() -ne "PONG") { throw "Redis não está saudável." }

docker compose exec -T ollama ollama list *> $null
if ($LASTEXITCODE -ne 0) { throw "Ollama não está saudável." }

docker compose exec -T n8n node -e "fetch('http://127.0.0.1:5678/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
if ($LASTEXITCODE -ne 0) { throw "n8n principal não está saudável." }

docker compose exec -T n8n-worker node -e "fetch('http://127.0.0.1:5678/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
if ($LASTEXITCODE -ne 0) { throw "Worker n8n não está saudável." }

Write-Host "Ambiente local saudável: http://localhost:5678" -ForegroundColor Green
