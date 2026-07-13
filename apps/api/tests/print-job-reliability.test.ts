import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let bridgeToken = "";
let branchId = "";
let deviceId = "";
let endpointId = "";

const ownerAuth = () => ({ Authorization: `Bearer ${ownerToken}` });
const bridgeAuth = () => ({ Authorization: `Bearer ${bridgeToken}` });

async function insertJob(options: {
  status?: "pending" | "printing" | "printed" | "failed" | "dead";
  attempts?: number;
  updatedAt?: Date;
} = {}): Promise<string> {
  const id = newId();
  await db("print_jobs").insert({
    id,
    branch_id: branchId,
    endpoint_id: endpointId,
    device_id: deviceId,
    type: "test",
    payload: JSON.stringify({ test: id }),
    status: options.status ?? "pending",
    attempts: options.attempts ?? 0,
    updated_at: options.updatedAt ?? db.fn.now(),
  });
  return id;
}

async function poll() {
  return request(app)
    .get(`/api/v1/bridge/print-jobs?device_id=${deviceId}`)
    .set(bridgeAuth());
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  branchId = seed.branchId;
  app = createApp(db);

  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  expect(login.status).toBe(200);
  ownerToken = login.body.token;

  const endpoint = await db("hardware_endpoints")
    .where({ branch_id: branchId })
    .whereNotNull("device_id")
    .first();
  expect(endpoint).toBeTruthy();
  endpointId = endpoint.id;
  deviceId = endpoint.device_id;

  const client = await request(app)
    .post("/api/v1/api-clients")
    .set(ownerAuth())
    .send({ name: "Bridge Reliability Test", kind: "bridge" });
  expect(client.status).toBe(201);

  const token = await request(app)
    .post(`/api/v1/api-clients/${client.body.data.id}/tokens`)
    .set(ownerAuth())
    .send({ name: "Bridge Test Token", scopes: ["bridge"] });
  expect(token.status).toBe(201);
  bridgeToken = token.body.data.token;
});

beforeEach(async () => {
  await db("print_jobs").del();
});

afterAll(async () => {
  await db.destroy();
});

describe("Print job reliability", () => {
  it("returns a failed job below the retry cap to pending and polls it again", async () => {
    const jobId = await insertJob();

    const firstPoll = await poll();
    expect(firstPoll.status).toBe(200);
    expect(firstPoll.body.data.map((job: { id: string }) => job.id)).toContain(jobId);

    const claimed = await db("print_jobs").where({ id: jobId }).first();
    expect(claimed.status).toBe("printing");
    expect(Number(claimed.attempts)).toBe(1);

    const failed = await request(app)
      .post(`/api/v1/bridge/print-jobs/${jobId}/result`)
      .set(bridgeAuth())
      .send({ status: "failed", error: "printer offline" });
    expect(failed.status).toBe(200);
    expect(failed.body.status).toBe("pending");
    expect(failed.body.retry_scheduled).toBe(true);

    const secondPoll = await poll();
    expect(secondPoll.status).toBe(200);
    expect(secondPoll.body.data.map((job: { id: string }) => job.id)).toContain(jobId);

    const reclaimed = await db("print_jobs").where({ id: jobId }).first();
    expect(reclaimed.status).toBe("printing");
    expect(Number(reclaimed.attempts)).toBe(2);
  });

  it("moves an exhausted failed job to dead and never polls it again", async () => {
    const jobId = await insertJob({ attempts: config.maxPrintAttempts - 1 });

    const firstPoll = await poll();
    expect(firstPoll.status).toBe(200);
    expect(firstPoll.body.data.map((job: { id: string }) => job.id)).toContain(jobId);

    const failed = await request(app)
      .post(`/api/v1/bridge/print-jobs/${jobId}/result`)
      .set(bridgeAuth())
      .send({ status: "failed", error: "paper jam" });
    expect(failed.status).toBe(200);
    expect(failed.body.status).toBe("dead");
    expect(failed.body.retry_scheduled).toBe(false);

    const nextPoll = await poll();
    expect(nextPoll.status).toBe(200);
    expect(nextPoll.body.data).toHaveLength(0);

    const row = await db("print_jobs").where({ id: jobId }).first();
    expect(row.status).toBe("dead");
    expect(Number(row.attempts)).toBe(config.maxPrintAttempts);
  });

  it("requeues a stuck printing job below the retry cap", async () => {
    const old = new Date(Date.now() - (config.printStuckMinutes + 2) * 60_000);
    const jobId = await insertJob({ status: "printing", attempts: 1, updatedAt: old });

    const sweep = await request(app)
      .post("/api/v1/print-jobs/requeue-stuck")
      .set(ownerAuth())
      .send({});
    expect(sweep.status).toBe(200);
    expect(sweep.body.data.requeued_count).toBe(1);
    expect(sweep.body.data.requeued_ids).toContain(jobId);

    const row = await db("print_jobs").where({ id: jobId }).first();
    expect(row.status).toBe("pending");
  });

  it("claims one pending job exactly once under concurrent double polling", async () => {
    const jobId = await insertJob();

    const [left, right] = await Promise.all([poll(), poll()]);
    expect(left.status).toBe(200);
    expect(right.status).toBe(200);

    const claimedIds = [...left.body.data, ...right.body.data]
      .map((job: { id: string }) => job.id)
      .filter((id: string) => id === jobId);
    expect(claimedIds).toHaveLength(1);

    const row = await db("print_jobs").where({ id: jobId }).first();
    expect(row.status).toBe("printing");
    expect(Number(row.attempts)).toBe(1);
  });
});
