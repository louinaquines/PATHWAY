import AttendanceAccess from '../components/AttendanceAccess';
import WorkplaceConcernReview from '../components/WorkplaceConcernReview';
import { localWorkplaceReviewEnabled } from '../localWorkplaceReview';

export default function WorkplaceConcernsTab({ coordinatorId }) {
  if (!localWorkplaceReviewEnabled()) return <p role="alert">Local workplace concern review is disabled.</p>;
  return <div style={{ width: '100%',maxWidth: 1200,padding: 24 }}>
    <AttendanceAccess key={coordinatorId} actorId={coordinatorId}
      deniedMessage="Workplace concern access changed. Refresh your workspace or sign in again.">
      {access => <WorkplaceConcernReview access={access} />}
    </AttendanceAccess>
  </div>;
}
