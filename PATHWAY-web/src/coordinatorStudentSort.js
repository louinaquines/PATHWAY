const alphabetical = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

export function studentName(student) {
  return [student.firstName, student.lastName].filter(Boolean).join(' ').trim()
    || student.studentName || student.name || student.student || '';
}

export function compareStudents(a, b) {
  const first = studentName(a);
  const second = studentName(b);
  return Number(!first) - Number(!second) || alphabetical.compare(first, second)
    || alphabetical.compare(a.idNumber || a.studentId || a.id || '', b.idNumber || b.studentId || b.id || '');
}
