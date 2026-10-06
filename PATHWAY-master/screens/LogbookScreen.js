// screens/LogbookScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { collection, addDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { postBackend } from '../services/backendApi';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { MotionTouchableOpacity } from '../components/Motion';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
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
function ReviewStatusCard({ entries }) {
  const pendingCount = entries.filter(entry => entry.status === 'pending').length;
  const revisionCount = entries.filter(entry => entry.status === 'rejected').length;
  const approvedCount = entries.filter(entry => entry.status === 'approved').length;

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
  } else if (entries.length > 0 && approvedCount === entries.length) {
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
function LogEntryCard({ entry, isExpanded, onToggle }) {
  const config = STATUS_CONFIG[entry.status] || STATUS_CONFIG.pending;
  const preview = (entry.refined || entry.rawNotes || '').slice(0, 90);

  return (
    <TouchableOpacity
      style={styles.entryCard}
      onPress={onToggle}
      activeOpacity={0.88}
    >
      {/* Left accent bar */}
      <View style={[styles.entryAccent, { backgroundColor: config.dot }]} />

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
              <View style={styles.metaDot} />
              <ClockIcon size={11} color={COLORS.textMuted} />
              <Text style={styles.entryMeta}>{entry.hours} hrs</Text>
            </View>
          </View>

          {/* Status badge */}
          <View style={[styles.statusBadge, { backgroundColor: config.bg, borderColor: config.border }]}>
            <View style={[styles.statusDot, { backgroundColor: config.dot }]} />
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
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modal, setModal] = useState(false);
  const [rawNotes, setRawNotes] = useState('');
  const [hours, setHours] = useState('');
  const [refining, setRefining] = useState(false);
  const [refined, setRefined] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const uid = auth.currentUser.uid;

  useEffect(() => { fetchEntries(); }, []);

  const fetchEntries = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const q = query(collection(db, 'users', uid, 'logbook'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('Fetch logbook entries error:', e);
      setLoadError('Your logbook entries could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const refineWithAI = async () => {
    if (!rawNotes.trim()) {
      Alert.alert('Nothing to refine', 'Write your weekly notes first.');
      return;
    }
    setRefining(true);
    try {
      const data = await postBackend('/refine-logbook', { notes: rawNotes });
      setRefined(data.refined || '');
    } catch (e) {
      Alert.alert('AI Refinement', 'Could not connect to AI. You may submit your original notes directly.');
    } finally {
      setRefining(false);
    }
  };

  const handleSubmit = async () => {
    if (!rawNotes.trim()) {
      Alert.alert('Missing Notes', 'Write your weekly work notes before submitting.');
      return;
    }
    if (!hours || isNaN(hours) || +hours <= 0) {
      Alert.alert('Invalid Hours', 'Enter the valid number of hours completed this week.');
      return;
    }
    setSaving(true);
    try {
      const weekNum = entries.length + 1;
      const entryText = refined.trim() || rawNotes.trim();
      await addDoc(collection(db, 'users', uid, 'logbook'), {
        weekNum,
        weekRange: getWeekRange(new Date()),
        rawNotes: rawNotes.trim(),
        refined: entryText,
        aiRefined: Boolean(refined.trim()),
        hours: +hours,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      setModal(false);
      setRawNotes('');
      setHours('');
      setRefined('');
      fetchEntries();
    } catch (e) {
      Alert.alert('Error', 'Failed to submit logbook entry. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setModal(false);
    setRawNotes('');
    setHours('');
    setRefined('');
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

        <MotionTouchableOpacity
          onPress={() => setModal(true)}
          style={styles.addBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Add new log entry"
        >
          <PlusIcon size={15} color="#FFFFFF" />
          <Text style={styles.addBtnText}>New Log</Text>
        </MotionTouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.pageIntro}>
          <Text style={styles.pageEyebrow}>WEEKLY JOURNAL</Text>
          <Text variant="heading" style={styles.pageTitle}>Your logbook</Text>
          <Text style={styles.pageSubtitle}>Record your work and track each report through coordinator review.</Text>
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
              <Text style={styles.statValue}>{entries.length}</Text>
              <Text style={styles.statLabel}>Entries</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {entries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0).toFixed(1).replace(/\.0$/, '')}
              </Text>
              <Text style={styles.statLabel}>Hours logged</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: COLORS.successDark }]}>
                {entries.filter(entry => entry.status === 'approved').length}
              </Text>
              <Text style={styles.statLabel}>Approved</Text>
            </View>
          </View>
        </View>

        {/* ── Coordinator review status ── */}
        <ReviewStatusCard entries={entries} />

        {/* ── Entries section header ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Weekly Entries</Text>
          <Text style={styles.sectionCount}>{entries.length} logs</Text>
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
          />
        ))}

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
            <Text style={styles.dtrNoticeText}>DTR file upload and automated verification aren’t available yet. Record your daily attendance in the Logs screen.</Text>
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
      <Modal visible={modal} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>

            {/* Modal drag handle */}
            <View style={styles.sheetHandle} />

            {/* Modal header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>New Weekly Entry</Text>
                <Text style={styles.modalWeek}>
                  Week {entries.length + 1}  ·  {getWeekRange(new Date())}
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
                  onChangeText={setRawNotes}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              {/* AI Refine button */}
              <TouchableOpacity
                style={[styles.refineBtn, refining && { opacity: 0.6 }]}
                onPress={refineWithAI}
                disabled={refining || saving}
                activeOpacity={0.85}
              >
                {refining ? (
                  <ActivityIndicator color={COLORS.accentDark} size="small" />
                ) : (
                  <>
                    <SparklesIcon size={15} color={COLORS.accent} />
                    <Text style={styles.refineBtnText}>Polish with AI Assistant</Text>
                    <Text style={styles.refineOptional}>(Optional)</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Refined output */}
              {refined ? (
                <View style={styles.refinedBox}>
                  <View style={styles.refinedHeaderRow}>
                    <SparklesIcon size={13} color={COLORS.successDark} />
                    <Text style={styles.refinedLabel}>AI POLISHED VERSION</Text>
                  </View>
                  <Text style={styles.refinedText}>{refined}</Text>
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
                      <Text style={styles.submitBtnText}>Submit Log</Text>
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
    paddingTop: Platform.OS === 'ios' ? 50 : 18,
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
    top: Platform.OS === 'ios' ? 50 : 18,
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
    ...SHADOWS.soft,
  },
  entryAccent: {
    width: 4,
    borderTopLeftRadius: RADIUS.lg,
    borderBottomLeftRadius: RADIUS.lg,
  },
  entryBody: {
    flex: 1,
    padding: 14,
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
    alignItems: 'center',
    gap: 4,
  },
  entryMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.textMuted,
    marginHorizontal: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
    borderLeftWidth: 3,
    borderLeftColor: COLORS.secondary,
    paddingLeft: 10,
    paddingVertical: 6,
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
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    marginTop: 14,
  },
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
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: RADIUS.md,
    padding: 13,
    marginTop: 12,
  },
  refinedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  refinedLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.successDark,
    letterSpacing: 1,
  },
  refinedText: {
    fontSize: 13,
    color: '#166534',
    lineHeight: 19,
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
