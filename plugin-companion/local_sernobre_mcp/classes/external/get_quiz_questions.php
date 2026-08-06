<?php
namespace local_sernobre_mcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;

/**
 * List all questions attached to a quiz (identified by its idnumber).
 *
 * Returns each question's id, name, type, and the slot it occupies in the
 * quiz. Useful for verifying that a GIFT import landed the right questions,
 * debugging ordering issues, or building a report.
 */
class get_quiz_questions extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid'  => new external_value(PARAM_INT,  'Course ID'),
            'idnumber'  => new external_value(PARAM_TEXT, 'Quiz idnumber (mcp:quiz:...)'),
        ]);
    }

    /**
     * @return array{quiz_id: int, cmid: int, question_count: int, questions: array<int, array{id: int, name: string, qtype: int, slot: int}>}
     */
    public static function execute(int $courseid, string $idnumber): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid,
            'idnumber' => $idnumber,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:view', $context);

        if ($params['idnumber'] === '') {
            throw new \moodle_exception('idnumbermustnotbeempty', 'local_sernobre_mcp', '', null,
                'idnumber parameter is required and must be non-empty');
        }

        $cm = $DB->get_record('course_modules', [
            'course'   => $course->id,
            'idnumber' => $params['idnumber'],
            'visible'  => 1,
        ]);

        if (!$cm) {
            $cm = $DB->get_record('course_modules', [
                'course'   => $course->id,
                'idnumber' => $params['idnumber'],
            ]);
        }

        if (!$cm) {
            throw new \moodle_exception('coursemodule_not_found', 'local_sernobre_mcp', '', null,
                "No course module found with idnumber '{$params['idnumber']}' in course {$course->id}");
        }

        $moduletype = $DB->get_record('modules', ['id' => $cm->module], 'name', MUST_EXIST);
        if ($moduletype->name !== 'quiz') {
            throw new \moodle_exception('notaquiz', 'local_sernobre_mcp', '', null,
                "The module with idnumber '{$params['idnumber']}' is not a quiz (it's {$moduletype->name})");
        }

        $quizid = (int)$cm->instance;

        // Get all slots for this quiz, joined with question data.
        $questions = $DB->get_records_sql("
            SELECT qs.id AS slotid,
                   q.id,
                   q.name,
                   q.qtype,
                   qs.slot AS slot
              FROM {quiz_slots} qs
              JOIN {question_references} qr
                ON qr.component = 'mod_quiz'
               AND qr.questionarea = 'slot'
               AND qr.itemid = qs.id
              JOIN {question_bank_entries} qbe
                ON qbe.id = qr.questionbankentryid
              JOIN {question_versions} qv
                ON qv.questionbankentryid = qbe.id
               AND qv.status = 'ready'
               AND ((qr.version IS NOT NULL AND qv.version = qr.version)
                    OR (qr.version IS NULL AND qv.version = (
                        SELECT MAX(qv2.version)
                          FROM {question_versions} qv2
                         WHERE qv2.questionbankentryid = qbe.id
                           AND qv2.status = 'ready'
                    )))
              JOIN {question} q ON q.id = qv.questionid
             WHERE qs.quizid = :quizid
             ORDER BY qs.slot ASC
        ", ['quizid' => $quizid]);

        $questionlist = array_map(function($row) {
            return [
                'id'    => (int)$row->id,
                'name'  => $row->name,
                'qtype' => (int)$row->qtype,
                'slot'  => (int)$row->slot,
            ];
        }, $questions);

        return [
            'quiz_id'       => $quizid,
            'cmid'          => (int)$cm->id,
            'question_count' => count($questionlist),
            'questions'     => $questionlist,
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'quiz_id'        => new external_value(PARAM_INT, 'quiz.id'),
            'cmid'           => new external_value(PARAM_INT, 'course_modules.id'),
            'question_count' => new external_value(PARAM_INT, 'number of questions in the quiz'),
            'questions'      => new external_multiple_structure(
                new external_single_structure([
                    'id'    => new external_value(PARAM_INT, 'question.id'),
                    'name'  => new external_value(PARAM_TEXT, 'Question name'),
                    'qtype' => new external_value(PARAM_INT, 'Question type id'),
                    'slot'  => new external_value(PARAM_INT, 'Slot number in quiz'),
                ]),
                'array of {id, name, qtype, slot}',
                VALUE_OPTIONAL
            ),
        ]);
    }
}
