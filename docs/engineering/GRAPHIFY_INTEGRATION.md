# Graphify Integration for YAKEBDA_MS

## Purpose

Graphify is used as development tooling for repository navigation. It builds a local knowledge graph from the YAKEBDA_MS codebase so Codex and Claude Code can query architecture, dependencies, paths, and concepts before scanning files manually.

Graphify is **not** an application runtime dependency and must not be added to `package.json`, deployed with the API, or bundled with the admin application.

## Supported assistants

- Codex uses the project `AGENTS.md`, a project-scoped skill, and a local `PreToolUse` hook.
- Claude Code uses the project `CLAUDE.md`, a project-scoped skill, and local search/read hooks.
- Both assistants query the same `graphify-out/graph.json`.

## Windows setup

Run from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-graphify.ps1
```

The script:

1. Installs Astral `uv` when it is missing.
2. Installs the pinned `graphifyy==0.9.17` tool.
3. Enables `multi_agent = true` in the user Codex config, preserving a timestamped backup when it changes the file.
4. Installs project-scoped Graphify skills for Codex and Claude Code.
5. Keeps machine-specific skill and hook files out of commits through `.git/info/exclude`.
6. Builds the initial knowledge graph when possible.
7. Installs the local post-commit graph refresh hook after a successful build.

To install the assistant integrations without building the graph:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-graphify.ps1 -SkipGraphBuild
```

## First use

From the YAKEBDA_MS repository root:

### Codex

```text
$graphify .
```

### Claude Code

```text
/graphify .
```

### PowerShell CLI

```powershell
graphify query "How does order submission reach PostgreSQL?"
graphify path "Order" "Payment"
graphify explain "AppShell"
```

Use `GRAPH_REPORT.md` for broad architecture review. Use `query`, `path`, and `explain` for normal focused work.

## Generated output

A successful build creates:

```text
graphify-out/
├── graph.json
├── graph.html
├── GRAPH_REPORT.md
└── manifest.json
```

Review generated files before committing them. The repository ignores machine-local or noisy Graphify artifacts such as `cost.json`, cache files, and `.graphify_python`.

## Update workflow

After code changes:

```powershell
graphify update .
```

For a full rebuild:

```powershell
graphify . --force
```

To refresh the installed tool deliberately:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-graphify.ps1 -GraphifyVersion 0.9.17 -SkipGraphBuild
```

Do not silently move to an unreviewed Graphify version. Update the pinned version in this document and the setup script together.

## Privacy and repository boundaries

- Code extraction is local through tree-sitter.
- Markdown, PDFs, images, office files, and media may use the active assistant model or a configured API backend for semantic extraction.
- Never add secrets, `.env` files, database dumps, uploads, private Real Memory packets, chat exports, credentials, or private operational evidence to the indexed repository.
- `.gitignore` and `.graphifyignore` are part of the indexing boundary and must remain restrictive.
- Query logging is explicitly disabled by the setup script for its session.

## Removal

Remove project-scoped integrations:

```powershell
graphify uninstall --project --platform codex
graphify uninstall --project --platform windows
graphify hook uninstall
```

Delete the generated graph only when a rebuild is intended:

```powershell
graphify uninstall --purge
```

## Validation checklist

```powershell
graphify --version
graphify query "What are the main YAKEBDA_MS subsystems?"
git status --short
```

Expected behavior:

- Codex and Claude consult Graphify first for codebase questions.
- Graphify does not alter production dependencies.
- Machine-specific hook paths are not staged by Git.
- Existing YAKEBDA_MS engineering rules remain authoritative.
