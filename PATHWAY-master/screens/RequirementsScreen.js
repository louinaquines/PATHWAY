// screens/RequirementsScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { auth, db } from '../firebaseConfig';
import { BACKEND_URL, requestBackend } from '../services/backendApi';
import { uploadCloudinaryFile } from '../services/cloudinaryUpload';
import { signOut } from 'firebase/auth';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { COLORS, SHADOWS } from '../theme';
import { AppText as Text } from '../components/AppText';
import PathwayWatermark from '../components/PathwayWatermark';
import { MotionTouchableOpacity } from '../components/Motion';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import PathwayMark from '../components/PathwayMark';
import {
  MenuIcon,
  BellIcon,
  FileIcon,
  UploadCloudIcon,
  TrashIcon,
  RefreshIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ChevronIcon,
} from '../components/Icons';

// Default standard pre-deployment checklist as shown in Storyboard Figure 39
const DEFAULT_PREDEPLOYMENT_DOCS = [
  {
    id: 'application_form',
    label: 'Application Form',
    category: 'Pre-OJT',
    required: true,
    fileTypeHint: 'PDF or Word (Max 5MB)',
  },
  {
    id: 'updated_resume',
    label: 'Updated Resume',
    category: 'Pre-OJT',
    required: true,
    fileTypeHint: 'PDF or Word (Max 5MB)',
  },
  {
    id: 'medical_certificate',
    label: 'Medical Certificate',
    category: 'Pre-OJT',
    required: true,
    fileTypeHint: 'PDF or Image (Max 5MB)',
  },
  {
    id: 'endorsement_letter',
    label: 'Endorsement Letter',
    category: 'Pre-OJT',
    required: true,
    fileTypeHint: 'PDF or Word (Max 5MB)',
  },
  {
    id: 'signed_moa',
    label: 'Signed MOA',
    category: 'Pre-OJT',
    required: true,
    fileTypeHint: 'PDF Document (Max 5MB)',
  },
];

export default function RequirementsScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isNarrowScreen = width < 360;
  const isWideScreen = width >= 600;
  const contentPadding = isNarrowScreen ? 14 : isWideScreen ? 32 : 20;
  const stepItemWidth = isNarrowScreen ? 62 : isWideScreen ? 88 : 76;
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);
  const [expandedRequirementId, setExpandedRequirementId] = useState(null);
  const [requirementsEligible, setRequirementsEligible] = useState(false);
  const [activeStep, setActiveStep] = useState(1);

  const currentUser = auth?.currentUser;
  const uid = currentUser?.uid;

  const handleLogout = async () => {
    await signOut(auth);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  useEffect(() => {
    fetchRequirements();
  }, []);

  useEffect(() => {
    const handleHardwareBack = () => {
      if (showMenuDrawer) {
        setShowMenuDrawer(false);
        return true;
      }

      if (showNotifications) {
        setShowNotifications(false);
        return true;
      }

      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);
    return () => subscription.remove();
  }, [showMenuDrawer, showNotifications]);

  const fetchRequirements = async () => {
    setLoading(true);
    try {
      if (!uid) {
        setupDefaultState();
        return;
      }

      const userSnap = await getDoc(doc(db, 'users', uid));
      const userData = userSnap.data() || {};
      setRequirementsEligible(userData.requirementsStatus === 'approved');
      const saved = userData.requirements || {};

      let sectionReqs = [];
      const sectionId = userData.sectionId;
      if (sectionId) {
        try {
          const reqSnap = await getDocs(collection(db, 'sections', sectionId, 'requirements'));
          sectionReqs = reqSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (err) {
          console.warn('Section fetch fallback:', err);
        }
      }

      const baseList = sectionReqs.length > 0 ? sectionReqs : DEFAULT_PREDEPLOYMENT_DOCS;
      
      const merged = baseList.map((r) => {
        const userSaved = saved[r.id] || {};

        return {
          id: r.id,
          label: r.label || r.id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          category: r.category || 'Pre-OJT',
          required: r.required !== false,
          fileTypeHint: r.fileTypeHint || 'PDF or Word (Max 5MB)',
          status: userSaved.status || 'not_submitted',
          fileUrl: userSaved.fileUrl || null,
          fileName: userSaved.fileName || null,
          fileSize: userSaved.fileSize || null,
          submittedAt: userSaved.submittedAt || null,
          cloudinaryDeliveryType: userSaved.cloudinaryDeliveryType || null,
        };
      });

      setRequirements(merged);
    } catch (e) {
      console.error('Fetch error:', e);
      setupDefaultState();
    } finally {
      setLoading(false);
    }
  };

  const setupDefaultState = () => {
    const merged = DEFAULT_PREDEPLOYMENT_DOCS.map((r) => ({
        ...r,
        status: 'not_submitted',
        fileName: null,
        fileSize: null,
        submittedAt: null,
      }));
    setRequirements(merged);
  };

  const handleDownloadProtectedRequirement = async (docItem) => {
    setDownloadingId(docItem.id);
    let temporaryFileUri = null;
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in again.');
      const safeFileName = String(docItem.fileName || 'signed-endorsement-letter')
        .replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160) || 'signed-endorsement-letter';
      const downloadUrl = `${BACKEND_URL}/requirements/${encodeURIComponent(docItem.id)}/download`;
      const authorization = { Authorization: `Bearer ${await user.getIdToken()}` };

      if (Platform.OS === 'web') {
        const response = await fetch(downloadUrl, { headers: authorization });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || 'The protected file could not be downloaded.');
        }
        const objectUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = safeFileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
        return;
      }

      let androidDirectoryUri = null;
      if (Platform.OS === 'android') {
        const directoryPermission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!directoryPermission.granted || !directoryPermission.directoryUri) {
          Alert.alert('Save canceled', 'Choose a folder to save your signed copy.');
          return;
        }
        androidDirectoryUri = directoryPermission.directoryUri;
      }

      if (!FileSystem.cacheDirectory) throw new Error('Device storage is unavailable.');
      temporaryFileUri = `${FileSystem.cacheDirectory}pathway-protected-${Date.now()}-${safeFileName}`;
      const download = await FileSystem.downloadAsync(downloadUrl, temporaryFileUri, { headers: authorization, cache: false });
      if (download.status < 200 || download.status >= 300) {
        const errorText = await FileSystem.readAsStringAsync(download.uri).catch(() => '');
        let errorMessage = 'The protected file could not be downloaded.';
        try { errorMessage = JSON.parse(errorText).error || errorMessage; } catch (_) { /* response was not JSON */ }
        throw new Error(errorMessage);
      }

      const datedFileName = `PATHWAY-${new Date().toISOString().replace(/[:.]/g, '-')}-${safeFileName}`;
      if (Platform.OS === 'ios') {
        if (!FileSystem.documentDirectory) throw new Error('The Files location is unavailable.');
        const pathwayDirectory = `${FileSystem.documentDirectory}PATHWAY/`;
        const directoryInfo = await FileSystem.getInfoAsync(pathwayDirectory);
        if (!directoryInfo.exists) await FileSystem.makeDirectoryAsync(pathwayDirectory, { intermediates: true });
        await FileSystem.moveAsync({ from: download.uri, to: `${pathwayDirectory}${datedFileName}` });
        temporaryFileUri = null;
        Alert.alert('Saved to Files', `Your signed copy is in the PATHWAY app's Documents folder, visible in Files under On My iPhone.`);
      } else if (Platform.OS === 'android') {
        const extensionIndex = safeFileName.lastIndexOf('.');
        const extension = extensionIndex > 0 ? safeFileName.slice(extensionIndex + 1).toLowerCase() : '';
        const mimeTypes = {
          pdf: 'application/pdf',
          doc: 'application/msword',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
        };
        const fullOutputName = datedFileName;
        const outputExtensionIndex = fullOutputName.lastIndexOf('.');
        const outputBaseName = outputExtensionIndex > 0 ? fullOutputName.slice(0, outputExtensionIndex) : fullOutputName;
        const outputUri = await FileSystem.StorageAccessFramework.createFileAsync(
          androidDirectoryUri, outputBaseName, mimeTypes[extension] || 'application/octet-stream',
        );
        await FileSystem.copyAsync({ from: download.uri, to: outputUri });
        Alert.alert('Saved', 'Your signed copy was saved to the folder you selected.');
      } else {
        throw new Error('Saving protected documents is not supported on this device.');
      }
    } catch (error) {
      Alert.alert('Download Error', error.message || 'The protected file could not be downloaded.');
    } finally {
      if (temporaryFileUri) await FileSystem.deleteAsync(temporaryFileUri, { idempotent: true }).catch(() => {});
      setDownloadingId(null);
    }
  };

  const handlePickAndUpload = async (docItem) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      if (file.size && file.size > 5 * 1024 * 1024) {
        Alert.alert('File too large', 'Choose a document smaller than 5 MB.');
        return;
      }
      setUploadingId(docItem.id);
      if (!uid) throw new Error('Please sign in again.');
      const authorization = await requestBackend(`/requirements/${encodeURIComponent(docItem.id)}/upload-signature`);
      const uploaded = await uploadCloudinaryFile(file, authorization);
      const saved = await requestBackend(`/requirements/${encodeURIComponent(docItem.id)}`, {
        method: 'PUT', payload: { status: 'submitted', ...uploaded, fileName: file.name },
      });

      const updated = requirements.map(r =>
        r.id === docItem.id
          ? { ...r, status: 'submitted', fileUrl: saved.fileUrl, fileName: saved.fileName, fileSize: saved.fileSize, submittedAt: saved.submittedAt,
            cloudinaryDeliveryType: docItem.id === 'endorsement_letter' ? 'authenticated' : null }
          : r
      );
      setRequirements(updated);

      setUploadingId(null);

    } catch (e) {
      setUploadingId(null);
      Alert.alert('Upload Error', e.message || 'The file could not be uploaded. Please try again.');
    }
  };

  const handleDelete = (docItem) => {
    Alert.alert(
      'Remove Document',
      `Are you sure you want to remove "${docItem.fileName || docItem.label}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!uid) throw new Error('Please sign in again.');
              await requestBackend(`/requirements/${encodeURIComponent(docItem.id)}`, {
                method: 'PUT', payload: { status: 'not_submitted' },
              });
            } catch (error) {
              Alert.alert('Unable to remove document', error.message || 'Please try again.');
              return;
            }

            const updated = requirements.map(r =>
              r.id === docItem.id
                ? {
                    ...r,
                    status: 'not_submitted',
                    fileUrl: null,
                    fileName: null,
                    fileSize: null,
                    submittedAt: null,
                    cloudinaryDeliveryType: null,
                  }
                : r
            );
            setRequirements(updated);

          },
        },
      ]
    );
  };

  if (loading) {
    return <StudentScreenSkeleton variant="requirements" />;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      {/* ── Top Navigation Bar (Figure 39) ── */}
      <View style={[styles.topBar, isNarrowScreen && styles.topBarNarrow]}>
        <PathwayWatermark size={152} opacity={0.045} style={{ right: -47, top: -56 }} />
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setShowMenuDrawer(true)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <MenuIcon size={20} color={COLORS.primaryDark} />
        </TouchableOpacity>

        <PathwayMark size={isNarrowScreen ? 38 : 42} />

        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setShowNotifications(true)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <BellIcon size={21} color={COLORS.primaryDark} hasUnread={true} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: contentPadding,
            maxWidth: isWideScreen ? 680 : undefined,
            width: '100%',
            alignSelf: 'center',
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Section Header ── */}
        <View style={[styles.headerSection, isNarrowScreen && styles.headerSectionNarrow]}>
          <Text style={styles.subPipelineLabel}>Pre-deployment Pipeline</Text>
          <Text variant="heading" style={[styles.screenHeading, isNarrowScreen && styles.screenHeadingNarrow]}>Document Submission</Text>
        </View>

        {/* ── 4-Step Pipeline Stepper (Figure 39) ── */}
        <View style={styles.stepperContainer}>
          <View style={styles.stepTrack}>
            {/* Step 1 is the starting state, so no progress fill is shown yet. */}
          </View>

          <View style={styles.stepperRow}>
            {/* Step 1: Doc Submission */}
            <MotionTouchableOpacity style={[styles.stepItem, { width: stepItemWidth }]} onPress={() => setActiveStep(1)} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="Open document submission">
              <View style={[styles.stepCircle, styles.stepCircleActive]}>
                <Text style={styles.stepNumberActive}>1</Text>
              </View>
              <Text style={[styles.stepLabelActive, isNarrowScreen && styles.stepLabelNarrow]}>Doc Submission</Text>
            </MotionTouchableOpacity>

            {/* Step 2: Company */}
            <MotionTouchableOpacity
              style={[styles.stepItem, { width: stepItemWidth }]}
              onPress={() => {
                navigation.navigate('Company');
              }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Open company placement"
            >
              <View style={[styles.stepCircle, styles.stepCircleInactive]}>
                <Text style={styles.stepNumberInactive}>2</Text>
              </View>
              <Text style={[styles.stepLabelInactive, isNarrowScreen && styles.stepLabelNarrow]}>Company</Text>
            </MotionTouchableOpacity>

            {/* Step 3: Review */}
            <MotionTouchableOpacity style={[styles.stepItem, { width: stepItemWidth }]} onPress={() => navigation.navigate('Review')} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="Open review step">
              <View style={[styles.stepCircle, styles.stepCircleInactive]}>
                <Text style={styles.stepNumberInactive}>3</Text>
              </View>
              <Text style={[styles.stepLabelInactive, isNarrowScreen && styles.stepLabelNarrow]}>Review</Text>
            </MotionTouchableOpacity>

            {/* Step 4: Approved */}
            <MotionTouchableOpacity style={[styles.stepItem, { width: stepItemWidth }]} onPress={() => navigation.navigate('Approval')} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="Open approval step">
              <View style={[styles.stepCircle, styles.stepCircleInactive]}>
                <Text style={styles.stepNumberInactive}>4</Text>
              </View>
              <Text style={[styles.stepLabelInactive, isNarrowScreen && styles.stepLabelNarrow]}>Approval</Text>
            </MotionTouchableOpacity>
          </View>
        </View>

        {activeStep === 1 && <>
        {/* ── Document List Cards (Figure 39) ── */}
        <View style={styles.docsList}>
          {requirements.map((docItem) => {
            const isUploading = uploadingId === docItem.id;
            const isApproved = docItem.status === 'approved';
            const isRejected = docItem.status === 'rejected' || docItem.status === 'needs_revision';
            const isSubmitted = docItem.status === 'submitted' || isApproved || isRejected;
            const isNotSubmitted = !isSubmitted;

            return (
              <TouchableOpacity
                key={docItem.id}
                style={[styles.docCard, isNarrowScreen && styles.docCardNarrow]}
                onPress={() => setExpandedRequirementId(current => current === docItem.id ? null : docItem.id)}
                activeOpacity={0.92}
              >
                {/* Card Title & Status Badge Header */}
                <View style={styles.docHeaderRow}>
                  <Text style={styles.docTitle}>{docItem.label}</Text>

                  {isApproved && (
                    <View style={styles.verifiedBadge}>
                      <CheckCircleIcon size={13} color={COLORS.successDark} />
                      <Text style={styles.verifiedBadgeText}>Approved</Text>
                    </View>
                  )}

                  {docItem.status === 'submitted' && (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeIcon}>•</Text>
                      <Text style={styles.pendingBadgeText}>Pending Review</Text>
                    </View>
                  )}

                  {isRejected && (
                    <View style={styles.issueBadge}>
                      <AlertCircleIcon size={12} color={COLORS.danger} />
                      <Text style={styles.issueBadgeText}>{docItem.status === 'needs_revision' ? 'Update for New Placement' : 'Needs Resubmission'}</Text>
                    </View>
                  )}

                  {isNotSubmitted && (
                    <View style={styles.requiredBadge}>
                      <Text style={styles.requiredBadgeDot}>!</Text>
                      <Text style={styles.requiredBadgeText}>Required</Text>
                    </View>
                  )}

                  <ChevronIcon size={16} color={COLORS.textMuted} expanded={expandedRequirementId === docItem.id} />
                </View>

                {expandedRequirementId === docItem.id && isUploading && (
                  <View style={styles.uploadingBox}>
                    <ActivityIndicator size="small" color={COLORS.secondary} />
                    <Text style={styles.uploadingText}>Uploading file to secure vault...</Text>
                  </View>
                )}

                {/* ── State 2: Uploaded and awaiting coordinator review ── */}
                {expandedRequirementId === docItem.id && !isUploading && isSubmitted && (
                  <>
                    <View style={[styles.uploadedFileRow, isRejected && styles.uploadedFileRowIssue]}>
                      <View style={styles.fileIconContainer}>
                        <FileIcon size={22} color={COLORS.primary} />
                      </View>
                      <View style={styles.fileDetails}>
                        <Text style={styles.fileNameText} numberOfLines={1}>
                          {docItem.fileName || 'app_form_signed.pdf'}
                        </Text>
                        <Text style={styles.fileMetaText}>
                          {docItem.fileSize || '1.2 MB'} • Uploaded Today
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.trashAction}
                        onPress={() => handleDelete(docItem)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.7}
                      >
                        <TrashIcon size={18} color="#94A3B8" />
                      </TouchableOpacity>
                    </View>
                    {docItem.cloudinaryDeliveryType === 'authenticated' && Platform.OS === 'web' && (
                      <TouchableOpacity
                        style={[styles.resubmitButton, downloadingId === docItem.id && styles.downloadButtonDisabled]}
                        onPress={() => handleDownloadProtectedRequirement(docItem)}
                        disabled={downloadingId === docItem.id}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={`Download your protected ${docItem.label}`}
                      >
                        <FileIcon size={15} color={COLORS.secondary} />
                        <Text style={styles.resubmitButtonText}>
                          {downloadingId === docItem.id ? 'Preparing download…' : 'Download my signed copy'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {docItem.cloudinaryDeliveryType === 'authenticated' && Platform.OS !== 'web' && (
                      <TouchableOpacity
                        style={[styles.resubmitButton, downloadingId === docItem.id && styles.downloadButtonDisabled]}
                        onPress={() => handleDownloadProtectedRequirement(docItem)}
                        disabled={downloadingId === docItem.id}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={`Save your protected ${docItem.label} to this device`}
                      >
                        <FileIcon size={15} color={COLORS.secondary} />
                        <Text style={styles.resubmitButtonText}>
                          {downloadingId === docItem.id ? 'Saving signed copy…' : 'Save signed copy to device'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {isRejected && (
                      <TouchableOpacity
                        style={styles.resubmitButton}
                        onPress={() => handlePickAndUpload(docItem)}
                        activeOpacity={0.75}
                      >
                        <RefreshIcon size={16} color={COLORS.secondary} />
                        <Text style={styles.resubmitButtonText}>Upload Replacement</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}

                {/* ── State 3: Awaiting Upload ── */}
                {expandedRequirementId === docItem.id && !isUploading && isNotSubmitted && (
                  <>
                    <TouchableOpacity
                      style={styles.dropzoneContainer}
                      onPress={() => handlePickAndUpload(docItem)}
                      activeOpacity={0.75}
                    >
                      <UploadCloudIcon size={32} color={COLORS.secondary} />
                      <Text style={styles.dropzoneMainText}>
                        Submit a file
                      </Text>
                      <Text style={styles.dropzoneHintText}>
                        Tap to choose a document • {docItem.fileTypeHint}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.awaitingBadge}>
                      <Text style={styles.awaitingBadgeIcon}>•</Text>
                      <Text style={styles.awaitingBadgeText}>Not submitted</Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Footer Navigation / Submit Button ── */}
        <View style={styles.footerSection}>
          <MotionTouchableOpacity
            style={[styles.continueButton, isNarrowScreen && styles.continueButtonNarrow]}
            onPress={() => {
              Alert.alert(
                'Pre-deployment Checklist',
                'Your uploaded pre-deployment documents are saved. Would you like to proceed to Step 2 (Company Selection)?',
                [
                  { text: 'Stay Here', style: 'cancel' },
                  { text: 'Proceed to Step 2 →', onPress: () => navigation.navigate('Company') },
                ]
              );
            }}
            activeOpacity={0.88}
          >
            <Text style={[styles.continueButtonText, isNarrowScreen && styles.continueButtonTextNarrow]}>Save & Proceed to Next Step →</Text>
          </MotionTouchableOpacity>
        </View>
        </>}

        {activeStep === 3 && <View style={styles.comingSoonCard}><AlertCircleIcon size={30} color={COLORS.secondary} /><Text style={styles.comingSoonTitle}>Review step coming soon</Text><Text style={styles.comingSoonText}>The review interface will be added after the company placement workflow is complete.</Text></View>}
        {activeStep === 4 && <View style={styles.comingSoonCard}><CheckCircleIcon size={30} color={COLORS.secondary} /><Text style={styles.comingSoonTitle}>Approval step coming soon</Text><Text style={styles.comingSoonText}>The approval interface is not available yet. Your coordinator will continue reviewing your submitted records.</Text></View>}
      </ScrollView>

      {/* ── Notifications Modal ── */}
      <Modal
        visible={showNotifications}
        animationType="slide"
        transparent
        onRequestClose={() => setShowNotifications(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotifications(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 340 }}>
              <View style={styles.notifItem}>
                <Text style={styles.notifTitle}>Document review status</Text>
                <Text style={styles.notifMsg}>Submitted documents are reviewed by your coordinator. You will see the decision here.</Text>
                <Text style={styles.notifTime}>Current</Text>
              </View>
              <View style={styles.notifItem}>
                <Text style={styles.notifTitle}>Pre-deployment Advisory</Text>
                <Text style={styles.notifMsg}>Ensure all 5 requirements are submitted before starting your OJT deployment.</Text>
                <Text style={styles.notifTime}>Yesterday</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Sidebar Navigation Drawer Modal ── */}
      <Modal
        visible={showMenuDrawer}
        animationType="fade"
        transparent
        onRequestClose={() => setShowMenuDrawer(false)}
      >
        <View style={styles.drawerOverlay}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close navigation menu"
            style={styles.drawerBackdrop}
            onPress={() => setShowMenuDrawer(false)}
            activeOpacity={1}
          />
          <View style={[
            styles.drawerCard,
            isNarrowScreen && styles.drawerCardNarrow,
            isWideScreen && styles.drawerCardWide,
          ]}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerAvatar}>
                <Text style={styles.drawerAvatarLetter}>P</Text>
              </View>
              <Text style={styles.drawerTitle}>PATHWAY</Text>
              <Text style={styles.drawerSubtitle}>OJT Management System</Text>
            </View>

            <TouchableOpacity
              style={styles.drawerLogoutBtn}
              onPress={handleLogout}
            >
              <Text style={styles.drawerLogoutBtnText}>Log out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  /* Top Navigation Bar */
  topBar: {
    height: Platform.OS === 'ios' ? 94 : 64,
    paddingTop: Platform.OS === 'ios' ? 44 : 12,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...SHADOWS.soft,
  },
  topBarNarrow: {
    paddingHorizontal: 14,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 2.5,
  },
  brandTitleNarrow: {
    fontSize: 16,
    letterSpacing: 1.8,
  },

  scrollContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },

  /* Header Section */
  headerSection: {
    marginBottom: 20,
  },
  headerSectionNarrow: {
    marginBottom: 16,
  },
  subPipelineLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.secondary,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  screenHeading: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  screenHeadingNarrow: {
    fontSize: 22,
  },

  /* ── Four-Step Stepper (Figure 39) ── */
  stepperContainer: {
    marginBottom: 24,
    position: 'relative',
  },
  stepTrack: {
    position: 'absolute',
    top: 16,
    left: '12%',
    right: '12%',
    height: 3,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
  },
  stepTrackLine: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  stepItem: {
    alignItems: 'center',
    width: 76,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    backgroundColor: '#FFFFFF',
  },
  stepCircleActive: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: '#FFFFFF',
  },
  stepNumberActive: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
  },
  stepLabelActive: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    textAlign: 'center',
  },
  stepCircleInactive: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  stepNumberInactive: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  stepLabelInactive: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94A3B8',
    textAlign: 'center',
  },
  stepLabelNarrow: {
    fontSize: 10,
  },

  /* ── Document List Cards ── */
  docsList: {
    gap: 16,
  },
  comingSoonCard: {
    backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 28,
    alignItems: 'center', marginTop: 8, ...SHADOWS.card,
  },
  comingSoonTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  comingSoonText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  docCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.card,
  },
  docCardNarrow: {
    padding: 14,
    borderRadius: 15,
  },
  docHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  docTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
  },

  /* Badges */
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
  },
  verifiedBadgeIcon: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0284C7',
  },
  verifiedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },

  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF9C3',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
  },
  pendingBadgeIcon: {
    fontSize: 16,
    lineHeight: 12,
    fontWeight: '900',
    color: '#A16207',
  },
  pendingBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A16207',
  },

  issueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 5,
  },
  issueBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
  },

  requiredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
  },
  requiredBadgeDot: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0284C7',
  },
  requiredBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },

  /* Uploading State */
  uploadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    gap: 10,
  },
  uploadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  /* Uploaded File Row */
  uploadedFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    marginBottom: 10,
  },
  uploadedFileRowIssue: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FECACA',
  },
  fileIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fileDetails: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  fileNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  fileMetaText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  trashAction: {
    padding: 8,
  },
  refreshAction: {
    padding: 8,
  },

  resubmitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
  },
  resubmitButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  downloadButtonDisabled: {
    opacity: 0.55,
  },

  /* Dropzone Container */
  dropzoneContainer: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 14,
    backgroundColor: '#FAFCFF',
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  dropzoneMainText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 8,
  },
  dropzoneHintText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  /* Awaiting Upload status */
  awaitingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  awaitingBadgeIcon: {
    fontSize: 11,
  },
  awaitingBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },

  /* Footer & Continue */
  footerSection: {
    marginTop: 24,
    marginBottom: 20,
  },
  continueButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
  },
  continueButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  continueButtonNarrow: {
    paddingVertical: 14,
  },
  continueButtonTextNarrow: {
    fontSize: 14,
  },

  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMuted,
    padding: 4,
  },

  notifItem: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.secondary,
    marginBottom: 10,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  notifMsg: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 3,
    lineHeight: 17,
  },
  notifTime: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 5,
  },

  /* Drawer Modal */
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    flexDirection: 'row',
  },
  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  drawerCard: {
    width: '75%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 30,
  },
  drawerCardNarrow: {
    width: '86%',
    paddingHorizontal: 20,
  },
  drawerCardWide: {
    width: 360,
  },
  drawerHeader: {
    marginBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 20,
  },
  drawerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  drawerAvatarLetter: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  drawerSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  drawerItems: {
    gap: 8,
    flex: 1,
  },
  drawerLogoutBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  drawerLogoutBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  drawerLink: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  drawerLinkActive: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F0F9FF',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.secondary,
  },
  drawerLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  drawerLinkTextActive: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  drawerCloseBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  drawerCloseBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
});
