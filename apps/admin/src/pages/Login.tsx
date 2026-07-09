import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../lib/api";
import { t } from "../lib/t";
import { brand } from "../config/brand";

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ token: string }>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setToken(res.token);
      nav("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <img src={brand.logoPath} alt={brand.nameAr} className="brand-logo big" />
          <span className="brand-mark">{brand.nameAr}</span>
          <span className="brand-sub">{brand.systemName} — {t.appTagline}</span>
        </div>
        <h1>{t.login.title}</h1>
        {error && <div className="error-note">{error}</div>}
        <div className="field">
          <label htmlFor="email">{t.login.email}</label>
          <input id="email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">{t.login.password}</label>
          <input id="password" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn full" disabled={busy}>
          {busy ? t.login.working : t.login.submit}
        </button>
      </form>
    </div>
  );
}
