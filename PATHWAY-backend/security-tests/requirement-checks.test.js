const { test, before, after, beforeEach } = require('node:test');
const assert=require('node:assert/strict');
const { migrationFixture }=require('./journal-migration-fixture');
const { createRequirementChecks }=require('../requirementChecks');
let f, workflow, calls, response, time;
const base={status:'submitted',fileName:'example.pdf',cloudinaryPublicId:'pathway/requirements/example/application_form-test',cloudinaryAssetId:'asset-test-123456789',cloudinaryVersion:1,uploadedBytes:32,submittedAt:'2026-11-06T10:00:00Z'};
before(async()=>{f=await migrationFixture(()=>{});});
after(async()=>{if(f)await f.close();});
beforeEach(async()=>{
 await f.reset(); await f.db.recursiveDelete(f.db.collection('requirementCheckJobs'));
 await f.db.doc(`users/${f.uid}`).update({firstName:'Example',lastName:'Student',idNumber:'TEST1234',sectionId:'check-section',department:'Check Department',preDeploymentStatus:'not_started'});
 await f.db.doc('sections/check-section').set({coordinatorId:'check-coordinator',department:'Check Department'});
 await f.db.doc('sections/check-section/requirements/application_form').set({label:'Application Form',category:'Pre-OJT'});
 await f.db.doc('users/check-coordinator').set({role:'coordinator',department:'Check Department',accountApproved:true});
 calls=0; time=Date.parse('2026-11-06T10:00:00Z');
 response=async()=>({checks:['readability','document_type','student_identity','required_fields','date_consistency'].map(key=>({key,passed:true,evidence:'Visible test text.'})),findings:[],advisoryOnly:true,requiresHumanReview:true});
 workflow=createRequirementChecks({db:f.db,ai:{checkUploadedRequirement:async input=>{calls++;return response(input);}},getBytes:async()=>Buffer.from('%PDF-1.7 synthetic document'),enabled:()=>true,clock:()=>time});
});
async function upload(consent=true,patch={}){
 const requirement={...base,...patch,aiReviewConsent:consent};
 await f.db.runTransaction(async tx=>{
  const student=(await tx.get(f.db.doc(`users/${f.uid}`))).data();
  const autoReview=await workflow.queue(tx,{studentId:f.uid,student,requirementId:'application_form',requirement});
  tx.update(f.db.doc(`users/${f.uid}`),{'requirements.application_form':{...requirement,autoReview}});
 });
}
const saved=async()=> (await f.db.doc(`users/${f.uid}`).get()).data();
test('upload queues automatically, results stay advisory, and re-running does not duplicate calls or notices',async()=>{
 await upload(); assert.equal((await saved()).requirements.application_form.autoReview.status,'queued');
 await workflow.run(); const student=await saved();
 assert.equal(student.requirements.application_form.autoReview.status,'checks_passed');
 assert.equal(student.requirements.application_form.status,'submitted'); assert.equal(student.preDeploymentStatus,'not_started');
 const notices=await f.db.collection('notifications').where('type','==','requirement_check').get();
 await workflow.run(); assert.equal(calls,1);
 assert.equal((await f.db.collection('notifications').where('type','==','requirement_check').get()).size,notices.size);
});
test('no consent creates a coordinator-review reason without fetching or calling AI',async()=>{
 await upload(false); await workflow.run(); assert.equal(calls,0);
 assert.equal((await saved()).requirements.application_form.autoReview.reason,'consent_required');
});
test('provider failure preserves the file and sends it to coordinator review',async()=>{
 response=async()=>{throw Object.assign(Error('secret test details'),{code:'AI_DISABLED'});};
 await upload(); await workflow.run(); const r=(await saved()).requirements.application_form;
 assert.equal(r.status,'submitted'); assert.equal(r.fileName,'example.pdf');assert.equal(r.autoReview.status,'needs_review');
 assert.equal(r.autoReview.reason,'ai_unavailable'); assert.ok(!JSON.stringify(r).includes('secret'));
});
test('replacement during AI checking cannot receive the previous file result',async()=>{
 response=async()=>{await f.db.doc(`users/${f.uid}`).update({'requirements.application_form':{...base,cloudinaryVersion:2}});return {checks:[],findings:[]};};
 await upload();await workflow.run();const r=(await saved()).requirements.application_form;
 assert.equal(r.cloudinaryVersion,2);assert.equal(r.autoReview,undefined);
});
test('manual approval during checking wins over the later AI result',async()=>{
 response=async()=>{await f.db.doc(`users/${f.uid}`).update({'requirements.application_form.status':'approved'});return {checks:[],findings:[]};};
 await upload();await workflow.run(); assert.equal((await saved()).requirements.application_form.status,'approved');
});
test('interrupted jobs recover after their lease expires',async()=>{
 await upload();const jobs=await f.db.collection('requirementCheckJobs').get();
 await jobs.docs[0].ref.update({state:'checking',leaseUntil:time+120000,attempts:1});
 await workflow.run();assert.equal(calls,0);time+=120001;await workflow.run();assert.equal(calls,1);
});

test('assignment loss during checking ends in coordinator review rather than staying stuck',async()=>{
 response=async()=>{await f.db.doc(`users/${f.uid}`).update({sectionId:''});return {checks:[],findings:[]};};
 await upload();await workflow.run();assert.equal((await saved()).requirements.application_form.autoReview.status,'needs_review');
});
test('failing checks never approve a document or unlock the dashboard',async()=>{
 response=async()=>({checks:['readability','document_type','student_identity','required_fields','date_consistency'].map(key=>({key,passed:false,evidence:'Unreadable field.'})),findings:['Upload a clearer copy if your coordinator requests it.'],advisoryOnly:true,requiresHumanReview:true});
 await upload();await workflow.run();const student=await saved();
 assert.equal(student.requirements.application_form.status,'submitted');assert.equal(student.requirements.application_form.autoReview.status,'needs_review');assert.equal(student.preDeploymentStatus,'not_started');
});
test('auto-check: green + autoApprove approves and records tier; name mismatch is red and stays submitted',async()=>{
 await f.db.doc('sections/check-section/requirements/application_form').set({label:'Application Form',category:'Pre-OJT',autoCheck:{enabled:true,autoApprove:true,nameMustMatch:true,requiredPhrases:[]}});
 const ok=response; response=async i=>({...(await ok(i)),nameOnDocument:'STUDENT, EXAMPLE'});
 await upload(); await workflow.run(); let r=(await saved()).requirements.application_form;
 assert.equal(r.autoReview.tier,'green'); assert.equal(r.status,'approved'); assert.equal(r.autoApproved,true); assert.equal(r.reviewedBy,'system');
 response=async i=>({...(await ok(i)),nameOnDocument:'Someone Else'});
 await upload(true,{submittedAt:'2026-11-06T11:00:00Z'}); await workflow.run(); r=(await saved()).requirements.application_form;
 assert.equal(r.autoReview.tier,'red'); assert.equal(r.status,'submitted');
});
