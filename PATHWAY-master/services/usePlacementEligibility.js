import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

export const PLACEMENT_REQUIRED = 'An approved company placement is required before recording attendance or submitting logbooks.';

export default function usePlacementEligibility() {
  const [state, setState] = useState({ eligible: false, companyName: '', assigned: false });
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return undefined;
    let stopCompany;
    const deny = () => setState({ eligible: false, companyName: '', assigned: false });
    const stopProfile = onSnapshot(doc(db, 'users', uid), snapshot => {
      stopCompany?.();
      deny();
      const profile = snapshot.data();
      if (profile?.placementStatus !== 'approved' || typeof profile.companyId !== 'string'
        || !profile.companyId.trim() || profile.companyId.includes('/')) return;
      stopCompany = onSnapshot(doc(db, 'companies', profile.companyId), company => {
        const data = company.data();
        const assigned = company.exists() && data.active !== false && data.status !== 'inactive';
        setState({ assigned, companyName: assigned ? data.name || profile.company || profile.companyName || 'Assigned company' : '',
          eligible: assigned && profile.role === 'student' && profile.accountApproved === true
            && profile.preDeploymentStatus === 'approved' && profile.clearanceStatus !== 'cleared'
            && profile.passwordChangeRequired !== true });
      }, deny);
    }, deny);
    return () => { stopProfile(); stopCompany?.(); };
  }, []);
  return state;
}
