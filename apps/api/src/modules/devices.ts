import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";

const DEVICE_TYPES = [
  "pos",
  "kds",
  "waiter",
  "customer_display",
  "kitchen_printer",
  "receipt_printer",
] as const; // FR-004

const deviceSchema = z.object({
  branch_id: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(DEVICE_TYPES),
  platform: z.string().default("windows"),
});

export function deviceRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/", async (req, res, next) => {
    try {
      const rows = await db("devices")
        .where({ account_id: req.user!.accountId })
        .orderBy("created_at", "asc");
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  // FR-002
  r.post("/", requirePermission("devices.manage"), async (req, res, next) => {
    try {
      const body = deviceSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const id = newId();
      await db("devices").insert({ id, account_id: req.user!.accountId, ...body.data });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        branchId: body.data.branch_id,
        userId: req.user!.id,
        action: "device.register",
        entityType: "device",
        entityId: id,
        meta: { name: body.data.name, type: body.data.type },
        ip: req.ip,
      });
      res.status(201).json({ data: await db("devices").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  // Device profiles — YKMS-01H
  r.post("/:deviceId/profiles", requirePermission("devices.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({ name: z.string().min(1), settings: z.record(z.unknown()).default({}) })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const device = await db("devices")
        .where({ id: req.params.deviceId, account_id: req.user!.accountId })
        .first();
      if (!device) throw err.notFound();
      const id = newId();
      await db("device_profiles").insert({
        id,
        device_id: device.id,
        name: body.data.name,
        settings: JSON.stringify(body.data.settings),
      });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        branchId: device.branch_id,
        deviceId: device.id,
        userId: req.user!.id,
        action: "device_profile.create",
        entityType: "device_profile",
        entityId: id,
        ip: req.ip,
      });
      res.status(201).json({ data: await db("device_profiles").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.get("/:deviceId/profiles", async (req, res, next) => {
    try {
      const device = await db("devices")
        .where({ id: req.params.deviceId, account_id: req.user!.accountId })
        .first();
      if (!device) throw err.notFound();
      res.json({ data: await db("device_profiles").where({ device_id: device.id }) });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

const ENDPOINT_KINDS = [
  "receipt_printer",
  "kitchen_printer",
  "cash_drawer",
  "customer_display",
  "barcode_scanner",
] as const;

const endpointSchema = z.object({
  branch_id: z.string().uuid(),
  device_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1),
  kind: z.enum(ENDPOINT_KINDS),
  connection: z.enum(["usb", "lan", "bluetooth", "windows_driver"]),
  protocol: z.enum(["escpos", "windows_driver"]).default("escpos"),
  address: z.string().optional().nullable(),
  station: z.string().optional().nullable(),
});

export function hardwareRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/", async (req, res, next) => {
    try {
      const rows = await db("hardware_endpoints as h")
        .join("branches as b", "b.id", "h.branch_id")
        .where("b.account_id", req.user!.accountId)
        .select("h.*")
        .orderBy("h.created_at", "asc");
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  // FR-070
  r.post("/", requirePermission("hardware.manage"), async (req, res, next) => {
    try {
      const body = endpointSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const branch = await db("branches")
        .where({ id: body.data.branch_id, account_id: req.user!.accountId })
        .first();
      if (!branch) throw err.notFound();
      // Security: the hosting device (if any) must belong to the same account AND the same branch.
      if (body.data.device_id) {
        const device = await db("devices")
          .where({
            id: body.data.device_id,
            account_id: req.user!.accountId,
            branch_id: branch.id,
          })
          .first();
        if (!device) throw err.notFound();
      }
      const id = newId();
      await db("hardware_endpoints").insert({ id, ...body.data });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        branchId: branch.id,
        userId: req.user!.id,
        action: "hardware_endpoint.create",
        entityType: "hardware_endpoint",
        entityId: id,
        meta: { name: body.data.name, kind: body.data.kind },
        ip: req.ip,
      });
      res.status(201).json({
        data: await db("hardware_endpoints").where({ id }).first(),
        message: ar.messages.created,
      });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
