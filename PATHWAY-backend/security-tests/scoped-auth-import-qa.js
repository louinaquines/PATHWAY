// Authorized isolated project only. No source-project writes or password reset.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { check, validateAuth } = require('./scoped-auth-readback');
const project = 'pathway-recovery-test-20261011';
const root = path.resolve(__dirname, '../.env-backup-restore-tests');
let stage = 'local-validation';
let importAttempted = false;
async function main() {
  assert.ok(process.argv.includes('--approved-test-import'));
  const restored = path.join(root, '37e6da590c694d90826a1323fc2eb9ba');
  check(restored, path.join(root, 'auth-export-be1c7b58-01d9-4ee5-8d0b-4919c8556854'));
  const manifest = JSON.parse(fs.readFileSync(path.join(restored, 'attachment-recovery.json')));
  const mapping = manifest.attachments.find(item => item.version.startsWith('scoped-auth-v1-'));
  const data = JSON.parse(fs.readFileSync(path.join(restored, mapping.name)));
  validateAuth(data);
  stage = 'authenticate';
  const account = require('firebase-tools/lib/auth').getGlobalDefaultAccount();
  assert.ok(account);
  await require('firebase-tools/lib/requireAuth').requireAuth({project, user:account.user,tokens:account.tokens,nonInteractive:true},true);
  const token = await require('firebase-tools/lib/apiv2').getAccessToken();
  async function request(endpoint, body) {
    assert.ok(endpoint.startsWith('v1/projects/' + project + '/') || endpoint === 'admin/v2/projects/' + project + '/config');
    const response = await fetch('https://identitytoolkit.googleapis.com/' + endpoint, {
      method:body?'POST':'GET', redirect:'error', signal:AbortSignal.timeout(20000),
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    let size=0; const chunks=[];
    for await (const chunk of response.body) { size+=chunk.length; assert.ok(size<=1024*1024); chunks.push(chunk); }
    const parsed=JSON.parse(Buffer.concat(chunks));
    if (!response.ok) {
      const error=new Error('HTTP_'+response.status);
      const known=['INVALID_HASH','INVALID_SALT','INVALID_HASH_KEY','INVALID_SALT_SEPARATOR','INVALID_PROVIDER_ID','INVALID_USER_INFO','INVALID_HASH_ALGORITHM'];
      error.safeCode=known.find(code=>String(parsed.error?.message||'').includes(code)) || 'UNCLASSIFIED';
      throw error;
    }
    return parsed;
  }
  stage = 'verify-test-provider';
  const config = await request('admin/v2/projects/'+project+'/config');
  assert.equal(config.signIn?.email?.enabled,true);
  const user=data.users[0];
  stage = 'refuse-existing-uid-or-email';
  const existing=await request('v1/projects/'+project+'/accounts:lookup',{localId:[user.localId],email:[user.email]});
  assert.equal((existing.users||[]).length,0);
  stage = 'import-one-account';
  const keys=['localId','email','emailVerified','passwordHash','salt','displayName','photoUrl','createdAt','disabled','customAttributes','providerUserInfo','mfaInfo'];
  const selected=Object.fromEntries(keys.filter(key=>user[key]!==undefined).map(key=>[key,user[key]]));
  const websafe=value=>value.replace(/\+/g,'-').replace(/\//g,'_');
  selected.passwordHash=websafe(selected.passwordHash); selected.salt=websafe(selected.salt);
  if (selected.providerUserInfo) selected.providerUserInfo=selected.providerUserInfo.filter(provider=>provider.providerId!=='password');
  importAttempted=true;
  const result=await request('v1/projects/'+project+'/accounts:batchCreate',{
    users:[selected],hashAlgorithm:'SCRYPT',signerKey:websafe(data.hashConfig.signerKey),
    saltSeparator:websafe(data.hashConfig.saltSeparator),rounds:data.hashConfig.rounds,memoryCost:data.hashConfig.memoryCost,
    sanityCheck:true,allowOverwrite:false,
  });
  assert.equal((result.error||[]).length,0);
  stage = 'readback';
  const readback=await request('v1/projects/'+project+'/accounts:lookup',{localId:[user.localId]});
  assert.equal(readback.users?.length,1);
  assert.equal(readback.users[0].localId,user.localId);
  assert.equal(readback.users[0].email,user.email);
  for (const key of ['emailVerified','disabled']) assert.equal(Boolean(readback.users[0][key]),Boolean(user[key]));
  for (const key of ['displayName','customAttributes']) assert.equal(readback.users[0][key]||'',user[key]||'');
  console.log(JSON.stringify({testProject:project,importedAccounts:1,identityReadbackMatched:true,overwriteAllowed:false,sourceProjectWrites:0,passwordReset:false,passwordSignInVerified:false}));
}
main().catch(error=>{console.error(JSON.stringify({completed:false,stage,importAttempted,httpStatus:/^HTTP_\d{3}$/.test(error.message)?Number(error.message.slice(5)):undefined,safeCode:error.safeCode,secretsLogged:false}));process.exitCode=1;});
