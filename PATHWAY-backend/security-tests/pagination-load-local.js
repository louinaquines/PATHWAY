const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {performance}=require('node:perf_hooks');
const assert=require('node:assert/strict');
(async()=>{
 const host=process.env.FIRESTORE_EMULATOR_HOST;
 assert(host && /^(127\.0\.0\.1|localhost):\d+$/.test(host),'Local emulator required');
 const app=initializeApp({projectId:'demo-pathway-pagination-load'});const db=getFirestore(app);
 const records=db.collection('paginationLoad');
 for(let offset=0;offset<5000;offset+=500){const batch=db.batch();for(let i=offset;i<offset+500;i++)batch.set(records.doc(String(i).padStart(6,'0')),{recipientId:'fictional-coordinator',createdAt:new Date(1700000000000+i).toISOString()});await batch.commit();}
 const times=[];let largest=0;
 const start=performance.now();await Promise.all(Array.from({length:20},async()=>{let cursor=null,count=0;for(let page=0;page<5;page++){let q=records.where('recipientId','==','fictional-coordinator').orderBy('createdAt','desc').limit(51);if(cursor)q=q.startAfter(cursor);const t=performance.now();const snap=await q.get();times.push(performance.now()-t);assert(snap.size<=51);largest=Math.max(largest,snap.size);const shown=snap.docs.slice(0,50);count+=shown.length;cursor=shown.at(-1);}assert.equal(count,250);}));
 times.sort((a,b)=>a-b);console.log(JSON.stringify({environment:'local-firestore-emulator',seedRecords:5000,concurrentReaders:20,queries:times.length,maxDocumentsPerQuery:largest,p50Ms:Math.round(times[Math.floor(times.length*.5)]),p95Ms:Math.round(times[Math.floor(times.length*.95)]),elapsedMs:Math.round(performance.now()-start),productionAccess:false}));await db.terminate();
})().catch(e=>{console.error(e.message);process.exitCode=1;});
