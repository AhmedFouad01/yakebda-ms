# Baseline

- Repository: `AhmedFouad01/yakebda-ms`
- Base commit: `7acab101ad9947c8b9d328eac50660c30b71be3d`
- Integration branch: `feat/scc-client-sdk-pilot`
- Runtime: Node 22, TypeScript, Express, React/Vite, PostgreSQL/Knex, Vitest.
- Baseline contracts: 13 passing.
- Baseline API: 253 passing after recreating the already contaminated `ykms_test` database.
- Baseline Admin: 41 passing and one stale assertion that still excluded inventory operations delivered by merged PR #48. The assertion was corrected independently of SCC.
- Baseline build: Admin production build passed after the stale assertion correction.

No .NET application exists in the live repository; the integration follows the real TypeScript architecture rather than the earlier assumed .NET shape.
