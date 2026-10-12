param([switch]$DocumentOnly)
$ErrorActionPreference = 'Stop'
if ($DocumentOnly) {
  Write-Host 'Synthetic document test only: ONE request authorized. Production AI stays disabled.'
} else {
  Write-Host 'Corrected synthetic test: at most THREE remaining Haiku requests. Document test deferred. Production AI stays disabled.'
}
Write-Host 'Enter the PATHWAY workspace API key, NOT an app password. Input is hidden and not saved.'
$smokeSecret = Read-Host 'API key (hidden)' -AsSecureString
$smokePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($smokeSecret)
try {
  $env:PATHWAY_SMOKE_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($smokePointer)
  $smokeArguments = @((Join-Path $PSScriptRoot 'security-tests\anthropic-synthetic-smoke.js'))
  if ($DocumentOnly) { $smokeArguments += '--document-only' }
  & node @smokeArguments
  if ($LASTEXITCODE -ne 0) { throw 'Test failed; do not retry until the result has been reviewed.' }
} finally {
  Remove-Item Env:PATHWAY_SMOKE_API_KEY -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($smokePointer)
  $smokeSecret.Dispose()
}
