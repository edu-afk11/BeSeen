$ErrorActionPreference = 'Stop'

$projectRef = 'rufmgitewebpaygzpbfp'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectDirectory '.env.functions.local'
$sqlFile = Join-Path $projectDirectory 'supabase\setup-runtime-secrets.local.sql'

function New-RandomSecret {
  $bytes = New-Object byte[] 32
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) }
  finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

if (Test-Path -LiteralPath $envFile) {
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^([^=]+)=(.+)$') { $values[$Matches[1]] = $Matches[2] }
  }
  $cleanupSecret = $values['CLEANUP_WEBHOOK_SECRET']
  $matchSecret = $values['MATCH_WEBHOOK_SECRET']
  $chatSecret = $values['CHAT_WEBHOOK_SECRET']
  if (!$cleanupSecret -or !$matchSecret -or !$chatSecret) { throw 'The existing local secrets file is incomplete.' }
} else {
  $cleanupSecret = New-RandomSecret
  $matchSecret = New-RandomSecret
  $chatSecret = New-RandomSecret
  @(
    "CLEANUP_WEBHOOK_SECRET=$cleanupSecret"
    "MATCH_WEBHOOK_SECRET=$matchSecret"
    "CHAT_WEBHOOK_SECRET=$chatSecret"
  ) | Set-Content -LiteralPath $envFile -Encoding utf8
}

Set-Location -LiteralPath $projectDirectory
npx --yes supabase secrets set --env-file $envFile --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { throw 'Supabase secret upload failed.' }

@(
  "select vault.create_secret('https://$projectRef.supabase.co','beseen_project_url');"
  "select vault.create_secret('$cleanupSecret','beseen_cleanup_webhook_secret');"
  "select vault.create_secret('$matchSecret','beseen_match_webhook_secret');"
  "select vault.create_secret('$chatSecret','beseen_chat_webhook_secret');"
) | Set-Content -LiteralPath $sqlFile -Encoding utf8

Write-Host 'Webhook secrets uploaded successfully.'
Write-Host "Run the private SQL file once in Supabase: $sqlFile"
