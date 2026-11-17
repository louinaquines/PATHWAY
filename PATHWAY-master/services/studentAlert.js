import { Alert, Platform } from 'react-native';

let dialogHandler;
export function isStudentErrorDialog(title, message, buttons = []) {
  if (buttons.some(button => button.style === 'cancel' || button.style === 'destructive')) return false;
  return /error|unable|unavailable|could not|cannot|failed|invalid|required|too (?:large|long)|not (?:sent|saved)|no notes yet|complete the/i.test(title || '')
    || /unable to|could not|failed to|network request failed/i.test(message || '');
}
export function registerStudentDialog(handler) {
  dialogHandler = handler;
  return () => { if (dialogHandler === handler) dialogHandler = undefined; };
}

// React Native's Alert has no web implementation. Keep confirmations and
// submission feedback available in the browser as well as on devices.
export const studentAlert = {
  alert(title, message = '', buttons = []) {
    buttons = buttons?.length ? buttons : [{ text: 'OK' }];
    if (dialogHandler) return dialogHandler({ title, message, buttons, isError: isStudentErrorDialog(title, message, buttons) });
    if (Platform.OS !== 'web') return Alert.alert(title, message, buttons);
    const text = [title, message].filter(Boolean).join('\n\n');
    const actions = buttons.filter(button => button.style !== 'cancel');
    const cancel = buttons.find(button => button.style === 'cancel');
    if (cancel && actions.length) {
      if (window.confirm(text)) actions[actions.length - 1].onPress?.();
      else cancel.onPress?.();
    } else {
      window.alert(text);
      actions[0]?.onPress?.();
    }
  },
};
