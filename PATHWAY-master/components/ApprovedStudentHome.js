import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import HomeSurface from './StudentSurface';
import TickProgress from './TickProgress';
import { AppText as Text } from './AppText';
import ScrollView from './RefreshableScrollView';
import { MotionTouchableOpacity, ScreenEntrance } from './Motion';
import { BuildingIcon, CalendarIcon, CheckCircleIcon, ChevronRightIcon, ClockIcon, LogbookIcon, ProgressIcon } from './Icons';
import usePlacementEligibility from '../services/usePlacementEligibility';
import { COLORS } from '../theme';

const guide = require('../assets/pathway-guide-poses.png');
const waving = require('../assets/pathway-guide-waving.png');

export default function ApprovedStudentHome({ student, metrics, recent, width, go }) {
  const placement = usePlacementEligibility();
  const progress = Number.isFinite(metrics.progress) ? Math.max(0, Math.min(metrics.progress, 1)) : 0;
  const percent = Math.round(progress * 100);
  const compact = width < 370;
  const initials = ((student?.firstName?.[0] || '') + (student?.lastName?.[0] || '')).toUpperCase() || 'ST';
  const guideSize = compact ? 100 : 120;

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.page} contentContainerStyle={styles.scroll}>
      <HomeSurface tone="page" />
      <View style={styles.body}>
        <ScreenEntrance style={[styles.welcome, compact && styles.welcomeCompact]}>
          <HomeSurface tone="welcome" waves />
          <View style={[styles.welcomeCopy, { paddingRight: compact ? 104 : 122 }]}>
            <Text variant="heading" numberOfLines={1} style={[styles.greeting, compact && styles.greetingCompact]}>Welcome,</Text>
            <Text variant="heading" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.greeting, compact && styles.greetingCompact]}>{student?.firstName || 'Student'}</Text>
            <Text numberOfLines={1} style={styles.department}>{student?.department || student?.course || 'OJT Student'}</Text>
          </View>
          {/* Home uses the PATHWAY guide; the student's own photo stays on the Profile screen. */}
          <Image source={waving} style={[styles.wavingGuide, compact && styles.wavingGuideCompact]} resizeMode="contain" accessible={false} />
        </ScreenEntrance>

        <ScreenEntrance style={[styles.card, styles.hero]}>
          <HomeSurface waves />
          <View style={styles.heroTop}>
            <View style={styles.labelRow}><View style={[styles.blueIcon, styles.heroIcon]}><ClockIcon size={18} color={COLORS.primary} /></View><Text style={styles.blueLabel}>TOTAL OJT HOURS</Text></View>
          </View>
          <View style={styles.hoursRow}>
            <Text variant="heading" style={styles.hours} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{metrics.rendered.toFixed(1)}<Text style={styles.hoursTotal}>  /  {metrics.required} hrs</Text></Text>
            <View style={styles.percentPill}><Text style={styles.percentPillText}>{percent}%</Text></View>
          </View>
          <View style={styles.tickWrap}>
            <TickProgress height={22} progress={progress} percent={percent} accessibilityLabel="OJT hours completed" />
          </View>
          <View style={styles.heroBottomRow}>
            <Text style={styles.remaining}>{metrics.remaining.toFixed(1)} hours to go</Text>
            <MotionTouchableOpacity onPress={() => go('Progress')} accessibilityRole="button" accessibilityLabel="View OJT progress" style={styles.heroInlineAction}>
              <Text style={styles.heroActionLabel}>View progress</Text>
              <ChevronRightIcon size={18} color={COLORS.primary} />
            </MotionTouchableOpacity>
          </View>
        </ScreenEntrance>

        <ScreenEntrance style={styles.stats}>
          <MotionTouchableOpacity onPress={() => go('LogToday')} accessibilityRole="button" accessibilityLabel={`${metrics.verifiedShifts} of ${metrics.totalShifts} shifts verified${metrics.attendancePercent === null ? '' : `, ${metrics.attendancePercent}%`}. View attendance.`} style={[styles.card, styles.stat, styles.verified]}>
            <HomeSurface tone="mint" />
            <View style={styles.statLayout}>
              <View style={[styles.statIcon, styles.verifiedIcon]}><CheckCircleIcon size={21} color="#079D6D" /></View>
              <View style={styles.statCopy}><Text style={styles.statLabel}>VERIFIED SHIFTS</Text><Text variant="heading" style={styles.statValue}>{metrics.attendancePercent === null ? '—' : `${metrics.attendancePercent}%`}</Text><Text style={styles.statHint}>{metrics.verifiedShifts} of {metrics.totalShifts} verified</Text></View>
            </View>
            <View pointerEvents="none" style={[styles.statArrow, styles.verifiedArrow]}><ChevronRightIcon size={15} color="#079D6D" /></View>
            <View pointerEvents="none" accessible={false} style={styles.statDecoration}><ProgressIcon size={35} color="#609E93" /></View>
          </MotionTouchableOpacity>
          <MotionTouchableOpacity onPress={() => go('Logbook')} accessibilityRole="button" accessibilityLabel={`${metrics.pendingLogs} pending logbook entries awaiting coordinator review. View logbook.`} style={[styles.card, styles.stat, styles.pending]}>
            <HomeSurface tone="peach" />
            <View style={styles.statLayout}>
              <View style={[styles.statIcon, styles.pendingIcon]}><ClockIcon size={21} color="#EF850A" /></View>
              <View style={styles.statCopy}><Text style={styles.statLabel}>PENDING LOGS</Text><Text variant="heading" style={styles.statValue}>{metrics.pendingLogs}</Text><Text style={styles.statHint}>awaiting coordinator</Text></View>
            </View>
            <View pointerEvents="none" style={[styles.statArrow, styles.pendingArrow]}><ChevronRightIcon size={15} color="#D87808" /></View>
            <View pointerEvents="none" accessible={false} style={styles.statDecoration}><LogbookIcon size={35} color="#D2A274" /></View>
          </MotionTouchableOpacity>
        </ScreenEntrance>

        <View style={styles.sectionTitle}><Text style={styles.sectionHeading}>Official placement</Text><BuildingIcon size={19} color={COLORS.primary} /></View>
        <View style={[styles.card, styles.placement]}>
          <View style={styles.blueIcon}><BuildingIcon size={23} color={COLORS.primary} /></View>
          <View style={styles.placementCopy}>
            <Text style={styles.company}>{placement.companyName || 'Company not assigned yet'}</Text>
            <Text style={styles.detail}>{placement.assigned ? (student?.supervisorName ? `Supervisor · ${student.supervisorName}` : 'Approved placement.') : 'No approved placement.'}</Text>
          </View>
          <View style={[styles.status, { backgroundColor: placement.assigned ? COLORS.successLight : COLORS.warningLight }]}>
            <Text style={[styles.statusText, { color: placement.assigned ? COLORS.successDark : COLORS.warningDark }]}>{placement.assigned ? 'Confirmed' : 'Pending'}</Text>
          </View>
        </View>

        <ScreenEntrance>
          <MotionTouchableOpacity onPress={() => go('WorkplaceSupport')} accessibilityRole="button" accessibilityLabel="Get workplace support. Send a private concern to your coordinator." style={[styles.card, styles.support]}>
            <HomeSurface waves />
            {/* The first pose is wider than a third of the sheet; retain its speech bubble. */}
            <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: guideSize * 1.08, height: guideSize, overflow: 'hidden', alignSelf: 'flex-end' }}>
              {/* Remove the sprite's transparent bottom margin so the torso meets the card edge. */}
              <Image source={guide} accessible={false} style={{ width: guideSize * 3, height: guideSize, transform: [{ translateY: guideSize * 34 / 724 }] }} resizeMode="stretch" />
            </View>
            <View style={styles.supportCopy}><Text style={styles.supportTitle}>Get workplace support</Text><Text style={styles.supportDetail}>Send a private concern to your coordinator.</Text></View>
            <View pointerEvents="none" accessible={false} style={styles.supportArrow}><ChevronRightIcon size={25} color={COLORS.primary} /></View>
          </MotionTouchableOpacity>
        </ScreenEntrance>

        <View style={styles.activityHeading}>
          <View style={styles.sectionTitle}><Text style={styles.sectionHeading}>Recent activity</Text><CalendarIcon size={18} color={COLORS.primary} /></View>
          <MotionTouchableOpacity onPress={() => go('ActivityHistory')} accessibilityRole="button" style={styles.link}><Text style={styles.linkText}>View all</Text><ChevronRightIcon size={16} color={COLORS.primary} /></MotionTouchableOpacity>
        </View>
        <View style={styles.activityList}>
          {recent.length ? recent.map(item => (
            <View key={item.id} style={[styles.card, styles.activity]}>
              <View style={[styles.activityIcon, { backgroundColor: `${item.color}12` }]}><item.Icon size={20} color={item.color} /></View>
              <View style={styles.activityCopy}><Text style={styles.activityText}>{item.text}</Text><Text style={styles.activityDate}>{item.date}</Text></View>
            </View>
          )) : <View style={[styles.card, styles.activity]}><LogbookIcon size={24} color={COLORS.primary} /><View style={styles.activityCopy}><Text style={styles.activityText}>No recent activity</Text><Text style={styles.activityDate}>Your attendance, journals and updates will appear here.</Text></View></View>}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#F9FBFF' },
  surfaceArtwork: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  scroll: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 88 },
  body: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 18 },
  // Fixed height: two-line greeting (Welcome, / first name) + department; never grows with the name.
  welcome: { flexDirection: 'row', alignItems: 'center', height: 148, paddingHorizontal: 18, borderRadius: 22, backgroundColor: '#EDF5FF', overflow: 'hidden' },
  welcomeCompact: { height: 132 },
  welcomeCopy: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.4, color: COLORS.textMuted },
  greeting: { fontSize: 27, lineHeight: 34, fontWeight: '700', color: '#0A1631', letterSpacing: -0.4, flexShrink: 1 },
  greetingCompact: { fontSize: 24, lineHeight: 31 },
  department: { fontSize: 14, lineHeight: 21, color: COLORS.textMuted },
  wavingGuide: { width: 132, height: 132, position: 'absolute', right: 6, bottom: -4 },
  wavingGuideCompact: { width: 114, height: 114 },
  avatar: { width: 66, height: 66, flexShrink: 0, borderRadius: 33, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  initials: { fontSize: 20, fontWeight: '700', color: COLORS.primary },
  card: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: '#E9EEF7', borderRadius: 22, shadowColor: '#56729E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 2 },
  hero: { padding: 14, overflow: 'hidden' },
  heroIcon: { width: 32, height: 32, borderRadius: 10 },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  blueIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#EDF5FF', alignItems: 'center', justifyContent: 'center' },
  blueLabel: { fontSize: 11, fontWeight: '600', color: COLORS.primary, letterSpacing: 0.7 },
  percentBadge: { backgroundColor: '#EDF5FF', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  percent: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  hours: { flexShrink: 1, fontSize: 34, lineHeight: 38, fontWeight: '700', color: '#0A1631' },
  hoursTotal: { fontSize: 17, color: '#465066', fontWeight: '500' },
  hoursRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  percentPill: { backgroundColor: '#EEF2F8', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  percentPillText: { fontSize: 15, fontWeight: '700', color: '#0A1631' },
  tickWrap: { marginTop: 8, marginBottom: 0 },
  track: { height: 8, borderRadius: 6, backgroundColor: '#E7EDF7', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 8, backgroundColor: '#0874E8' },
  heroFooter: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: -7, transform: [{ translateY: 6 }] },
  heroBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  heroInlineAction: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  heroProgressCopy: { flex: 1, minWidth: 0, gap: 9 },
  heroAction: { alignItems: 'center', gap: 4, minHeight: 44, paddingVertical: 2 },
  heroActionLabel: { fontSize: 11, fontWeight: '600', color: COLORS.primary },
  heroActionCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FBFF', shadowColor: '#6A88B7', shadowOffset: { width: 0, height: 3 }, shadowRadius: 6, shadowOpacity: 0.12, elevation: 2 },
  remaining: { fontSize: 13, color: COLORS.textSecondary },
  link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  linkText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, minWidth: 0, padding: 12, overflow: 'hidden', borderRadius: 18 },
  verified: { backgroundColor: '#F0FBF6', borderColor: '#E2F4EA' },
  pending: { backgroundColor: '#FFF7EE', borderColor: '#FAEDDE' },
  statLayout: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  verifiedIcon: { backgroundColor: '#D5F6E6' },
  pendingIcon: { backgroundColor: '#FFE6CE' },
  statCopy: { flex: 1, minWidth: 0, gap: 1 },
  statArrow: { position: 'absolute', right: 8, top: 10, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  verifiedArrow: { backgroundColor: '#E2F9ED' },
  pendingArrow: { backgroundColor: '#FFEBD8' },
  statDecoration: { position: 'absolute', right: 6, bottom: 4, opacity: 0.14 },
  statLabel: { fontSize: 8, lineHeight: 12, fontWeight: '500', color: COLORS.textSecondary, letterSpacing: 0.2, paddingRight: 10 },
  statValue: { fontSize: 25, lineHeight: 31, fontWeight: '700', color: '#0A1631' },
  statHint: { fontSize: 10, lineHeight: 14, color: COLORS.textSecondary },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 7 },
  sectionHeading: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: '#0A1631', flexShrink: 1 },
  placement: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', padding: 15, gap: 10, marginTop: -8 },
  placementCopy: { flex: 1, minWidth: 130, gap: 5 },
  company: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: COLORS.textPrimary },
  detail: { fontSize: 12, lineHeight: 18, color: COLORS.textMuted },
  status: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '600' },
  support: { backgroundColor: '#F0F6FF', flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'hidden', paddingRight: 14, paddingTop: 10 },
  supportCopy: { flex: 1, minWidth: 0, gap: 7, paddingVertical: 16 },
  supportArrow: { width: 44, height: 44, flexShrink: 0, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FBFF', shadowColor: '#6A88B7', shadowOffset: { width: 0, height: 3 }, shadowRadius: 7, shadowOpacity: 0.14, elevation: 2 },
  supportTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: COLORS.primary },
  supportDetail: { fontSize: 12, lineHeight: 18, color: COLORS.textSecondary },
  activityHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 5, marginBottom: -10 },
  activityList: { gap: 9 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18 },
  activityIcon: { width: 39, height: 39, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  activityCopy: { flex: 1, minWidth: 0, gap: 4 },
  activityText: { color: COLORS.textPrimary, fontSize: 13, lineHeight: 19 },
  activityDate: { color: COLORS.textMuted, fontSize: 11, lineHeight: 17 },
});
