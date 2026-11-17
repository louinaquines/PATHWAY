// Audit/backfill only notification query fields. Dry run unless --apply is supplied.
const { inboxFields } = require("../coordinatorInbox");
const fs = require("node:fs");
async function main() {
  const project = process.env.INBOX_PROJECT || "pathway-57400",
    apply = process.argv.includes("--apply");
  const auth = require("firebase-tools/lib/auth"),
    options = { project, nonInteractive: true };
  const account = auth.getGlobalDefaultAccount();
  if (account) auth.setActiveAccount(options, account);
  await require("firebase-tools/lib/requireAuth").requireAuth(options);
  const { Client } = require("firebase-tools/lib/apiv2"),
    client = new Client({
      urlPrefix: "https://firestore.googleapis.com",
      apiVersion: "v1",
    }),
    base = `/projects/${project}/databases/(default)/documents`;
  const decode = (v) =>
    v?.stringValue ??
    v?.booleanValue ??
    (v?.integerValue !== undefined
      ? Number(v.integerValue)
      : v?.timestampValue) ??
    (v?.arrayValue ? (v.arrayValue.values || []).map(decode) : null);
  const encode = (v) =>
    typeof v === "boolean"
      ? { booleanValue: v }
      : typeof v === "number"
        ? { integerValue: String(v) }
        : Array.isArray(v)
          ? { arrayValue: { values: v.map(encode) } }
          : { stringValue: v };
  const report = {
    project,
    apply,
    collections: {},
    updated: 0,
    at: new Date().toISOString(),
  };
  for (const collection of ["notifications", "attendanceRiskNotices"]) {
    let token;
    const stats = { records: 0, missing: 0, invalidTimestamps: 0 };
    do {
      const response = await client.get(`${base}/${collection}`, {
        queryParams: { pageSize: 100, ...(token ? { pageToken: token } : {}) },
      });
      for (const doc of response.body.documents || []) {
        const data = Object.fromEntries(
          Object.entries(doc.fields || {}).map(([k, v]) => [k, decode(v)]),
        );
        stats.records++;
        const fields = inboxFields(data);
        if (!fields.inboxAt) stats.invalidTimestamps++;
        if (
          data.inboxVersion !== 1 ||
          data.inboxAt !== fields.inboxAt ||
          data.inboxRead !== fields.inboxRead
        ) {
          stats.missing++;
          if (apply) {
            const mask = new URLSearchParams();
            for (const field of Object.keys(fields)) mask.append('updateMask.fieldPaths', field);
            mask.set('currentDocument.updateTime', doc.updateTime);
            await client.patch('/' + doc.name + '?' + mask, {
              fields: Object.fromEntries(Object.entries(fields).map(([k,v]) => [k,encode(v)]))
            });
            report.updated++;
          }
        }
      }
      token = response.body.nextPageToken;
    } while (token);
    report.collections[collection] = stats;
  }
  fs.writeFileSync(
    process.env.INBOX_AUDIT_OUTPUT || "inbox-audit.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}
main().catch((e) => {
  console.error(
    "Inbox audit/backfill unavailable:",
    e.status || e.code || "authentication/network error",
  );
  process.exitCode = 1;
});
