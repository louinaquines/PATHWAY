$ErrorActionPreference = 'Stop'
Write-Host 'Recovery TEST project only. Enter Dexter''s original app sign-in password, NOT your backup password.'
$taskPassword = Read-Host 'Dexter test account password (hidden)' -AsSecureString
$taskPointer = [IntPtr]::Zero
$taskPrevious = $env:PATHWAY_RECOVERY_SIGNIN_PASSWORD
try {
    $taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskPassword)
    $env:PATHWAY_RECOVERY_SIGNIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
    & node (Join-Path $PSScriptRoot 'security-tests/scoped-auth-signin-qa.js')
    if ($LASTEXITCODE -ne 0) { throw 'Test sign-in was not verified. Share only the status output, never the password.' }
} finally {
    $env:PATHWAY_RECOVERY_SIGNIN_PASSWORD = $taskPrevious
    if ($taskPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer) }
    $taskPassword.Dispose()
}
