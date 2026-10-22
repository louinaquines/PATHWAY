const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const source = 'Synthetic journal: supervisor threatened to hit me now.';
function make(patch = {}) {
  assert.ok(fs.existsSync(path.join(__dirname, '../workplaceGeneralProvider.js')), 'Provider preparation missing');
  let count = 0, generation = 0, stopped = false; const order = [];
  const options = { enabled: true, apiKey: 'SYNTHETIC', source, disclosureVersion: 'workplace-journal-consent-v2',
    clock: () => new Date('2026-10-23T00:00:00Z'),
    authority: { assertReady: async () => { order.push('ready'); }, reserve: async () => { order.push('reserve'); },
      claim: async stage => { order.push(stage); }, acceptCount: async () => { order.push('accepted'); },
      stop: async () => { stopped = true; }, assertContinuation: async () => {} },
    transport: async (url, o) => { if (url.endsWith('/count_tokens')) { count++; assert.ok(order.includes('reserve')); return Response.json({ input_tokens: 600 }); }
      generation++; assert.equal(stopped, true); assert.equal(JSON.parse(o.body).service_tier, 'standard_only');
      return Response.json({ model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 600, output_tokens: 100, service_tier: 'standard', inference_geo: 'global' }, content: [{ type: 'text', text: '{"version":"workplace-concern-v1","findings":[]}' }] }); }, ...patch };
  const p = require('../workplaceGeneralProvider').createGeneralJournalProvider(options);
  return { p, options, order, calls: () => ({ count, generation }), run: () => p.analyze(p.prepare(source), { signal: new AbortController().signal }) };
}
test('provider disabled by default; legacy disclosure and missing durable authority refuse', async () => {
  for (const patch of [{ enabled: false }, { disclosureVersion: 'workplace-journal-consent-v1' }, { authority: {} }]) {
    const h = make(patch); assert.throws(() => h.p.prepare(source)); assert.deepEqual(h.calls(), { count: 0, generation: 0 });
  }
});
test('provider counts only after authority and reservation, then generates once under stop', async () => {
  const h = make(); assert.deepEqual((await h.run()).decision.findings, []); assert.deepEqual(h.calls(), { count: 1, generation: 1 });
  await assert.rejects(h.run()); assert.deepEqual(h.calls(), { count: 1, generation: 1 });
});
test('invalid count, transport failure and withdrawal prevent generation without retry', async () => {
  for (const n of [0, 12001, -1, 1.5, null]) { let c = 0; const h = make({ transport: async () => { c++; return Response.json({ input_tokens: n }); } }); await assert.rejects(h.run()); assert.equal(c, 1); }
  const h = make({ transport: async () => { throw Error('PRIVATE'); } }); await assert.rejects(h.run(), e => !String(e).includes('PRIVATE'));
});
test('withdrawal after count, expired pricing, midnight and stop failure prevent generation', async () => {
  for (const mode of ['withdraw','day','stop']) {
    let revoked=false, instant=Date.parse('2026-10-23T00:00:00Z'), generations=0;
    const h=make();
    const authority={...h.options.authority,assertReady:async()=>{if(revoked)throw Error('stale');},stop:async()=>{if(mode==='stop')throw Error('PRIVATE disk');}};
    const p=make({authority,clock:()=>new Date(instant),transport:async url=>{if(!url.endsWith('/count_tokens')){generations++;throw Error('Unexpected generation');}if(mode==='withdraw')revoked=true;if(mode==='day')instant=Date.parse('2026-10-24T00:00:00Z');return Response.json({input_tokens:600});}});
    await assert.rejects(p.run());assert.equal(generations,0);
  }
  const expired=make({clock:()=>new Date('2026-10-30T00:00:00Z')});await assert.rejects(expired.run());assert.deepEqual(expired.calls(),{count:0,generation:0});
});
test('known overflow usage survives withdrawn authority so the worker can set its spending brake', async () => {
  let revoked=false;const initial=make();
  const h=make({authority:{...initial.options.authority,assertReady:async()=>{if(revoked)throw Error('withdrawn');}},transport:async url=>{
    if(url.endsWith('/count_tokens'))return Response.json({input_tokens:600});revoked=true;
    return Response.json({model:'claude-haiku-5-5',stop_reason:'end_turn',usage:{input_tokens:14001,output_tokens:1,service_tier:'standard',inference_geo:'global'},content:[]});
  }});
  assert.deepEqual(await h.run(),{usage:{inputTokens:14001,outputTokens:1}});
});
