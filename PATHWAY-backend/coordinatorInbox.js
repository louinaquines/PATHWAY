const crypto = require("node:crypto");
const { FieldPath } = require("firebase-admin/firestore");
const { assertAttendanceAccess } = require("./attendanceExcusedDates");
const normalize = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
// Prefixes for each word and phrase start keep search indexed and bounded per document.
function inboxFields(data) {
  const text = normalize(
    [
      data.title,
      data.message,
      data.type,
      data.kind,
      data.riskTier,
      data.progressStatus,
      ...(data.reasonCodes || []),
    ]
      .filter(Boolean)
      .join(" "),
  ).slice(0, 2000);
  const words = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean),
    tokens = new Set();
  for (let i = 0; i < words.length; i++) {
    const phrase = words.slice(i).join(" ").slice(0, 80);
    for (let n = 1; n <= phrase.length; n++) tokens.add(phrase.slice(0, n));
  }
  const date = data.createdAt?.toDate
    ? data.createdAt.toDate()
    : data.createdAt;
  return {
    inboxVersion: 1,
    inboxAt: Number.isFinite(new Date(date).getTime())
      ? new Date(date).getTime()
      : 0,
    inboxRead: data.read === true,
    inboxSearch: [...tokens].slice(0, 5000),
  };
}
const invalid = () =>
  Object.assign(new Error("This page has expired. Refresh the inbox."), {
    status: 400,
  });
function createInboxPager(db, key = crypto.randomBytes(32)) {
  const seal = (value) => {
    const iv = crypto.randomBytes(12),
      c = crypto.createCipheriv("aes-256-gcm", key, iv);
    const bytes = Buffer.concat([c.update(JSON.stringify(value)), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), bytes]).toString("base64url");
  };
  function open(value) {
    try {
      if (typeof value !== "string" || value.length > 2048) throw invalid();
      const b = Buffer.from(value, "base64url"),
        d = crypto.createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]));
    } catch {
      throw invalid();
    }
  }
  return async function page({
    actor,
    kind,
    sectionId,
    search = "",
    unread = false,
    cursor,
  }) {
    const scope = JSON.stringify([
      actor,
      kind,
      sectionId,
      normalize(search),
      unread,
    ]);
    let after;
    if (cursor) {
      const token = open(cursor);
      if (
        token.scope !== scope ||
        token.expires < Date.now() ||
        !Array.isArray(token.after)
      )
        throw invalid();
      after = token.after;
    }
    let q = db
      .collection(
        kind === "attendance" ? "attendanceRiskNotices" : "notifications",
      )
      .where("recipientId", "==", actor);
    // Activity is recipient-wide: older activity has no reliable section reference.
    if (kind === "attendance") q = q.where("sectionId", "==", sectionId);
    if (unread) q = q.where("inboxRead", "==", false);
    if (search) q = q.where("inboxSearch", "array-contains", normalize(search));
    q = q.orderBy("inboxAt", "desc").orderBy(FieldPath.documentId(), "desc");
    if (after) q = q.startAfter(...after);
    const result = await q.limit(11).get(),
      docs = result.docs.slice(0, 10),
      last = docs.at(-1);
    return {
      records: docs.map((s) => {
        const d = s.data();
        return {
          id: s.id,
          title: d.title || "Attendance update",
          message:
            d.message ||
            [d.kind, d.riskTier, d.progressStatus].filter(Boolean).join(" · "),
          createdAt: d.inboxAt ? new Date(d.inboxAt).toISOString() : null,
          read: d.inboxRead,
          studentId: d.studentId,
          sectionId: d.sectionId,
          type: d.type,
          kind: d.kind,
        };
      }),
      hasMore: result.size > 10,
      cursor:
        result.size > 10
          ? seal({
              scope,
              after: [last.data().inboxAt, last.id],
              expires: Date.now() + 3600000,
            })
          : null,
    };
  };
}
function installCoordinatorInbox({ app, db, requireStaff, allowRate }) {
  const page = createInboxPager(db),
    id = (v) => typeof v === "string" && /^[\w-]{1,128}$/.test(v);
  async function authorize(req) {
    if (
      !id(req.query.sectionId) ||
      !["activity", "attendance"].includes(req.params.kind)
    )
      throw Object.assign(new Error("Choose an assigned section."), {
        status: 400,
      });
    await assertAttendanceAccess(db, req.staff.uid, req.query.sectionId);
  }
  const guard = (fn) => async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (
      !allowRate(req, res, {
        limit: 90,
        windowMs: 60000,
        key: (r) => `coordinator-inbox:${r.staff.uid}`,
      })
    )
      return;
    try {
      await authorize(req);
      await fn(req, res);
    } catch (e) {
      res
        .status(e.status || 503)
        .json({
          error:
            e.status === 400
              ? e.message
              : e.status === 403
                ? "You no longer have access to this inbox."
                : "Could not load the inbox. Try again.",
        });
    }
  };
  app.get(
    "/coordinator/inbox/:kind",
    requireStaff,
    guard(async (req, res) => {
      if (
        Object.keys(req.query).some(
          (k) => !["sectionId", "search", "unread", "cursor"].includes(k),
        ) ||
        typeof (req.query.search || "") !== "string" ||
        (req.query.search || "").length > 80 ||
        !["0", "1", undefined].includes(req.query.unread)
      )
        throw invalid();
      const result = await page({
        actor: req.staff.uid,
        kind: req.params.kind,
        ...req.query,
        unread: req.query.unread === "1",
      });
      if (req.params.kind === "attendance") {
        const allowed = [];
        for (const row of result.records) {
          try {
            await assertAttendanceAccess(
              db,
              req.staff.uid,
              row.sectionId,
              row.studentId,
            );
            allowed.push(row);
          } catch (e) {
            if (e.status !== 403) throw e;
          }
        }
        result.records = allowed;
      }
      await authorize(req);
      res.json(result);
    }),
  );
  app.get(
    "/coordinator/inbox/:kind/counts",
    requireStaff,
    guard(async (req, res) => {
      let q = db
        .collection(
          req.params.kind === "attendance"
            ? "attendanceRiskNotices"
            : "notifications",
        )
        .where("recipientId", "==", req.staff.uid);
      if (req.params.kind === "attendance")
        q = q.where("sectionId", "==", req.query.sectionId);
      const unread = (
        await q.where("inboxRead", "==", false).count().get()
      ).data().count;
      await authorize(req);
      res.json({ unread });
    }),
  );
  app.get(
    "/coordinator/inbox/:kind/:id",
    requireStaff,
    guard(async (req, res) => {
      const result = await detail(req);
      await authorize(req);
      res.json(result);
    }),
  );
  async function detail(req) {
    if (!id(req.params.id)) throw invalid();
    const ref = db
        .collection(
          req.params.kind === "attendance"
            ? "attendanceRiskNotices"
            : "notifications",
        )
        .doc(req.params.id),
      snap = await ref.get(),
      d = snap.data();
    if (!snap.exists || d.recipientId !== req.staff.uid)
      throw Object.assign(new Error(), { status: 403 });
    if (req.params.kind === "attendance")
      await assertAttendanceAccess(db, req.staff.uid, d.sectionId, d.studentId);
    return {
      id: snap.id,
      title: d.title || "Attendance update",
      message:
        d.message ||
        [d.kind, d.riskTier, d.progressStatus, ...(d.reasonCodes || [])]
          .filter(Boolean)
          .join(" · "),
      read: d.read === true,
      createdAt: d.inboxAt ? new Date(d.inboxAt).toISOString() : null,
      studentId: d.studentId,
      sectionId: d.sectionId,
    };
  }
  app.post(
    "/coordinator/inbox/:kind/:id/read",
    requireStaff,
    guard(async (req, res) => {
      if (
        !id(req.params.id) ||
        !req.body ||
        Array.isArray(req.body) ||
        Object.keys(req.body).length
      )
        throw invalid();
      await db.runTransaction(async (tx) => {
        const ref = db
          .collection(
            req.params.kind === "attendance"
              ? "attendanceRiskNotices"
              : "notifications",
          )
          .doc(req.params.id);
        const snap = await tx.get(ref);
        if (!snap.exists || snap.data().recipientId !== req.staff.uid)
          throw Object.assign(new Error(), { status: 403 });
        await assertAttendanceAccess(
          db,
          req.staff.uid,
          req.query.sectionId,
          undefined,
          tx,
        );
        if (req.params.kind === "attendance")
          await assertAttendanceAccess(
            db,
            req.staff.uid,
            snap.data().sectionId,
            snap.data().studentId,
            tx,
          );
        tx.update(ref, { read: true, inboxRead: true });
      });
      await authorize(req);
      res.json({ read: true });
    }),
  );
}
module.exports = { inboxFields, createInboxPager, installCoordinatorInbox };
