import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/ui/AppShell";
import { getToken } from "./lib/api";
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
import { Customers } from "./pages/Customers";
import { InventoryPage } from "./pages/inventory/InventoryPage";
import { AccountingPage } from "./pages/accounting/AccountingPage";
import { Reports } from "./pages/Reports";
import { SettingsPage } from "./pages/Settings";
import { NotFound } from "./pages/NotFound";
import { useMe } from "./lib/me";
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
  if (!getToken()) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
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
          <Route path="/customers" element={<Guard perm="customers.manage"><Customers /></Guard>} />
          <Route path="/inventory" element={<Guard perm="inventory.view"><InventoryPage /></Guard>} />
          <Route path="/accounting" element={<Guard perm="accounting.view"><AccountingPage /></Guard>} />
          <Route path="/reports" element={<Guard perm="reports.view"><Reports /></Guard>} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/branches" element={<Branches />} />
          <Route path="/users" element={<Users />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/hardware" element={<Hardware />} />
          <Route path="/print-jobs" element={<PrintJobs />} />
          <Route path="/api-clients" element={<ApiClients />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/tables" element={<Navigate to="/pos" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
