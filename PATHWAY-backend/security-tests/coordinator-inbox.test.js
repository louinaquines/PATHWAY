const { test } = require("node:test");
const assert = require("node:assert/strict");
const { inboxFields, createInboxPager } = require("../coordinatorInbox");
for (const size of [1000, 10000])
  test(`indexed inbox pages ${size} records with 11-row reads`, async () => {
    const records = Array.from({ length: size }, (_, i) => ({
      id: `n${String(i).padStart(5, "0")}`,
      ...inboxFields({
        title: i === 1 ? "Rare document" : "Document update",
        message: "Ready for review",
        createdAt: new Date(1700000000000 + i * 1000).toISOString(),
        read: i % 2 === 0,
      }),
      recipientId: "c",
      sectionId: "s",
    }));
    let max = 0;
    const query = (filters = [], sort = [], after = null, cap = Infinity) => ({
      where: (...f) => query([...filters, f], sort, after, cap),
      orderBy: (...f) => query(filters, [...sort, f], after, cap),
      startAfter: (...v) => query(filters, sort, v, cap),
      limit: (n) => query(filters, sort, after, n),
      get: async () => {
        let rows = records
          .filter((r) =>
            filters.every(([k, op, v]) =>
              op === "array-contains" ? r[k].includes(v) : r[k] === v,
            ),
          )
          .sort((a, b) => b.inboxAt - a.inboxAt || b.id.localeCompare(a.id));
        if (after)
          rows = rows.filter(
            (r) =>
              r.inboxAt < after[0] ||
              (r.inboxAt === after[0] && r.id < after[1]),
          );
        rows = rows.slice(0, cap);
        max = Math.max(max, rows.length);
        return {
          docs: rows.map((r) => ({ id: r.id, data: () => r })),
          size: rows.length,
        };
      },
    });
    const pager = createInboxPager(
      { collection: () => query() },
      Buffer.alloc(32, 1),
    );
    let cursor,
      ids = [];
    do {
      const p = await pager({
        actor: "c",
        kind: "activity",
        sectionId: "s",
        search: "",
        unread: false,
        cursor,
      });
      assert.ok(p.records.length <= 10);
      ids.push(...p.records.map((r) => r.id));
      cursor = p.cursor;
    } while (cursor);
    assert.equal(ids.length, size);
    assert.equal(new Set(ids).size, size);
    assert.ok(max <= 11);
    const found = await pager({
      actor: "c",
      kind: "activity",
      sectionId: "s",
      search: "rare",
      unread: false,
    });
    assert.equal(found.records[0].id, "n00001");
    assert.equal(
      (
        await pager({
          actor: "c",
          kind: "activity",
          sectionId: "s",
          search: "nothing",
          unread: false,
        })
      ).records.length,
      0,
    );
    const p = await pager({
      actor: "c",
      kind: "activity",
      sectionId: "s",
      search: "",
      unread: false,
    });
    await assert.rejects(
      () =>
        pager({
          actor: "other",
          kind: "activity",
          sectionId: "s",
          search: "",
          unread: false,
          cursor: p.cursor,
        }),
      /expired/i,
    );
    await assert.rejects(
      () =>
        pager({
          actor: "c",
          kind: "activity",
          sectionId: "s",
          search: "",
          unread: true,
          cursor: p.cursor,
        }),
      /expired/i,
    );
    assert.ok(
      (
        await pager({
          actor: "c",
          kind: "activity",
          sectionId: "s",
          search: "",
          unread: true,
        })
      ).records.every((r) => r.read === false),
    );
  });
test("legacy timestamps and missing read fields stay indexable", () => {
  assert.equal(inboxFields({}).inboxAt, 0);
  assert.equal(inboxFields({}).inboxRead, false);
  assert.ok(
    inboxFields({ title: "Évaluation submitted" }).inboxSearch.includes(
      "evaluation",
    ),
  );
});
