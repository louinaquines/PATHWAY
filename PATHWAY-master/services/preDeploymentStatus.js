export function nextPreDeploymentAction(profile, summary) {
  const documents = summary?.requirements?.status || profile.requirementsStatus || 'not_submitted';
  const placement = summary?.placement?.status || profile.placementStatus || 'not_started';
  const review = summary?.review?.status || profile.preDeploymentStatus || 'not_submitted';
  if (!profile.accountApproved) return {
    statusLabel: 'ACCOUNT REVIEW', title: 'Account under review', waiting: true,
    message: 'Your registration is being verified by your OJT Coordinator. You will gain access once your account is authorized.',
  };
  if (['not_submitted', 'needs_revision', 'rejected'].includes(documents)) return {
    statusLabel: 'ACTION REQUIRED', title: documents === 'not_submitted' ? 'Submit your requirements first' : 'Update your required documents',
    message: 'Complete your document checklist so your coordinator can verify your pre-deployment requirements.',
    button: 'Go to Requirements', route: 'Requirements',
  };
  if (['pending', 'submitted', 'pending_review'].includes(documents)) return {
    statusLabel: 'DOCUMENT REVIEW', title: 'Requirements under review', waiting: true,
    message: 'Your coordinator is reviewing your submitted documents. Check your checklist for updates.',
    button: 'View Requirements Progress', route: 'Requirements',
  };
  if (placement !== 'approved') return {
    statusLabel: 'COMPANY PLACEMENT', title: placement === 'pending_review' ? 'Company placement under review' : 'Complete your company placement',
    waiting: placement === 'pending_review',
    message: placement === 'pending_review' ? 'Your coordinator is reviewing your proposed placement.' : 'Choose your OJT company and submit the placement details for coordinator review.',
    button: 'View Company Placement', route: 'Company',
  };
  if (review === 'pending_review') return {
    statusLabel: 'FINAL APPROVAL', title: 'Final approval pending', waiting: true,
    message: 'Your application is with your coordinator. OJT tracking will unlock after final approval.',
    button: 'View Approval Status', route: 'Approval',
  };
  if (['needs_revision', 'rejected', 'superseded'].includes(review)) return {
    statusLabel: 'ACTION REQUIRED', title: 'Update your final review',
    message: 'Check your coordinator’s notes, update your application, and submit it again.',
    button: 'Open Final Review', route: 'Review',
  };
  return {
    statusLabel: 'FINAL REVIEW', title: 'Ready for final review',
    message: 'Your documents and placement are ready. Review your application and send it to your coordinator.',
    button: 'Open Final Review', route: 'Review',
  };
}
