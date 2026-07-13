import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let token = "";
let accountId = "";
let branchId = "";
let ownerId = "";

const auth = () => ({ Authorization: `Bearer ${token}` });

async function createPayableOrder(total = 25): Promise<string> {
  const id = newId();
  await db("orders").insert({
    id,
    account_id: accountId,
    branch_id: branchId,
    order_no: 0,
    numbering_key: "temporary",
    order_type: "takeaway",
    status: "submitted",
    subtotal: total,
    discount: 0,
    delivery_fee: 0,
    total,
    created_by: ownerId,
    submitted_at: db.fn.now(),
  });
  return id;
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  accountId = seed.accountId;
  branchId = seed.branchId;
  const owner = await db("users").where({ email: seed.ownerEmail }).first();
  ownerId = owner.id;
  app = createApp(db);

  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  expect(login.status).toBe(200);
  token = login.body.token;
});

afterAll(async () => {
  await db.raw("drop trigger if exists test_fail_payment_audit on audit_logs");
  await db.raw("drop function if exists ykms_test_fail_payment_audit()");
  await db.raw("drop trigger if exists test_fail_print_enqueue on print_jobs");
  await db.raw("drop function if exists ykms_test_fail_print_enqueue()");
  await db.destroy();
});

describe("R7 standalone payment transaction", () => {
  it("rolls back the payment when its audit insert fails", async () => {
    const orderId = await createPayableOrder(30);
    await db.raw(`
      create or replace function ykms_test_fail_payment_audit()
      returns trigger language plpgsql as $$
      begin
        if new.action = 'payment.record' then
          raise exception 'forced audit failure';
        end if;
        return new;
      end;
      $$;
      create trigger test_fail_payment_audit
        before insert on audit_logs
        for each row execute function ykms_test_fail_payment_audit();
    `);

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/payments`)
      .set(auth())
      .send({ method: "card", amount: 30 });

    expect(response.status).toBe(500);
    expect(await db("payments").where({ order_id: orderId }).count("id as count").first())
      .toMatchObject({ count: "0" });

    await db.raw("drop trigger test_fail_payment_audit on audit_logs");
    await db.raw("drop function ykms_test_fail_payment_audit()");
  });

  it("commits money and audit when best-effort print enqueue fails", async () => {
    const orderId = await createPayableOrder(40);
    await db("settings").insert([
      { id: newId(), account_id: accountId, branch_id: branchId, key: "auto_print_on_payment", value: JSON.stringify(true) },
      { id: newId(), account_id: accountId, branch_id: branchId, key: "receipt_printing_enabled", value: JSON.stringify(true) },
    ]);

    await db.raw(`
      create or replace function ykms_test_fail_print_enqueue()
      returns trigger language plpgsql as $$
      begin
        raise exception 'forced print enqueue failure';
      end;
      $$;
      create trigger test_fail_print_enqueue
        before insert on print_jobs
        for each row execute function ykms_test_fail_print_enqueue();
    `);

    const response = await request(app)
      .post(`/api/v1/orders/${orderId}/payments`)
      .set(auth())
      .send({ method: "card", amount: 40 });

    expect(response.status).toBe(201);
    const payment = await db("payments").where({ order_id: orderId, kind: "payment" }).first();
    expect(Number(payment.amount)).toBe(40);

    const audit = await db("audit_logs")
      .where({ action: "payment.record", entity_id: payment.id })
      .first();
    expect(audit).toBeTruthy();
    expect(await db("print_jobs").whereRaw("payload::text like ?", [`%${orderId}%`]).count("id as count").first())
      .toMatchObject({ count: "0" });

    await db.raw("drop trigger test_fail_print_enqueue on print_jobs");
    await db.raw("drop function ykms_test_fail_print_enqueue()");
  });
});
