import { canAssignPlacement, hoursProgressDistribution, isReadyForClearance } from './coordinatorOverviewData';

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

test('hours distribution honors individual targets and separates students without a target', () => {
  const students = [
    { hoursRendered: 0 },
    { hoursRendered: 99 },
    { hoursRendered: 100 },
    { hoursRendered: 100, hoursRequired: 100 },
    { hoursRendered: 220 },
  ];
  expect(hoursProgressDistribution(students, 200)).toEqual({ counts: [1, 1, 1, 2], missingTargets: 0 });
  expect(hoursProgressDistribution([{ hoursRendered: 25 }], 0)).toEqual({ counts: [0, 0, 0, 0], missingTargets: 1 });
});
