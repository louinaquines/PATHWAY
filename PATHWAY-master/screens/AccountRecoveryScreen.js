import React, { useState } from 'react';
import { Image, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from '../components/AppText';
import { MotionTouchableOpacity } from '../components/Motion';
import StudentSurface from '../components/StudentSurface';
import { ChevronLeftIcon, ArrowRightIcon, LockIcon } from '../components/Icons';

const steps = [
  ['Contact your coordinator', 'Provide your Student ID to your assigned OJT coordinator.'],
  ['Verify your identity', 'Your coordinator will verify your identity before issuing a temporary password.'],
  ['Set a new password', 'Sign in with the temporary password and replace it before accessing student records.'],
];

export default function AccountRecoveryScreen({ navigation }) {
  const [heroWidth, setHeroWidth] = useState(320);
  const guideWidth = heroWidth * 0.49;
  return <SafeAreaView style={styles.screen}>
    <StatusBar barStyle="dark-content" backgroundColor="#F8FBFF" /><StudentSurface tone="page" />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <MotionTouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back to sign in" style={styles.back}><ChevronLeftIcon size={22} color="#0765D4" /></MotionTouchableOpacity>
        <Text style={styles.headerTitle}>Account recovery</Text><View style={{ width: 44 }} />
      </View>
      <View style={styles.hero} onLayout={event => setHeroWidth(event.nativeEvent.layout.width)}>
        <StudentSurface tone="welcome" waves />
        <Image source={require('../assets/pathway-guide-thinking.png')} style={[styles.guide, { width: guideWidth, height: guideWidth * 1145 / 1374 }]} resizeMode="contain" accessible={false} />
        <Text style={styles.eyebrow}>LET’S GET YOU BACK IN</Text>
        <Text style={styles.title}>Forgot your password?</Text>
        <Text style={styles.subtitle}>Your coordinator can help you recover access.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recover your account</Text>
        {steps.map(([title, description], index) => <View key={title} style={[styles.step, index < 2 && styles.divider]}>
          <View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View>
          <View style={styles.copy}><Text style={styles.stepTitle}>{title}</Text><Text style={styles.body}>{description}</Text></View>
        </View>)}
      </View>
      <View style={styles.note}><LockIcon size={19} color="#0765D4" /><Text style={styles.noteText}>Keep your new password private. Never share it with anyone.</Text></View>
      <MotionTouchableOpacity style={styles.button} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Back to sign in"><Text style={styles.buttonText}>Back to sign in</Text><ArrowRightIcon size={19} color="#FFFFFF" /></MotionTouchableOpacity>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FBFF' },
  content: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', padding: 22, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#EAF3FF', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '600', color: '#12203A' },
  hero: { minHeight: 210, borderRadius: 24, overflow: 'hidden', justifyContent: 'flex-end', padding: 20, paddingRight: '39%', paddingBottom: 26 },
  guide: { position: 'absolute', right: -8, bottom: 0 },
  eyebrow: { fontSize: 9, letterSpacing: 1.2, fontWeight: '600', color: '#0765D4', marginBottom: 8 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: '600', color: '#10213D' },
  subtitle: { fontSize: 12, lineHeight: 18, color: '#5D708C', marginTop: 8 },
  card: { marginTop: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3ECF8', borderRadius: 22, padding: 18 },
  cardTitle: { fontSize: 17, fontWeight: '600', color: '#10213D', marginBottom: 6 },
  step: { flexDirection: 'row', gap: 12, paddingVertical: 16 },
  divider: { borderBottomWidth: 1, borderBottomColor: '#EEF3FA' },
  number: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#EAF3FF', alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 14, fontWeight: '600', color: '#0765D4' },
  copy: { flex: 1 },
  stepTitle: { fontSize: 14, fontWeight: '600', color: '#10213D', marginBottom: 5 },
  body: { fontSize: 12, lineHeight: 19, color: '#5D708C' },
  note: { flexDirection: 'row', gap: 10, backgroundColor: '#EAF3FF', borderRadius: 14, padding: 14, marginVertical: 18 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18, color: '#4C6484' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 52, borderRadius: 14, backgroundColor: '#0765D4' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
