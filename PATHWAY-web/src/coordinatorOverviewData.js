import { requiredHoursTarget } from './completedHoursSummary';

export function canAssignPlacement(student, pendingStudents) {
  return student.accountApproved === true && student.placementStatus !== 'approved'
    && student.clearanceStatus !== 'cleared' && !pendingStudents.has(student.id);
}

export function isReadyForClearance(student, section, evaluatedStudents) {
  return !!student.accountApproved && student.requirementsStatus === 'approved'
    && Number(student.hoursRendered || 0) >= Number(student.hoursRequired || section.hoursRequired || 486)
    && student.preDeploymentStatus === 'approved' && student.placementStatus === 'approved'
    && evaluatedStudents.has(student.id);
}

export function hoursProgressDistribution(students, sectionTarget) {
  const counts = [0, 0, 0, 0];
  let missingTargets = 0;
  for (const student of students) {
    const target = requiredHoursTarget(student, sectionTarget);
    if (!Number.isFinite(target) || target <= 0) {
      missingTargets++;
      continue;
    }
    const rendered = Number(student.hoursRendered);
    const progress = Number.isFinite(rendered) ? rendered / target : 0;
    if (progress <= 0) counts[0]++;
    else if (progress < 0.5) counts[1]++;
    else if (progress < 1) counts[2]++;
    else counts[3]++;
  }
  return { counts, missingTargets };
}
