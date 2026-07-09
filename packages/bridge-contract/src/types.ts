/**
 * عقد Local Device Bridge — YKMS-01H (FR-072)
 * Shared types between Backend API and the Windows bridge service.
 * Transport v1: HTTPS polling. v2 (later): WebSocket push with the same payloads.
 */

export type EndpointKind =
  | "receipt_printer"
  | "kitchen_printer"
  | "cash_drawer"
  | "customer_display"
  | "barcode_scanner";

export type ConnectionType = "usb" | "lan" | "bluetooth" | "windows_driver";
export type PrintProtocol = "escpos" | "windows_driver";
export type PrintJobStatus = "pending" | "printing" | "printed" | "failed";
export type PrintJobType = "receipt" | "kitchen_ticket" | "test";

/** POST /api/v1/bridge/heartbeat — every 15s */
export interface HeartbeatRequest {
  device_id: string;
  endpoints: Array<{ id: string; status: "online" | "offline" }>;
}

/** GET /api/v1/bridge/print-jobs?device_id=... — claims up to 20 pending jobs */
export interface ClaimedPrintJob {
  id: string;
  branch_id: string;
  endpoint_id: string;
  type: PrintJobType;
  /** Arabic-first render payload. RTL text, may include arabic numerals. */
  payload: PrintPayload;
  attempts: number;
}

export interface PrintPayload {
  /** Plain lines for ESC/POS Arabic printing (already shaped/ordered RTL). */
  lines?: string[];
  /** Optional structured template data for driver-based rendering. */
  template?: string;
  data?: Record<string, unknown>;
  /** Open the cash drawer after printing (FR-073). Audited server-side. */
  open_cash_drawer?: boolean;
}

/** POST /api/v1/bridge/print-jobs/:id/result */
export interface PrintResultRequest {
  status: Extract<PrintJobStatus, "printed" | "failed">;
  error?: string;
}

/** Bridge authentication: Authorization: Bearer ykms_xxx (API token, scope "bridge"). */
export const BRIDGE_SCOPE = "bridge" as const;
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const POLL_INTERVAL_MS = 2_000;
