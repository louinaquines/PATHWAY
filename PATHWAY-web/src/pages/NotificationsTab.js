// src/pages/NotificationsTab.js
import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton } from '../components/LoadingSkeleton';

export default function NotificationsTab({ userId }) {
  const [items, setItems]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [sections, setSections]     = useState([]);
  const [sectionId, setSectionId]   = useState('');
  const [title, setTitle]           = useState('');
  const [message, setMessage]       = useState('');
  const [sending, setSending]       = useState(false);
  const [sendStatus, setSendStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'notifications'), where('recipientId', '==', userId)));
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    getDocs(query(collection(db, 'sections'), where('coordinatorId', '==', userId)))
      .then(snap => setSections(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [userId]);

  const sendAnnouncement = async e => {
    e.preventDefault();
    if (!sectionId || !title.trim() || !message.trim()) {
      setSendStatus('Please select a target section and fill in all announcement fields.');
      return;
    }
    setSending(true);
    setSendStatus('');
    try {
      const result = await adminRequest('/coordinator/announcements', {
        method: 'POST', body: JSON.stringify({ sectionId, title: title.trim(), message: message.trim() }),
      });
      setTitle('');
      setMessage('');
      setSendStatus(`Announcement broadcasted to ${result.count} student(s) in the section.`);
    } catch (e) {
      console.error(e);
      setSendStatus('Could not broadcast the announcement.');
    } finally {
      setSending(false);
    }
  };

  const markRead = async item => {
    if (item.read) return;
    await updateDoc(doc(db, 'notifications', item.id), { read: true });
    setItems(prev => prev.map(current => current.id === item.id ? { ...current, read: true } : current));
  };

  const filteredItems = items.filter(item => matchesCoordinatorSearch(searchQuery, item.title, item.message, item.type));

  if (loading) {
    return <PageSkeleton label="Loading notifications" variant="cards" />;
  }

  return (
    <div style={s.page} className="notifications-page">
      {/* Broadcast Announcement Form */}
      <form style={s.compose} onSubmit={sendAnnouncement}>
        <div style={s.composeHeader}>
          <div style={s.iconWrap}><Icon name="megaphone" size={22} label="Broadcast announcement" /></div>
          <div>
            <h2 style={s.composeTitle}>Broadcast Announcement</h2>
            <p style={s.sub}>Send an immediate in-app notice and alert to all students in a section.</p>
          </div>
        </div>

        <div style={s.formGrid}>
          <div style={s.formGroup}>
            <label style={s.label}>Target Section</label>
            <select
              style={s.select}
              value={sectionId}
              onChange={e => setSectionId(e.target.value)}
              disabled={sending}
              required
            >
              <option value="">Select section to broadcast...</option>
              {sections.map(section => (
                <option key={section.id} value={section.id}>
                  {section.name} — {section.department}
                </option>
              ))}
            </select>
          </div>

          <div style={s.formGroup}>
            <label style={s.label}>Subject / Title</label>
            <input
              style={s.input}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. MOA Submission Deadline Extension"
              disabled={sending}
              required
            />
          </div>

          <div style={{ ...s.formGroup, ...s.messageGroup }}>
            <label style={s.label}>Announcement Message</label>
            <textarea
              style={s.textarea}
              rows={3}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type your message to the enrolled students..."
              disabled={sending}
              required
            />
          </div>
        </div>

        <div style={s.composeFooter}>
          <button type="submit" style={s.sendButton} disabled={sending}>
            <Icon name="megaphone" size={15} />
            {sending ? 'Broadcasting...' : 'Send Announcement'}
          </button>
          {sendStatus && (
            <span style={s.statusText}>
              {sendStatus}
            </span>
          )}
        </div>
      </form>

      {/* Notifications Log */}
      <div style={s.listCard}>
          <div style={s.listHeader}>
          <div>
            <h2 style={s.listTitle}>Coordinator Notification Inbox</h2>
            <p style={s.sub}>System logs, clearance triggers, and activity alerts.</p>
          </div>
          <CoordinatorSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search notifications..." label="Search notifications" />
          <button type="button" style={s.refreshBtn} onClick={load}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        </div>

        {!filteredItems.length ? (
          <div style={s.empty}>
            <div style={s.emptyIcon}><Icon name="bell" size={28} label="Notifications" /></div>
            <p style={{ margin: 0, color: '#000000' }}>
              {items.length ? 'No notifications match your search.' : 'No notifications at this time.'}
            </p>
          </div>
        ) : (
          <div style={s.itemsWrap}>
            {filteredItems.map(item => (
              <div
                key={item.id}
                style={{ ...s.item, ...(item.read ? {} : s.unread) }}
                onClick={() => markRead(item)}
              >
                <div style={s.itemHeader}>
                  <div style={s.itemTitle}>
                    {!item.read && <span style={s.unreadDot} />}
                    {item.title}
                  </div>
                  <span style={s.date}>
                    {new Date(item.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={s.itemMessage}>{item.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page: {
    flex: 1,
    overflowY: 'auto',
    padding: 28,
    backgroundColor: COLORS.slate50,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 24,
    alignItems: 'start',
    width: '100%',
    maxWidth: 'none',
    minWidth: 0,
    boxSizing: 'border-box',
  },
  compose: {
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.lg,
    padding: 24,
    boxShadow: THEME.shadows.xs,
  },
  composeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.yellow100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    flexShrink: 0,
    border: `1px solid ${COLORS.yellow300}`,
  },
  composeTitle: {
    margin: '0 0 2px',
    fontSize: 17,
    fontWeight: 800,
    color: '#000000',
  },
  sub: {
    margin: 0,
    color: '#000000',
    fontSize: 13,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 14,
  },
  messageGroup: {
    gridColumn: '1 / -1',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
    marginBottom: 6,
  },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '10px 14px',
    fontSize: 13,
    backgroundColor: COLORS.white,
    fontFamily: THEME.fonts.main,
    color: '#000000',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '10px 14px',
    fontSize: 13,
    backgroundColor: COLORS.white,
    fontFamily: THEME.fonts.main,
    color: '#000000',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '10px 14px',
    fontSize: 13,
    backgroundColor: COLORS.white,
    fontFamily: THEME.fonts.main,
    color: '#000000',
    resize: 'vertical',
  },
  composeFooter: {
    marginTop: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
  },
  sendButton: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '11px 22px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 13,
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
  },
  statusText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: 700,
  },
  listCard: {
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.lg,
    padding: 24,
    boxShadow: THEME.shadows.xs,
  },
  listHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  listTitle: {
    margin: '0 0 2px',
    fontSize: 17,
    fontWeight: 800,
    color: '#000000',
  },
  refreshBtn: {
    backgroundColor: COLORS.white,
    border: `1.5px solid ${COLORS.slate300}`,
    color: '#000000',
    borderRadius: THEME.radius.md,
    padding: '7px 14px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  itemsWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  item: {
    padding: 16,
    border: `1px solid ${COLORS.slate300}`,
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.md,
    cursor: 'pointer',
  },
  unread: {
    borderLeft: `4px solid ${COLORS.sky600}`,
    backgroundColor: COLORS.sky50,
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  itemTitle: {
    color: '#000000',
    fontWeight: 800,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: COLORS.yellow500,
  },
  itemMessage: {
    color: '#000000',
    fontSize: 13,
    lineHeight: 1.5,
  },
  date: {
    color: '#000000',
    fontSize: 11,
    fontWeight: 600,
  },
  empty: {
    color: '#000000',
    padding: 40,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
    gap: 12,
    color: '#000000',
  },
  spinner: {
    width: 24,
    height: 24,
    border: `3px solid ${COLORS.sky200}`,
    borderTopColor: COLORS.sky600,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
