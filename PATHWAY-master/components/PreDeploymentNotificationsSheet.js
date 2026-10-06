import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { COLORS, RADIUS } from '../theme';
import { AppText as Text } from './AppText';
import {
  BellIcon,
  CloseIcon,
  FileIcon,
} from './Icons';

export default function PreDeploymentNotificationsSheet({ visible, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const uid = auth.currentUser?.uid;
  useEffect(() => {
    if (!visible || !uid) return;
    setLoading(true);
    setError('');
    return onSnapshot(query(collection(db, 'notifications'), where('recipientId', '==', uid)), snapshot => {
      const timestamp = value => typeof value?.toMillis === 'function' ? value.toMillis() : new Date(value || 0).getTime();
      setItems(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt)));
      setLoading(false);
    }, () => {
      setError('Could not load updates. Close this panel and try again.');
      setLoading(false);
    });
  }, [visible, uid]);
  const markRead = async item => {
    if (item.read) return;
    try { await updateDoc(doc(db, 'notifications', item.id), { read: true }); }
    catch (_) { setError('Could not mark this update as read. Please try again.'); }
  };
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close notifications"
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.titleGroup}>
              <View style={styles.bellIcon}>
                <BellIcon size={19} color={COLORS.primary} hasUnread={items.some(item => !item.read)} />
              </View>
              <View style={styles.titleCopy}>
                <Text style={styles.title}>Notifications</Text>
                <Text style={styles.subtitle}>Your pre-deployment updates</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close notifications"
              activeOpacity={0.75}
            >
              <CloseIcon size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.updatesHeading}>
            <Text style={styles.updatesTitle}>Recent updates</Text>
            <Text style={styles.updatesCount}>{items.length} {items.length === 1 ? 'update' : 'updates'}</Text>
          </View>

          <ScrollView
            style={styles.notificationScroll}
            contentContainerStyle={styles.notificationList}
            showsVerticalScrollIndicator={false}
          >
            {loading ? <ActivityIndicator color={COLORS.primary} accessibilityLabel="Loading notifications" /> : null}
            {error ? <Text style={styles.notificationMessage} accessibilityRole="alert">{error}</Text> : null}
            {!loading && !error && items.length === 0 ? (
              <View style={styles.notification}>
                <BellIcon size={20} color={COLORS.primary} />
                <View style={styles.notificationContent}>
                  <Text style={styles.notificationTitle}>All caught up</Text>
                  <Text style={styles.notificationMessage}>Your coordinator’s document, placement, and approval updates will appear here.</Text>
                </View>
              </View>
            ) : null}
            {!loading && items.map(item => {
              const date = typeof item.createdAt?.toDate === 'function' ? item.createdAt.toDate() : new Date(item.createdAt || '');
              return (
                <TouchableOpacity key={item.id} onPress={() => markRead(item)} activeOpacity={0.8}
                  accessibilityRole="button" accessibilityLabel={`${item.title || 'Coordinator update'}${item.read ? '' : ', unread'}`}
                  style={[styles.notification, !item.read && styles.notificationLatest]}>
                  <View style={[styles.notificationIcon, styles.notificationIconBlue]}><FileIcon size={18} color={COLORS.primary} /></View>
                  <View style={styles.notificationContent}>
                    <View style={styles.notificationTop}>
                      <Text style={styles.notificationTitle}>{item.title || 'Coordinator update'}</Text>
                      {!item.read ? <Text style={[styles.notificationTime, styles.notificationTimeLatest]}>NEW</Text> : null}
                    </View>
                    <Text style={styles.notificationMessage}>{item.message || item.body || ''}</Text>
                    {Number.isNaN(date.getTime()) ? null : <Text style={styles.notificationMessage}>{date.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.46)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '78%',
    alignSelf: 'center',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 30 : 22,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 18,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D7DEE8',
    alignSelf: 'center',
    marginBottom: 17,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  bellIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySubtle,
  },
  titleCopy: { flex: 1 },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#F4F7FB',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 19, fontWeight: '800', color: COLORS.textPrimary },
  subtitle: { fontSize: 11, color: COLORS.textMuted, marginTop: 3 },
  updatesHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  updatesTitle: { fontSize: 12, fontWeight: '800', color: COLORS.textSecondary },
  updatesCount: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },
  notificationScroll: { flexShrink: 1 },
  notificationList: { gap: 9 },
  notification: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 13,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  notificationLatest: { backgroundColor: '#FAFCFF', borderColor: '#DCEBFF' },
  notificationIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationIconBlue: { backgroundColor: '#EAF2FF' },
  notificationIconGold: { backgroundColor: COLORS.warningSubtle },
  notificationContent: { flex: 1, minWidth: 0 },
  notificationTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notificationTitle: { flex: 1, fontSize: 12, fontWeight: '700', color: COLORS.textPrimary },
  notificationMessage: { fontSize: 11, color: COLORS.textSecondary, marginTop: 5, lineHeight: 16 },
  notificationTime: {
    fontSize: 8,
    color: COLORS.textMuted,
    fontWeight: '800',
    letterSpacing: 0.45,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  notificationTimeLatest: { color: COLORS.primaryDark, backgroundColor: '#EAF2FF' },
});
