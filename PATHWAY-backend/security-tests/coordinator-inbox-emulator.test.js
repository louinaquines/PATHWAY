const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { installCoordinatorInbox, inboxFields } = require("../coordinatorInbox");
let app, db, server, origin;
before(async () => {
  assert.match(
    process.env.FIRESTORE_EMULATOR_HOST || "",
    /^(localhost|127\.0\.0\.1):/,
  );
  app = initializeApp({ projectId: "demo-inbox-qa" }, "inbox-qa");
  db = getFirestore(app);
  await db
    .doc("users/c")
    .set({ role: "coordinator", accountApproved: true, department: "D" });
  await db
    .doc("users/other")
    .set({ role: "coordinator", accountApproved: true, department: "D" });
  await db.doc("sections/s").set({ coordinatorId: "c", department: "D" });
  await db
    .doc("users/student")
    .set({ role: "student", department: "D", sectionId: "s" });
  const web = express();
  web.use(express.json());
  installCoordinatorInbox({
    app: web,
    db,
    requireStaff: (req, res, next) => {
      req.staff = { uid: req.headers.actor || "c" };
      next();
    },
    allowRate: () => true,
  });
  server = web.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  origin = `http://127.0.0.1:${server.address().port}/coordinator/inbox`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await deleteApp(app);
});
async function call(path, actor = "c", method = "GET", body) {
  const res = await fetch(origin + path, {
    method,
    headers: { actor, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
}
test("authorized queries, chronological ties, counts, details and read mutation", async () => {
  for (let offset = 0; offset < 50; offset += 10) {
    const batch = db.batch();
    for (let i = offset; i < offset + 10; i++) {
      const d = {
        recipientId: "c",
        title: i === 0 ? "Needle beyond page one" : "Document update",
        message: "Review this",
        read: false,
        createdAt: new Date(
          1700000000000 + Math.floor(i / 2) * 1000,
        ).toISOString(),
      };
      batch.set(db.doc(`notifications/n${String(i).padStart(3, "0")}`), {
        ...d,
        ...inboxFields(d),
      });
    }
    await batch.commit();
  }
  const p = await call("/activity?sectionId=s");
  assert.equal(p.status, 200);
  assert.equal(p.body.records.length, 10);
  assert.equal(p.body.records[0].id, "n049");
  assert.ok(p.body.cursor);
  const q = await call("/activity?sectionId=s&cursor=" + p.body.cursor);
  assert.equal(q.body.records[0].id, "n039");
  assert.equal(
    (await call("/activity?sectionId=s&search=needle")).body.records[0].id,
    "n000",
  );
  assert.equal((await call("/activity/counts?sectionId=s")).body.unread, 50);
  assert.equal((await call("/activity/n000?sectionId=s")).status, 200);
  assert.equal(
    (await call("/activity/n000/read?sectionId=s", "c", "POST", {})).status,
    200,
  );
  assert.equal((await call("/activity/counts?sectionId=s")).body.unread, 49);
  assert.equal((await call("/activity?sectionId=s", "other")).status, 403);
  assert.equal(
    (await call("/activity/n000/read?sectionId=s", "other", "POST", {})).status,
    403,
  );
  assert.equal((await call("/activity?sectionId=s&cursor=bad")).status, 400);
});
test("transferred students cannot expose attendance details or be marked read", async () => {
  const d = {
    recipientId: "c",
    studentId: "student",
    sectionId: "s",
    title: "Attendance risk update",
    kind: "opened",
    read: false,
    createdAt: new Date().toISOString(),
  };
  await db.doc("attendanceRiskNotices/a").set({ ...d, ...inboxFields(d) });
  assert.equal((await call("/attendance/a?sectionId=s")).status, 200);
  await db.doc("users/student").update({ sectionId: "elsewhere" });
  assert.equal((await call("/attendance/a?sectionId=s")).status, 403);
  assert.equal(
    (await call("/attendance/a/read?sectionId=s", "c", "POST", {})).status,
    403,
  );
  assert.equal((await call("/attendance?sectionId=s")).body.records.length, 0);
  assert.equal(
    (await db.doc("attendanceRiskNotices/a").get()).data().read,
    false,
  );
});
