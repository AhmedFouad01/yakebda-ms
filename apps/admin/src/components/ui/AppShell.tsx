import { ReactNode, useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { brand } from "../../config/brand";
import { t } from "../../lib/t";
import { setToken } from "../../lib/api";
import { useMe, clearMe } from "../../lib/me";
import { applyTheme, getActiveTheme, type AppTheme } from "../../lib/theme";
import { Toaster } from "./overlays";

/**
 * YKMS-02F — AppShell: تنقّل نظامي موحد لكل الشاشات بما فيها POS.
 * - AppBar علوي ثابت: قائمة + الرئيسية + رجوع + عنوان القسم + المستخدم + خروج.
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

type ShellIconName = "menu" | "home" | "back" | "close" | "sun" | "moon";

function ShellIcon({ name }: { name: ShellIconName }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "menu") {
    return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
  }
  if (name === "home") {
    return <svg {...common}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>;
  }
  if (name === "back") {
    return <svg {...common}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>;
  }
  if (name === "sun") {
    return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.41M17.66 6.34l1.41-1.41" /></svg>;
  }
  if (name === "moon") {
    return <svg {...common}><path d="M20.5 14.2A8.3 8.3 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" /></svg>;
  }
  return <svg {...common}><path d="M6 6l12 12M18 6 6 18" /></svg>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const location = useLocation();
  const { me, ready, can } = useMe();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(() => getActiveTheme());

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

  function toggleTheme() {
    const nextTheme: AppTheme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    setTheme(nextTheme);
  }

  const themeLabel = theme === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن";

  return (
    <div className={`app2${isPos ? " app2-pos" : ""}`} dir="rtl">
      <header className="app2-bar">
        <button type="button" className="app2-menu" aria-label="القائمة الرئيسية" onClick={() => setDrawerOpen(true)}>
          <ShellIcon name="menu" />
        </button>
        <Link to="/" className="app2-brand" title={t.nav.dashboard}>
          <img src={brand.logoPath} alt="" />
          <strong>{brand.nameAr}</strong>
        </Link>
        <Link to="/" className="app2-home" title={t.nav.dashboard} aria-label={t.nav.dashboard}>
          <ShellIcon name="home" />
        </Link>
        <button
          type="button"
          className="app2-back"
          aria-label="رجوع"
          onClick={() => (window.history.length > 2 ? nav(-1) : nav("/"))}
        >
          <ShellIcon name="back" />
        </button>
        {sectionTitle && <span className="app2-crumb">{sectionTitle}</span>}
        <span className="app2-spacer" />
        <button
          type="button"
          className="app2-theme"
          aria-label={themeLabel}
          title={themeLabel}
          aria-pressed={theme === "dark"}
          onClick={toggleTheme}
        >
          <ShellIcon name={theme === "dark" ? "sun" : "moon"} />
        </button>
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
              <button type="button" className="uif-x" aria-label="إغلاق" onClick={() => setDrawerOpen(false)}>
                <ShellIcon name="close" />
              </button>
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
