from __future__ import annotations

import re
from pathlib import Path

PATH = Path("apps/admin/src/pages/Pos.tsx")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one exact match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected one regex match, found {count}")
    return updated


def main() -> None:
    text = PATH.read_text(encoding="utf-8")

    text = replace_once(
        text,
        'import { ProductEditor } from "./menu/ProductEditor";\n',
        "",
        "remove ProductEditor import",
    )

    text = regex_once(
        text,
        r"interface AdminCategory \{.*?\n\}\ninterface AdminProduct \{.*?\n\}\n\n",
        "",
        "remove embedded admin types",
    )

    text = replace_once(
        text,
        'type AdminPanel = "items" | "shift" | "offers" | null;\n',
        'type AdminPanel = "shift" | null;\n',
        "narrow admin panel type",
    )

    for old, label in [
        ('  const [picking, setPicking] = useState<MenuProduct | null>(null);\n', "remove picking state"),
        ('  const [editorProductId, setEditorProductId] = useState<string | null>(null);\n', "remove editor state"),
    ]:
        text = replace_once(text, old, "", label)

    text = regex_once(
        text,
        r"\n  const \[adminPanel, setAdminPanel\] = useState<AdminPanel>\(null\);\n"
        r"  const \[adminProducts, setAdminProducts\].*?\n"
        r"  \}\);\n",
        "\n  const [adminPanel, setAdminPanel] = useState<AdminPanel>(null);\n",
        "remove embedded admin state",
    )

    text = regex_once(
        text,
        r"  async function loadMenu\(currentBranchId = branchId, preserve = false\) \{.*?\n  \}\n\n  useEffect\(\(\) => \{",
        '''  async function loadMenu(currentBranchId = branchId) {
    if (!currentBranchId) return;
    const response = await api<{ data: { categories: MenuCategory[] } }>(`/branches/${currentBranchId}/menu`);
    const sorted = [...response.data.categories].sort((a, b) => catRank(a.name_ar) - catRank(b.name_ar));
    setCategories(sorted);
    setActiveCat("الكل");
  }

  useEffect(() => {''',
        "simplify menu reload",
    )

    text = regex_once(
        text,
        r"\n  async function loadAdminProducts\(\) \{.*?\n  const adminVisible = adminProducts\.filter\(.*?\n  \);\n",
        "",
        "remove embedded product management functions",
    )

    text = replace_once(
        text,
        '''                {can("menu.manage") && <button onClick={openItemsPanel}>إدارة الأصناف</button>}
                {can("shifts.manage") && <button onClick={() => setAdminPanel("shift")}>إدارة الشيفت</button>}
                <button onClick={() => setAdminPanel("offers")}>إدارة العروض</button>
                {can("settings.manage") && <button onClick={() => navigate("/settings")}>{t.nav.settings}</button>}''',
        '''                {can("menu.manage") && <button onClick={() => navigate("/menu")}>إدارة المنيو</button>}
                {can("shifts.manage") && <button onClick={() => setAdminPanel("shift")}>إدارة الشيفت</button>}
                {can("settings.manage") && <button onClick={() => navigate("/settings")}>{t.nav.settings}</button>}''',
        "replace POS admin menu",
    )

    text = regex_once(
        text,
        r"\n      \{picking && <OptionPicker.*?\n      \}\)\}\n      \{done && \(",
        "\n      {done && (",
        "remove dead picker and product editor mounts",
    )

    text = regex_once(
        text,
        r"      \{adminPanel && \(\n        <div className=\"modal-back\".*?\n      \}\)\}",
        '''      {adminPanel === "shift" && (
        <div className="modal-back" onClick={() => setAdminPanel(null)}>
          <div className="modal posx-admin-modal" onClick={(e) => e.stopPropagation()}>
            <ShiftPanel shift={shift} money={money} openShift={openShift} closeShift={closeShift} />
          </div>
        </div>
      )}''',
        "simplify POS admin modal",
    )

    text = regex_once(
        text,
        r"\nfunction ItemManager\(props: \{.*?\n\}\n\nfunction ShiftPanel",
        "\nfunction ShiftPanel",
        "remove embedded item manager component",
    )

    text = regex_once(
        text,
        r"\nfunction OffersPanel\(\) \{.*?\n\}\n\n/\*\*",
        "\n/**",
        "remove offers placeholder",
    )

    text = regex_once(
        text,
        r"\nfunction OptionPicker\(.*\Z",
        "\n",
        "remove dead option picker",
    )

    PATH.write_text(text, encoding="utf-8", newline="\n")
    print(f"Updated {PATH}")


if __name__ == "__main__":
    main()
