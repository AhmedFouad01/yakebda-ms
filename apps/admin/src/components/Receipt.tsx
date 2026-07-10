import { brand } from "../config/brand";
import { t } from "../lib/t";

export interface FullOrder {
  id: string;
  order_no: number;
  order_prefix?: string | null;
  order_type: string;
  status: string;
  branch_name: string;
  table_name_ar?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  driver_id?: string | null;
  driver_name?: string | null;
  delivery_address?: string | null;
  delivery_fee: string | number;
  service_fee?: string | number;
  vat_amount?: string | number;
  rounding_adjustment?: string | number;
  discount_reason?: string | null;
  subtotal: string | number;
  discount: string | number;
  total: string | number;
  notes?: string | null;
  created_at: string;
  items: Array<{
    id: string;
    name_ar: string;
    variant_name_ar?: string | null;
    qty: number;
    unit_price: string | number;
    line_total: string | number;
    notes?: string | null;
    modifiers: Array<{ id: string; name_ar: string; price_delta: string | number }>;
  }>;
  payments: Array<{ id: string; method: string; amount: string | number }>;
}

const money = (v: string | number) => `${Number(v).toFixed(2)} ${t.reports.egp}`;
const PAYMENT_AR: Record<string, string> = {
  cash: t.pos.cash,
  card: t.pos.card,
  wallet: t.pos.wallet,
  unpaid: t.pos.unpaid,
};

/** معاينة إيصال — نفس بنية الإيصال المطبوع عبر الجسر. */
export function Receipt({ order }: { order: FullOrder }) {
  return (
    <div className="receipt" dir="rtl">
      <div className="receipt-head">
        <img src={brand.logoPath} alt={brand.nameAr} width={56} height={56} />
        <div className="receipt-brand">{brand.nameAr}</div>
        <div className="receipt-sub">{order.branch_name}</div>
      </div>
      <hr />
      <div className="receipt-row">
        <span>
          {t.receipt.orderNo} {order.order_prefix ?? ""}{order.order_no}
        </span>
        <span>{t.orders.types[order.order_type] ?? order.order_type}</span>
      </div>
      {order.table_name_ar && <div className="receipt-line">{t.pos.table}: {order.table_name_ar}</div>}
      {order.customer_name && <div className="receipt-line">{t.pos.customer}: {order.customer_name}</div>}
      {order.customer_phone && <div className="receipt-line">{t.receipt.phone}: {order.customer_phone}</div>}
      {order.delivery_address && <div className="receipt-line">{t.pos.deliveryAddress}: {order.delivery_address}</div>}
      {order.driver_name && <div className="receipt-line">{t.receipt.driver}: {order.driver_name}</div>}
      <div className="receipt-line">
        {t.receipt.date}: {new Date(order.created_at).toLocaleString("ar-EG")}
      </div>
      <hr />
      {order.items.map((i) => (
        <div key={i.id} className="receipt-item">
          <div className="receipt-row">
            <span>
              {i.qty} × {i.name_ar}
              {i.variant_name_ar ? ` (${i.variant_name_ar})` : ""}
            </span>
            <span>{money(i.line_total)}</span>
          </div>
          {i.modifiers.map((m) => (
            <div key={m.id} className="receipt-mod">
              + {m.name_ar}
              {Number(m.price_delta) ? ` (${money(m.price_delta)})` : ""}
            </div>
          ))}
          {i.notes && <div className="receipt-mod">{t.receipt.notes}: {i.notes}</div>}
        </div>
      ))}
      <hr />
      <div className="receipt-row">
        <span>{t.receipt.subtotal}</span>
        <span>{money(order.subtotal)}</span>
      </div>
      {Number(order.discount) > 0 && (
        <div className="receipt-row">
          <span>{t.receipt.discount}</span>
          <span>-{money(order.discount)}</span>
        </div>
      )}
      {Number(order.service_fee ?? 0) > 0 && (
        <div className="receipt-row">
          <span>{t.pos.serviceFee}</span>
          <span>{money(order.service_fee!)}</span>
        </div>
      )}
      {Number(order.delivery_fee) > 0 && (
        <div className="receipt-row">
          <span>{t.receipt.deliveryFee}</span>
          <span>{money(order.delivery_fee)}</span>
        </div>
      )}
      {Number(order.vat_amount ?? 0) > 0 && (
        <div className="receipt-row">
          <span>{t.pos.vat}</span>
          <span>{money(order.vat_amount!)}</span>
        </div>
      )}
      {Number(order.rounding_adjustment ?? 0) !== 0 && (
        <div className="receipt-row">
          <span>{t.receipt.rounding}</span>
          <span>{money(order.rounding_adjustment!)}</span>
        </div>
      )}
      <div className="receipt-row receipt-total">
        <span>{t.receipt.total}</span>
        <span>{money(order.total)}</span>
      </div>
      {order.payments.map((p) => (
        <div key={p.id} className="receipt-row">
          <span>{t.receipt.payment}</span>
          <span>
            {PAYMENT_AR[p.method] ?? p.method} — {money(p.amount)}
          </span>
        </div>
      ))}
      {order.notes && <div className="receipt-line">{t.receipt.notes}: {order.notes}</div>}
      <hr />
      <div className="receipt-thanks">{brand.receiptThanks}</div>
    </div>
  );
}
