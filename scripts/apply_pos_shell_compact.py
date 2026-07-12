from pathlib import Path
import re


def sub_once(text: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return updated


# AppShell: POS has no back button or section title. User and shift action share one compact cluster.
app_shell = Path("apps/admin/src/components/ui/AppShell.tsx")
text = app_shell.read_text(encoding="utf-8")
text = sub_once(
    text,
    r'''        <button\n          type="button"\n          className="app2-back"\n          aria-label="رجوع"\n          onClick=\{\(\) => \(window\.history\.length > 2 \? nav\(-1\) : nav\("/"\)\)\}\n        >\n          <ShellIcon name="back" />\n        </button>\n        \{sectionTitle && <span className="app2-crumb">\{sectionTitle\}</span>\}\n        \{isPos && <div id="pos-appshell-controls" className="app2-pos-controls-slot" aria-label="إعدادات الطلب" />\}''',
    '''        {!isPos && (\n          <button\n            type="button"\n            className="app2-back"\n            aria-label="رجوع"\n            onClick={() => (window.history.length > 2 ? nav(-1) : nav("/"))}\n          >\n            <ShellIcon name="back" />\n          </button>\n        )}\n        {!isPos && sectionTitle && <span className="app2-crumb">{sectionTitle}</span>}\n        {isPos && <div id="pos-appshell-controls" className="app2-pos-controls-slot" aria-label="أدوات نقطة البيع" />}''',
    "POS back/title removal",
)
text = sub_once(
    text,
    r'''        \{me && \(\n          <span className="app2-user" title=\{me\.permissions\.length \+ " صلاحية"\}>\n            <span className="app2-user-dot" aria-hidden />\n            \{me\.name\}\n          </span>\n        \)\}\n        <button type="button" className="app2-logout" onClick=\{logout\}>\{t\.nav\.logout\}</button>''',
    '''        <div className="app2-account-cluster">\n          {isPos && <div id="pos-appshell-session" className="app2-pos-session-slot" />}\n          {me && (\n            <span className="app2-user" title={me.permissions.length + " صلاحية"}>\n              {!isPos && <span className="app2-user-dot" aria-hidden />}\n              {me.name}\n            </span>\n          )}\n        </div>\n        <button type="button" className="app2-logout" onClick={logout}>{t.nav.logout}</button>''',
    "POS account cluster",
)
app_shell.write_text(text, encoding="utf-8")


# POS: compact icon controls in AppShell; shift action beside real user name; order source label removed.
pos_path = Path("apps/admin/src/pages/Pos.tsx")
text = pos_path.read_text(encoding="utf-8")
text = text.replace('  const { can, me } = useMe();', '  const { can } = useMe();', 1)
text = text.replace(
    '  const [shellControlsRoot, setShellControlsRoot] = useState<HTMLElement | null>(null);\n',
    '  const [shellControlsRoot, setShellControlsRoot] = useState<HTMLElement | null>(null);\n  const [shellSessionRoot, setShellSessionRoot] = useState<HTMLElement | null>(null);\n',
    1,
)
text = text.replace(
    '  useEffect(() => {\n    setShellControlsRoot(document.getElementById("pos-appshell-controls"));\n  }, []);',
    '  useEffect(() => {\n    setShellControlsRoot(document.getElementById("pos-appshell-controls"));\n    setShellSessionRoot(document.getElementById("pos-appshell-session"));\n  }, []);',
    1,
)
portal_pattern = re.compile(r'''\n      \{shellControlsRoot && createPortal\(.*?\n      \)\}\n\n      <div className="posx-body">''', re.S)
portal_replacement = '''
      {shellControlsRoot && createPortal(
        <div className="posx-shell-operation-controls" aria-label="أدوات تشغيل نقطة البيع">
          <label
            className="posx-shell-icon posx-branch-picker"
            title={branches.find((branch) => branch.id === branchId)?.name ?? "اختيار الفرع"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 9h18" /><path d="M5 9v11h14V9" /><path d="M8 20v-6h8v6" /><path d="m4 9 2-5h12l2 5" />
            </svg>
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)} aria-label="اختيار الفرع">
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="posx-shell-icon posx-history-btn"
            title="سجل الطلبات"
            aria-label="سجل الطلبات"
            onClick={() => setHistoryOpen(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" />
            </svg>
          </button>
          <input
            ref={searchInputRef}
            className="posx-search"
            placeholder="ابحث باسم الصنف أو المكونات…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>,
        shellControlsRoot
      )}
      {shellSessionRoot && can("shifts.manage") && createPortal(
        <button
          type="button"
          className={`posx-shift-action${shift ? " is-open" : ""}`}
          onClick={() => setAdminPanel("shift")}
        >
          {shift ? t.shift.close : t.shift.open}
        </button>,
        shellSessionRoot
      )}

      <div className="posx-body">'''
text, count = portal_pattern.subn(portal_replacement, text, count=1)
if count != 1:
    raise SystemExit(f"POS portal replacement: expected one match, found {count}")
text = sub_once(
    text,
    r'''\n              <select value=\{branchId\} onChange=\{\(e\) => setBranchId\(e\.target\.value\)\} title="الفرع">\n              \{branches\.map\(\(branch\) => \(\n                <option key=\{branch\.id\} value=\{branch\.id\}>\{branch\.name\}</option>\n              \)\)\}\n            </select>''',
    '',
    "remove inline branch selector",
)
text = text.replace('              <span>مصدر الطلب</span>\n', '', 1)
pos_path.write_text(text, encoding="utf-8")


# Cart remove action: icon-only, accessible label retained.
cart_line = Path("apps/admin/src/components/pos/PosCartLine.tsx")
text = cart_line.read_text(encoding="utf-8")
text = text.replace(
    '''        <button type="button" className="posx-fast-remove" onClick={onRemove} aria-label={`حذف ${line.product.name_ar}`}>
          حذف
        </button>''',
    '''        <button type="button" className="posx-fast-remove" onClick={onRemove} aria-label={`حذف ${line.product.name_ar}`} title="حذف الصنف">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 14H6L5 6" /><path d="M10 11v5M14 11v5" />
          </svg>
        </button>''',
    1,
)
cart_line.write_text(text, encoding="utf-8")


# Component-scoped final geometry in the existing Fast Rail stylesheet.
css_path = Path("apps/admin/src/pos-fast-rail.css")
css = css_path.read_text(encoding="utf-8")
marker = "/* Compact POS AppShell and square cart media. */"
if marker not in css:
    css += '''

/* Compact POS AppShell and square cart media. */
.app2-pos .app2-bar {
  min-height: 50px !important;
  padding-block: 4px !important;
  gap: 6px !important;
}

.app2-pos .app2-pos-controls-slot {
  justify-content: flex-start;
  overflow: visible;
}

.app2-pos .posx-shell-operation-controls {
  width: min(760px, 100%);
  grid-template-columns: 40px 40px minmax(260px, 1fr);
  gap: 6px;
}

.app2-pos .posx-shell-icon {
  position: relative;
  display: grid !important;
  place-items: center;
  width: 40px !important;
  min-width: 40px !important;
  height: 40px !important;
  min-height: 40px !important;
  padding: 0 !important;
  margin: 0 !important;
  border: 1px solid var(--yk-line) !important;
  border-radius: 9px !important;
  background: var(--yk-black-2) !important;
  color: var(--yk-text) !important;
  cursor: pointer;
}

.app2-pos .posx-shell-icon:hover,
.app2-pos .posx-shell-icon:focus-within {
  border-color: var(--yk-yellow) !important;
  color: var(--yk-yellow) !important;
}

.app2-pos .posx-branch-picker select {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  opacity: 0;
  cursor: pointer;
}

.app2-pos .posx-shell-operation-controls .posx-search {
  height: 40px !important;
  min-height: 40px !important;
  margin: 0 !important;
}

.app2-account-cluster {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.app2-pos .app2-user {
  padding-inline: 4px !important;
  white-space: nowrap;
}

.app2-pos .app2-pos-session-slot {
  display: flex;
  align-items: center;
}

.app2-pos .posx-shift-action {
  min-height: 36px !important;
  height: 36px !important;
  padding-inline: 12px !important;
  border-color: var(--yk-line) !important;
  background: var(--yk-black-2) !important;
  color: var(--yk-text) !important;
  white-space: nowrap;
}

.app2-pos .posx-shift-action.is-open {
  border-color: #31b66b !important;
  color: #8ce6ad !important;
}

.app2-pos .posx-source-field {
  align-self: end;
}

.app2-pos .posx-fast-line {
  grid-template-columns: 72px minmax(0, 1fr) 122px;
  min-height: 92px;
}

.app2-pos .posx-fast-line-thumb {
  width: 72px;
  height: 72px;
  min-height: 0;
  aspect-ratio: 1 / 1;
  align-self: center;
}

.app2-pos .posx-fast-remove {
  width: 36px !important;
  min-width: 36px !important;
  padding: 0 !important;
  justify-self: center;
  display: grid !important;
  place-items: center;
  border-radius: 9px !important;
}

@media (max-width: 1280px) {
  .app2-pos .posx-shell-operation-controls {
    grid-template-columns: 40px 40px minmax(180px, 1fr);
  }
}
'''
css_path.write_text(css, encoding="utf-8")

print("Applied compact POS shell and cart revision")
