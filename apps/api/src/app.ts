import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { Knex } from "knex";
import { ApiError } from "./lib/errors";
import { ar } from "./i18n/ar";
import { authRoutes } from "./modules/auth";
import { branchRoutes } from "./modules/branches";
import { userRoutes, roleRoutes } from "./modules/users";
import { deviceRoutes, hardwareRoutes } from "./modules/devices";
import { printJobRoutes } from "./modules/printJobs";
import { bridgeRoutes } from "./modules/bridge";
import { apiClientRoutes } from "./modules/apiClients";
import { auditRoutes } from "./modules/auditLogs";
import { categoryRoutes, productRoutes, modifierGroupRoutes, branchMenuRoutes } from "./modules/menu";
import { orderRoutes, kitchenRoutes } from "./modules/orders";
import { tableRoutes, customerRoutes, reportRoutes } from "./modules/restaurant";
import { shiftRoutes } from "./modules/shifts";

export function createApp(db: Knex) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // API v1 foundation — FR-160: everything under /api/v1
  const v1 = express.Router();
  app.use("/api/v1", v1);

  v1.get("/health", (_req, res) =>
    res.json({ ok: true, app: ar.app.name, locale: ar.app.locale, dir: ar.app.dir })
  );
  v1.use("/auth", authRoutes(db));
  v1.use("/branches", branchRoutes(db));
  v1.use("/branches", branchMenuRoutes(db)); // /:branchId/menu, menu-availability, menu-prices
  v1.use("/users", userRoutes(db));
  v1.use("/roles", roleRoutes(db));
  v1.use("/devices", deviceRoutes(db));
  v1.use("/hardware-endpoints", hardwareRoutes(db));
  v1.use("/print-jobs", printJobRoutes(db));
  v1.use("/bridge", bridgeRoutes(db));
  v1.use("/api-clients", apiClientRoutes(db));
  v1.use("/audit-logs", auditRoutes(db));
  v1.use("/categories", categoryRoutes(db));
  v1.use("/products", productRoutes(db));
  v1.use("/modifier-groups", modifierGroupRoutes(db));
  v1.use("/orders", orderRoutes(db));
  v1.use("/kitchen", kitchenRoutes(db));
  v1.use("/tables", tableRoutes(db));
  v1.use("/customers", customerRoutes(db));
  v1.use("/shifts", shiftRoutes(db));
  v1.use("/reports", reportRoutes(db));

  app.use((_req, res) => res.status(404).json({ code: "not_found", message: ar.errors.not_found }));

  // Arabic error responses
  app.use((e: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (e instanceof ApiError) {
      return res.status(e.status).json({ code: e.code, message: e.message, details: e.details });
    }
    console.error(e);
    return res.status(500).json({ code: "server", message: ar.errors.server });
  });

  return app;
}
