# Owner runs interactively. Packages only the verified invented recovery fixture.
$ErrorActionPreference = 'Stop'
$fixtureRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'output\release\workplace-restore-safety-fa57d5e6-a2ae-4235-8e5a-575bde1bea4c'
$result = Get-Content -LiteralPath (Join-Path $fixtureRoot 'result.json') -Raw | ConvertFrom-Json
if ($result.complete -ne $true -or $result.syntheticOnly -ne $true) { throw 'Verified synthetic rehearsal required.' }
$snapshot = Join-Path $fixtureRoot 'restored'
$metadata = Get-Content -LiteralPath (Join-Path $snapshot 'firebase-export-metadata.json') -Raw | ConvertFrom-Json
$accounts = Get-Content -LiteralPath (Join-Path $snapshot ($metadata.auth.path + '\accounts.json')) -Raw | ConvertFrom-Json
if (@($accounts.users).Count -ne 1 -or $accounts.users[0].localId -ne 'restore-safety-student') { throw 'Unexpected snapshot identity.' }
$attachmentMap = Get-Content -LiteralPath (Join-Path $snapshot 'attachment-recovery.json') -Raw | ConvertFrom-Json
if (@($attachmentMap.attachments).Count -ne 1 -or $attachmentMap.attachments[0].recordPath -ne 'workplaceConcernCases/restore-private-case') { throw 'Unexpected synthetic attachment mapping.' }
$destination = Join-Path $fixtureRoot ('PATHWAY-SYNTHETIC-OWNER-' + [guid]::NewGuid().ToString('N') + '.encrypted.json')
$first = Read-Host 'Enter the backup password saved in your password manager (hidden)' -AsSecureString
$second = Read-Host 'Enter it again (hidden)' -AsSecureString
$firstPtr = [IntPtr]::Zero
$secondPtr = [IntPtr]::Zero
$previousSecret = $env:PATHWAY_BACKUP_SECRET
$previousAttachments = $env:PATHWAY_BACKUP_ATTACHMENTS_FILE
try {
    $firstPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
    $secondPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
    $backupPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPtr)
    $confirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPtr)
    if ($backupPassword.Length -lt 20) { throw 'Use a saved password of at least 20 characters.' }
    if ($backupPassword -cne $confirmation) { throw 'Passwords do not match; no backup created.' }
    $env:PATHWAY_BACKUP_SECRET = $backupPassword
    Remove-Item Env:PATHWAY_BACKUP_ATTACHMENTS_FILE -ErrorAction SilentlyContinue
    & node (Join-Path $PSScriptRoot 'operatorBackup.js') pack $snapshot $destination
    if ($LASTEXITCODE -ne 0) { throw 'Packaging failed; do not upload any resulting file.' }
    & node (Join-Path $PSScriptRoot 'operatorBackup.js') inspect $destination
    if ($LASTEXITCODE -ne 0) { throw 'Inspection failed; do not upload the file.' }
    $checksum = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
    [PSCustomObject]@{ syntheticOnly = $true; encryptedFile = $destination; sha256 = $checksum; source = $snapshot; createdAt = [DateTime]::UtcNow.ToString('o') } |
        ConvertTo-Json | Set-Content -LiteralPath ($destination + '.receipt.json') -Encoding UTF8
    Write-Host ('UPLOAD ONLY: ' + $destination)
    Write-Host ('SHA256: ' + $checksum)
    Write-Host 'Keep this checksum and password separate. Upload only the .encrypted.json file to the restricted Drive folder.'
    Write-Host 'Do not upload the restored folder, attachment bytes or plaintext exports. No upload has been performed by this script.'
} finally {
    $env:PATHWAY_BACKUP_SECRET = $previousSecret
    $env:PATHWAY_BACKUP_ATTACHMENTS_FILE = $previousAttachments
    if ($firstPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPtr) }
    if ($secondPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPtr) }
    $backupPassword = $null
    $confirmation = $null
    $first.Dispose()
    $second.Dispose()
}
