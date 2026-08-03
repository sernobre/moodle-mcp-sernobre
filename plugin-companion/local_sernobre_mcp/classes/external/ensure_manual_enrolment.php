<?php
namespace local_sernobre_mcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;

/**
 * Make sure a course has a manual enrolment instance.
 *
 * `core_course_create_courses` creates a course without any enrolment
 * method, so students can never be enrolled until an `enrol_manual`
 * instance exists. This endpoint creates one (with the plugin defaults)
 * when it is missing, and reports the existing one otherwise.
 *
 * Idempotent: calling it repeatedly never duplicates the instance.
 */
class ensure_manual_enrolment extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course ID'),
        ]);
    }

    /**
     * @return array{action: string, enrolid: int, courseid: int}
     */
    public static function execute(int $courseid): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('enrol/manual:config', $context);

        $existing = $DB->get_record('enrol', [
            'courseid' => $course->id,
            'enrol' => 'manual',
        ], 'id');
        if ($existing) {
            return [
                'action' => 'existing',
                'enrolid' => (int)$existing->id,
                'courseid' => (int)$course->id,
            ];
        }

        $plugin = enrol_get_plugin('manual');
        if ($plugin === null) {
            throw new \moodle_exception('manualnotinstalled', 'local_sernobre_mcp', '', null,
                'enrol_manual plugin is disabled on this Moodle; enable it to allow manual enrolments');
        }

        $enrolid = (int)$plugin->add_instance($course);

        return [
            'action' => 'created',
            'enrolid' => $enrolid,
            'courseid' => (int)$course->id,
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'action' => new external_value(PARAM_ALPHA, 'created or existing'),
            'enrolid' => new external_value(PARAM_INT, 'enrol instance ID'),
            'courseid' => new external_value(PARAM_INT, 'Course ID'),
        ]);
    }
}
