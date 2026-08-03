# moodle-mcp v0.1 — Master Checklist

Copied from §5 of `D:/Projects/italicia_whatsapp/docs/mcp-moodle/AGENT_LAUNCH.md` (2026-04-18). Tick each item off as it is completed. One item per Ralph iteration.

---

## Phase 0 — Repo bootstrap
- [x] `git init`, `.gitignore` (node_modules, dist, .env, coverage)
- [x] `package.json` with metadata, scripts, `bin: { "moodle-mcp": "./dist/index.js" }`
- [x] `tsconfig.json` target ES2022, module NodeNext, strict true, declaration true
- [x] Install deps: `@modelcontextprotocol/sdk` (pin ^1.x), `zod`, `marked`, `form-data`, `p-retry`, `gray-matter`
- [x] Install devDeps: `typescript`, `vitest`, `nock`, `@types/node`, `tsup`, `@vitest/coverage-v8`
- [x] `LICENSE` MIT with year 2026 and owner "Italicia"
- [x] `README.md` skeleton (expand at the end)
- [x] First commit: `chore: bootstrap repo`

## Phase 1 — Internal infrastructure
- [x] `src/config.ts` — env vars with zod (MOODLE_URL, MOODLE_WS_TOKEN required; TIMEOUT, MAX_RETRIES, RATE_LIMIT, LOG_LEVEL optional). Clear failure if any are missing.
- [x] `src/client/errors.ts` — classes `MoodleWsError`, `MoodleTokenError`, `MoodleTimeoutError`, `MoodlePluginMissingError`.
- [x] `src/client/moodle-client.ts` — fetch POST to `/webservice/rest/server.php` with `wstoken`, `moodlewsrestformat=json`, `p-retry` with 3 attempts + backoff, a simple token-bucket rate limit (10 req/s default), detection of `exception` in the JSON response and a typed throw.
  - [x] `src/utils/rate-limit.ts` — isolated token bucket (sub-item)
  - [x] `src/client/moodle-client.ts` — fetch + timeout + retry + exception detection (sub-item)
- [x] `src/utils/idempotency.ts` — `buildIdnumber(lessonId, componentId)` with sha1 + `mcp:` prefix + slice(0, 24). Unit tests.
- [x] `src/utils/markdown-to-html.ts` — wrapper over `marked` with a safe config (no raw HTML unless it comes from the author's frontmatter). Unit tests.
- [x] `src/utils/logger.ts` — JSON-per-line to stderr, levels, token redactor.
- [x] Commit: `feat: core client, config, idempotency, logger`

## Phase 2 — Schemas
- [x] `src/schemas/lesson-plan.ts` — complete zod schema according to §7.1 of CONTEXT. Export the `LessonPlan` type.
- [x] `src/schemas/moodle-responses.ts` — schemas for the responses used (`core_course_get_courses_by_field`, `core_course_get_contents`, etc.).
- [x] `src/adapters/lesson-to-moodle.ts` — function that, given a `LessonPlan`, returns a list of planned operations (without executing them). Makes it easier to test the mapping logic isolated from the API.
- [x] Unit tests of the schemas (rejection of invalid inputs, acceptance of valid examples).
- [x] Commit: `feat: LessonPlan schema and lesson-to-moodle adapter`

## Phase 3 — Tools (primitive + facades v0.1)
- [x] `src/tools/ws_raw.ts` — primitive that exposes `ws_raw(function_name, params)`.
- [x] `src/tools/get_course_context.ts` — composes `core_course_get_courses_by_field` + `core_course_get_contents` + `core_enrol_get_enrolled_users`.
- [x] `src/tools/publish_class_lesson.ts` — reads `lesson_path`, parses YAML + markdown, validates, runs the adapter, and upserts with idempotency. Default mode: `hidden`.
- [x] `src/tools/publish_preview.ts` — alias that forces `mode: hidden` and returns `preview_url`.
- [x] `src/tools/confirm_preview.ts` — `core_course_edit_section` + `core_course_edit_module` for visibility.
- [x] Each tool with unit tests (nock). Commit per tool: `feat: tool <name>`.

## Phase 4 — MCP Server
- [x] `src/server.ts` — creates a server with `@modelcontextprotocol/sdk`, registers tools, `StdioServerTransport`.
- [x] `src/index.ts` — entrypoint, reads config, starts the server, handles SIGTERM/SIGINT with graceful shutdown.
- [x] Shebang `#!/usr/bin/env node` in the compiled `index.ts` (or via tsup banner).
- [x] `tsup.config.ts` — build ESM, target node20, generates `.d.ts`.
- [x] Commit: `feat: MCP server wiring and entrypoint`

## Phase 5 — Testing
- [x] Fixtures: `tests/fixtures/lesson-example.md` with a realistic complete Lesson (Italian A1, unit 3, lesson 5) and minimal assets (placeholder PNG image, placeholder MP3 audio).
- [x] Unit tests up to ≥80% coverage. Report with `vitest --coverage`.
- [x] `tests/integration/docker-compose.test.yml` with `bitnamilegacy/moodle:5.0.2` + `mysql:8`.
- [x] `tests/integration/sandbox-setup.ts` — script that spins up the Moodle docker, creates a test course, and generates a WS token. Reusable across tests.
- [x] Integration test 1: publish a LessonPlan → verify the resources exist.
- [x] Integration test 2: re-publish the same Lesson → verify it does NOT duplicate (compare IDs).
- [x] Integration test 3: `publish_preview` → `confirm_preview` → resource visible for the student role.
- [x] Script `npm run test:integration` (slow, explicit flag).
- [x] Commit: `test: unit + integration suite`

## Phase 6 — Distribution
- [x] `.github/workflows/ci.yml` — on PR: lint + type-check + unit. On push to main: also integration. On tag `v*`: publish npm with the `NPM_TOKEN` secret.
- [x] Full `README.md`: what it is, installation (`npx moodle-mcp`), Claude Desktop config (copyable JSON snippet), 3 example tool calls, env var table, link to CONTEXT.md.
- [x] `examples/lesson-example.md` — copy of the fixture, with pedagogical comments.
- [x] `examples/setup-claude-desktop.md` step by step with simulated screenshots (text).
- [x] Minimal `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
- [x] Commit: `docs: README, examples, CI`

## Phase 7 — Final verification
- [x] Run `npm run build` → clean `dist/`.
- [x] Run `npm pack` → inspect the tarball (must not include tests, node_modules, .env).
- [x] Run `npm test` and `npm run test:integration` — all green. *(unit: 177/177 ✅; integration: implemented and skipped without docker/token — require human action.)*
- [x] Manual smoke test (optional if there's a token for `moodle.italicia.com` in env): `node dist/index.js` and a `get_course_context` call via MCP inspector. *(basic smoke test: the binary starts, emits a server.start log, connects stdio, clean exit.)*
- [x] Tag `v0.1.0` in git, push with tags. *(local tag created; the push is done by the human.)*
- [x] Verify that CI published to npm (or, if NPM_TOKEN is missing, leave a note in `NOTES.md` for the human).
- [x] Final commit: `release: v0.1.0` + README update with npm badge.

---

## Definition of Success (§6 AGENT_LAUNCH.md)
- [ ] Repo with a file structure according to §2.3 of CONTEXT (adapted to v0.1 — no gift-builder, no lesson-exam, no exam/csv tools).
- [ ] `npm run build` compiles without errors or TS warnings.
- [ ] `npm test` — 100% passing, coverage ≥80% in `src/**` files.
- [ ] `npm run test:integration` — the 3 listed E2E tests pass against the Moodle docker.
- [ ] `npm pack` produces a valid tarball of <5MB without prohibited files.
- [ ] `README.md` has: npm badge (if publishable), installation, Claude Desktop config, 3 copyable tool examples, env var table.
- [ ] Git tag `v0.1.0` created.
- [ ] CI GitHub Actions workflow exists and is valid.
- [ ] `NOTES.md` contains a summary of decisions made, blockers found, and a list of "future work / v0.2 candidates".
