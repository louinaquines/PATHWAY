// screens/LogbookScreen.js
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  AppState,
  Animated,
} from 'react-native';
import Modal from '../components/BackdropModal';
import { collection, doc, query, orderBy, getCountFromServer, getAggregateFromServer, sum, where } from 'firebase/firestore';
import { readRecordPage, mergeRecords } from '../services/recordPagination';
import { logbookLoadErrorMessage } from '../services/logbookLoadError';
import { journalEntryTitle, journalContextChanged, validJournalSettings } from '../services/journalPresentation';
import LoadMore from '../components/LoadMore';
import { showStudentError, showStudentSuccess } from '../services/studentSuccess';
import { auth, db } from '../firebaseConfig';
import { postBackend, requestBackend } from '../services/backendApi';
import { createJournalMigrationClient, journalRevisionExpectation } from '../services/journalSubmission';
import JournalAnalysisConsent from '../components/JournalAnalysisConsent';
import usePlacementEligibility, { PLACEMENT_REQUIRED } from '../services/usePlacementEligibility';
import { studentAlert as Alert } from '../services/studentAlert';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { MotionTouchableOpacity } from '../components/Motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import ScrollView from '../components/RefreshableScrollView';
import StudentSurface from '../components/StudentSurface';
import JournalHeaderArtwork from '../components/JournalHeaderArtwork';
import {
  ChevronLeftIcon,
  ChevronIcon,
  PlusIcon,
  LogbookIcon,
  SparklesIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  CloseIcon,
  RefreshIcon,
  CheckIcon,
  CalendarIcon,
  ArrowRightIcon,
  InfoIcon,
  FileIcon,
} from '../components/Icons';

// ─── Status configuration ───────────────────────────────────────────────────
const STATUS_CONFIG = {
  draft: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', dot: '#3B82F6', label: 'Draft' },
  pending: {
    bg: '#FFF7ED',
    border: '#FED7AA',
    text: '#C2410C',
    dot: '#F97316',
    label: 'Under Review',
  },
  approved: {
    bg: '#F0FDF4',
    border: '#BBF7D0',
    text: '#15803D',
    dot: '#22C55E',
    label: 'Approved',
  },
  rejected: {
    bg: '#FFF1F2',
    border: '#FECDD3',
    text: '#BE123C',
    dot: '#F43F5E',
    label: 'Needs Revision',
  },
};

function formatTimeAgo(isoStr) {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

// ─── Coordinator review status ───────────────────────────────────────────────
function ReviewStatusCard({ summary }) {
  const pendingCount = summary.pending;
  const revisionCount = summary.rejected;
  const approvedCount = summary.approved;

  let message = 'Submitted entries and their coordinator review status will appear here.';
  let Icon = InfoIcon;
  let iconColor = COLORS.primary;
  if (pendingCount > 0 && revisionCount > 0) {
    message = `${pendingCount} ${pendingCount === 1 ? 'entry is' : 'entries are'} awaiting review; ${revisionCount} ${revisionCount === 1 ? 'needs' : 'need'} revision.`;
    Icon = AlertCircleIcon;
    iconColor = COLORS.warningDark;
  } else if (pendingCount > 0) {
    message = `${pendingCount} ${pendingCount === 1 ? 'entry is' : 'entries are'} waiting for coordinator review.`;
  } else if (revisionCount > 0) {
    message = `${revisionCount} ${revisionCount === 1 ? 'entry needs' : 'entries need'} revision. Open the report to review it before submitting an updated entry.`;
    Icon = AlertCircleIcon;
    iconColor = COLORS.warningDark;
  } else if (summary.count > 0 && approvedCount === summary.count) {
    message = 'Your submitted entries have been reviewed and approved by your coordinator.';
    Icon = CheckCircleIcon;
    iconColor = COLORS.successDark;
  }

  return (
    <View style={styles.reviewCard}>
      <StudentSurface waves />
      <View pointerEvents="none" accessible={false} style={styles.reviewWatermark}><FileIcon filled size={67} color="#DCEEFF" /></View>
      <View style={styles.reviewIconWrap}>
        <Icon size={17} color={iconColor} />
      </View>
      <View style={styles.reviewCopy}>
        <Text style={styles.reviewTitle}>Coordinator review</Text>
        <Text style={styles.reviewText}>{message}</Text>
      </View>
    </View>
  );
}

// ─── Log entry card ───────────────────────────────────────────────────────────
function LogEntryCard({ entry, isExpanded, onToggle, onRevise, eligible }) {
  const config = STATUS_CONFIG[entry.status] || STATUS_CONFIG.pending;
  const preview = (entry.refined || entry.rawNotes || '').slice(0, 90);

  return (
    <TouchableOpacity
      style={styles.entryCard}
      onPress={onToggle}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityState={{ expanded: isExpanded }}
    >
      <View style={styles.entryBody}>
        {/* Top row: title + badge */}
        <View style={styles.entryTop}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.entryTitle} numberOfLines={1}>
              {journalEntryTitle(entry)}
            </Text>
            <View style={styles.entryMetaRow}>
              <CalendarIcon size={11} color={COLORS.textMuted} />
              <Text style={styles.entryMeta}>
                {formatTimeAgo(entry.createdAt)}
              </Text>
              <ClockIcon size={11} color={COLORS.textMuted} />
              <Text style={styles.entryMeta}>{entry.hours} hrs</Text>
            </View>
          </View>

          {/* Status badge */}
          <View style={[styles.statusBadge, { backgroundColor: config.bg, borderColor: config.border }]}>
            <Text style={[styles.statusBadgeText, { color: config.text }]}>
              {config.label}
            </Text>
          </View>
        </View>

        {/* Description preview */}
        {!isExpanded && (
          <Text style={styles.entryPreview} numberOfLines={2}>
            {preview}{preview.length >= 90 ? '…' : ''}
          </Text>
        )}

        {/* Expanded content */}
        {isExpanded && (
          <View style={styles.expandedSection}>
            <View style={styles.expandedDivider} />

            <View style={styles.noteBox}>
              <Text style={styles.noteLabel}>
                {entry.aiRefined ? '✦ AI-POLISHED REPORT' : 'LOGBOOK REPORT'}
              </Text>
              <Text style={styles.noteText}>{entry.refined || entry.rawNotes}</Text>
            </View>

            {entry.aiRefined && entry.rawNotes !== entry.refined && (
              <View style={styles.rawNoteBox}>
                <Text style={styles.rawLabel}>STUDENT ORIGINAL DRAFT</Text>
                <Text style={styles.rawText}>{entry.rawNotes}</Text>
              </View>
            )}
          </View>
        )}

        {entry.status === 'rejected' && (
          <View style={styles.feedbackBox} accessibilityRole="alert">
            <Text style={styles.feedbackTitle}>Coordinator feedback</Text>
            <Text style={styles.feedbackText}>{entry.reviewReason || 'Your coordinator asked you to revise this entry.'}</Text>
          </View>
        )}
        {/* Bottom row: expand toggle */}
        {['rejected', 'draft'].includes(entry.status) && (
          <MotionTouchableOpacity disabled={!eligible} onPress={event => { event.stopPropagation(); onRevise(entry); }} accessibilityRole="button" accessibilityLabel={`Edit and resubmit ${journalEntryTitle(entry)}`} style={styles.reviseButton}>
            <Text style={styles.reviseButtonText}>{entry.status === 'draft' ? 'Continue draft' : 'Edit and resubmit'}</Text>
            <ArrowRightIcon size={16} color={COLORS.primary} />
          </MotionTouchableOpacity>
        )}
        <View style={styles.entryFooter}>
          <Text style={styles.expandToggleText}>
            {isExpanded ? 'Show less' : 'Read report'}
          </Text>
          <ChevronIcon size={14} color={COLORS.secondary} expanded={isExpanded} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function LogbookScreen({ navigation }) {
  const { eligible } = usePlacementEligibility();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modal, setModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [rawNotes, setRawNotes] = useState('');
  const [hours, setHours] = useState('');
  const [refining, setRefining] = useState(false);
  const [refined, setRefined] = useState('');
  const [aiTips, setAiTips] = useState([]);
  const [missing, setMissing] = useState({ hours: false, notes: false });
  const shakeX = useRef(new Animated.Value(0)).current;
  const nudgeMissing = () => {
    setMissing({ hours: !hours, notes: !rawNotes.trim() });
    shakeX.setValue(0);
    Animated.sequence([10, -10, 8, -8, 4, 0].map(v => Animated.timing(shakeX, { toValue: v, duration: 55, useNativeDriver: Platform.OS !== 'web' }))).start();
  };
  const [aiConsentOpen, setAiConsentOpen] = useState(false);
  const [aiError, setAiError] = useState('');
  const currentDraft = useRef({});
  currentDraft.current = { rawNotes, editingEntry, modal };
  const aiInFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [pageState, setPageState] = useState({ cursor: null, hasMore: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState('');
  const [summary, setSummary] = useState({ count: 0, hours: 0, pending: 0, approved: 0, rejected: 0 });

  const uid = auth.currentUser.uid;
  const [journalSettings, setJournalSettings] = useState(null);
  const [settingsError, setSettingsError] = useState('');
  const [draftSettings, setDraftSettings] = useState(null);
  const [draftNeedsConfirmation, setDraftNeedsConfirmation] = useState(false);
  const settingsRequest = useRef(null);
  const refreshSettings = useCallback(async () => {
    if (settingsRequest.current) return settingsRequest.current;
    const request = requestBackend('/student/journal-settings/read', { timeoutMs: 15000 }).then(value => {
      if (!validJournalSettings(value)) throw new Error('Journal settings unavailable.');
      setJournalSettings(value); setSettingsError(''); return value;
    }).catch(error => { setSettingsError(error.message); throw error; }).finally(() => { if (settingsRequest.current === request) settingsRequest.current = null; });
    settingsRequest.current = request; return request;
  }, [uid]);
  useEffect(() => {
    const refresh = () => { if (AppState.currentState !== 'background') refreshSettings().catch(() => {}); };
    refresh(); const timer = setInterval(refresh, 30000);
    const appListener = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const unsubscribe = navigation.addListener?.('focus', refresh);
    return () => { clearInterval(timer); appListener.remove(); unsubscribe?.(); };
  }, [refreshSettings, navigation]);
  const activeFrequency = journalSettings?.frequency || 'weekly';
  const draftFrequency = editingEntry && editingEntry.status !== 'draft' ? editingEntry.frequency || 'weekly' : draftSettings?.frequency || activeFrequency;
  const daily = draftFrequency === 'daily', maxHours = daily ? 24 : 168;
  // Minimum journal length (also enforced by the backend).
  const minWords = daily ? 50 : 150;
  const wordCount = (rawNotes.trim().match(/\S+/g) || []).length;
  // A returned (rejected) entry must be edited before it can be resubmitted.
  const revisingRejected = editingEntry?.status === 'rejected';
  const unchangedRevision = revisingRejected && rawNotes.trim() === String(editingEntry.rawNotes || '').trim();
  const revisionReason = editingEntry?.reviewReason || editingEntry?.rejectionReason || editingEntry?.reviewComment || editingEntry?.feedback || '';
  const openEntry = async () => {
    if (recoveryRequired) { setModal(true); return; }
    try { const value = await refreshSettings(); setDraftSettings(value); setDraftNeedsConfirmation(false); setModal(true); }
    catch (error) { Alert.alert('Journal settings unavailable', error.message); }
  };
  const backendSubmission = process.env.EXPO_PUBLIC_JOURNAL_BACKEND_SUBMISSION === '1';
  const migration = useRef(null);
  if (!migration.current) migration.current = createJournalMigrationClient(postBackend, () => doc(collection(db, 'users', uid, 'logbook')).id, '/student/period-journals');

  useEffect(() => { fetchEntries(); }, []);

  const fetchEntries = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const records = collection(db, 'users', uid, 'logbook');
      const [page, count, hours, pending, approved, rejected] = await Promise.all([
        readRecordPage(query(records, orderBy('createdAt', 'desc')), 5),
        getCountFromServer(records), getAggregateFromServer(records, { hours: sum('hours') }),
        ...['pending', 'approved', 'rejected'].map(status => getCountFromServer(query(records, where('status', '==', status)))),
      ]);
      setEntries(page.records);
      setPageState(page);
      setPageError('');
      setSummary({ count: count.data().count, hours: hours.data().hours || 0, pending: pending.data().count, approved: approved.data().count, rejected: rejected.data().count });
    } catch (e) {
      console.error('Fetch logbook entries error:', e);
      setLoadError(logbookLoadErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const loadMoreEntries = async () => {
    if (loadingMore || !pageState.hasMore) return;
    setLoadingMore(true);
    setPageError('');
    try {
      const page = await readRecordPage(query(collection(db, 'users', uid, 'logbook'), orderBy('createdAt', 'desc')), 5, pageState.cursor);
      setEntries(previous => mergeRecords(previous, page.records));
      setPageState(page);
    } catch { setPageError('Could not load older journals. Please try again.'); }
    finally { setLoadingMore(false); }
  };

  const checkNotes = () => {
    if (!rawNotes.trim()) {
      Alert.alert('No notes yet', `Write your ${draftFrequency} notes first.`);
      return;
    }
    const warnings = [];
    if (rawNotes.trim().split(/\s+/).length < 20) warnings.push('Check that your activities and learning are described.');
    if (!Number.isFinite(Number(hours)) || Number(hours) <= 0 || Number(hours) > maxHours) warnings.push(`Enter ${draftFrequency} hours greater than zero and no more than ${maxHours}.`);
    Alert.alert('Notes checklist', (warnings.length ? warnings.join('\n\n') : 'No basic warnings found.') + '\n\nCheck your reporting dates, activities, learning and hours before submitting. Your notes are not rewritten or approved.');
  };

  // AI refinement: consent is asked inline inside the entry sheet (a second modal would hide the sheet on web).
  const requestAiRefinement = () => {
    setAiError('');
    if (!rawNotes.trim() || rawNotes.length > 8000) { setAiError('Write your notes first (up to 8,000 characters).'); return; }
    if (aiInFlight.current || saving || recoveryRequired) return;
    setAiConsentOpen(true);
  };
  const sendNotesToAi = async (again = false, previous = '') => {
    setAiConsentOpen(false);
    if (aiInFlight.current) return;
    const draft = { rawNotes, editingEntry };
    aiInFlight.current = true;
    setRefining(true);
    setAiError('');
    try {
      const result = await postBackend('/refine-logbook', { notes: draft.rawNotes, consent: true, again: again === true, ...(again ? { previous } : {}) });
      if (typeof result.refined !== 'string' || !result.refined.trim() || result.refined.length > 8000) throw new Error('No usable AI suggestion returned.');
      if (currentDraft.current.rawNotes === draft.rawNotes && currentDraft.current.editingEntry === draft.editingEntry) { setRefined(result.refined); setAiTips(Array.isArray(result.tips) ? result.tips.filter(t => typeof t === 'string').slice(0, 3) : []); }
    } catch (error) { setAiError(`${error.message || 'AI refinement failed.'} You can still submit your original notes.`); }
    finally { aiInFlight.current = false; setRefining(false); }
  };

  const handleSubmit = async () => {
    if (saving || refining) return;
    if (!rawNotes.trim()) {
      Alert.alert('Notes required', `Enter your ${draftFrequency} notes before submitting.`);
      return;
    }
    if (unchangedRevision) {
      Alert.alert('Edit your entry first', 'Your coordinator asked for changes. Update your notes to address the feedback, then resubmit.');
      return;
    }
    if (wordCount < minWords) {
      Alert.alert('Add more detail', `A ${draftFrequency} journal needs at least ${minWords} words. You have ${wordCount}.`);
      return;
    }
    if (!hours || !Number.isFinite(+hours) || +hours <= 0 || +hours > maxHours) {
      Alert.alert('Invalid hours', `Enter ${draftFrequency} hours greater than 0 and no more than ${maxHours}.`);
      return;
    }
    if (rawNotes.trim().length > 8000 || refined.trim().length > 8000) {
      Alert.alert('Report too long', 'Keep your report within 8,000 characters.');
      return;
    }
    setSaving(true);
    try {
      const entryText = refined.trim() || rawNotes.trim();
      const content = { rawNotes: rawNotes.trim(), refined: entryText, aiRefined: Boolean(refined.trim()), hours: +hours, status: 'pending' };
      let submission;
      if (migration.current.hasPendingJournal()) {
        submission = await migration.current.retryPendingJournal();
      } else {
      if (!editingEntry || editingEntry.status === 'draft') {
        const fresh = await refreshSettings();
        if (draftNeedsConfirmation || journalContextChanged(draftSettings, fresh)) {
          Alert.alert('Review updated reporting period', `Your coordinator settings or reporting dates changed to ${fresh.frequency}: ${fresh.periodStart}${fresh.periodEnd !== fresh.periodStart ? ` – ${fresh.periodEnd}` : ''}. Your notes are kept. Review the updated period before submitting.`, [
            { text: 'Keep draft', style: 'cancel' },
            { text: 'Use updated period', onPress: () => { setDraftSettings(fresh); setDraftNeedsConfirmation(false); migration.current.discardJournalDraft(); } },
          ]);
          return;
        }
      }
      {
        const { status, ...payload } = content;
        submission = await migration.current.submit({ ...payload,
          ...(!editingEntry || editingEntry.status === 'draft' ? { department: draftSettings.department, frequency: draftSettings.frequency, settingsRevision: draftSettings.revision, periodStart: draftSettings.periodStart } : {}),
          ...(editingEntry ? { entryId: editingEntry.id, expectedRevision: editingEntry.sourceRevision ?? 0, expectedSource: journalRevisionExpectation(editingEntry), ...(editingEntry.status === 'draft' ? { submitDraft: true } : {}) } : {}) });
      }
      }
      setRecoveryRequired(false);
      setModal(false);
      showStudentSuccess(editingEntry ? 'Logbook resubmitted' : 'Logbook submitted', `Your entry was saved and is ready for coordinator review.${submission ? (submission.analysisStatus === 'queued' ? ' Automated analysis is queued, not reviewed. Automatic processing is not active in this release.' : ' Automatic analysis is not enabled for this submission.') : ''}`);
      setEditingEntry(null);
      setRawNotes('');
      setHours('');
      setRefined('');
      fetchEntries();
    } catch (e) {
      setRecoveryRequired(migration.current.hasPendingJournal());
      showStudentError('Logbook not submitted', e.message || 'Failed to submit your logbook entry. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    if (saving) return;
    if (recoveryRequired) { setModal(false); return; }
    migration.current.discardJournalDraft();
    setEditingEntry(null);
    setModal(false);
    setRawNotes('');
    setHours('');
    setRefined('');
  };

  const reviseEntry = entry => {
    if (recoveryRequired) { setModal(true); return; }
    migration.current.discardJournalDraft();
    setEditingEntry(entry);
    if (entry.status === 'draft') { setDraftSettings(journalSettings); setDraftNeedsConfirmation(true); }
    setRawNotes(entry.rawNotes || entry.refined || '');
    setHours(String(entry.hours || ''));
    setRefined(entry.aiRefined ? entry.refined || '' : '');
    setModal(true);
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return <StudentScreenSkeleton variant="logbook" />;
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* ── Header ── */}
      <View style={{ height: insets.top, backgroundColor: COLORS.surface }} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeftIcon size={21} color={COLORS.primary} />
        </TouchableOpacity>

        <View pointerEvents="none" style={styles.headerCenter}>
          <LogbookIcon size={18} color={COLORS.primary} />
          <Text style={styles.headerTitle}>Logbook</Text>
        </View>

        <View style={{ width: 42 }} />
      </View>

      <ScrollView onRefresh={fetchEntries} skeletonVariant="logbook" contentContainerStyle={[styles.scroll, { paddingBottom: 100 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        <StudentSurface tone="page" />

        <View style={styles.pageIntro}>
          <StudentSurface waves />
          <View pointerEvents="none" accessible={false} style={styles.journalHeaderArtwork}><JournalHeaderArtwork /></View>
          <Text style={styles.pageEyebrow}>{journalSettings ? `${activeFrequency.toUpperCase()} JOURNAL` : 'JOURNAL'}</Text>
          <Text style={styles.pageTitle}>Your logbook</Text>
          <Text style={styles.pageSubtitle}>{journalSettings ? `Submit ${activeFrequency} reports and check their status.` : 'Loading your department journal settings…'}</Text>
          {journalSettings && (
            <View style={styles.scheduleChip} accessibilityLabel={`Journal schedule: ${activeFrequency}`}>
              <CalendarIcon size={12} color="#1D4ED8" />
              <Text style={styles.scheduleChipText}>{activeFrequency === 'daily' ? 'Daily · one entry each workday' : 'Weekly · one entry per week'}</Text>
            </View>
          )}
        </View>

        {backendSubmission && <JournalAnalysisConsent client={migration.current} />}
        {!!settingsError && <View style={styles.loadErrorCard}><Text style={styles.loadErrorText}>{settingsError}</Text><MotionTouchableOpacity onPress={() => refreshSettings().catch(() => {})}><Text>Retry journal settings</Text></MotionTouchableOpacity></View>}

        {loadError ? (
          <View style={styles.loadErrorCard}>
            <View style={styles.loadErrorIcon}><AlertCircleIcon size={19} color={COLORS.dangerDark} /></View>
            <Text style={styles.loadErrorTitle}>Couldn’t load your entries</Text>
            <Text style={styles.loadErrorText}>{loadError}</Text>
            <MotionTouchableOpacity onPress={fetchEntries} style={styles.retryBtn} accessibilityRole="button">
              <Text style={styles.retryBtnText}>Try again</Text>
            </MotionTouchableOpacity>
          </View>
        ) : (
          <>
        {/* ── Stats summary ── */}
        <View style={styles.statsBar}>
          <StudentSurface />
          <View style={styles.statsHeading}>
            <LogbookIcon size={15} color={COLORS.primary} />
            <Text style={styles.statsEyebrow}>ACTIVITY SUMMARY</Text>
          </View>
          <View style={styles.statsMetrics}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{summary.count}</Text>
              <Text style={styles.statLabel}>Entries</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {Number(summary.hours).toFixed(1).replace(/\.0$/, '')}
              </Text>
              <Text style={styles.statLabel}>Reported journal hours</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: COLORS.successDark }]}>
                {summary.approved}
              </Text>
              <Text style={styles.statLabel}>Approved</Text>
            </View>
          </View>
        </View>

        {/* ── Coordinator review status ── */}
        <ReviewStatusCard summary={summary} />

        {/* ── Entries section header ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Journal Entries</Text>
          <Text style={styles.sectionCount}>{summary.count} logs</Text>
        </View>

        {/* ── Empty state ── */}
        {entries.length === 0 && (
          <View style={styles.emptyCard}>
            <StudentSurface waves />
            <View style={styles.emptyIconBg}>
              <LogbookIcon size={34} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>No Log Entries Yet</Text>
            <Text style={styles.emptySub}>
              Add a {activeFrequency} report with your hours, tasks, and key takeaways. Your coordinator will review it after submission.
            </Text>
            <MotionTouchableOpacity
              style={styles.emptyBtn}
              onPress={openEntry} disabled={!eligible || !journalSettings}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Add your first logbook entry"
            >
              <PlusIcon size={14} color="#fff" />
              <Text style={styles.emptyBtnText}>Add first entry</Text>
            </MotionTouchableOpacity>
          </View>
        )}

        {/* ── Log entry cards ── */}
        {entries.map(entry => (
          <LogEntryCard
            key={entry.id}
            entry={entry}
            isExpanded={expanded === entry.id}
            onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)}
            onRevise={reviseEntry}
            eligible={eligible}
          />
        ))}
        <LoadMore onPress={loadMoreEntries} loading={loadingMore} hasMore={pageState.hasMore} error={pageError} />

        {/* ── Attendance handoff ── */}
        <View style={styles.dtrCard}>
          <StudentSurface waves />
          <View pointerEvents="none" accessible={false} style={styles.attendanceWatermark}><CalendarIcon size={61} color="#CBE4FF" /></View>
          <View style={styles.dtrHeaderRow}>
            <View style={styles.dtrIconWrap}>
              <CalendarIcon size={16} color={COLORS.primary} />
            </View>
            <View style={styles.dtrTitleWrap}>
              <Text style={styles.dtrTitle}>Attendance records</Text>
              <Text style={styles.dtrSubtitle}>Daily time-in and time-out</Text>
            </View>
          </View>
          <View style={styles.dtrNotice}>
            <InfoIcon size={16} color={COLORS.textMuted} />
            <Text style={styles.dtrNoticeText}>Upload your signed Form 48 (DTR) in Requirements. Daily time in/out is recorded in Logs.</Text>
          </View>
          <MotionTouchableOpacity
            style={styles.attendanceBtn}
            onPress={() => navigation.navigate('LogToday')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Open attendance records"
          >
            <Text style={styles.attendanceBtnText}>Open attendance</Text>
            <ArrowRightIcon size={15} color={COLORS.primary} />
          </MotionTouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
          </>
        )}
      </ScrollView>

      {/* ── New Log Modal ── */}
      <MotionTouchableOpacity
        onPress={openEntry} disabled={!eligible || !journalSettings}
        style={[styles.floatingAddButton, { bottom: 40 + insets.bottom, opacity: eligible ? 1 : 0.5 }]}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`New ${activeFrequency} entry`}
      >
        <PlusIcon size={27} color="#FFFFFF" />
      </MotionTouchableOpacity>
      {!eligible && <Text style={{ color: COLORS.textMuted, padding: 16 }}>{PLACEMENT_REQUIRED}</Text>}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalSheet, { marginTop: insets.top + 8, paddingBottom: Math.max(16, insets.bottom) }]}>
            <StudentSurface tone="page" />

            {/* Modal drag handle */}
            <View style={styles.sheetHandle} />

            {/* Modal header */}
            <View style={styles.modalHeader}>
              <StudentSurface waves />
              <View pointerEvents="none" accessible={false} style={styles.journalModalArtwork}><JournalHeaderArtwork /></View>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle}>{editingEntry ? `${editingEntry.status === 'draft' ? 'Continue' : 'Revise'} ${daily ? 'Daily' : 'Weekly'} Entry` : `New ${daily ? 'Daily' : 'Weekly'} Entry`}</Text>
                <Text style={styles.modalWeek}>
                  {editingEntry && editingEntry.status !== 'draft' ? journalEntryTitle(editingEntry) : draftSettings ? `${draftSettings.periodStart}${daily ? '' : ` – ${draftSettings.periodEnd}`}` : 'Reporting period unavailable'}
                </Text>
              </View>
              <TouchableOpacity onPress={closeModal} style={styles.modalCloseBtn} activeOpacity={0.7}>
                <CloseIcon size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalFormScroll} contentContainerStyle={styles.modalFormContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets={false}>
              {revisingRejected && (
                <View style={styles.revisionBox} accessibilityRole="alert">
                  <Text style={styles.revisionTitle}>Changes requested by your coordinator</Text>
                  {revisionReason ? <Text style={styles.revisionReason}>“{revisionReason}”</Text> : null}
                  <Text style={[styles.revisionHint, !unchangedRevision && styles.revisionHintDone]}>{unchangedRevision ? 'Edit your notes to address this feedback before resubmitting.' : 'Notes updated. You can resubmit when ready.'}</Text>
                </View>
              )}

              {/* Hours input */}
              <Text style={styles.fieldLabel}>{daily ? 'Hours Rendered That Day' : 'Hours Rendered This Week'}</Text>
              <View style={[styles.fieldWrap, missing.hours && !hours && styles.fieldMissing]}>
                <ClockIcon size={16} color={missing.hours && !hours ? '#B3261E' : COLORS.textMuted} />
                <TextInput
                  style={styles.fieldInput}
                  placeholder={daily ? 'e.g. 8' : 'e.g. 40'}
                  placeholderTextColor={COLORS.textPlaceholder}
                  value={hours}
                  onChangeText={value => { setHours(value); if (value) setMissing(m => ({ ...m, hours: false })); }}
                  editable={!saving && !recoveryRequired}
                  keyboardType="numeric"
                />
                <Text style={styles.fieldUnit}>hrs</Text>
              </View>

              {/* Notes input */}
              <Text style={styles.fieldLabel}>{daily ? 'Today’s Activities & Tasks' : 'Weekly Activities & Tasks'}</Text>
              <View style={[styles.fieldWrap, styles.textAreaWrap, missing.notes && !rawNotes.trim() && styles.fieldMissing]}>
                <TextInput
                  style={styles.textArea}
                  placeholder={`Describe what you accomplished ${daily ? 'today' : 'this week'}, what you learned, and any challenges…`}
                  placeholderTextColor={COLORS.textPlaceholder}
                  value={rawNotes}
                  editable={!saving && !recoveryRequired}
                  onChangeText={value => { setRawNotes(value); if (value.trim()) setMissing(m => ({ ...m, notes: false })); setRefined(''); setAiError(''); setAiConsentOpen(false); }}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <Text style={[styles.wordCount, wordCount >= minWords && styles.wordCountOk]}>{wordCount} / {minWords} words minimum</Text>
              {/* Refined output */}
              <TouchableOpacity style={[styles.refineBtn, styles.aiRefineBtn, (refining || saving || recoveryRequired) && { opacity: 0.6 }]} onPress={requestAiRefinement} disabled={refining || saving || recoveryRequired} accessibilityLabel="Request optional AI journal refinement" accessibilityRole="button" accessibilityState={{ disabled: refining || saving || recoveryRequired, busy: refining }}>
                {refining ? <ActivityIndicator size="small" color="#2563EB" /> : <SparklesIcon size={20} color="#2563EB" />}
                <View style={styles.assistCopy}>
                  <Text style={styles.aiRefineTitle}>{refining ? 'Generating suggestion…' : 'Refine with AI'}</Text>
                  <Text style={styles.assistCaption}>Optional · powered by AI</Text>
                </View>
                {!refining && <ArrowRightIcon size={18} color="#2563EB" />}
              </TouchableOpacity>
              {aiConsentOpen && !refining && (
                <View style={styles.aiConsentBox} accessibilityRole="alert">
                  <Text style={styles.aiConsentTitle}>Send these notes to AI?</Text>
                  <Text style={styles.aiConsentText}>Remove personal or confidential company information first. AI can make mistakes, so review the suggestion before using it. Your original notes are kept.</Text>
                  <View style={styles.aiConsentActions}>
                    <TouchableOpacity style={styles.aiConsentCancel} onPress={() => setAiConsentOpen(false)} accessibilityRole="button"><Text style={styles.aiConsentCancelText}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.aiConsentSend} onPress={() => sendNotesToAi(false)} accessibilityRole="button"><Text style={styles.aiConsentSendText}>Send notes</Text></TouchableOpacity>
                  </View>
                </View>
              )}
              {aiError ? <Text style={styles.aiErrorText} accessibilityRole="alert">{aiError}</Text> : null}
              {refined ? (
                <View style={styles.refinedBox}>
                  <View style={styles.refinedHeaderRow}>
                    <SparklesIcon size={18} color="#2563EB" />
                    <Text style={styles.refinedLabel}>AI suggestion</Text>
                  </View>
                  <Text style={styles.suggestionHint}>Review for accuracy before submitting. Your original notes are unchanged.</Text>
                  <Text selectable style={styles.refinedText}>{refined}</Text>
                  {aiTips.length > 0 && (
                    <View style={styles.tipsBox}>
                      <Text style={styles.tipsTitle}>To make it stronger, add:</Text>
                      {aiTips.map((tip, i) => <View key={i} style={styles.tipRow}><Text style={styles.tipDot}>•</Text><Text style={styles.tipText}>{tip}</Text></View>)}
                    </View>
                  )}
                  <View style={styles.suggestionActions}>
                    <TouchableOpacity style={styles.suggestionAction} onPress={() => { const previous = refined; setRefined(''); sendNotesToAi(true, previous); }} disabled={saving || refining || recoveryRequired} accessibilityRole="button" accessibilityLabel="Generate another AI suggestion">
                      {refining ? <ActivityIndicator size="small" color="#2563EB" /> : <RefreshIcon size={16} color="#2563EB" />}
                      <Text style={styles.suggestionActionText}>{refining ? 'Generating…' : 'Try another'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.suggestionAction, styles.suggestionUse]} onPress={() => { setRawNotes(refined); setRefined(''); }} disabled={saving || refining || recoveryRequired} accessibilityRole="button" accessibilityLabel="Use AI suggestion as my notes">
                      <CheckIcon size={16} color="#FFFFFF" />
                      <Text style={[styles.suggestionActionText, { color: '#FFFFFF' }]}>Use this</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.discardSuggestionBtn} onPress={() => setRefined('')} disabled={saving || refining || recoveryRequired} accessibilityLabel="Discard AI suggestion and use original notes" accessibilityRole="button">
                    <CloseIcon size={16} color="#475569" />
                    <Text style={styles.discardSuggestionText}>Discard suggestion</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {!saving && !recoveryRequired && (!hours || !rawNotes.trim()) && (
                <Text style={styles.submitHint} accessibilityLiveRegion="polite">
                  {!hours && !rawNotes.trim() ? 'Enter your hours rendered and your logbook notes to submit.' : !hours ? 'Enter your hours rendered to submit.' : 'Write your logbook notes to submit.'}
                </Text>
              )}
              {/* Action buttons */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={closeModal}
                  disabled={saving || refining}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <Animated.View style={{ flex: 1, transform: [{ translateX: shakeX }] }}>
                <MotionTouchableOpacity
                  style={[
                    styles.submitBtn,
                    (saving || !rawNotes.trim() || !hours || unchangedRevision) && { opacity: 0.45 },
                  ]}
                  onPress={() => { if (!hours || !rawNotes.trim()) { nudgeMissing(); return; } handleSubmit(); }}
                  disabled={saving || !eligible || unchangedRevision}
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                  <Text style={styles.submitBtnText}>{recoveryRequired ? 'Retry submission' : editingEntry ? editingEntry.status === 'draft' ? 'Submit draft' : 'Resubmit note' : 'Submit Log'}</Text>
                      <ArrowRightIcon size={15} color="#fff" />
                    </>
                  )}
                </MotionTouchableOpacity>
                </Animated.View>
              </View>

              <View style={{ height: Platform.OS === 'ios' ? 24 : 12 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  journalHeaderArtwork: { position: 'absolute', right: -3, bottom: -3, width: 108, height: 100 },
  journalModalArtwork: { position: 'absolute', right: 0, bottom: -5, width: 132, height: 112 },
  reviewWatermark: { position: 'absolute', right: -8, bottom: -12, opacity: 0.5 },
  attendanceWatermark: { position: 'absolute', right: 12, top: 10, opacity: 0.6 },
  modalHeaderCopy: { flex: 1, paddingRight: 80 },
  modalFormScroll: { flexShrink: 1, minHeight: 0 },
  modalFormContent: { paddingBottom: 16 },
  floatingAddButton: { position: 'absolute', right: 20, width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.primary, borderWidth: 1, borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', zIndex: 4, ...SHADOWS.soft },
  reviseButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, marginTop: 12, borderRadius: 12, backgroundColor: COLORS.primaryLight },
  reviseButtonText: { color: COLORS.primary, fontSize: 14, fontWeight: '700' },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.background,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    position: 'relative',
    backgroundColor: COLORS.surface,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  headerCenter: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 12,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minWidth: 88,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    zIndex: 1,
    ...SHADOWS.soft,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12.5,
  },

  // ── Scroll ──────────────────────────────────────────────────────────────────
  scroll: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 24,
  },

  pageIntro: {
    minHeight: 112,
    justifyContent: 'center',
    paddingRight: 95,
    overflow: 'hidden',
    marginBottom: 16,
  },
  pageEyebrow: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 3,
  },
  pageTitle: {
    color: COLORS.textPrimary,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  pageSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
    maxWidth: 430,
  },

  loadErrorCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: 20,
    alignItems: 'center',
    ...SHADOWS.card,
  },
  loadErrorIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.dangerLight,
    marginBottom: 10,
  },
  loadErrorTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  loadErrorText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 5,
    maxWidth: 300,
  },
  retryBtn: {
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 16,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Stats bar ───────────────────────────────────────────────────────────────
  statsBar: {
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  statsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 12,
  },
  statsEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: COLORS.primary,
  },
  statsMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.border,
  },

  // ── Coordinator review status ────────────────────────────────────────────────
  reviewCard: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: COLORS.secondarySubtle,
    borderRadius: RADIUS.lg,
    padding: 13,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.secondaryLight,
  },
  reviewIconWrap: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  reviewCopy: {
    flex: 1,
    paddingRight: 18,
  },
  reviewTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 2,
  },
  reviewText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },

  // ── Section header ───────────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 0.1,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  // ── Empty state ──────────────────────────────────────────────────────────────
  emptyCard: {
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  emptyIconBg: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 260,
    marginBottom: 20,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: RADIUS.full,
    ...SHADOWS.soft,
  },
  emptyBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  // ── Entry card ───────────────────────────────────────────────────────────────
  entryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    marginBottom: 10,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  entryBody: {
    flex: 1,
    padding: 18,
  },
  entryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  entryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 3,
  },
  entryMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  entryMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  entryPreview: {
    fontSize: 12.5,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  expandedSection: {
    marginTop: 4,
  },
  expandedDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginBottom: 10,
  },
  noteBox: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 8,
  },
  noteLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1.1,
    marginBottom: 5,
  },
  noteText: {
    fontSize: 13,
    color: COLORS.textPrimary,
    lineHeight: 19,
  },
  rawNoteBox: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 8,
  },
  rawLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: COLORS.secondaryDark,
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  rawText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
  entryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  expandToggleText: {
    fontSize: 12,
    color: COLORS.secondary,
    fontWeight: '700',
  },

  // ── Attendance handoff ───────────────────────────────────────────────────────
  dtrCard: {
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 15,
    marginTop: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  dtrHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 11,
  },
  dtrIconWrap: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dtrTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  dtrTitleWrap: {
    flex: 1,
  },
  dtrSubtitle: {
    fontSize: 11.5,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  dtrNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceMuted,
    padding: 11,
  },
  dtrNoticeText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
  attendanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.secondaryLight,
    backgroundColor: COLORS.secondarySubtle,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    marginTop: 10,
  },
  attendanceBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.primary,
  },

  // ── Modal sheet ──────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    flexShrink: 1,
    minHeight: 0,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingBottom: 24,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '92%',
    ...SHADOWS.floating,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeader: {
    flexShrink: 0,
    minHeight: 105,
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    paddingBottom: 10,
    paddingTop: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  modalWeek: {
    fontSize: 12.5,
    color: COLORS.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Form fields ──────────────────────────────────────────────────────────────
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    backgroundColor: COLORS.background,
  },
  fieldInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  fieldUnit: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  textAreaWrap: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    height: 120,
  },
  textArea: {
    flex: 1,
    fontSize: 13.5,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },

  // ── Refine button ─────────────────────────────────────────────────────────────
  feedbackBox: { marginTop: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  feedbackTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: '#B45309', marginBottom: 4 },
  feedbackText: { fontSize: 13, lineHeight: 19, color: '#78350F' },
  revisionBox: { marginBottom: 14, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  revisionTitle: { fontSize: 13.5, fontWeight: '700', color: '#92400E' },
  revisionReason: { marginTop: 6, fontSize: 13, lineHeight: 19, color: '#78350F' },
  revisionHint: { marginTop: 8, fontSize: 12, fontWeight: '600', color: '#B45309' },
  revisionHintDone: { color: '#047857' },
  wordCount: { marginTop: 6, fontSize: 12, fontWeight: '600', color: '#B45309', textAlign: 'right' },
  wordCountOk: { color: '#047857' },
  aiConsentBox: { marginTop: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  aiConsentTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  aiConsentText: { fontSize: 12.5, lineHeight: 18, color: '#475569' },
  aiConsentActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  aiConsentCancel: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  aiConsentCancelText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  aiConsentSend: { flex: 1, height: 40, borderRadius: 10, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  aiConsentSendText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  aiErrorText: { marginTop: 8, fontSize: 12.5, color: '#B91C1C' },
  scheduleChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, marginTop: 6, maxWidth: '65%' },
  scheduleChipText: { fontSize: 12, fontWeight: '600', color: '#1D4ED8' },
  refineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 64,
    marginTop: 10,
  },
  checkNotesBtn: { backgroundColor: '#F0F7FF', borderColor: '#E0EDFF' },
  aiRefineBtn: { backgroundColor: '#F0F7FF', borderColor: '#E0EDFF' },
  assistCopy: { flex: 1, gap: 4 },
  checkNotesTitle: { color: '#17243C', fontSize: 13, fontWeight: '600' },
  aiRefineTitle: { color: '#17243C', fontSize: 13, fontWeight: '600' },
  assistCaption: { color: '#64748B', fontSize: 12, lineHeight: 17 },
  suggestionHint: { color: '#64748B', fontSize: 12, lineHeight: 18, marginBottom: 14 },
  tipsBox: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: '#FBF1D9', gap: 6 },
  tipsTitle: { color: '#7A4D00', fontSize: 13, fontWeight: '700' },
  tipRow: { flexDirection: 'row', gap: 8 },
  tipDot: { color: '#9A6200', fontSize: 13, lineHeight: 19 },
  tipText: { flex: 1, color: '#5C3B00', fontSize: 13, lineHeight: 19 },
  fieldMissing: { borderColor: '#B3261E', borderWidth: 1.5, backgroundColor: '#FDF3F2' },
  submitHint: { color: '#9A6200', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 4, marginBottom: -4 },
  suggestionActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  suggestionAction: { flex: 1, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#C9DAFA', backgroundColor: '#FFFFFF' },
  suggestionUse: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  suggestionActionText: { color: '#2563EB', fontSize: 13, fontWeight: '700' },
  discardSuggestionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#DBEAFE' },
  discardSuggestionText: { color: '#475569', fontSize: 13, fontWeight: '600' },
  refineBtnText: {
    color: COLORS.accentDark,
    fontWeight: '800',
    fontSize: 13,
  },
  refineOptional: {
    color: COLORS.textMuted,
    fontSize: 11.5,
    fontWeight: '500',
  },
  refinedBox: {
    backgroundColor: '#F8FBFF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: RADIUS.md,
    padding: 16,
    marginTop: 12,
  },
  refinedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  refinedLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1D4ED8',
    flex: 1,
  },
  refinedText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
  },

  // ── Modal action buttons ───────────────────────────────────────────────────────
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: 13.5,
  },
  submitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 13,
    ...SHADOWS.soft,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13.5,
  },
});
