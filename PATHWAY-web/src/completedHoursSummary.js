export function requiredHoursTarget(student, sectionTarget) {
  const own = Number(student.hoursRequired);
  return Number.isFinite(own) && own > 0 ? own : Number(sectionTarget);
}

export function completedHoursSummary(students, sections) {
  const targets = new Map(sections.map(section => [section.id, Number(section.hoursRequired)]));
  let completed = 0, missingTargets = 0;
  for (const student of students) {
    const target = requiredHoursTarget(student, targets.get(student.sectionId));
    if (!Number.isFinite(target) || target <= 0) { missingTargets++; continue; }
    const rendered = Number(student.hoursRendered);
    if (Number.isFinite(rendered) && rendered >= target) completed++;
  }
  return { completed, total: students.length, percent: students.length ? Math.round(completed / students.length * 100) : 0, missingTargets };
}
