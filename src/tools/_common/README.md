# `_common` — shared helpers for tools

Non-tool utilities used across all families.

- `visibility.ts` — `setSectionVisibility(client, sectionid, visible)`, `setModuleVisibility(client, cmid, visible)`.

These do not export `ToolDefinition`s. Never register anything under `_common` in `src/server.ts`.
