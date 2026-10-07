import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { studentAlert as Alert } from '../services/studentAlert';
import { useFocusEffect } from '@react-navigation/native';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { COLORS, RADIUS, SHADOWS, SPACE, TYPE } from '../theme';
import { MotionTouchableOpacity } from '../components/Motion';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import { ArrowRightIcon, BellIcon, ChatBubbleIcon, CheckCircleIcon, ChevronLeftIcon, SearchIcon } from '../components/Icons';
import { postBackend } from '../services/backendApi';
import { getStudentNotificationsEnabled } from '../services/studentPreferences';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import LoadMore from '../components/LoadMore';
import { mergeRecords, activityTime } from '../services/recordPagination';

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
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [coordinator, setCoordinator] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(route?.params?.initialTab || 'notifications');
  const [search, setSearch] = useState('');
  const [conversation, setConversation] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const chatScrollRef = useRef(null);
  const [noticePage, setNoticePage] = useState({ cursor: null, hasMore: false });
  const [unreadNotices, setUnreadNotices] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState('');
  const [olderBusy, setOlderBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');
  const listRequest = useRef(0);
  const activeChat = useRef(null);
  const noticeLock = useRef(false);
  const olderLock = useRef(false);
  const chatPosition = useRef({ height: 0, offset: 0, prepend: null, follow: true });
  const uid = auth.currentUser?.uid;
  const insets = useSafeAreaInsets();

  useEffect(() => () => { activeChat.current = null; }, []);

  useEffect(() => {
    chatPosition.current = { height: 0, offset: 0, prepend: null, follow: true };
  }, [conversation?.id]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
      chatPosition.current.follow = true;
      chatScrollRef.current?.scrollToEnd({ animated: true });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const load = useCallback(async () => {
    const request = ++listRequest.current;
    setListBusy(true);
    setListError('');
    try {
      if (!uid) return;
      const [notices, chats, isEnabled, assignment] = await Promise.all([
        postBackend('/student/inbox/notifications', { search }),
        postBackend('/student/inbox/conversations', { search }),
        getStudentNotificationsEnabled(uid),
        postBackend('/student/assigned-coordinator', {}),
      ]);
      if (request !== listRequest.current) return;
      setNotificationsEnabled(isEnabled);
      setItems(notices.records); setNoticePage(notices); setUnreadNotices(notices.unread);
      setConversations(chats.conversations); setUnreadChats(chats.unread);
      setCoordinator(assignment.coordinator || null);
    } catch (error) { if (request === listRequest.current) setListError(error.message || 'Could not load your inbox.'); }
    finally { if (request === listRequest.current) { setLoading(false); setListBusy(false); } }
  }, [uid, search]);

  useFocusEffect(useCallback(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => { clearTimeout(timer); listRequest.current += 1; };
  }, [load]));
  const loadMoreNotices = async () => {
    if (noticeLock.current || listBusy || !noticePage.hasMore) return;
    noticeLock.current = true;
    const request = listRequest.current;
    setListBusy(true); setListError('');
    try {
      const page = await postBackend('/student/inbox/notifications', { search, cursor: noticePage.cursor });
      if (request !== listRequest.current) return;
      setItems(previous => mergeRecords(previous, page.records));
      setNoticePage(page); setUnreadNotices(page.unread);
    } catch (error) { if (request === listRequest.current) setListError(error.message); }
    finally { noticeLock.current = false; if (request === listRequest.current) setListBusy(false); }
  };
  useEffect(() => {
    const nextTab = route?.params?.initialTab;
    if (nextTab === 'messages' || nextTab === 'notifications') setTab(nextTab);
  }, [route?.params?.initialTab]);
  useEffect(() => {
    const onBack = () => {
      if (!conversation) return false;
      activeChat.current = null;
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
      setUnreadNotices(value => Math.max(0, value - 1));
    } catch (error) { console.error('Mark read error:', error); }
  };

  const markConversationRead = async conversationItem => {
    const result = await postBackend('/student/inbox/read', { conversationId: conversationItem.legacy ? conversationItem.id : conversationItem.conversationId, legacy: !!conversationItem.legacy });
    if (conversationItem.unread) setUnreadChats(value => Math.max(0, value - 1));
    if (conversationItem.legacy) setUnreadNotices(value => Math.max(0, value - result.marked));
    setConversations(previous => previous.map(item => item.id === conversationItem.id ? { ...item, unread: false } : item));
  };

  const loadChat = async (item, { older = false, refresh = false } = {}) => {
    if (older && olderLock.current) return;
    if (older) { olderLock.current = true; setOlderBusy(true); }
    else if (!refresh) setChatBusy(true);
    setChatError('');
    const id = item.id;
    try {
      const scope = { conversationId: item.legacy ? item.id : item.conversationId, legacy: !!item.legacy };
      const page = await postBackend('/student/inbox/conversation', { ...scope, ...(older ? { cursor: item.cursor } : {}) });
      if (activeChat.current !== id) return;
      if (item.unread || page.records.some(record => record.recipientId === uid && !record.read)) {
        await markConversationRead(item);
        if (activeChat.current !== id) return;
        page.records = page.records.map(record => record.recipientId === uid ? { ...record, read: true } : record);
      }
      if (older) {
        chatPosition.current.prepend = { height: chatPosition.current.height, offset: chatPosition.current.offset };
        chatPosition.current.follow = false;
      }
      setConversation(previous => previous?.id !== id ? previous : {
        ...previous, unread: false,
        messages: (older || refresh ? mergeRecords(previous.messages, page.records) : page.records).map(record => ({ ...record, message: record.body || record.message || record.title || '' })).sort((a, b) => activityTime(a.createdAt) - activityTime(b.createdAt) || a.id.localeCompare(b.id)),
        ...(!refresh ? { cursor: page.cursor, hasMore: page.hasMore } : {}),
      });
    } catch (error) { if (activeChat.current === id) setChatError(error.message); }
    finally { if (older) olderLock.current = false; if (activeChat.current === id) { setOlderBusy(false); setChatBusy(false); } }
  };
  const openConversation = item => {
    activeChat.current = item.id;
    setDraft(''); setChatError('');
    setConversation({ ...item, messages: [], cursor: null, hasMore: false });
    loadChat(item);
  };
  useFocusEffect(useCallback(() => {
    if (!conversation || conversation.id === 'new') return;
    const timer = setInterval(() => loadChat(conversation, { refresh: true }), 8000);
    return () => clearInterval(timer);
  }, [conversation?.id, conversation?.unread]));

  const sendMessage = async () => {
    const body = draft.trim();
    const sendingChat = conversation?.id;
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
      if (activeChat.current !== sendingChat) { load(); return; }
      const newMessage = { ...payload, conversationId: result.conversationId, id: result.messageId, createdAt: result.createdAt };
      activeChat.current = result.conversationId;
      setConversation(previous => previous ? { ...previous, id: result.conversationId, conversationId: result.conversationId, legacy: false, messages: [...previous.messages, newMessage] } : previous);
      setDraft('');
      chatPosition.current.follow = true;
      load();
    } catch (error) {
      console.error('Send message error:', error);
      Alert.alert('Message not sent', error.message || 'Check your connection and try again.');
    } finally { setSending(false); }
  };

  const filteredNotifications = notificationsEnabled
    ? items
    : [];
  const filteredConversations = conversations;
  const unreadNotificationCount = notificationsEnabled ? unreadNotices : 0;
  const unreadConversationCount = unreadChats;
  const listIsEmpty = tab === 'notifications'
    ? !notificationsEnabled || filteredNotifications.length === 0
    : filteredConversations.length === 0;

  if (loading) return <StudentScreenSkeleton variant="inbox" />;

  if (conversation) return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, SPACE.sm) }]}>
        <MotionTouchableOpacity onPress={() => { activeChat.current = null; setConversation(null); }} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back to inbox"><ChevronLeftIcon size={21} color={COLORS.primaryDark} /></MotionTouchableOpacity>
        <View style={styles.headerIdentity}>
          <View style={styles.avatarSmall}><Text style={styles.avatarText}>{conversation.name.slice(0, 1).toUpperCase()}</Text></View>
          <View style={styles.headerIdentityCopy}>
            <Text style={styles.chatTitle} numberOfLines={1}>{conversation.name}</Text>
            <Text style={styles.headerSubtitle}>Your OJT coordinator</Text>
          </View>
        </View>
      </View>
      <KeyboardAvoidingView style={styles.chatArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={chatScrollRef} style={styles.chatViewport} contentContainerStyle={styles.chatScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" scrollEventThrottle={16} onScroll={event => { chatPosition.current.offset = event.nativeEvent.contentOffset.y; }} onContentSizeChange={(_, height) => {
          const position = chatPosition.current;
          if (position.prepend) {
            chatScrollRef.current?.scrollTo({ y: Math.max(0, position.prepend.offset + height - position.prepend.height), animated: false });
            position.prepend = null;
          } else if (position.follow) {
            chatScrollRef.current?.scrollToEnd({ animated: false });
            position.follow = false;
          }
          position.height = height;
        }} onLayout={() => { if (keyboardVisible && !chatPosition.current.prepend) chatScrollRef.current?.scrollToEnd({ animated: false }); }}>
          <LoadMore label="Load older messages" hasMore={conversation.hasMore} loading={olderBusy || chatBusy} error={chatError} onPress={() => loadChat(conversation, { older: !!conversation.cursor })} />
          {chatBusy && <Text style={styles.chatNote}>Loading conversation…</Text>}
          <Text style={styles.chatNote}>Conversation history</Text>
          {conversation.messages.map((item, index) => {
            const previous = conversation.messages[index - 1];
            const next = conversation.messages[index + 1];
            const mine = item.senderId === uid;
            const groupedAbove = previous && (previous.senderId || displayName(previous)) === (item.senderId || displayName(item));
            const groupedBelow = next && (next.senderId || displayName(next)) === (item.senderId || displayName(item));
            return (
              <View key={item.id} style={[styles.messageRow, mine ? styles.messageRowEnd : styles.messageRowStart]}>
                {!mine && <View style={styles.avatarSlot}>{!groupedBelow && <View style={styles.messageAvatar}><Text style={styles.messageAvatarText}>{conversation.name.slice(0, 1).toUpperCase()}</Text></View>}</View>}
                <View style={styles.messageContent}>
                  {!groupedAbove && <Text style={[styles.senderLabel, mine && styles.senderLabelEnd]}>{mine ? 'You' : conversation.name}</Text>}
                  <View accessible accessibilityRole="text" accessibilityLabel={`${mine ? 'You' : conversation.name}: ${item.message || item.title || 'No message content.'}`} style={[styles.bubble, mine ? styles.bubbleDefault : styles.bubbleSecondary, groupedAbove && styles.bubbleGroupedTop, groupedBelow && styles.bubbleGroupedBottom]}>
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextLight]}>{item.message || item.title || 'No message content.'}</Text>
                    <View style={styles.bubbleMeta}><Text style={[styles.bubbleDate, mine && styles.bubbleDateLight]}>{formatDate(item.createdAt)}</Text>{item.read && <CheckCircleIcon size={12} color={mine ? '#BAE6FD' : COLORS.successDark} />}</View>
                  </View>
                </View>
                {mine && <View style={styles.avatarSlot}>{!groupedBelow && <View style={[styles.messageAvatar, styles.messageAvatarMine]}><Text style={styles.messageAvatarText}>Y</Text></View>}</View>}
              </View>
            );
          })}
        </ScrollView>
        <View style={[styles.composerDock, { paddingBottom: keyboardVisible ? 12 : Math.max(12, insets.bottom) }]}>
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
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, SPACE.sm) }]}>
        <MotionTouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Go back"><ChevronLeftIcon size={21} color={COLORS.primaryDark} /></MotionTouchableOpacity>
        <View pointerEvents="none" style={[styles.headerHeading, { top: Math.max(insets.top, SPACE.sm) }]}>
          <Text variant="heading" style={styles.title}>Inbox</Text>
          <Text style={styles.headerSubtitle}>Updates and conversations</Text>
        </View>
      </View>
      <View style={styles.tabsWrap}>
        <View style={styles.tabs}>
          <MotionTouchableOpacity accessibilityRole="tab" accessibilityLabel={`Messages${unreadConversationCount ? `, ${unreadConversationCount} unread` : ''}`} accessibilityState={{ selected: tab === 'messages' }} style={[styles.tabButton, tab === 'messages' && styles.tabActive]} onPress={() => { setTab('messages'); setSearch(''); }}>
            <ChatBubbleIcon size={17} color={tab === 'messages' ? COLORS.primaryDark : COLORS.textMuted} />
            <Text style={[styles.tabText, tab === 'messages' && styles.tabTextActive]}>Messages</Text>
            {unreadConversationCount > 0 && <View style={styles.tabCount}><Text style={styles.tabCountText}>{unreadConversationCount > 9 ? '9+' : unreadConversationCount}</Text></View>}
          </MotionTouchableOpacity>
          <MotionTouchableOpacity accessibilityRole="tab" accessibilityLabel={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`} accessibilityState={{ selected: tab === 'notifications' }} style={[styles.tabButton, tab === 'notifications' && styles.tabActive]} onPress={() => { setTab('notifications'); setSearch(''); }}>
            <BellIcon size={17} color={tab === 'notifications' ? COLORS.primaryDark : COLORS.textMuted} />
            <Text style={[styles.tabText, tab === 'notifications' && styles.tabTextActive]}>Notifications</Text>
            {unreadNotificationCount > 0 && <View style={styles.tabCount}><Text style={styles.tabCountText}>{unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}</Text></View>}
          </MotionTouchableOpacity>
        </View>
      </View>
      <View style={styles.searchWrap}><View style={styles.searchField}><SearchIcon size={17} color={COLORS.textMuted} /><TextInput value={search} onChangeText={setSearch} placeholder={tab === 'messages' ? 'Search conversations' : 'Search notifications'} placeholderTextColor={COLORS.textMuted} style={styles.searchInput} accessibilityLabel={tab === 'messages' ? 'Search conversations' : 'Search notifications'} /></View></View>
      <ScrollView style={styles.listViewport} contentContainerStyle={[styles.scroll, listIsEmpty && styles.scrollEmpty]} showsVerticalScrollIndicator={false}>
        {tab === 'notifications' ? (!notificationsEnabled ? <EmptyState icon="bell" title="Notifications are off" text="Coordinator updates are paused on this device. Turn them back on in Profile → Settings. Your messages remain available in the Messages tab." /> : filteredNotifications.length ? filteredNotifications.map(item => {
          const unread = !item.read;
          return <MotionTouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title || 'Notification'}${unread ? ', unread' : ''}. ${item.message || 'No additional details.'}`} style={[styles.notificationCard, unread && styles.notificationUnread]} onPress={() => markRead(item)} activeOpacity={0.88}><View style={styles.notificationIcon}><BellIcon size={18} color={unread ? COLORS.primary : COLORS.textMuted} /></View><View style={styles.rowBody}><View style={styles.rowTitleLine}><Text style={[styles.cardTitle, unread && styles.unreadTitle]} numberOfLines={1}>{item.title || 'Notification'}</Text></View><Text style={styles.message} numberOfLines={2}>{item.message || 'No additional details.'}</Text><Text style={styles.date}>{formatDate(item.createdAt)}</Text></View>{unread && <View style={styles.unreadDot} />}{item.read && <CheckCircleIcon size={15} color={COLORS.textMuted} />}</MotionTouchableOpacity>;
        }) : <EmptyState icon="bell" title={search ? 'No matching notifications' : 'All caught up'} text={search ? 'Try another search term.' : 'Coordinator updates about your OJT records will appear here.'} />) : (filteredConversations.length ? filteredConversations.map(item => {
          const latest = item.messages[item.messages.length - 1];
          const unread = item.unread;
          return <MotionTouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={`Conversation with ${item.name}${unread ? ', unread' : ''}. ${latest.body || latest.message || latest.title || 'Open conversation'}`} style={[styles.conversationCard, unread && styles.unreadCard]} onPress={() => openConversation(item)} activeOpacity={0.88}><View style={styles.avatar}><Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.rowBody}><View style={styles.rowTitleLine}><Text style={[styles.cardTitle, unread && styles.unreadTitle]}>{item.name}</Text><Text style={styles.date}>{formatDate(latest.createdAt)}</Text></View><Text style={styles.message} numberOfLines={2}>{latest.body || latest.message || latest.title || 'Open conversation'}</Text></View>{unread && <View style={styles.unreadDot} />}</MotionTouchableOpacity>;
        }) : <View><EmptyState icon="chat" title={search ? 'No matching conversations' : 'No messages yet'} text={search ? 'Try another search term.' : 'Start a conversation with your assigned coordinator.'} />{!search && coordinator && <MotionTouchableOpacity accessibilityRole="button" style={styles.startChatButton} onPress={() => { activeChat.current = 'new'; setConversation({ id: 'new', conversationId: [uid, coordinator.id].sort().join('__'), participantId: coordinator.id, name: coordinator.name, messages: [], cursor: null, hasMore: false }); }} activeOpacity={0.85}><ChatBubbleIcon size={17} color="#FFFFFF" /><Text style={styles.startChatText}>Start conversation</Text></MotionTouchableOpacity>}</View>)}
        <LoadMore hasMore={tab === 'notifications' && noticePage.hasMore} loading={listBusy} error={listError} onPress={tab === 'notifications' && noticePage.cursor && !listError ? loadMoreNotices : load} />
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
  header: { position: 'relative', backgroundColor: COLORS.surface, paddingBottom: SPACE.sm, paddingHorizontal: SPACE.md, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  headerButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.surfaceMuted, borderWidth: 1, borderColor: COLORS.borderLight, alignItems: 'center', justifyContent: 'center' },
  headerButtonPlaceholder: { width: 42, height: 42 },
  headerHeading: { position: 'absolute', left: 0, right: 0, height: 42, alignItems: 'center', justifyContent: 'center', gap: 1 },
  headerSubtitle: { color: COLORS.textMuted, fontSize: 11.5 },
  headerIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  headerIdentityCopy: { flex: 1, minWidth: 0, gap: 1 },
  chatTitle: { color: COLORS.textPrimary, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  avatarSmall: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  title: { color: COLORS.textPrimary, fontSize: 21, lineHeight: 27, fontWeight: '700', letterSpacing: -0.3 },
  tabsWrap: { width: '100%', backgroundColor: COLORS.surface, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  tabs: { width: '100%', maxWidth: 760, alignSelf: 'center', backgroundColor: COLORS.surfaceMuted, padding: 4, borderRadius: 16, flexDirection: 'row', gap: 4 },
  tabButton: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  tabActive: { backgroundColor: COLORS.surface, borderColor: COLORS.borderLight, ...SHADOWS.soft },
  tabText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 12.5 },
  tabTextActive: { color: COLORS.primaryDark, fontWeight: '700' },
  tabCount: { minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: RADIUS.full, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  tabCountText: { color: COLORS.primaryDark, fontSize: 9.5, fontWeight: '800' },
  searchWrap: { width: '100%', alignItems: 'center', backgroundColor: COLORS.surface, paddingHorizontal: SPACE.md, paddingBottom: SPACE.sm },
  searchField: { width: '100%', maxWidth: 760, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, borderRadius: 14, backgroundColor: COLORS.surfaceMuted, paddingHorizontal: SPACE.md, borderWidth: 1, borderColor: COLORS.borderLight },
  searchInput: { flex: 1, minWidth: 0, height: 44, color: COLORS.textPrimary, fontSize: TYPE.bodySmall, paddingVertical: 0 },
  listViewport: { flex: 1, width: '100%' },
  scroll: { width: '100%', maxWidth: 792, alignSelf: 'center', paddingHorizontal: SPACE.md, paddingVertical: SPACE.md, gap: SPACE.sm },
  scrollEmpty: { flexGrow: 1, justifyContent: 'center' },
  notificationCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: SPACE.md, borderWidth: 1, borderColor: COLORS.borderLight, flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
  notificationUnread: { backgroundColor: '#F8FAFF', borderColor: COLORS.borderLight },
  notificationIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: COLORS.secondaryLight, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  conversationCard: { backgroundColor: COLORS.surface, borderRadius: 14, paddingHorizontal: SPACE.md, paddingVertical: SPACE.md, borderWidth: 1, borderColor: COLORS.borderLight, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  unreadCard: { backgroundColor: '#F8FAFF', borderColor: COLORS.borderLight },
  avatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.primaryDark, fontWeight: '700', fontSize: TYPE.bodySmall },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.xs },
  cardTitle: { color: COLORS.textPrimary, fontWeight: '600', fontSize: TYPE.bodySmall, flex: 1 },
  unreadTitle: { fontWeight: '700', color: COLORS.primaryDark },
  unreadDot: { display: 'none' },
  message: { color: COLORS.textSecondary, fontSize: TYPE.caption, lineHeight: 18, marginTop: SPACE.xxs },
  date: { color: COLORS.textMuted, fontSize: TYPE.micro, marginTop: SPACE.xxs, fontWeight: '500' },
  emptyCard: { width: '100%', maxWidth: 440, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.xl, paddingVertical: 30, backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.borderLight, ...SHADOWS.soft },
  emptyIconCircle: { width: 58, height: 58, borderRadius: 18, backgroundColor: COLORS.secondarySubtle, borderWidth: 1, borderColor: COLORS.secondaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.md },
  emptyTitle: { fontSize: TYPE.titleSmall, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center' },
  emptySub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACE.xs, lineHeight: 20, maxWidth: 320 },
  chatArea: { flex: 1, width: '100%', alignItems: 'center' },
  chatViewport: { flex: 1, width: '100%' },
  chatScroll: { width: '100%', maxWidth: 792, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 },
  chatNote: { color: COLORS.textMuted, textAlign: 'center', fontSize: TYPE.caption, marginBottom: SPACE.md },
  messageRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12, gap: 6 },
  messageRowStart: { justifyContent: 'flex-start' },
  messageRowEnd: { justifyContent: 'flex-end' },
  avatarSlot: { width: 30, alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 },
  messageAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  messageAvatarMine: { backgroundColor: COLORS.primaryDark },
  messageAvatarText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  messageContent: { maxWidth: '84%', minWidth: 0, flexShrink: 1 },
  senderLabel: { color: COLORS.textMuted, fontSize: TYPE.micro, fontWeight: '600', marginHorizontal: SPACE.xs, marginBottom: SPACE.xxs },
  senderLabelEnd: { color: COLORS.secondaryDark, textAlign: 'right' },
  bubble: { maxWidth: '100%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1 },
  bubbleDefault: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, borderBottomRightRadius: RADIUS.xs },
  bubbleSecondary: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderBottomLeftRadius: RADIUS.xs },
  bubbleGroupedTop: { borderTopLeftRadius: RADIUS.sm, borderTopRightRadius: RADIUS.sm, marginTop: -SPACE.xs },
  bubbleGroupedBottom: { borderBottomLeftRadius: RADIUS.sm, borderBottomRightRadius: RADIUS.sm },
  bubbleText: { color: COLORS.textPrimary, fontSize: 14, lineHeight: 21 },
  bubbleTextLight: { color: '#FFFFFF' },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: SPACE.xxs, marginTop: SPACE.xs },
  bubbleDate: { color: COLORS.textSecondary, fontSize: 10, lineHeight: 14 },
  bubbleDateLight: { color: '#FFFFFF' },
  composerDock: { width: '100%', borderTopWidth: 1, borderTopColor: COLORS.borderLight, backgroundColor: COLORS.surface, paddingHorizontal: SPACE.md, paddingTop: SPACE.sm, alignItems: 'center' },
  composer: { width: '100%', maxWidth: 760, flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: COLORS.surfaceMuted, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 6 },
  composerInput: { flex: 1, minHeight: 44, maxHeight: 112, color: COLORS.textPrimary, fontSize: 14, lineHeight: 21, paddingHorizontal: 8, paddingVertical: 10, textAlignVertical: 'top' },
  sendButton: { minWidth: 76, minHeight: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, flexDirection: 'row', gap: SPACE.xxs, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.sm },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#FFFFFF', fontSize: TYPE.caption, fontWeight: '700' },
  startChatButton: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm, marginTop: SPACE.md },
  startChatText: { color: '#FFFFFF', fontSize: TYPE.bodySmall, fontWeight: '700' },
});
