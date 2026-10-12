// Read-only IAM capability check; does not retrieve users, hashes or hash config.
async function main() {
  const { getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
  const account = getGlobalDefaultAccount();
  if (!account) throw new Error('No existing Firebase CLI account');
  const options = { project: 'pathway-57400', user: account.user, tokens: account.tokens, nonInteractive: true };
  await require('firebase-tools/lib/requireAuth').requireAuth(options, true);
  const token = await require('firebase-tools/lib/apiv2').getAccessToken();
  const permissions = ['firebaseauth.users.get', 'firebaseauth.configs.get', 'firebaseauth.configs.getHashConfig'];
  const response = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects/pathway-57400:testIamPermissions', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions }),
  });
  if (!response.ok) throw new Error('IAM check refused: HTTP ' + response.status);
  const result = await response.json();
  const granted = new Set(result.permissions || []);
  console.log(JSON.stringify({ project: 'pathway-57400', existingCliAccountAvailable: true,
    authUsersReadPermission: granted.has(permissions[0]), authConfigReadPermission: granted.has(permissions[1]),
    passwordHashConfigReadPermission: granted.has(permissions[2]),
    allRequestedPermissionsGranted: permissions.every(item => granted.has(item)),
    authExportPerformed: false, passwordHashesRead: false, permissionsChanged: false, billingChanged: false }));
}
main().catch(() => { console.error('Auth export permission check unavailable. No credentials logged, hashes exported or permissions changed.'); process.exitCode = 1; });
