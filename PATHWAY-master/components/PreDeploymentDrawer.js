import React from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text } from './AppText';
import PathwayMark from './PathwayMark';
import {
  BuildingIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  FileIcon,
  HomeIcon,
  LogOutIcon,
} from './Icons';
import { COLORS, RADIUS } from '../theme';

const STEPS = [
  {
    route: 'Requirements',
    number: '01',
    title: 'Document submission',
    description: 'Upload your required forms',
    Icon: FileIcon,
  },
  {
    route: 'Company',
    number: '02',
    title: 'Company placement',
    description: 'Choose or review your placement',
    Icon: BuildingIcon,
  },
  {
    route: 'Review',
    number: '03',
    title: 'Final review',
    description: 'Check your submission package',
    Icon: ClockIcon,
  },
  {
    route: 'Approval',
    number: '04',
    title: 'Approval & clearance',
    description: 'View your coordinator’s decision',
    Icon: CheckCircleIcon,
  },
];

export default function PreDeploymentDrawer({
  visible,
  activeRoute,
  onClose,
  onNavigate,
  onSignOut,
}) {
  const navigateTo = route => {
    onClose?.();
    if (route !== activeRoute) onNavigate?.(route);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          onPress={onClose}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Close navigation menu"
        />

        <View style={styles.drawer}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
          <View style={styles.brandRow}>
            <PathwayMark size={42} />
            <View style={styles.brandCopy}>
              <Text style={styles.brandName}>PATHWAY</Text>
              <Text style={styles.brandCaption}>STUDENT WORKSPACE</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.step, styles.dashboardLink, activeRoute === 'StudentDashboard' && styles.stepActive]}
            onPress={() => navigateTo('StudentDashboard')}
            activeOpacity={0.76}
            accessibilityRole="button"
            accessibilityLabel={`Dashboard${activeRoute === 'StudentDashboard' ? ', current screen' : ''}`}
            accessibilityState={{ selected: activeRoute === 'StudentDashboard' }}
          >
            <View style={[styles.stepIcon, activeRoute === 'StudentDashboard' && styles.stepIconActive]}>
              <HomeIcon
                size={19}
                color={activeRoute === 'StudentDashboard' ? COLORS.primary : COLORS.textMuted}
              />
            </View>
            <View style={styles.stepCopy}>
              <Text style={[styles.stepTitle, activeRoute === 'StudentDashboard' && styles.stepTitleActive]}>
                Dashboard
              </Text>
              <Text style={styles.stepDescription}>View your progress summary</Text>
            </View>
            {activeRoute === 'StudentDashboard' ? (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>HERE</Text>
              </View>
            ) : (
              <ChevronRightIcon size={17} color={COLORS.textMuted} />
            )}
          </TouchableOpacity>

          <View style={styles.headingBlock}>
            <Text style={styles.eyebrow}>PRE-DEPLOYMENT</Text>
            <Text style={styles.heading}>Your setup</Text>
            <Text style={styles.subheading}>Move between your onboarding steps.</Text>
          </View>

          <View style={styles.stepList}>
            {STEPS.map(({ route, number, title, description, Icon }) => {
              const active = route === activeRoute;
              return (
                <TouchableOpacity
                  key={route}
                  style={[styles.step, active && styles.stepActive]}
                  onPress={() => navigateTo(route)}
                  activeOpacity={0.76}
                  accessibilityRole="button"
                  accessibilityLabel={`${title}${active ? ', current step' : ''}`}
                  accessibilityState={{ selected: active }}
                >
                  <View style={[styles.stepIcon, active && styles.stepIconActive]}>
                    <Icon
                      size={19}
                      color={active ? COLORS.primary : COLORS.textMuted}
                    />
                  </View>
                  <View style={styles.stepCopy}>
                    <Text style={[styles.stepTitle, active && styles.stepTitleActive]}>
                      {title}
                    </Text>
                    <Text style={styles.stepDescription}>{description}</Text>
                  </View>
                  {active ? (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>HERE</Text>
                    </View>
                  ) : (
                    <View style={styles.numberBadge}>
                      <Text style={styles.numberText}>{number}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          </ScrollView>
          <View style={styles.footer}>
            <View style={styles.footerRule} />
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={onSignOut}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <LogOutIcon size={18} color={COLORS.danger} />
              <Text style={styles.signOutText}>Sign out</Text>
              <ChevronRightIcon size={17} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  drawer: {
    width: '84%',
    maxWidth: 360,
    height: '100%',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 58 : 28,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    backgroundColor: COLORS.surface,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    shadowColor: '#0F172A',
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  brandCopy: { gap: 3 },
  brandName: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2.2,
  },
  brandCaption: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.05,
  },
  headingBlock: { paddingTop: 25, paddingBottom: 15 },
  eyebrow: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 5,
  },
  heading: {
    color: COLORS.textPrimary,
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  subheading: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  stepList: { gap: 8 },
  dashboardLink: { marginTop: 14 },
  step: {
    minHeight: 70,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#FFFFFF',
  },
  stepActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#D7E8FF',
  },
  stepIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  stepIconActive: { backgroundColor: '#DBEAFE' },
  stepCopy: { flex: 1, minWidth: 0 },
  stepTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  stepTitleActive: { color: COLORS.primaryDark },
  stepDescription: {
    color: COLORS.textMuted,
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 3,
  },
  currentBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
  },
  currentBadgeText: {
    color: COLORS.primary,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.55,
  },
  numberBadge: {
    width: 27,
    height: 27,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  numberText: { color: COLORS.textMuted, fontSize: 9, fontWeight: '800' },
  footer: { marginTop: 'auto' },
  footerRule: { height: 1, backgroundColor: COLORS.borderLight, marginBottom: 14 },
  signOutButton: {
    minHeight: 50,
    paddingHorizontal: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    backgroundColor: '#FFFDFD',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  signOutText: { flex: 1, color: COLORS.danger, fontSize: 13, fontWeight: '700' },
});
