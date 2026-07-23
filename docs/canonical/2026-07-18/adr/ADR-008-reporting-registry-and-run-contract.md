<div dir="rtl" align="right">

# ADR-008 — Reporting Registry and Request-scoped Run Metadata

**الحالة:** Accepted for Draft PR #44

## السياق

تقارير متفرقة بدون تعريف typed تسبب اختلاف catalog/API/UI/export، وخلط metadata request مع persisted report run.

## القرار

- code-owned typed Report Registry.
- كل definition يحدد:
  - key/version.
  - permission.
  - filters.
  - dimensions/measures.
  - supported outputs.
  - template key.
  - query version.
- endpoints منفصلة للـtrend/by-branch/by-source بدل composite مبهم.
- metadata الحالية request-scoped response identity، وليست persisted run.
- source reporting يستخدم historical snapshots.
- timezone/scope explicit.
- invalid numeric data لا يتحول fake zero.
- visualization via isolated ECharts adapter + accessible table fallback.
- failed section لا يمحو sections الناجحة.

## Production Boundary

- ECharts must be controlled via npm/lockfile or vendored asset.
- persisted runs/schedules/exports ليست موجودة إلا إذا نُفذت بعقد منفصل.

</div>
