const fs = require('node:fs');
const path = require('node:path');
const { probeHealth } = require('../healthProbe');
async function main() {
  const url = 'https://pathway-backend-49a9.onrender.com/healthz';
  const result = await probeHealth({ url });
  const directory = path.resolve(__dirname, '../../output/release', `health-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'health.json'), JSON.stringify({ capturedAt: new Date().toISOString(), url, ...result,
    livenessOnly: true, alertSent: false, productionWrites: 0 }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ ...result, evidence: directory, livenessOnly: true, alertSent: false, productionWrites: 0 }));
  if (!result.healthy) process.exitCode = 1;
}
main().catch(() => { console.error('Health evidence could not be saved.'); process.exitCode = 1; });
