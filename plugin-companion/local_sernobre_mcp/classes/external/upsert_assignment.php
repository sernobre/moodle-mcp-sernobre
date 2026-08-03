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
 * Upsert a mod_assign in a course section using a stable idnumber as the key.
 *
 * Mirrors upsert_page / upsert_url: find-or-create by idnumber, update
 * name/intro/duedate/grade/visibility in place when the cm already exists,
 * create a new mod_assign attached to the given section number otherwise.
 *
 * Only the fields most relevant to a language-teaching assignment are
 * exposed; other columns are seeded with Moodle defaults. If the
 * operator needs to tweak e.g. `teamsubmission`, they can still do it
 * via `ws_raw` + core_course_edit_module or via the Moodle UI.
 *
 * Idempotent: calling twice with the same idnumber never duplicates.
 */
class upsert_assignment extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'                 => new external_value(PARAM_INT,  'Course ID'),
            'sectionnum'               => new external_value(PARAM_INT,  'Section number (0 = general, 1..n = topics)'),
            'idnumber'                 => new external_value(PARAM_TEXT, 'Stable idnumber used to find or anchor the module'),
            'name'                     => new external_value(PARAM_RAW, 'Assignment display name'),
            'intro'                    => new external_value(PARAM_RAW,  'Description HTML shown to students', VALUE_DEFAULT, ''),
            'duedate'                  => new external_value(PARAM_INT,  'Unix timestamp for due date (0 = no due date)', VALUE_DEFAULT, 0),
            'allowsubmissionsfromdate' => new external_value(PARAM_INT,  'Unix timestamp when submissions open (0 = immediately)', VALUE_DEFAULT, 0),
            'cutoffdate'               => new external_value(PARAM_INT,  'Unix timestamp after which no submissions are accepted (0 = no cutoff)', VALUE_DEFAULT, 0),
            'grade'                    => new external_value(PARAM_INT,  'Max grade (positive = point scale, 0 = no grading, negative = scale id)', VALUE_DEFAULT, 100),
            'visible'                  => new external_value(PARAM_INT,  '1 visible to students, 0 hidden', VALUE_DEFAULT, 1),
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
        int $duedate,
        int $allowsubmissionsfromdate,
        int $cutoffdate,
        int $grade,
        int $visible
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid'                 => $courseid,
            'sectionnum'               => $sectionnum,
            'idnumber'                 => $idnumber,
            'name'                     => $name,
            'intro'                    => $intro,
            'duedate'                  => $duedate,
            'allowsubmissionsfromdate' => $allowsubmissionsfromdate,
            'cutoffdate'               => $cutoffdate,
            'grade'                    => $grade,
            'visible'                  => $visible,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        if ($params['idnumber'] === '') {
            throw new \moodle_exception('idnumbermustnotbeempty', 'local_sernobre_mcp', '', null,
                'idnumber parameter is required and must be non-empty');
        }

        $moduletype = $DB->get_record('modules', ['name' => 'assign'], 'id', MUST_EXIST);

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

    private static function update_existing(
        \stdClass $course,
        \stdClass $existing,
        array $params
    ): array {
        global $DB;

        $assignid = (int)$existing->instance;
        if ($assignid <= 0) {
            throw new \moodle_exception('noinstance', 'local_sernobre_mcp', '', null,
                "course_module {$existing->id} has no mod_assign instance");
        }

        $update = (object)[
            'id'                       => $assignid,
            'name'                     => $params['name'],
            'intro'                    => $params['intro'],
            'introformat'              => FORMAT_HTML,
            'duedate'                  => (int)$params['duedate'],
            'allowsubmissionsfromdate' => (int)$params['allowsubmissionsfromdate'],
            'cutoffdate'               => (int)$params['cutoffdate'],
            'grade'                    => (int)$params['grade'],
            'timemodified'             => time(),
        ];
        $DB->update_record('assign', $update);

        if ((int)$existing->visible !== (int)$params['visible']) {
            set_coursemodule_visible($existing->id, (int)$params['visible']);
        }

        rebuild_course_cache($course->id, true);

        return [
            'action'     => 'updated',
            'cmid'       => (int)$existing->id,
            'instanceid' => $assignid,
            'url'        => (new moodle_url('/mod/assign/view.php', ['id' => $existing->id]))->out(false),
        ];
    }

    private static function create_new(\stdClass $course, array $params): array {
        global $DB;
        $moduletype = $DB->get_record('modules', ['name' => 'assign'], 'id', MUST_EXIST);
        $moduleinfo = new \stdClass();
        $moduleinfo->modulename = 'assign'; $moduleinfo->module = (int)$moduletype->id;
        $moduleinfo->section = (int)$params['sectionnum']; $moduleinfo->cmidnumber = $params['idnumber'];
        $moduleinfo->name = $params['name']; $moduleinfo->intro = $params['intro']; $moduleinfo->introformat = FORMAT_HTML;
        $moduleinfo->alwaysshowdescription = 1; $moduleinfo->submissiondrafts = 0; $moduleinfo->sendnotifications = 0;
        $moduleinfo->sendlatenotifications = 0; $moduleinfo->sendstudentnotifications = 1; $moduleinfo->duedate = (int)$params['duedate'];
        $moduleinfo->allowsubmissionsfromdate = (int)$params['allowsubmissionsfromdate']; $moduleinfo->cutoffdate = (int)$params['cutoffdate'];
        $moduleinfo->gradingduedate = 0; $moduleinfo->grade = (int)$params['grade']; $moduleinfo->completionsubmit = 0;
        $moduleinfo->requiresubmissionstatement = 0; $moduleinfo->teamsubmission = 0; $moduleinfo->requireallteammemberssubmit = 0;
        $moduleinfo->teamsubmissiongroupingid = 0; $moduleinfo->blindmarking = 0; $moduleinfo->hidegrader = 0; $moduleinfo->revealidentities = 0;
        $moduleinfo->attemptreopenmethod = 'none'; $moduleinfo->maxattempts = -1; $moduleinfo->markingworkflow = 0;
        $moduleinfo->markingallocation = 0; $moduleinfo->preventsubmissionnotingroup = 0; $moduleinfo->nosubmissions = 0;
        $moduleinfo->activity = ''; $moduleinfo->activityformat = FORMAT_HTML; $moduleinfo->visible = (int)$params['visible'];
        $moduleinfo->visibleoncoursepage = 1; $moduleinfo->groupmode = 0; $moduleinfo->groupingid = 0;
        $moduleinfo->completion = COMPLETION_DISABLED; $moduleinfo->completionview = COMPLETION_VIEW_NOT_REQUIRED;
        $moduleinfo->completionexpected = 0; $moduleinfo->showdescription = 0;
        $created = \add_moduleinfo($moduleinfo, $course);
        rebuild_course_cache($course->id, true);
        return ['action' => 'created', 'cmid' => (int)$created->coursemodule, 'instanceid' => (int)$created->instance,
            'url' => (new moodle_url('/mod/assign/view.php', ['id' => $created->coursemodule]))->out(false)];
    }
    /**
     * Seed the default submission + feedback plugins for a brand-new
     * assignment. Without this, the student has no way to submit.
     */
    private static function enable_default_plugins(int $assignid): void {
        global $DB;

        $configs = [
            ['plugin' => 'onlinetext', 'subtype' => 'assignsubmission', 'name' => 'enabled',   'value' => '1'],
            ['plugin' => 'onlinetext', 'subtype' => 'assignsubmission', 'name' => 'wordlimit', 'value' => '0'],
            ['plugin' => 'file',       'subtype' => 'assignsubmission', 'name' => 'enabled',   'value' => '1'],
            ['plugin' => 'file',       'subtype' => 'assignsubmission', 'name' => 'maxfilesubmissions', 'value' => '3'],
            ['plugin' => 'comments',   'subtype' => 'assignfeedback',   'name' => 'enabled',   'value' => '1'],
        ];
        foreach ($configs as $cfg) {
            $row = (object)array_merge($cfg, ['assignment' => $assignid]);
            $DB->insert_record('assign_plugin_config', $row);
        }
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'action'     => new external_value(PARAM_ALPHA, 'created or updated'),
            'cmid'       => new external_value(PARAM_INT,   'course_modules.id'),
            'instanceid' => new external_value(PARAM_INT,   'assign.id (mod_assign instance)'),
            'url'        => new external_value(PARAM_URL,   'Module view URL in Moodle'),
        ]);
    }
}
