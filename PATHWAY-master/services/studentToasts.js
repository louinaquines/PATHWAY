import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { createStudentToastTracker } from './studentToastTracker';

export function subscribeStudentToasts(uid, onToast, onError) {
  const track = createStudentToastTracker(uid);
  return onSnapshot(query(collection(db, 'notifications'), where('recipientId', '==', uid), orderBy('createdAt', 'desc'), limit(30)),
    { includeMetadataChanges: true }, snapshot => track(snapshot).forEach(onToast), onError);
}
