$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.local'

if (-not (Test-Path -LiteralPath $envPath)) {
  throw 'No se encuentra .env.local.'
}

$values = @{}
foreach ($line in Get-Content -LiteralPath $envPath) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) { continue }
  $separator = $trimmed.IndexOf('=')
  $values[$trimmed.Substring(0, $separator)] = $trimmed.Substring($separator + 1)
}

$required = @(
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_REVENUECAT_TEST_KEY',
  'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY'
)

foreach ($name in $required) {
  if (-not $values.ContainsKey($name) -or -not $values[$name]) {
    throw "Falta $name en .env.local."
  }
}

Push-Location $projectRoot
try {
  foreach ($name in @('EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY')) {
    & npx.cmd eas-cli@latest env:set --name $name --value $values[$name] --environment development --environment preview --visibility plaintext --non-interactive
    if ($LASTEXITCODE -ne 0) { throw "No se pudo configurar $name en EAS." }
  }

  & npx.cmd eas-cli@latest env:set --name EXPO_PUBLIC_REVENUECAT_TEST_KEY --value $values['EXPO_PUBLIC_REVENUECAT_TEST_KEY'] --environment development --visibility plaintext --non-interactive
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo configurar la clave de Test Store en EAS.' }

  & npx.cmd eas-cli@latest env:set --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY --value $values['EXPO_PUBLIC_REVENUECAT_ANDROID_KEY'] --environment preview --environment production --visibility plaintext --non-interactive
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo configurar la clave Android de producción en EAS.' }

  Write-Output 'BeSeen EAS environment configured successfully.'
}
finally {
  Pop-Location
}
