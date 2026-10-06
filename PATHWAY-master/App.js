import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { signOut } from 'firebase/auth';
import { Animated, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { auth } from './firebaseConfig';
import { destinationForProfile } from './services/authDestination';
import { postBackend } from './services/backendApi';
import ChangePasswordScreen from './screens/ChangePasswordScreen';
import { hasCompletedOnboarding } from './services/onboardingStorage';
import { COLORS } from './theme';
import { MotionPreferenceProvider, MotionTouchableOpacity, ScreenEntrance } from './components/Motion';
import AnimatedSplash, { StartupMarkHold } from './components/AnimatedSplash';
import { useFonts } from 'expo-font';
import { AppText as Text, FontAvailabilityProvider } from './components/AppText';
import LoginScreen from './screens/LoginScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import AdminDashboard from './screens/AdminDashboard';
import StudentDashboard from './screens/StudentDashboard';
import RequirementsScreen from './screens/RequirementsScreen';
import CompanyScreen from './screens/CompanyScreen';
import ReviewScreen from './screens/ReviewScreen';
import ApprovalScreen from './screens/ApprovalScreen';
import ForgotPasswordScreen from './screens/AccountRecoveryScreen';
import LogbookScreen from './screens/LogbookScreen';
import AttendanceScreen from './screens/AttendanceScreen';
import ProgressScreen from './screens/ProgressScreen';
import NotificationsScreen from './screens/NotificationsScreen';


// Placeholder screens — replace these as you build each one
const Placeholder = ({ route }) => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <Text>{route.name}</Text>
  </View>
);

const Stack = createNativeStackNavigator();

function withStudentMotion(Screen) {
  function StudentScreenWithMotion(props) {
    return <ScreenEntrance style={{ flex: 1 }}><Screen {...props} /></ScreenEntrance>;
  }
  StudentScreenWithMotion.displayName = `StudentScreenWithMotion(${Screen.displayName || Screen.name || 'Screen'})`;
  return StudentScreenWithMotion;
}

const StudentLogin = LoginScreen;
const StudentDashboardWithMotion = withStudentMotion(StudentDashboard);
const RequirementsWithMotion = withStudentMotion(RequirementsScreen);
const CompanyWithMotion = withStudentMotion(CompanyScreen);
const ReviewWithMotion = withStudentMotion(ReviewScreen);
const ApprovalWithMotion = withStudentMotion(ApprovalScreen);
const ForgotPasswordWithMotion = withStudentMotion(ForgotPasswordScreen);
const LogbookWithMotion = withStudentMotion(LogbookScreen);
const AttendanceWithMotion = withStudentMotion(AttendanceScreen);
const ProgressWithMotion = withStudentMotion(ProgressScreen);
const NotificationsWithMotion = withStudentMotion(NotificationsScreen);

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    'Newsreader-Regular': require('./assets/fonts/Newsreader-Regular.ttf'),
    'Newsreader-SemiBold': require('./assets/fonts/Newsreader-SemiBold.ttf'),
    'Newsreader-Bold': require('./assets/fonts/Newsreader-Bold.ttf'),
    'IBMPlexSans-Regular': require('./assets/fonts/IBMPlexSans-Regular.ttf'),
    'IBMPlexSans-Medium': require('./assets/fonts/IBMPlexSans-Medium.ttf'),
    'IBMPlexSans-SemiBold': require('./assets/fonts/IBMPlexSans-SemiBold.ttf'),
    'IBMPlexSans-Bold': require('./assets/fonts/IBMPlexSans-Bold.ttf'),
  });
  const fontsReady = fontsLoaded || Boolean(fontError);

  const [initialRoute, setInitialRoute] = useState(null);
  const [restoreError, setRestoreError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [startupComplete, setStartupComplete] = useState(false);
  const [startupLogoFrame, setStartupLogoFrame] = useState(null);
  const startupProgress = useRef(new Animated.Value(0)).current;


  const handleStartupLogoLayout = useCallback(frame => {
    if (!frame) return;
    setStartupLogoFrame(current => {
      if (
        current
        && Math.abs(current.x - frame.x) < 0.5
        && Math.abs(current.y - frame.y) < 0.5
        && Math.abs(current.width - frame.width) < 0.5
        && Math.abs(current.height - frame.height) < 0.5
      ) return current;
      return frame;
    });
  }, []);

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      setInitialRoute(null);
      setRestoreError('');
      try {
        await auth.authStateReady();
        const user = auth.currentUser;
        if (!user) {
          const completed = await hasCompletedOnboarding().catch(() => false);
          if (active) setInitialRoute(completed ? 'Login' : 'Onboarding');
          return;
        }
        const { profile } = await postBackend('/auth/profile');
        if (!active) return;
        const destination = profile ? destinationForProfile(profile) : null;
        if (!destination) {
          await signOut(auth);
          if (!active) return;
          setLoginNotice('Your account profile is unavailable. Contact your OJT Coordinator.');
          setInitialRoute('Login');
          return;
        }
        setInitialRoute(destination);
      } catch (error) {
        if (active) setRestoreError('Could not restore your session. Check your connection and try again.');
      }
    };
    restoreSession();
    return () => { active = false; };
  }, [restoreAttempt]);

  const appContent = restoreError ? (
    <View style={styles.recoveryScreen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <Text style={styles.recoveryTitle}>Can’t restore your session</Text>
      <Text style={styles.recoveryBody}>{restoreError}</Text>
      <MotionTouchableOpacity
        accessibilityRole="button"
        onPress={() => setRestoreAttempt(attempt => attempt + 1)}
        style={styles.recoveryPrimary}
      >
        <Text style={styles.recoveryPrimaryText}>Try again</Text>
      </MotionTouchableOpacity>
      <MotionTouchableOpacity
        accessibilityRole="button"
        onPress={async () => {
          try { await signOut(auth); } catch (_) { /* Continue to sign-in if local sign-out fails. */ }
          setRestoreError('');
          setLoginNotice('You can sign in again to restore your account.');
          setInitialRoute('Login');
        }}
        style={styles.recoverySecondary}
      >
        <Text style={styles.recoverySecondaryText}>Go to sign in</Text>
      </MotionTouchableOpacity>
    </View>
  ) : (!initialRoute || !fontsReady) ? (
    startupComplete ? <StartupMarkHold /> : <View style={{ flex: 1, backgroundColor: COLORS.primaryDeep }} />
  ) : (
    <NavigationContainer>

        <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login">
          {props => (
            <StudentLogin
              {...props}
              initialError={loginNotice}
              onClearInitialError={() => setLoginNotice('')}
              startupProgress={startupProgress}
              startupTransition={!startupComplete && initialRoute === 'Login'}
              onStartupLogoLayout={handleStartupLogoLayout}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="CoordinatorDashboard" component={Placeholder} />
        <Stack.Screen name="SupervisorDashboard" component={Placeholder} />
        <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
        <Stack.Screen name="ManageUsers" component={Placeholder} />
        <Stack.Screen name="ManageCompanies" component={Placeholder} />
        <Stack.Screen name="ViewStudents" component={Placeholder} />
        <Stack.Screen name="Reports" component={Placeholder} />
        <Stack.Screen name="StudentDashboard" component={StudentDashboardWithMotion} />
        <Stack.Screen name="Requirements" component={RequirementsWithMotion} />
        <Stack.Screen name="Company" component={CompanyWithMotion} />
        <Stack.Screen name="Review" component={ReviewWithMotion} />
        <Stack.Screen name="Approval" component={ApprovalWithMotion} />
        <Stack.Screen name="LogToday" component={AttendanceWithMotion} />
        <Stack.Screen name="Logbook" component={LogbookWithMotion} />
        <Stack.Screen name="Evaluations" component={Placeholder} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordWithMotion} />
        <Stack.Screen name="Progress" component={ProgressWithMotion} />
        <Stack.Screen name="Notifications" component={NotificationsWithMotion} />

        </Stack.Navigator>
    </NavigationContainer>
  );

  const rootContent = (
    <View style={styles.appRoot}>
      <View
        style={styles.appLayer}
        pointerEvents={startupComplete ? 'auto' : 'none'}
        accessibilityElementsHidden={!startupComplete}
        importantForAccessibility={startupComplete ? 'auto' : 'no-hide-descendants'}
      >
        {appContent}
      </View>
      {!startupComplete ? (
        <AnimatedSplash
          appReady={Boolean(initialRoute || restoreError) && fontsReady}
          destination={initialRoute}
          progress={startupProgress}
          targetFrame={startupLogoFrame}
          onComplete={() => setStartupComplete(true)}
        />
      ) : null}
    </View>
  );

  return (
    <SafeAreaProvider>
      <FontAvailabilityProvider available={fontsLoaded}>
        <MotionPreferenceProvider>{rootContent}</MotionPreferenceProvider>
      </FontAvailabilityProvider>
    </SafeAreaProvider>
  );
}

const styles = {
  appRoot: { flex: 1, backgroundColor: COLORS.primaryDeep },
  appLayer: { flex: 1 },
  recoveryScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background, paddingHorizontal: 28 },
  recoveryTitle: { color: COLORS.textPrimary, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  recoveryBody: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10, marginBottom: 24 },
  recoveryPrimary: { minHeight: 48, minWidth: 170, borderRadius: 14, backgroundColor: COLORS.primaryDark, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  recoveryPrimaryText: { color: COLORS.textOnPrimary, fontWeight: '800' },
  recoverySecondary: { padding: 16 },
  recoverySecondaryText: { color: COLORS.secondaryDark, fontWeight: '700' },
};
