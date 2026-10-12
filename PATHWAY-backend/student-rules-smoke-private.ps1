$ErrorActionPreference = 'Stop'
Write-Host 'Live PATHWAY test student read-only checks. No records, approvals or passwords will be changed.'
Write-Host 'Enter Dexter''s app sign-in password, NOT the backup password. Do not share it in chat.'
$taskPassword = Read-Host 'Dexter app password (hidden)' -AsSecureString
$taskPointer = [IntPtr]::Zero
$taskPreviousPassword = $env:PATHWAY_QA_PASSWORD
$taskPreviousRole = $env:PATHWAY_QA_ROLE
try {
    $taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskPassword)
    $env:PATHWAY_QA_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
    $env:PATHWAY_QA_ROLE = 'student'
    & node (Join-Path $PSScriptRoot 'security-tests/production-rules-readonly-smoke.js')
    if ($LASTEXITCODE -ne 0) { throw 'Student acceptance did not pass. Share only the status output, never the password.' }
} finally {
    $env:PATHWAY_QA_PASSWORD = $taskPreviousPassword
    $env:PATHWAY_QA_ROLE = $taskPreviousRole
    if ($taskPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer) }
    $taskPassword.Dispose()
}
