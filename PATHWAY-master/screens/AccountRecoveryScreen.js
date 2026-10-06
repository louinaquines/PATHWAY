import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { AppText as Text } from '../components/AppText';
export default function AccountRecoveryScreen({ navigation }) {
  return <View style={{ flex: 1, padding: 28, justifyContent: 'center', gap: 20, backgroundColor: '#f5f7fb' }}>
    <Text style={{ fontSize: 26, fontWeight: '700' }}>Recover your account</Text>
    <Text>Contact your assigned OJT coordinator and provide your Student ID. After verifying your identity, your coordinator can issue a temporary password.</Text>
    <Text>You must replace that temporary password before accessing student records. Never share your new password.</Text>
    <TouchableOpacity onPress={() => navigation.goBack()}><Text>Back to sign in</Text></TouchableOpacity>
  </View>;
}
