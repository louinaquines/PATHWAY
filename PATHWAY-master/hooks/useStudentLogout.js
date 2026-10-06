import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';

const MIN_LOGOUT_SCREEN_MS = 650;

export default function useStudentLogout(navigation) {
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutInProgress = useRef(false);

  const logout = async () => {
    if (logoutInProgress.current) return;
    logoutInProgress.current = true;
    const logoutStartedAt = Date.now();
    setLoggingOut(true);

    try {
      await signOut(auth);
      const remainingScreenTime = MIN_LOGOUT_SCREEN_MS - (Date.now() - logoutStartedAt);
      if (remainingScreenTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingScreenTime));
      }
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (error) {
      logoutInProgress.current = false;
      setLoggingOut(false);
      Alert.alert('Unable to sign out', error?.message || 'Please try again.');
    }
  };

  return { loggingOut, logout };
}
