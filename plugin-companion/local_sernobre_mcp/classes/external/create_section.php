<?php
namespace local_sernobre_mcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;

/**
 * Create a new course section with name, summary and initial visibility.
 *
 * Idempotent by name: when a non-empty `name` matches an existing section
 * of the same course, that section is returned instead of creating a
 * duplicate. This is what lets `publish_class_lesson` safely auto-create
 * the lesson's section on repeat publishes.
 *
 * `position` is the slot in the section list (0 = append at the end, any
 * positive value = insert before that slot). Existing sections shift by one
 * when a section is inserted in the middle.
 *
 * Self-contained replacement for the third-party `local_wsmanagesections`
 * plugin (no external dependency needed).
 */
class create_section extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'      => new external_value(PARAM_INT,  'Course ID'),
            'name'          => new external_value(PARAM_RAW,  'Section name (empty = unnamed)', VALUE_DEFAULT, ''),
            'summary'       => new external_value(PARAM_RAW,  'Section summary HTML', VALUE_DEFAULT, ''),
            'summaryformat' => new external_value(PARAM_INT,  'Summary format (default FORMAT_HTML=1)', VALUE_DEFAULT, 1),
            'position'      => new external_value(PARAM_INT,  'Position in the section list; 0 appends at the end', VALUE_DEFAULT, 0),
            'visible'       => new external_value(PARAM_INT,  '1 visible to students, 0 hidden', VALUE_DEFAULT, 1),
        ]);
    }

    /**
     * @return array{action: string, sectionid: int, sectionnum: int}
     */
    public static function execute(
        int $courseid,
        string $name = '',
        string $summary = '',
        int $summaryformat = 1,
        int $position = 0,
        int $visible = 1
    ): array {
        global $DB, $CFG;
        require_once($CFG->dirroot . '/course/lib.php');

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid'      => $courseid,
            'name'          => $name,
            'summary'       => $summary,
            'summaryformat' => $summaryformat,
            'position'      => $position,
            'visible'       => $visible,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:update', $context);

        // Idempotency: reuse an existing section with the same name.
        if ($params['name'] !== '') {
            $existing = $DB->get_record('course_sections', [
                'course' => $course->id,
                'name' => $params['name'],
            ], 'id, section', IGNORE_MULTIPLE);
            if ($existing) {
                return [
                    'action' => 'exists',
                    'sectionid' => (int)$existing->id,
                    'sectionnum' => (int)$existing->section,
                ];
            }
        }

        $created = course_create_section($course, (int)$params['position']);
        $sectionid = (int)$created->id;
        $sectionnum = (int)$created->section;

        $update = (object)[
            'id'            => $sectionid,
            'name'          => $params['name'] !== '' ? $params['name'] : null,
            'summary'       => $params['summary'],
            'summaryformat' => (int)$params['summaryformat'],
            'visible'       => (int)$params['visible'],
            'timemodified'  => time(),
        ];
        course_update_section($course, $created, $update);

        rebuild_course_cache($course->id, true);

        return [
            'action' => 'created',
            'sectionid' => (int)$sectionid,
            'sectionnum' => $sectionnum,
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'action' => new external_value(PARAM_ALPHA, 'created or exists'),
            'sectionid' => new external_value(PARAM_INT, 'course_sections.id'),
            'sectionnum' => new external_value(PARAM_INT, 'course_sections.section'),
        ]);
    }
}
