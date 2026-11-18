import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { requestBackend } from './backendApi';

const PROJECT_ID = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
// Expo Go (SDK 53+) cannot receive remote push; we fall back to local notifications there.
export const IN_EXPO_GO = Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // In the foreground the in-app toast already shows, so keep the system banner quiet.
    shouldShowBanner: AppState.currentState !== 'active',
    shouldShowList: true,
    shouldPlaySound: AppState.currentState !== 'active',
    shouldSetBadge: false,
  }),
});

let channelReady = false;
async function ensureChannel() {
  if (channelReady || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('pathway', {
    name: 'PATHWAY updates',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#0B5FD3',
    vibrationPattern: [0, 200, 120, 200],
  });
  channelReady = true;
}

export async function askPermission() {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return Boolean(next.granted);
}

// Returns the Expo push token when this build can receive remote push, otherwise null.
export async function registerForPush() {
  if (!(await askPermission())) return null;
  if (IN_EXPO_GO || !Device.isDevice || Platform.OS === 'web') return null;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync(PROJECT_ID ? { projectId: PROJECT_ID } : undefined);
    if (data) await requestBackend('/student/push-token', { method: 'PUT', payload: { token: data, platform: Platform.OS } });
    return data || null;
  } catch (error) {
    console.warn('Push registration unavailable:', error?.message || error);
    return null;
  }
}

export async function showLocal({ title, body, data }) {
  if (Platform.OS === 'web') return;
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: data || {}, color: '#0B5FD3', ...(Platform.OS === 'android' ? { channelId: 'pathway' } : {}) },
    trigger: null,
  });
}

let handledResponseId = null;
export function onNotificationTap(handler) {
  const handle = response => {
    const id = response?.notification?.request?.identifier;
    if (!response || (id && id === handledResponseId)) return;
    handledResponseId = id;
    handler(response.notification.request.content.data || {});
    Notifications.clearLastNotificationResponseAsync?.().catch(() => {});
  };
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  Notifications.getLastNotificationResponseAsync()
    .then(last => {
      // Only follow the tap that just opened the app, never an old remembered one.
      const at = last?.notification?.date || 0;
      if (last && Date.now() - at < 60_000) handle(last);
      else Notifications.clearLastNotificationResponseAsync?.().catch(() => {});
    })
    .catch(() => {});
  return () => sub.remove();
}

// Where a notification should open, by notice type.
export function routeFor(data = {}) {
  const t = String(data.type || '');
  if (/requirement|submission_link|deadline/.test(t)) return { name: 'Requirements' };
  if (/placement|company/.test(t)) return { name: 'Company' };
  if (/final_review|approval|clearance/.test(t)) return { name: 'Approval' };
  if (/message/.test(t)) return { name: 'Notifications', params: { initialTab: 'messages' } };
  return { name: 'Notifications', params: { initialTab: 'notifications' } };
}

// Schedules a sample notification a few seconds from now so it can be seen with the app closed.
export async function sendTestNotification(seconds = 5) {
  if (!(await askPermission())) return false;
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Requirement approved', body: 'Your Certificate of Registration was approved.', data: { type: 'requirement_approved' }, color: '#0B5FD3', ...(Platform.OS === 'android' ? { channelId: 'pathway' } : {}) },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false },
  });
  return true;
}
