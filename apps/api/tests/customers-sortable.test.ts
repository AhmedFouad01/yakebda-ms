import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";
import { CUSTOMER_SORT_FIELDS } from "@ykms/contracts";

interface PageBody {
  data: Array<Record<string, unknown>>;
  next_cursor: string | null;
  has_more: boolean;
}

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let otherAccountId = "";
let accountId = "";
let branchId = "";
let branch2Id = "";

const TAG = "W4F-Sort";
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function login(email: string, password: string): Promise<string> {
  const r = await request(app).post("/api/v1/auth/login").send({ email, password });
  expect(r.status).toBe(200);
  return r.body.token;
}

async function getPage(query: Record<string, string | number> = {}, token = ownerToken): Promise<PageBody> {
  const r = await request(app).get("/api/v1/customers").query({ search: TAG, ...query }).set(auth(token));
  expect(r.status).toBe(200);
  return r.body;
}

/** Walk all pages under a fixed sort; assert cursor chain sanity. */
async function collect(query: Record<string, string | number>, limit: number): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let i = 0; i < 50; i += 1) {
    const page: PageBody = await getPage({ ...query, limit, ...(cursor ? { cursor } : {}) });
    rows.push(...page.data);
    if (!page.has_more) return rows;
    expect(page.next_cursor).toBeTruthy();
    expect(seen.has(page.next_cursor!)).toBe(false);
    seen.add(page.next_cursor!);
    cursor = page.next_cursor!;
  }
  throw new Error("cursor walk did not terminate");
}

function assertSorted(rows: Array<Record<string, unknown>>, key: string, direction: "asc" | "desc", numeric = false) {
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1][key];
    const b = rows[i][key];
    if (a === null || b === null) {
      // NULLS LAST: once null appears, everything after must be null
      if (a === null) expect(b).toBeNull();
      continue;
    }
    const [x, y] = numeric ? [Number(a), Number(b)] : [String(a), String(b)];
    if (direction === "asc") expect(x <= y || x === y).toBe(true);
    else expect(x >= y || x === y).toBe(true);
  }
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  accountId = seed.accountId;
  branchId = seed.branchId;
  branch2Id = seed.branch2Id!;
  app = createApp(db);
  ownerToken = await login(seed.ownerEmail, seed.ownerPassword);

  // Fixture matrix: 7 customers with distinct aggregate profiles.
  // c0: zero orders. c1: 1 completed@b1. c2: 3 completed@b1 (2 same total → duplicate primary values).
  // c3: 1 completed + 1 cancelled @b2 (cancelled excluded). c4: only cancelled (⇒ counts 0? no — cancelled excluded ⇒ zero aggregates).
  // c5,c6: same total_spent (duplicate) different ids.
  const mk = async (i: number, name: string, phone: string | null) => {
    const id = newId();
    await db("customers").insert({ id, account_id: accountId, name: `${TAG} ${name}`, phone });
    return id;
  };
  const c0 = await mk(0, "Zero", null);
  const c1 = await mk(1, "One", "0100000001");
  const c2 = await mk(2, "Three", "0100000002");
  const c3 = await mk(3, "Mixed", null);
  const c4 = await mk(4, "Cancelled", "0100000004");
  const c5 = await mk(5, "TwinA", "0100000005");
  const c6 = await mk(6, "TwinB", "0100000006");

  const owner = await db("users").where({ account_id: accountId, email: seed.ownerEmail }).first();
  let seq = 0;
  const order = async (customerId: string, total: number, status: string, branch = branchId, at?: string) => {
    seq += 1;
    const ts = at ?? new Date(Date.now() - seq * 60000).toISOString();
    await db("orders").insert({
      id: newId(),
      account_id: accountId,
      branch_id: branch,
      order_no: 9000 + seq,
      numbering_key: `w4f-${seq}`,
      order_type: "takeaway",
      status,
      customer_id: customerId,
      subtotal: total,
      discount: 0,
      total,
      created_by: owner.id,
      created_at: ts,
      updated_at: ts,
    });
  };
  await order(c1, 100, "completed");
  await order(c2, 50, "completed");
  await order(c2, 50, "completed");
  await order(c2, 20, "completed");
  await order(c3, 80, "completed", branch2Id);
  await order(c3, 999, "cancelled", branch2Id);
  await order(c4, 500, "cancelled");
  await order(c5, 70, "completed");
  await order(c6, 70, "completed");

  // Cross-account isolation fixture
  otherAccountId = newId();
  await db("accounts").insert({ id: otherAccountId, name: "حساب آخر" });
  await db("customers").insert({ id: newId(), account_id: otherAccountId, name: `${TAG} Foreign`, phone: "0999999999" });
}, 60000);

afterAll(async () => {
  await db.destroy();
});

describe("W4f sortable aggregate customers list", () => {
  it("returns aggregate columns with correct values and policies", async () => {
    const page = await getPage({ sort: "name", direction: "asc", limit: 50 });
    const byName = new Map(page.data.map((r) => [String(r.name).replace(`${TAG} `, ""), r]));

    const zero = byName.get("Zero")!;
    expect(zero.orders_count).toBe(0);
    expect(zero.total_spent).toBe(0);
    expect(zero.avg_order).toBeNull(); // no divide by zero
    expect(zero.last_order_at).toBeNull();
    expect(zero.branch_name).toBeNull();

    const three = byName.get("Three")!;
    expect(three.orders_count).toBe(3);
    expect(Number(three.total_spent)).toBe(120);
    expect(Number(three.avg_order)).toBe(40);

    // cancelled orders excluded everywhere
    const cancelled = byName.get("Cancelled")!;
    expect(cancelled.orders_count).toBe(0);
    expect(Number(cancelled.total_spent)).toBe(0);
    const mixed = byName.get("Mixed")!;
    expect(mixed.orders_count).toBe(1);
    expect(Number(mixed.total_spent)).toBe(80);
    expect(typeof mixed.branch_name).toBe("string");
  });

  it("supports every whitelisted field in both directions", async () => {
    for (const field of CUSTOMER_SORT_FIELDS) {
      for (const direction of ["asc", "desc"] as const) {
        const r = await request(app).get("/api/v1/customers").query({ search: TAG, sort: field, direction }).set(auth(ownerToken));
        expect(r.status, `${field} ${direction}`).toBe(200);
      }
    }
  });

  it("sorts by total_spent desc with correct ordering", async () => {
    const rows = await collect({ sort: "total_spent", direction: "desc" }, 50);
    assertSorted(rows, "total_spent", "desc", true);
    expect(Number(rows[0].total_spent)).toBe(120);
  });

  it("keeps NULLS LAST determinism for nullable sorts in both directions", async () => {
    for (const direction of ["asc", "desc"] as const) {
      const rows = await collect({ sort: "last_order_at", direction }, 50);
      const nullsStart = rows.findIndex((r) => r.last_order_at === null);
      if (nullsStart >= 0) {
        expect(rows.slice(nullsStart).every((r) => r.last_order_at === null)).toBe(true);
      }
      assertSorted(rows, "last_order_at", direction);
    }
  });

  it("paginates duplicate primary values without duplicates or gaps (id tie-breaker)", async () => {
    const all = await collect({ sort: "total_spent", direction: "desc" }, 50);
    const paged = await collect({ sort: "total_spent", direction: "desc" }, 2);
    expect(paged.map((r) => r.id)).toEqual(all.map((r) => r.id));
    expect(new Set(paged.map((r) => r.id)).size).toBe(paged.length);
  });

  it("paginates a nullable sort across the null boundary without loss", async () => {
    const all = await collect({ sort: "avg_order", direction: "desc" }, 50);
    const paged = await collect({ sort: "avg_order", direction: "desc" }, 2);
    expect(paged.map((r) => r.id)).toEqual(all.map((r) => r.id));
  });

  it("applies the cursor for the default unsearched list (P3 latent fix)", async () => {
    const first = await request(app).get("/api/v1/customers").query({ limit: 2 }).set(auth(ownerToken));
    expect(first.status).toBe(200);
    if (first.body.has_more) {
      const second = await request(app)
        .get("/api/v1/customers")
        .query({ limit: 2, cursor: first.body.next_cursor })
        .set(auth(ownerToken));
      expect(second.status).toBe(200);
      const firstIds = new Set(first.body.data.map((r: { id: string }) => r.id));
      for (const row of second.body.data) expect(firstIds.has(row.id)).toBe(false);
    }
  });

  it("rejects invalid sort and mismatched cursors with structured 400s", async () => {
    const badSort = await request(app).get("/api/v1/customers").query({ sort: "password" }).set(auth(ownerToken));
    expect(badSort.status).toBe(400);

    const minted = await getPage({ sort: "name", direction: "asc", limit: 2 });
    if (minted.next_cursor) {
      const mismatch = await request(app)
        .get("/api/v1/customers")
        .query({ sort: "total_spent", direction: "desc", cursor: minted.next_cursor })
        .set(auth(ownerToken));
      expect(mismatch.status).toBe(400);
      const wrongDir = await request(app)
        .get("/api/v1/customers")
        .query({ sort: "name", direction: "desc", cursor: minted.next_cursor })
        .set(auth(ownerToken));
      expect(wrongDir.status).toBe(400);
    }
  });

  it("enforces account isolation and permission gates", async () => {
    const rows = await collect({ sort: "name", direction: "asc" }, 50);
    expect(rows.some((r) => String(r.name).includes("Foreign"))).toBe(false);

    const anon = await request(app).get("/api/v1/customers");
    expect(anon.status).toBe(401);

    const kitchenToken = await login("kitchen@ykms.local", "Kitchen@12345");
    const forbidden = await request(app).get("/api/v1/customers").set(auth(kitchenToken));
    expect(forbidden.status).toBe(403);
  });

  it("issues a single SQL query per page (no N+1)", async () => {
    let count = 0;
    const onQuery = () => { count += 1; };
    db.on("query", onQuery);
    try {
      await request(app).get("/api/v1/customers").query({ search: TAG, sort: "total_spent", direction: "desc", limit: 50 }).set(auth(ownerToken));
    } finally {
      db.removeListener("query", onQuery);
    }
    // auth middleware queries + exactly one list query; far below per-row N+1 (7 fixture customers)
    expect(count).toBeLessThanOrEqual(4);
  });
});
