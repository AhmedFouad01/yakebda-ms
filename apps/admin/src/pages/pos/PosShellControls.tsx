import { createPortal } from "react-dom";
import { t } from "../../lib/t";
import { usePosController } from "./PosContext";

export function PosShellControls() {
  const {
    branches,
    branchId,
    setBranchId,
    can,
    historyOpen: _historyOpen,
    setHistoryOpen,
    search,
    setSearch,
    searchInputRef,
    shellControlsRoot,
    shellSessionRoot,
    shift,
    setAdminPanel,
  } = usePosController();

  return (
    <>
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
    </>
  );
}
