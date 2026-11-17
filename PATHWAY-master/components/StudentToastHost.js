import React, { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { getStudentNotificationsEnabled, subscribeStudentNotificationPreference } from '../services/studentPreferences';
import { subscribeStudentToasts } from '../services/studentToasts';
import { MotionTouchableOpacity } from './Motion';
import { AppText as Text } from './AppText';
import StudentGuidePose from './StudentGuidePose';
import { CloseIcon } from './Icons';
import { COLORS } from '../theme';

export default function StudentToastHost({ enabled }) {
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [queue, setQueue] = useState([]);
  const insets = useSafeAreaInsets();
  const current = queue[0];
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    setQueue([]);
    if (!enabled || !foreground) return undefined;
    let disposed = false, generation = 0;
    let stopProfile = () => {}, stopFeed = () => {}, stopPreference = () => {};
    const stopAuth = onAuthStateChanged(auth, owner => {
      const request = ++generation;
      stopProfile(); stopFeed(); stopPreference(); setQueue([]);
      if (!owner) return;
      let allowed = false, preference = false, listening = false, preferenceRevision = 0;
      const valid = () => !disposed && request === generation && auth.currentUser === owner;
      const reconcile = () => {
        if (!valid()) return;
        if (!allowed || !preference) { stopFeed(); listening = false; setQueue([]); return; }
        if (listening) return;
        listening = true;
        stopFeed = subscribeStudentToasts(owner.uid, notice => {
          if (valid() && allowed && preference) setQueue(previous => [...previous, { ...notice, owner: owner.uid }].slice(-5));
        }, () => {
          if (valid()) { listening = false; console.warn('Live student updates unavailable; check the notification inbox.'); }
        });
      };
      stopPreference = subscribeStudentNotificationPreference(owner.uid, value => { preferenceRevision++; preference = value; reconcile(); });
      getStudentNotificationsEnabled(owner.uid).then(value => {
        if (valid() && preferenceRevision === 0) { preference = value; reconcile(); }
      }).catch(() => { /* Keep live banners off when the preference cannot be read. */ });
      stopProfile = onSnapshot(doc(db, 'users', owner.uid), snapshot => {
        if (!valid()) return;
        const profile = snapshot.data();
        allowed = profile?.role === 'student' && !profile.disabled && !profile.passwordChangeRequired;
        reconcile();
      }, () => { allowed = false; reconcile(); });
    });
    return () => { disposed = true; generation++; stopAuth(); stopProfile(); stopFeed(); stopPreference(); };
  }, [enabled, foreground]);
  useEffect(() => {
    if (!current) return undefined;
    const timer = setTimeout(() => setQueue(previous => previous.slice(1)), 7000);
    return () => clearTimeout(timer);
  }, [current]);
  if (!enabled || !foreground || !current || current.owner !== auth.currentUser?.uid) return null;
  return <StudentNotificationToast notice={current} insets={insets} onDismiss={() => setQueue(previous => previous.slice(1))} />;
}

export function StudentNotificationToast({ notice, insets = { top: 0, left: 0, right: 0 }, onDismiss }) {
  return <View pointerEvents="box-none" style={[styles.overlay, { top: insets.top + 10, left: insets.left + 12, right: insets.right + 12 }]}>
    <View style={styles.toast} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <StudentGuidePose pose={2} size={60} />
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={2}>{notice.title || 'Coordinator update'}</Text>
        <Text style={styles.body} numberOfLines={3}>{notice.message || notice.body || 'Open your notifications to view the update.'}</Text>
      </View>
      <MotionTouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={onDismiss} style={styles.close}><CloseIcon size={18} color={COLORS.textSecondary} /></MotionTouchableOpacity>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', zIndex: 1000, elevation: 20, alignItems: 'center' },
  toast: { width: '100%', maxWidth: 520, padding: 10, gap: 10, flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: '#D9E8FB', backgroundColor: '#FFFFFF', elevation: 10, shadowColor: '#163C70', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  body: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  close: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
});
