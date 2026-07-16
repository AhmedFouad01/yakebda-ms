# Claude Code Project Guide

Use `AGENTS.md` as the authoritative engineering policy for this repository.

Before editing:

1. Read `AGENTS.md`.
2. Read `docs/engineering/CURRENT_IMPLEMENTATION.md`.
3. Inspect the relevant module and its tests.
4. Check the active branch and `git status --short`.

Do not weaken tenant or branch scoping, API permission enforcement, auditability, Arabic-first or RTL-first behavior, migration safety, or the established validation gates.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
