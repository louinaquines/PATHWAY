import { canAssignPlacement, isReadyForClearance } from './coordinatorOverviewData';

test('waiting students exclude pending requests and official placements', () => {
  const student = { id: 's1', accountApproved: true };
  expect(canAssignPlacement(student, new Set())).toBe(true);
  expect(canAssignPlacement(student, new Set(['s1']))).toBe(false);
  expect(canAssignPlacement({ ...student, placementStatus: 'approved' }, new Set())).toBe(false);
});

test('clearance readiness requires an official placement and a submitted evaluation', () => {
  const student = {
    id: 's1', accountApproved: true, requirementsStatus: 'approved',
    placementStatus: 'approved', preDeploymentStatus: 'approved', hoursRendered: 480,
  };
  expect(isReadyForClearance(student, { hoursRequired: 480 }, new Set(['s1']))).toBe(true);
  expect(isReadyForClearance(student, { hoursRequired: 480 }, new Set())).toBe(false);
  expect(isReadyForClearance(student, { hoursRequired: 481 }, new Set(['s1']))).toBe(false);
});
