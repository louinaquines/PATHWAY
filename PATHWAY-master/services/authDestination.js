import { hasCompletedPreDeployment } from './preDeploymentStatus';

export function destinationForProfile(profile) {
  switch (profile?.role) {
    case 'admin': return 'AdminDashboard';
    case 'coordinator': return 'CoordinatorDashboard';
    case 'supervisor': return 'SupervisorDashboard';
    case 'student':
      if (profile.passwordChangeRequired) return 'ChangePassword';
      if (profile.accountApproved &&
        (profile.requirementsStatus === 'approved' || hasCompletedPreDeployment(profile))) {
        return 'StudentDashboard';
      }
      return profile.accountApproved ? 'Requirements' : 'StudentDashboard';
    default: return null;
  }
}
