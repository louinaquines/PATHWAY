// Fixed isolated recovery destination. Tokens/passwords never logged or saved.
const assert = require('node:assert/strict');
const project = 'pathway-recovery-test-20261011';
const uid = 'CEIKzqvDGQfkp1FyidGZ1ftUTRi2';
async function readJson(response) {
  let size=0; const chunks=[];
  for await (const chunk of response.body) { size+=chunk.length; assert.ok(size<=1024*1024); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks));
}
async function main() {
  const account=require('firebase-tools/lib/auth').getGlobalDefaultAccount();
  assert.ok(account);
  await require('firebase-tools/lib/requireAuth').requireAuth({project,user:account.user,tokens:account.tokens,nonInteractive:true},true);
  const token=await require('firebase-tools/lib/apiv2').getAccessToken();
  const configResponse=await fetch('https://identitytoolkit.googleapis.com/admin/v2/projects/'+project+'/config',{
    headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(20000),
  });
  assert.ok(configResponse.ok);
  const config=await readJson(configResponse);
  // Config resource names can use the numeric project number; the request
  // destination above is fixed to the approved project ID.
  assert.equal(config.signIn?.email?.enabled,true);
  assert.ok(typeof config.client?.apiKey==='string' && config.client.apiKey.length>10);
  if (process.argv.includes('--check')) { console.log(JSON.stringify({testProject:project,privateSignInReady:true,passwordSubmitted:false})); return; }
  const password=process.env.PATHWAY_RECOVERY_SIGNIN_PASSWORD;
  assert.ok(typeof password==='string' && password.length>0);
  delete process.env.PATHWAY_RECOVERY_SIGNIN_PASSWORD;
  const endpoint='https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(config.client.apiKey);
  async function signIn(value) {
    const response=await fetch(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
      headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'dex@gmail.com',password:value,returnSecureToken:true})});
    return {ok:response.ok,data:await readJson(response)};
  }
  const correct=await signIn(password);
  assert.ok(correct.ok);
  assert.equal(correct.data.localId,uid); assert.equal(correct.data.email,'dex@gmail.com');
  assert.ok(correct.data.idToken && correct.data.refreshToken);
  const payload=JSON.parse(Buffer.from(correct.data.idToken.split('.')[1],'base64url').toString());
  assert.equal(payload.aud,project); assert.equal(payload.iss,'https://securetoken.google.com/'+project); assert.equal(payload.sub,uid);
  const wrong=await signIn(require('node:crypto').randomBytes(32).toString('hex'));
  assert.equal(wrong.ok,false);
  assert.ok(['INVALID_PASSWORD','INVALID_LOGIN_CREDENTIALS'].includes(wrong.data.error?.message));
  console.log(JSON.stringify({testProject:project,restoredPasswordSignInVerified:true,uidMatched:true,tokenProjectMatched:true,wrongPasswordRejected:true,passwordReset:false,tokensSaved:false,sourceProjectWrites:0}));
}
main().catch(()=>{console.error('Recovery sign-in check failed. No password or tokens logged. No password reset performed.');process.exitCode=1;});
