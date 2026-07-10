import { ReactNode, useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { brand } from "../../config/brand";
import { t } from "../../lib/t";
import { setToken } from "../../lib/api";
import { useMe, clearMe } from "../../lib/me";
import { Toaster } from "./overlays";

/**
 * YKMS-02F — AppShell: تنقّل نظامي موحد لكل الشاشات بما فيها POS.
 * - AppBar علوي ثابت: قائمة ☰ + الرئيسية + رجوع + عنوان القسم + المستخدم + خروج.
 * - NavDrawer بكل الأقسام المسموح بها (حالة نشِطة).
 * - Sidebar يبقى للشاشات الإدارية على الشاشات العريضة؛ POS يحصل على كامل المساحة.
 * - لا يعتمد المستخدم على زر المتصفح للرجوع أبدًا.
 */

export const NAV_LINKS: Array<{ to: string; label: () => string; perms: string[] | null }> = [
  { to: "/", label: () => t.nav.dashboard, perms: null },
  { to: "/pos", label: () => t.nav.pos, perms: ["orders.create"] },
  { to: "/kitchen", label: () => t.nav.kitchen, perms: ["kitchen.view"] },
  { to: "/orders", label: () => t.nav.orders, perms: ["orders.manage", "orders.create"] },
  { to: "/menu", label: () => t.nav.menu, perms: ["menu.manage"] },
  { to: "/customers", label: () => t.nav.customers, perms: ["customers.manage"] },
  { to: "/branches", label: () => t.nav.branches, perms: ["branches.manage"] },
  { to: "/users", label: () => t.nav.users, perms: ["users.manage"] },
  { to: "/devices", label: () => t.nav.devices, perms: ["devices.manage"] },
  { to: "/hardware", label: () => t.nav.hardware, perms: ["hardware.manage"] },
  { to: "/print-jobs", label: () => t.nav.printJobs, perms: ["print_jobs.manage", "print_jobs.create"] },
  { to: "/reports", label: () => t.nav.reports, perms: ["reports.view"] },
  { to: "/api-clients", label: () => t.nav.apiClients, perms: ["api_clients.manage"] },
  { to: "/audit", label: () => t.nav.audit, perms: ["audit.view"] },
  { to: "/settings", label: () => t.nav.settings, perms: null },
];

const TITLES: Record<string, () => string> = Object.fromEntries(NAV_LINKS.map((l) => [l.to, l.label]));

export function AppShell({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const location = useLocation();
  const { me, ready, can } = useMe();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // إغلاق قائمة التنقل تلقائيًا عند تغيّر المسار
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const isPos = location.pathname.startsWith("/pos");
  const links = NAV_LINKS.filter((l) => !ready || !l.perms || l.perms.some(can));
  const sectionTitle = (TITLES[location.pathname] ?? TITLES["/" + location.pathname.split("/")[1]])?.() ?? "";

  function logout() {
    setToken(null);
    clearMe();
    nav("/login");
  }

  return (
    <div className={`app2${isPos ? " app2-pos" : ""}`} dir="rtl">
      <header className="app2-bar">
        <button type="button" className="app2-menu" aria-label="القائمة الرئيسية" onClick={() => setDrawerOpen(true)}>☰</button>
        <Link to="/" className="app2-brand" title={t.nav.dashboard}>
          <img src={brand.logoPath} alt="" />
          <strong>{brand.nameAr}</strong>
        </Link>
        <Link to="/" className="app2-home" title={t.nav.dashboard} aria-label={t.nav.dashboard}>⌂</Link>
        <button
          type="button"
          className="app2-back"
          aria-label="رجوع"
          onClick={() => (window.history.length > 2 ? nav(-1) : nav("/"))}
        >
          ←
        </button>
        {sectionTitle && <span className="app2-crumb">{sectionTitle}</span>}
        <span className="app2-spacer" />
        {me && (
          <span className="app2-user" title={me.permissions.length + " صلاحية"}>
            <span className="app2-user-dot" aria-hidden />
            {me.name}
          </span>
        )}
        <button type="button" className="app2-logout" onClick={logout}>{t.nav.logout}</button>
      </header>

      <div className="app2-body">
        {!isPos && (
          <aside className="app2-side">
            <nav>
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
                  {l.label()}
                </NavLink>
              ))}
            </nav>
          </aside>
        )}
        <main className={`app2-main${isPos ? " full" : ""}`}>{children}</main>
      </div>

      {drawerOpen && (
        <div className="uif-overlay" onClick={() => setDrawerOpen(false)}>
          <aside className="uif-drawer app2-navdrawer" dir="rtl" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
            <header className="uif-drawer-head">
              <div className="uif-drawer-title">
                <img src={brand.logoPath} alt="" width={26} height={26} style={{ verticalAlign: "middle", marginInlineEnd: 8 }} />
                {brand.nameAr}
              </div>
              <button type="button" className="uif-x" aria-label="إغلاق" onClick={() => setDrawerOpen(false)}>✕</button>
            </header>
            <nav className="app2-navdrawer-links">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
                  {l.label()}
                </NavLink>
              ))}
            </nav>
            <footer className="uif-drawer-foot">
              <button type="button" className="uif-btn ghost" onClick={logout}>{t.nav.logout}</button>
            </footer>
          </aside>
        </div>
      )}

      <Toaster />
    </div>
  );
}
