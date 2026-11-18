import { useEffect, useRef, useState } from "react";
import { adminRequest } from "../adminApi";
import { PortalFormDialog } from "../components/PortalStates";
import Icon from "../components/Icons";
import AttendanceAccess from "../components/AttendanceAccess";
import AnnouncementEmailDelivery from "../components/AnnouncementEmailDelivery";
import "./NotificationsTab.css";
import "./AnnouncementsRedesign.css";
import { createPortal } from "react-dom";
import SectionPicker from "../components/SectionPicker";
import PostedAnnouncements from "../components/PostedAnnouncements";
import { attendanceReasonLabels } from "../attendanceRiskLabels";
import { doc as fsDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useInRouterContext, useNavigate } from "react-router-dom";
function useSafeNavigate() { const inRouter = useInRouterContext(); return inRouter ? useNavigate() : () => {}; } // eslint-disable-line react-hooks/rules-of-hooks
const rowIcon = (kind, row) => kind === "attendance" ? "clock"
  : /placement|company/i.test(row?.title || "") ? "briefcase"
  : /announce/i.test(row?.title || "") ? "megaphone"
  : /review|submitted|document|requirement|journal/i.test(row?.title || "") ? "clipboard" : "bell";
const timestamp = (value) =>
  value
    ? new Date(value).toLocaleString("en-PH", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Manila",
      })
    : "Date unavailable";
export default function NotificationsTab({
  userId,
  section,
  sections = [],
  onOpenAttendanceRisk,
  onStudents,
  onSectionChange,
}) {
  return (
    <AttendanceAccess key={userId} actorId={userId}>
      {(access) => (
        <NotificationWorkspace
          userId={userId}
          section={section}
          sections={sections}
          onOpenAttendanceRisk={onOpenAttendanceRisk}
          onStudents={onStudents}
          onSectionChange={onSectionChange}
          access={access}
        />
      )}
    </AttendanceAccess>
  );
}
export function NotificationWorkspace({
  userId,
  section,
  sections = [],
  onOpenAttendanceRisk,
  onStudents,
  onSectionChange,
  access,
}) {
  const navigate = useSafeNavigate();
  const storage = `pathway-inbox:${userId}`;
  const [topHost, setTopHost] = useState(null);
  useEffect(() => { setTopHost(document.getElementById("ann-top-actions")); }, []);
  const saved = useRef(null);
  if (saved.current === null) {
    try {
      saved.current = JSON.parse(sessionStorage.getItem(storage)) || {};
    } catch {
      saved.current = {};
    }
  }
  const [kind, setKind] = useState(saved.current.kind || (onSectionChange ? "posted" : "activity")),
    [search, setSearch] = useState(saved.current.search || ""),
    [query, setQuery] = useState(search),
    [filter, setFilter] = useState(saved.current.filter || "all");
  const [cursors, setCursors] = useState(
      saved.current.sectionId === section?.id
        ? saved.current.cursors || [null]
        : [null],
    ),
    [index, setIndex] = useState(
      saved.current.sectionId === section?.id ? saved.current.index || 0 : 0,
    ),
    [page, setPage] = useState({ records: [] }),
    [counts, setCounts] = useState({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState(null),
    [draft, setDraft] = useState(null),
    [saving, setSaving] = useState(false),
    [formError, setFormError] = useState(""),
    [announcement, setAnnouncement] = useState(null);
  const [postedKey, setPostedKey] = useState(0);
  const version = useRef(0),
    list = useRef(null),
    opener = useRef(null),
    restoreScroll = useRef(saved.current.scroll || 0);
  const scope = JSON.stringify([section?.id, kind, query, filter]),
    previousScope = useRef(scope),
    detailVersion = useRef(0);
  const persist = () => {
    try {
      sessionStorage.setItem(
        storage,
        JSON.stringify({
          sectionId: section?.id,
          kind,
          search,
          filter,
          cursors,
          index,
          scroll: list.current?.scrollTop || 0,
        }),
      );
    } catch {}
  };
  useEffect(() => {
    try { if (sessionStorage.getItem("pathway-open-announcement") === "1") { sessionStorage.removeItem("pathway-open-announcement"); setDraft({ sectionId: section?.id || "", title: "", message: "" }); } } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    if (saving) return;
    detailVersion.current++;
    setDetail(null);
    setDraft(null);
    setFormError("");
    setAnnouncement(null);
    requestAnimationFrame(() => opener.current?.focus());
  };
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (previousScope.current !== scope) {
      previousScope.current = scope;
      setIndex(0);
      setCursors([null]);
      detailVersion.current++;
      setDetail(null);
      restoreScroll.current = 0;
      return;
    }
    if (!section?.id || kind === "posted") return;
    const request = ++version.current;
    setBusy(true);
    setError("");
    const params = new URLSearchParams({
      sectionId: section.id,
      search: query,
      unread: filter === "unread" ? "1" : "0",
    });
    if (cursors[index]) params.set("cursor", cursors[index]);
    adminRequest(`/coordinator/inbox/${kind}?${params}`)
      .then((result) => {
        if (request !== version.current || !access.isCurrent()) return;
        setPage(result);
        requestAnimationFrame(() => {
          if (list.current) list.current.scrollTop = restoreScroll.current;
        });
      })
      .catch((error) => {
        if (request === version.current) {
          setError("Could not load notifications. Try again.");
          setPage({ records: [] });
          if (error.status === 400 && index > 0) {
            setIndex(0);
            setCursors([null]);
          }
        }
      })
      .finally(() => {
        if (request === version.current) setBusy(false);
      });
    return () => {
      version.current++;
    };
    // Access is a generation guard, not a request dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, index, cursors, retry]);
  useEffect(() => {
    if (!section?.id || kind === "posted") return;
    let current = true;
    setCounts({});
    adminRequest(
      `/coordinator/inbox/${kind}/counts?sectionId=${encodeURIComponent(section.id)}`,
    )
      .then((result) => {
        if (current && access.isCurrent()) setCounts(result);
      })
      .catch(() => {
        if (current) setCounts({});
      });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, section?.id, retry]);
  useEffect(() => {
    persist();
  }, [kind, search, filter, index, cursors, section?.id]);
  const changePage = (next) => {
    restoreScroll.current = 0;
    if (next > index)
      setCursors((old) => [...old.slice(0, index + 1), page.cursor]);
    setIndex(next);
  };
  async function open(row, event) {
    opener.current = event.currentTarget;
    const generation = ++detailVersion.current;
    setDetail({ ...row, loading: true });
    setFormError("");
    try {
      const result = await adminRequest(
        `/coordinator/inbox/${kind}/${encodeURIComponent(row.id)}?sectionId=${encodeURIComponent(section.id)}`,
      );
      if (detailVersion.current === generation && access.isCurrent()) {
        setDetail({ ...row, ...result, type: result.type || row.type, kind: result.kind || row.kind, loading: false });
        const sid = result.studentId || row.studentId;
        if (sid) getDoc(fsDoc(db, "users", sid)).then((snap) => {
          if (detailVersion.current !== generation || !snap.exists()) return;
          const u = snap.data(); setDetail((old) => old && ({ ...old, studentName: `${u.lastName || ""}${u.lastName && u.firstName ? ", " : ""}${u.firstName || ""}`.trim() || old.studentName, studentIdNumber: u.idNumber }));
        }).catch(() => {});
      }
    } catch {
      if (detailVersion.current === generation)
        setFormError(
          "Could not open this notification. Close it and try again.",
        );
    }
  }
  async function read() {
    const generation = detailVersion.current;
    setSaving(true);
    setFormError("");
    try {
      await adminRequest(
        `/coordinator/inbox/${kind}/${encodeURIComponent(detail.id)}/read?sectionId=${encodeURIComponent(section.id)}`,
        { method: "POST", body: "{}" },
      );
      if (!access.isCurrent() || generation !== detailVersion.current) return;
      setDetail((old) => ({ ...old, read: true }));
      restoreScroll.current = list.current?.scrollTop || 0;
      if (filter === "unread" && page.records.length === 1 && index > 0)
        setIndex(index - 1);
      setRetry((v) => v + 1);
    } catch {
      setFormError("Could not mark this notification as read. Try again.");
    } finally {
      setSaving(false);
    }
  }
  async function post(event) {
    event.preventDefault();
    if (!draft.sectionId || !draft.title.trim() || !draft.message.trim())
      return;
    setSaving(true);
    setFormError("");
    try {
      const result = await adminRequest("/coordinator/announcements", {
        method: "POST",
        body: JSON.stringify({
          ...draft,
          title: draft.title.trim(),
          message: draft.message.trim(),
        }),
      });
      if (access.isCurrent()) { setAnnouncement(result); setPostedKey((v) => v + 1); }
    } catch {
      setFormError(
        "Could not post the announcement. Your draft is still here.",
      );
    } finally {
      setSaving(false);
    }
  }
  const switcher = (
        <div className="ann-switch" role="tablist" aria-label="Inbox">
          {onSectionChange && <button role="tab" aria-selected={kind === "posted"} onClick={() => setKind("posted")}>Posted</button>}
          <button role="tab" aria-selected={kind === "activity"} onClick={() => setKind("activity")}>Activity{kind === "activity" && Number.isFinite(counts.unread) && counts.unread > 0 && <b>{counts.unread}</b>}</button>
          <button role="tab" aria-selected={kind === "attendance"} onClick={() => setKind("attendance")}>Attendance alerts{kind === "attendance" && Number.isFinite(counts.unread) && counts.unread > 0 && <b>{counts.unread}</b>}</button>
        </div>
  );
  return (
    <div className="ann notifications-workspace">
      {(acts => topHost ? createPortal(acts, topHost) : <div className="ann-inline-actions">{acts}</div>)(<>
        <button
          type="button"
          className="rq-btn rq-primary inbox-primary"
          onClick={(event) => {
            opener.current = event.currentTarget;
            setFormError("");
            setDraft({ sectionId: section?.id || "", title: "", message: "" });
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8" /></svg>
          {topHost ? "New announcement" : "Post announcement"}
        </button>
        {sections.length > 0 && onSectionChange && <SectionPicker sections={sections} selected={section} onChange={(sec) => onSectionChange(sec)} />}
      </>)}
      {kind === "posted" ? <PostedAnnouncements section={section} refreshKey={postedKey} switcher={switcher} /> : <div className="ann-card">
      <section
        className="inbox-panel"
        aria-label={
          kind === "activity" ? "Activity inbox" : "Attendance alerts"
        }
      >
        <div className="inbox-toolbar">
          <label className="inbox-search">
            <Icon name="search" size={18} />
            <input
              aria-label="Search notifications"
              placeholder="Search notifications…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            aria-label="Read status"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
          </select>
          <button className="ann-refresh" aria-label="Refresh" title="Refresh" onClick={() => setRetry((v) => v + 1)} disabled={busy}>
            <Icon name="refresh" size={15} />
          </button>
          <span className="inbox-count">
            {Number.isFinite(counts.unread)
              ? `${counts.unread} unread`
              : "Unread count unavailable"}
          </span>
        </div>
        {switcher}
        <div
          className="inbox-rows"
          ref={list}
          onScroll={persist}
          aria-busy={busy}
        >
          {!section ? (
            <p className="inbox-state">Select a section to open your inbox.</p>
          ) : busy ? (
            <p className="inbox-state" role="status">
              Loading notifications…
            </p>
          ) : error ? (
            <div className="inbox-state is-empty" role="status">
              <span className="inbox-empty-icon" aria-hidden="true">
                <Icon name={kind === "attendance" ? "clock" : "bell"} size={26} />
              </span>
              <strong>No notifications yet.</strong>
              <span>New updates from your students will show up here.</span>
              <button type="button" className="inbox-check-again" onClick={() => setRetry((v) => v + 1)}>Check again</button>
            </div>
          ) : !page.records.length ? (
            <div className="inbox-state is-empty">
              <span className="inbox-empty-icon" aria-hidden="true">
                <Icon name={kind === "attendance" ? "clock" : "bell"} size={26} />
              </span>
              <strong>
                {query
                  ? "No matching notifications."
                  : filter === "unread"
                    ? "No unread notifications."
                    : kind === "attendance" ? "No attendance alerts" : "No notifications yet."}
              </strong>
              <span>
                {query
                  ? "Try a different search term or clear the filter."
                  : kind === "attendance"
                    ? "PATHWAY checks attendance every day and lists students here when they start falling behind."
                    : "Student submissions, reviews and other section activity will appear here."}
              </span>
              {kind === "attendance" && !query && filter !== "unread" && <button type="button" className="inbox-check-again" onClick={() => navigate("/coordinator/analytics")}>See class progress</button>}
            </div>
          ) : (
            page.records.map((row) => (
              <button
                className={`inbox-row${detail?.id === row.id ? " is-on" : ""}${row.read ? "" : " is-unread"}`}
                key={row.id}
                onClick={(event) => open(row, event)}
              >
                <span className="inbox-row-icon">
                  <Icon
                    name={rowIcon(kind, row)}
                    size={17}
                  />
                </span>
                <span className="inbox-row-copy">
                  <strong>{row.title}</strong>
                  <span>{row.message}</span>
                </span>
                <time>{row.createdAt ? timestamp(row.createdAt) : ""}</time>
                <span
                  className={`inbox-dot ${row.read ? "is-read" : ""}`}
                  aria-label={row.read ? "Read" : "Unread"}
                />
              </button>
            ))
          )}
        </div>
        <footer className="inbox-footer">
          <span>
            {busy
              ? "Loading…"
              : error
                ? "Records unavailable"
                : page.records.length
                  ? `${index * 10 + 1}–${index * 10 + page.records.length}${Number.isFinite(page.total) ? ` of ${page.total}` : ""} notifications`
                  : "0 notifications"}
          </span>
          <nav aria-label="Inbox pages">
            <button
              aria-label="Previous page"
              disabled={busy || index === 0}
              onClick={() => changePage(index - 1)}
            >
              ‹
            </button>
            <span>
              Page {index + 1}
              {Number.isFinite(page.total)
                ? ` of ${Math.max(1, Math.ceil(page.total / 10))}`
                : ""}
            </span>
            <button
              aria-label="Next page"
              disabled={busy || !page.hasMore}
              onClick={() => changePage(index + 1)}
            >
              ›
            </button>
          </nav>
        </footer>
      </section>
      <section className="ann-detail" {...(detail ? { role: "dialog", "aria-label": "Notification details" } : {})}>
        {detail ? (() => {
          const att = kind === "attendance";
          const tier = detail.riskTier;
          const recovered = detail.kind === "recovered";
          const tone = recovered ? "green" : tier === "High" ? "red" : tier === "Medium" ? "amber" : "mute";
          const tierText = recovered ? "Recovered" : tier === "High" ? "High risk" : tier === "Medium" ? "At risk" : tier === "Low" ? "On track" : null;
          const kindText = { opened: "Started falling behind", escalated: "Risk went up", recovered: "Back on track", assigned: "Assigned risk update" }[detail.kind];
          const reasons = (detail.reasonCodes || []).map((r) => attendanceReasonLabels[r?.code || r] || r?.code || r).filter(Boolean);
          const next = att ? { label: "View student", go: () => { persist(); onOpenAttendanceRisk?.({ studentId: detail.studentId, sectionId: detail.sectionId }); } }
            : /placement|company/i.test(detail.title || "") ? { label: "Review in Placements", go: () => navigate("/coordinator/placements") }
            : detail.studentId && /review|submitted|package|requirement|document|upload/i.test(`${detail.title} ${detail.message}`) ? { label: "Open in Requirements", go: () => navigate("/coordinator/requirements", { state: { sectionId: section?.id, openStudentId: detail.studentId } }) }
            : null;
          const goNext = async () => { if (!detail.read && !detail.loading) { try { await read(); } catch {} } next.go(); };
          return <>
            <header className="ann-detail-head"><span className="inbox-row-icon"><Icon name={rowIcon(kind, detail)} size={18} /></span>
              <div><h3>{att && detail.studentName ? detail.studentName : detail.title}</h3><p>{att ? "Attendance alert" : /placement|company/i.test(detail.title || "") ? "Placement" : /review|submitted|package|requirement|document/i.test(detail.title || "") ? "Submission" : "Activity"}{detail.createdAt ? ` · ${timestamp(detail.createdAt)}` : ""}</p></div>
              <b className="lb-chip" data-tone={detail.read ? "mute" : "blue"}>{detail.read ? "Read" : "Unread"}</b>
              <button type="button" className="plt-x" aria-label="Close details" onClick={close}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button></header>
            <div className="ann-detail-body">
              {att && (tierText || kindText) && <div className="ann-tier">{tierText && <b className="lb-chip" data-tone={tone}>{tierText}</b>}{kindText && <span>{kindText}{detail.previousRiskTier && detail.kind === "escalated" ? ` (from ${detail.previousRiskTier === "Medium" ? "At risk" : detail.previousRiskTier})` : ""}</span>}</div>}
              <div className="ann-what"><p className="inbox-detail-message">{detail.message}</p></div>
              {att && reasons.length > 0 && <div className="ann-sec2"><h4>Why</h4><ul className="anp-why">{reasons.map((r, i) => <li key={i}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17h.01" /></svg>{r}</li>)}</ul></div>}
              <dl className="ann-facts">
                {detail.studentName && <div><dt>Student</dt><dd><span className="ann-mini-av">{detail.studentName.split(/[ ,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>{detail.studentName}{detail.studentIdNumber ? <small> · {detail.studentIdNumber}</small> : null}</dd></div>}
                {section?.name && <div><dt>Section</dt><dd>{section.name}</dd></div>}
                {detail.createdAt && <div><dt>Received</dt><dd>{timestamp(detail.createdAt)}</dd></div>}
              </dl>
              {detail.loading && <p role="status" className="ann-loading">Loading details…</p>}
              {formError && <p role="alert">{formError}</p>}
            </div>
            <footer className="ann-detail-foot">
              <button className="rq-btn" onClick={read} disabled={saving || detail.read || detail.loading}>{saving ? "Saving…" : detail.read ? "Read" : "Mark as read"}</button>
              {next && !detail.loading && <button className="rq-btn rq-primary" onClick={goNext}>{next.label}</button>}
            </footer>
          </>;
        })() : !page.records.length && kind === "attendance" && !busy ? <div className="ann-how">
            <h4>How attendance alerts work</h4>
            <p>PATHWAY checks each student’s attendance every day and adds an alert here when:</p>
            <ul><li>Attendance drops below 90% or 80%</li><li>They’re absent several work days in a row</li><li>They’re not on pace to finish their hours by the deadline</li></ul>
            <p>You’ll also get an alert when a student recovers.</p>
          </div>
          : <div className="ann-pick"><Icon name="bell" size={30} /><strong>Pick a notification</strong><span>Its details will show here.</span></div>}
      </section>
      </div>}
      {draft && (() => {
        const target = sections.find((x) => x.id === draft.sectionId);
        const count = Array.isArray(target?.studentIds) ? target.studentIds.length : null;
        const ready = draft.sectionId && draft.title.trim() && draft.message.trim();
        return (
        <PortalFormDialog label="Post announcement" className="inbox-drawer ana-dialog" closeOnBackdrop onCancel={close}>
          <header className="ana-head">
            <div><h2>{announcement ? "Announcement posted" : "New announcement"}</h2>{!announcement && <p>Students get it in the app right away.</p>}</div>
            <button type="button" className="plt-x" onClick={close} disabled={saving} aria-label="Close drawer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
          </header>
          <form onSubmit={post}>
            <div className="ana-body">
              {announcement ? (
                <div className="ana-done">
                  <span aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg></span>
                  <strong role="status">Announcement posted to {announcement.count} students.</strong>
                  {announcement.announcementId && <div className="ana-email"><AnnouncementEmailDelivery announcementId={announcement.announcementId} /></div>}
                </div>
              ) : (
                <fieldset disabled={saving}>
                  <label className="ana-field"><span>Send to</span>
                    <span className="ana-sel"><select required aria-label="Section" value={draft.sectionId} onChange={(e) => setDraft({ ...draft, sectionId: e.target.value })}>
                      <option value="">Choose section</option>
                      {sections.map((x) => <option key={x.id} value={x.id}>{x.name}{Array.isArray(x.studentIds) ? ` · ${x.studentIds.length} students` : ""}</option>)}
                    </select><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span></label>
                  <label className="ana-field"><span>Title <em>{draft.title.length} / 120</em></span>
                    <input required aria-label="Title" maxLength={120} placeholder="e.g. Orientation moved to Friday" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
                  <label className="ana-field"><span>Message <em>{draft.message.length.toLocaleString()} / 4,000</em></span>
                    <textarea required aria-label="Message" rows={6} maxLength={4000} placeholder="Write the details students need…" value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} /></label>
                  {(draft.title.trim() || draft.message.trim()) && <div className="ana-preview" aria-label="Preview">
                    <small>Preview in the student app</small>
                    <div><span className="ana-pv-icon"><Icon name="megaphone" size={15} /></span><div><strong>{draft.title.trim() || "Title"}</strong><p>{draft.message.trim() || "Message"}</p></div></div>
                  </div>}
                </fieldset>
              )}
              {formError && <p role="alert" className="ana-err">{formError}</p>}
            </div>
            <footer className="ana-foot">
              <button type="button" className="rq-btn" onClick={close} disabled={saving}>{announcement ? "Done" : "Cancel"}</button>
              {!announcement && <button className="rq-btn rq-primary inbox-primary" disabled={saving || !ready}><Icon name="megaphone" size={15} />{saving ? "Posting…" : `Post to ${target?.name || "section"}`}</button>}
            </footer>
          </form>
        </PortalFormDialog>);
      })()}
    </div>
  );
}
