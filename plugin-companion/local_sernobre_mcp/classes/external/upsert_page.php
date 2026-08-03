<?php
namespace local_sernobre_mcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;
use moodle_url;

global $CFG;
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/course/modlib.php');
require_once($CFG->libdir . '/resourcelib.php');

/**
 * Upsert a mod_page in a course section using a stable idnumber as the key.
 *
 * - If a course_module with matching idnumber already exists in the course,
 *   its name/intro/content/visibility are updated in place.
 * - Otherwise, a new mod_page is created via add_moduleinfo() and its
 *   idnumber is written to course_modules.
 *
 * Idempotent: calling twice with the same idnumber never duplicates.
 */
class upsert_page extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'   => new external_value(PARAM_INT,  'Course ID'),
            'sectionnum' => new external_value(PARAM_INT,  'Section number (0 = general, 1..n = topics)'),
            'idnumber'   => new external_value(PARAM_TEXT, 'Stable idnumber used to find or anchor the module'),
            'name'       => new external_value(PARAM_RAW, 'Module display name'),
            'intro'      => new external_value(PARAM_RAW,  'Short description / intro HTML', VALUE_DEFAULT, ''),
            'content'    => new external_value(PARAM_RAW,  'Main body HTML content'),
            'visible'    => new external_value(PARAM_INT,  '1 visible to students, 0 hidden', VALUE_DEFAULT, 1),
        ]);
    }

    /**
     * @return array{action: string, cmid: int, instanceid: int, url: string}
     */
    public static function execute(
        int $courseid,
        int $sectionnum,
        string $idnumber,
        string $name,
        string $intro,
        string $content,
        int $visible
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid'   => $courseid,
            'sectionnum' => $sectionnum,
            'idnumber'   => $idnumber,
            'name'       => $name,
            'intro'      => $intro,
            'content'    => $content,
            'visible'    => $visible,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        if ($params['idnumber'] === '') {
            throw new \moodle_exception('idnumbermustnotbeempty', 'local_sernobre_mcp', '', null,
                'idnumber parameter is required and must be non-empty');
        }

        // Lookup existing module by idnumber (scoped to this course).
        $moduletype = $DB->get_record('modules', ['name' => 'page'], 'id', MUST_EXIST);

        $existing = $DB->get_record('course_modules', [
            'course'   => $course->id,
            'idnumber' => $params['idnumber'],
            'module'   => $moduletype->id,
        ]);

        if ($existing) {
            return self::update_existing($course, $existing, $params);
        }
        return self::create_new($course, $params);
    }

    /**
     * Update the mod_page behind an existing course_module.
     * Uses a minimal update object to avoid round-tripping all columns
     * through $DB->update_record (which in some schemas has trouble
     * re-writing columns read back as strings).
     */
    private static function update_existing(
        \stdClass $course,
        \stdClass $existing,
        array $params
    ): array {
        global $DB;

        $pageid = (int)$existing->instance;
        if ($pageid <= 0) {
            throw new \moodle_exception('noinstance', 'local_sernobre_mcp', '', null,
                "course_module {$existing->id} has no mod_page instance");
        }

        $update = (object)[
            'id'            => $pageid,
            'name'          => $params['name'],
            'intro'         => $params['intro'],
            'introformat'   => FORMAT_HTML,
            'content'       => $params['content'],
            'contentformat' => FORMAT_HTML,
            'timemodified'  => time(),
        ];
        $DB->update_record('page', $update);

        if ((int)$existing->visible !== (int)$params['visible']) {
            set_coursemodule_visible($existing->id, (int)$params['visible']);
        }

        rebuild_course_cache($course->id, true);

        self::log_debug('updated', $course->id, $existing->idnumber, $params['content']);

        return [
            'action'     => 'updated',
            'cmid'       => (int)$existing->id,
            'instanceid' => $pageid,
            'url'        => (new moodle_url('/mod/page/view.php', ['id' => $existing->id]))->out(false),
            'contentlen' => strlen($params['content']),
        ];
    }

    /**
     * Create a new mod_page using low-level Moodle helpers.
     *
     * We avoid `add_moduleinfo()` because it runs through the course form
     * stack and expects many derived fields to be present (completion,
     * availability, grade). For this plugin we only need the minimum
     * viable path: insert a `page` row, register a `course_modules` row,
     * attach it to the course section, and purge caches.
     */
    private static function create_new(\stdClass $course, array $params): array {
        global $DB;
        $moduletype = $DB->get_record('modules', ['name' => 'page'], 'id', MUST_EXIST);
        $moduleinfo = new \stdClass();
        $moduleinfo->modulename = 'page'; $moduleinfo->module = (int)$moduletype->id;
        $moduleinfo->section = (int)$params['sectionnum']; $moduleinfo->cmidnumber = $params['idnumber'];
        $moduleinfo->name = $params['name']; $moduleinfo->intro = $params['intro']; $moduleinfo->introformat = FORMAT_HTML;
        $moduleinfo->content = $params['content']; $moduleinfo->contentformat = FORMAT_HTML;
        $moduleinfo->display = RESOURCELIB_DISPLAY_AUTO; $moduleinfo->printintro = 0; $moduleinfo->printlastmodified = 1;
        $moduleinfo->popupwidth = 620; $moduleinfo->popupheight = 450; $moduleinfo->revision = 1;
        $moduleinfo->visible = (int)$params['visible']; $moduleinfo->visibleoncoursepage = 1;
        $moduleinfo->groupmode = 0; $moduleinfo->groupingid = 0; $moduleinfo->completion = COMPLETION_DISABLED;
        $moduleinfo->completionview = COMPLETION_VIEW_NOT_REQUIRED; $moduleinfo->completionexpected = 0; $moduleinfo->showdescription = 0;
        $created = \add_moduleinfo($moduleinfo, $course);
        rebuild_course_cache($course->id, true);
        self::log_debug('created', $course->id, $params['idnumber'], $params['content']);
        return ['action' => 'created', 'cmid' => (int)$created->coursemodule, 'instanceid' => (int)$created->instance,
            'url' => (new moodle_url('/mod/page/view.php', ['id' => $created->coursemodule]))->out(false), 'contentlen' => strlen($params['content'])];
    }
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'action'     => new external_value(PARAM_ALPHA, 'created or updated'),
            'cmid'       => new external_value(PARAM_INT,   'course_modules.id'),
            'instanceid' => new external_value(PARAM_INT,   'page.id (mod_page instance)'),
            'url'        => new external_value(PARAM_URL,   'Module view URL'),
            'contentlen' => new external_value(PARAM_INT,   'Length of the content received/stored (diagnostic)'),
        ]);
    }

    /**
     * Append a one-line diagnostic record to a file in Moodle's dataroot so
     * page-content issues can be traced without enabling site-wide debug.
     *
     * @param string $action 'created' or 'updated'
     * @param int $courseid
     * @param string $idnumber
     * @param string $content
     */
    private static function log_debug(string $action, int $courseid, string $idnumber, string $content): void {
        global $CFG;
        if (empty($CFG->dataroot)) {
            return;
        }
        $line = sprintf(
            "%s\t%s\tcourse=%d\tidnumber=%s\tcontentlen=%d\tfirst100=%s\n",
            date('c'),
            $action,
            $courseid,
            $idnumber,
            strlen($content),
            str_replace(["\n", "\r", "\t"], ' ', substr($content, 0, 100)),
        );
        @file_put_contents($CFG->dataroot . '/local_sernobre_mcp_upsert.log', $line, FILE_APPEND | LOCK_EX);
    }
}
