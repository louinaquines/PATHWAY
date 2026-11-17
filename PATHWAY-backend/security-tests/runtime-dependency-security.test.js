const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const expressRequire = createRequire(require.resolve('express'));
const atLeast = (version, minimum) => {
  const actual = version.split('.').map(Number);
  return actual[0] > minimum[0] || actual[0] === minimum[0] && (actual[1] > minimum[1]
    || actual[1] === minimum[1] && actual[2] >= minimum[2]);
};
test('server JSON parser resolves the patched body-parser release', () => {
  assert.ok(atLeast(expressRequire('body-parser/package.json').version, [2, 4, 0]), 'body-parser >=2.4.0 required for compressed-body crash fix');
});
test('runtime mail transport resolves patched recipient parsing', () => {
  assert.ok(atLeast(require('nodemailer/package.json').version, [10, 1, 4]), 'nodemailer >=10.1.4 required for recipient parsing fixes');
});
test('malformed compressed JSON cannot terminate the local Express server', () => {
  const script = `
    const express = require(${JSON.stringify(require.resolve('express'))});
    const http = require('node:http'), zlib = require('node:zlib'), assert = require('node:assert/strict');
    const app = express(); app.use(express.json()); app.post('/probe', (_req,res) => res.json({ok:true}));
    app.get('/health', (_req,res) => res.json({ok:true}));
    app.use((_err,_req,res,_next) => res.status(400).end());
    const server = app.listen(0,'127.0.0.1',async () => {
      try {
        const bytes = Buffer.concat([zlib.gzipSync(Buffer.from('{"synthetic":true}')),Buffer.from('invalid-trailing-data')]);
        await new Promise((resolve,reject) => {
          const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/probe',method:'POST',headers:{'content-type':'application/json','content-encoding':'gzip','content-length':bytes.length}},res=>{res.resume();res.on('end',resolve)});
          req.on('error',reject);req.end(bytes);
        });
        await new Promise(resolve=>setTimeout(resolve,100));
        const response=await fetch('http://127.0.0.1:'+server.address().port+'/health');assert.equal(response.status,200);await response.body.cancel();
      } catch { process.exitCode=1; } finally { server.closeAllConnections(); server.close(); }
    });`;
  const child = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 8000, windowsHide: true });
  assert.equal(child.status, 0, child.stderr || 'Local parser probe must exit cleanly');
});
