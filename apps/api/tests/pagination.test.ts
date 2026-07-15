import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";
import { signUserToken } from "../src/middleware/auth";

interface PageBody {
  data: Array<Record<string, unknown>>;
  next_cursor: string | null;
  has_more: boolean;
}

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let secondAccountToken = "";
let lookupOnlyToken = "";
let accountId = "";
let branchId = "";
let categoryId = "";
let secondCategoryId = "";
let orderCustomerId = "";

const customerSearch = "R12-Page-Customer";
const customerIds: string[] = [];
const productIds: string[] = [];
const orderIds: string[] = [];

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function login(email: string, password: string): Promise<string> {
  const response = await request(app).post("/api/v1/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  return response.body.token;
}

async function getPage(
  path: string,
  token: string,
  query: Record<string, string | number> = {}
): Promise<PageBody> {
  const response = await request(app).get(path).query(query).set(auth(token));
  expect(response.status).toBe(200);
  const body: PageBody = response.body;
  expect(typeof body.has_more).toBe("boolean");
  return body;
}

async function collectPages(
  path: string,
  token: string,
  query: Record<string, string | number>,
  limit: number
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  for (let page = 0; page < 100; page += 1) {
    const body = await getPage(path, token, { ...query, limit, ...(cursor ? { cursor } : {}) });
    rows.push(...body.data);
    if (!body.has_more) {
      expect(body.next_cursor).toBeNull();
      return rows;
    }
    expect(body.next_cursor).toBeTypeOf("string");
    expect(seenCursors.has(body.next_cursor!)).toBe(false);
    seenCursors.add(body.next_cursor!);
    cursor = body.next_cursor;
  }

  throw new Error("Pagination traversal exceeded the test safety bound");
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  accountId = seed.accountId;
  branchId = seed.branchId;
  app = createApp(db);
  ownerToken = await login(seed.ownerEmail, seed.ownerPassword);

  const tiedCustomerTime = new Date("2026-01-02T10:00:00.000Z");
  for (let index = 0; index < 7; index += 1) {
    const id = newId();
    customerIds.push(id);
    await db("customers").insert({
      id,
      account_id: accountId,
      name: `${customerSearch}-${index}`,
      phone: `010000000${index}`,
      created_at: tiedCustomerTime,
      updated_at: tiedCustomerTime,
    });
  }

  orderCustomerId = newId();
  await db("customers").insert({
    id: orderCustomerId,
    account_id: accountId,
    name: "R12-Order-Customer",
  });
  const owner = await db("users").where({ email: seed.ownerEmail }).first();
  for (let index = 0; index < 5; index += 1) {
    const id = newId();
    orderIds.push(id);
    await db("orders").insert({
      id,
      account_id: accountId,
      branch_id: branchId,
      customer_id: orderCustomerId,
      order_no: 0,
      numbering_key: "temporary",
      order_type: "takeaway",
      status: "submitted",
      subtotal: 20 + index,
      total: 20 + index,
      created_by: owner.id,
      created_at: tiedCustomerTime,
      updated_at: tiedCustomerTime,
    });
  }

  categoryId = newId();
  await db("categories").insert({
    id: categoryId,
    account_id: accountId,
    name_ar: "R12 Category",
    sort_order: 900,
  });
  for (let index = 0; index < 7; index += 1) {
    const id = newId();
    productIds.push(id);
    await db("products").insert({
      id,
      account_id: accountId,
      category_id: categoryId,
      name_ar: `R12 Product ${index}`,
      base_price: 10 + index,
      sort_order: Math.floor(index / 2),
    });
  }

  const secondAccountId = newId();
  const secondBranchId = newId();
  const secondRoleId = newId();
  const secondUserId = newId();
  await db("accounts").insert({ id: secondAccountId, name: "R12 Second Account" });
  await db("branches").insert({ id: secondBranchId, account_id: secondAccountId, name: "R12 Second Branch" });
  await db("roles").insert({
    id: secondRoleId,
    account_id: secondAccountId,
    key: "r12_owner",
    name_ar: "R12 Owner",
  });
  await db("role_permissions").insert([
    { role_id: secondRoleId, permission_key: "customers.manage" },
    { role_id: secondRoleId, permission_key: "customers.lookup" },
  ]);
  await db("users").insert({
    id: secondUserId,
    account_id: secondAccountId,
    branch_id: secondBranchId,
    name: "R12 Second User",
    is_active: true,
  });
  await db("user_roles").insert({ user_id: secondUserId, role_id: secondRoleId });
  secondAccountToken = signUserToken({
    id: secondUserId,
    accountId: secondAccountId,
    branchId: secondBranchId,
    name: "R12 Second User",
    permissions: [],
    roles: [],
  });
  await db("customers").insert({
    id: newId(),
    account_id: secondAccountId,
    name: "R12 Second Customer",
    created_at: new Date("2025-01-01T00:00:00.000Z"),
  });
  secondCategoryId = newId();
  await db("categories").insert({
    id: secondCategoryId,
    account_id: secondAccountId,
    name_ar: "R12 Second Category",
  });
  await db("products").insert({
    id: newId(),
    account_id: secondAccountId,
    category_id: secondCategoryId,
    name_ar: "R12 Second Product",
    base_price: 10,
    sort_order: 50,
  });

  const lookupRoleId = newId();
  const lookupUserId = newId();
  await db("roles").insert({
    id: lookupRoleId,
    account_id: accountId,
    key: "r12_lookup_only",
    name_ar: "R12 Lookup Only",
  });
  await db("role_permissions").insert({ role_id: lookupRoleId, permission_key: "customers.lookup" });
  await db("users").insert({
    id: lookupUserId,
    account_id: accountId,
    branch_id: seed.branch2Id,
    name: "R12 Branch Lookup User",
    is_active: true,
  });
  await db("user_roles").insert({ user_id: lookupUserId, role_id: lookupRoleId });
  lookupOnlyToken = signUserToken({
    id: lookupUserId,
    accountId,
    branchId: seed.branch2Id ?? null,
    name: "R12 Branch Lookup User",
    permissions: [],
    roles: [],
  });
});

afterAll(async () => {
  await db.destroy();
});

describe("R12 cursor pagination", () => {
  it("returns the stable response contract for empty, short, exact, and longer collections", async () => {
    const empty = await getPage("/api/v1/customers", ownerToken, { search: "R12-No-Match", limit: 3 });
    expect(empty).toEqual({ data: [], next_cursor: null, has_more: false });

    const short = await getPage("/api/v1/customers", ownerToken, { search: customerSearch, limit: 10 });
    expect(short.data).toHaveLength(7);
    expect(short.has_more).toBe(false);
    expect(short.next_cursor).toBeNull();

    const defaults = await getPage("/api/v1/customers", ownerToken, { search: customerSearch });
    expect(defaults.data).toHaveLength(7);
    expect(defaults.has_more).toBe(false);

    const exact = await getPage("/api/v1/customers", ownerToken, { search: customerSearch, limit: 7 });
    expect(exact.data).toHaveLength(7);
    expect(exact.has_more).toBe(false);

    const longer = await getPage("/api/v1/customers", ownerToken, { search: customerSearch, limit: 3 });
    expect(longer.data).toHaveLength(3);
    expect(longer.has_more).toBe(true);
    expect(longer.next_cursor).toBeTypeOf("string");
    expect(longer.data[0]).toHaveProperty("name");
    expect(longer.data[0]).not.toHaveProperty("next_cursor");
  });

  it("traverses descending customer and order pages without duplicates or gaps", async () => {
    const customers = await collectPages("/api/v1/customers/lookup", ownerToken, { search: customerSearch }, 2);
    const customerResultIds = customers.map((row) => String(row.id));
    const expectedCustomers = await db("customers")
      .where({ account_id: accountId })
      .where("name", "ilike", `%${customerSearch}%`)
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .pluck("id");
    expect(customerResultIds).toEqual(expectedCustomers);
    expect(new Set(customerResultIds).size).toBe(customerResultIds.length);
    expect(customers[0]).not.toHaveProperty("created_at");

    const orders = await collectPages(`/api/v1/customers/${orderCustomerId}/orders`, ownerToken, {}, 2);
    const orderResultIds = orders.map((row) => String(row.id));
    const expectedOrders = await db("orders")
      .where({ account_id: accountId, customer_id: orderCustomerId })
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .pluck("id");
    expect(orderResultIds).toEqual(expectedOrders);
    expect(orderResultIds).toEqual(expect.arrayContaining(orderIds));
    expect(new Set(orderResultIds).size).toBe(orderResultIds.length);
  });

  it("traverses ascending product pages and preserves category filters and DTO fields", async () => {
    const products = await collectPages("/api/v1/products", ownerToken, { category_id: categoryId }, 2);
    const resultIds = products.map((row) => String(row.id));
    const expectedIds = await db("products")
      .where({ account_id: accountId, category_id: categoryId })
      .orderBy("sort_order", "asc")
      .orderBy("id", "asc")
      .pluck("id");
    expect(resultIds).toEqual(expectedIds);
    expect(new Set(resultIds).size).toBe(resultIds.length);
    expect(resultIds).toEqual(expect.arrayContaining(productIds));
    expect(products[0]).toHaveProperty("variants");
    expect(products[0]).toHaveProperty("modifier_group_ids");
    expect(products.every((row) => row.category_id === categoryId)).toBe(true);
  });

  it("rejects malformed, oversized, unsupported, mismatched cursors and invalid limits", async () => {
    const unsupported = Buffer.from(JSON.stringify({
      version: 2,
      endpoint: "customers.list",
      sort: "created_at_desc_id_desc",
      values: { created_at: "2026-01-01T00:00:00.000Z", id: newId() },
    })).toString("base64url");

    const productPage = await getPage("/api/v1/products", ownerToken, { category_id: categoryId, limit: 1 });
    expect(productPage.next_cursor).toBeTypeOf("string");

    for (const cursor of ["not*base64", "a".repeat(1025), unsupported, productPage.next_cursor!]) {
      const response = await request(app)
        .get("/api/v1/customers")
        .query({ search: customerSearch, cursor })
        .set(auth(ownerToken));
      expect(response.status).toBe(400);
      expect(response.body.message).toBeTypeOf("string");
    }

    for (const limit of ["0", "-1", "abc", "101"]) {
      const response = await request(app)
        .get("/api/v1/customers")
        .query({ limit })
        .set(auth(ownerToken));
      expect(response.status).toBe(400);
    }
  });

  it("keeps account scope, permission boundaries, and filters outside cursor control", async () => {
    const firstAccountPage = await getPage("/api/v1/customers", ownerToken, { search: customerSearch, limit: 1 });
    const secondAccountPage = await getPage("/api/v1/customers", secondAccountToken, {
      cursor: firstAccountPage.next_cursor!,
      limit: 10,
    });
    const firstAccountIds = new Set(customerIds);
    expect(secondAccountPage.data.every((row) => !firstAccountIds.has(String(row.id)))).toBe(true);

    const firstProductPage = await getPage("/api/v1/products", ownerToken, { category_id: categoryId, limit: 1 });
    const secondProducts = await getPage("/api/v1/products", secondAccountToken, {
      cursor: firstProductPage.next_cursor!,
      limit: 10,
    });
    expect(secondProducts.data.every((row) => !productIds.includes(String(row.id)))).toBe(true);

    const lookup = await getPage("/api/v1/customers/lookup", lookupOnlyToken, { search: customerSearch, limit: 2 });
    expect(lookup.data).toHaveLength(2);
    const denied = await request(app).get("/api/v1/customers").set(auth(lookupOnlyToken));
    expect(denied.status).toBe(403);
  });

  it("does not repeat or backfill a new leading row inserted between descending pages", async () => {
    const prefix = "R12-Mutation-Customer";
    const originalIds: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const id = newId();
      originalIds.push(id);
      await db("customers").insert({
        id,
        account_id: accountId,
        name: `${prefix}-${index}`,
        created_at: new Date(`2026-02-0${index + 1}T00:00:00.000Z`),
      });
    }

    const first = await getPage("/api/v1/customers", ownerToken, { search: prefix, limit: 2 });
    const insertedId = newId();
    await db("customers").insert({
      id: insertedId,
      account_id: accountId,
      name: `${prefix}-new`,
      created_at: new Date("2026-03-01T00:00:00.000Z"),
    });
    const second = await getPage("/api/v1/customers", ownerToken, {
      search: prefix,
      limit: 2,
      cursor: first.next_cursor!,
    });

    const traversedIds = [...first.data, ...second.data].map((row) => String(row.id));
    expect(new Set(traversedIds).size).toBe(traversedIds.length);
    expect(traversedIds).not.toContain(insertedId);
    expect(traversedIds).toEqual(expect.arrayContaining(originalIds));
  });
});
