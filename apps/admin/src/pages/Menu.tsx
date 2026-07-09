import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/t";
import { useList } from "./hooks";

interface Category { id: string; name_ar: string; sort_order: number; is_active: boolean }
interface Variant { id: string; name_ar: string; price_delta: string | number }
interface Product {
  id: string; category_id: string; name_ar: string; base_price: string | number; sku?: string | null;
  sort_order: number; is_active: boolean; variants: Variant[]; modifier_group_ids: string[];
}
interface Group {
  id: string; name_ar: string; min_select: number; max_select: number; is_required: boolean;
  modifiers: Array<{ id: string; name_ar: string; price_delta: string | number }>;
}

type Tab = "categories" | "products" | "groups" | "branch";

export function Menu() {
  const [tab, setTab] = useState<Tab>("categories");
  const tabs: Array<[Tab, string]> = [
    ["categories", t.menu.categories],
    ["products", t.menu.products],
    ["groups", t.menu.groups],
    ["branch", t.menu.branch],
  ];
  return (
    <div dir="rtl">
      <div className="page-head"><h1>{t.menu.title}</h1></div>
      <div className="seg" style={{ marginBottom: 16 }}>
        {tabs.map(([k, label]) => (
          <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === "categories" && <CategoriesTab />}
      {tab === "products" && <ProductsTab />}
      {tab === "groups" && <GroupsTab />}
      {tab === "branch" && <BranchTab />}
    </div>
  );
}

function CategoriesTab() {
  const { data, error, reload } = useList<Category>("/categories");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  async function add() {
    try {
      await api("/categories", { method: "POST", body: { name_ar: name, sort_order: data.length } });
      setName("");
      setErr("");
      reload();
    } catch (e: any) { setErr(e.message); }
  }
  async function toggle(c: Category) {
    await api(`/categories/${c.id}`, { method: "PATCH", body: { is_active: !c.is_active } });
    reload();
  }
  return (
    <>
      {(error || err) && <div className="alert">{error || err}</div>}
      <div className="form-row">
        <input placeholder={t.menu.nameAr} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" onClick={add} disabled={!name}>{t.menu.addCategory}</button>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>{t.menu.nameAr}</th><th>{t.menu.sortOrder}</th><th></th></tr></thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td>{c.name_ar}</td>
                <td>{c.sort_order}</td>
                <td>
                  <button onClick={() => toggle(c)}>{c.is_active ? t.common.active : t.common.inactive}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProductsTab() {
  const cats = useList<Category>("/categories");
  const groups = useList<Group>("/modifier-groups");
  const { data, error, reload } = useList<Product>("/products");
  const [form, setForm] = useState({ name_ar: "", category_id: "", base_price: 0, sku: "" });
  const [expanded, setExpanded] = useState("");
  const [vName, setVName] = useState("");
  const [vDelta, setVDelta] = useState(0);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!form.category_id && cats.data.length) setForm((f) => ({ ...f, category_id: cats.data[0].id }));
  }, [cats.data]);

  async function add() {
    try {
      await api("/products", {
        method: "POST",
        body: { ...form, sku: form.sku || null, base_price: Number(form.base_price), sort_order: data.length },
      });
      setForm({ ...form, name_ar: "", base_price: 0, sku: "" });
      setErr("");
      reload();
    } catch (e: any) { setErr(e.message); }
  }
  async function patch(id: string, body: Record<string, unknown>) {
    try { await api(`/products/${id}`, { method: "PATCH", body }); setErr(""); reload(); }
    catch (e: any) { setErr(e.message); }
  }
  async function addVariant(p: Product) {
    try {
      await api(`/products/${p.id}/variants`, { method: "POST", body: { name_ar: vName, price_delta: vDelta } });
      setVName(""); setVDelta(0); setErr(""); reload();
    } catch (e: any) { setErr(e.message); }
  }
  async function toggleGroup(p: Product, gid: string) {
    const next = p.modifier_group_ids.includes(gid)
      ? p.modifier_group_ids.filter((x) => x !== gid)
      : [...p.modifier_group_ids, gid];
    try {
      await api(`/products/${p.id}/modifier-groups`, { method: "PUT", body: { modifier_group_ids: next } });
      setErr(""); reload();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <>
      {(error || err) && <div className="alert">{error || err}</div>}
      <div className="form-row">
        <input placeholder={t.menu.nameAr} value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
        <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
          {cats.data.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
        </select>
        <input type="number" min={0} placeholder={t.menu.basePrice} value={form.base_price}
          onChange={(e) => setForm({ ...form, base_price: Number(e.target.value) })} />
        <input placeholder="SKU" dir="ltr" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        <button className="primary" onClick={add} disabled={!form.name_ar || !form.category_id}>{t.menu.addProduct}</button>
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr><th>{t.menu.nameAr}</th><th>{t.menu.category}</th><th>{t.menu.basePrice}</th><th>{t.menu.variants}</th><th></th></tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <>
                <tr key={p.id}>
                  <td>{p.name_ar}</td>
                  <td>{cats.data.find((c) => c.id === p.category_id)?.name_ar}</td>
                  <td>
                    <input
                      type="number" min={0} defaultValue={Number(p.base_price)} style={{ width: 90 }}
                      onBlur={(e) => Number(e.target.value) !== Number(p.base_price) && patch(p.id, { base_price: Number(e.target.value) })}
                    />
                  </td>
                  <td>{p.variants.map((v) => v.name_ar).join("، ") || "—"}</td>
                  <td>
                    <button onClick={() => setExpanded(expanded === p.id ? "" : p.id)}>
                      {expanded === p.id ? t.pos.close : t.orders.details}
                    </button>{" "}
                    <button onClick={() => patch(p.id, { is_active: !p.is_active })}>
                      {p.is_active ? t.common.active : t.common.inactive}
                    </button>
                  </td>
                </tr>
                {expanded === p.id && (
                  <tr key={`${p.id}-x`}>
                    <td colSpan={5}>
                      <div className="form-row">
                        <input placeholder={t.menu.nameAr} value={vName} onChange={(e) => setVName(e.target.value)} />
                        <input type="number" placeholder={t.menu.priceDelta} value={vDelta} onChange={(e) => setVDelta(Number(e.target.value))} />
                        <button onClick={() => addVariant(p)} disabled={!vName}>{t.menu.addVariant}</button>
                      </div>
                      <div className="mod-group-name">{t.menu.linkedGroups}</div>
                      <div className="seg wrap">
                        {groups.data.map((g) => (
                          <button key={g.id} className={p.modifier_group_ids.includes(g.id) ? "active" : ""} onClick={() => toggleGroup(p, g.id)}>
                            {g.name_ar}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function GroupsTab() {
  const { data, error, reload } = useList<Group>("/modifier-groups");
  const [gName, setGName] = useState("");
  const [maxSelect, setMaxSelect] = useState(1);
  const [required, setRequired] = useState(false);
  const [mName, setMName] = useState("");
  const [mDelta, setMDelta] = useState(0);
  const [target, setTarget] = useState("");
  const [err, setErr] = useState("");

  async function addGroup() {
    try {
      await api("/modifier-groups", {
        method: "POST",
        body: { name_ar: gName, max_select: maxSelect, is_required: required, min_select: required ? 1 : 0, sort_order: data.length },
      });
      setGName(""); setErr(""); reload();
    } catch (e: any) { setErr(e.message); }
  }
  async function addModifier() {
    try {
      await api(`/modifier-groups/${target}/modifiers`, { method: "POST", body: { name_ar: mName, price_delta: mDelta } });
      setMName(""); setMDelta(0); setErr(""); reload();
    } catch (e: any) { setErr(e.message); }
  }

  useEffect(() => {
    if (!target && data.length) setTarget(data[0].id);
  }, [data]);

  return (
    <>
      {(error || err) && <div className="alert">{error || err}</div>}
      <div className="form-row">
        <input placeholder={t.menu.nameAr} value={gName} onChange={(e) => setGName(e.target.value)} />
        <input type="number" min={1} title={t.menu.maxSelect} value={maxSelect} onChange={(e) => setMaxSelect(Number(e.target.value))} />
        <label><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> {t.menu.required}</label>
        <button className="primary" onClick={addGroup} disabled={!gName}>{t.menu.addGroup}</button>
      </div>
      <div className="form-row">
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {data.map((g) => <option key={g.id} value={g.id}>{g.name_ar}</option>)}
        </select>
        <input placeholder={t.menu.nameAr} value={mName} onChange={(e) => setMName(e.target.value)} />
        <input type="number" placeholder={t.menu.priceDelta} value={mDelta} onChange={(e) => setMDelta(Number(e.target.value))} />
        <button className="primary" onClick={addModifier} disabled={!mName || !target}>{t.menu.addModifier}</button>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>{t.menu.groups}</th><th>{t.menu.maxSelect}</th><th>{t.menu.required}</th><th>الإضافات</th></tr></thead>
          <tbody>
            {data.map((g) => (
              <tr key={g.id}>
                <td>{g.name_ar}</td>
                <td>{g.max_select}</td>
                <td>{g.is_required ? "نعم" : "لا"}</td>
                <td>{g.modifiers.map((m) => `${m.name_ar}${Number(m.price_delta) ? ` (+${Number(m.price_delta)})` : ""}`).join("، ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function BranchTab() {
  const branches = useList<{ id: string; name: string }>("/branches");
  const [branchId, setBranchId] = useState("");
  const [rows, setRows] = useState<Array<{
    id: string; name_ar: string; base_price: string | number; effective_price: number;
    is_available: boolean; availability_note_ar?: string | null;
  }>>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!branchId && branches.data.length) setBranchId(branches.data[0].id);
  }, [branches.data]);

  async function load() {
    if (!branchId) return;
    const res = await api<{ data: { categories: Array<{ products: typeof rows }> } }>(`/branches/${branchId}/menu`);
    setRows(res.data.categories.flatMap((c) => c.products));
  }
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [branchId]);

  async function setPrice(productId: string, value: string) {
    try {
      await api(`/branches/${branchId}/menu-prices`, {
        method: "PATCH",
        body: { items: [{ product_id: productId, price_override: value === "" ? null : Number(value) }] },
      });
      setMsg(t.common.save + " ✓"); setErr(""); load();
    } catch (e: any) { setErr(e.message); }
  }
  async function setAvail(productId: string, is_available: boolean, note?: string) {
    try {
      await api(`/branches/${branchId}/menu-availability`, {
        method: "PATCH",
        body: { items: [{ product_id: productId, is_available, availability_note_ar: note ?? null }] },
      });
      setMsg(t.common.save + " ✓"); setErr(""); load();
    } catch (e: any) { setErr(e.message); }
  }

  return (
    <>
      {err && <div className="alert">{err}</div>}
      {msg && <div className="ok">{msg}</div>}
      <div className="form-row">
        <label>{t.menu.chooseBranch}</label>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr><th>{t.menu.products}</th><th>{t.menu.basePrice}</th><th>{t.menu.priceOverride}</th><th>{t.menu.available}</th><th>{t.menu.availabilityNote}</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name_ar}</td>
                <td>{Number(p.base_price).toFixed(2)}</td>
                <td>
                  <input
                    type="number" min={0} style={{ width: 100 }}
                    defaultValue={p.effective_price !== Number(p.base_price) ? p.effective_price : ""}
                    onBlur={(e) => setPrice(p.id, e.target.value)}
                  />
                </td>
                <td>
                  <button onClick={() => setAvail(p.id, !p.is_available, p.availability_note_ar ?? undefined)}>
                    {p.is_available ? t.menu.available : t.menu.unavailable}
                  </button>
                </td>
                <td>
                  <input
                    defaultValue={p.availability_note_ar ?? ""}
                    onBlur={(e) => setAvail(p.id, p.is_available, e.target.value || undefined)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
