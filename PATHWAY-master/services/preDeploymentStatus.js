// Legacy completed accounts predate the explicit pre-deployment approval field.
// Clearance is an existing terminal decision, not a new client-side approval.
export function hasCompletedPreDeployment(profile) {
  return profile?.accountApproved === true && (
    profile.preDeploymentStatus === 'approved' || profile.clearanceStatus === 'cleared'
  );
}

export function nextPreDeploymentAction(profile, summary) {
  const documents = summary?.requirements?.status || profile.requirementsStatus || 'not_submitted';
  const placement = summary?.placement?.status || profile.placementStatus || 'not_started';
  const review = summary?.review?.status || profile.preDeploymentStatus || 'not_submitted';
  if (!profile.accountApproved) return {
    statusLabel: 'ACCOUNT REVIEW', title: 'Account under review', waiting: true,
    message: 'Your coordinator is reviewing your account.',
  };
  if (['not_submitted', 'needs_revision', 'rejected'].includes(documents)) return {
    statusLabel: 'ACTION REQUIRED', title: documents === 'not_submitted' ? 'Submit your requirements first' : 'Update your required documents',
    message: 'Upload the required documents for review.',
    button: 'Go to Requirements', route: 'Requirements',
  };
  if (['pending', 'submitted', 'pending_review'].includes(documents)) return {
    statusLabel: 'DOCUMENT REVIEW', title: 'Requirements under review', waiting: true,
    message: 'Your coordinator is reviewing your documents.',
    button: 'View requirements', route: 'Requirements',
  };
  if (placement !== 'approved') return {
    statusLabel: 'COMPANY PLACEMENT', title: placement === 'pending_review' ? 'Company placement under review' : 'Complete your company placement',
    waiting: placement === 'pending_review',
    message: placement === 'pending_review' ? 'Your company placement is under review.' : 'Select a company and submit your placement details.',
    button: 'View Company Placement', route: 'Company',
  };
  if (review === 'pending_review') return {
    statusLabel: 'FINAL APPROVAL', title: 'Final approval pending', waiting: true,
    message: 'Your final review is pending. OJT tracking starts after approval.',
    button: 'View Approval Status', route: 'Approval',
  };
  if (['needs_revision', 'rejected', 'superseded'].includes(review)) return {
    statusLabel: 'ACTION REQUIRED', title: 'Update your final review',
    message: 'Read the coordinator’s comments, make changes, and resubmit.',
    button: 'Open Final Review', route: 'Review',
  };
  return {
    statusLabel: 'FINAL REVIEW', title: 'Ready for final review',
    message: 'Check your details and submit for final approval.',
    button: 'Open Final Review', route: 'Review',
  };
}
