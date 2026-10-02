import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Platform, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { COLORS, RADIUS, SPACE, TYPE } from '../theme';
import { MotionTouchableOpacity } from '../components/Motion';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import { ArrowRightIcon, BellIcon, ChatBubbleIcon, CheckCircleIcon, ChevronLeftIcon, RefreshIcon, SearchIcon } from '../components/Icons';
import { postBackend } from '../services/backendApi';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';

const toDate = value => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatDate = value => {
  const date = toDate(value);
  return date ? date.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';
};
const displayName = item => item.senderName || item.senderRole || item.fromName || 'PATHWAY Coordinator';

export default function NotificationsScreen({ navigation, route }) {
  const [items, setItems] = useState([]);
  const [messages, setMessages] = useState([]);
  const [coordinator, setCoordinator] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState(route?.params?.initialTab || 'notifications');
  const [search, setSearch] = useState('');
  const [conversation, setConversation] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const uid = auth.currentUser?.uid;
  const insets = useSafeAreaInsets();

  const load = async isPull => {
    if (isPull) setRefreshing(true); else setLoading(true);
    try {
      if (!uid) return;
      const [snap, userSnap] = await Promise.all([
        getDocs(query(collection(db, 'notifications'), where('recipientId', '==', uid))),
        getDoc(doc(db, 'users', uid)),
      ]);
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
      const userData = userSnap.data() || {};
      let coordinatorId = userData.coordinatorId || '';
      if (!coordinatorId && userData.sectionId) {
        const sectionSnap = await getDoc(doc(db, 'sections', userData.sectionId));
        coordinatorId = sectionSnap.data()?.coordinatorId || '';
      }
      if (coordinatorId) {
        const coordinatorSnap = await getDoc(doc(db, 'users', coordinatorId));
        const coordinatorData = coordinatorSnap.data() || {};
        setCoordinator({ id: coordinatorId, name: [coordinatorData.firstName, coordinatorData.lastName].filter(Boolean).join(' ') || coordinatorData.name || 'OJT Coordinator' });
      }
      try {
        const messageSnap = await getDocs(query(collection(db, 'messages'), where('participantIds', 'array-contains', uid)));
        setMessages(messageSnap.docs.map(d => ({ id: d.id, ...d.data(), message: d.data().body || d.data().message || '' })).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
      } catch (messageError) {
        console.warn('Dedicated messages are not available yet; keeping notification messages available.', messageError);
        setMessages([]);
      }
    } catch (error) { console.error('Fetch notifications error:', error); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const nextTab = route?.params?.initialTab;
    if (nextTab === 'messages' || nextTab === 'notifications') setTab(nextTab);
  }, [route?.params?.initialTab]);
  useEffect(() => {
    const onBack = () => {
      if (!conversation) return false;
      setConversation(null);
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => subscription.remove();
  }, [conversation]);

  const markRead = async item => {
    if (item.read) return;
    try {
      await updateDoc(doc(db, 'notifications', item.id), { read: true });
      setItems(prev => prev.map(current => current.id === item.id ? { ...current, read: true } : current));
    } catch (error) { console.error('Mark read error:', error); }
  };

  const markConversationRead = async conversationItem => {
    const unread = conversationItem.messages.filter(item => item.recipientId === uid && item.read === false);
    if (!unread.length) return;
    await Promise.all(unread.map(item => updateDoc(doc(db, 'messages', item.id), { read: true, readAt: new Date().toISOString() }).catch(() => null)));
    setMessages(previous => previous.map(item => unread.some(current => current.id === item.id) ? { ...item, read: true, readAt: new Date().toISOString() } : item));
  };

  const sendMessage = async () => {
    const body = draft.trim();
    const recipientId = conversation?.participantId || coordinator?.id;
    if (!body || !recipientId || sending) return;
    setSending(true);
    try {
      const now = new Date().toISOString();
      const conversationId = conversation?.conversationId || [uid, recipientId].sort().join('__');
      const payload = {
        conversationId,
        participantIds: [uid, recipientId],
        studentId: uid,
        coordinatorId: recipientId,
        senderId: uid,
        senderRole: 'student',
        senderName: 'You',
        recipientId,
        recipientRole: 'coordinator',
        recipientName: conversation?.name || coordinator?.name || 'OJT Coordinator',
        body,
        message: body,
        read: false,
        createdAt: now,
        type: 'direct_message',
      };
      const result = await postBackend('/messages', { recipientId, body });
      const newMessage = { ...payload, conversationId: result.conversationId, id: result.messageId, createdAt: result.createdAt };
      setMessages(previous => [...previous, newMessage]);
      setConversation(previous => previous ? { ...previous, messages: [...previous.messages, newMessage] } : previous);
      setDraft('');
    } catch (error) {
      console.error('Send message error:', error);
      Alert.alert('Message not sent', error.message || 'Check your connection and try again.');
    } finally { setSending(false); }
  };

  const messageItems = useMemo(() => messages.length ? messages : items.filter(item => item.senderId || ['message', 'chat'].includes(String(item.type).toLowerCase())), [items, messages]);
  const conversations = useMemo(() => {
    const grouped = new Map();
    messageItems.forEach(item => {
      const key = item.conversationId || item.senderId || item.senderEmail || displayName(item);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    return Array.from(grouped.values()).map(messages => ({
      id: messages[0].conversationId || messages[0].senderId || messages[0].senderEmail || displayName(messages[0]),
      conversationId: messages[0].conversationId,
      participantId: messages.find(item => item.senderId !== uid)?.senderId || messages[0].recipientId || coordinator?.id,
      name: messages.find(item => item.senderId !== uid)?.senderName || messages[0].recipientName || coordinator?.name || displayName(messages[0]),
      messages: messages.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))),
    }));
  }, [messageItems, coordinator, uid]);
  const filteredNotifications = items.filter(item => `${item.title || ''} ${item.message || ''}`.toLowerCase().includes(search.toLowerCase()));
  const filteredConversations = conversations.filter(item => {
    const searchableText = item.messages
      .map(message => message.body || message.message || message.title || '')
      .join(' ');
    return `${item.name} ${searchableText}`.toLowerCase().includes(search.toLowerCase());
  });

  if (loading) return <StudentScreenSkeleton variant="inbox" />;

  if (conversation) return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, SPACE.sm) }]}>
        <MotionTouchableOpacity onPress={() => setConversation(null)} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back to inbox"><ChevronLeftIcon size={22} color="#FFFFFF" /></MotionTouchableOpacity>
        <View style={styles.headerIdentity}><View style={styles.avatarSmall}><Text style={styles.avatarText}>{conversation.name.slice(0, 1).toUpperCase()}</Text></View><Text style={styles.title}>{conversation.name}</Text></View>
        <View style={styles.headerButton} />
      </View>
      <KeyboardAvoidingView style={styles.chatArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.chatViewport} contentContainerStyle={styles.chatScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.chatNote}>Conversation history</Text>
          {conversation.messages.map((item, index) => {
            const previous = conversation.messages[index - 1];
            const next = conversation.messages[index + 1];
            const mine = item.senderId === uid;
            const groupedAbove = previous && (previous.senderId || displayName(previous)) === (item.senderId || displayName(item));
            const groupedBelow = next && (next.senderId || displayName(next)) === (item.senderId || displayName(item));
            return (
              <View key={item.id} style={[styles.messageRow, mine ? styles.messageRowEnd : styles.messageRowStart]}>
                {!mine && <View style={styles.avatarSlot}>{!groupedBelow && <View style={styles.messageAvatar}><Text style={styles.avatarText}>{conversation.name.slice(0, 1).toUpperCase()}</Text></View>}</View>}
                <View style={styles.messageContent}>
                  {!groupedAbove && <Text style={[styles.senderLabel, mine && styles.senderLabelEnd]}>{mine ? 'You' : conversation.name}</Text>}
                  <View accessible accessibilityRole="text" accessibilityLabel={`${mine ? 'You' : conversation.name}: ${item.message || item.title || 'No message content.'}`} style={[styles.bubble, mine ? styles.bubbleDefault : styles.bubbleSecondary, !item.read && styles.bubbleTinted, groupedAbove && styles.bubbleGroupedTop, groupedBelow && styles.bubbleGroupedBottom]}>
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextLight]}>{item.message || item.title || 'No message content.'}</Text>
                    <View style={styles.bubbleMeta}><Text style={[styles.bubbleDate, mine && styles.bubbleDateLight]}>{formatDate(item.createdAt)}</Text>{item.read && <CheckCircleIcon size={12} color={mine ? '#BAE6FD' : COLORS.successDark} />}</View>
                  </View>
                </View>
                {mine && <View style={styles.avatarSlot}>{!groupedBelow && <View style={[styles.messageAvatar, styles.messageAvatarMine]}><Text style={styles.avatarText}>Y</Text></View>}</View>}
              </View>
            );
          })}
        </ScrollView>
        <View style={[styles.composerDock, { paddingBottom: Math.max(12, insets.bottom) }]}>
          <View style={styles.composer}>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Write a message..." placeholderTextColor={COLORS.textMuted} style={styles.composerInput} multiline accessibilityLabel="Write a message" />
            <MotionTouchableOpacity style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]} onPress={sendMessage} disabled={!draft.trim() || sending} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={sending ? 'Sending message' : 'Send message'}><Text style={styles.sendButtonText}>{sending ? 'Sending' : 'Send'}</Text>{!sending && <ArrowRightIcon size={15} color="#FFFFFF" />}</MotionTouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, SPACE.sm) }]}>
        <MotionTouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Go back"><ChevronLeftIcon size={22} color="#FFFFFF" /></MotionTouchableOpacity>
        <Text style={styles.title}>Inbox</Text>
        <MotionTouchableOpacity onPress={() => load(true)} style={styles.headerButton} disabled={refreshing} accessibilityRole="button" accessibilityLabel="Refresh inbox">{refreshing ? <ActivityIndicator size="small" color={COLORS.brandGold} /> : <RefreshIcon size={18} color="#FFFFFF" />}</MotionTouchableOpacity>
      </View>
      <View style={styles.tabs}>
        <MotionTouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: tab === 'notifications' }} style={[styles.tabButton, tab === 'notifications' && styles.tabActive]} onPress={() => { setTab('notifications'); setSearch(''); }}><BellIcon size={17} color={tab === 'notifications' ? COLORS.primary : COLORS.textMuted} /><Text style={[styles.tabText, tab === 'notifications' && styles.tabTextActive]}>Notifications</Text></MotionTouchableOpacity>
        <MotionTouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: tab === 'messages' }} style={[styles.tabButton, tab === 'messages' && styles.tabActive]} onPress={() => { setTab('messages'); setSearch(''); }}><ChatBubbleIcon size={17} color={tab === 'messages' ? COLORS.primary : COLORS.textMuted} /><Text style={[styles.tabText, tab === 'messages' && styles.tabTextActive]}>Messages</Text></MotionTouchableOpacity>
      </View>
      <View style={styles.searchWrap}><View style={styles.searchField}><SearchIcon size={17} color={COLORS.textMuted} /><TextInput value={search} onChangeText={setSearch} placeholder={tab === 'messages' ? 'Search conversations' : 'Search notifications'} placeholderTextColor={COLORS.textMuted} style={styles.searchInput} accessibilityLabel={tab === 'messages' ? 'Search conversations' : 'Search notifications'} /></View></View>
      <ScrollView style={styles.listViewport} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === 'notifications' ? (filteredNotifications.length ? filteredNotifications.map(item => {
          const unread = !item.read;
          return <MotionTouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title || 'Notification'}${unread ? ', unread' : ''}. ${item.message || 'No additional details.'}`} style={[styles.notificationCard, unread && styles.notificationUnread]} onPress={() => markRead(item)} activeOpacity={0.88}><View style={styles.notificationIcon}><BellIcon size={18} color={unread ? COLORS.primary : COLORS.textMuted} /></View><View style={styles.rowBody}><View style={styles.rowTitleLine}><Text style={[styles.cardTitle, unread && styles.unreadTitle]} numberOfLines={1}>{item.title || 'Notification'}</Text></View><Text style={styles.message} numberOfLines={2}>{item.message || 'No additional details.'}</Text><Text style={styles.date}>{formatDate(item.createdAt)}</Text></View>{unread && <View style={styles.unreadDot} />}{item.read && <CheckCircleIcon size={15} color={COLORS.textMuted} />}</MotionTouchableOpacity>;
        }) : <EmptyState icon="bell" title={search ? 'No matching notifications' : 'All caught up'} text="Updates regarding document submissions, evaluations, and clearance will appear here." />) : (filteredConversations.length ? filteredConversations.map(item => {
          const latest = item.messages[item.messages.length - 1];
          const unread = item.messages.some(message => message.recipientId === uid && !message.read);
          return <MotionTouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={`Conversation with ${item.name}${unread ? ', unread' : ''}. ${latest.body || latest.message || latest.title || 'Open conversation'}`} style={[styles.conversationCard, unread && styles.unreadCard]} onPress={() => { setConversation(item); markConversationRead(item); }} activeOpacity={0.88}><View style={styles.avatar}><Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.rowBody}><View style={styles.rowTitleLine}><Text style={[styles.cardTitle, unread && styles.unreadTitle]}>{item.name}</Text><Text style={styles.date}>{formatDate(latest.createdAt)}</Text></View><Text style={styles.message} numberOfLines={2}>{latest.body || latest.message || latest.title || 'Open conversation'}</Text></View>{unread && <View style={styles.unreadDot} />}</MotionTouchableOpacity>;
        }) : <View><EmptyState icon="chat" title={search ? 'No matching conversations' : 'No messages yet'} text={search ? 'Try another search term.' : 'Start a conversation with your assigned coordinator.'} />{!search && coordinator && <MotionTouchableOpacity accessibilityRole="button" style={styles.startChatButton} onPress={() => setConversation({ id: 'new', conversationId: [uid, coordinator.id].sort().join('__'), participantId: coordinator.id, name: coordinator.name, messages: [] })} activeOpacity={0.85}><ChatBubbleIcon size={17} color="#FFFFFF" /><Text style={styles.startChatText}>Start conversation</Text></MotionTouchableOpacity>}</View>)}
      </ScrollView>
    </View>
  );
}

function EmptyState({ icon, title, text }) {
  return <View style={styles.emptyCard}><View style={styles.emptyIconCircle}>{icon === 'chat' ? <ChatBubbleIcon size={30} color={COLORS.secondary} /> : <BellIcon size={30} color={COLORS.secondary} />}</View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptySub}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: COLORS.primaryDark, paddingBottom: SPACE.sm, paddingHorizontal: SPACE.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerButton: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  avatarSmall: { width: 30, height: 30, borderRadius: RADIUS.full, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFFFFF', fontSize: TYPE.titleSmall, fontWeight: '700', letterSpacing: -0.2 },
  tabs: { width: '100%', maxWidth: 760, alignSelf: 'center', backgroundColor: COLORS.surface, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabButton: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: SPACE.xs, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: COLORS.primary },
  tabText: { color: COLORS.textMuted, fontWeight: '600', fontSize: TYPE.bodySmall },
  tabTextActive: { color: COLORS.primaryDark, fontWeight: '700' },
  searchWrap: { width: '100%', alignItems: 'center', backgroundColor: COLORS.surface, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  searchField: { width: '100%', maxWidth: 760, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceMuted, paddingHorizontal: SPACE.md, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, minWidth: 0, height: 44, color: COLORS.textPrimary, fontSize: TYPE.bodySmall, paddingVertical: 0 },
  listViewport: { flex: 1, width: '100%' },
  scroll: { width: '100%', maxWidth: 792, alignSelf: 'center', paddingHorizontal: SPACE.md, paddingTop: SPACE.sm, paddingBottom: SPACE.xxl },
  notificationCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.xs, borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
  notificationUnread: { backgroundColor: COLORS.primaryLight, borderColor: '#D6E6FB' },
  notificationIcon: { width: 38, height: 38, borderRadius: RADIUS.full, backgroundColor: COLORS.secondaryLight, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  conversationCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: SPACE.md, marginBottom: SPACE.xs, borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  unreadCard: { backgroundColor: COLORS.primaryLight, borderColor: '#D6E6FB' },
  avatar: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: COLORS.brandNavy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: TYPE.bodySmall },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.xs },
  cardTitle: { color: COLORS.textPrimary, fontWeight: '600', fontSize: TYPE.bodySmall, flex: 1 },
  unreadTitle: { fontWeight: '700', color: COLORS.primaryDark },
  unreadDot: { width: 9, height: 9, borderRadius: RADIUS.full, backgroundColor: COLORS.secondary, alignSelf: 'center', marginLeft: SPACE.xxs },
  message: { color: COLORS.textSecondary, fontSize: TYPE.caption, lineHeight: 18, marginTop: SPACE.xxs },
  date: { color: COLORS.textMuted, fontSize: TYPE.micro, marginTop: SPACE.xxs, fontWeight: '500' },
  emptyCard: { alignItems: 'center', justifyContent: 'center', marginTop: SPACE.xxl * 2, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.xl },
  emptyIconCircle: { width: 60, height: 60, borderRadius: RADIUS.full, backgroundColor: COLORS.secondaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.md },
  emptyTitle: { fontSize: TYPE.titleSmall, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center' },
  emptySub: { fontSize: TYPE.bodySmall, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACE.xs, lineHeight: 20, maxWidth: 320 },
  chatArea: { flex: 1, width: '100%', alignItems: 'center' },
  chatViewport: { flex: 1, width: '100%' },
  chatScroll: { width: '100%', maxWidth: 792, alignSelf: 'center', paddingHorizontal: SPACE.md, paddingTop: SPACE.md, paddingBottom: SPACE.lg },
  chatNote: { color: COLORS.textMuted, textAlign: 'center', fontSize: TYPE.caption, marginBottom: SPACE.md },
  messageRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-end', marginBottom: SPACE.sm },
  messageRowStart: { justifyContent: 'flex-start' },
  messageRowEnd: { justifyContent: 'flex-end' },
  avatarSlot: { width: 32, marginHorizontal: SPACE.xxs, alignItems: 'center', justifyContent: 'flex-end' },
  messageAvatar: { width: 28, height: 28, borderRadius: RADIUS.full, backgroundColor: COLORS.brandNavy, alignItems: 'center', justifyContent: 'center' },
  messageAvatarMine: { backgroundColor: COLORS.secondary },
  messageContent: { maxWidth: '80%', minWidth: 0 },
  senderLabel: { color: COLORS.textMuted, fontSize: TYPE.micro, fontWeight: '600', marginHorizontal: SPACE.xs, marginBottom: SPACE.xxs },
  senderLabelEnd: { color: COLORS.secondaryDark, textAlign: 'right' },
  bubble: { maxWidth: '100%', borderRadius: RADIUS.lg, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderWidth: 1 },
  bubbleDefault: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, borderBottomRightRadius: RADIUS.xs },
  bubbleSecondary: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderBottomLeftRadius: RADIUS.xs },
  bubbleTinted: { backgroundColor: COLORS.secondaryLight, borderColor: '#BAE6FD' },
  bubbleGroupedTop: { borderTopLeftRadius: RADIUS.sm, borderTopRightRadius: RADIUS.sm, marginTop: -SPACE.xs },
  bubbleGroupedBottom: { borderBottomLeftRadius: RADIUS.sm, borderBottomRightRadius: RADIUS.sm },
  bubbleText: { color: COLORS.textPrimary, fontSize: TYPE.bodySmall, lineHeight: 20 },
  bubbleTextLight: { color: '#FFFFFF' },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: SPACE.xxs, marginTop: SPACE.xs },
  bubbleDate: { color: COLORS.textMuted, fontSize: TYPE.micro },
  bubbleDateLight: { color: '#D7EBFF' },
  composerDock: { width: '100%', borderTopWidth: 1, borderTopColor: COLORS.borderLight, backgroundColor: COLORS.surface, paddingHorizontal: SPACE.md, paddingTop: SPACE.sm, alignItems: 'center' },
  composer: { width: '100%', maxWidth: 760, flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.xs, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACE.xs },
  composerInput: { flex: 1, minHeight: 44, maxHeight: 112, color: COLORS.textPrimary, fontSize: TYPE.bodySmall, paddingHorizontal: SPACE.xs, paddingVertical: SPACE.xs },
  sendButton: { minWidth: 76, minHeight: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, flexDirection: 'row', gap: SPACE.xxs, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.sm },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#FFFFFF', fontSize: TYPE.caption, fontWeight: '700' },
  startChatButton: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, marginTop: SPACE.md },
  startChatText: { color: '#FFFFFF', fontSize: TYPE.bodySmall, fontWeight: '700' },
});
