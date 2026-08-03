<?php
namespace local_sernobre_mcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;

/**
 * Update a single course section in place.
 *
 * Accepts any combination of `name`, `summary`, `visible` and `position`.
 * When `visible` is given, the change propagates to every module inside the
 * section (the same behaviour the preview workflow relies on), and when
 * `position` is given the section is moved to that slot (0 = first after
 * General, i.e. section number 1).
 *
 * Self-contained replacement for the third-party `local_wsmanagesections`
 * plugin (no external dependency needed).
 */
class update_section extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'      => new external_value(PARAM_INT,  'Course ID'),
            'sectionid'     => new external_value(PARAM_INT,  'course_sections.id'),
            'name'          => new external_value(PARAM_RAW,  'Section name (null = leave unchanged)', VALUE_OPTIONAL, null),
            'summary'       => new external_value(PARAM_RAW,  'Section summary HTML (null = leave unchanged)', VALUE_OPTIONAL, null),
            'summaryformat' => new external_value(PARAM_INT,  'Summary format (default FORMAT_HTML=1)', VALUE_DEFAULT, 1),
            'visible'       => new external_value(PARAM_INT,  '1 visible, 0 hidden (null = leave unchanged)', VALUE_OPTIONAL, null),
            'position'      => new external_value(PARAM_INT,  'Move to slot (0 = first after General); null = keep', VALUE_OPTIONAL, null),
        ]);
    }

    /**
     * @return array{action: string, sectionid: int, sectionnum: int}
     */
    public static function execute(
        int $courseid,
        int $sectionid,
        ?string $name = null,
        ?string $summary = null,
        int $summaryformat = 1,
        ?int $visible = null,
        ?int $position = null
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid'      => $courseid,
            'sectionid'     => $sectionid,
            'name'          => $name,
            'summary'       => $summary,
            'summaryformat' => $summaryformat,
            'visible'       => $visible,
            'position'      => $position,
        ]);

        if ($params['name'] === null
            && $params['summary'] === null
            && $params['visible'] === null
            && $params['position'] === null) {
            throw new \moodle_exception('nothingtoupdate', 'local_sernobre_mcp', '', null,
                'at least one of name, summary, visible or position must be provided');
        }

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:update', $context);

        $section = $DB->get_record('course_sections', [
            'id' => $params['sectionid'],
            'course' => $course->id,
        ], '*', MUST_EXIST);

        // Field updates.
        if ($params['name'] !== null
            || $params['summary'] !== null
            || $params['visible'] !== null) {
            $data = (object)['timemodified' => time()];
            if ($params['name'] !== null) {
                $data->name = $params['name'] !== '' ? $params['name'] : null;
            }
            if ($params['summary'] !== null) {
                $data->summary = $params['summary'];
                $data->summaryformat = (int)$params['summaryformat'];
            }
            if ($params['visible'] !== null) {
                $data->visible = (int)$params['visible'];
            }
            course_update_section($course, $section, $data);

            // Propagate visibility to every module in the section.
            if ($params['visible'] !== null) {
                $DB->set_field('course_modules', 'visible', (int)$params['visible'],
                    ['course' => $course->id, 'section' => $section->id]);
                $DB->set_field('course_modules', 'visibleold', (int)$params['visible'],
                    ['course' => $course->id, 'section' => $section->id]);
            }

            // Re-read: course_update_section may have touched the row.
            $section = $DB->get_record('course_sections', ['id' => $section->id], '*', MUST_EXIST);
        }

        // Position move.
        if ($params['position'] !== null) {
            $targetnum = (int)$params['position'] + 1; // 0 = first after General.
            $currentnum = (int)$section->section;
            if ($targetnum !== $currentnum) {
                if ($targetnum < $currentnum) {
                    $DB->execute(
                        'UPDATE {course_sections} SET section = section + 1, timemodified = :now ' .
                        'WHERE course = :course AND section >= :from AND section < :to',
                        ['now' => time(), 'course' => $course->id, 'from' => $targetnum, 'to' => $currentnum],
                    );
                } else {
                    $DB->execute(
                        'UPDATE {course_sections} SET section = section - 1, timemodified = :now ' .
                        'WHERE course = :course AND section > :from AND section <= :to',
                        ['now' => time(), 'course' => $course->id, 'from' => $currentnum, 'to' => $targetnum],
                    );
                }
                $DB->set_field('course_sections', 'section', $targetnum, ['id' => $section->id]);
                $section->section = $targetnum;
            }
        }

        rebuild_course_cache($course->id, true);

        return [
            'action' => 'updated',
            'sectionid' => (int)$section->id,
            'sectionnum' => (int)$section->section,
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'action' => new external_value(PARAM_ALPHA, 'updated'),
            'sectionid' => new external_value(PARAM_INT, 'course_sections.id'),
            'sectionnum' => new external_value(PARAM_INT, 'course_sections.section'),
        ]);
    }
}
