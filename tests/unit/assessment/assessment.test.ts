import { describe, it, expect } from 'vitest';
import { configureQuizTool } from '../../../src/tools/assessment/configure_quiz.js';
import { importGiftTool } from '../../../src/tools/assessment/import_gift.js';
import { publishExamLessonTool } from '../../../src/tools/assessment/publish_exam_lesson.js';
import { getQuizQuestionsTool } from '../../../src/tools/assessment/get_quiz_questions.js';
import { nullLogger } from '../../../src/utils/logger.js';
import type { MoodleClient } from '../../../src/client/moodle-client.js';

type Scripts = Record<string, (params: Record<string, unknown>) => unknown | Promise<unknown>>;

function scriptedClient(scripts: Scripts, baseUrl = 'https://moodle.example.com'): MoodleClient {
  return {
    baseUrl,
    async call(fn, params = {}) {
      const f = scripts[fn];
      if (!f) throw new Error(`unexpected WS call: ${fn}`);
      return await f(params);
    },
  };
}

function ctx(client: MoodleClient) {
  return { client, logger: nullLogger };
}

// ---------- configure_quiz ----------

describe('configure_quiz', () => {
  it('builds idnumber mcp:quiz:... and maps grademethod enum', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      local_sernobre_mcp_upsert_quiz: (params) => {
        sent = params;
        return {
          action: 'created',
          cmid: 100,
          instanceid: 50,
          url: 'https://moodle.example.com/mod/quiz/view.php?id=100',
        };
      },
    });

    const result = await configureQuizTool.handler(
      {
        course_id: 5,
        section_num: 2,
        slug: 'unit-3-exam',
        name: 'Exam Unit 3',
        intro: '<p>Read before</p>',
        timeopen: 0,
        timeclose: 0,
        timelimit_seconds: 1800,
        attempts: 2,
        grademethod: 'average',
        grade: 10,
        visible: false,
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    expect(sent.courseid).toBe(5);
    expect(sent.sectionnum).toBe(2);
    expect(typeof sent.idnumber).toBe('string');
    expect((sent.idnumber as string).startsWith('mcp:quiz:')).toBe(true);
    expect(sent.grademethod).toBe(2); // average
    expect(sent.timelimit).toBe(1800);
    expect(sent.attempts).toBe(2);
    expect(sent.visible).toBe(0);

    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.cmid).toBe(100);
    expect(payload.quiz_id).toBe(50);
    expect(payload.action).toBe('created');
  });

  it('rejects invalid slug', () => {
    expect(() =>
      configureQuizTool.inputSchema.parse({
        course_id: 5,
        slug: 'NOT VALID',
        name: 'x',
      }),
    ).toThrow();
  });
});

// ---------- import_gift ----------

describe('import_gift', () => {
  it('forwards gift text, quiz_idnumber, category, append=1', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      local_sernobre_mcp_add_questions_gift: (params) => {
        sent = params;
        return { created: 3, existing: 1, appended: 3, category_id: 42 };
      },
    });

    const result = await importGiftTool.handler(
      {
        course_id: 5,
        quiz_slug: 'unit-3-exam',
        gift_text: '::Q1:: What is hello? { =hello ~goodbye }',
        category_name: 'Unit 3',
        append: true,
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    expect(sent.courseid).toBe(5);
    expect((sent.quiz_idnumber as string).startsWith('mcp:quiz:')).toBe(true);
    expect(sent.gift).toContain('What is hello');
    expect(sent.append).toBe(1);

    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.questions_created).toBe(3);
    expect(payload.bank_category_id).toBe(42);
  });

  it('rejects too short gift_text', () => {
    expect(() =>
      importGiftTool.inputSchema.parse({
        course_id: 5,
        quiz_slug: 'x',
        gift_text: 'tiny',
      }),
    ).toThrow();
  });
});

// ---------- publish_exam_lesson ----------

describe('publish_exam_lesson', () => {
  it('orchestrates upsert_quiz + add_questions_gift + repair + promote in order', async () => {
    const callOrder: string[] = [];
    const client = scriptedClient({
      local_sernobre_mcp_upsert_quiz: () => {
        callOrder.push('upsert_quiz');
        return {
          action: 'created',
          cmid: 100,
          instanceid: 50,
          url: 'https://moodle.example.com/mod/quiz/view.php?id=100',
        };
      },
      local_sernobre_mcp_add_questions_gift: () => {
        callOrder.push('add_gift');
        return { created: 5, existing: 0, appended: 5, category_id: 99 };
      },
      local_sernobre_mcp_repair_quiz_sections: () => {
        callOrder.push('repair');
        return {};
      },
      local_sernobre_mcp_promote_quiz_questions: () => {
        callOrder.push('promote');
        return {};
      },
    });

    const result = await publishExamLessonTool.handler(
      {
        course_id: 5,
        section_num: 2,
        slug: 'unit-3-exam',
        name: 'Exam Unit 3',
        intro: '',
        gift_text: '::Q1:: What is hello? { =hello }',
        category_name: 'Unit 3',
        attempts: 2,
        timelimit_seconds: 0,
        grademethod: 'highest',
        grade: 10,
        visible: false,
        repair_sections: true,
        promote_questions: true,
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    expect(callOrder).toEqual(['upsert_quiz', 'add_gift', 'repair', 'promote']);

    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.action).toBe('created');
    expect(payload.cmid).toBe(100);
    expect(payload.questions_appended).toBe(5);
    expect(payload.bank_category_id).toBe(99);
    expect(payload.warnings).toEqual([]);
  });

  it('captures warnings when repair/promote fail but does not abort', async () => {
    const client = scriptedClient({
      local_sernobre_mcp_upsert_quiz: () => ({
        action: 'updated',
        cmid: 1,
        instanceid: 1,
        url: 'https://x',
      }),
      local_sernobre_mcp_add_questions_gift: () => ({
        created: 1,
        existing: 0,
        appended: 1,
        category_id: 1,
      }),
      local_sernobre_mcp_repair_quiz_sections: () => {
        throw new Error('repair blew up');
      },
      local_sernobre_mcp_promote_quiz_questions: () => {
        throw new Error('promote blew up');
      },
    });

    const result = await publishExamLessonTool.handler(
      {
        course_id: 5,
        section_num: 0,
        slug: 's',
        name: 'N',
        intro: '',
        gift_text: '::Q1:: text { =a }',
        category_name: '',
        attempts: 0,
        timelimit_seconds: 0,
        grademethod: 'highest',
        grade: 10,
        visible: false,
        repair_sections: true,
        promote_questions: true,
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.warnings).toHaveLength(2);
    expect(payload.warnings[0]).toContain('repair_quiz_sections');
    expect(payload.warnings[1]).toContain('promote_quiz_questions');
  });

  it('skips repair/promote when flags are false', async () => {
    const callOrder: string[] = [];
    const client = scriptedClient({
      local_sernobre_mcp_upsert_quiz: () => {
        callOrder.push('upsert_quiz');
        return { action: 'created', cmid: 1, instanceid: 1, url: 'https://x' };
      },
      local_sernobre_mcp_add_questions_gift: () => {
        callOrder.push('add_gift');
        return { created: 1, existing: 0, appended: 1, category_id: 1 };
      },
    });

    await publishExamLessonTool.handler(
      {
        course_id: 5,
        section_num: 0,
        slug: 's',
        name: 'N',
        intro: '',
        gift_text: '::Q1:: text { =a }',
        category_name: '',
        attempts: 0,
        timelimit_seconds: 0,
        grademethod: 'highest',
        grade: 10,
        visible: false,
        repair_sections: false,
        promote_questions: false,
      },
      ctx(client),
    );

    expect(callOrder).toEqual(['upsert_quiz', 'add_gift']);
  });
});

// ---------- get_quiz_questions ----------

describe('get_quiz_questions', () => {
  it('maps QTYPE numbers to names and resolves idnumber from slug', async () => {
    let sent: Record<string, unknown> = {};
    const client = scriptedClient({
      local_sernobre_mcp_get_quiz_questions: (params) => {
        sent = params;
        return {
          quiz_id: 50,
          cmid: 100,
          question_count: 2,
          questions: [
            { id: 1, name: 'Q1 hello?', qtype: 1, slot: 1 },
            { id: 2, name: 'True or false', qtype: 2, slot: 2 },
          ],
        };
      },
    });

    const result = await getQuizQuestionsTool.handler(
      {
        course_id: 5,
        slug: 'unit-3-exam',
      },
      ctx(client),
    );

    expect(result.isError).toBeUndefined();
    expect(sent.courseid).toBe(5);
    expect((sent.idnumber as string).startsWith('mcp:quiz:')).toBe(true);

    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.quiz_id).toBe(50);
    expect(payload.question_count).toBe(2);
    expect(payload.questions[0].qtype).toBe('multichoice');
    expect(payload.questions[1].qtype).toBe('truefalse');
    expect(payload.questions[0].slot).toBe(1);
  });

  it('handles unknown qtype gracefully', async () => {
    const client = scriptedClient({
      local_sernobre_mcp_get_quiz_questions: () => ({
        quiz_id: 1,
        cmid: 2,
        question_count: 1,
        questions: [{ id: 9, name: 'Weird', qtype: 99, slot: 1 }],
      }),
    });

    const result = await getQuizQuestionsTool.handler(
      { course_id: 5, slug: 'x' },
      ctx(client),
    );

    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.questions[0].qtype).toBe('qtype_99');
  });
});
