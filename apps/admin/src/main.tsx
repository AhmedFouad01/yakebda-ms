import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { initializeTheme } from "./lib/theme";
import "./styles.css";
import "./ykms-02d.css";
import "./ykms-02f.css";
import "./pos-operational.css";
import "./pos-final.css";
import "./pos-card-layout-fix.css";
import "./ui-cleanup.css";
import "./theme.css";
import "./theme-interactions.css";
import "./ui-polish.css";
import "./ui-polish-final.css";
import "./final-closure.css";
import "./select-rendering-fix.css";
import "./pos-1920-density.css";
import "./pos-delivery-checkout.css";
import "./pos-fast-rail.css";
import "./pos-fast-rail-final.css";
import "./global-colors.css";

document.documentElement.dir = "rtl";
document.documentElement.lang = "ar";
initializeTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
