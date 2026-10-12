// screens/LogbookScreen.js
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Modal from '../components/BackdropModal';
import { collection, addDoc, doc, runTransaction, query, orderBy, getCountFromServer, getAggregateFromServer, sum, where } from 'firebase/firestore';
import { readRecordPage, mergeRecords } from '../services/recordPagination';
import { logbookLoadErrorMessage } from '../services/logbookLoadError';
import LoadMore from '../components/LoadMore';
import { showStudentSuccess } from '../services/studentSuccess';
import { auth, db } from '../firebaseConfig';
import { postBackend } from '../services/backendApi';
import { studentAlert as Alert } from '../services/studentAlert';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { MotionTouchableOpacity } from '../components/Motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import ScrollView from '../components/RefreshableScrollView';
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
  CalendarIcon,
  ArrowRightIcon,
  InfoIcon,
} from '../components/Icons';

// ─── Status configuration ───────────────────────────────────────────────────
const STATUS_CONFIG = {
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

function getWeekRange(date) {
  const d = new Date(date);
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = dt => dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

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
function LogEntryCard({ entry, isExpanded, onToggle, onRevise }) {
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
              Week {entry.weekNum} — {entry.weekRange}
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

        {/* Bottom row: expand toggle */}
        {entry.status === 'rejected' && (
          <MotionTouchableOpacity onPress={event => { event.stopPropagation(); onRevise(entry); }} accessibilityRole="button" accessibilityLabel={`Edit and resubmit Week ${entry.weekNum}`} style={styles.reviseButton}>
            <Text style={styles.reviseButtonText}>Edit and resubmit</Text>
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
  const currentDraft = useRef({});
  currentDraft.current = { rawNotes, editingEntry, modal };
  const aiInFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [pageState, setPageState] = useState({ cursor: null, hasMore: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState('');
  const [summary, setSummary] = useState({ count: 0, hours: 0, pending: 0, approved: 0, rejected: 0 });

  const uid = auth.currentUser.uid;

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
      Alert.alert('No notes yet', 'Write your weekly notes first.');
      return;
    }
    const warnings = [];
    if (rawNotes.trim().split(/\s+/).length < 20) warnings.push('Check that your activities and learning are described.');
    if (!Number.isFinite(Number(hours)) || Number(hours) <= 0 || Number(hours) > 168) warnings.push('Enter weekly hours from 1 to 168.');
    Alert.alert('Notes checklist', (warnings.length ? warnings.join('\n\n') : 'No basic warnings found.') + '\n\nCheck your week, activities, learning and hours before submitting. Your notes are not rewritten or approved.');
  };

  const requestAiRefinement = () => {
    if (!rawNotes.trim() || rawNotes.length > 8000) return Alert.alert('Notes required', 'Enter notes up to 8,000 characters first.');
    if (aiInFlight.current || saving) return;
    const draft = { rawNotes, editingEntry };
    Alert.alert('Optional AI assistance', 'These notes will be sent to Anthropic. Remove personal or confidential company information first. AI can make mistakes; review the suggestion before using it. Your original notes are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send notes', onPress: async () => {
        if (aiInFlight.current || currentDraft.current.rawNotes !== draft.rawNotes || currentDraft.current.editingEntry !== draft.editingEntry || !currentDraft.current.modal) return;
        aiInFlight.current = true;
        setRefining(true);
        try {
          const result = await postBackend('/refine-logbook', { notes: draft.rawNotes, consent: true });
          if (typeof result.refined !== 'string' || !result.refined.trim() || result.refined.length > 8000) throw new Error('No usable AI suggestion returned.');
          if (currentDraft.current.rawNotes === draft.rawNotes && currentDraft.current.editingEntry === draft.editingEntry && currentDraft.current.modal) setRefined(result.refined);
        } catch (error) { Alert.alert('AI unavailable', `${error.message}\n\nYou can still use Check notes and submit your original notes.`); }
        finally { aiInFlight.current = false; setRefining(false); }
      } },
    ]);
  };

  const handleSubmit = async () => {
    if (saving || refining) return;
    if (!rawNotes.trim()) {
      Alert.alert('Notes required', 'Enter your weekly notes before submitting.');
      return;
    }
    if (!hours || !Number.isFinite(+hours) || +hours <= 0 || +hours > 168) {
      Alert.alert('Invalid hours', 'Enter weekly hours greater than 0 and no more than 168.');
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
      if (editingEntry) {
        await runTransaction(db, async transaction => {
          const entryRef = doc(db, 'users', uid, 'logbook', editingEntry.id);
          const [profile, current] = await Promise.all([transaction.get(doc(db, 'users', uid)), transaction.get(entryRef)]);
          if (profile.data()?.clearanceStatus === 'cleared') throw new Error('Cleared OJT records are locked.');
          if (!current.exists() || current.data().status !== 'rejected') throw new Error('This entry is no longer available for revision. Reopen Logbook to refresh it.');
          transaction.update(entryRef, content);
        });
      } else await addDoc(collection(db, 'users', uid, 'logbook'), {
        ...content,
        weekNum: summary.count + 1,
        weekRange: getWeekRange(new Date()),
        createdAt: new Date().toISOString(),
      });
      setModal(false);
      showStudentSuccess(editingEntry ? 'Logbook resubmitted' : 'Logbook submitted', 'Your entry was saved and is ready for coordinator review.');
      setEditingEntry(null);
      setRawNotes('');
      setHours('');
      setRefined('');
      fetchEntries();
    } catch (e) {
      Alert.alert('Could not submit', e.message || 'Failed to submit logbook entry. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    if (saving) return;
    setEditingEntry(null);
    setModal(false);
    setRawNotes('');
    setHours('');
    setRefined('');
  };

  const reviseEntry = entry => {
    setEditingEntry(entry);
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

        <View style={styles.pageIntro}>
          <Text style={styles.pageEyebrow}>WEEKLY JOURNAL</Text>
          <Text variant="heading" style={styles.pageTitle}>Your logbook</Text>
          <Text style={styles.pageSubtitle}>Submit weekly reports and check their status.</Text>
        </View>

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
          <Text style={styles.sectionTitle}>Weekly Entries</Text>
          <Text style={styles.sectionCount}>{summary.count} logs</Text>
        </View>

        {/* ── Empty state ── */}
        {entries.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconBg}>
              <LogbookIcon size={34} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>No Log Entries Yet</Text>
            <Text style={styles.emptySub}>
              Add a weekly report with your hours, tasks, and key takeaways. Your coordinator will review it after submission.
            </Text>
            <MotionTouchableOpacity
              style={styles.emptyBtn}
              onPress={() => setModal(true)}
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
          />
        ))}
        <LoadMore onPress={loadMoreEntries} loading={loadingMore} hasMore={pageState.hasMore} error={pageError} />

        {/* ── Attendance handoff ── */}
        <View style={styles.dtrCard}>
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
            <Text style={styles.dtrNoticeText}>DTR uploads are not available. Record attendance in Logs.</Text>
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
        onPress={() => setModal(true)}
        style={[styles.floatingAddButton, { bottom: 40 + insets.bottom }]}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Add new log entry"
      >
        <PlusIcon size={27} color="#FFFFFF" />
      </MotionTouchableOpacity>
      <Modal visible={modal} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>

            {/* Modal drag handle */}
            <View style={styles.sheetHandle} />

            {/* Modal header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{editingEntry ? `Revise Week ${editingEntry.weekNum}` : 'New Weekly Entry'}</Text>
                <Text style={styles.modalWeek}>
                  Week {summary.count + 1}  ·  {getWeekRange(new Date())}
                </Text>
              </View>
              <TouchableOpacity onPress={closeModal} style={styles.modalCloseBtn} activeOpacity={0.7}>
                <CloseIcon size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Hours input */}
              <Text style={styles.fieldLabel}>Hours Rendered This Week</Text>
              <View style={styles.fieldWrap}>
                <ClockIcon size={16} color={COLORS.textMuted} />
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. 40"
                  placeholderTextColor={COLORS.textPlaceholder}
                  value={hours}
                  onChangeText={setHours}
                  keyboardType="numeric"
                />
                <Text style={styles.fieldUnit}>hrs</Text>
              </View>

              {/* Notes input */}
              <Text style={styles.fieldLabel}>Weekly Activities & Tasks</Text>
              <View style={[styles.fieldWrap, styles.textAreaWrap]}>
                <TextInput
                  style={styles.textArea}
                  placeholder="Describe what you accomplished this week (e.g. Configured database, attended stand-up meetings, completed onboarding)..."
                  placeholderTextColor={COLORS.textPlaceholder}
                  value={rawNotes}
                  onChangeText={value => { setRawNotes(value); setRefined(''); }}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              {/* AI Refine button */}
              <TouchableOpacity
                style={[styles.refineBtn, styles.checkNotesBtn, (refining || saving) && { opacity: 0.6 }]}
                onPress={checkNotes}
                disabled={refining || saving}
                activeOpacity={0.85}
              >
                {refining ? (
                  <ActivityIndicator color={COLORS.accentDark} size="small" />
                ) : (
                  <>
                    <CheckCircleIcon size={20} color="#475569" />
                    <View style={styles.assistCopy}>
                      <Text style={styles.checkNotesTitle}>Check notes</Text>
                      <Text style={styles.assistCaption}>Quick check · no AI request</Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>

              {/* Refined output */}
              <TouchableOpacity style={[styles.refineBtn, styles.aiRefineBtn, (refining || saving) && { opacity: 0.6 }]} onPress={requestAiRefinement} disabled={refining || saving} accessibilityLabel="Request optional AI journal refinement" accessibilityRole="button" accessibilityState={{ disabled: refining || saving, busy: refining }}>
                {refining ? <ActivityIndicator size="small" color="#2563EB" /> : <SparklesIcon size={20} color="#2563EB" />}
                <View style={styles.assistCopy}>
                  <Text style={styles.aiRefineTitle}>{refining ? 'Generating suggestion…' : 'Refine with AI'}</Text>
                  <Text style={styles.assistCaption}>Optional · powered by Anthropic</Text>
                </View>
                {!refining && <ArrowRightIcon size={18} color="#2563EB" />}
              </TouchableOpacity>
              {refined ? (
                <View style={styles.refinedBox}>
                  <View style={styles.refinedHeaderRow}>
                    <SparklesIcon size={18} color="#2563EB" />
                    <Text style={styles.refinedLabel}>AI suggestion</Text>
                  </View>
                  <Text style={styles.suggestionHint}>Review for accuracy before submitting. Your original notes are unchanged.</Text>
                  <Text style={styles.refinedText}>{refined}</Text>
                  <TouchableOpacity style={styles.discardSuggestionBtn} onPress={() => setRefined('')} disabled={saving || refining} accessibilityLabel="Discard AI suggestion and use original notes" accessibilityRole="button">
                    <CloseIcon size={16} color="#475569" />
                    <Text style={styles.discardSuggestionText}>Discard suggestion</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

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

                <MotionTouchableOpacity
                  style={[
                    styles.submitBtn,
                    (saving || !rawNotes.trim() || !hours) && { opacity: 0.45 },
                  ]}
                  onPress={handleSubmit}
                  disabled={saving || !rawNotes.trim() || !hours}
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Text style={styles.submitBtnText}>{editingEntry ? 'Resubmit entry' : 'Submit Log'}</Text>
                      <ArrowRightIcon size={15} color="#fff" />
                    </>
                  )}
                </MotionTouchableOpacity>
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
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
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
    color: COLORS.textMuted,
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
  },
  reviewTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.textPrimary,
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
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: 32,
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
    fontSize: 17,
    fontWeight: '800',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
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
  checkNotesBtn: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
  aiRefineBtn: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  assistCopy: { flex: 1, gap: 4 },
  checkNotesTitle: { color: '#334155', fontSize: 14, fontWeight: '700' },
  aiRefineTitle: { color: '#1D4ED8', fontSize: 14, fontWeight: '700' },
  assistCaption: { color: '#64748B', fontSize: 12, lineHeight: 17 },
  suggestionHint: { color: '#64748B', fontSize: 12, lineHeight: 18, marginBottom: 14 },
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
    flex: 1.5,
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
