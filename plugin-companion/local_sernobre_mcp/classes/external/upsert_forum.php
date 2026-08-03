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
require_once($CFG->dirroot . '/mod/forum/lib.php');

/**
 * Upsert a mod_forum in a course section using a stable idnumber as the key.
 *
 * - If a course_module with matching idnumber already exists in the course,
 *   its name/intro/visibility are updated in place.
 * - Otherwise, a new mod_forum is created and its idnumber is written to
 *   course_modules.
 *
 * Idempotent: calling twice with the same idnumber never duplicates.
 */
class upsert_forum extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'   => new external_value(PARAM_INT,  'Course ID'),
            'sectionnum' => new external_value(PARAM_INT,  'Section number (0 = general, 1..n = topics)'),
            'idnumber'   => new external_value(PARAM_TEXT, 'Stable idnumber used to find or anchor the forum'),
            'name'       => new external_value(PARAM_RAW, 'Forum display name'),
            'intro'      => new external_value(PARAM_RAW,  'Short description HTML shown to students', VALUE_DEFAULT, ''),
            'visible'    => new external_value(PARAM_INT,  '1 visible to students, 0 hidden', VALUE_DEFAULT, 1),
            'type'       => new external_value(PARAM_TEXT, 'Forum type: general, news, peerjs, social, single simple discussion, Q&A, each person posts one discussion, no replies', VALUE_DEFAULT, 'general'),
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
        int $visible,
        string $type = 'general'
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid'   => $courseid,
            'sectionnum' => $sectionnum,
            'idnumber'   => $idnumber,
            'name'       => $name,
            'intro'      => $intro,
            'visible'    => $visible,
            'type'       => $type,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        if ($params['idnumber'] === '') {
            throw new \moodle_exception('idnumbermustnotbeempty', 'local_sernobre_mcp', '', null,
                'idnumber parameter is required and must be non-empty');
        }

        $existing = $DB->get_record('course_modules', [
            'course'   => $course->id,
            'idnumber' => $params['idnumber'],
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

        $forumid = (int)$existing->instance;
        if ($forumid <= 0) {
            throw new \moodle_exception('noinstance', 'local_sernobre_mcp', '', null,
                "course_module {$existing->id} has no forum instance");
        }

        $update = (object)[
            'id'         => $forumid,
            'name'       => $params['name'],
            'intro'      => $params['intro'],
            'introformat' => FORMAT_HTML,
            'timemodified' => time(),
        ];
        $DB->update_record('forum', $update);

        if ((int)$existing->visible !== (int)$params['visible']) {
            set_coursemodule_visible($existing->id, (int)$params['visible']);
        }

        rebuild_course_cache($course->id, true);

        return [
            'action'     => 'updated',
            'cmid'       => (int)$existing->id,
            'instanceid' => $forumid,
            'url'        => (new moodle_url('/mod/forum/view.php', ['f' => $forumid]))->out(false),
        ];
    }

    private static function create_new(\stdClass $course, array $params): array {
        global $DB, $CFG;
        require_once($CFG->dirroot . '/course/lib.php');

        // 1. Insert mod_forum instance.
        $forum = new \stdClass();
        $forum->course         = (int)$course->id;
        $forum->name           = $params['name'];
        $forum->intro          = $params['intro'];
        $forum->introformat    = FORMAT_HTML;
        $forum->type           = $params['type'];
        $forum->timemodified   = time();
        $forum->asses           = 0;
        $forum->assessmentflags = 0;
        $forum->maxbytes        = 999999999;
        $forum->id              = $DB->insert_record('forum', $forum);

        // 2. Look up module type id.
        $moduletype = $DB->get_record('modules', ['name' => 'forum'], 'id', MUST_EXIST);

        // 3. Create course_module row.
        $cm = new \stdClass();
        $cm->course              = (int)$course->id;
        $cm->module              = (int)$moduletype->id;
        $cm->instance            = (int)$forum->id;
        $cm->section             = 0;
        $cm->added               = time();
        $cm->score               = 0;
        $cm->idnumber            = $params['idnumber'];
        $cm->visible             = (int)$params['visible'];
        $cm->visibleoncoursepage = 1;
        $cm->visibleold          = (int)$params['visible'];
        $cm->groupmode           = 0;
        $cm->groupingid          = 0;
        $cm->completion          = 0;
        $cm->completiongradeitemnumber = null;
        $cm->completionview      = 0;
        $cm->completionexpected  = 0;
        $cm->showdescription     = 0;
        $cm->availability        = null;
        $cm->deletioninprogress  = 0;
        $cm->id = add_course_module($cm);
        if ($params['idnumber'] !== '') {
            $DB->set_field('course_modules', 'idnumber', $params['idnumber'], ['id' => $cm->id]);
        }

        // 4. Attach the cm to the section (by number, 0..numsections).
        course_add_cm_to_section($course, $cm->id, (int)$params['sectionnum']);

        if (!$params['visible']) {
            set_coursemodule_visible($cm->id, 0);
        }

        rebuild_course_cache($course->id, true);

        return [
            'action'     => 'created',
            'cmid'       => (int)$cm->id,
            'instanceid' => (int)$forum->id,
            'url'        => (new moodle_url('/mod/forum/view.php', ['f' => $forum->id]))->out(false),
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'action'     => new external_value(PARAM_ALPHA, 'created or updated'),
            'cmid'       => new external_value(PARAM_INT,   'course_modules.id'),
            'instanceid' => new external_value(PARAM_INT,   'forum.id (mod_forum instance)'),
            'url'        => new external_value(PARAM_URL,   'Module view URL in Moodle'),
        ]);
    }
}
