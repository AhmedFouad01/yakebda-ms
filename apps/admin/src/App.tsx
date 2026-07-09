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
import { brand } from "./config/brand";

function Shell() {
  const nav = useNavigate();
  if (!getToken()) return <Navigate to="/login" replace />;
  const links: Array<[string, string]> = [
    ["/", t.nav.dashboard],
    ["/pos", t.nav.pos],
    ["/kitchen", t.nav.kitchen],
    ["/menu", t.nav.menu],
    ["/orders", t.nav.orders],
    ["/tables", t.nav.tables],
    ["/customers", t.nav.customers],
    ["/branches", t.nav.branches],
    ["/users", t.nav.users],
    ["/devices", t.nav.devices],
    ["/hardware", t.nav.hardware],
    ["/print-jobs", t.nav.printJobs],
    ["/reports", t.nav.reports],
    ["/api-clients", t.nav.apiClients],
    ["/audit", t.nav.audit],
  ];
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
          <Route path="/pos" element={<Pos />} />
          <Route path="/kitchen" element={<Kitchen />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/tables" element={<Tables />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/reports" element={<Reports />} />
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
