import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
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
import OnboardingLoading from '../components/OnboardingLoading';
import { AppText as Text } from '../components/AppText';
import PathwayMark from '../components/PathwayMark';
import StudentSurface from '../components/StudentSurface';

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
  const [sceneWidth, setSceneWidth] = useState(Math.min(390, width - 64));
  const measureScene = event => setSceneWidth(event.nativeEvent.layout.width);
  const guideDimensions = (fraction, ratio) => {
    const imageWidth = Math.min(sceneWidth * fraction, (compact ? 250 : 330) * ratio);
    return { width: imageWidth, height: imageWidth / ratio };
  };

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

  useEffect(() => {
    // Fetch the next screens' illustrations before their short loading transition.
    for (const source of [require('../assets/pathway-guide-headphones.png'), require('../assets/pathway-guide-thumbsup-plain-laptop.png')]) {
      const uri = Image.resolveAssetSource?.(source)?.uri;
      if (uri) Image.prefetch(uri).catch(() => {});
    }
  }, []);

  const finish = () => {
    if (finishing) return;
    setFinishing(true);
  };

  const translateY = contentProgress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  if (finishing) return <OnboardingLoading navigation={navigation} />;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <StudentSurface tone="page" />
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { minHeight: Math.max(560, height - insets.top - insets.bottom), paddingHorizontal: width < 380 ? 20 : 32 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.header}>
          <View style={styles.wordmark}>
            <PathwayMark size={38} decorative />
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
            {pageIndex === 0 ? <View onLayout={measureScene} style={[styles.firstScene, compact && styles.firstSceneCompact]}>
              <View style={styles.sceneMountains}><StudentSurface tone="welcome" waves /></View>
              <View pointerEvents="none" accessible={false} style={styles.firstDecorations}>
                <View style={[styles.accentRay, { backgroundColor: '#FFBE18', right: -8, bottom: 47, height: 18, transform: [{ rotate: '38deg' }] }]} />
                <View style={[styles.accentRay, { backgroundColor: '#FFD34A', right: 6, bottom: 34, height: 11, transform: [{ rotate: '72deg' }] }]} />
                <View style={[styles.accentRay, { backgroundColor: '#1685FF', right: 72, top: 8, height: 17, width: 4 }]} />
                <View style={[styles.accentRay, { backgroundColor: '#1685FF', right: 66, top: 14, height: 4, width: 16 }]} />
                <View style={[styles.accentDot, { backgroundColor: '#FFCB30', left: '49%', top: 0, width: 7, height: 7 }]} />
                <View style={[styles.accentDot, { left: -10, bottom: 12, width: 11, height: 11, borderWidth: 2, borderColor: '#56B4FF', backgroundColor: 'transparent' }]} />
              </View>
              <Image source={require('../assets/pathway-onboarding-welcome.png')} style={[styles.welcomeGuide, guideDimensions(0.72, 1145 / 1374)]} resizeMode="contain" accessible={false} />
              <View style={styles.firstPreview}><PreviewScene kind={currentPage.preview} accent={currentPage.accent} /></View>
            </View> : pageIndex === 1 ? <View onLayout={measureScene} style={[styles.firstScene, compact && styles.firstSceneCompact]}>
              <View style={styles.sceneMountains}><StudentSurface tone="welcome" waves /></View>
              <View pointerEvents="none" accessible={false} style={styles.firstDecorations}>
                <View style={[styles.accentRay, { backgroundColor: '#1685FF', right: -6, bottom: 32, height: 22, transform: [{ rotate: '-35deg' }] }]} />
                <View style={[styles.accentRay, { backgroundColor: '#46ACFF', right: 9, bottom: 21, height: 15, transform: [{ rotate: '-65deg' }] }]} />
                <View style={[styles.accentRay, { backgroundColor: '#FFBE18', right: 79, top: 10, height: 18, width: 4 }]} />
                <View style={[styles.accentRay, { backgroundColor: '#FFBE18', right: 73, top: 17, height: 4, width: 16 }]} />
                <View style={[styles.accentDot, { backgroundColor: '#62B8FF', left: '43%', top: 2, width: 6, height: 6 }]} />
                <View style={[styles.accentDot, { left: -10, bottom: 50, width: 11, height: 11, borderWidth: 2, borderColor: '#FFCA38', backgroundColor: 'transparent' }]} />
                <View style={[styles.accentDot, { right: 20, top: 24, width: 13, height: 13, borderWidth: 3, borderColor: '#349CFF', backgroundColor: 'transparent' }]} />
                <View style={[styles.accentRay, { backgroundColor: '#FFCA38', left: 18, top: 32, width: 5, height: 12, transform: [{ rotate: '-28deg' }] }]} />
                <View style={[styles.accentDot, { backgroundColor: '#1685FF', left: 4, top: 112, width: 5, height: 5 }]} />
                <View style={[styles.accentDot, { backgroundColor: '#FFD453', right: 49, bottom: 3, width: 8, height: 8 }]} />
                <View style={[styles.accentRay, { backgroundColor: '#62B8FF', left: '44%', bottom: 8, width: 4, height: 13, transform: [{ rotate: '35deg' }] }]} />
              </View>
              <Image source={require('../assets/pathway-onboarding-attendance.png')} style={[styles.attendanceGuide, guideDimensions(0.98, 1378 / 1141)]} resizeMode="contain" accessible={false} />
              <View style={styles.attendancePreview}><PreviewScene kind="attendance" accent={currentPage.accent} /></View>
            </View> : <View onLayout={measureScene} style={[styles.firstScene, compact && styles.firstSceneCompact]}>
              <View style={styles.sceneMountains}><StudentSurface tone="welcome" waves /></View>
              <View pointerEvents="none" accessible={false} style={styles.firstDecorations}>
                <View style={[styles.accentRay, { backgroundColor: '#FFBE18', left: '49%', top: 15, height: 28, transform: [{ rotate: '22deg' }] }]} />
                <View style={[styles.accentRay, { backgroundColor: '#FFD453', left: '54%', top: 30, height: 21, transform: [{ rotate: '58deg' }] }]} />
                <View style={[styles.accentDot, { right: 7, bottom: 18, width: 10, height: 10, borderWidth: 2, borderColor: '#349CFF', backgroundColor: 'transparent' }]} />
                <View style={[styles.accentDot, { backgroundColor: '#62B8FF', left: 12, top: 40, width: 6, height: 6 }]} />
                <View style={[styles.accentDot, { left: -12, top: 118, width: 12, height: 12, borderWidth: 2, borderColor: '#FFD044', backgroundColor: 'transparent' }]} />
                <View style={[styles.accentRay, { backgroundColor: '#1685FF', right: 2, top: 7, width: 5, height: 19, transform: [{ rotate: '32deg' }] }]} />
                <View style={[styles.accentRay, { backgroundColor: '#62B8FF', right: -8, top: 23, width: 5, height: 12, transform: [{ rotate: '65deg' }] }]} />
                <View style={[styles.accentRay, { backgroundColor: '#FFBE18', right: 39, bottom: 2, width: 4, height: 15 }]} />
                <View style={[styles.accentRay, { backgroundColor: '#FFBE18', right: 34, bottom: 7, width: 14, height: 4 }]} />
                <View style={[styles.accentDot, { backgroundColor: '#349CFF', left: '46%', bottom: 5, width: 6, height: 6 }]} />
              </View>
              <Image source={require('../assets/pathway-guide-writing.png')} style={[styles.updatesGuide, guideDimensions(0.8, 1293 / 1216)]} resizeMode="contain" accessible={false} />
              <View style={[styles.updatesPreview, compact && styles.updatesPreviewCompact]}><PreviewScene kind="updates" accent={currentPage.accent} /></View>
            </View>}
          </View>

          <Animated.View style={[styles.copy, wide && styles.copyWide, { opacity: contentProgress, transform: [{ translateY }] }]}>
            <Text style={[styles.eyebrow, wide && styles.eyebrowWide]}>{currentPage.eyebrow}</Text>
            <Text variant="heading" style={[styles.title, wide && styles.titleWide, compact && styles.titleCompact]}>{currentPage.title}</Text>
            <Text style={[styles.description, wide && styles.descriptionWide]}>{currentPage.description}</Text>
          </Animated.View>
        </View>

        <View style={styles.footer}>
          <View style={styles.pageDots} accessibilityLabel={`Page ${pageIndex + 1} of 3`}>{PAGES.map((page, index) => <View key={page.eyebrow} style={[styles.pageDot, index === pageIndex && styles.pageDotActive]} />)}</View>
          <View style={styles.actions}>
            {pageIndex > 0 ? (
              <MotionTouchableOpacity accessibilityRole="button" onPress={() => goToPage(pageIndex - 1)} style={styles.backButton}>
                <Text style={styles.backText}>Back</Text>
              </MotionTouchableOpacity>
            ) : null}
            <MotionTouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={pageIndex === PAGES.length - 1 ? 'Get started' : 'Continue'}
              onPress={pageIndex === PAGES.length - 1 ? finish : () => goToPage(pageIndex + 1)}
              disabled={finishing}
              style={[styles.nextButton, pageIndex === 0 && styles.firstNextButton, finishing && styles.buttonDisabled]}
            >
              <Text style={[styles.nextText, pageIndex === 0 && { flex: 1, textAlign: 'center' }]}>{pageIndex === PAGES.length - 1 ? 'Get started' : 'Continue'}</Text>
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
        <View style={styles.previewTopline}><View style={[styles.previewGlyph, { backgroundColor: COLORS.secondaryLight }]}><ClockIcon size={17} color={COLORS.primary} /></View><Text maxFontSizeMultiplier={1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.previewKicker}>OJT HOURS</Text><View style={styles.previewMenu}><View style={styles.previewMenuDot} /><View style={styles.previewMenuDot} /><View style={styles.previewMenuDot} /></View></View>
        <Text maxFontSizeMultiplier={1} style={styles.previewHeading}>Your hours, at a glance</Text>
        <View style={styles.previewValueRow}><View><View style={styles.previewValueLong} /><View style={styles.previewValueShort} /></View><Text maxFontSizeMultiplier={1} style={styles.previewPercent}>PROGRESS</Text></View>
        <View style={styles.previewTrack}><View style={[styles.previewFill, { width: '63%', backgroundColor: accent }]} /></View>
        <View style={styles.previewFoot}><Text maxFontSizeMultiplier={1} style={styles.previewFootLabel}>Rendered</Text><Text maxFontSizeMultiplier={1} style={styles.previewFootLabel}>Remaining</Text></View>
        <View style={styles.previewLink}><Text maxFontSizeMultiplier={1} style={styles.previewLinkText}>View progress</Text><Text maxFontSizeMultiplier={1} style={styles.previewArrow}>›</Text></View>
      </View>
    );
  }
  if (kind === 'attendance') {
    return (
      <View style={[styles.previewCanvas, styles.previewCalendarCanvas]}>
        <View style={styles.previewTopline}><View style={[styles.previewGlyph, { backgroundColor: COLORS.accentLight }]}><CalendarIcon size={17} color={COLORS.accentDark} /></View><Text maxFontSizeMultiplier={1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.previewKicker}>ATTENDANCE</Text></View>
        <Text maxFontSizeMultiplier={1} style={styles.previewHeading}>A clear record of each day</Text>
        <View style={styles.previewWeek}>
          {['M', 'T', 'W', 'T', 'F'].map((day, index) => <View key={`${day}${index}`} style={styles.previewDay}><Text maxFontSizeMultiplier={1} style={styles.previewDayLabel}>{day}</Text><View style={[styles.previewDayCircle, index === 2 && styles.previewDayCircleActive]}><Text maxFontSizeMultiplier={1} style={[styles.previewDayNumber, index === 2 && styles.previewDayNumberActive]}>{12 + index}</Text></View>{index !== 4 && <View style={styles.previewDayDot} />}</View>)}
        </View>
        <View style={styles.previewShift}><View style={[styles.previewGlyph, { backgroundColor: COLORS.successLight }]}><CheckCircleIcon size={16} color={COLORS.successDark} /></View><View style={styles.previewShiftCopy}><Text maxFontSizeMultiplier={1} style={styles.previewShiftTitle}>Daily shift</Text><Text maxFontSizeMultiplier={1} style={styles.previewShiftSub}>Time and status together</Text></View><FileIcon size={16} color={COLORS.textMuted} /></View>
      </View>
    );
  }
  return (
    <View style={[styles.previewCanvas, styles.previewInboxCanvas]}>
      <View style={[styles.previewTopline, styles.updatesTopline]}><View style={[styles.previewGlyph, { backgroundColor: COLORS.secondaryLight }]}><BellIcon size={17} color={COLORS.primary} /></View><Text maxFontSizeMultiplier={1} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.previewKicker}>UPDATES</Text></View>
      <Text maxFontSizeMultiplier={1} style={[styles.previewHeading, styles.updatesHeading]}>Know when something needs you</Text>
      <View style={styles.previewMessageRow}><View style={[styles.previewAvatar, { backgroundColor: COLORS.primaryDark }]}><Text maxFontSizeMultiplier={1} style={styles.previewAvatarText}>C</Text></View><View style={styles.previewMessageCopy}><View style={styles.previewMessageTitleRow}><Text maxFontSizeMultiplier={1} style={styles.previewMessageTitle}>Coordinator</Text><View style={styles.previewUnread} /></View><Text maxFontSizeMultiplier={1} style={styles.previewMessageSub}>A placement update is ready to review.</Text><Text maxFontSizeMultiplier={1} style={styles.previewTimestamp}>A MOMENT AGO</Text></View></View>
      <View style={styles.previewMessageDivider} />
      <View style={styles.previewMessageRow}><View style={[styles.previewAvatar, { backgroundColor: COLORS.accentLight }]}><FileIcon size={16} color={COLORS.accentDark} /></View><View style={styles.previewMessageCopy}><Text maxFontSizeMultiplier={1} style={styles.previewMessageTitle}>Logbook status</Text><Text maxFontSizeMultiplier={1} style={styles.previewMessageSub}>Your submissions stay easy to find.</Text></View></View>
      <View style={styles.previewReply}><ChatBubbleIcon size={15} color={COLORS.primary} /><Text maxFontSizeMultiplier={1} style={styles.previewReplyText}>Open messages</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  firstScene: { width: '100%', height: 330, position: 'relative' },
  firstSceneCompact: { height: 250 },
  firstDecorations: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  accentRay: { position: 'absolute', width: 6, height: 23, borderRadius: 4 },
  accentDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  attendanceGuide: { position: 'absolute', left: -32, bottom: 0, zIndex: 2 },
  attendancePreview: { position: 'absolute', right: 2, top: 26, width: 210, zIndex: 1, transform: [{ rotate: '-5deg' }, { scale: 0.8 }], transformOrigin: 'right top' },
  updatesGuide: { position: 'absolute', left: -24, bottom: 0, zIndex: 2 },
  updatesPreview: { position: 'absolute', right: 12, top: 64, width: 210, zIndex: 1, transform: [{ rotate: '-5deg' }, { scale: 0.78 }], transformOrigin: 'right top' },
  updatesPreviewCompact: { top: 32, transform: [{ rotate: '-5deg' }, { scale: 0.68 }] },
  sceneMountains: { position: 'absolute', left: -24, right: -24, top: 38, bottom: 0, borderRadius: 100, overflow: 'hidden' },
  welcomeGuide: { position: 'absolute', left: -24, bottom: 0, zIndex: 2 },
  firstPreview: { position: 'absolute', right: -14, bottom: 24, width: 200, zIndex: 1, transform: [{ rotate: '-5deg' }, { scale: 0.86 }], transformOrigin: 'right bottom' },
  pageDots: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 20 },
  pageDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#DBE5F1' },
  pageDotActive: { backgroundColor: '#1680F6' },
  firstNextButton: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 28 },
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
  previewCanvas: { width: '100%', maxWidth: 420, minHeight: 214, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLight, padding: 12, ...SHADOWS.soft },
  previewCalendarCanvas: { backgroundColor: '#FFFEFB' },
  previewInboxCanvas: { minHeight: 0, paddingVertical: 8 },
  previewTopline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACE.md },
  previewGlyph: { width: 28, height: 28, flexShrink: 0, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  previewKicker: { flex: 1, minWidth: 0, color: COLORS.textMuted, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6 },
  previewMenu: { flexDirection: 'row', flexShrink: 0, gap: 2, padding: 2 },
  previewMenuDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: COLORS.textMuted },
  previewHeading: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700', letterSpacing: -0.2, marginBottom: 18 },
  previewValueRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 13 },
  previewValueLong: { width: 72, height: 20, borderRadius: 5, backgroundColor: COLORS.surfaceMuted },
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
  updatesHeading: { fontSize: 14, lineHeight: 18, marginBottom: 6 },
  updatesTopline: { marginBottom: 8 },
  previewMessageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  previewAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  previewAvatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  previewMessageCopy: { flex: 1, gap: 2 },
  previewMessageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  previewMessageTitle: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '700' },
  previewMessageSub: { color: COLORS.textSecondary, fontSize: 10, lineHeight: 13 },
  previewTimestamp: { color: COLORS.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  previewUnread: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.secondary },
  previewMessageDivider: { height: 1, backgroundColor: COLORS.borderLight, marginLeft: 46 },
  previewReply: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 6, marginTop: 3, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
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
