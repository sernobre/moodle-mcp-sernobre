<?php
namespace local_sernobre_mcp\external;

defined('MOODLE_INTERNAL') || die();

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;

/**
 * Read-only: list the submission configuration of every mod_assign in a course.
 *
 * Moodle core exposes no webservice that returns the enabled assignment
 * submission plugins (`assignsubmission_onlinetext`, `assignsubmission_file`),
 * and `mod_assign_get_assignments` is not enabled in the MCP service. This
 * endpoint closes that gap so agents can confirm programmatically whether each
 * assignment accepts file and/or online-text submissions before submitting.
 *
 * Returns, per assignment, the instance settings plus a derived summary of the
 * enabled submission plugins and the raw `assign_plugin_config` rows.
 */
class get_assignment_config extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT,  'Course ID'),
            'idnumber' => new external_value(PARAM_TEXT, 'Optional: only the assignment with this idnumber', VALUE_DEFAULT, ''),
            'cmid'     => new external_value(PARAM_INT,  'Optional: only the course_module with this id', VALUE_DEFAULT, 0),
        ]);
    }

    /**
     * @return array{assignments: array<int, array<string, mixed>>}
     */
    public static function execute(int $courseid, string $idnumber, int $cmid): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid,
            'idnumber' => $idnumber,
            'cmid'     => $cmid,
        ]);

        $course = $DB->get_record('course', ['id' => $params['courseid']], '*', MUST_EXIST);
        $context = context_course::instance($course->id);
        self::validate_context($context);
        require_capability('moodle/course:view', $context);

        $moduletype = $DB->get_record('modules', ['name' => 'assign'], 'id', MUST_EXIST);
        $modassignid = (int)$moduletype->id;

        $select = "course = :course AND module = :module";
        $where  = ['course' => $course->id, 'module' => $modassignid];

        if ($params['cmid'] > 0) {
            $select .= " AND id = :cmid";
            $where['cmid'] = $params['cmid'];
        } elseif ($params['idnumber'] !== '') {
            $select .= " AND idnumber = :idnumber";
            $where['idnumber'] = $params['idnumber'];
        }

        $cms = $DB->get_records_select('course_modules', $select, $where, 'section ASC, id ASC');

        $assignments = [];
        foreach ($cms as $cm) {
            $assignid = (int)$cm->instance;
            $assign = $DB->get_record('assign', ['id' => $assignid], '*', IGNORE_MISSING);
            if (!$assign) {
                continue;
            }

            $configrows = $DB->get_records('assign_plugin_config', ['assignment' => $assignid]);

            $pluginconfig = [];
            foreach ($configrows as $row) {
                $pluginconfig[] = [
                    'plugin'  => $row->plugin,
                    'subtype' => $row->subtype,
                    'name'    => $row->name,
                    'value'   => $row->value,
                ];
            }

            $enabled = function (string $plugin, string $subtype) use ($configrows): bool {
                foreach ($configrows as $row) {
                    if ($row->plugin === $plugin && $row->subtype === $subtype && $row->name === 'enabled') {
                        return $row->value === '1';
                    }
                }
                return false;
            };
            $intsetting = function (string $plugin, string $subtype, string $name) use ($configrows): int {
                foreach ($configrows as $row) {
                    if ($row->plugin === $plugin && $row->subtype === $subtype && $row->name === $name) {
                        return (int)$row->value;
                    }
                }
                return 0;
            };

            $assignments[] = [
                'cmid'                            => (int)$cm->id,
                'instanceid'                      => $assignid,
                'idnumber'                        => (string)$cm->idnumber,
                'name'                            => (string)$assign->name,
                'duedate'                         => (int)$assign->duedate,
                'allowsubmissionsfromdate'        => (int)$assign->allowsubmissionsfromdate,
                'cutoffdate'                      => (int)$assign->cutoffdate,
                'grade'                           => (int)$assign->grade,
                'visible'                         => (int)$cm->visible,
                'nosubmissions'                   => (int)$assign->nosubmissions,
                'submission_file_enabled'         => (int)$enabled('file', 'assignsubmission'),
                'submission_onlinetext_enabled'   => (int)$enabled('onlinetext', 'assignsubmission'),
                'submission_comments_enabled'     => (int)$enabled('comments', 'assignfeedback'),
                'maxfilesubmissions'              => $intsetting('file', 'assignsubmission', 'maxfilesubmissions'),
                'wordlimit'                       => $intsetting('onlinetext', 'assignsubmission', 'wordlimit'),
                'maxsubmissionsizebytes'          => $intsetting('file', 'assignsubmission', 'maxsubmissionsizebytes'),
                'plugin_config'                   => $pluginconfig,
            ];
        }

        return ['assignments' => $assignments];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'assignments' => new external_value(
                PARAM_RAW,
                'list of assignments with submission plugin config',
                VALUE_REQUIRED,
                null,
                [
                    new external_single_structure([
                        'cmid'                            => new external_value(PARAM_INT, 'course_modules.id'),
                        'instanceid'                      => new external_value(PARAM_INT, 'assign.id (mod_assign instance)'),
                        'idnumber'                        => new external_value(PARAM_TEXT, 'course_modules.idnumber'),
                        'name'                            => new external_value(PARAM_TEXT, 'Assignment name'),
                        'duedate'                         => new external_value(PARAM_INT, 'Due date as Unix timestamp (0 = none)'),
                        'allowsubmissionsfromdate'        => new external_value(PARAM_INT, 'Submissions open timestamp (0 = immediately)'),
                        'cutoffdate'                      => new external_value(PARAM_INT, 'Cutoff timestamp (0 = none)'),
                        'grade'                           => new external_value(PARAM_INT, 'Max grade'),
                        'visible'                         => new external_value(PARAM_INT, '1 visible to students, 0 hidden'),
                        'nosubmissions'                   => new external_value(PARAM_INT, '1 if the assignment accepts no submissions'),
                        'submission_file_enabled'         => new external_value(PARAM_INT, '1 if assignsubmission_file is enabled'),
                        'submission_onlinetext_enabled'   => new external_value(PARAM_INT, '1 if assignsubmission_onlinetext is enabled'),
                        'submission_comments_enabled'     => new external_value(PARAM_INT, '1 if assignfeedback_comments is enabled'),
                        'maxfilesubmissions'              => new external_value(PARAM_INT, 'max files per submission (file plugin)'),
                        'wordlimit'                       => new external_value(PARAM_INT, 'online text word limit (0 = none)'),
                        'maxsubmissionsizebytes'          => new external_value(PARAM_INT, 'max file size in bytes (0 = site default)'),
                        'plugin_config'                   => new external_value(
                            PARAM_RAW,
                            'raw assign_plugin_config rows',
                            VALUE_REQUIRED,
                            null,
                            [
                                new external_single_structure([
                                    'plugin'  => new external_value(PARAM_ALPHA, 'plugin name, e.g. file / onlinetext / comments'),
                                    'subtype' => new external_value(PARAM_ALPHA, 'assignsubmission or assignfeedback'),
                                    'name'    => new external_value(PARAM_ALPHANUMEXT, 'setting name'),
                                    'value'   => new external_value(PARAM_RAW, 'setting value'),
                                ]),
                            ]
                        ),
                    ]),
                ]
            ),
        ]);
    }
}
