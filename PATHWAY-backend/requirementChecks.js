const indexedNotice = data => ({ ...data, ...require('./coordinatorInbox').inboxFields(data) });
const crypto=require('node:crypto');
const {resolveRequirementPolicy,validate,withAutoCheck}=require('./requirementCheckPolicy');
const {compareStudentName}=require('./nameMatch');
const fingerprint=r=>crypto.createHash('sha256').update(JSON.stringify([r.cloudinaryAssetId||'',r.cloudinaryPublicId,r.cloudinaryVersion,r.submittedAt,r.uploadedBytes])).digest('hex');
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const identity=s=>({name:[s.firstName,s.lastName].filter(Boolean).join(' ').trim(),id:s.idNumber||''});
const contextKey=(s,definition)=>JSON.stringify([s.department,s.sectionId,identity(s),definition,s.companyId,s.startDate,s.endDate]);
const reasons={
 consent_required:'Permission to share this file with Anthropic was not provided. Coordinator review is required.',
 ai_unavailable:'AI checking is unavailable. Your file is saved and needs coordinator review.',
 unsupported_file:'AI checking supports PDF, PNG and JPEG files. Your coordinator can review this file.',
 assignment_changed:'The student, section or requirement details changed during checking. Coordinator review is required.',
 policy_missing:'This requirement has no supported automatic checklist. Coordinator review is required.',
 incomplete:'One or more automatic checks need coordinator review.',
};
function createRequirementChecks({db,ai,getBytes,getReference=async()=>null,enabled=()=>true,clock=()=>Date.now(),audit=()=>{}}){
 const jobs=db.collection('requirementCheckJobs'); let running=false;
 function notices(tx,key,studentId,coordinatorId,status){
  const now=new Date(clock()).toISOString();
  for(const [recipientId,title,message] of [
   [studentId,status==='checks_passed'?'Document checks finished':'Document needs coordinator review',status==='checks_passed'?'Automatic checks found no checklist issues. Your coordinator still needs to approve the document.':coordinatorId?'Your document is saved. Your coordinator has been notified to review it.':'Your document is saved. Check your section assignment with your coordinator.'],
   [coordinatorId,'Document ready for your review',status==='checks_passed'?'Automatic document checks finished. Review the original file before approving.':'A submitted document needs your review. Open Requirements for the checking result.'],
  ])if(id(recipientId))tx.set(db.collection('notifications').doc(`${key}_${recipientId}`),indexedNotice({recipientId,title,message,type:'requirement_check',read:false,createdAt:now}));
 }
 async function context(tx,studentId,requirementId){
  const ref=db.collection('users').doc(studentId),snap=await tx.get(ref),student=snap.data();
  if(!student||student.role!=='student'||student.accountApproved!==true||student.disabled===true||['disabled','inactive','suspended','rejected'].includes(student.status)||student.clearanceStatus==='cleared'||!id(student.sectionId))return null;
  const sectionSnap=await tx.get(db.collection('sections').doc(student.sectionId)),section=sectionSnap.data();
  if(!section||section.department!==student.department||!id(section.coordinatorId))return null;
  const staff=(await tx.get(db.collection('users').doc(section.coordinatorId))).data();
  const definitionSnap=await tx.get(db.collection('sections').doc(student.sectionId).collection('requirements').doc(requirementId));
  if(!staff||staff.role!=='coordinator'||staff.department!==student.department||staff.disabled===true||['disabled','inactive','suspended','rejected'].includes(staff.status)||staff.accountApproved!==true)return null;
  return {ref,student,section,definition:{...(definitionSnap.data()||{}),id:requirementId}};
 }
 async function queue(tx,{studentId,student,requirementId,requirement}){
  const section=id(student.sectionId)?(await tx.get(db.collection('sections').doc(student.sectionId))).data():null;
  const key=fingerprint(requirement),jobId=`${studentId}_${requirementId}_${key}`;
  const candidate=section?.department===student.department&&id(section.coordinatorId)?section.coordinatorId:null;
  const coordinator=candidate?(await tx.get(db.collection('users').doc(candidate))).data():null;
  const coordinatorId=coordinator?.role==='coordinator'&&coordinator.department===student.department&&coordinator.disabled!==true&&coordinator.accountApproved===true?candidate:null;
  const reason=!coordinatorId?'assignment_changed':requirement.aiReviewConsent!==true?'consent_required':!enabled()?'ai_unavailable':null;
  if(reason){notices(tx,jobId,studentId,coordinatorId,'needs_review');return {status:'needs_review',reason,findings:[reasons[reason]],checks:[],advisoryOnly:true};}
  tx.create(jobs.doc(jobId),{studentId,requirementId,fingerprint:key,state:'queued',attempts:0,createdAt:new Date(clock()).toISOString()});
  return {status:'queued',checks:[],findings:[],advisoryOnly:true};
 }
 async function processJob(jobRef){
  const claim=await db.runTransaction(async tx=>{
   const job=(await tx.get(jobRef)).data();
   if(!job||!['queued','checking'].includes(job.state)||(job.state==='checking'&&job.leaseUntil>clock()))return null;
   const c=await context(tx,job.studentId,job.requirementId),r=c?.student.requirements?.[job.requirementId];
   if(!c){await assignmentException(tx,jobRef,job);return null;}
   if(!r||r.status!=='submitted'||r.aiReviewConsent!==true||fingerprint(r)!==job.fingerprint){tx.update(jobRef,{state:'cancelled'});return null;}
   const token=crypto.randomUUID();
   tx.update(jobRef,{state:'checking',token,leaseUntil:clock()+120000,attempts:(job.attempts||0)+1});
   tx.update(c.ref,{[`requirements.${job.requirementId}.autoReview.status`]:'checking'});
   return {job,c,r,token,context:contextKey(c.student,c.definition)};
  });
  if(!claim)return;
  let result,reason;
  try{
   if(!enabled()||claim.job.attempts>=2)throw Error('AI unavailable');
   const policy=withAutoCheck(resolveRequirementPolicy(claim.c.definition),claim.c.definition);
   if(!policy.explicit)throw Object.assign(Error('Unsupported checklist'),{code:'POLICY_MISSING'});
   const bytes=await getBytes({studentId:claim.job.studentId,requirementId:claim.job.requirementId,requirement:claim.r});
   const auto=claim.c.definition.autoCheck;
   const reference=auto?.enabled===true&&auto.referenceVersion?await getReference({sectionId:claim.c.student.sectionId,requirementId:claim.job.requirementId}):null;
   result=await ai.checkUploadedRequirement({reference,bytes,definition:claim.c.definition,student:identity(claim.c.student),placement:{companyName:claim.c.student.company||claim.c.student.companyName||'',startDate:claim.c.student.startDate||'',endDate:claim.c.student.endDate||''}});
   if(result.advisoryOnly!==true||result.requiresHumanReview!==true)throw Error('Invalid review');
   const nameOnDocument=result.nameOnDocument||'';
   result=validate({checks:result.checks,findings:result.findings,confidence:0},policy);
   result.nameOnDocument=nameOnDocument;
  }catch(error){reason=error.code==='POLICY_MISSING'?'policy_missing':error.code==='AI_INPUT'?'unsupported_file':'ai_unavailable';result={checks:[],findings:[reasons[reason]]};}
  await db.runTransaction(async tx=>{
   const job=(await tx.get(jobRef)).data(),c=await context(tx,claim.job.studentId,claim.job.requirementId),r=c?.student.requirements?.[claim.job.requirementId];
   if(!job||job.state!=='checking'||job.token!==claim.token)return;
   if(!c){await assignmentException(tx,jobRef,job);return;}
   if(!r||r.status!=='submitted'||r.aiReviewConsent!==true||fingerprint(r)!==job.fingerprint){tx.update(jobRef,{state:'cancelled'});return;}
   if(contextKey(c.student,c.definition)!==claim.context){reason='assignment_changed';result={checks:[],findings:[reasons[reason]]};}
   const status=!reason&&result.checks.length>0&&result.checks.every(check=>check.passed)?'checks_passed':'needs_review';
   const now=new Date(clock()).toISOString();
   const auto=c.definition.autoCheck?.enabled===true?c.definition.autoCheck:null;
   const nameCheck=!reason&&auto&&auto.nameMustMatch!==false?compareStudentName(c.student,result.nameOnDocument):null;
   const failed=key=>result.checks.some(check=>check.key===key&&!check.passed);
   // Green: all checks + name match. Red: wrong person or wrong document. Yellow: everything else. Red is never auto-rejected.
   const tier=reason?'yellow':nameCheck?.result==='mismatch'||failed('document_type')||failed('reference_match')?'red':status==='checks_passed'&&(!nameCheck||nameCheck.result==='match')?'green':'yellow';
   const autoApprove=!!auto&&auto.autoApprove===true&&tier==='green';
   tx.update(c.ref,{[`requirements.${job.requirementId}.autoReview`]:{status,tier,nameCheck,reason:reason||(status==='needs_review'?'incomplete':null),checks:result.checks,findings:result.findings,reviewedAt:now,advisoryOnly:!autoApprove}});
   if(autoApprove)tx.update(c.ref,{[`requirements.${job.requirementId}.status`]:'approved',[`requirements.${job.requirementId}.reviewedBy`]:'system',[`requirements.${job.requirementId}.reviewedAt`]:now,[`requirements.${job.requirementId}.autoApproved`]:true,[`requirements.${job.requirementId}.rejectionReason`]:null});
   tx.update(jobRef,{state:'done',completedAt:now});
   notices(tx,jobRef.id,job.studentId,c.section.coordinatorId,status);
   audit(tx,{actorId:'system',actorRole:'system',action:'requirement.updated',targetType:'requirements',targetId:job.requirementId,details:{studentId:job.studentId,sectionId:c.student.sectionId,action:autoApprove?'automatic_approval':'automatic_advisory_check',status,tier}});
  });
 }
 async function assignmentException(tx,jobRef,job){
  const ref=db.collection('users').doc(job.studentId),student=(await tx.get(ref)).data(),r=student?.requirements?.[job.requirementId];
  if(r?.status==='submitted'&&fingerprint(r)===job.fingerprint){
   tx.update(ref,{[`requirements.${job.requirementId}.autoReview`]:{status:'needs_review',reason:'assignment_changed',checks:[],findings:[reasons.assignment_changed],advisoryOnly:true}});
   notices(tx,jobRef.id,job.studentId,null,'needs_review');
  }
  tx.update(jobRef,{state:'cancelled'});
 }
 async function run(){
  if(running)return; running=true;
  try{const pending=await jobs.where('state','in',['queued','checking']).limit(10).get();for(const item of pending.docs)await processJob(item.ref);}
  finally{running=false;}
 }
 return {queue,run};
}
module.exports={createRequirementChecks,fingerprint};
