export function attendanceHistoryForDate(records, selectedDate, todayDate) {
  return records.filter(record => selectedDate === todayDate
    ? record.date !== todayDate
    : record.date === selectedDate);
}

export function attendanceRecordCountLabel(count) {
  return `${count} ${count === 1 ? 'record' : 'records'}`;
}
