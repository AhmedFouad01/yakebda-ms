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
import { kitchenControlRoutes } from "./modules/kitchenControl";
import { tableRoutes, customerRoutes } from "./modules/restaurant";
import { reportRoutes } from "./modules/reports";
import { shiftRoutes } from "./modules/shifts";
import { settingsRoutes, prepStationRoutes, deliveryZoneRoutes, driverRoutes } from "./modules/settings";
import { orderSourceRoutes } from "./modules/orderSources";
import { customerReadRoutes, settingsReadRoutes } from "./modules/readScope";
import { financialReliabilityRoutes } from "./modules/financialReliability";
import { inventoryRoutes } from "./modules/inventory";
import { inventoryRecipeRoutes } from "./modules/inventoryRecipes";
import { financialEventRoutes } from "./modules/financialEvents";
import { accountingRoutes } from "./modules/accounting";
import { config } from "./config";
import { checkDatabaseReadiness } from "./lib/health";
import {
  createStructuredLogger,
  normalizeRoute,
  requestObservability,
  StructuredLogSink,
  unexpectedErrorFields,
} from "./lib/observability";

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
  payments_refund_amount_negative_guard: ar.errors.refund_amount_positive,
  payments_refund_reference_guard: ar.errors.refund_reference_required,
  payments_refund_over_paid_guard: ar.errors.refund_exceeds_paid,
};

/**
 * Sprint 2 — inventory master-data constraint violations surfaced clearly
 * instead of a generic 500, following the same constraint→message pattern
 * as payment integrity. Schema constraints stay the authority; this only
 * translates them into field-level Arabic validation details. Names are
 * the exact PG identifiers (incl. the 63-char truncation on the
 * unit-conversions unique).
 */
const INVENTORY_CONSTRAINT_MESSAGES: Record<string, { field: string; message: string }> = {
  inventory_units_account_id_symbol_unique: { field: "symbol", message: "رمز الوحدة مستخدم بالفعل في هذا الحساب." },
  inventory_items_account_id_name_ar_unique: { field: "name_ar", message: "اسم الصنف مستخدم بالفعل في هذا الحساب." },
  inventory_items_sku_unique_idx: { field: "sku", message: "كود الصنف (SKU) مستخدم بالفعل." },
  inventory_suppliers_account_id_name_ar_unique: { field: "name_ar", message: "اسم المورد مستخدم بالفعل في هذا الحساب." },
  inventory_unit_conversions_account_id_from_unit_id_to_unit_id_u: { field: "to_unit_id", message: "يوجد معامل تحويل مسجّل بالفعل بين هاتين الوحدتين." },
  inventory_locations_account_id_branch_id_name_ar_unique: { field: "name_ar", message: "اسم الموقع مستخدم بالفعل في هذا الفرع." },
  inventory_unit_conversions_factor_positive: { field: "factor", message: "معامل التحويل يجب أن يكون أكبر من صفر." },
  inventory_unit_conversions_distinct_units: { field: "to_unit_id", message: "لا يمكن تسجيل تحويل من وحدة إلى نفسها." },
};

function isOrderIntegrityError(error: DatabaseError): boolean {
  if (error.constraint && ORDER_INTEGRITY_CONSTRAINTS.has(error.constraint)) return true;
  return /Selected variant does not belong|same modifier cannot|Selected modifier does not belong|Required modifier selections are missing|Too many modifiers were selected/i.test(
    error.message ?? ""
  );
}

export interface AppOptions {
  logSink?: StructuredLogSink;
  readinessTimeoutMs?: number;
}

function orderIntegrityReason(error: DatabaseError): string {
  if (error.constraint && ORDER_INTEGRITY_CONSTRAINTS.has(error.constraint)) {
    return error.constraint;
  }
  if (/Selected variant does not belong/i.test(error.message)) return "variant_product_mismatch";
  if (/same modifier cannot/i.test(error.message)) return "duplicate_modifier";
  if (/Selected modifier does not belong/i.test(error.message)) return "modifier_product_mismatch";
  if (/Required modifier selections are missing/i.test(error.message)) return "modifier_minimum_missing";
  if (/Too many modifiers were selected/i.test(error.message)) return "modifier_maximum_exceeded";
  return "order_configuration";
}

export function createApiErrorHandler(logger: StructuredLogSink) {
  return (e: unknown, req: Request, res: Response, _next: NextFunction) => {
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

    const inventoryHit = dbError.constraint ? INVENTORY_CONSTRAINT_MESSAGES[dbError.constraint] : undefined;
    if (inventoryHit && (dbError.code === "23505" || dbError.code === "23514")) {
      const status = dbError.code === "23505" ? 409 : 422;
      return res.status(status).json({
        code: status === 409 ? "conflict" : "validation",
        message: inventoryHit.message,
        details: { [inventoryHit.field]: inventoryHit.message },
      });
    }

    if (isOrderIntegrityError(dbError)) {
      return res.status(422).json({
        code: "validation",
        message: ar.errors.validation,
        details: {
          order_configuration: dbError.constraint ?? "order_configuration",
          reason: orderIntegrityReason(dbError),
        },
      });
    }

    if (dbError.code === "23505" && dbError.constraint === "orders_numbering_key_order_no_unique") {
      return res.status(409).json({ code: "conflict", message: ar.errors.conflict });
    }

    if (dbError.code === "23514" && dbError.constraint === "accounting_period_open_residuals") {
      return res.status(409).json({ code: "conflict", message: ar.errors.conflict });
    }

    logger.write({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "http.request.failed",
      request_id: req.requestId,
      method: req.method,
      route: normalizeRoute(req.originalUrl),
      ...unexpectedErrorFields(e),
    });
    return res.status(500).json({
      code: "server",
      message: ar.errors.server,
      request_id: req.requestId,
    });
  };
}

export function createApp(db: Knex, options: AppOptions = {}) {
  const app = express();
  const logger = createStructuredLogger(options.logSink);
  app.use(requestObservability(logger));
  app.use(cors({ exposedHeaders: ["x-request-id"] }));
  app.use(express.json({ limit: "8mb" }));
  app.use("/uploads", express.static(process.env.UPLOAD_DIR || `${process.cwd()}/uploads`));

  const v1 = express.Router();
  app.use("/api/v1", v1);

  const livePayload = { ok: true, app: ar.app.name, locale: ar.app.locale, dir: ar.app.dir };
  v1.get("/health", (_req, res) => res.json(livePayload));
  v1.get("/health/live", (_req, res) => res.json({ ...livePayload, status: "live" }));
  v1.get("/health/ready", async (req, res) => {
    const result = await checkDatabaseReadiness(
      db,
      options.readinessTimeoutMs ?? config.readinessDbTimeoutMs
    );
    if (result.ready) {
      return res.json({ ...livePayload, status: "ready" });
    }

    logger.write({
      timestamp: new Date().toISOString(),
      level: "warn",
      event: "health.readiness.failed",
      request_id: req.requestId,
      reason: result.reason,
    });
    return res.status(503).json({
      ok: false,
      status: "not_ready",
      request_id: req.requestId,
    });
  });
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
  v1.use("/orders", financialReliabilityRoutes(db));
  v1.use("/orders", orderRoutes(db));
  v1.use("/kitchen", kitchenControlRoutes(db));
  v1.use("/kitchen", kitchenRoutes(db));
  v1.use("/tables", tableRoutes(db));
  v1.use("/customers", customerReadRoutes(db));
  v1.use("/customers", customerRoutes(db));
  v1.use("/shifts", shiftRoutes(db));
  v1.use("/settings", settingsReadRoutes(db));
  v1.use("/settings", settingsRoutes(db));
  v1.use("/prep-stations", prepStationRoutes(db));
  v1.use("/delivery-zones", deliveryZoneRoutes(db));
  v1.use("/drivers", driverRoutes(db));
  v1.use("/reports", reportRoutes(db));
  v1.use("/inventory", inventoryRoutes(db));
  v1.use("/inventory", inventoryRecipeRoutes(db));
  v1.use("/accounting", financialEventRoutes(db));
  v1.use("/accounting", accountingRoutes(db));

  app.use((_req, res) => res.status(404).json({ code: "not_found", message: ar.errors.not_found }));

  app.use(createApiErrorHandler(logger));

  return app;
}
