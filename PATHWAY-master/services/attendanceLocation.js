import * as Location from 'expo-location';
import { requestBackend, postBackend } from './backendApi';
import { showStudentSuccess } from './studentSuccess';

async function savePunch(path, payload) {
  const result = await postBackend(path, payload);
  const timeOut = path === '/attendance/time-out';
  showStudentSuccess(timeOut ? 'Time-out recorded' : 'Time-in recorded', timeOut
    ? `Your shift is complete. ${Number(result.hoursToday || 0).toFixed(2)} hours recorded.`
    : 'Your shift has started. Your attendance was saved successfully.');
  return result;
}

export async function punchAttendance(path) {
  const policy = await requestBackend('/attendance/location-policy');
  if (!policy.enabled) return savePunch(path);
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Location permission is required for attendance at your company. Enable it in your device settings.');
  if (!(await Location.hasServicesEnabledAsync())) throw new Error('Turn on device location services and retry.');
  let timer;
  try {
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Location lookup timed out. Move to an open area and retry.')), 20000); }),
    ]);
    return savePunch(path, { location: { latitude: fix.coords.latitude, longitude: fix.coords.longitude,
      accuracy: fix.coords.accuracy, timestamp: fix.timestamp, mocked: fix.mocked === true } });
  } finally { clearTimeout(timer); }
}
