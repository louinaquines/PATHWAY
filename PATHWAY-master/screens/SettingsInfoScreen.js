import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from '../components/AppText';
import { MotionTouchableOpacity } from '../components/Motion';
import { ChevronLeftIcon, ChevronRightIcon, CheckCircleIcon, SettingsIcon, FileIcon, InfoIcon } from '../components/Icons';
import { COLORS, RADIUS } from '../theme';

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
    <View style={s.header}>
      <MotionTouchableOpacity style={s.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back to Settings"><ChevronLeftIcon size={21} color={COLORS.primary} /></MotionTouchableOpacity>
      <View style={s.headerTitle}><Icon size={18} color={COLORS.primary} /><Text style={s.title}>{title}</Text></View>
      <View style={{ width: 44 }} />
    </View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
      <Text variant="heading" style={s.heading}>{appearance ? 'Your app appearance' : help ? 'How can we help?' : 'Your information'}</Text>
      <Text style={s.subtitle}>{appearance ? 'A clear, consistent look for your OJT journey.' : help ? 'Quick guidance for using PATHWAY.' : 'Understand how PATHWAY uses your OJT records.'}</Text>
      {appearance ? <View style={s.card}>
        <View style={s.row}><View style={s.icon}><SettingsIcon size={20} color={COLORS.primary} /></View><View style={s.copy}><Text style={s.cardTitle}>Light</Text><Text style={s.body}>Current appearance</Text></View><CheckCircleIcon size={22} color={COLORS.successDark} /></View>
        <Text style={s.note}>PATHWAY currently supports light mode.</Text>
      </View> : (help ? HELP : PRIVACY).map(([heading, body], index) => <View key={heading} style={s.card}>
        {help ? <MotionTouchableOpacity style={s.row} onPress={() => setExpanded(expanded === index ? null : index)} accessibilityRole="button" accessibilityState={{ expanded: expanded === index }} accessibilityLabel={heading}><Text style={[s.cardTitle, s.copy]}>{heading}</Text><View style={expanded === index ? { transform: [{ rotate: '90deg' }] } : undefined}><ChevronRightIcon size={18} color={COLORS.textMuted} /></View></MotionTouchableOpacity> : <Text style={s.cardTitle}>{heading}</Text>}
        {(!help || expanded === index) && <Text style={[s.body, { marginTop: 10 }]}>{body}</Text>}
      </View>)}
      {help && <View style={s.card}><Text style={s.cardTitle}>Need more help?</Text><Text style={[s.body, { marginTop: 10 }]}>Contact your assigned OJT coordinator. Include the screen name and a description of the issue. Never share your password or verification code.</Text></View>}
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  content: { padding: 20, paddingBottom: 32, gap: 14 },
  heading: { fontSize: 28, color: COLORS.textPrimary },
  subtitle: { fontSize: 14, color: COLORS.textMuted, lineHeight: 22, marginBottom: 6 },
  card: { padding: 18, borderRadius: RADIUS.lg, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  body: { fontSize: 14, lineHeight: 23, color: COLORS.textMuted },
  note: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border, fontSize: 14, lineHeight: 23, color: COLORS.textMuted },
});
