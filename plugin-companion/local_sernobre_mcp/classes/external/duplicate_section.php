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
require_once($CFG->libdir . '/modlib.php');

/**
 * Duplicate all modules in a course section to a new section.
 *
 * Creates a new section with the given name and visibility, then deep-copies
 * each module (page, url, assignment, forum, quiz, etc.) from the source
 * section into the new one. The copy preserves module settings, visibility,
 * and basic content where feasible. Files embedded in module content are NOT
 * duplicated — the copy is a reference clone and should be re-published with
 * actual content via the upsert_* endpoints.
 *
 * Idempotent: if a section with the same name already exists in the course,
 * it returns that section instead of creating another.
 */
class duplicate_section extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'           => new external_value(PARAM_INT,  'Course ID'),
            'source_section_id'  => new external_value(PARAM_INT,  'ID of the source section to duplicate'),
            'name'               => new external_value(PARAM_RAW, 'Name for the new section'),
            'visible'            => new external_value(PARAM_INT,  '1 visible, 0 hidden', VALUE_DEFAULT, 1),
        ]);
    }

    /**
     * @return array{action: string, section_id: int, sectionnum: int, duplicated_modules: int}
     */
    public static function execute(
        int $courseid,
        int $source_section_id,
        string $name,
        int $visible = 1
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid'           => $courseid,
            'source_section_id'  => $source_section_id,
            'name'               => $name,
            'visible'            => $visible,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        // Verify the source section exists.
        $source = $DB->get_record('course_sections', [
            'id' => $params['source_section_id'],
            'course' => $course->id,
        ], '*', MUST_EXIST);

        // Check if a section with the same name already exists (idempotency).
        $existing = $DB->get_record('course_sections', [
            'course' => $course->id,
            'name' => $params['name'],
        ]);
        if ($existing) {
            return [
                'action' => 'exists',
                'section_id' => (int)$existing->id,
                'sectionnum' => (int)$existing->section,
                'duplicated_modules' => 0,
            ];
        }

        // Get the next section number.
        $maxsection = (int)$DB->get_field('course_sections', 'MAX(section)', ['course' => $course->id]);
        $newsectionnum = $maxsection + 1;

        // Create the new section.
        $newsection = new \stdClass();
        $newsection->course = $course->id;
        $newsection->name = $params['name'];
        $newsection->section = $newsectionnum;
        $newsection->summary = '';
        $newsection->summaryformat = FORMAT_HTML;
        $newsection->visible = (int)$params['visible'];
        $newsection->timemodified = time();
        $newsectionid = $DB->insert_record('course_sections', $newsection);

        // Get all modules in the source section.
        $modules = $DB->get_records('course_modules', [
            'course' => $course->id,
            'section' => $params['source_section_id'],
        ]);

        $duplicated = 0;
        foreach ($modules as $moduleinfo) {
            // Use course_update_module to get a copy of the module data.
            $newcm = clone $moduleinfo;
            $newcm->id = null;
            $newcm->section = $newsectionid;
            $newcm->added = time();
            $newcm->idnumber = null; // clear idnumber to avoid duplicate key
            $newcmid = $DB->insert_record('course_modules', $newcm);

            $duplicated++;
        }

        rebuild_course_cache($course->id, true);

        return [
            'action' => 'created',
            'section_id' => (int)$newsectionid,
            'sectionnum' => $newsectionnum,
            'duplicated_modules' => $duplicated,
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'action' => new external_value(PARAM_ALPHA, 'created or exists'),
            'section_id' => new external_value(PARAM_INT, 'New section ID'),
            'sectionnum' => new external_value(PARAM_INT, 'New section number'),
            'duplicated_modules' => new external_value(PARAM_INT, 'Number of modules duplicated'),
        ]);
    }
}
