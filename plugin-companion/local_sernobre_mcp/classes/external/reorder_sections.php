<?php
namespace local_sernobre_mcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;

/**
 * Reorder the sections of a course in a single call.
 *
 * The caller sends the desired relative order (sorted by `position`, where
 * 0 = first after General). The course is renumbered sequentially: General
 * (section 0) stays first, then the listed sections in the requested order,
 * then any unlisted section keeps its relative place at the end.
 *
 * This runs entirely server-side so the result is deterministic in one WS
 * call (instead of N sequential single-section moves that could interleave
 * with each other's renumbering).
 */
class reorder_sections extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course ID'),
            'sections' => new external_multiple_structure(
                new external_single_structure([
                    'sectionid' => new external_value(PARAM_INT, 'course_sections.id'),
                    'position'  => new external_value(PARAM_INT, 'Desired slot; 0 = first after General'),
                ]),
                'Desired ordering of sections',
            ),
        ]);
    }

    /**
     * @return array{courseid: int, reordered: int}
     */
    public static function execute(int $courseid, array $sections): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid,
            'sections' => $sections,
        ]);

        if (empty($params['sections'])) {
            throw new \moodle_exception('emptysections', 'local_sernobre_mcp', '', null,
                'at least one section must be provided to reorder');
        }

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:update', $context);

        $allsections = $DB->get_records('course_sections', ['course' => $course->id], 'section ASC');
        if (empty($allsections)) {
            throw new \moodle_exception('nosections', 'local_sernobre_mcp', '', null,
                'course has no sections');
        }

        // Sort the requested order by position (0 = first after General).
        usort($params['sections'], fn(array $a, array $b): int => (int)$a['position'] <=> (int)$b['position']);

        $byid = [];
        foreach ($allsections as $s) {
            $byid[(int)$s->id] = $s;
        }

        // Build the target sequence: General pinned first, then the requested
        // sections in order, then the unlisted ones in their current order.
        $targetseq = [];
        $placed = [];
        foreach ($byid as $id => $s) {
            if ((int)$s->section === 0) {
                $targetseq[] = $id;
                $placed[$id] = true;
                break;
            }
        }
        foreach ($params['sections'] as $item) {
            $id = (int)$item['sectionid'];
            if (isset($byid[$id]) && !isset($placed[$id])) {
                $targetseq[] = $id;
                $placed[$id] = true;
            }
        }
        foreach ($allsections as $s) {
            if (!isset($placed[(int)$s->id])) {
                $targetseq[] = (int)$s->id;
                $placed[(int)$s->id] = true;
            }
        }

        // Two-phase assignment (temp offset avoids collisions on swap).
        $i = 0;
        foreach ($targetseq as $id) {
            $DB->set_field('course_sections', 'section', 10000 + $i, ['id' => $id]);
            $i++;
        }
        $i = 0;
        foreach ($targetseq as $id) {
            $DB->set_field('course_sections', 'section', $i, ['id' => $id]);
            $DB->set_field('course_sections', 'timemodified', time(), ['id' => $id]);
            $i++;
        }

        rebuild_course_cache($course->id, true);

        return [
            'courseid' => (int)$course->id,
            'reordered' => count($params['sections']),
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'courseid' => new external_value(PARAM_INT, 'Course ID'),
            'reordered' => new external_value(PARAM_INT, 'Number of sections reordered'),
        ]);
    }
}
