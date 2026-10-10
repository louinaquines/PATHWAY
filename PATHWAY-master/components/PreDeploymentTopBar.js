import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SHADOWS } from '../theme';
import PathwayMark from './PathwayMark';
import { BellIcon, MenuIcon } from './Icons';

/** Shared pre-deployment header: menu, centered PATHWAY mark, and notifications. */
export default function PreDeploymentTopBar({
  onMenuPress,
  onNotificationsPress,
  hasUnread,
}) {
  const [liveHasUnread, setLiveHasUnread] = useState(false);
  useEffect(() => {
    let stopNotifications;
    let generation = 0;
    const stopAuth = onAuthStateChanged(auth, user => {
      const currentGeneration = ++generation;
      stopNotifications?.();
      setLiveHasUnread(false);
      if (!user) return;
      stopNotifications = onSnapshot(
        query(collection(db, 'notifications'), where('recipientId', '==', user.uid)),
        snapshot => {
          if (generation === currentGeneration) {
            setLiveHasUnread(snapshot.docs.some(item => !item.data().read));
          }
        },
        () => {
          if (generation === currentGeneration) setLiveHasUnread(false);
        },
      );
    });
    return () => {
      generation += 1;
      stopAuth();
      stopNotifications?.();
    };
  }, []);
  const showUnread = hasUnread ?? liveHasUnread;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
    <View style={styles.topBar}>
      <TouchableOpacity
        style={styles.iconButton}
        onPress={onMenuPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <MenuIcon size={19} color={COLORS.primaryDark} />
      </TouchableOpacity>

      <View pointerEvents="box-none" style={styles.brandCenter}>
        <PathwayMark size={38} />
      </View>

      <TouchableOpacity
        style={styles.iconButton}
        onPress={onNotificationsPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={showUnread ? 'Open notifications, unread updates' : 'Open notifications'}
      >
        <BellIcon size={20} color={COLORS.primaryDark} hasUnread={showUnread} />
      </TouchableOpacity>
    </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#FFFFFF' },
  topBar: {
    height: 64,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight || COLORS.border,
    position: 'relative',
    zIndex: 2,
    ...SHADOWS.soft,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySubtle || COLORS.background,
    zIndex: 1,
  },
  brandCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 12,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
