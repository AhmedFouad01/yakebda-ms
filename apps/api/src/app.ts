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
import { productDeleteRoutes } from "./modules/productDelete";
import { orderIntegrityRoutes } from "./modules/orderIntegrity";
import { orderPricingRoutes } from "./modules/orderPricing";
import { orderRoutes, kitchenRoutes } from "./modules/orders";
import { tableRoutes, customerRoutes, reportRoutes } from "./modules/restaurant";
import { shiftRoutes } from "./modules/shifts";
import { settingsRoutes, prepStationRoutes, deliveryZoneRoutes, driverRoutes } from "./modules/settings";
import { orderSourceRoutes } from "./modules/orderSources";

type DatabaseError = Error & {
  code?: string;
  constraint?: string;
  detail?: string;
};

const ORDER_INTEGRITY_CONSTRAINTS = new Set([
  "order_item_variant_product_check",
  "order_item_modifier_duplicate_check",
  "order_item_modifier_product_check",
  "order_item_modifier_min_select_check",
  "order_item_modifier_max_select_check",
]);

const PAYMENT_INTEGRITY_MESSAGES: Record<string, string> = {
  payments_amount_positive_guard: ar.errors.payment_amount_positive,
  payments_already_paid_guard: ar.errors.payment_already_paid,
  payments_over_remaining_guard: ar.errors.payment_over_remaining,
  payments_unpaid_zero_guard: ar.errors.unpaid_amount_zero,
};

function isOrderIntegrityError(error: DatabaseError): boolean {
  if (error.constraint && ORDER_INTEGRITY_CONSTRAINTS.has(error.constraint)) return true;
  return /Selected variant does not belong|same modifier cannot|Selected modifier does not belong|Required modifier selections are missing|Too many modifiers were selected/i.test(
    error.message ?? ""
  );
}

export function createApp(db: Knex) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "8mb" }));
  app.use("/uploads", express.static(process.env.UPLOAD_DIR || `${process.cwd()}/uploads`));

  const v1 = express.Router();
  app.use("/api/v1", v1);

  v1.get("/health", (_req, res) =>
    res.json({ ok: true, app: ar.app.name, locale: ar.app.locale, dir: ar.app.dir })
  );
  v1.use("/auth", authRoutes(db));
  v1.use("/branches", branchRoutes(db));
  v1.use("/branches", branchMenuRoutes(db));
  v1.use("/users", userRoutes(db));
  v1.use("/roles", roleRoutes(db));
  v1.use("/devices", deviceRoutes(db));
  v1.use("/hardware-endpoints", hardwareRoutes(db));
  v1.use("/print-jobs", printJobRoutes(db));
  v1.use("/bridge", bridgeRoutes(db));
  v1.use("/api-clients", apiClientRoutes(db));
  v1.use("/audit-logs", auditRoutes(db));
  v1.use("/categories", categoryRoutes(db));
  v1.use("/products", productDeleteRoutes(db));
  v1.use("/products", productRoutes(db));
  v1.use("/modifier-groups", modifierGroupRoutes(db));
  v1.use("/order-sources", orderSourceRoutes(db));
  v1.use("/orders", orderPricingRoutes(db));
  v1.use("/orders", orderIntegrityRoutes(db));
  v1.use("/orders", orderRoutes(db));
  v1.use("/kitchen", kitchenRoutes(db));
  v1.use("/tables", tableRoutes(db));
  v1.use("/customers", customerRoutes(db));
  v1.use("/shifts", shiftRoutes(db));
  v1.use("/settings", settingsRoutes(db));
  v1.use("/prep-stations", prepStationRoutes(db));
  v1.use("/delivery-zones", deliveryZoneRoutes(db));
  v1.use("/drivers", driverRoutes(db));
  v1.use("/reports", reportRoutes(db));

  app.use((_req, res) => res.status(404).json({ code: "not_found", message: ar.errors.not_found }));

  app.use((e: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (e instanceof ApiError) {
      return res.status(e.status).json({ code: e.code, message: e.message, details: e.details });
    }

    const dbError = e as DatabaseError;
    const paymentMessage = dbError.constraint
      ? PAYMENT_INTEGRITY_MESSAGES[dbError.constraint]
      : undefined;
    if (paymentMessage) {
      return res.status(422).json({
        code: "validation",
        message: ar.errors.validation,
        details: { amount: paymentMessage },
      });
    }

    if (isOrderIntegrityError(dbError)) {
      return res.status(422).json({
        code: "validation",
        message: ar.errors.validation,
        details: {
          order_configuration: dbError.constraint ?? "order_configuration",
          reason: dbError.message,
        },
      });
    }

    if (dbError.code === "23505" && dbError.constraint === "orders_numbering_key_order_no_unique") {
      return res.status(409).json({ code: "conflict", message: ar.errors.conflict });
    }

    console.error(e);
    return res.status(500).json({ code: "server", message: ar.errors.server });
  });

  return app;
}
