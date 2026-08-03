<!--
Example LessonPlan. Copy of tests/fixtures/lesson-example.md annotated
with commentary for teachers authoring their first lesson.

The frontmatter YAML block (between the two `---` lines) is the *contract*:
every field is validated by the `LessonPlan` zod schema. The markdown body
below it is the teaching material, with `{#anchor}` tags that tie each section
back to the corresponding `components[*].id`.
-->

---
# Required
id: ai-fundamentals-2026-u1-c1   # unique and stable — used to compute idnumbers
type: lesson                   # always "lesson" for a LessonPlan
language: english              # english | italian | portuguese
program: ai-fundamentals-2026  # free string identifying the program
unit: 1                        # integer
order: 1                       # integer — position inside the unit
duration_min: 90
modality: virtual              # virtual | in_person | hybrid
student_profile: adult         # adult | adolescent | university
observable_objectives:
  - define_artificial_intelligence
  - distinguish_ai_ml_dl
  - identify_ai_examples_daily_life
components:
  - { id: opening, type: text, minutes: 10 }
  - { id: core_concepts, type: text, minutes: 30 }
  - { id: ml_dl, type: text, minutes: 25 }
  - { id: examples, type: text, minutes: 15 }
  - { id: closing, type: text, minutes: 10 }
moodle:
  course_id: 42                # Moodle course to publish into

# Optional
enabled_competencies: [comp-01]
prerequisite_competencies: [comp-00]
vocabulary:
  - { en: "artificial intelligence", notes: "machines mimicking human cognitive functions" }
  - { en: "machine learning", notes: "AI subfield where systems learn from data" }
  - { en: "deep learning", notes: "ML subfield based on deep neural networks" }
  - { en: "algorithm", notes: "sequence of steps to solve a problem" }
structures: [concept_definitions, comparative_analysis]
generated_assets:
  - { id: img-1, type: image, path: ./assets/img-1.png }
  - { id: vid-1, type: video, path: ./assets/vid-1.mp4 }
---

# Lesson 1 — Introduction to Artificial Intelligence

## Opening (10 min) {#opening}
Welcome to the Artificial Intelligence Fundamentals course. Warm-up: which
AI examples do students already use in their everyday lives?

## Core concepts (30 min) {#core_concepts}
Definition of artificial intelligence as the field that studies how to build
systems capable of perceiving, reasoning and acting. {#img-1}

## Machine learning and deep learning (25 min) {#ml_dl}
Distinction between AI, machine learning and deep learning, focusing on
learning from data. {#vid-1}

## Practical examples (15 min) {#examples}
Analysis of real-world applications: virtual assistants, recommendation
systems, image recognition and automatic translation.

## Closing (10 min) {#closing}
Summary of the concepts and definition of the asynchronous task: identify
three AI applications used at work or in everyday life.
