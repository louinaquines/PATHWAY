import { completedHoursSummary } from './completedHoursSummary';
test('uses individual targets then section fallback; hours completion is independent of clearance',()=>{
 expect(completedHoursSummary([{hoursRequired:100,hoursRendered:100},{sectionId:'a',hoursRendered:250},{hoursRequired:500,hoursRendered:300}], [{id:'a',hoursRequired:250}])).toEqual({completed:2,total:3,percent:67,missingTargets:0});
});
test('missing targets and invalid hours never count as complete',()=>{expect(completedHoursSummary([{hoursRendered:1000},{hoursRequired:100,hoursRendered:'bad'}],[])).toEqual({completed:0,total:2,percent:0,missingTargets:1});});
test('empty department has a zero percentage',()=>{expect(completedHoursSummary([],[])).toEqual({completed:0,total:0,percent:0,missingTargets:0});});
