# sernobre-moodle-mcp

**Model Context Protocol (MCP)** server for Moodle. Lets AI agents (Claude, etc.) publish and manage pedagogical content — lessons, resources, activities, quizzes, forums — directly in Moodle via the **Web Services API**, with **guaranteed idempotency**.

This project grew out of [marcosnahuel/moodle-mcp](https://github.com/marcosnahuel/moodle-mcp). What began as a fork has since been **rebuilt from the ground up** — translated to English, hardened with bug fixes, and reshaped around our own teaching workflow — so it now stands as an independent codebase while keeping the spirit of the original:

- **Rewritten in English** — every tool, parameter and error message (the original project was in Spanish);
- **Bug fixes** — hardening across the publishing and question-editing flows;
- **A rewritten companion plugin** — the original's `local_italiciamcp` became `local_sernobre_mcp`, with its own Web Service endpoints.

> **Credits** — our thanks to [Marcos Nahuel](https://github.com/marcosnahuel) for creating the original `moodle-mcp`, which laid the groundwork for this project: https://github.com/marcosnahuel/moodle-mcp

## What is this?

`sernobre-moodle-mcp` is an MCP server in TypeScript/Node.js that exposes a set of *tools* that an AI agent can call to interact with a Moodle instance:

- create / update / duplicate / archive courses;
- manage sections and reorganize content;
- publish lessons and resources (idempotent);
- create quizzes from GIFT files;
- manage students (enrolment, groups, role changes, password resets);
- query grades, completion, submissions and attempts;
- create forums, calendar events and send messages;
- issue badges and read logs.

Besides the TS wrapper, the repository includes a **companion Moodle plugin** (`local_sernobre_mcp`) that adds extra Web Service *endpoints* (e.g. `upsert_quiz`, `upsert_page`, `add_questions_gift`) needed by some tools.

## Project status

| Component | Version |
|---|---|
| TypeScript wrapper (`sernobre-moodle-mcp`) | v0.1.0 |
| Moodle plugin (`local_sernobre_mcp`) | v0.1.0 |

See [CHANGELOG.md](CHANGELOG.md) for the full history of changes and migration notes.

## Features

- **Guaranteed idempotency** — publishing the same content twice never creates duplicates.
- **Translated to English** — all tools, parameters and error messages are in English (the original project was in Spanish).
- **Bugs fixed** — several fixes compared to the original project, notably in the `upsert_quiz`, `upsert_page`, `add_questions_gift` flows and in question editing on Moodle 5.x.
- **Configurable rate limiting, retries and timeout**.
- **Structured logging** (JSON per line) with automatic token redaction.
- **Companion Moodle plugin** with its own Web Service endpoints.

## Architecture

```
┌─────────────┐   MCP (stdio)   ┌──────────────────────┐   HTTPS JSON   ┌──────────────┐
│  AI Agent   │ ───────────────► │ sernobre-moodle-mcp │ ─────────────► │   Moodle     │
│ (Claude, …) │                  │  MCP server          │                │ Web Services │
└─────────────┘                  └──────────────────────┘                └──────────────┘
                                          │ HTTPS JSON
                                          ▼
                              ┌──────────────────────────┐
                              │  local_sernobre_mcp      │
                              │  plugin (extra endpoints)│
                              └──────────────────────────┘
```

## Requirements

- **Node.js ≥ 20**
- A **Moodle 4.x or 5.x** instance with **Web Services** enabled
- A Web Service token for a user with `editingteacher` or `manager` permissions

## Installation & configuration

### 1. Prerequisites

- **Node.js ≥ 20** (check with `node --version`)
- **npm** (comes with Node.js)
- A **Moodle 4.x or 5.x** instance that you administer
- A Moodle user with **`editingteacher`** or **`manager`** permissions on the courses you want to manage

### 2. Install the wrapper

```bash
git clone https://github.com/sernobre/moodle-mcp.git
cd moodle-mcp
npm install
npm run build
```

This produces the compiled server in `dist/` and the `sernobre-moodle-mcp` binary.

### 3. Configure environment variables

The server reads its configuration from environment variables. At minimum you must set `MOODLE_URL` and `MOODLE_WS_TOKEN`; everything else has sensible defaults.

| Variable | Required | Description |
|---|---|---|
| `MOODLE_URL` | Yes | URL of the Moodle instance (must be HTTPS, except in development) |
| `MOODLE_WS_TOKEN` | Yes | Moodle Web Service token (see step 4) |
| `MOODLE_WS_TIMEOUT_MS` | No | Timeout per request (default: `30000`) |
| `MOODLE_WS_MAX_RETRIES` | No | Number of retries (default: `3`) |
| `MOODLE_WS_RATE_LIMIT_PER_SEC` | No | Requests per second limit (default: `10`) |
| `MCP_LOG_LEVEL` | No | `error` \| `warn` \| `info` \| `debug` (default: `info`) |
| `MOODLE_ALLOW_INSECURE` | No | `true` allows HTTP URLs (development only) |

Set them in your shell before starting the server:

**PowerShell (Windows):**

```powershell
$env:MOODLE_URL = "https://your-moodle.example.com"
$env:MOODLE_WS_TOKEN = "paste-your-token-here"
$env:MCP_LOG_LEVEL = "info"
```

**bash / zsh (Linux, macOS):**

```bash
export MOODLE_URL="https://your-moodle.example.com"
export MOODLE_WS_TOKEN="paste-your-token-here"
export MCP_LOG_LEVEL="info"
```

Or create a `.env` file and load it in your shell (the project does **not** auto-load `.env` files — use a dotenv launcher or export them yourself).

### 4. Configure Moodle (Web Services) — one-time

Follow these steps on the Moodle side **before** first use:

1. **Site administration → Server → Web services** — enable web services and the **REST** protocol.
2. Install/update the companion plugin in step 6 below. During the upgrade, Moodle creates the pre-built **Sernobre MCP** external service with the MCP function allowlist.
3. Open **External services → Sernobre MCP** and keep **Authorised users only** enabled. Add only the dedicated MCP user.
4. Under **Manage tokens**, create a token for that user and select the **Sernobre MCP** service. A token created for another service is not interchangeable.

The pre-built service includes these core functions:

- `core_webservice_get_site_info`
- `core_course_get_courses_by_field`
- `core_course_get_contents`
- `core_course_create_courses`
- `core_course_update_courses`
- `core_course_edit_section`
- `core_course_edit_module`
- `core_enrol_get_enrolled_users`
- `core_calendar_create_calendar_events`
- `core_calendar_get_calendar_events`
- `core_calendar_update_event_start_day`
- `core_calendar_get_allowed_event_types`
- `mod_forum_get_forums_by_courses`
- `mod_forum_add_discussion`
- all `local_sernobre_mcp_*` functions declared by the companion plugin

The token user should have a dedicated least-privilege role in the system or relevant course-category context with these capabilities:

- `moodle/course:create`
- `moodle/course:update`
- `moodle/course:view`
- `moodle/course:manageactivities`
- `moodle/course:movesections`
- `moodle/course:sectionvisibility` (only when calling the deprecated core section show/hide API directly)
- `moodle/question:add`
- `enrol/manual:config`
- `moodle/calendar:manageentries`
- `moodle/calendar:manageownentries`
- `moodle/calendar:managegroupentries`
- `mod/forum:viewdiscussion`
- `mod/forum:startdiscussion`
- `webservice/rest:use`


`mod/forum:pindiscussions` is additionally needed when announcements must be pinned. The companion-plugin section endpoint `local_sernobre_mcp_update_section` requires `moodle/course:update`; it is the preferred route for MCP section edits. The destructive `core_calendar_delete_calendar_events` function is intentionally not in the pre-built service.

Add `moodle/category:manage` only when the MCP user must manage categories. Course deletion is deliberately not exposed by the built-in service; add `core_course_delete_courses` manually only after a separate review.

> **Audit tip:** create a dedicated user such as `moodle-mcp-bot`, assign the minimum role above only where needed, restrict the token by IP when possible, and set a validity date.

### 5. Start the server

```bash
npm start
```

The server starts, emits a `server.start` log line, and waits for MCP traffic over stdio. Logs are JSON per line on **stderr**; tokens are automatically redacted.

### 6. Install the companion plugin

Some tools need the `local_sernobre_mcp` Moodle plugin (`plugin-companion/local_sernobre_mcp.zip`):

1. Upload/unzip the archive into `<moodle-root>/local/`.
2. Go to **Site administration → Notifications** to complete the install/update. The version bump also registers or updates the pre-built **Sernobre MCP** service.
3. Use that service when creating the token. Do not create a second service unless you intentionally want a different function allowlist.
4. If the server is already running, restart it after updating the plugin.

### 7. Smoke test

Run the wrapper in a terminal and ask your MCP client to call `ws_raw` with `core_webservice_get_site_info`. If you get back your Moodle site name, the wiring is correct. A token error means step 4 needs checking; an HTTP 404 usually means `MOODLE_URL` has a trailing slash or a `/webservice/...` suffix (the wrapper appends that itself).

### 8. Connect an MCP client

**Claude Desktop** — add this to `claude_desktop_config.json` (Windows: `%APPDATA%\Claude\claude_desktop_config.json`; macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "moodle": {
      "command": "npx",
      "args": ["-y", "sernobre-moodle-mcp"],
      "env": {
        "MOODLE_URL": "https://your-moodle.example.com",
        "MOODLE_WS_TOKEN": "paste-your-token-here",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

To use your local build instead of the published package, point `command` at `node` with `args: ["K:\\Formação\\moodle\\moodle-mcp-sernobre\\dist\\index.js"]`.

Restart Claude Desktop and confirm the `moodle` server is listed as connected. See the full guide in [examples/setup-claude-desktop.md](examples/setup-claude-desktop.md).

**Codex (CLI)** — Codex configures MCP servers as TOML tables in `~/.codex/config.toml` (user-wide) or `.codex/config.toml` (project-scoped, trusted projects only). You do **not** run `npm start` yourself — Codex launches the server as a subprocess.

Run the published package from npm:

```toml
[mcp_servers.moodle]
command = "npx"
args = ["-y", "sernobre-moodle-mcp"]
env = { MOODLE_URL = "https://your-moodle.example.com", MOODLE_WS_TOKEN = "paste-your-token-here", MCP_LOG_LEVEL = "info" }
startup_timeout_sec = 20
```

Or add it with the Codex CLI (recommended — it writes the TOML for you):

```bash
codex mcp add moodle --env MOODLE_URL=https://your-moodle.example.com --env MOODLE_WS_TOKEN=your-token -- npx -y sernobre-moodle-mcp
```

To use your local build instead of the published package, set `command = "node"` with `args = ["K:\\Formação\\moodle\\moodle-mcp-sernobre\\dist\\index.js"]`.

Notes:

- Rebuild with `npm run build` after any source change if you use the local `dist/index.js` path.
- Use an absolute path to `node` if Codex cannot find it on PATH.
- Rather than hardcoding the token in `env`, you can forward it from your shell with `env_vars = ["MOODLE_WS_TOKEN"]` and export it before launching Codex.
- Verify with `codex mcp list`; raise `startup_timeout_sec` if the server boots slowly.

**Other MCP clients** — configure the client to launch `npx -y sernobre-moodle-mcp` (or `node dist/index.js` for a local build) over stdio with the same environment variables. The server exposes its tools via the standard MCP `tools/list` and `tools/call` capabilities.

## Available tools

### Courses
`create_course`, `update_course`, `duplicate_course`, `archive_course`, `list_my_courses`, `get_course_context`

### Sections
`create_section`, `update_section`, `create_sections`, `delete_sections`, `move_section`, `get_sections`, `update_sections`, `duplicate_section`, `reorder_sections`, `hide_section`, `release_section`

### Content
`publish_class_lesson`, `create_activity`, `update_activity`, `publish_preview`, `confirm_preview`, `delete_resource`, `generate_video`

### Assessment
`configure_quiz`, `create_quiz`, `update_quiz`, `import_gift`, `modify_question`, `get_quiz_questions`, `publish_exam_lesson`

### Communication
`create_forum`, `create_forum_announcement`, `send_moodle_message`, `get_site_info`, `get_course_logs`

### Gradebook
`get_grades`, `get_assign_submissions`, `get_completion`, `get_quiz_attempts`, `grade_manually`

### Students
`list_students`, `enrol_csv`, `unenrol_student`, `change_role`, `groups`, `reset_password`

### Other
`list_user_badges`, `create_calendar_event`, `update_event`, `delete_event`, `list_calendar_events`, `ws_raw`

## Lesson example

The repository includes a Markdown lesson example in [examples/lesson-example.md](examples/lesson-example.md), used with the `publish_class_lesson` tool.

## Development

```bash
npm run dev          # watch build
npm run typecheck    # type checking
npm run test         # unit tests
npm run test:integration  # integration tests (requires Moodle)
npm run build        # production build
```

## Repository structure

```
src/                    # TypeScript wrapper (MCP server)
  tools/                # tool implementations
  client/               # Moodle Web Services API client
  schemas/              # validation (zod)
  utils/                # idempotency, logging, rate limit, markdown→HTML
plugin-companion/       # Moodle plugin local_sernobre_mcp (PHP)
docs/                   # technical docs and roadmap
examples/               # examples (lesson, Claude Desktop setup)
tests/                  # tests
```

## License

MIT — see [LICENSE](LICENSE).

The original code this project is based on belongs to [marcosnahuel/moodle-mcp](https://github.com/marcosnahuel/moodle-mcp).
