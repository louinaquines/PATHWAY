export function destinationForProfile(profile) {
  switch (profile?.role) {
    case 'admin': return 'AdminDashboard';
    case 'coordinator': return 'CoordinatorDashboard';
    case 'supervisor': return 'SupervisorDashboard';
    case 'student':
      if (profile.accountApproved &&
        (profile.requirementsStatus === 'approved' || profile.preDeploymentStatus === 'approved')) {
        return 'StudentDashboard';
      }
      return profile.accountApproved ? 'Requirements' : 'StudentDashboard';
    default: return null;
  }
}
