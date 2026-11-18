import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { COLORS, RADIUS } from '../theme';
import { useReducedMotion } from './Motion';

const VARIANTS = {
  profile: { profile: true, stats: false, cards: 2, darkHeader: false },
  dashboard: { profile: true, stats: true, cards: 3, darkHeader: false },
  inbox: { profile: false, stats: false, cards: 5, darkHeader: false },
  progress: { profile: false, stats: false, cards: 0, darkHeader: false },
  requirements: { profile: false, stats: false, cards: 5, darkHeader: false },
  placement: { profile: false, stats: false, cards: 4, darkHeader: false },
  attendance: { profile: false, stats: false, cards: 2, darkHeader: false },
  logbook: { profile: false, stats: false, cards: 3, darkHeader: false },
  review: { profile: false, stats: false, cards: 4, darkHeader: false },
  gate: { profile: false, stats: false, cards: 0, darkHeader: false },
};
// Screens that use the student top bar: button left, PATHWAY mark centre, bell right.
const BRAND_HEADER = new Set(['dashboard', 'gate', 'requirements', 'placement', 'review']);

function Block({ pulse, style }) {
  return <Animated.View style={[styles.block, style, { opacity: pulse }]} />;
}


// Shared pieces that mirror the current approved-student home and logbook cards.
function HoursCardSkel({ pulse }) {
  return (
    <View style={[styles.card, { gap: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Block pulse={pulse} style={{ width: 32, height: 32, borderRadius: 10 }} />
        <Block pulse={pulse} style={{ width: 120, height: 11 }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Block pulse={pulse} style={{ width: '52%', height: 32 }} />
        <Block pulse={pulse} style={{ width: 58, height: 28, borderRadius: 12 }} />
      </View>
      <Block pulse={pulse} style={{ width: '100%', height: 22, borderRadius: 7 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Block pulse={pulse} style={{ width: 110, height: 12 }} />
        <Block pulse={pulse} style={{ width: 96, height: 12 }} />
      </View>
    </View>
  );
}

function BottomNavSkel({ pulse }) {
  return (
    <View style={styles.navSkel}>
      {[0, 1, 2, 3, 4].map(k => k === 2
        ? <Block key={k} pulse={pulse} style={{ width: 56, height: 56, borderRadius: 28, marginTop: -26 }} />
        : <Block key={k} pulse={pulse} style={{ width: 26, height: 26, borderRadius: 8 }} />)}
    </View>
  );
}

function ApprovedHomeSkel({ pulse }) {
  return (
    <View style={{ gap: 16 }}>
      <View style={[styles.welcomeCardSkel]}>
        <View style={{ flex: 1, gap: 8, paddingRight: 120 }}>
          <Block pulse={pulse} style={{ width: '70%', height: 26 }} />
          <Block pulse={pulse} style={{ width: '55%', height: 26 }} />
          <Block pulse={pulse} style={{ width: '80%', height: 12 }} />
        </View>
        <Block pulse={pulse} style={styles.welcomeGuideSkel} />
      </View>
      <HoursCardSkel pulse={pulse} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {[0, 1].map(k => (
          <View key={k} style={[styles.card, { flex: 1, flexDirection: 'row', gap: 10, padding: 14 }]}>
            <Block pulse={pulse} style={{ width: 40, height: 40, borderRadius: 12 }} />
            <View style={{ flex: 1, gap: 7 }}>
              <Block pulse={pulse} style={{ width: '80%', height: 9 }} />
              <Block pulse={pulse} style={{ width: '45%', height: 24 }} />
              <Block pulse={pulse} style={{ width: '75%', height: 10 }} />
            </View>
          </View>
        ))}
      </View>
      <Block pulse={pulse} style={{ width: 190, height: 18 }} />
      <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
        <Block pulse={pulse} style={{ width: 48, height: 48, borderRadius: 14 }} />
        <View style={{ flex: 1, gap: 7 }}>
          <Block pulse={pulse} style={{ width: '65%', height: 14 }} />
          <Block pulse={pulse} style={{ width: '80%', height: 10 }} />
        </View>
        <Block pulse={pulse} style={{ width: 80, height: 26, borderRadius: 13 }} />
      </View>
      <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 110 }]}>
        <Block pulse={pulse} style={{ width: 90, height: 90, borderRadius: 45 }} />
        <View style={{ flex: 1, gap: 8 }}>
          <Block pulse={pulse} style={{ width: '70%', height: 16 }} />
          <Block pulse={pulse} style={{ width: '90%', height: 11 }} />
        </View>
      </View>
    </View>
  );
}

function RequirementsSkel({ pulse }) {
  return (
    <View style={{ gap: 16 }}>
      <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', minHeight: 150 }]}>
        <View style={{ flex: 1, gap: 8 }}>
          <Block pulse={pulse} style={{ width: 110, height: 10 }} />
          <Block pulse={pulse} style={{ width: '80%', height: 24 }} />
          <Block pulse={pulse} style={{ width: '60%', height: 24 }} />
          <Block pulse={pulse} style={{ width: '85%', height: 12 }} />
        </View>
        <Block pulse={pulse} style={{ width: 110, height: 120, borderRadius: 18 }} />
      </View>
      <View style={[styles.card, { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 22 }]}>
        {[0, 1, 2, 3].map(k => (
          <View key={k} style={{ alignItems: 'center', gap: 8 }}>
            <Block pulse={pulse} style={{ width: 36, height: 36, borderRadius: 18 }} />
            <Block pulse={pulse} style={{ width: 54, height: 9 }} />
          </View>
        ))}
      </View>
      <View style={[styles.card, { gap: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Block pulse={pulse} style={{ width: 48, height: 48, borderRadius: 14 }} />
          <View style={{ flex: 1, gap: 7 }}>
            <Block pulse={pulse} style={{ width: '60%', height: 15 }} />
            <Block pulse={pulse} style={{ width: '40%', height: 11 }} />
          </View>
          <Block pulse={pulse} style={{ width: 46, height: 22, borderRadius: 11 }} />
        </View>
        <Block pulse={pulse} style={{ width: '100%', height: 8, borderRadius: 4 }} />
        <Block pulse={pulse} style={{ width: '55%', height: 11 }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ gap: 7 }}>
          <Block pulse={pulse} style={{ width: 150, height: 18 }} />
          <Block pulse={pulse} style={{ width: 210, height: 10 }} />
        </View>
        <Block pulse={pulse} style={{ width: 50, height: 11 }} />
      </View>
      {[0, 1, 2, 3, 4].map(k => (
        <View key={k} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <Block pulse={pulse} style={{ width: 48, height: 48, borderRadius: 14 }} />
          <View style={{ flex: 1, gap: 7 }}>
            <Block pulse={pulse} style={{ width: '70%', height: 14 }} />
            <Block pulse={pulse} style={{ width: '50%', height: 10 }} />
          </View>
          <Block pulse={pulse} style={{ width: 72, height: 24, borderRadius: 12 }} />
          <Block pulse={pulse} style={{ width: 16, height: 16, borderRadius: 4 }} />
        </View>
      ))}
    </View>
  );
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
      {['dashboard', 'logbook'].includes(variant) && <BottomNavSkel pulse={pulse} />}
      <StatusBar
        barStyle={layout.darkHeader ? 'light-content' : 'dark-content'}
        backgroundColor={layout.darkHeader ? COLORS.primaryDark : COLORS.surface}
      />
      {BRAND_HEADER.has(variant) ? (
        <View style={[styles.header, styles.lightHeader, styles.brandHeader]}>
          <Block pulse={pulse} style={styles.brandSideButton} />
          <Block pulse={pulse} style={styles.brandMark} />
          <Block pulse={pulse} style={styles.brandSideButton} />
        </View>
      ) : (
        <View style={[styles.header, layout.darkHeader ? styles.darkHeader : styles.lightHeader]}>
          <Block pulse={pulse} style={[styles.headerIcon, layout.darkHeader ? styles.darkHeaderBlock : styles.lightHeaderBlock]} />
          <Block pulse={pulse} style={[styles.headerTitle, layout.darkHeader ? styles.darkHeaderBlock : styles.lightHeaderBlock]} />
          <Block pulse={pulse} style={[styles.headerAction, layout.darkHeader ? styles.darkHeaderBlock : styles.lightHeaderBlock]} />
        </View>
      )}
      {variant === 'inbox' && (
        <View style={styles.inboxControls}>
          <View style={styles.inboxTabs}>
            <Block pulse={pulse} style={{ flex: 1, height: 36 }} />
            <Block pulse={pulse} style={{ flex: 1, height: 36 }} />
          </View>
          <Block pulse={pulse} style={{ height: 44, width: '100%' }} />
        </View>
      )}
      <View style={[styles.body, variant === 'dashboard' && styles.dashboardBody]}>
        {variant === 'attendance' && (
          <View style={{ gap: 16 }}>
            <View style={{ gap: 8 }}>
              <Block pulse={pulse} style={{ width: 100, height: 10 }} />
              <Block pulse={pulse} style={{ width: '55%', height: 24 }} />
              <Block pulse={pulse} style={{ width: '90%', height: 12 }} />
            </View>
            <View style={[styles.card, { gap: 14 }]}>
              <Block pulse={pulse} style={{ width: 120, height: 10 }} />
              {variant === 'attendance' ? (
                <View style={{ gap: 12 }}>
                  <Block pulse={pulse} style={{ width: '55%', height: 34 }} />
                  <Block pulse={pulse} style={{ width: '100%', height: 8 }} />
                  <Block pulse={pulse} style={{ width: '65%', height: 12 }} />
                </View>
              ) : <View style={{ flexDirection: 'row', gap: 16 }}>
                {[0, 1, 2].map(key => (
                  <View key={key} style={{ flex: 1, gap: 8 }}>
                    <Block pulse={pulse} style={{ width: '60%', height: 24 }} />
                    <Block pulse={pulse} style={{ width: '85%', height: 10 }} />
                  </View>
                ))}
              </View>}
            </View>
          </View>
        )}
        {variant === 'gate' ? (
          <View style={{ gap: 18 }}>
            <View style={styles.gateWelcome}>
              <View style={{ flex: 1, gap: 8 }}>
                <Block pulse={pulse} style={{ width: 120, height: 10 }} />
                <Block pulse={pulse} style={{ width: '70%', height: 26 }} />
                <Block pulse={pulse} style={{ width: '58%', height: 12 }} />
              </View>
              <Block pulse={pulse} style={styles.gateCharacter} />
            </View>
            <View style={[styles.card, { padding: 18, gap: 14 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Block pulse={pulse} style={{ width: 52, height: 52, borderRadius: 26 }} />
                <View style={{ gap: 8 }}>
                  <Block pulse={pulse} style={{ width: 96, height: 9 }} />
                  <Block pulse={pulse} style={{ width: 110, height: 22, borderRadius: 11 }} />
                </View>
              </View>
              <Block pulse={pulse} style={{ width: '72%', height: 18 }} />
              <Block pulse={pulse} style={{ width: '92%', height: 11 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Block pulse={pulse} style={{ width: 110, height: 11 }} />
                <Block pulse={pulse} style={{ width: 34, height: 11 }} />
              </View>
              <Block pulse={pulse} style={{ width: '100%', height: 8, borderRadius: 4 }} />
              <Block pulse={pulse} style={{ width: '100%', height: 46, borderRadius: RADIUS.lg }} />
            </View>
            <View style={{ gap: 6 }}>
              <Block pulse={pulse} style={{ width: 170, height: 16 }} />
              <Block pulse={pulse} style={{ width: 200, height: 10 }} />
            </View>
            <View style={styles.gateGrid}>
              {[0, 1, 2, 3].map(key => (
                <View key={key} style={[styles.card, styles.gateTile]}>
                  <Block pulse={pulse} style={{ width: 34, height: 34, borderRadius: 17 }} />
                  <Block pulse={pulse} style={{ width: '70%', height: 12 }} />
                  <Block pulse={pulse} style={{ width: '90%', height: 10 }} />
                  <Block pulse={pulse} style={{ width: 70, height: 20, borderRadius: 10 }} />
                </View>
              ))}
            </View>
          </View>
        ) : variant === 'progress' ? (
          <View style={{ gap: 16 }}>
            <View style={[styles.card, { gap: 20, padding: 20 }]}>
              <Block pulse={pulse} style={{ width: 130, height: 12 }} />
              <View style={{ flexDirection: 'row', backgroundColor: COLORS.background, borderRadius: 14, paddingVertical: 20 }}>
                {[0, 1, 2].map(key => (
                  <View key={key} style={{ flex: 1, alignItems: 'center', gap: 10 }}>
                    <Block pulse={pulse} style={{ width: '65%', height: 28 }} />
                    <Block pulse={pulse} style={{ width: '65%', height: 11 }} />
                  </View>
                ))}
              </View>
              <Block pulse={pulse} style={{ width: '100%', height: 9 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Block pulse={pulse} style={{ width: 100, height: 12 }} />
                <Block pulse={pulse} style={{ width: 90, height: 12 }} />
              </View>
            </View>
            <View style={[styles.card, { gap: 14, padding: 20 }]}>
              <Block pulse={pulse} style={{ width: '70%', height: 18 }} />
              <Block pulse={pulse} style={{ width: '95%', height: 12 }} />
              <Block pulse={pulse} style={{ width: '75%', height: 12 }} />
            </View>
            <View style={[styles.card, { padding: 20 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                <Block pulse={pulse} style={{ flex: 1, height: 17 }} />
                <Block pulse={pulse} style={{ width: 70, height: 23, borderRadius: 12 }} />
              </View>
              {[0, 1, 2, 3, 4, 5].map(key => (
                <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight }}>
                  <Block pulse={pulse} style={{ width: '48%', height: 12 }} />
                  <Block pulse={pulse} style={{ width: 64, height: 12 }} />
                </View>
              ))}
            </View>
          </View>
        ) : variant === 'dashboard' ? (
          <ApprovedHomeSkel pulse={pulse} />
        ) : variant === 'requirements' ? (
          <RequirementsSkel pulse={pulse} />
        ) : variant === 'logbook' ? (
          <View style={{ gap: 16 }}>
            <HoursCardSkel pulse={pulse} />
            <View style={[styles.card, { gap: 12 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Block pulse={pulse} style={{ width: 130, height: 16 }} />
                <Block pulse={pulse} style={{ width: 70, height: 16 }} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {Array.from({ length: 35 }).map((_, k) => <Block key={k} pulse={pulse} style={{ width: '12%', aspectRatio: 1, borderRadius: 10 }} />)}
              </View>
            </View>
            <View style={[styles.card, { gap: 10 }]}>
              <Block pulse={pulse} style={{ width: '50%', height: 14 }} />
              <Block pulse={pulse} style={{ width: '100%', height: 46, borderRadius: 12 }} />
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
          </View>
          <View style={styles.dashboardBottomBar}>
            {[0, 1].map(key => <View key={key} style={styles.dashboardTabPlaceholder}><Block pulse={pulse} style={styles.dashboardTabIcon} /></View>)}
            <View style={styles.dashboardCenterSlot}><Block pulse={pulse} style={styles.dashboardCenterButton} /></View>
            {[2, 3].map(key => <View key={key} style={styles.dashboardTabPlaceholder}><Block pulse={pulse} style={styles.dashboardTabIcon} /></View>)}
          </View>
        </View>
      ) : null}
    </View>

  );
}

const styles = StyleSheet.create({
  welcomeCardSkel: { height: 148, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, borderRadius: 22, backgroundColor: '#EDF5FF', overflow: 'hidden' },
  welcomeGuideSkel: { position: 'absolute', right: 14, bottom: 0, width: 112, height: 124, borderTopLeftRadius: 56, borderTopRightRadius: 56, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  navSkel: { position: 'absolute', zIndex: 10, elevation: 6, left: 16, right: 16, bottom: 18, height: 68, borderRadius: 26, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: '#E7EEF8', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  brandHeader: { justifyContent: 'space-between', minHeight: 70, paddingVertical: 12 },
  brandSideButton: { width: 42, height: 42, borderRadius: 14 },
  brandMark: { width: 38, height: 38, borderRadius: 19 },
  gateWelcome: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 120 },
  gateCharacter: { width: 110, height: 120, borderRadius: 55 },
  gateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gateTile: { flexBasis: '47%', flexGrow: 1, padding: 14, gap: 10, minHeight: 140 },
  dashboardCenterSlot: { flex: 1, alignItems: 'center' },
  dashboardCenterButton: { width: 62, height: 62, borderRadius: RADIUS.full, marginTop: -30, backgroundColor: COLORS.primaryLight, borderWidth: 4, borderColor: COLORS.background },
  inboxControls: { backgroundColor: COLORS.surface, paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  inboxTabs: { flexDirection: 'row', gap: 8, padding: 4, borderRadius: 16, backgroundColor: COLORS.surfaceMuted },
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
  dashboardBottomBar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 10, paddingBottom: 12, marginHorizontal: 14, marginBottom: 10, borderRadius: 28, borderWidth: 1, borderColor: COLORS.borderLight, backgroundColor: COLORS.surface },
  dashboardTabPlaceholder: { flex: 1, alignItems: 'center', gap: 4 },
  dashboardTabIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: COLORS.secondaryLight },
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
