import { readPortalPage, mergePortalRecords } from './portalRecordPages';
import { getDocs, query, limit, startAfter } from 'firebase/firestore';
jest.mock('firebase/firestore',()=>({getDocs:jest.fn(),query:jest.fn((...args)=>args),limit:jest.fn(n=>({limit:n})),startAfter:jest.fn(cursor=>({cursor}))}));
test('look-ahead uses a bounded query and resumes after the last displayed record',async()=>{
 const docs=Array.from({length:51},(_,i)=>({id:String(i),data:()=>({value:i})}));getDocs.mockResolvedValue({docs});
 const page=await readPortalPage('base');expect(limit).toHaveBeenCalledWith(51);expect(page.records).toHaveLength(50);expect(page.cursor.id).toBe('49');expect(page.hasMore).toBe(true);
 await readPortalPage('base',page.cursor);expect(startAfter).toHaveBeenCalledWith(docs[49]);
});
test('10,000 synthetic records remain reachable through 200 bounded cursor pages',async()=>{
 const dataset=Array.from({length:10000},(_,i)=>({id:String(i),data:()=>({value:i})}));let reads=0;
 getDocs.mockImplementation(async constraints=>{reads++;const after=constraints.find(x=>x?.cursor)?.cursor;const start=after?Number(after.id)+1:0;return {docs:dataset.slice(start,start+51)};});
 let cursor=null,more=true,all=[];while(more){const page=await readPortalPage('base',cursor);expect(page.records.length).toBeLessThanOrEqual(50);all=mergePortalRecords(all,page.records);cursor=page.cursor;more=page.hasMore;}
 expect(reads).toBe(200);expect(all).toHaveLength(10000);expect(all.at(-1).id).toBe('9999');
});
test('rejects oversized requests and merges refreshed records without duplicates',async()=>{await expect(readPortalPage('base',null,101)).rejects.toThrow();expect(mergePortalRecords([{id:'a',v:1}],[{id:'a',v:2}])).toEqual([{id:'a',v:2}]);});
