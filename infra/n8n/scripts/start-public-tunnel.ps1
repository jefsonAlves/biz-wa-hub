$ErrorActionPreference = 'Stop'

$containerName = 'biz-wa-hub-cloudflared'
$targetUrl = 'http://host.docker.internal:5680'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$proxyScript = Join-Path $scriptDir 'webhook-only-proxy.mjs'

function Test-WebhookGateway {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5680/healthz' -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

$gatewayReady = Test-WebhookGateway
if (-not $gatewayReady) {
  Start-Process -FilePath 'node.exe' `
    -ArgumentList @($proxyScript) `
    -WindowStyle Hidden

  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    Start-Sleep -Milliseconds 500
    $gatewayReady = Test-WebhookGateway
    if ($gatewayReady) { break }
  }
}

if (-not $gatewayReady) {
  throw 'O gateway local de webhooks nao iniciou na porta 5680.'
}

$existingContainer = docker ps -a --filter "name=^/$containerName$" --format '{{.Names}}'
if ($existingContainer -eq $containerName) {
  docker rm -f $containerName | Out-Null
}

docker run -d --name $containerName --restart unless-stopped `
  cloudflare/cloudflared:latest `
  tunnel --no-autoupdate --url $targetUrl | Out-Null

$publicUrl = $null
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Seconds 1
  $logs = cmd.exe /d /c "docker logs $containerName 2>&1" | Out-String
  $match = [regex]::Match($logs, 'https://[a-z0-9-]+\.trycloudflare\.com')
  if ($match.Success) {
    $publicUrl = $match.Value
    break
  }
}

if (-not $publicUrl) {
  throw 'O tunel iniciou, mas a URL publica nao apareceu. Execute: docker logs biz-wa-hub-cloudflared'
}

$publicUrl | Set-Content -LiteralPath (Join-Path $scriptDir 'current-public-url.txt') -Encoding ascii
Set-Clipboard -Value $publicUrl

Write-Host ''
Write-Host 'Tunel publico iniciado.' -ForegroundColor Green
Write-Host 'Somente os webhooks autorizados estao expostos; o editor n8n continua local.' -ForegroundColor Green
Write-Host 'A URL ja foi copiada. Cole no campo "URL base do n8n" no Lovable:' -ForegroundColor Yellow
Write-Host $publicUrl -ForegroundColor Cyan
Write-Host ''
Write-Host 'Mantenha o caminho do webhook como:' -ForegroundColor Yellow
Write-Host '/webhook/biz-wa-hub/platform' -ForegroundColor Cyan
