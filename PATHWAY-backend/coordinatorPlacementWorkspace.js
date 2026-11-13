const { Buffer } = require('node:buffer');
const ID=/^[A-Za-z0-9_-]{1,120}$/;
const text=(v)=>typeof v==='string'?v:'';
function encodeCursor(scope,id){return Buffer.from(JSON.stringify({scope,id})).toString('base64url');}
function decodeCursor(value,scope){if(!value)return null;try{if(typeof value!=='string'||value.length>2000)throw Error();const c=JSON.parse(Buffer.from(value,'base64url'));if(c.scope!==scope||!ID.test(c.id))throw Error();return c.id;}catch{throw Object.assign(Error('Invalid page cursor.'),{status:400});}}
async function matchingPage(query, anchor, size, match) {
 const rows = [];
 let scanned = 0;
 let last = anchor;
 const budget = Math.max(size, 100);
 while (scanned < budget) {
  const batchSize = Math.min(size, budget - scanned);
  const batch = await (last ? query.startAfter(last) : query).limit(batchSize + 1).get();
  for (const doc of batch.docs.slice(0, batchSize)) {
   const row = await match(doc);
   if (row && rows.length === size) return { rows, scanned, next: last.id };
   if (row) rows.push(row);
   last = doc;
   scanned++;
  }
  if (batch.size <= batchSize) return { rows, scanned, next: null };
  if (rows.length === size) break;
 }
 return { rows, scanned, next: last.id };
}
function safeStudent(d){const v=d.data();return {id:d.id,idNumber:text(v.idNumber),firstName:text(v.firstName),lastName:text(v.lastName),companyId:text(v.companyId),company:text(v.company||v.companyName),placementStatus:text(v.placementStatus),status:text(v.status),accountApproved:v.accountApproved===true,clearanceStatus:text(v.clearanceStatus),sectionId:text(v.sectionId),department:text(v.department)};}
function tasksFor({placements=[],finals=[],endorsements=[],verified=[]}){
 const tasks=[];const add=(record,stage,step,action,priority,needsAction)=>tasks.push({record,stage,step,action,priority,needsAction});
 placements.forEach(r=>add(r,'placement',r.status==='pending_review'?'Placement awaiting review':r.status==='needs_revision'?'Changes requested':r.status==='approved'?'Placement approved':r.status==='rejected'?'Placement rejected':'Placement recorded',r.status==='pending_review'?'Review request':'View placement',r.status==='pending_review'?1:9,['pending_review','needs_revision'].includes(r.status)));
 finals.forEach(r=>add(r,'final',r.status==='pending_review'?'Final approval awaiting review':r.status==='approved'?'Final review approved':'Final review recorded',r.status==='pending_review'?'Review final approval':'View decision',r.status==='pending_review'?2:9,['pending_review','needs_revision'].includes(r.status)));
 endorsements.forEach(r=>add(r,'endorsement',r.draftVersion>0?'Waiting for signed copy':'Draft needed','View letter',3,true));
 verified.forEach(r=>add(r,'verified',r.deliveryStatus==='sent'?'Letter accepted by email service':r.deliveryStatus==='sending'?'Sending letter':'Signed copy verified','View letter',4,r.deliveryStatus!=='sent'));
 return tasks.sort((a,b)=>a.priority-b.priority||String(b.record.updatedAt||b.record.createdAt||'').localeCompare(String(a.record.updatedAt||a.record.createdAt||'')));
}
function createPlacementWorkspaceHandler({adminDb,allowRate}){
 const audits=new Map();
 return async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(req.staff.role!=='coordinator')return res.status(403).json({error:'Coordinator access required.'});
  if(allowRate&&!allowRate(req,res,{limit:120,windowMs:60000,key:r=>'placement-workspace:'+r.staff.uid}))return;
  try{
   const {sectionId,view='students',search='',queue='all',stage='all',companyId,studentId,availability='all'}=req.query;
   const size=req.query.pageSize===undefined?25:Number(req.query.pageSize);
   if(!ID.test(sectionId||'')||!['students','companies','summary','details','records'].includes(view)||typeof search!=='string'||search.length>150||!Number.isInteger(size)||size<1||size>100||!['all','action','completed','history','waiting'].includes(queue)||!['all','placement','final','endorsement','verified','history'].includes(stage)||(companyId&&!ID.test(companyId))||(studentId&&!ID.test(studentId))||!['all','slots','active'].includes(availability))return res.status(400).json({error:'Invalid placement search or page.'});
   const [coord,section]=await Promise.all([adminDb.collection('users').doc(req.staff.uid).get(),adminDb.collection('sections').doc(sectionId).get()]);
   if(!coord.exists||coord.data().role!=='coordinator'||!section.exists||section.data().coordinatorId!==req.staff.uid||section.data().department!==coord.data().department)return res.status(403).json({error:'Choose one of your assigned sections.'});
   const department=coord.data().department;
   const scoped=name=>adminDb.collection(name).where('sectionId','==',sectionId).where('department','==',department);
   const users=scoped('users').where('role','==','student');
   const count=async q=>(await q.count().get()).data().count;
   if(view==='summary'){
    const [total,assigned,proposals,finals]=await Promise.all([count(users),count(users.where('placementStatus','==','approved')),count(scoped('companyProposals').where('status','==','pending_review')),count(scoped('finalReviewRequests').where('status','==','pending_review'))]);
    return res.json({assigned,waiting:Math.max(0,total-assigned),needsReview:proposals+finals});
   }
   const readStudentRecords=async uid=>{
    const read=async(name,limit=20)=>{const s=await scoped(name).where('studentId','==',uid).limit(limit+1).get();return {items:s.docs.slice(0,limit).map(d=>({...d.data(),id:d.id})),hasMore:s.size>limit,last:s.docs.slice(0,limit).at(-1)?.id};};
    const [p,f,e,h]=await Promise.all([read('companyProposals'),read('finalReviewRequests'),read('endorsements'),view==='details'||queue==='history'?read('placementHistory'):Promise.resolve({items:[],hasMore:false})]);
    return {placements:p.items,finals:f.items,endorsements:e.items.filter(r=>r.status==='awaiting_document'),verified:e.items.filter(r=>r.status==='signed_copy_verified'),history:h.items,recordCursors:Object.fromEntries([["placement",p],["final",f],["endorsement",e],["verified",e],["history",h]].map(([stage,page])=>[stage,page.hasMore?encodeCursor(JSON.stringify([req.staff.uid,sectionId,uid,stage,size]),page.last):null])),hasMoreRecords:p.hasMore||f.hasMore||e.hasMore||h.hasMore};
   };
   if(view==='details'||view==='records'){
    if(!studentId)return res.status(400).json({error:'Choose a student.'});
    const d=await adminDb.collection('users').doc(studentId).get();const v=d.data();
    if(!v||v.role!=='student'||v.sectionId!==sectionId||v.department!==department)return res.status(404).json({error:'Student not found in this section.'});
    if(view==='records'){
     const names={placement:'companyProposals',final:'finalReviewRequests',endorsement:'endorsements',verified:'endorsements',history:'placementHistory'};
     if(!names[stage])return res.status(400).json({error:'Choose a record stage.'});
     const scope=JSON.stringify([req.staff.uid,sectionId,studentId,stage,size]);
     let q=scoped(names[stage]).where('studentId','==',studentId);
     if(stage==='endorsement'||stage==='verified')q=q.where('status','==',stage==='endorsement'?'awaiting_document':'signed_copy_verified');
     q=q.orderBy('__name__');const id=decodeCursor(req.query.cursor,scope);
     if(id){const a=await adminDb.collection(names[stage]).doc(id).get();const r=a.data();if(!r||r.studentId!==studentId||r.sectionId!==sectionId||r.department!==department)return res.status(400).json({error:'Invalid record cursor.'});q=q.startAfter(a);}
     const page=await q.limit(size+1).get();return res.json({records:page.docs.slice(0,size).map(r=>({...r.data(),id:r.id})),nextCursor:page.size>size?encodeCursor(scope,page.docs[size-1].id):null});
    }
    return res.json({student:safeStudent(d),...await readStudentRecords(studentId)});
   }
   const scope=JSON.stringify([req.staff.uid,sectionId,view,search,queue,stage,companyId||'',availability,size]);
   const anchorId=decodeCursor(req.query.cursor,scope);const term=search.trim().toLowerCase();
   if(view==='companies'){
    let q=adminDb.collection('companies').orderBy('name').orderBy('__name__');
    if(anchorId){const a=await adminDb.collection('companies').doc(anchorId).get();if(!a.exists)throw Object.assign(Error('Invalid company cursor.'),{status:400});q=q.startAfter(a);}
    const page=await q.limit(size+1).get();const companies=[];
    for(const d of page.docs.slice(0,size)){
     const c=d.data();const active=c.active!==false&&c.status!=='inactive';if(term&&!String(c.name||'').toLowerCase().includes(term))continue;if(availability!=='all'&&!active)continue;
     const [occupiedSlots,assignedCount]=await Promise.all([count(adminDb.collection('users').where('role','==','student').where('placementStatus','==','approved').where('companyId','==',d.id)),count(users.where('placementStatus','==','approved').where('companyId','==',d.id))]);
     const capacity=Number.isSafeInteger(c.capacity)&&c.capacity>=0?c.capacity:null;const availableSlots=capacity===null?null:Math.max(0,capacity-occupiedSlots);if(availability==='slots'&&(availableSlots===null||availableSlots<=0))continue;
     companies.push({id:d.id,name:text(c.name),industry:text(c.industry),address:text(c.address),email:text(c.email),phone:text(c.phone),active,capacity,occupiedSlots,availableSlots,assignedCount,placementDefaults:c.placementDefaults});
    }
    return res.json({companies,nextCursor:page.size>size?encodeCursor(scope,page.docs[size-1].id):null,scanned:Math.min(page.size,size)});
   }
   // Compare count aggregates before sorted reads: legacy users must never disappear silently.
   const auditKey=sectionId+':'+department;const audit=audits.get(auditKey);
   if(!audit||Date.now()-audit.at>60000){const [all,named]=await Promise.all([count(users),count(users.orderBy('firstName').orderBy('lastName'))]);audits.set(auditKey,{at:Date.now(),named:all===named});}
   let q=users;if(companyId)q=q.where('companyId','==',companyId).where('placementStatus','==','approved');
   if(audits.get(auditKey).named)q=q.orderBy('firstName').orderBy('lastName');
   q=q.orderBy('__name__');
   let anchor;
   if(anchorId){const a=await adminDb.collection('users').doc(anchorId).get();const v=a.data();if(!v||v.sectionId!==sectionId||v.department!==department||(companyId&&v.companyId!==companyId))throw Object.assign(Error('Invalid student cursor.'),{status:400});anchor=a;}
   const page=await matchingPage(q,anchor,size,async d=>{
    const student=safeStudent(d);if(queue==='waiting'){
     if(student.placementStatus==='approved'||!student.accountApproved||student.clearanceStatus==='cleared')return null;
     if((await scoped('companyProposals').where('studentId','==',student.id).where('status','==','pending_review').limit(1).get()).size)return null;
    }
    const records=companyId||queue==='waiting'?null:await readStudentRecords(d.id);const tasks=records?tasksFor(records):[];const needsAction=tasks.some(t=>t.needsAction);
    if(queue==='action'&&!needsAction||queue==='completed'&&(needsAction||!tasks.length)||queue==='history'&&!records?.history.length||stage!=='all'&&!tasks.some(t=>t.stage===stage&&t.needsAction))return null;
    const name=[student.lastName,student.firstName].filter(Boolean).join(', ');const current=tasks.find(t=>t.needsAction)||tasks[0]||{step:student.placementStatus==='approved'?'Assigned':'Waiting for assignment',action:'View placement',stage:'placement'};
    const company=student.company||current.record?.companyName||current.record?.companySnapshot?.companyName||'—';
    if(term&&![name,student.idNumber,company].some(v=>String(v).toLowerCase().includes(term)))return null;
    return {...student,queue:{id:student.id,name,company,current,tasks,needsAction,hasHistory:!!records?.history.length},hasMoreRecords:records?.hasMoreRecords||false};
   });
   return res.json({students:page.rows,nextCursor:page.next?encodeCursor(scope,page.next):null,scanned:page.scanned});
  }catch(e){console.error('Placement workspace read failed',e.code||e.status||'unknown');return res.status(e.status||503).json({error:e.status?e.message:'Placement records could not load. Try again.'});}
 };
}
module.exports={createPlacementWorkspaceHandler,encodeCursor,decodeCursor,tasksFor,safeStudent};
