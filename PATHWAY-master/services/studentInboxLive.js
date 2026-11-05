import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export function watchStudentInbox(uid, refresh, onError) {
  if (!uid) return () => {};
  let stopped = false;
  let running = false;
  let pending = false;
  let timer;

  function schedule() {
    pending = true;
    if (stopped || running || timer) return;
    timer = setTimeout(async () => {
      timer = null;
      if (stopped) return;
      running = true;
      pending = false;
      try {
        if (await refresh() === false) pending = true;
      } catch (error) {
        if (!stopped) onError(error);
      } finally {
        running = false;
        if (!stopped && pending) schedule();
      }
    }, 500);
  }

  const fail = error => { if (!stopped) onError(error); };
  const stopNotices = onSnapshot(query(collection(db, 'notifications'), where('recipientId', '==', uid)), schedule, fail);
  const stopMessages = onSnapshot(query(collection(db, 'messages'), where('participantIds', 'array-contains', uid)), schedule, fail);
  return () => {
    stopped = true;
    clearTimeout(timer);
    stopNotices();
    stopMessages();
  };
}
