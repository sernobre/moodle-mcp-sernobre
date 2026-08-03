<?php
defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'Sernobre MCP companion';
$string['privacy:metadata'] = 'The Sernobre MCP companion plugin does not store any personal data.';

$string['invalidcourseid'] = 'You are trying to use an invalid course ID ({$a})';
$string['invalidsectionnumber'] = 'A section with sectionnumber {$a->sectionnumber} does not exist. The highest sectionnumber is {$a->lastsectionnumber}.';
$string['courseformatwithoutsections'] = 'Course format {$a} does not use sections';
$string['movesectionerror'] = 'Moving the section raised an unknown error';
$string['sectionnotfound'] = 'A section with the desired number/id ({$a}) was not found.';
$string['toomanysections'] = 'You are trying to create too many sections. Allowed: {$a->max}, desired: {$a->desired}';