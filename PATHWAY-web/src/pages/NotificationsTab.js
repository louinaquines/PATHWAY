import { useEffect, useRef, useState } from "react";
import { adminRequest } from "../adminApi";
import { PortalFormDialog } from "../components/PortalStates";
import Icon from "../components/Icons";
import AttendanceAccess from "../components/AttendanceAccess";
import AnnouncementEmailDelivery from "../components/AnnouncementEmailDelivery";
import "./NotificationsTab.css";
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
}) {
  return (
    <AttendanceAccess key={userId} actorId={userId}>
      {(access) => (
        <NotificationWorkspace
          userId={userId}
          section={section}
          sections={sections}
          onOpenAttendanceRisk={onOpenAttendanceRisk}
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
  access,
}) {
  const storage = `pathway-inbox:${userId}`;
  const saved = useRef(null);
  if (saved.current === null) {
    try {
      saved.current = JSON.parse(sessionStorage.getItem(storage)) || {};
    } catch {
      saved.current = {};
    }
  }
  const [kind, setKind] = useState(saved.current.kind || "activity"),
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
    if (!section?.id) return;
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
    if (!section?.id) return;
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
      if (detailVersion.current === generation && access.isCurrent())
        setDetail(result);
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
      if (access.isCurrent()) setAnnouncement(result);
    } catch {
      setFormError(
        "Could not post the announcement. Your draft is still here.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="notifications-workspace">
      <div className="inbox-heading">
        <div role="tablist" aria-label="Inbox">
          <button
            role="tab"
            aria-selected={kind === "activity"}
            onClick={() => setKind("activity")}
          >
            Activity
          </button>
          <button
            role="tab"
            aria-selected={kind === "attendance"}
            onClick={() => setKind("attendance")}
          >
            Attendance alerts
          </button>
        </div>
        <button
          className="inbox-primary"
          onClick={(event) => {
            opener.current = event.currentTarget;
            setFormError("");
            setDraft({ sectionId: section?.id || "", title: "", message: "" });
          }}
        >
          Post announcement
        </button>
      </div>
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
          <button onClick={() => setRetry((v) => v + 1)} disabled={busy}>
            <Icon name="refresh" size={16} />
            Refresh
          </button>
          <span className="inbox-count">
            {Number.isFinite(counts.unread)
              ? `${counts.unread} unread`
              : "Unread count unavailable"}
          </span>
        </div>
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
            <div className="inbox-state" role="alert">
              {error}
              <button onClick={() => setRetry((v) => v + 1)}>Retry</button>
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
                    : "No notifications yet."}
              </strong>
              <span>
                {query
                  ? "Try a different search term or clear the filter."
                  : kind === "attendance"
                    ? "Attendance risk alerts for this section will appear here."
                    : "Student submissions, reviews and other section activity will appear here."}
              </span>
            </div>
          ) : (
            page.records.map((row) => (
              <button
                className="inbox-row"
                key={row.id}
                onClick={(event) => open(row, event)}
              >
                <span className="inbox-row-icon">
                  <Icon
                    name={kind === "attendance" ? "clock" : "bell"}
                    size={20}
                  />
                </span>
                <span className="inbox-row-copy">
                  <strong>{row.title}</strong>
                  <span>{row.message}</span>
                </span>
                <time>{timestamp(row.createdAt)}</time>
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
      {(detail || draft) && (
        <PortalFormDialog
          label={draft ? "Post announcement" : "Notification details"}
          className="inbox-drawer"
          closeOnBackdrop
          onCancel={close}
        >
          <header>
            <h2>{draft ? "Post announcement" : "Notification details"}</h2>
            <button onClick={close} disabled={saving} aria-label="Close drawer">
              ×
            </button>
          </header>
          {draft ? (
            <form onSubmit={post}>
              <div className="inbox-drawer-body">
                {announcement ? (
                  <>
                    <p role="status">
                      Announcement posted to {announcement.count} students.
                    </p>
                    {announcement.announcementId && (
                      <AnnouncementEmailDelivery
                        announcementId={announcement.announcementId}
                      />
                    )}
                  </>
                ) : (
                  <fieldset disabled={saving}>
                    <label>
                      Section
                      <select
                        required
                        value={draft.sectionId}
                        onChange={(e) =>
                          setDraft({ ...draft, sectionId: e.target.value })
                        }
                      >
                        <option value="">Choose section</option>
                        {sections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Title
                      <input
                        required
                        maxLength={200}
                        value={draft.title}
                        onChange={(e) =>
                          setDraft({ ...draft, title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Message
                      <textarea
                        required
                        rows={7}
                        maxLength={5000}
                        value={draft.message}
                        onChange={(e) =>
                          setDraft({ ...draft, message: e.target.value })
                        }
                      />
                    </label>
                  </fieldset>
                )}
                {formError && <p role="alert">{formError}</p>}
              </div>
              <footer>
                <button type="button" onClick={close} disabled={saving}>
                  {announcement ? "Close" : "Cancel"}
                </button>
                {!announcement && (
                  <button className="inbox-primary" disabled={saving}>
                    {saving ? "Posting…" : "Post announcement"}
                  </button>
                )}
              </footer>
            </form>
          ) : (
            <>
              <div className="inbox-drawer-body">
                <h3>{detail.title}</h3>
                <time>{timestamp(detail.createdAt)}</time>
                <p className="inbox-detail-message">{detail.message}</p>
                {detail.loading && <p role="status">Loading details…</p>}
                {formError && <p role="alert">{formError}</p>}
              </div>
              <footer>
                {kind === "attendance" && !detail.loading && (
                  <button
                    onClick={() => {
                      persist();
                      onOpenAttendanceRisk?.({
                        studentId: detail.studentId,
                        sectionId: detail.sectionId,
                      });
                    }}
                  >
                    View student
                  </button>
                )}
                <button
                  className="inbox-primary"
                  onClick={read}
                  disabled={saving || detail.read || detail.loading}
                >
                  {saving ? "Saving…" : detail.read ? "Read" : "Mark as read"}
                </button>
              </footer>
            </>
          )}
        </PortalFormDialog>
      )}
    </div>
  );
}
