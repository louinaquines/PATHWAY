export const attendanceReasonLabels = {
  OVERDUE: 'Completion deadline passed', INVALID_SCHEDULE: 'Valid schedule required', UNCERTAIN_ATTENDANCE: 'Punches need verification',
  INSUFFICIENT_ATTENDANCE: 'Insufficient attendance history', INSUFFICIENT_CREDIT_HISTORY: 'Insufficient credited-hour history', INVALID_TOTALS: 'Authoritative totals unavailable',
  ATTENDANCE_BELOW_80: 'Attendance below 80%', ATTENDANCE_BELOW_90: 'Attendance below 90%', CONSECUTIVE_ABSENCES: 'Consecutive absences',
  ZERO_VELOCITY: 'No credited-hour progress', PROJECTION_HORIZON: 'Projection exceeds supported horizon', CREDIT_PROJECTION: 'Projection from server-credited hours',
  PROJECTED_SHORTFALL: 'Projected shortfall against deadline', SOURCE_UNAVAILABLE: 'Source unavailable',
};

export const attendanceNoticeKinds = { opened: 'Risk episode opened', escalated: 'Risk increased', recovered: 'Reliable recovery', assigned: 'Assigned risk update' };
