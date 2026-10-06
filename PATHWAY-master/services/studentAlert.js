import { Alert, Platform } from 'react-native';

// React Native's Alert has no web implementation. Keep confirmations and
// submission feedback available in the browser as well as on devices.
export const studentAlert = {
  alert(title, message = '', buttons = []) {
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
