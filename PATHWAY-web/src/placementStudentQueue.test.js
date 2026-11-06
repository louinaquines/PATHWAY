import { placementStudentQueue } from './placementStudentQueue';
test('one student row retains concurrent tasks and prioritizes the immediate review', () => {
 const rows=placementStudentQueue({placements:[{id:'p',studentId:'s',studentName:'Alex',status:'pending_review',companyName:'Host'}],finals:[{id:'f',studentId:'s',status:'pending_review'}],endorsements:[{id:'e',studentId:'s',draftVersion:1}],history:[{id:'h',studentId:'s'}]});
 expect(rows).toHaveLength(1);expect(rows[0].tasks).toHaveLength(4);expect(rows[0].current.action).toBe('Review placement');expect(rows[0].hasHistory).toBe(true);
});
test('waiting on a student and uncertain email delivery never disappear into completed',()=>{
 const rows=placementStudentQueue({placements:[{studentId:'a',status:'needs_revision'}],verified:[{studentId:'b',deliveryStatus:'sending'},{studentId:'c',deliveryStatus:'sent'}]});
 expect(rows.find(row=>row.id==='a').needsAction).toBe(true);expect(rows.find(row=>row.id==='b').needsAction).toBe(true);expect(rows.find(row=>row.id==='c').needsAction).toBe(false);
});

it('groups 1000 students without duplicating concurrent tasks', () => {
  const placements = Array.from({length:1000}, (_,i)=>({id:'p'+i,studentId:'s'+i,studentName:'Student '+i,status:'pending_review'}));
  const finals = placements.map(item=>({...item,id:'f'+item.id}));
  const rows = placementStudentQueue({placements,finals});
  expect(rows).toHaveLength(1000);
  expect(rows.every(row=>row.tasks.length===2 && row.needsAction)).toBe(true);
});
