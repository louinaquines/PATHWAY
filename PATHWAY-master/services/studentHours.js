// Attendance-credit profile total only. Journal totals are separately reported.
export function studentHours(profile) {
  const rendered = Number(profile?.hoursRendered ?? 0);
  const required = Number(profile?.hoursRequired);
  return { rendered: Number.isFinite(rendered) && rendered >= 0 ? rendered : 0,
    required: Number.isFinite(required) && required > 0 ? required : 486 };
}
