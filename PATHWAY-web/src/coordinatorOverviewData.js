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
