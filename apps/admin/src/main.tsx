import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./ykms-02d.css";
import "./ykms-02f.css";
import "./pos-operational.css";
import "./pos-final.css";
import "./pos-card-layout-fix.css";

document.documentElement.dir = "rtl";
document.documentElement.lang = "ar";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
