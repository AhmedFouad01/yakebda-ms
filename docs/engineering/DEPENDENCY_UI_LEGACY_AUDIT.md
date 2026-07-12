# YAKEBDA MS — Dependency Security & UI Legacy Audit

Status: Active remediation
Base commit: `732d862a7ee086c2f2b73b75f3cc6e8a89a19c96`
Branch: `audit/dependency-ui-legacy-cleanup`

## Executive summary

This audit follows the Security & Scope, Order Integrity, Pricing, and Runtime Reliability stabilization work.

The current system is operationally stable, but two dependency risks and several UI legacy paths remain. Fixes must be isolated, tested, and merged without `npm audit fix --force`.

## Dependency findings

### D-01 — `xlsx@0.18.5` is a vulnerable production dependency

Current lockfile version: `0.18.5`.

Confirmed risks when reading crafted spreadsheet files:

- Prototype Pollution — CVE-2023-30533 / GHSA-4r6h-8v6p-xvw6.
- Regular Expression Denial of Service — CVE-2024-22363 / GHSA-5pgg-2g8v-p4x9.

The public npm package is stale. The official SheetJS installation documentation identifies the SheetJS CDN tarball as the authoritative distribution and currently documents `0.20.3`.

Planned remediation:

1. Replace npm-registry `xlsx@0.18.5` with the official SheetJS `0.20.3` tarball.
2. Run Excel import/export regression tests using valid files, malformed files, large files, Arabic data, formulas, duplicate SKU rows, and empty sheets.
3. Preserve upload size limits and fail closed on parse errors.

Priority: Critical for production import flows.

### D-02 — Vite resolves vulnerable `esbuild@0.21.5`

Current lockfile versions:

- `vite@5.4.21`
- nested `esbuild@0.21.5`

The esbuild development-server advisory affects versions `<=0.24.2`; patched versions start at `0.25.0`.

Impact is limited to development-server exposure, not production bundles, but the toolchain should still be upgraded deliberately.

Planned remediation:

1. Identify the smallest supported Vite/plugin update that resolves esbuild to `>=0.25.0`.
2. Validate Node compatibility, Admin development startup, production build, proxying, uploaded images, and HMR.
3. Do not force an unsupported esbuild override outside Vite's declared range.

Priority: High for developer security; not a production runtime blocker.

### D-03 — Remaining audit findings require exact machine-readable output

The prior local audit reported six vulnerabilities. Exact package paths and severities must be captured using:

```bash
npm run audit:deps -- --json
npm run audit:deps:prod -- --json
```

No vulnerability will be suppressed without a written impact analysis.

## UI and legacy findings

### U-01 — Old product-management flow remains embedded in POS

`Pos.tsx` still contains:

- `AdminProduct` and `AdminCategory` models.
- Item loading, editing, toggling, and an embedded `ItemManager`.
- A stale message claiming direct image upload is unavailable.

Approved direction: POS is for ordering. Product management belongs in `/menu`.

Planned remediation: remove the embedded editor and route authorized users to `/menu`.

### U-02 — Offers button is a non-functional placeholder

The POS administration menu exposes “إدارة العروض”, but the panel only states that the backend module does not exist.

Planned remediation: remove the active-looking button and placeholder until the offers engine is implemented.

### U-03 — Dead POS flows remain reachable in source

Confirmed stale state/components:

- `picking`
- `OptionPicker`
- `editorProductId`
- `ProductEditor` mounted from POS

Planned remediation: remove dead state, imports, components, and callbacks after verifying the current product card covers all supported order configurations.

### U-04 — Shift open/close uses browser-native prompts

`window.prompt` is used for opening and closing cash values.

Planned remediation: replace with a branded, validated shift dialog with numeric constraints and explicit cancel/submit states.

### U-05 — AppShell uses text glyphs as interface icons

The shell uses `☰`, `⌂`, `←`, and `✕` directly.

Planned remediation: replace with a small consistent inline-SVG icon set while preserving accessible labels.

### U-06 — CSS layering and old visual tokens remain

The Admin entrypoint imports six global CSS files. `styles.css` still identifies the system as “Restaurant MS” and defines an old teal/saffron palette. Later files override earlier rules, including operational POS corrections.

Planned remediation:

1. Inventory selector usage before deletion.
2. Separate shared Admin tokens from POS dark-theme tokens.
3. Consolidate POS rules without changing accepted card proportions.
4. Remove unused selectors and minimize `!important`.
5. Run viewport and visual regression checks after each consolidation slice.

### U-07 — Unknown routes have no explicit Not Found state

The router has no catch-all route.

Planned remediation: add a branded Not Found state with safe navigation back to the dashboard.

## Remediation order

1. Capture exact dependency audit JSON.
2. Remove stale POS management and offers flows.
3. Replace native shift prompts.
4. Replace shell glyph icons and add Not Found handling.
5. Upgrade SheetJS and regression-test import/export.
6. Upgrade Vite/esbuild toolchain in an isolated commit.
7. Consolidate CSS only after selector inventory and viewport baselines.

## Validation gate

Every fix slice requires:

```bash
npm run check
git diff --check
```

Dependency slices also require fresh production and full audit reports. No merge is allowed with temporary patch files, unreviewed major upgrades, or unexplained audit suppressions.
