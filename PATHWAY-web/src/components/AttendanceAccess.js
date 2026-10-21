import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';

// Server requests authorize every operation; subscriptions only invalidate local private state.
export default function AttendanceAccess({ actorId, sectionId, children }) {
  const [epoch, setEpoch] = useState(0), [denied, setDenied] = useState(false);
  const version = useRef(0), mounted = useRef(true);
  const user = auth.currentUser;
  const invalidate = () => { version.current++; setDenied(true); };
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => { version.current++; setEpoch(value => value + 1); };
    const signatures = {};
    const observe = (key, value) => {
      const signature = JSON.stringify(value);
      if (signatures[key] !== undefined && signatures[key] !== signature) refresh();
      signatures[key] = signature;
    };
    const unsubscribers = [onAuthStateChanged(auth, actor => { if (actor !== user || actor?.uid !== actorId) invalidate(); })];
    if (actorId && user?.uid === actorId) {
      unsubscribers.push(onSnapshot(doc(db, 'users', actorId), snap => {
        const actor = snap.data();
        if (!actor || actor.role !== 'coordinator' || actor.accountApproved !== true || actor.disabled || ['disabled','inactive','suspended'].includes(actor.status)) invalidate();
        else observe('actor', actor);
      }, invalidate));
      if (sectionId) unsubscribers.push(onSnapshot(doc(db, 'sections', sectionId), snap => {
        const section = snap.data();
        if (!section || section.coordinatorId !== actorId) invalidate();
        else observe('section', section);
      }, invalidate));
      else unsubscribers.push(onSnapshot(query(collection(db, 'sections'), where('coordinatorId', '==', actorId)), snap => {
        observe('sections', snap.docs.map(item => [item.id, item.data()]));
      }, invalidate));
      if (sectionId) unsubscribers.push(onSnapshot(query(collection(db, 'users'), where('sectionId', '==', sectionId), where('role', '==', 'student')), snap => {
        observe('students', snap.docs.map(item => [item.id, item.data()]));
      }, invalidate));
    }
    return () => { unsubscribers.forEach(unsubscribe => unsubscribe()); };
  // The parent keys this boundary by actor and target.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId, sectionId, user]);
  if (denied || !actorId || user?.uid !== actorId) return <p role="alert">Attendance access changed. Select a currently assigned section or sign in again.</p>;
  const generation = version.current;
  const isCurrent = () => mounted.current && generation === version.current && auth.currentUser === user && user?.uid === actorId;
  return <Fragment key={epoch}>{children({ onDenied: invalidate, isCurrent })}</Fragment>;
}
