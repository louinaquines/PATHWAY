import React, { useRef, useState } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SHADOWS, SPACE, TYPE } from '../theme';
import { MotionTouchableOpacity, useReducedMotion } from '../components/Motion';
import { ArrowRightIcon, BellIcon, CalendarIcon, ChatBubbleIcon, CheckCircleIcon, ClockIcon, FileIcon } from '../components/Icons';
import { markOnboardingCompleted } from '../services/onboardingStorage';
import { AppText as Text } from '../components/AppText';
import PathwayWatermark from '../components/PathwayWatermark';
import PathwayMark from '../components/PathwayMark';

const PAGES = [
  {
    eyebrow: 'YOUR OJT, IN ONE PLACE',
    title: 'Know where your OJT stands.',
    description: 'See your placement, requirements, attendance, and rendered hours together—so your next step is always clear.',
    accent: COLORS.brandSky,
    preview: 'progress',
  },
  {
    eyebrow: 'BUILD A RELIABLE RECORD',
    title: 'Make every workday count.',
    description: 'Record attendance and write logbook entries while the details are fresh. Follow each submission as it moves through review.',
    accent: COLORS.brandGold,
    preview: 'attendance',
  },
  {
    eyebrow: 'STAY IN THE LOOP',
    title: 'Keep updates close.',
    description: 'Review coordinator messages and important notifications, then track your progress toward OJT completion and clearance.',
    accent: COLORS.brandSky,
    preview: 'updates',
  },
];

const nativeDriver = Platform.OS !== 'web';

export default function OnboardingScreen({ navigation }) {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [pageIndex, setPageIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const contentProgress = useRef(new Animated.Value(1)).current;
  const currentPage = PAGES[pageIndex];
  const compact = height < 720;
  const wide = width >= 780;

  const goToPage = nextIndex => {
    const boundedIndex = Math.max(0, Math.min(PAGES.length - 1, nextIndex));
    if (boundedIndex === pageIndex) return;
    if (reducedMotion) {
      setPageIndex(boundedIndex);
      return;
    }
    Animated.timing(contentProgress, { toValue: 0, duration: 120, useNativeDriver: nativeDriver }).start(({ finished }) => {
      if (!finished) return;
      setPageIndex(boundedIndex);
      contentProgress.setValue(0);
      Animated.spring(contentProgress, { toValue: 1, speed: 18, bounciness: 2, useNativeDriver: nativeDriver }).start();
    });
  };

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await markOnboardingCompleted();
    } catch (error) {
      // First-run guidance should never block access to sign in.
      console.warn('Could not save onboarding completion state.', error);
    }
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const translateY = contentProgress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { minHeight: Math.max(560, height - insets.top - insets.bottom), paddingHorizontal: width < 380 ? 20 : 32 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.header}>
          <PathwayWatermark size={160} opacity={0.035} style={{ right: -54, top: -61 }} />
          <View style={styles.wordmark}>
            <PathwayMark size={32} decorative />
            <Text style={styles.brandName}>PATHWAY</Text>
          </View>
          <MotionTouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Skip introduction"
            onPress={finish}
            disabled={finishing}
            style={styles.skipButton}
          >
            <Text style={styles.skipText}>Skip</Text>
          </MotionTouchableOpacity>
        </View>

        <View style={styles.progressTrack} accessibilityLabel={`Introduction page ${pageIndex + 1} of ${PAGES.length}`}>
          {PAGES.map((page, index) => (
            <View key={page.eyebrow} style={[styles.progressSegment, index <= pageIndex && styles.progressSegmentActive]} />
          ))}
        </View>

        <View style={[styles.main, wide && styles.mainWide, compact && styles.mainCompact]}>
          <View accessible accessibilityLabel={currentPage.title} style={[styles.previewStage, wide && styles.previewStageWide, compact && styles.previewStageCompact]}>
            <PreviewScene kind={currentPage.preview} accent={currentPage.accent} />
          </View>

          <Animated.View style={[styles.copy, wide && styles.copyWide, { opacity: contentProgress, transform: [{ translateY }] }]}>
            <Text style={[styles.eyebrow, wide && styles.eyebrowWide]}>{currentPage.eyebrow}</Text>
            <Text variant="heading" style={[styles.title, wide && styles.titleWide, compact && styles.titleCompact]}>{currentPage.title}</Text>
            <Text style={[styles.description, wide && styles.descriptionWide]}>{currentPage.description}</Text>
          </Animated.View>
        </View>

        <View style={styles.footer}>
          <View style={styles.actions}>
            {pageIndex > 0 ? (
              <MotionTouchableOpacity accessibilityRole="button" onPress={() => goToPage(pageIndex - 1)} style={styles.backButton}>
                <Text style={styles.backText}>Back</Text>
              </MotionTouchableOpacity>
            ) : <View style={styles.backSpacer} />}
            <MotionTouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={pageIndex === PAGES.length - 1 ? 'Get started' : 'Continue'}
              onPress={pageIndex === PAGES.length - 1 ? finish : () => goToPage(pageIndex + 1)}
              disabled={finishing}
              style={[styles.nextButton, finishing && styles.buttonDisabled]}
            >
              <Text style={styles.nextText}>{pageIndex === PAGES.length - 1 ? 'Get started' : 'Continue'}</Text>
              {pageIndex < PAGES.length - 1 && <ArrowRightIcon size={18} color="#FFFFFF" />}
            </MotionTouchableOpacity>
          </View>
          <Text style={styles.footerNote}>Your OJT work, kept in one clear place.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PreviewScene({ kind, accent }) {
  if (kind === 'progress') {
    return (
      <View style={styles.previewCanvas}>
        <View style={styles.previewTopline}><View style={[styles.previewGlyph, { backgroundColor: COLORS.secondaryLight }]}><ClockIcon size={17} color={COLORS.primary} /></View><Text style={styles.previewKicker}>OJT HOURS</Text><View style={styles.previewMenu}><View style={styles.previewMenuDot} /><View style={styles.previewMenuDot} /><View style={styles.previewMenuDot} /></View></View>
        <Text style={styles.previewHeading}>Your hours, at a glance</Text>
        <View style={styles.previewValueRow}><View><View style={styles.previewValueLong} /><View style={styles.previewValueShort} /></View><Text style={styles.previewPercent}>PROGRESS</Text></View>
        <View style={styles.previewTrack}><View style={[styles.previewFill, { width: '63%', backgroundColor: accent }]} /></View>
        <View style={styles.previewFoot}><Text style={styles.previewFootLabel}>Rendered</Text><Text style={styles.previewFootLabel}>Remaining</Text></View>
        <View style={styles.previewLink}><Text style={styles.previewLinkText}>View progress</Text><Text style={styles.previewArrow}>›</Text></View>
      </View>
    );
  }
  if (kind === 'attendance') {
    return (
      <View style={[styles.previewCanvas, styles.previewCalendarCanvas]}>
        <View style={styles.previewTopline}><View style={[styles.previewGlyph, { backgroundColor: COLORS.accentLight }]}><CalendarIcon size={17} color={COLORS.accentDark} /></View><Text style={styles.previewKicker}>ATTENDANCE</Text></View>
        <Text style={styles.previewHeading}>A clear record of each day</Text>
        <View style={styles.previewWeek}>
          {['M', 'T', 'W', 'T', 'F'].map((day, index) => <View key={`${day}${index}`} style={styles.previewDay}><Text style={styles.previewDayLabel}>{day}</Text><View style={[styles.previewDayCircle, index === 2 && styles.previewDayCircleActive]}><Text style={[styles.previewDayNumber, index === 2 && styles.previewDayNumberActive]}>{12 + index}</Text></View>{index !== 4 && <View style={styles.previewDayDot} />}</View>)}
        </View>
        <View style={styles.previewShift}><View style={[styles.previewGlyph, { backgroundColor: COLORS.successLight }]}><CheckCircleIcon size={16} color={COLORS.successDark} /></View><View style={styles.previewShiftCopy}><Text style={styles.previewShiftTitle}>Daily shift</Text><Text style={styles.previewShiftSub}>Time and status together</Text></View><FileIcon size={16} color={COLORS.textMuted} /></View>
      </View>
    );
  }
  return (
    <View style={[styles.previewCanvas, styles.previewInboxCanvas]}>
      <View style={styles.previewTopline}><View style={[styles.previewGlyph, { backgroundColor: COLORS.secondaryLight }]}><BellIcon size={17} color={COLORS.primary} /></View><Text style={styles.previewKicker}>UPDATES</Text></View>
      <Text style={styles.previewHeading}>Know when something needs you</Text>
      <View style={styles.previewMessageRow}><View style={[styles.previewAvatar, { backgroundColor: COLORS.primaryDark }]}><Text style={styles.previewAvatarText}>C</Text></View><View style={styles.previewMessageCopy}><View style={styles.previewMessageTitleRow}><Text style={styles.previewMessageTitle}>Coordinator</Text><View style={styles.previewUnread} /></View><Text style={styles.previewMessageSub}>A placement update is ready to review.</Text><Text style={styles.previewTimestamp}>A MOMENT AGO</Text></View></View>
      <View style={styles.previewMessageDivider} />
      <View style={styles.previewMessageRow}><View style={[styles.previewAvatar, { backgroundColor: COLORS.accentLight }]}><FileIcon size={16} color={COLORS.accentDark} /></View><View style={styles.previewMessageCopy}><Text style={styles.previewMessageTitle}>Logbook status</Text><Text style={styles.previewMessageSub}>Your submissions stay easy to find.</Text></View></View>
      <View style={styles.previewReply}><ChatBubbleIcon size={15} color={COLORS.primary} /><Text style={styles.previewReplyText}>Open messages</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { flexGrow: 1, width: '100%', maxWidth: 980, alignSelf: 'center', paddingBottom: SPACE.md },
  header: { position: 'relative', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: SPACE.md, paddingBottom: SPACE.lg },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  brandName: { color: COLORS.primaryDark, fontWeight: '800', fontSize: 14, letterSpacing: 2.2 },
  skipButton: { minHeight: 44, minWidth: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: RADIUS.full },
  skipText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 },
  progressTrack: { flexDirection: 'row', gap: 7, maxWidth: 460 },
  progressSegment: { height: 3, flex: 1, borderRadius: 3, backgroundColor: COLORS.border },
  progressSegmentActive: { backgroundColor: COLORS.primary },
  main: { flex: 1, justifyContent: 'center', paddingVertical: SPACE.md },
  mainWide: { flexDirection: 'row', alignItems: 'center', gap: 58, paddingVertical: SPACE.xl },
  mainCompact: { paddingVertical: SPACE.xs },
  previewStage: { minHeight: 218, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.lg },
  previewStageWide: { width: 390, minHeight: 310, marginBottom: 0 },
  previewStageCompact: { minHeight: 184, marginBottom: SPACE.md },
  previewCanvas: { width: '100%', maxWidth: 420, minHeight: 214, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLight, padding: 20, ...SHADOWS.soft },
  previewCalendarCanvas: { backgroundColor: '#FFFEFB' },
  previewInboxCanvas: { minHeight: 248 },
  previewTopline: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: SPACE.md },
  previewGlyph: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  previewKicker: { flex: 1, color: COLORS.textMuted, fontSize: TYPE.micro, fontWeight: '800', letterSpacing: 1.1 },
  previewMenu: { flexDirection: 'row', gap: 3, padding: 8 },
  previewMenuDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: COLORS.textMuted },
  previewHeading: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700', letterSpacing: -0.2, marginBottom: 18 },
  previewValueRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 13 },
  previewValueLong: { width: 94, height: 20, borderRadius: 5, backgroundColor: COLORS.surfaceMuted },
  previewValueShort: { width: 62, height: 8, borderRadius: 4, backgroundColor: COLORS.borderLight, marginTop: 7 },
  previewPercent: { color: COLORS.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  previewTrack: { height: 8, backgroundColor: COLORS.surfaceMuted, borderRadius: RADIUS.full, overflow: 'hidden' },
  previewFill: { height: '100%', borderRadius: RADIUS.full },
  previewFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  previewFootLabel: { color: COLORS.textMuted, fontSize: 11 },
  previewLink: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.borderLight, marginTop: 17, paddingTop: 12 },
  previewLinkText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  previewArrow: { color: COLORS.primary, fontSize: 20, lineHeight: 20 },
  previewWeek: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 17 },
  previewDay: { alignItems: 'center', gap: 6 },
  previewDayLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600' },
  previewDayCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  previewDayCircleActive: { backgroundColor: COLORS.primary },
  previewDayNumber: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  previewDayNumberActive: { color: '#FFFFFF' },
  previewDayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.brandSky },
  previewShift: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: 13 },
  previewShiftCopy: { flex: 1, gap: 3 },
  previewShiftTitle: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '700' },
  previewShiftSub: { color: COLORS.textMuted, fontSize: 11 },
  previewMessageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  previewAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  previewAvatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  previewMessageCopy: { flex: 1, gap: 4 },
  previewMessageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  previewMessageTitle: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '700' },
  previewMessageSub: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16 },
  previewTimestamp: { color: COLORS.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  previewUnread: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.secondary },
  previewMessageDivider: { height: 1, backgroundColor: COLORS.borderLight, marginLeft: 46 },
  previewReply: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 12, marginTop: 6, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  previewReplyText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  copy: { alignItems: 'center', paddingHorizontal: 4 },
  copyWide: { flex: 1, alignItems: 'flex-start', maxWidth: 440 },
  eyebrow: { color: COLORS.secondaryDark, fontSize: TYPE.micro, fontWeight: '800', letterSpacing: 1.1, marginBottom: 12, textAlign: 'center' },
  eyebrowWide: { textAlign: 'left' },
  title: { maxWidth: 440, color: COLORS.textPrimary, fontSize: TYPE.display, lineHeight: 39, fontWeight: '800', textAlign: 'center', letterSpacing: -0.6 },
  titleWide: { textAlign: 'left', fontSize: 38, lineHeight: 45 },
  titleCompact: { fontSize: 28, lineHeight: 34 },
  description: { maxWidth: 430, color: COLORS.textSecondary, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 12 },
  descriptionWide: { textAlign: 'left' },
  footer: { paddingTop: SPACE.md, paddingBottom: SPACE.xs, maxWidth: 880, width: '100%', alignSelf: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 54, marginTop: SPACE.xs },
  backSpacer: { width: 72 },
  backButton: { minWidth: 72, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  backText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 15 },
  nextButton: { minHeight: 52, minWidth: 160, paddingHorizontal: 22, borderRadius: 14, backgroundColor: COLORS.primaryDark, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, ...SHADOWS.soft },
  nextText: { color: COLORS.textOnPrimary, fontSize: 15, fontWeight: '800' },
  buttonDisabled: { opacity: 0.65 },
  footerNote: { color: COLORS.textMuted, fontSize: TYPE.caption, textAlign: 'center', marginTop: SPACE.md },
});
