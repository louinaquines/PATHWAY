import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from '../components/AppText';
import { MotionTouchableOpacity } from '../components/Motion';
import { ChevronLeftIcon, ChevronRightIcon, CheckCircleIcon, SettingsIcon, FileIcon, InfoIcon } from '../components/Icons';
import { COLORS, RADIUS } from '../theme';
import StudentSurface from '../components/StudentSurface';
import HelpPrivacyArtwork from '../components/HelpPrivacyArtwork';
import { ProfileIcon, BuildingIcon, CalendarIcon, LogbookIcon, BellIcon, SettingsIcon as GearIcon } from '../components/Icons';

const TOPIC_ICONS = [InfoIcon, FileIcon, BuildingIcon, CalendarIcon, LogbookIcon, BellIcon];
const PRIVACY_ICONS = [ProfileIcon, CalendarIcon, ProfileIcon, GearIcon, InfoIcon];
const TOPIC_COLORS = ['#0874E8', '#00A773', '#7A39E8', '#EC7809', '#AB7708', '#0874E8'];
const TOPIC_TINTS = ['#E8F2FF', '#E3FAEF', '#F0E8FF', '#FFF0E2', '#FFF5CF', '#E8F2FF'];
const HELP_SUMMARIES = ['Learn how to access your account and troubleshoot login issues.', 'Find out what documents you need and how to upload them.', 'Information about your placement details and supervisor.', 'Learn how to record shifts, fix errors, and understand your hours.', 'Step-by-step guidance for completing and submitting your logbooks.', 'Manage your notifications and stay updated.'];

const HELP = [
  ['Signing in', 'Use the account issued by your OJT coordinator. New students must replace their temporary password on the first sign-in. Use Forgot password if you cannot sign in.'],
  ['Requirements and files', 'Open Requirements to upload documents and check review status. Tap an uploaded file to view it. Follow coordinator feedback when revisions are requested.'],
  ['Company placement', 'Submit your company and supervisor details for review. Account approval, final pre-deployment approval, and an approved active company placement are required before new attendance or logbook submissions.'],
  ['Attendance', 'Use time-in and time-out for your actual shift. Allow location access when requested. Contact your coordinator if your location or an attendance record needs review.'],
  ['Weekly logbooks', 'Enter your weekly hours and activities, then check your notes before submitting. Revise and resubmit when requested. Weekly journal hours and attendance hours are separate records.'],
  ['Messages and notifications', 'Use Inbox to read messages and coordinator updates. Open a conversation to reply. Notification preferences can be managed in Settings.'],
];
const PRIVACY = [
  ['Your account and records', 'PATHWAY uses your account details, profile photo, uploaded requirements, placement details, attendance, journals, and messages to support your OJT workflow.'],
  ['Attendance and location', 'Location is checked when recording attendance to apply the configured company location policy. Attendance records include shift times and credited hours.'],
  ['Who can access information', 'Access depends on account roles and assigned sections. Authorized coordinators review student records; administrators manage permitted account and system functions. Evaluation links provide access to the assigned evaluation after verification.'],
  ['Optional AI assistance', 'AI assistance asks for consent before sending the selected information to an external AI service. Remove unnecessary personal or confidential information first. Suggestions are advisory and do not approve documents, attendance, or logbooks.'],
  ['Questions or corrections', 'Contact your assigned OJT coordinator if you have questions about access to your records or need information corrected.'],
];

export default function SettingsInfoScreen({ navigation, route }) {
  const [expanded, setExpanded] = useState(null);
  const appearance = route.name === 'Appearance';
  const help = route.name === 'HelpCenter';
  const title = appearance ? 'Appearance' : help ? 'Help center' : 'Privacy';
  const Icon = appearance ? SettingsIcon : help ? FileIcon : InfoIcon;
  return <SafeAreaView style={s.page} edges={['top', 'bottom', 'left', 'right']}>
    <StudentSurface tone="page" />
    <View style={s.header}>
      <MotionTouchableOpacity style={s.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back to Settings"><ChevronLeftIcon size={21} color={COLORS.primary} /></MotionTouchableOpacity>
      <View style={s.headerTitle}><Icon size={18} color={COLORS.primary} /><Text style={s.title}>{title}</Text></View>
      <View style={{ width: 44 }} />
    </View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
      <View style={s.intro}>
      <StudentSurface waves />
      {!appearance && <View pointerEvents="none" accessible={false} style={s.introArtwork}><HelpPrivacyArtwork privacy={!help} /></View>}
      <Text style={s.heading}>{appearance ? 'Your app appearance' : help ? 'How can we help?' : 'Your information'}</Text>
      <Text style={s.subtitle}>{appearance ? 'A clear, consistent look for your OJT journey.' : help ? 'Quick guidance for using PATHWAY.' : 'Understand how PATHWAY uses your OJT records.'}</Text>
      </View>
      {appearance ? <View style={s.card}>
        <View style={s.row}><View style={s.icon}><SettingsIcon size={20} color={COLORS.primary} /></View><View style={s.copy}><Text style={s.cardTitle}>Light</Text><Text style={s.body}>Current appearance</Text></View><CheckCircleIcon size={22} color={COLORS.successDark} /></View>
        <Text style={s.note}>PATHWAY currently supports light mode.</Text>
      </View> : (help ? HELP : PRIVACY).map(([heading, body], index) => {
        const TopicIcon = (help ? TOPIC_ICONS : PRIVACY_ICONS)[index];
        const topicIcon = <View style={[s.icon, { backgroundColor: TOPIC_TINTS[index] }]}><TopicIcon size={23} color={TOPIC_COLORS[index]} /></View>;
        return <View key={heading} style={s.card}>
        {help ? <MotionTouchableOpacity style={s.row} onPress={() => setExpanded(expanded === index ? null : index)} accessibilityRole="button" accessibilityState={{ expanded: expanded === index }} accessibilityLabel={heading}>{topicIcon}<View style={s.copy}><Text style={s.cardTitle}>{heading}</Text><Text style={s.summary}>{HELP_SUMMARIES[index]}</Text></View><View style={expanded === index ? { transform: [{ rotate: '90deg' }] } : undefined}><ChevronRightIcon size={18} color={COLORS.textMuted} /></View></MotionTouchableOpacity> : <View style={[s.row, { alignItems: 'flex-start' }]}>{topicIcon}<View style={s.copy}><Text style={s.cardTitle}>{heading}</Text><Text style={[s.body, { marginTop: 6 }]}>{body}</Text></View></View>}
        {help && expanded === index && <Text style={[s.body, { marginTop: 10 }]}>{body}</Text>}
      </View>; })}
      {help && <View style={[s.card, s.helpNotice]}><View style={[s.row, { alignItems: 'flex-start' }]}><View style={s.icon}><InfoIcon size={23} color={COLORS.primary} /></View><View style={s.copy}><Text style={[s.cardTitle, { color: COLORS.primary }]}>Need more help?</Text><Text style={[s.summary, { marginTop: 4 }]}>Contact your assigned OJT coordinator. Include the screen name and a description of the issue. Never share your password or verification code.</Text></View></View></View>}
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  content: { padding: 18, paddingTop: 0, paddingBottom: 32, gap: 10, width: '100%', maxWidth: 656, alignSelf: 'center' },
  intro: { minHeight: 106, justifyContent: 'center', overflow: 'hidden', paddingVertical: 12, paddingRight: 90 },
  introArtwork: { position: 'absolute', right: -2, bottom: 0, width: 108, height: 104 },
  heading: { fontSize: 24, lineHeight: 30, fontWeight: '600', color: COLORS.textPrimary },
  subtitle: { fontSize: 12, color: COLORS.textMuted, lineHeight: 18, marginTop: 5 },
  card: { padding: 13, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EFF9' },
  helpNotice: { backgroundColor: '#EDF5FF', borderColor: '#D9E9FF' },
  summary: { fontSize: 11.5, lineHeight: 16, color: COLORS.textMuted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  cardTitle: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: COLORS.textPrimary },
  body: { fontSize: 12, lineHeight: 18, color: COLORS.textMuted },
  note: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border, fontSize: 14, lineHeight: 23, color: COLORS.textMuted },
});
