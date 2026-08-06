# Changelog

All notable changes to `moodle-mcp` (wrapper TS) and `local_sernobre_mcp` (plugin PHP) are documented here.
Follows [Keep a Changelog](https://keepachangelog.com/).

## Plugin local_sernobre_mcp v0.8.9 — 2026-08-06

### Added
- **`get_assignment_config` (read-only)**: new companion endpoint `local_sernobre_mcp_get_assignment_config` + wrapper tool. Returns, per assignment in a course (optionally filtered by `idnumber` or `cmid`), the enabled submission plugins (`assignsubmission_file`, `assignsubmission_onlinetext`, `assignfeedback_comments`), max files, word limit, max file size, due dates and grade. Fills the gap left by `mod_assign_get_assignments` (not exposed in the service, and it does not report submission plugin state), so agents can confirm programmatically whether an assignment accepts file and/or online-text submissions before submitting.

### Migration notes
- Re-upload `plugin-companion/local_sernobre_mcp.zip` (v0.8.9), run the Moodle plugin upgrade, purge caches, and rebuild the local MCP server if using `dist/`. The new function is registered in the `sernobre_mcp` service automatically on upgrade.

---
## Plugin local_sernobre_mcp v0.8.8 — 2026-08-06

### Fixed
- Assignment file submission: assignments created or updated by upsert_assignment now ensure the native file submission plugin is present without duplicating or overriding existing assignment settings.
- MCP file submission: added submit_assignment_file, using Moodle’s native draft upload, assignment save, and optional final submission workflow.
- Sernobre MCP service: added the three core functions required by the new workflow: core_files_upload, mod_assign_save_submission, and mod_assign_submit_for_grading.

### Migration notes
- Re-upload plugin-companion/local_sernobre_mcp.zip (v0.8.8), run the Moodle plugin upgrade, purge caches, and rebuild the local MCP server if using dist/.
- Extra functions can be added manually under Site administration -> Plugins -> Web services -> External services -> Sernobre MCP -> Functions. The service allowlist does not grant capabilities; the token user still needs the capability required by each function.

---
## Plugin `local_sernobre_mcp` v0.8.7 — 2026-08-05

### Fixed
- **`add_questions_gift`**: replaced the deprecated `quiz_update_sumgrades()` call with `mod_quiz\quiz_settings::get_grade_calculator()->recompute_quiz_sumgrades()` on Moodle 4.2+/5.x. Moodle 4.0/4.1 keeps the compatibility fallback.

### Migration notes
- Re-upload `plugin-companion/local_sernobre_mcp.zip` (v0.8.7) and run the Moodle plugin upgrade.

---

## Plugin `local_sernobre_mcp` v0.1.0 — 2026-08-02

### Changed
- **Version reset**: the plugin restarts at v0.1.0 to align with the `sernobre-moodle-mcp` wrapper (also reset to v0.1.0). The v0.6.x history below is kept for reference; the plugin is now distributed as part of the `sernobre-moodle-mcp` package.

### Migration notes
- Re-upload `plugin-companion/local_sernobre_mcp.zip` (v0.1.0) to `<moodle-root>/local/sernobre_mcp/` and run the plugin update.

---

## Plugin `local_sernobre_mcp` v0.6.3 — 2026-08-02

### Fixed
- **Diagnostics for "pages published but content empty"**: `upsert_page` now returns a `contentlen` field (characters of content it received) and appends a diagnostic line to `$CFG->dataroot/local_sernobre_mcp_upsert.log` (course, idnumber, action, content length, first 100 chars). The wrapper `publish_class_lesson` now emits a `warning` when a component renders with EMPTY content (typically a missing `{#id}` anchor in the Lesson markdown) and surfaces `contentlen` per resource so the tool output pinpoints whether the wrapper sent content or Moodle dropped it.

### Migration notes
- Re-upload `plugin-companion/local_sernobre_mcp.zip` (v0.6.3) and restart the MCP server (wrapper rebuilt). The `contentlen` return field is additive; the old wrapper ignores it.

---

## Plugin `local_sernobre_mcp` v0.6.2 — 2026-08-02

### Fixed
- **`upsert_page` (and `upsert_quiz`, `upsert_assignment`, `upsert_url`, `upsert_forum`, `duplicate_section`, `update_question_simple`)**: calls failed with "Invalid parameter value detected" when `name` contained `<` or `>` characters. Moodle 5.x `validate_param()` performs a strict `(string)$param !== (string)$cleaned` comparison, and `PARAM_TEXT` cleaning runs `strip_tags()`, so any name with angle brackets was stripped and then rejected. `name` is now declared `PARAM_RAW` (display-only field, no tag stripping) across all upsert/duplicate endpoints.
- Plugin version bumped to `v0.6.2` / `2026080202` so Moodle re-reads the changed function signatures after upload (purge caches not strictly required — `execute_parameters()` is read at call time, but the version bump triggers the plugin upgrade flow).

### Migration notes
- Re-upload `plugin-companion/local_sernobre_mcp.zip` (v0.6.2) to `<moodle-root>/local/sernobre_mcp/` and run the plugin update. No wrapper changes required.

---

## Plugin `local_sernobre_mcp` v0.6.1 — 2026-08-02

### Fixed
- **`upsert_quiz`**: Root-cause fix for "Can't find data record in database". The `create_new()` path set `$cm->section` to the section **ID** (e.g. 5), but `add_course_module()` internally calls `course_add_cm_to_section()` which interprets the value as a section **NUMBER**, causing a lookup for a non-existent section. Fixed to use `$cm->section = 0` as a placeholder (matching `upsert_page` and `upsert_assignment`) and then explicitly call `course_add_cm_to_section($course, $cm->id, $sectionnum)` with the section **NUMBER**.

### Fixed
- **`upsert_quiz`**: Critical bug causing "Can't find data record in database" when creating quizzes. The plugin's `create_new()` passed `$cm->section = $sectionid` (section **ID**) to `add_course_module()`, which internally calls `course_add_cm_to_section()` treating the value as a section **NUMBER**, causing a lookup for a non-existent section number. Fixed to use `$cm->section = 0` as a placeholder and pass the section NUMBER to `course_add_cm_to_section()`. This matches the working pattern in `upsert_page` and `upsert_assignment`. A `resolve_section_id()` validation gate was also added to pre-validate the section.

### Added — 3 new plugin endpoints
- **`upsert_forum`**: Create or update a `mod_forum` (general, news, Q&A, social, etc.) by idnumber.
- **`duplicate_section`**: Deep-copy all modules from one section into a new section in the same course.
- **`get_quiz_questions`**: List all questions (id, name, type, slot) attached to a quiz by idnumber.

### TS wrapper `moodle-mcp` v0.6.1

### Fixed
- `configure_quiz` and `publish_exam_lesson` now work correctly with the fixed `upsert_quiz` plugin endpoint. Previously, creating a quiz would fail with "Can't find data record in database".

### Added — 4 new tools
- **`create_forum`**: Create or update a forum (discussion, announcement, Q&A, etc.) in a course section. Idempotent by slug.
- **`delete_resource`**: Delete a Moodle course module by idnumber. Safety guard: only deletes MCP-managed idnumbers (mcp: prefix) by default; `force=true` to override.
- **`get_quiz_questions`**: List all questions attached to a quiz (by slug). Read-only. Returns question id, name, type, and slot number.
- **`duplicate_section`**: Duplicate all modules from a source section to a new section in the same course. Idempotent: returns "exists" if a section with that name already exists.

### Migration notes
- The `upsert_quiz` PHP fix is backwards-compatible — existing calls with correct section numbers now work.
- New endpoints must be added to the Moodle external service configuration after plugin deployment.

---

## Plugin `local_sernobre_mcp` v0.5.0 — 2026-05-03

### Fixed
- **`add_questions_gift`**: broken contract since v0.4.x. The wrapper sent `quiz_idnumber` and `append`, but the plugin expected `quizidnumber` and did not declare `append`. Result: 100% of calls failed with `invalid_parameter_exception`. It now accepts both idnumber names and declares `append` with a default of 1.

### Added
- **`add_questions_gift`**: new mode `append=0` to create questions in the question bank without attaching them to a specific quiz (useful for preparing reusable banks).
- **`add_questions_gift`**: new fields in the response (`created`, `existing`, `appended`, `category_id`) so the TS wrapper can map them without parsing `imported`.

### Migration notes
- The plugin remains backwards-compatible: old scripts that send `quizidnumber` still work.
- The `moodle-mcp` wrapper must also be bumped to v0.5.2 to take advantage of the new response.

---

## [0.5.0] — 2026-04-20

### Added — 35 new tools, covering ~80% of the teaching workflow

**Course (5 new):** `create_course`, `update_course`, `duplicate_course`, `archive_course`, `list_my_courses`.

**Sections (5 new):** `create_section`, `update_section`, `hide_section`, `release_section`, `reorder_sections`.

**Content (fix + 2 new):**
- `publish_class_lesson` now **uploads asset files** (images/audios) via `local_sernobre_mcp_upload_file` and rewrites markdown `./assets/...` refs to the Moodle pluginfile URLs (Phase 2a).
- Auto-creates **`mod_url`** and **`mod_assign`** modules via new plugin endpoints (Phase 2b/2c).

**Assessment (3 new):** `publish_exam_lesson` (one-shot upsert_quiz + GIFT import + repair_sections + promote_questions), `configure_quiz`, `import_gift`.

**Students (7 new):** `list_students`, `enrol_csv` (creates missing users with temp passwords + batched enrol), `unenrol_student`, `create_group`, `assign_to_group`, `change_role`, `reset_password`.

**Gradebook (5 new):** `get_grades`, `get_completion`, `get_quiz_attempts`, `get_assign_submissions`, `grade_manually`.

**Communication (4 new):** `send_moodle_message`, `create_forum_announcement` (auto-resolves news forum), `get_course_logs` (derived from enrolment access times — Moodle core exposes no log WS), `get_site_info`.

**Calendar (4 new):** `create_calendar_event`, `list_calendar_events`, `update_event`, `delete_event`.

**Badges (1 new, read-only):** `list_user_badges`.

### Plugin companion — `local_sernobre_mcp` v0.4.1

- New endpoint `upsert_url` (mod_url create/update by idnumber).
- New endpoint `upsert_assignment` (mod_assign create/update by idnumber, with submission plugins seeded).
- Requires redeploy in the Moodle admin and adding the two new functions to the external service the token belongs to.

### Refactor

- `src/tools/` reorganized into per-family subfolders (`course/`, `sections/`, `content/`, etc). Legacy imports updated via `git mv` so history is preserved.
- New `src/tools/_common/` with shared `buildIdnumber()`, `setSectionVisibility`, and `setModuleVisibility` helpers.

### Tests

- 270 unit tests pass (vs 14 in v0.4). Coverage stays ≥80% across src/.
- No regression to existing `publish_class_lesson` / `generate_video` / core client tests.

### Known deferred to v0.6

These six facades need new plugin endpoints (not yet in `local_sernobre_mcp`):

- `duplicate_section` — Moodle core has no `core_course_duplicate_section` WS.
- `create_question_bank` — no `core_question_category_create_category` in core.
- `edit_question_bank` — same.
- `release_quiz` / `hide_quiz` — no `core_course_edit_module` in core service.
- `award_badge` — only `core_badges_get_user_badges` is exposed; award is not.

See `italiacia_whatsapp/moodle/decisions-and-lessons.md` for the full rationale (lessons L4–L13).

## [0.4.0] — 2026-04-19

### Added
- `generate_video` tool — generates didactic videos via Google Gemini Veo 3.1, uploads + embeds in a `mod_page` in one call.
- Plugin companion v0.3.8 — fixes `quiz_sections` to resolve the `noquestionsfound` attempt bug.

## [0.3.x] — 2026-04-18 → 2026-04-19 (plugin iteration)

- v0.3.0: `local_sernobre_mcp_upload_file` + pluginfile callback.
- v0.3.1: italicia.com palette styling + plugin 0.2.0 (course summary + quiz shell).
- v0.3.2: auto-create sections via `local_wsmanagesections`.
- v0.3.5: `add_questions_gift` + persist `idnumber` after `add_course_module`.
- v0.3.8: fix quiz attempts `noquestionsfound` via `repair_quiz_sections` + `promote_quiz_questions`.

## [0.1.0–0.1.2] — 2026-04-18

- Initial MVP: 5 tools (`get_course_context`, `publish_class_lesson`, `publish_preview`, `confirm_preview`, `ws_raw`) + styled pages + section visibility via `local_wsmanagesections`.
