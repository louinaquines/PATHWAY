param([switch]$IncludeTestDocument, [string]$AcquiredTestDocumentDirectory, [string]$ScopedAuthDirectory)
# Run directly in your own PowerShell terminal. Never enter the password in chat.
$ErrorActionPreference = 'Stop'
if ($ScopedAuthDirectory -and -not $AcquiredTestDocumentDirectory) { throw 'Scoped Auth packaging requires the acquired test document directory.' }
$backupRoot = $PSScriptRoot
$snapshotRoot = Join-Path $backupRoot '.emulator-data'
$snapshot = Get-ChildItem -LiteralPath $snapshotRoot -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'firebase-export-metadata.json') } |
    Sort-Object Name -Descending | Select-Object -First 1
if (-not $snapshot) { throw 'No completed test emulator export found.' }
$destinationRoot = Join-Path $backupRoot '.env-backup-exports'
New-Item -ItemType Directory -Path $destinationRoot -Force | Out-Null
$destination = Join-Path $destinationRoot ('PATHWAY-TEST-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N') + '.encrypted.json')
Write-Host 'TEST DATA ONLY. Password input is hidden and is not saved.'
Write-Host ('Snapshot: ' + $snapshot.Name)
$first = Read-Host 'Enter your saved backup password' -AsSecureString
$second = Read-Host 'Enter it again to confirm' -AsSecureString
$firstPtr = [IntPtr]::Zero
$secondPtr = [IntPtr]::Zero
$previousSecret = $env:PATHWAY_BACKUP_SECRET
$previousAttachments = $env:PATHWAY_BACKUP_ATTACHMENTS_FILE
try {
    $firstPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
    $secondPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
    $backupPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPtr)
    $confirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPtr)
    if ($backupPassword.Length -lt 20) { throw 'Use at least 20 characters.' }
    if ($backupPassword -cne $confirmation) { throw 'Passwords do not match. No backup created.' }
    $env:PATHWAY_BACKUP_SECRET = $backupPassword
    Remove-Item Env:PATHWAY_BACKUP_ATTACHMENTS_FILE -ErrorAction SilentlyContinue
    if ($AcquiredTestDocumentDirectory) {
        & node (Join-Path $backupRoot 'testDocumentBackup.js') $snapshot.FullName $destination $AcquiredTestDocumentDirectory $ScopedAuthDirectory
    } elseif ($IncludeTestDocument) {
        & node (Join-Path $backupRoot 'testDocumentBackup.js') $snapshot.FullName $destination
    } else {
        & node (Join-Path $backupRoot 'operatorBackup.js') pack $snapshot.FullName $destination
    }
    if ($LASTEXITCODE -ne 0) { throw 'Backup packaging failed. Do not upload any resulting file.' }
    & node (Join-Path $backupRoot 'operatorBackup.js') inspect $destination
    if ($LASTEXITCODE -ne 0) { throw 'Backup verification failed. Do not upload the file.' }
    Get-FileHash -LiteralPath $destination -Algorithm SHA256 | Format-List
    Write-Host ('Verified encrypted TEST backup: ' + $destination)
    if ($AcquiredTestDocumentDirectory) {
        Write-Host 'Includes the demo database export plus the acquired fictional test endorsement and its binding metadata.'
        Write-Host 'If present, scoped-records.json includes separately captured live test-account records.'
        Write-Host 'The emulator export is still a demo snapshot. This is NOT a full production backup.'
    } elseif ($IncludeTestDocument) {
        Write-Host 'Includes the saved emulator export and one local TEST ONLY PDF with a synthetic mapping.'
        Write-Host 'This is not a backup of actual student documents or remote Cloudinary files.'
    } else {
        Write-Host 'This includes the saved emulator export only, not Cloudinary files or production data.'
    }
    Write-Host 'Upload only this encrypted file to PATHWAY BACKUPS. Keep the password separate.'
    if ($ScopedAuthDirectory) { Write-Host 'Includes sensitive scoped Auth recovery data. Never upload the plaintext auth-scoped.json. Production Auth restore is not verified.' }
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
