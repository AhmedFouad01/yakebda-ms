import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { getToken, setToken } from "./lib/api";
import { t } from "./lib/t";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Branches } from "./pages/Branches";
import { Users } from "./pages/Users";
import { Devices } from "./pages/Devices";
import { Hardware } from "./pages/Hardware";
import { PrintJobs } from "./pages/PrintJobs";
import { ApiClients } from "./pages/ApiClients";
import { Audit } from "./pages/Audit";
import { Pos } from "./pages/Pos";
import { Kitchen } from "./pages/Kitchen";
import { Menu } from "./pages/Menu";
import { Orders } from "./pages/Orders";
import { Tables } from "./pages/Tables";
import { Customers } from "./pages/Customers";
import { Reports } from "./pages/Reports";
import { SettingsPage } from "./pages/Settings";
import { brand } from "./config/brand";
import { useMe, clearMe } from "./lib/me";
import { ReactNode } from "react";

/** الحارس: يعرض رسالة واضحة فقط عند فتح مسار مباشرة بدون صلاحية. */
function Guard({ perm, anyOf, children }: { perm?: string; anyOf?: string[]; children: ReactNode }) {
  const { ready, can } = useMe();
  if (!ready) return null;
  const ok = perm ? can(perm) : anyOf ? anyOf.some(can) : true;
  if (!ok) return <div className="alert" dir="rtl">{t.notAllowed}</div>;
  return <>{children}</>;
}

function Shell() {
  const nav = useNavigate();
  const { ready, can } = useMe();
  if (!getToken()) return <Navigate to="/login" replace />;
  // YKMS-02C: القائمة تعرض فقط ما يملك المستخدم صلاحيته (لا ضجيج 403)
  const links: Array<[string, string, string[] | null]> = [
    ["/", t.nav.dashboard, null],
    ["/pos", t.nav.pos, ["orders.create"]],
    ["/kitchen", t.nav.kitchen, ["kitchen.view"]],
    ["/menu", t.nav.menu, ["menu.manage"]],
    ["/orders", t.nav.orders, ["orders.manage", "orders.create"]],
    ["/tables", t.nav.tables, ["tables.manage", "orders.create"]],
    ["/customers", t.nav.customers, ["customers.manage"]],
    ["/branches", t.nav.branches, ["branches.manage"]],
    ["/users", t.nav.users, ["users.manage"]],
    ["/devices", t.nav.devices, ["devices.manage"]],
    ["/hardware", t.nav.hardware, ["hardware.manage"]],
    ["/print-jobs", t.nav.printJobs, ["print_jobs.manage", "print_jobs.create"]],
    ["/reports", t.nav.reports, ["reports.view"]],
    ["/api-clients", t.nav.apiClients, ["api_clients.manage"]],
    ["/audit", t.nav.audit, ["audit.view"]],
    ["/settings", t.nav.settings, null],
  ].filter(([, , perms]) => !ready || !perms || (perms as string[]).some(can)) as Array<[string, string, string[] | null]>;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-box">
          <img src={brand.logoPath} alt={brand.nameAr} className="brand-logo" />
          <div>
            <div className="brand-mark">{brand.nameAr}</div>
            <div className="brand-sub">{brand.systemName} — {t.appTagline}</div>
          </div>
        </div>
        <nav>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <button
          className="logout"
          onClick={() => {
            setToken(null);
            clearMe();
            nav("/login");
          }}
        >
          {t.nav.logout}
        </button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Shell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pos" element={<Guard perm="orders.create"><Pos /></Guard>} />
          <Route path="/kitchen" element={<Guard perm="kitchen.view"><Kitchen /></Guard>} />
          <Route path="/menu" element={<Guard perm="menu.manage"><Menu /></Guard>} />
          <Route path="/orders" element={<Guard anyOf={["orders.manage", "orders.create"]}><Orders /></Guard>} />
          <Route path="/tables" element={<Guard anyOf={["tables.manage", "orders.create"]}><Tables /></Guard>} />
          <Route path="/customers" element={<Guard perm="customers.manage"><Customers /></Guard>} />
          <Route path="/reports" element={<Guard perm="reports.view"><Reports /></Guard>} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/branches" element={<Branches />} />
          <Route path="/users" element={<Users />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/hardware" element={<Hardware />} />
          <Route path="/print-jobs" element={<PrintJobs />} />
          <Route path="/api-clients" element={<ApiClients />} />
          <Route path="/audit" element={<Audit />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
