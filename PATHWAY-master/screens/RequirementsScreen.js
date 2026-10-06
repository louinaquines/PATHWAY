// screens/RequirementsScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Platform,
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { auth, db } from '../firebaseConfig';
import { BACKEND_URL, requestBackend } from '../services/backendApi';
import { uploadCloudinaryFile } from '../services/cloudinaryUpload';
import { studentAlert as Alert } from '../services/studentAlert';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { COLORS, SHADOWS } from '../theme';
import { AppText as Text } from '../components/AppText';
import { MotionTouchableOpacity } from '../components/Motion';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import StudentLogoutScreen from '../components/StudentLogoutScreen';
import useStudentLogout from '../hooks/useStudentLogout';
import PreDeploymentDrawer from '../components/PreDeploymentDrawer';
import PreDeploymentTopBar from '../components/PreDeploymentTopBar';
import PreDeploymentStepper from '../components/PreDeploymentStepper';
import PreDeploymentNotificationsSheet from '../components/PreDeploymentNotificationsSheet';
import {
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
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const { loggingOut, logout } = useStudentLogout(navigation);
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);
  const [expandedRequirementId, setExpandedRequirementId] = useState(null);
  const [requirementsEligible, setRequirementsEligible] = useState(false);
  const [activeStep, setActiveStep] = useState(1);

  const currentUser = auth?.currentUser;
  const uid = currentUser?.uid;

  const handleLogout = logout;

  useEffect(() => {
    fetchRequirements();
    return navigation.addListener('focus', fetchRequirements);
  }, [navigation, uid]);

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

  const requiredRequirements = requirements.filter(item => item.required !== false);
  const requiredCount = requiredRequirements.length;
  const approvedCount = requiredRequirements.filter(item => item.status === 'approved').length;
  const inReviewCount = requiredRequirements.filter(item => item.status === 'submitted').length;
  const receivedCount = approvedCount + inReviewCount;
  const progressPercent = requiredCount ? Math.round((receivedCount / requiredCount) * 100) : 0;

  if (loggingOut) {
    return <StudentLogoutScreen />;
  }

  if (loading) {
    return <StudentScreenSkeleton variant="requirements" />;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      <PreDeploymentTopBar
        onMenuPress={() => setShowMenuDrawer(true)}
        onNotificationsPress={() => setShowNotifications(true)}
      />

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
        {/* Page introduction */}
        <View style={[styles.headerSection, isNarrowScreen && styles.headerSectionNarrow]}>
          <View style={styles.headerMetaRow}>
            <Text style={styles.subPipelineLabel}>PRE-DEPLOYMENT</Text>
            <View style={styles.stageBadge}>
              <Text style={styles.stageBadgeText}>STEP 01 / 04</Text>
            </View>
          </View>
          <Text variant="heading" style={[styles.screenHeading, isNarrowScreen && styles.screenHeadingNarrow]}>Document Submission</Text>
          <Text style={styles.headerDescription}>Your required forms, all in one place.</Text>
        </View>

        <PreDeploymentStepper
          activeStep={1}
          onStepPress={step => {
            if (step === 1) setActiveStep(1);
            if (step === 2) navigation.navigate('Company');
            if (step === 3) navigation.navigate('Review');
            if (step === 4) navigation.navigate('Approval');
          }}
        />

        {activeStep === 1 && <>
          <View style={styles.checklistCard}>
            <View style={styles.checklistTopRow}>
              <View style={styles.checklistIcon}>
                <FileIcon size={18} color={COLORS.primary} />
              </View>
              <View style={styles.checklistCopy}>
                <Text style={styles.checklistTitle}>Required documents</Text>
                <Text style={styles.checklistSubtitle}>{receivedCount} of {requiredCount} received</Text>
              </View>
              <View style={styles.progressValuePill}>
                <Text style={styles.checklistPercent}>{progressPercent}%</Text>
              </View>
            </View>
            <View
              style={styles.progressTrack}
              accessibilityRole="progressbar"
              accessibilityLabel="Required documents received"
              accessibilityValue={{ min: 0, max: 100, now: progressPercent }}
            >
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
          <Text style={styles.checklistFootnote}>
              {requiredCount === 0
                ? 'No required documents have been assigned yet.'
                : receivedCount === requiredCount
                  ? 'All required documents are with your coordinator.'
                  : `${approvedCount} approved${inReviewCount ? ` · ${inReviewCount} in review` : ''} · ${Math.max(requiredCount - receivedCount, 0)} to submit`}
            </Text>
          </View>

        <View style={styles.documentsHeading}>
            <View>
              <Text style={styles.documentsTitle}>Your documents</Text>
              <Text style={styles.documentsSubtitle}>Tap an item to upload or review its status.</Text>
            </View>
            <Text style={styles.documentsCount}>{requirements.length} items</Text>
          </View>
        </>}

        {activeStep === 1 && <>
        {/* ── Document List Cards (Figure 39) ── */}
        <View style={styles.docsList}>
          {requirements.map((docItem) => {
            const isUploading = uploadingId === docItem.id;
            const isApproved = docItem.status === 'approved';
            const isRejected = docItem.status === 'rejected' || docItem.status === 'needs_revision';
            const isSubmitted = docItem.status === 'submitted' || isApproved || isRejected;
            const isNotSubmitted = !isSubmitted;
            const isExpanded = expandedRequirementId === docItem.id;
            const headerDescription = isRejected
              ? 'An updated file is needed'
              : isApproved
                ? (docItem.fileName || 'Approved by your coordinator')
                : isSubmitted
                  ? (docItem.fileName || 'Waiting for coordinator review')
                  : docItem.fileTypeHint;

            return (
              <TouchableOpacity
                key={docItem.id}
                style={[styles.docCard, isNarrowScreen && styles.docCardNarrow, isExpanded && styles.docCardExpanded]}
                onPress={() => setExpandedRequirementId(current => current === docItem.id ? null : docItem.id)}
                activeOpacity={0.92}
                accessibilityRole="button"
                accessibilityState={{ expanded: isExpanded }}
                accessibilityLabel={`${docItem.label}. ${isApproved ? 'Approved' : isRejected ? 'Action needed' : isSubmitted ? 'In review' : 'Required'}. ${isExpanded ? 'Tap to collapse.' : 'Tap to expand.'}`}
              >
                {/* Card Title & Status Badge Header */}
                <View style={[styles.docHeaderRow, isExpanded && styles.docHeaderExpanded]}>
                  <View style={[
                    styles.docStatusIcon,
                    isApproved && styles.docStatusIconApproved,
                    isRejected && styles.docStatusIconIssue,
                    docItem.status === 'submitted' && styles.docStatusIconReview,
                  ]}>
                    {isApproved
                      ? <CheckCircleIcon size={18} color={COLORS.successDark} />
                      : isRejected
                        ? <AlertCircleIcon size={18} color={COLORS.dangerDark} />
                        : <FileIcon size={18} color={COLORS.primary} />}
                  </View>

                  <View style={styles.docHeaderCopy}>
                    <Text style={styles.docTitle} numberOfLines={1}>{docItem.label}</Text>
                    <Text style={styles.docSubtitle} numberOfLines={1}>{headerDescription}</Text>
                  </View>

                  {isApproved && (
                    <View style={styles.verifiedBadge}>
                      <CheckCircleIcon size={13} color={COLORS.successDark} />
                      <Text style={styles.verifiedBadgeText}>Approved</Text>
                    </View>
                  )}

                  {docItem.status === 'submitted' && (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeIcon}>•</Text>
                      <Text style={styles.pendingBadgeText}>In review</Text>
                    </View>
                  )}

                  {isRejected && (
                    <View style={styles.issueBadge}>
                      <AlertCircleIcon size={12} color={COLORS.danger} />
                      <Text style={styles.issueBadgeText}>{docItem.status === 'needs_revision' ? 'Needs update' : 'Resubmit'}</Text>
                    </View>
                  )}

                  {isNotSubmitted && (
                    <View style={styles.requiredBadge}>
                      <Text style={styles.requiredBadgeDot}>!</Text>
                      <Text style={styles.requiredBadgeText}>{docItem.required === false ? 'Optional' : 'Required'}</Text>
                    </View>
                  )}

                  <ChevronIcon size={16} color={COLORS.textMuted} expanded={isExpanded} />
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
                          {[docItem.fileSize, docItem.submittedAt && `Uploaded ${new Date(docItem.submittedAt).toLocaleDateString('en-PH')}`].filter(Boolean).join(' · ') || 'File received'}
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
            onPress={() => navigation.navigate('Company')}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Continue to company selection"
          >
            <Text style={[styles.continueButtonText, isNarrowScreen && styles.continueButtonTextNarrow]}>Continue to Company Selection →</Text>
          </MotionTouchableOpacity>
        </View>
        </>}

        {activeStep === 3 && <View style={styles.comingSoonCard}><AlertCircleIcon size={30} color={COLORS.secondary} /><Text style={styles.comingSoonTitle}>Review step coming soon</Text><Text style={styles.comingSoonText}>The review interface will be added after the company placement workflow is complete.</Text></View>}
        {activeStep === 4 && <View style={styles.comingSoonCard}><CheckCircleIcon size={30} color={COLORS.secondary} /><Text style={styles.comingSoonTitle}>Approval step coming soon</Text><Text style={styles.comingSoonText}>The approval interface is not available yet. Your coordinator will continue reviewing your submitted records.</Text></View>}
      </ScrollView>

      <PreDeploymentNotificationsSheet
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
      />

      <PreDeploymentDrawer
        visible={showMenuDrawer}
        activeRoute="Requirements"
        onClose={() => setShowMenuDrawer(false)}
        onNavigate={route => navigation.replace(route)}
        onSignOut={handleLogout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    height: Platform.OS === 'ios' ? 94 : 68,
    paddingTop: Platform.OS === 'ios' ? 44 : 8,
    paddingHorizontal: 18,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    zIndex: 2,
  },
  topBarNarrow: {
    paddingHorizontal: 14,
  },
  topBarLead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySubtle,
    borderWidth: 1,
    borderColor: '#E6EEF9',
    zIndex: 1,
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 2.2,
  },
  brandTitleNarrow: {
    fontSize: 15,
    letterSpacing: 1.7,
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
    marginBottom: 16,
  },
  headerSectionNarrow: {
    marginBottom: 14,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  subPipelineLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.secondary,
    letterSpacing: 1.05,
  },
  stageBadge: {
    backgroundColor: '#EAF2FF',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  stageBadgeText: {
    color: COLORS.primaryDark,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  screenHeading: {
    fontSize: 25,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  screenHeadingNarrow: {
    fontSize: 22,
  },
  headerDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textMuted,
    marginTop: 4,
  },

  /* ── Four-Step Stepper (Figure 39) ── */
  stepperContainer: {
    marginBottom: 16,
    position: 'relative',
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
    ...SHADOWS.soft,
  },
  stepTrack: {
    position: 'absolute',
    top: 27,
    left: '12%',
    right: '12%',
    height: 2,
    backgroundColor: '#E5EAF2',
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
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
    backgroundColor: '#FFFFFF',
  },
  stepCircleActive: {
    borderWidth: 0,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  stepNumberActive: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stepLabelActive: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    textAlign: 'center',
  },
  stepCircleInactive: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#FFFFFF',
  },
  stepNumberInactive: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  stepLabelInactive: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  stepLabelNarrow: {
    fontSize: 10,
  },

  checklistCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 18,
    padding: 16,
    marginBottom: 22,
    ...SHADOWS.soft,
  },
  checklistTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  checklistIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistCopy: {
    flex: 1,
    minWidth: 0,
  },
  checklistTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  checklistSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  checklistPercent: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  progressValuePill: {
    minWidth: 48,
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: COLORS.primarySubtle,
    borderRadius: 999,
  },
  progressTrack: {
    height: 8,
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: 13,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 5,
  },
  checklistFootnote: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  documentsHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  documentsTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  documentsSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  documentsCount: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    paddingBottom: 2,
  },

  /* ── Document List Cards ── */
  docsList: {
    gap: 10,
  },
  comingSoonCard: {
    backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 28,
    alignItems: 'center', marginTop: 8, ...SHADOWS.card,
  },
  comingSoonTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  comingSoonText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  docCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 15,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.soft,
  },
  docCardExpanded: {
    borderColor: '#C8DDFB',
  },
  docCardNarrow: {
    padding: 12,
    borderRadius: 14,
  },
  docHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  docHeaderExpanded: {
    marginBottom: 14,
  },
  docStatusIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  docStatusIconApproved: {
    backgroundColor: COLORS.successSubtle,
  },
  docStatusIconIssue: {
    backgroundColor: COLORS.dangerSubtle,
  },
  docStatusIconReview: {
    backgroundColor: COLORS.warningSubtle,
  },
  docHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  docTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  docSubtitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 3,
  },

  /* Badges */
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 3,
    flexShrink: 0,
  },
  verifiedBadgeIcon: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.successDark,
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.successDark,
  },

  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 3,
    flexShrink: 0,
  },
  pendingBadgeIcon: {
    fontSize: 16,
    lineHeight: 12,
    fontWeight: '900',
    color: '#A16207',
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.warningDark,
  },

  issueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerSubtle,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 3,
    flexShrink: 0,
  },
  issueBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.dangerDark,
  },

  requiredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primarySubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 3,
    flexShrink: 0,
  },
  requiredBadgeDot: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primary,
  },
  requiredBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
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

});
