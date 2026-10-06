import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { COLORS, RADIUS } from '../theme';
import { useReducedMotion } from './Motion';

const VARIANTS = {
  dashboard: { profile: true, stats: true, cards: 3, darkHeader: false },
  inbox: { profile: false, stats: false, cards: 5, darkHeader: true },
  progress: { profile: false, stats: true, cards: 4, darkHeader: true },
  requirements: { profile: false, stats: false, cards: 5, darkHeader: false },
  placement: { profile: false, stats: false, cards: 4, darkHeader: false },
  attendance: { profile: false, stats: true, cards: 3, darkHeader: true },
  logbook: { profile: false, stats: false, cards: 4, darkHeader: true },
  review: { profile: false, stats: false, cards: 4, darkHeader: false },
};

function Block({ pulse, style }) {
  return <Animated.View style={[styles.block, style, { opacity: pulse }]} />;
}

export default function StudentScreenSkeleton({ variant = 'dashboard' }) {
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.72)).current;
  const layout = VARIANTS[variant] || VARIANTS.dashboard;

  useEffect(() => {
    pulse.stopAnimation();
    if (reducedMotion) {
      pulse.setValue(0.88);
      return undefined;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 760, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(pulse, { toValue: 0.68, duration: 760, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, reducedMotion]);

  return (
    <View accessible accessibilityLabel="Loading screen content" style={styles.screen}>
      <StatusBar
        barStyle={layout.darkHeader ? 'light-content' : 'dark-content'}
        backgroundColor={layout.darkHeader ? COLORS.primaryDark : COLORS.surface}
      />
      <View style={[styles.header, layout.darkHeader ? styles.darkHeader : styles.lightHeader]}>
        <Block pulse={pulse} style={[styles.headerIcon, layout.darkHeader ? styles.darkHeaderBlock : styles.lightHeaderBlock]} />
        <Block pulse={pulse} style={[styles.headerTitle, layout.darkHeader ? styles.darkHeaderBlock : styles.lightHeaderBlock]} />
        <Block pulse={pulse} style={[styles.headerAction, layout.darkHeader ? styles.darkHeaderBlock : styles.lightHeaderBlock]} />
      </View>
      <View style={[styles.body, variant === 'dashboard' && styles.dashboardBody]}>
        {variant === 'dashboard' ? (
          <View style={styles.dashboardSkeleton}>
            <View style={styles.welcomeSkeleton}>
              <View style={{ flex: 1, gap: 6 }}>
                <Block pulse={pulse} style={{ width: '38%', height: 10 }} />
                <Block pulse={pulse} style={{ width: '68%', height: 24 }} />
                <Block pulse={pulse} style={{ width: '45%', height: 12 }} />
              </View>
              <Block pulse={pulse} style={[styles.avatar, styles.dashboardAvatar]} />
            </View>

            {/* OJT Progress Hero Block */}
            <View style={styles.heroSkeleton}>
              <View style={styles.heroMainSkeleton}>
                <View style={{ flex: 1, gap: 12 }}>
                  <Block pulse={pulse} style={{ width: 112, height: 12, backgroundColor: COLORS.secondaryLight }} />
                  <Block pulse={pulse} style={{ width: 150, height: 32, backgroundColor: COLORS.secondaryLight }} />
                </View>
                <View style={styles.progressRingSkeleton}>
                  <Block pulse={pulse} style={styles.progressRingCenterSkeleton} />
                </View>
              </View>
              <View style={styles.heroFooterSkeleton}>
                <Block pulse={pulse} style={{ width: 110, height: 12, backgroundColor: COLORS.secondaryLight }} />
                <Block pulse={pulse} style={{ width: 80, height: 12, backgroundColor: COLORS.secondaryLight }} />
              </View>
            </View>

            {/* Supporting metrics strip */}
            <View style={styles.stripSkeleton}>
              <View style={{ flex: 1, gap: 5 }}>
                <Block pulse={pulse} style={{ width: '50%', height: 9 }} />
                <Block pulse={pulse} style={{ width: '35%', height: 18 }} />
                <Block pulse={pulse} style={{ width: '60%', height: 9 }} />
              </View>
              <View style={{ width: 1, height: 44, backgroundColor: COLORS.borderLight }} />
              <View style={{ flex: 1, gap: 5 }}>
                <Block pulse={pulse} style={{ width: '50%', height: 9 }} />
                <Block pulse={pulse} style={{ width: '35%', height: 18 }} />
                <Block pulse={pulse} style={{ width: '60%', height: 9 }} />
              </View>
            </View>

            {/* Placement Row */}
            <View style={styles.rowSkeleton}>
              <Block pulse={pulse} style={styles.cardIcon} />
              <View style={{ flex: 1, gap: 6 }}>
                <Block pulse={pulse} style={{ width: '60%', height: 14 }} />
                <Block pulse={pulse} style={{ width: '85%', height: 10 }} />
              </View>
              <Block pulse={pulse} style={{ width: 70, height: 22, borderRadius: 11 }} />
            </View>

            {/* Activity Rows */}
            <View style={{ marginTop: 12, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Block pulse={pulse} style={{ width: 110, height: 14 }} />
                <Block pulse={pulse} style={{ width: 50, height: 12 }} />
              </View>
              {[0, 1].map(k => (
                <View key={k} style={[styles.activitySkeletonRow, k === 0 && styles.activitySkeletonRowFirst]}>
                  <Block pulse={pulse} style={{ width: 32, height: 32, borderRadius: 8 }} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Block pulse={pulse} style={{ width: '75%', height: 12 }} />
                    <Block pulse={pulse} style={{ width: '35%', height: 9 }} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <>
            <Block pulse={pulse} style={styles.pageTitle} />
            <Block pulse={pulse} style={styles.pageSubtitle} />
            {layout.profile && (
              <View style={[styles.card, styles.profileCard]}>
                <Block pulse={pulse} style={styles.avatar} />
                <View style={styles.profileLines}>
                  <Block pulse={pulse} style={styles.profileName} />
                  <Block pulse={pulse} style={styles.profileDetail} />
                </View>
              </View>
            )}
            {layout.stats && (
              <View style={styles.statsRow}>
                {[0, 1].map(key => (
                  <View key={key} style={[styles.card, styles.statCard]}>
                    <Block pulse={pulse} style={styles.statLabel} />
                    <Block pulse={pulse} style={styles.statValue} />
                    <Block pulse={pulse} style={styles.statDetail} />
                  </View>
                ))}
              </View>
            )}
            {Array.from({ length: layout.cards }, (_, index) => (
              <View key={index} style={[styles.card, variant === 'inbox' ? styles.inboxCard : styles.contentCard]}>
                <Block pulse={pulse} style={variant === 'inbox' ? styles.inboxAvatar : styles.cardIcon} />
                <View style={styles.cardLines}>
                  <Block pulse={pulse} style={styles.cardTitle} />
                  <Block pulse={pulse} style={styles.cardLine} />
                  {variant !== 'inbox' && <Block pulse={pulse} style={styles.cardShortLine} />}
                </View>
              </View>
            ))}
          </>
        )}
      </View>
      {variant === 'dashboard' ? (
        <View style={styles.dashboardBottomDock}>
          <View style={styles.dashboardQuickActions}>
            <Block pulse={pulse} style={styles.dashboardMessageAction} />
            <Block pulse={pulse} style={styles.dashboardLogAction} />
          </View>
          <View style={styles.dashboardBottomBar}>
            {[0, 1, 2, 3].map(key => (
              <View key={key} style={styles.dashboardTabPlaceholder}>
                <Block pulse={pulse} style={styles.dashboardTabIcon} />
                <Block pulse={pulse} style={styles.dashboardTabLabel} />
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>

  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
  },
  darkHeader: { backgroundColor: COLORS.primaryDark },
  lightHeader: { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  headerIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#1E3A5F' },
  headerTitle: { width: 112, height: 11, borderRadius: 6, backgroundColor: '#1E3A5F' },
  headerAction: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#1E3A5F', marginLeft: 'auto' },
  darkHeaderBlock: { backgroundColor: '#1E3A5F' },
  lightHeaderBlock: { backgroundColor: COLORS.secondaryLight },
  body: { width: '100%', maxWidth: 600, alignSelf: 'center', padding: 18, paddingBottom: 30 },
  dashboardBody: { maxWidth: 760 },
  dashboardBottomDock: { width: '100%', maxWidth: 760, alignSelf: 'center', marginTop: 'auto' },
  dashboardQuickActions: { flexDirection: 'column', alignItems: 'flex-end', gap: 10, paddingHorizontal: 14, paddingBottom: 8 },
  dashboardMessageAction: { width: 60, height: 60, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceMuted },
  dashboardLogAction: { width: 60, height: 60, borderRadius: RADIUS.full, backgroundColor: COLORS.secondaryLight },
  dashboardBottomBar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 8, paddingBottom: 10, borderTopWidth: 1, borderTopColor: COLORS.borderLight, backgroundColor: COLORS.surface },
  dashboardTabPlaceholder: { flex: 1, alignItems: 'center', gap: 4 },
  dashboardTabIcon: { width: 34, height: 28, borderRadius: RADIUS.full, backgroundColor: COLORS.primaryLight },
  dashboardTabLabel: { width: 30, height: 8, borderRadius: 4 },
  pageTitle: { width: '52%', height: 22, marginBottom: 10 },
  pageSubtitle: { width: '78%', height: 11, marginBottom: 18 },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.borderLight,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
  },
  profileCard: { minHeight: 86, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 12 },
  avatar: { width: 48, height: 48, borderRadius: 16 },
  dashboardAvatar: { width: 46, height: 46, borderRadius: 23 },
  profileLines: { flex: 1, gap: 10 },
  profileName: { width: '48%', height: 14 },
  profileDetail: { width: '63%', height: 10 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: { flex: 1, minHeight: 104, padding: 13, justifyContent: 'space-between' },
  statLabel: { width: '64%', height: 9 },
  statValue: { width: '42%', height: 20 },
  statDetail: { width: '70%', height: 9 },
  contentCard: { minHeight: 84, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 10 },
  inboxCard: { minHeight: 76, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 9 },
  cardIcon: { width: 38, height: 38, borderRadius: 12 },
  inboxAvatar: { width: 44, height: 44, borderRadius: 22 },
  cardLines: { flex: 1, gap: 9 },
  cardTitle: { width: '64%', height: 12 },
  cardLine: { width: '91%', height: 9 },
  cardShortLine: { width: '54%', height: 9 },
  block: { backgroundColor: COLORS.secondaryLight, borderRadius: RADIUS.sm },
  dashboardSkeleton: { gap: 18 },
  welcomeSkeleton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  heroSkeleton: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  heroMainSkeleton: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressRingSkeleton: { width: 80, height: 80, borderRadius: 40, borderWidth: 7, borderColor: COLORS.secondaryLight, alignItems: 'center', justifyContent: 'center' },
  progressRingCenterSkeleton: { width: 28, height: 12, borderRadius: 6, backgroundColor: COLORS.secondaryLight },
  heroFooterSkeleton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  stripSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  rowSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'transparent',
    paddingVertical: 13,
    paddingHorizontal: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.borderLight,
  },
  activitySkeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'transparent',
    paddingVertical: 11,
    paddingHorizontal: 0,
    borderTopWidth: 1,
    borderColor: COLORS.borderLight,
  },
  activitySkeletonRowFirst: { borderTopWidth: 0 },
});
