$ErrorActionPreference = 'Stop'

$projectRef = 'rufmgitewebpaygzpbfp'
$projectDirectory = Split-Path -Parent $PSScriptRoot

Set-Location -LiteralPath $projectDirectory
Write-Host "Deploying BeSeen Edge Functions to Supabase project $projectRef..."
npx --yes supabase functions deploy --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { throw "Supabase function deployment failed." }

Write-Host "BeSeen Edge Functions deployed successfully."
