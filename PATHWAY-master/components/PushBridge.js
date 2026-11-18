import { useEffect } from 'react';
import { AppState } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { onNotificationTap, registerForPush, routeFor, showLocal } from '../services/pushNotifications';

// Registers this device for push and, where remote push is unavailable (Expo Go),
// shows new PATHWAY notices as local system notifications while the app is in the background.
export default function PushBridge({ navigationRef }) {
  useEffect(() => onNotificationTap(data => {
    const target = routeFor(data);
    const go = () => navigationRef?.isReady?.() ? navigationRef.navigate(target.name, target.params) : setTimeout(go, 400);
    go();
  }), [navigationRef]);

  useEffect(() => {
    let stopFeed = () => {};
    const stopAuth = onAuthStateChanged(auth, async owner => {
      stopFeed(); stopFeed = () => {};
      if (!owner) return;
      try {
        const profile = (await getDoc(doc(db, 'users', owner.uid))).data();
        if (profile?.role !== 'student' || profile.disabled) return;
      } catch { return; }
      const remoteToken = await registerForPush();
      if (remoteToken) return; // The backend sends real push to this build.
      let primed = false;
      stopFeed = onSnapshot(query(collection(db, 'notifications'), where('recipientId', '==', owner.uid)), snapshot => {
        if (!primed) { primed = true; return; }
        snapshot.docChanges().forEach(change => {
          if (change.type !== 'added' || AppState.currentState === 'active') return;
          const n = change.doc.data() || {};
          const sensitive = /reject|revision|fix|return|sent back/i.test(`${n.type || ''} ${n.title || ''}`);
          showLocal({ title: n.title || 'PATHWAY', body: n.pushBody || (sensitive ? 'Open PATHWAY to see what to change.' : n.message) || '', data: { type: n.type || '', id: change.doc.id } }).catch(() => {});
        });
      }, () => {});
    });
    return () => { stopAuth(); stopFeed(); };
  }, []);
  return null;
}
