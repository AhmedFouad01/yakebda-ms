import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";
import { createStockMovement } from "../src/modules/inventoryService";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let token = "";
let accountId = "";
let branchId = "";
let secondBranchId = "";
let locationId = "";
let secondLocationId = "";
let unitId = "";
let itemId = "";

const auth = () => ({ Authorization: `Bearer ${token}` });

async function postMovement(input: {
  movement_type: "receipt" | "issue" | "adjustment";
  quantity: string;
  idempotency_key: string;
  unit_cost?: string;
  location_id?: string;
  item_id?: string;
}) {
  return request(app)
    .post("/api/v1/inventory/movements")
    .set(auth())
    .send({
      location_id: input.location_id ?? locationId,
      item_id: input.item_id ?? itemId,
      movement_type: input.movement_type,
      quantity: input.quantity,
      unit_cost: input.unit_cost,
      source_type: "p0_integrity_test",
      idempotency_key: input.idempotency_key,
      reason: "P0 financial integrity verification",
    });
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  accountId = seed.accountId;
  branchId = seed.branchId;
  secondBranchId = seed.branch2Id!;
  app = createApp(db);
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  token = login.body.token;

  const locations = await request(app).get("/api/v1/inventory/locations").set(auth());
  locationId = locations.body.data.find((row: { branch_id: string }) => row.branch_id === branchId).id;
  secondLocationId = locations.body.data.find((row: { branch_id: string }) => row.branch_id === secondBranchId).id;
  unitId = (await db("inventory_units").where({ account_id: accountId, symbol: "kg" }).first()).id;
  const item = await request(app)
    .post("/api/v1/inventory/items")
    .set(auth())
    .send({ name_ar: "P0 financial item", sku: "P0-FIN", base_unit_id: unitId, reorder_level: "0" });
  expect(item.status).toBe(201);
  itemId = item.body.data.id;

  const receipt = await postMovement({
    movement_type: "receipt",
    quantity: "20",
    unit_cost: "2.5000",
    idempotency_key: "p0-financial-opening-receipt",
  });
  expect(receipt.status).toBe(201);
});

afterAll(async () => {
  await db.destroy();
});

describe("P0 inventory financial-event integrity", () => {
  it("creates an explicit pending-policy event for a generic issue and replays idempotently", async () => {
    const body = {
      movement_type: "issue" as const,
      quantity: "1",
      idempotency_key: "p0-generic-issue",
    };
    const created = await postMovement(body);
    expect(created.status).toBe(201);
    const event = await db("financial_events")
      .where({ account_id: accountId, source_type: "stock_movement", source_id: created.body.data.id })
      .first();
    expect(event).toMatchObject({ event_type: "inventory.issue", status: "pending_policy", payload_version: 2 });
    expect(event.payload).toMatchObject({
      account_id: accountId,
      branch_id: branchId,
      location_id: locationId,
      item_id: itemId,
      movement_type: "issue",
      accounting_classification: "generic_issue_policy_required",
      valuation_policy: "moving_weighted_average",
      valuation_policy_version: 1,
    });

    const replay = await postMovement(body);
    expect(replay.status).toBe(200);
    expect(replay.body.data.id).toBe(created.body.data.id);
    expect(await db("financial_events").where({ source_type: "stock_movement", source_id: created.body.data.id })).toHaveLength(1);
  });

  it("creates journal-required events for positive and negative generic adjustments", async () => {
    const increase = await postMovement({
      movement_type: "adjustment",
      quantity: "2",
      unit_cost: "3.0000",
      idempotency_key: "p0-adjustment-increase",
    });
    const decrease = await postMovement({
      movement_type: "adjustment",
      quantity: "-1",
      idempotency_key: "p0-adjustment-decrease",
    });
    expect([increase.status, decrease.status]).toEqual([201, 201]);
    const events = await db("financial_events")
      .whereIn("source_id", [increase.body.data.id, decrease.body.data.id])
      .orderBy("source_id");
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.event_type === "inventory.adjustment" && event.status === "pending")).toBe(true);
  });

  it("classifies both sides of an internal transfer as durable non-posting events", async () => {
    const response = await request(app)
      .post("/api/v1/inventory/transfers")
      .set(auth())
      .send({
        source_location_id: locationId,
        destination_location_id: secondLocationId,
        item_id: itemId,
        quantity: "2",
        reason: "P0 transfer classification",
        idempotency_key: "p0-transfer-classification",
      });
    expect(response.status).toBe(201);
    const movementIds = [response.body.data.out.id, response.body.data.in.id];
    const events = await db("financial_events").whereIn("source_id", movementIds);
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.event_type === "inventory.transfer" && event.status === "non_posting")).toBe(true);
    expect(events.every((event) => event.payload.accounting_classification === "internal_value_transfer")).toBe(true);
  });

  it("rolls back the stock movement when durable event insertion fails", async () => {
    await db.raw(`
      create function ykms_test_reject_stock_event() returns trigger language plpgsql as $$
      begin
        if new.source_type = 'stock_movement' then
          raise exception using errcode = '23514', message = 'test financial event rejection';
        end if;
        return new;
      end;
      $$;
      create trigger test_reject_stock_event before insert on financial_events
        for each row execute function ykms_test_reject_stock_event()
    `);
    try {
      const response = await postMovement({
        movement_type: "adjustment",
        quantity: "1",
        unit_cost: "2.5000",
        idempotency_key: "p0-event-failure-rollback",
      });
      expect(response.status).toBe(500);
      expect(await db("stock_movements").where({ idempotency_key: "p0-event-failure-rollback" })).toHaveLength(0);
    } finally {
      await db.raw("drop trigger if exists test_reject_stock_event on financial_events");
      await db.raw("drop function if exists ykms_test_reject_stock_event()");
    }
  });

  it("rejects cross-account movement references without creating financial evidence", async () => {
    const foreignAccount = newId();
    const foreignBranch = newId();
    const foreignLocation = newId();
    await db("accounts").insert({ id: foreignAccount, name: "P0 foreign account" });
    await db("branches").insert({ id: foreignBranch, account_id: foreignAccount, name: "P0 foreign branch" });
    await db("inventory_locations").insert({
      id: foreignLocation,
      account_id: foreignAccount,
      branch_id: foreignBranch,
      name_ar: "P0 foreign location",
      is_default: true,
    });
    const response = await postMovement({
      movement_type: "receipt",
      quantity: "1",
      unit_cost: "1",
      idempotency_key: "p0-cross-account-movement",
      location_id: foreignLocation,
    });
    expect(response.status).toBe(404);
    expect(await db("stock_movements").where({ idempotency_key: "p0-cross-account-movement" })).toHaveLength(0);
    expect(await db("financial_events").where({ idempotency_key: "p0-cross-account-movement" })).toHaveLength(0);
  });

  it("links a reversal event to its original movement and financial classification", async () => {
    const original = await createStockMovement(db, {
      accountId,
      locationId,
      itemId,
      movementType: "issue",
      quantity: "1",
      sourceType: "p0_reversal_test",
      idempotencyKey: "p0-reversal-original",
    });
    const reversal = await createStockMovement(db, {
      accountId,
      locationId,
      itemId,
      movementType: "reversal",
      quantity: "1",
      sourceType: "p0_reversal_test",
      sourceId: original.id,
      idempotencyKey: "p0-reversal-linked",
      reversalOfMovementId: original.id,
    });
    const event = await db("financial_events")
      .where({ source_type: "stock_movement", source_id: reversal.id })
      .first();
    expect(event).toMatchObject({ event_type: "inventory.reversal", status: "pending_policy" });
    expect(event.payload).toMatchObject({
      reversal_of_movement_id: original.id,
      accounting_classification: "reversal_policy_required",
    });
  });

  it("prevents a financial event from becoming posted without journal or reconciliation evidence", async () => {
    const issue = await postMovement({
      movement_type: "issue",
      quantity: "1",
      idempotency_key: "p0-posted-evidence-guard",
    });
    const event = await db("financial_events").where({ source_id: issue.body.data.id }).first();
    await expect(db("financial_events").where({ id: event.id }).update({ status: "posted" })).rejects.toMatchObject({
      code: "23514",
    });
  });
});
