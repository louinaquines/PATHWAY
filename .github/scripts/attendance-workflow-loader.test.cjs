const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('../../PATHWAY-backend/node_modules/js-yaml');
const workflow = yaml.load(fs.readFileSync(path.join(__dirname, '../workflows/attendance-risk.yml'), 'utf8'));
const sha = '1234567890abcdef1234567890abcdef12345678';
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';

function runSteps(fail) {
  const [load, processStep] = workflow.jobs.check.steps;
  assert.equal(typeof load.run, 'string', 'Load the scheduler without repository checkout or submodule traversal.');
  assert.equal(typeof processStep.run, 'string');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pathway-workflow-loader-'));
  try {
    // Only the GitHub API boundary is synthetic; execute the workflow's real shell commands.
    const fixture = `
      set -euo pipefail
      git() { return 99; }
      gh() {
        if [ "$#" != 8 ] || [ "$1" != api ] || [ "$2" != --hostname ] || [ "$3" != github.com ] ||
          [ "$4" != --method ] || [ "$5" != GET ] || [ "$6" != --header ] ||
          [ "$7" != 'Accept: application/vnd.github.raw+json' ] ||
          [ "$8" != "repos/synthetic/pathway/contents/.github/scripts/attendance-risk-run.cjs?ref=$GITHUB_SHA" ]; then
          printf 'Unexpected script request\\n' >&2; return 91
        fi
        printf '%s\\n' 'require("node:fs").writeFileSync(process.env.RUNNER_TEMP + "/worker-ran", "ran"); console.log("synthetic scheduler loaded");'
        if [ "$TEST_FAIL" = 1 ]; then return 23; fi
      }
    `;
    const result = spawnSync(bash, ['-e', '-o', 'pipefail', '-c', `${fixture}\n${load.run}\n${processStep.run}`], {
      cwd: temp, encoding: 'utf8', windowsHide: true, timeout: 15000,
      env: { ...process.env, RUNNER_TEMP: temp.replace(/\\/g, '/'), GITHUB_REPOSITORY: 'synthetic/pathway', GITHUB_SHA: sha,
        GH_TOKEN: 'synthetic-github-token', TEST_FAIL: fail ? '1' : '0' },
    });
    return { result, ran: fs.existsSync(path.join(temp, 'worker-ran')) };
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

test('loads and executes only the scheduler from the exact run revision without a Git checkout', () => {
  const { result, ran } = runSteps(false);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(ran, true);
  assert.match(result.stdout, /synthetic scheduler loaded/);
  assert.ok(!result.stdout.includes('synthetic-github-token'));
});

test('download failure stops before processing even if a partial script was written', () => {
  const { result, ran } = runSteps(true);
  assert.equal(result.status, 23, result.stderr); assert.equal(ran, false);
  assert.ok(!result.stdout.includes('synthetic scheduler loaded'));
});
