import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SHADOWS } from '../theme';
import PathwayMark from './PathwayMark';
import { BellIcon, MenuIcon } from './Icons';

/** Shared pre-deployment header: menu, centered PATHWAY mark, and notifications. */
export default function PreDeploymentTopBar({
  onMenuPress,
  onNotificationsPress,
  hasUnread = false,
}) {
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
        accessibilityLabel="Open notifications"
      >
        <BellIcon size={20} color={COLORS.primaryDark} hasUnread={hasUnread} />
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
