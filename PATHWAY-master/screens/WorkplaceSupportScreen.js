import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, usePreventRemove } from '@react-navigation/native';
import { onAuthStateChanged } from 'firebase/auth';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '../firebaseConfig';
import { createSupportDraft, hasUnsubmittedSupportDraft, loadSupportPage, requestSupport, downloadSupportAttachment, philippineToday, SUPPORT_TYPES, SUPPORT_STATUSES } from '../services/workplaceSupport';
import { studentAlert as Alert } from '../services/studentAlert';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import { MotionTouchableOpacity } from '../components/Motion';
import LoadMore from '../components/LoadMore';
import StudentSurface from '../components/StudentSurface';
import StudentGuidePose from '../components/StudentGuidePose';
import IncidentDateField from '../components/IncidentDateField';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, FileIcon, LockIcon, RefreshIcon } from '../components/Icons';
import { COLORS, SPACE } from '../theme';

export default function WorkplaceSupportScreen({ navigation, route }) {
  const owner = useRef(auth.currentUser).current;
  const alive = useRef(true);
  const [draft, setDraft] = useState(null);
  const controller = useRef(null);
  if (!controller.current) controller.current = createSupportDraft({ uid: owner?.uid, onChange: value => { if (alive.current) setDraft(value); } });
  const form = draft || controller.current.state;
  const [context, setContext] = useState(null);
  const [view, setView] = useState(route?.params?.reportId ? 'detail' : 'form');
  const [reportId, setReportId] = useState(route?.params?.reportId || null);
  const [detail, setDetail] = useState(null);
  const [page, setPage] = useState({ records: [], hasMore: false, cursor: null });
  const [visibleReports, setVisibleReports] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const pageLock = useRef(false);
  const downloadLock = useRef(false);
  const leave = useRef(false);
  const insets = useSafeAreaInsets();
  const current = () => alive.current && auth.currentUser === owner && !!owner;

  useEffect(() => {
    alive.current = true;
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user === owner) return;
      sequence.current++; controller.current.clear(); setDetail(null); setPage({ records: [], hasMore: false }); setContext(null);
      leave.current = true;
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    });
    return () => { alive.current = false; sequence.current++; unsubscribe(); };
  }, [navigation, owner]);
  usePreventRemove(hasUnsubmittedSupportDraft(form) && auth.currentUser === owner, ({ data }) => {
    if (leave.current || auth.currentUser !== owner) { navigation.dispatch(data.action); return; }
    const state = controller.current.state;
    if (state.sending || state.pending) {
      Alert.alert('Keep this request open', 'Delivery may already have occurred. Retry this same request to confirm its status before leaving.'); return;
    }
    Alert.alert('Discard this draft?', 'This draft is kept only in memory. Leaving will discard its text and selected file.', [
      { text: 'Keep draft', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { controller.current.clear(); leave.current = true; navigation.dispatch(data.action); } },
    ]);
  });

  useEffect(() => {
    if (route?.params?.reportId) { setReportId(route.params.reportId); setDetail(null); setView('detail'); }
  }, [route?.params?.reportId]);

  const load = useCallback(async (more = false) => {
    if (more && pageLock.current) return;
    if (!owner || auth.currentUser !== owner) return;
    const request = ++sequence.current;
    pageLock.current = true; setBusy(true); setError('');
    try {
      if (view === 'form') {
        setContext(null);
        const result = await requestSupport('/student/workplace-support/context', { method: 'GET' });
        if (current() && request === sequence.current) setContext(result);
      } else if (view === 'history') {
        const result = await loadSupportPage('reports', more ? page.cursor : null);
        if (current() && request === sequence.current) {
          setPage(previous => ({ ...result, records: more ? [...new Map([...previous.records, ...result.records].map(item => [item.id, item])).values()] : result.records }));
          setVisibleReports(previous => more ? previous + 5 : 5);
        }
      } else if (reportId) {
        setDetail(null);
        const result = await requestSupport(`/student/workplace-support/${encodeURIComponent(reportId)}`, { method: 'GET' });
        if (current() && request === sequence.current) setDetail(result);
      }
    } catch (failure) { if (current() && request === sequence.current) setError(failure.message); }
    finally { if (request === sequence.current) { pageLock.current = false; if (current()) setBusy(false); } }
  }, [view, reportId, owner, page.cursor]);
  // Cursor changes do not restart focus refresh; explicit load-more fetches exactly one bounded page.
  const loadRef = useRef(load); loadRef.current = load;
  useFocusEffect(useCallback(() => {
    loadRef.current();
    return () => { sequence.current++; pageLock.current = false; };
  }, [view, reportId, owner]));

  const pickFile = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: SUPPORT_TYPES, multiple: false, copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.[0] || !current()) return;
      controller.current.update({ file: picked.assets[0] });
    } catch (_) { if (current()) Alert.alert('Unable to select file', 'Try selecting the file again. Your text is still here.'); }
  };
  const openAttachment = async () => {
    if (downloadLock.current || !detail?.attachment) return;
    downloadLock.current = true;
    let temporaryFileUri;
    const check = () => { if (!current()) throw new Error('Your session changed. Please sign in again.'); };
    try {
      check();
      const attachment = detail.attachment;
      if (!SUPPORT_TYPES.includes(attachment.contentType)) throw new Error('Unsupported attachment type.');
      const name = attachment.contentType === 'application/pdf' ? 'attachment.pdf' : attachment.contentType === 'image/png' ? 'attachment.png' : 'attachment.jpg';
      if (Platform.OS === 'web') {
        const blob = await downloadSupportAttachment(reportId, async (url, headers) => {
          const response = await fetch(url, { headers, cache: 'no-store', redirect: 'error' });
          if (!response.ok) throw new Error('Attachment is unavailable. Refresh and try again.');
          return response.blob();
        }); check();
        const objectUrl = URL.createObjectURL(blob); const anchor = document.createElement('a');
        anchor.href = objectUrl; anchor.download = name; anchor.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } else {
        if (!FileSystem.cacheDirectory) throw new Error('Device storage is unavailable.');
        temporaryFileUri = `${FileSystem.cacheDirectory}support-${Date.now()}-${name}`;
        const downloaded = await downloadSupportAttachment(reportId, (url, headers) => FileSystem.downloadAsync(url, temporaryFileUri, { headers, cache: false }));
        check();
        if (downloaded.status !== 200) throw new Error('Attachment is unavailable. Refresh and try again.');
        if (Platform.OS === 'android') {
          const contentUri = await FileSystem.getContentUriAsync(downloaded.uri); check();
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: contentUri, type: attachment.contentType, flags: 1 });
        } else {
          const folder = `${FileSystem.documentDirectory}PATHWAY/`;
          await FileSystem.makeDirectoryAsync(folder, { intermediates: true }); check();
          await FileSystem.copyAsync({ from: downloaded.uri, to: `${folder}support-${Date.now()}-${name}` });
          check(); Alert.alert('Attachment saved', 'Your attachment is saved in the PATHWAY folder in Files.');
        }
      }
    } catch (failure) { if (current()) Alert.alert('Unable to open attachment', failure.message || 'Try again with a compatible file viewer.'); }
    finally { if (temporaryFileUri) await FileSystem.deleteAsync(temporaryFileUri, { idempotent: true }).catch(() => {}); downloadLock.current = false; }
  };
  const button = (label, onPress, disabled = false, primary = false) => <MotionTouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, primary && styles.primaryButton, disabled && { opacity: 0.5 }]}><Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text></MotionTouchableOpacity>;
  const status = value => SUPPORT_STATUSES.includes(value) ? value : 'Status unavailable';
  const locked = form.sending || form.pending || !!form.result;
  if (auth.currentUser !== owner || !owner) return null;
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <StudentSurface tone="page" />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACE.md, paddingBottom: insets.bottom + SPACE.xl }]}>
      <View style={styles.header}>
        <MotionTouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => view === 'form' ? navigation.goBack() : setView('form')} style={styles.headerButton}><ChevronLeftIcon size={21} color={COLORS.primary} /></MotionTouchableOpacity>
        <Text style={styles.headerTitle}>Workplace support</Text>
        <MotionTouchableOpacity accessibilityRole="button" accessibilityLabel={busy ? 'Refreshing workplace support' : 'Refresh workplace support'} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => load()} style={styles.headerButton}><RefreshIcon size={19} color={COLORS.primary} /></MotionTouchableOpacity>
      </View>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {view === 'form' ? <>
        <View style={styles.hero}>
          <StudentSurface tone="welcome" waves />
          <View style={styles.heroCharacter}><StudentGuidePose pose={0} size={126} extraWidth={12} /></View>
          <Text style={styles.eyebrow}>PRIVATE SUPPORT</Text>
          <Text style={styles.heroTitle}>We’re here to help.</Text>
          <Text style={styles.heroBody}>Share a workplace concern with your coordinator.</Text>
        </View>
        <MotionTouchableOpacity accessibilityRole="button" onPress={() => setView('history')} style={styles.reportsLink}><Text style={styles.buttonText}>Your reports ›</Text></MotionTouchableOpacity>
        {form.result ? <View style={styles.card}><Text accessibilityLiveRegion="polite" style={styles.title}>Sent—awaiting coordinator review</Text>{button('View report', () => { setReportId(form.result.id); setView('detail'); })}</View> : <View style={styles.card}>
          <Text style={styles.label}>To: {context?.available ? context.coordinator?.name : context ? 'Coordinator unavailable' : 'Recipient not confirmed'}</Text>
          {!context?.available && <Text style={styles.body}>Your draft stays here while a coordinator is unavailable. Refresh to check your recipient before sending.</Text>}
          <Text style={styles.body}>Your report goes privately to your coordinator. Your company or supervisor will not be notified automatically.</Text>
          <View style={styles.safetyNotice}><Text style={styles.safetyText}>PATHWAY is not monitored continuously and is not an emergency service. If you are in immediate danger, seek local emergency assistance.</Text></View>
          <Text style={styles.label}>Describe what happened in your preferred language *</Text>
          <TextInput accessibilityLabel="Description in your preferred language" multiline editable={!locked} value={form.description} onChangeText={description => controller.current.update({ description })} style={[styles.input, styles.description]} textAlignVertical="top" />
          <Text style={styles.body}>{form.description.trim().length}/8,000 characters</Text>
          {!!form.errors.description && <Text accessibilityRole="alert" style={styles.error}>{form.errors.description}</Text>}
          <View style={styles.optionalSection}>
          <View style={styles.sectionHeading}><CalendarIcon size={18} color="#0765D4" /><Text style={styles.label}>When did it happen?</Text><Text style={styles.optionalTag}>Optional</Text></View>
          <IncidentDateField disabled={locked} value={form.incidentDate} onChange={incidentDate => controller.current.update({ incidentDate })} maximumDate={philippineToday()} />
          <Text style={styles.fieldHint}>Leave blank if you’re unsure of the date.</Text>
          {!!form.errors.incidentDate && <Text accessibilityRole="alert" style={styles.error}>{form.errors.incidentDate}</Text>}
          </View>
          <View style={styles.optionalSection}>
          <View style={styles.sectionHeading}><FileIcon size={18} color="#0765D4" /><Text style={styles.label}>Supporting attachment</Text><Text style={styles.optionalTag}>Optional</Text></View>
          <Text style={styles.body}>You don’t need proof to ask for support.</Text>
          {form.file ? <><Text style={styles.body}>Selected: {form.file.name || 'Attachment'}</Text>{button('Remove attachment', () => Alert.alert('Remove attachment?', 'You can submit without this file after removing it.', [{ text: 'Keep file', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => controller.current.update({ file: null }) }]), locked)}</> : button('Choose optional attachment', pickFile, locked)}
          <Text style={styles.fieldHint}>One PDF, JPEG or PNG · Up to 5 MB</Text>
          {!!form.errors.file && <Text accessibilityRole="alert" style={styles.error}>{form.errors.file}</Text>}
          </View>
          <MotionTouchableOpacity accessibilityRole="checkbox" accessibilityLabel="I’m concerned about my immediate safety" aria-checked={form.immediateSafety} accessibilityState={{ checked: form.immediateSafety, disabled: locked }} disabled={locked} onPress={() => controller.current.update({ immediateSafety: !form.immediateSafety })} style={[styles.safetyOption, form.immediateSafety && styles.safetySelected, locked && { opacity: 0.5 }]}>
            <View style={[styles.checkbox, form.immediateSafety && styles.checkboxChecked]}>{form.immediateSafety && <Text style={styles.checkmark}>✓</Text>}</View>
            <View style={styles.safetyCopy}><Text style={styles.label}>I’m concerned about my immediate safety</Text><Text style={styles.fieldHint}>Optional · Marks this report as high priority.</Text></View>
          </MotionTouchableOpacity>
          {form.immediateSafety && <Text style={styles.safetyText}>PATHWAY is not monitored continuously. If you are in immediate danger, seek local emergency assistance.</Text>}
          {form.attachmentRejected && <>{button('Renew selected attachment', () => controller.current.update({ file: { ...form.file } }), locked)}<Text style={styles.body}>This attachment was rejected before submission. Your text and file are kept here. Renew it or explicitly remove it before sending.</Text></>}
          {form.pending && <Text style={styles.body}>Delivery may already have occurred. Your text and file are kept here. Retry the same request to confirm; editing is locked while delivery is uncertain.</Text>}
          {!!form.error && <Text accessibilityRole="alert" style={styles.error}>{form.error}</Text>}
          {button(form.sending ? 'Sending…' : form.pending ? 'Retry same request' : 'Send to coordinator', () => controller.current.submit(context?.available === true), form.sending || (!form.pending && !context?.available), true)}
        </View>}
      </> : view === 'history' ? <>
        <View style={styles.historyHero}>
          <StudentSurface tone="welcome" waves />
          <Text style={styles.eyebrow}>PRIVATE SUPPORT</Text>
          <Text style={styles.heroTitle}>Your reports</Text>
          <Text style={styles.heroBody}>Follow your coordinator’s review and updates.</Text>
        </View>
        <View style={styles.historyPrivacy}><LockIcon size={15} color="#0765D4" /><Text style={styles.historyPrivacyText}>Shared privately with your coordinator</Text></View>
        {!busy && !page.records.length && <View style={styles.historyEmpty}><StudentGuidePose pose={1} size={144} /><Text style={styles.label}>No reports yet</Text><Text style={styles.body}>Your submitted workplace concerns will appear here.</Text></View>}
        {page.records.slice(0, visibleReports).map(item => <MotionTouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={`View report, ${status(item.status)}`} onPress={() => { setDetail(null); setReportId(item.id); setView('detail'); }} style={styles.historyRow}>
          <View style={styles.historyIcon}><FileIcon size={22} color="#0765D4" /></View>
          <View style={styles.historyCopy}>
            <Text style={styles.historyTitle}>Workplace report</Text>
            <Text style={styles.historyDate}>{formatReportDate(item.createdAt)}</Text>
            <View style={styles.statusBadge}><Text style={styles.statusText}>{status(item.status)}</Text></View>
          </View>
          <ChevronRightIcon size={19} color="#0765D4" />
        </MotionTouchableOpacity>)}
        <LoadMore hasMore={visibleReports < page.records.length || page.hasMore} loading={busy} onPress={() => visibleReports < page.records.length ? setVisibleReports(previous => previous + 5) : load(true)} label="Load more reports" />
      </> : detail ? <View style={styles.card}>
        <Text style={styles.label}>{status(detail.status)}</Text>
        <Text style={styles.body}>{detail.description}</Text>
        {!!detail.incidentDate && <Text style={styles.body}>Incident date: {detail.incidentDate}</Text>}
        {detail.immediateSafety && <Text style={styles.label}>High priority safety concern</Text>}
        {detail.attachment && button('Open private attachment', openAttachment)}
        <Text style={styles.body}>Submitted reports cannot be edited, messaged or given additional attachments.</Text>
      </View> : <Text style={styles.body}>{busy ? 'Loading report…' : 'Refresh to load this report.'}</Text>}
    </ScrollView>
  </KeyboardAvoidingView>;
}
function formatReportDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  optionalSection: { gap: 10, paddingTop: 16, paddingBottom: 6, borderTopWidth: 1, borderTopColor: '#EDF2F8' },
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  optionalTag: { fontSize: 10, color: '#60748F', backgroundColor: '#F0F4FA', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  fieldHint: { fontSize: 11, lineHeight: 17, color: '#60748F' },
  safetyOption: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#FFF9EC', borderWidth: 1, borderColor: '#F0DEB7', borderRadius: 15, padding: 14, marginTop: 8 },
  safetySelected: { backgroundColor: '#FFF1CF', borderColor: '#C58C20' },
  safetyCopy: { flex: 1, minWidth: 0, gap: 4 },
  checkbox: { flexShrink: 0, width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#B79C68', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#986511', borderColor: '#986511' },
  checkmark: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  historyHero: { position: 'relative', overflow: 'hidden', borderRadius: 22, padding: 20, marginTop: 8 },
  historyPrivacy: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingVertical: 8 },
  historyPrivacyText: { flex: 1, fontSize: 12, color: '#60748F' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E3ECF8', minHeight: 100 },
  historyIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#EAF3FF', alignItems: 'center', justifyContent: 'center' },
  historyCopy: { flex: 1, minWidth: 0, gap: 6 },
  historyTitle: { fontSize: 14, fontWeight: '600', color: '#10213D' },
  historyDate: { fontSize: 12, color: '#60748F' },
  statusBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: '#EAF3FF' },
  statusText: { fontSize: 11, fontWeight: '600', color: '#0765D4' },
  historyEmpty: { alignItems: 'center', padding: 28, gap: 12 },
  hero: { position: 'relative', overflow: 'hidden', borderRadius: 22, minHeight: 148, padding: 18, paddingRight: 130, justifyContent: 'center', marginTop: 8 },
  heroCharacter: { position: 'absolute', right: 12, bottom: -8 },
  eyebrow: { color: '#0765D4', fontSize: 9, fontWeight: '600', letterSpacing: 1.2, marginBottom: 7 },
  heroTitle: { color: '#10213D', fontSize: 23, lineHeight: 28, fontWeight: '600' },
  heroBody: { color: '#5D708C', fontSize: 12, lineHeight: 18, marginTop: 7 },
  safetyNotice: { backgroundColor: '#FFF8E8', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#F6E5B7' },
  safetyText: { color: '#795B24', fontSize: 12, lineHeight: 19 },
  primaryButton: { backgroundColor: '#0765D4', borderColor: '#0765D4', alignItems: 'center', marginTop: 8, minHeight: 52 },
  primaryText: { color: '#FFFFFF' },
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: SPACE.md, gap: SPACE.sm },
  title: { color: COLORS.textPrimary, fontSize: 24, fontWeight: '700', flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, paddingBottom: SPACE.sm },
  headerButton: { width: 44, minHeight: 44, borderRadius: 14, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
  reportsLink: { minHeight: 44, alignSelf: 'flex-end', paddingHorizontal: SPACE.sm, justifyContent: 'center' },
  card: { backgroundColor: COLORS.surface, borderColor: COLORS.borderLight, borderWidth: 1, borderRadius: 20, padding: 18, gap: 12 },
  label: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
  body: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 21 },
  error: { color: COLORS.dangerDark, fontSize: 14, lineHeight: 21 },
  input: { minHeight: 48, padding: SPACE.sm, borderColor: COLORS.border, borderWidth: 1, borderRadius: 10, color: COLORS.textPrimary, fontSize: 16, backgroundColor: COLORS.surface },
  description: { minHeight: 160 },
  button: { minHeight: 48, padding: SPACE.sm, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', backgroundColor: COLORS.surface },
  buttonText: { color: COLORS.primaryDark, fontWeight: '600', fontSize: 15 },
});
