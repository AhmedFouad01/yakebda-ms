import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { initializeTheme } from "./lib/theme";
import "./theme.css";
import "./pages/reports/reports.css";
import "./global-colors.css";

document.documentElement.dir = "rtl";
document.documentElement.lang = "ar";
initializeTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
