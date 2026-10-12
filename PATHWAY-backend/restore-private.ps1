param(
    [Parameter(Mandatory=$true)][string]$BackupFile,
    [ValidatePattern('^[A-Fa-f0-9]{64}$')][string]$ExpectedHash = '0C6784936FDDBD63F41C58180C861E82308169645E6B4935D36C1809440094B6'
)
$ErrorActionPreference = 'Stop'
$resolvedBackup = (Resolve-Path -LiteralPath $BackupFile).Path
if ((Get-FileHash -LiteralPath $resolvedBackup -Algorithm SHA256).Hash -ne $expectedHash) {
    throw 'Downloaded file differs from the verified test backup. Restore refused.'
}
$restoreRoot = Join-Path $PSScriptRoot '.env-backup-restore-tests'
New-Item -ItemType Directory -Path $restoreRoot -Force | Out-Null
# Restrict decrypted recovery files to the current Windows user and SYSTEM.
$restoreDirectory = New-Object System.IO.DirectoryInfo($restoreRoot)
if (($restoreDirectory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Restore root must not be a junction or symbolic link.'
}
# Read/write only the DACL. A fresh full security descriptor can make Set-Acl
# attempt audit/owner changes and require SeSecurityPrivilege unnecessarily.
function Get-RestoreAccessAcl($directory) {
    if ($directory.PSObject.Methods['GetAccessControl']) {
        return $directory.GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)
    }
    return [System.IO.FileSystemAclExtensions]::GetAccessControl($directory, [System.Security.AccessControl.AccessControlSections]::Access)
}
$restoreAcl = Get-RestoreAccessAcl $restoreDirectory
$restoreAcl.SetAccessRuleProtection($true, $false)
foreach ($existingRule in @($restoreAcl.GetAccessRules($true, $false, [System.Security.Principal.SecurityIdentifier]))) {
    $restoreAcl.RemoveAccessRuleSpecific($existingRule)
}
$restoreUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$restoreSystem = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
foreach ($restoreIdentity in @($restoreUser, $restoreSystem)) {
    $restoreRule = New-Object System.Security.AccessControl.FileSystemAccessRule($restoreIdentity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $restoreAcl.AddAccessRule($restoreRule)
}
if ($restoreDirectory.PSObject.Methods['SetAccessControl']) {
    $restoreDirectory.SetAccessControl($restoreAcl)
} else {
    [System.IO.FileSystemAclExtensions]::SetAccessControl($restoreDirectory, $restoreAcl)
}
$verifiedAcl = Get-RestoreAccessAcl $restoreDirectory
$verifiedRules = @($verifiedAcl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
$allowedIdentities = @($restoreUser.Value, $restoreSystem.Value)
if (-not $verifiedAcl.AreAccessRulesProtected -or $verifiedRules.Count -ne 2) {
    throw 'Restore folder access verification failed; no decryption performed.'
}
foreach ($verifiedRule in $verifiedRules) {
    if ($verifiedRule.IdentityReference.Value -notin $allowedIdentities -or
        $verifiedRule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or
        $verifiedRule.FileSystemRights -ne [System.Security.AccessControl.FileSystemRights]::FullControl) {
        throw 'Unexpected restore folder permission; no decryption performed.'
    }
}
$restoreTarget = Join-Path $restoreRoot ([guid]::NewGuid().ToString('N'))
Write-Host 'Downloaded TEST backup checksum matches. No production access will occur.'
$restoreSecret = Read-Host 'Enter your saved backup password (hidden)' -AsSecureString
$restorePointer = [IntPtr]::Zero
$previousSecret = $env:PATHWAY_BACKUP_SECRET
$previousProject = $env:PATHWAY_RESTORE_PROJECT
try {
    $restorePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($restoreSecret)
    $env:PATHWAY_BACKUP_SECRET = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($restorePointer)
    $env:PATHWAY_RESTORE_PROJECT = 'demo-pathway-security'
    & node (Join-Path $PSScriptRoot 'operatorBackup.js') restore $resolvedBackup $restoreTarget
    if ($LASTEXITCODE -ne 0) { throw 'Restore dry run failed. Nothing restored.' }
    & node (Join-Path $PSScriptRoot 'operatorBackup.js') restore $resolvedBackup $restoreTarget --apply
    if ($LASTEXITCODE -ne 0) { throw 'Restore failed. Keep any partial target isolated; do not import it.' }
    Write-Host ('Verified TEST file recovery: ' + $restoreTarget)
    Write-Host 'Every restored file passed checksum readback. No database import was performed.'
    Write-Host 'Decrypted files are local and sensitive. Do not upload them to Drive.'
} finally {
    $env:PATHWAY_BACKUP_SECRET = $previousSecret
    $env:PATHWAY_RESTORE_PROJECT = $previousProject
    if ($restorePointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($restorePointer) }
    $restoreSecret.Dispose()
}
