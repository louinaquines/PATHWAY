import AsyncStorage from '@react-native-async-storage/async-storage';

const notificationsKey = uid => `@pathway/student-preferences/${uid}/notifications-enabled`;

export async function getStudentNotificationsEnabled(uid) {
  if (!uid) return true;
  const storedValue = await AsyncStorage.getItem(notificationsKey(uid));
  return storedValue !== 'false';
}

export async function setStudentNotificationsEnabled(uid, enabled) {
  if (!uid) throw new Error('A signed-in student is required to save this preference.');
  await AsyncStorage.setItem(notificationsKey(uid), String(Boolean(enabled)));
}
