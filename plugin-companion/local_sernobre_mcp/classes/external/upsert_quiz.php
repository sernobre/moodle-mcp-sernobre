<?php
namespace local_sernobre_mcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;
use moodle_exception;
use moodle_url;

global $CFG;
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/course/modlib.php');

/**
 * Create or update a mod_quiz shell (no questions). Questions are imported
 * separately via GIFT in a future plugin function; here we just manage the
 * quiz wrapper: name, intro HTML, attempts, time limit, visibility, etc.
 *
 * Idempotent by idnumber: re-calling with the same idnumber updates fields
 * in place; cmid and instanceid stay stable.
 */
class upsert_quiz extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'    => new external_value(PARAM_INT,  'Course ID'),
            'sectionnum'  => new external_value(PARAM_INT,  'Section number (0 = general)'),
            'idnumber'    => new external_value(PARAM_TEXT, 'Stable idnumber'),
            'name'        => new external_value(PARAM_RAW, 'Quiz display name'),
            'intro'       => new external_value(PARAM_RAW,  'Quiz intro / description HTML', VALUE_DEFAULT, ''),
            'timeopen'    => new external_value(PARAM_INT,  'Unix ts when quiz opens (0 = no restriction)', VALUE_DEFAULT, 0),
            'timeclose'   => new external_value(PARAM_INT,  'Unix ts when quiz closes (0 = none)', VALUE_DEFAULT, 0),
            'timelimit'   => new external_value(PARAM_INT,  'Seconds limit per attempt (0 = unlimited)', VALUE_DEFAULT, 0),
            'attempts'    => new external_value(PARAM_INT,  'Max attempts per student (0 = unlimited)', VALUE_DEFAULT, 0),
            'grademethod' => new external_value(PARAM_INT,  '1 highest 2 average 3 first 4 last', VALUE_DEFAULT, 1),
            'grade'       => new external_value(PARAM_FLOAT, 'Max grade', VALUE_DEFAULT, 10.0),
            'visible'     => new external_value(PARAM_INT,  '1 visible 0 hidden', VALUE_DEFAULT, 1),
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
        string $intro = '',
        int $timeopen = 0,
        int $timeclose = 0,
        int $timelimit = 0,
        int $attempts = 0,
        int $grademethod = 1,
        float $grade = 10.0,
        int $visible = 1
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid, 'sectionnum' => $sectionnum, 'idnumber' => $idnumber,
            'name' => $name, 'intro' => $intro, 'timeopen' => $timeopen, 'timeclose' => $timeclose,
            'timelimit' => $timelimit, 'attempts' => $attempts, 'grademethod' => $grademethod,
            'grade' => $grade, 'visible' => $visible,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        if ($params['idnumber'] === '') {
            throw new moodle_exception('idnumbermustnotbeempty', 'local_sernobre_mcp', '', null,
                'idnumber required');
        }

        $moduletype = $DB->get_record('modules', ['name' => 'quiz'], 'id', MUST_EXIST);

        $existing = $DB->get_record('course_modules', [
            'course' => $course->id, 'idnumber' => $params['idnumber'],
        ]);

        if ($existing) {
            return self::update_existing($course, $existing, $params);
        }

        // Validate that the section exists before attempting creation.
        self::resolve_section_id($course, (int)$params['sectionnum']);

        return self::create_new($course, $params);
    }

    private static function update_existing(\stdClass $course, \stdClass $existing, array $params): array {
        global $DB;

        $quizid = (int)$existing->instance;
        if ($quizid <= 0) {
            throw new moodle_exception('noinstance', 'local_sernobre_mcp', '', null,
                "course_module {$existing->id} has no quiz instance");
        }

        $update = (object)[
            'id'            => $quizid,
            'name'          => $params['name'],
            'intro'         => $params['intro'],
            'introformat'   => FORMAT_HTML,
            'timeopen'      => $params['timeopen'],
            'timeclose'     => $params['timeclose'],
            'timelimit'     => $params['timelimit'],
            'attempts'      => $params['attempts'],
            'grademethod'   => $params['grademethod'],
            'grade'         => $params['grade'],
            'timemodified'  => time(),
        ];
        $DB->update_record('quiz', $update);

        if ((int)$existing->visible !== (int)$params['visible']) {
            set_coursemodule_visible($existing->id, (int)$params['visible']);
        }
        rebuild_course_cache($course->id, true);

        return [
            'action'     => 'updated',
            'cmid'       => (int)$existing->id,
            'instanceid' => $quizid,
            'url'        => (new moodle_url('/mod/quiz/view.php', ['id' => $existing->id]))->out(false),
        ];
    }

    private static function create_new(\stdClass $course, array $params): array {
        global $DB;
        $moduletype = $DB->get_record('modules', ['name' => 'quiz'], 'id', MUST_EXIST);
        $moduleinfo = new \stdClass();
        $moduleinfo->modulename = 'quiz'; $moduleinfo->module = (int)$moduletype->id;
        $moduleinfo->section = (int)$params['sectionnum']; $moduleinfo->cmidnumber = $params['idnumber'];
        $moduleinfo->name = $params['name']; $moduleinfo->intro = $params['intro']; $moduleinfo->introformat = FORMAT_HTML;
        $moduleinfo->quizpassword = '';
        $moduleinfo->feedbacktext = [['text' => '', 'format' => FORMAT_HTML, 'itemid' => 0]];
        $moduleinfo->feedbackboundaries = [''];
        $moduleinfo->completionunlocked = 0;
        foreach (['attempt', 'correctness', 'maxmarks', 'marks', 'specificfeedback', 'generalfeedback', 'rightanswer', 'overallfeedback'] as $reviewfield) {
            foreach (['during', 'immediately', 'open', 'closed'] as $when) {
                $moduleinfo->{$reviewfield . $when} = 0;
            }
        }
        $moduleinfo->attemptduring = 1;
        $moduleinfo->overallfeedbackduring = 0;
        $moduleinfo->timeopen = (int)$params['timeopen']; $moduleinfo->timeclose = (int)$params['timeclose']; $moduleinfo->timelimit = (int)$params['timelimit'];
        $moduleinfo->overduehandling = 'autosubmit'; $moduleinfo->graceperiod = 0; $moduleinfo->preferredbehaviour = 'deferredfeedback';
        $moduleinfo->canredoquestions = 0; $moduleinfo->attempts = (int)$params['attempts']; $moduleinfo->attemponlast = 0;
        $moduleinfo->grademethod = (int)$params['grademethod']; $moduleinfo->decimalpoints = 2; $moduleinfo->questiondecimalpoints = -1;
        $moduleinfo->reviewattempt = 69888; $moduleinfo->reviewcorrectness = 4352; $moduleinfo->reviewmarks = 4352;
        $moduleinfo->reviewspecificfeedback = 4352; $moduleinfo->reviewgeneralfeedback = 4352; $moduleinfo->reviewrightanswer = 4352;
        $moduleinfo->reviewoverallfeedback = 4352; $moduleinfo->questionsperpage = 1; $moduleinfo->navmethod = 'free';
        $moduleinfo->shuffleanswers = 1; $moduleinfo->sumgrades = 0; $moduleinfo->grade = (float)$params['grade'];
        $moduleinfo->password = ''; $moduleinfo->subnet = ''; $moduleinfo->browsersecurity = '-'; $moduleinfo->delay1 = 0; $moduleinfo->delay2 = 0;
        $moduleinfo->showuserpicture = 0; $moduleinfo->showblocks = 0; $moduleinfo->completionattemptsexhausted = 0;
        $moduleinfo->completionminattempts = 0; $moduleinfo->allowofflineattempts = 0; $moduleinfo->visible = (int)$params['visible'];
        $moduleinfo->visibleoncoursepage = 1; $moduleinfo->groupmode = 0; $moduleinfo->groupingid = 0;
        $moduleinfo->completion = COMPLETION_DISABLED; $moduleinfo->completionview = COMPLETION_VIEW_NOT_REQUIRED;
        $moduleinfo->completionexpected = 0; $moduleinfo->showdescription = 0; $moduleinfo->skipdefaultcategory = false;
        $created = \add_moduleinfo($moduleinfo, $course);
        rebuild_course_cache($course->id, true);
        return ['action' => 'created', 'cmid' => (int)$created->coursemodule, 'instanceid' => (int)$created->instance,
            'url' => (new moodle_url('/mod/quiz/view.php', ['id' => $created->coursemodule]))->out(false)];
    }
    /**
     * Resolve a section NUMBER (0 = General, 1..N = topics) to the
     * course_sections.id. Used for validation only — course_add_cm_to_section()
     * also resolves the number internally.
     */
    private static function resolve_section_id(\stdClass $course, int $sectionnum): int {
        global $DB;

        // Primary: query course_sections directly.
        $sectionid = (int)$DB->get_field('course_sections', 'id', [
            'course' => $course->id,
            'section' => $sectionnum,
        ]);
        if ($sectionid) {
            return $sectionid;
        }

        // Fallback: use get_fast_modinfo which handles edge cases like
        // courses with no explicit course_sections row for the General section.
        $modinfo = get_fast_modinfo($course);
        $section = $modinfo->get_section($sectionnum, false);
        if ($section && $section->id) {
            return (int)$section->id;
        }

        throw new moodle_exception('invalidsectionid', 'local_sernobre_mcp', '', null,
            "Section number {$sectionnum} not found in course {$course->id}");
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'action'     => new external_value(PARAM_ALPHA, 'created or updated'),
            'cmid'       => new external_value(PARAM_INT,   'course_modules.id'),
            'instanceid' => new external_value(PARAM_INT,   'quiz.id'),
            'url'        => new external_value(PARAM_URL,   'Module view URL'),
        ]);
    }
}
