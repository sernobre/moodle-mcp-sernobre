/**
 * Shared types for the `publish_class_lesson` execution pipeline. Kept in
 * one place so the executor, the upsert ops and the section logic agree on
 * the shape of a publish result without circular imports.
 */

export interface ExecuteContext {
  courseId: number;
  sectionIdOverride: number | undefined;
  lessonDir: string;
}

export interface ResourceResult {
  component_id: string;
  moodle_id: number | null;
  type: string;
  url: string | null;
  idnumber: string;
  status: 'created' | 'updated' | 'skipped' | 'missing';
  contentlen?: number;
  error?: string;
}

export interface ExecuteResult {
  status: 'created' | 'updated';
  section: {
    id: number;
    name: string;
    url: string;
    idnumber: string;
    sectionnum: number;
  };
  resources: ResourceResult[];
  warnings: string[];
}
