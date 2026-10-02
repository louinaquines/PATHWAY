import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { COLORS, THEME } from '../theme';
import Icon from './Icons';

/**
 * Native React equivalent of an AlertDialog.
 * Use this for destructive, rejecting, or otherwise consequential actions.
 */
export default function AlertDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const handleKeyDown = event => {
      if (event.key === 'Escape' && !busy) onCancel?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  const accent = tone === 'warning' ? COLORS.amber600 : COLORS.rose600;
  const icon = tone === 'warning' ? 'alert' : 'trash';

  return createPortal(
    <div style={styles.overlay} role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !busy) onCancel?.();
    }}>
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pathway-alert-dialog-title"
        aria-describedby="pathway-alert-dialog-description"
        style={styles.dialog}
        onMouseDown={event => event.stopPropagation()}
      >
        <div style={{ ...styles.iconWrap, backgroundColor: tone === 'warning' ? COLORS.amber50 : COLORS.rose50, color: accent }}>
          <Icon name={icon} size={22} label="Important action" />
        </div>
        <h2 id="pathway-alert-dialog-title" style={styles.title}>{title}</h2>
        {description && <p id="pathway-alert-dialog-description" style={styles.description}>{description}</p>}
        {children}
        <div style={styles.footer}>
          <button type="button" ref={cancelRef} style={styles.cancel} onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button type="button" style={{ ...styles.confirm, backgroundColor: accent, opacity: busy || confirmDisabled ? 0.65 : 1 }} onClick={onConfirm} disabled={busy || confirmDisabled}>
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000, padding: 24,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
  },
  dialog: {
    width: 'min(100%, 460px)', backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate200}`, borderRadius: THEME.radius.xl,
    padding: 24, boxShadow: THEME.shadows.xl,
  },
  iconWrap: { width: 44, height: 44, borderRadius: THEME.radius.full, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { margin: 0, color: COLORS.textPrimary, fontSize: 19, lineHeight: 1.3, fontWeight: 800 },
  description: { margin: '10px 0 0', color: COLORS.slate600, fontSize: 14, lineHeight: 1.55 },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 },
  cancel: { border: `1px solid ${COLORS.slate300}`, backgroundColor: COLORS.white, color: COLORS.slate700, borderRadius: THEME.radius.md, padding: '10px 16px', fontWeight: 700, cursor: 'pointer' },
  confirm: { border: 0, color: COLORS.white, borderRadius: THEME.radius.md, padding: '10px 16px', fontWeight: 800, cursor: 'pointer' },
};
