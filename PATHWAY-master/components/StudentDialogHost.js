import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { registerStudentDialog } from '../services/studentAlert';
import { AppText as Text } from './AppText';
import { CloseIcon } from './Icons';
import { COLORS } from '../theme';

// Queue feedback instead of letting simultaneous errors replace a confirmation.
export default function StudentDialogHost() {
  const [queue, setQueue] = useState([]);
  useEffect(() => registerStudentDialog(dialog => setQueue(current => [...current, dialog])), []);
  const dialog = queue[0];
  const finish = action => {
    setQueue(current => current.slice(1));
    action?.onPress?.();
  };
  const dismiss = () => finish(dialog?.buttons.find(action => action.style === 'cancel'));
  return (
    <Modal visible={Boolean(dialog)} transparent animationType="fade" onRequestClose={dismiss}>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close dialog" onPress={dismiss} style={styles.close}>
            <CloseIcon size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text accessibilityRole="header" variant="heading" style={styles.title}>{dialog?.title}</Text>
            {dialog?.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
          </ScrollView>
          <View style={styles.actions}>
            {dialog?.buttons.map((action, index) => (
              <TouchableOpacity key={index} accessibilityRole="button" onPress={() => finish(action)}
                style={[styles.button, action.style === 'cancel' && styles.secondary, action.style === 'destructive' && styles.destructive]}>
                <Text style={[styles.buttonText, action.style === 'cancel' && styles.secondaryText]}>{action.text || 'OK'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, maxHeight: '90%', backgroundColor: '#FFF', borderRadius: 24, padding: 24 },
  close: { alignSelf: 'flex-end', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flexShrink: 1 },
  bodyContent: { paddingBottom: 24 },
  title: { fontSize: 25, color: COLORS.textPrimary, marginBottom: 12 },
  message: { fontSize: 16, lineHeight: 24, color: COLORS.textSecondary },
  actions: { gap: 10 },
  button: { minHeight: 48, borderRadius: 14, padding: 14, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#FFF', textAlign: 'center' },
  secondary: { backgroundColor: '#F1F5F9' },
  secondaryText: { color: COLORS.textPrimary },
  destructive: { backgroundColor: '#B42318' },
});
