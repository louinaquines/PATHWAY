const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAnthropicAnalysis } = require('../anthropicAnalysis');
const env = { ANTHROPIC_ENABLED:'1', ANTHROPIC_API_KEY:'synthetic-key', ANTHROPIC_MODEL:'claude-test', ANTHROPIC_DAILY_REQUEST_LIMIT:'2' };
const checks = ['readability','document_type','student_identity','required_fields','date_consistency'].map(key => ({ key, passed:true, evidence:'Visible example text.' }));
const payload = { bytes:Buffer.from('%PDF-1.7 synthetic test document'), definition:{ id:'application_form',label:'Application Form' }, student:{ name:'Example Student',id:'TEST1234' } };
test('uploaded document checking shares the existing provider budget and remains advisory', async () => {
  const requests=[];
  const ai=createAnthropicAnalysis(env, async (url,options) => {
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({checks,findings:[]})}]}));
  });
  const result=await ai.checkUploadedRequirement(payload);
  assert.equal(result.advisoryOnly,true); assert.equal(result.requiresHumanReview,true);
  assert.equal(result.checks.length,5);
  assert.equal(requests[0].messages[0].content[0].type,'document');
  await ai.checkUploadedRequirement(payload);
  await assert.rejects(ai.refine('notes'), error=>error.code==='AI_LIMIT');
  assert.equal(requests.length,2);
});
test('unsupported files and disabled providers make no AI calls', async()=>{
  const ai=createAnthropicAnalysis({},()=>assert.fail('Unexpected external call'));
  await assert.rejects(ai.checkUploadedRequirement(payload),e=>e.code==='AI_DISABLED');
  await assert.rejects(createAnthropicAnalysis(env,()=>assert.fail('Unexpected call')).checkUploadedRequirement({...payload,bytes:Buffer.from('not an image or PDF')}));
});
test('incomplete or uncertain model checks cannot pass',async()=>{
  const review=async data=>createAnthropicAnalysis(env,async()=>new Response(JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(data)}]}))).checkUploadedRequirement(payload);
  await assert.rejects(review({checks:checks.slice(1),findings:[]}));
  const result=await review({checks:checks.map((c,i)=>i===0?{...c,evidence:'Cannot read this area.'}:c),findings:[]});
  assert.equal(result.checks[0].passed,false);
});
