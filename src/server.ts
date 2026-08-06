import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { MoodleClient } from './client/moodle-client.js';
import type { Logger } from './utils/logger.js';
import type { ToolDefinition } from './tools/types.js';
import { toErrorResponse } from './tools/types.js';

import { PRIMITIVE_TOOLS } from './tools/primitive/index.js';
import { CONTENT_TOOLS } from './tools/content/index.js';
import { SECTIONS_TOOLS } from './tools/sections/index.js';
import { COURSE_TOOLS } from './tools/course/index.js';
import { ASSESSMENT_TOOLS } from './tools/assessment/index.js';
import { STUDENT_TOOLS } from './tools/students/index.js';
import { GRADEBOOK_TOOLS } from './tools/gradebook/index.js';
import { COMMUNICATION_TOOLS } from './tools/communication/index.js';
import { CALENDAR_TOOLS } from './tools/calendar/index.js';
import { BADGE_TOOLS } from './tools/badges/index.js';

export const ALL_TOOLS = [
  ...PRIMITIVE_TOOLS,
  ...CONTENT_TOOLS,
  ...SECTIONS_TOOLS,
  ...COURSE_TOOLS,
  ...ASSESSMENT_TOOLS,
  ...STUDENT_TOOLS,
  ...GRADEBOOK_TOOLS,
  ...COMMUNICATION_TOOLS,
  ...CALENDAR_TOOLS,
  ...BADGE_TOOLS,
] as unknown as ReadonlyArray<ToolDefinition<unknown>>;

export interface BuildServerOptions {
  client: MoodleClient;
  logger: Logger;
  name?: string;
  version?: string;
}

/**
 * Build and wire the MCP server. Registering happens eagerly; the caller
 * is responsible for connecting the transport (stdio in production, an
 * in-memory transport in tests).
 */
export function buildServer(opts: BuildServerOptions): Server {
  const server = new Server(
    {
      name: opts.name ?? 'sernobre-moodle-mcp',
      version: opts.version ?? '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema, { target: 'jsonSchema7' }) as Record<
        string,
        unknown
      >,
    })),
  }));

  const callToolHandler = async (request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }): Promise<unknown> => {
    const { name, arguments: rawArgs } = request.params;
    const tool = ALL_TOOLS.find((t) => t.name === name);
    if (!tool) {
      return toErrorResponse(
        new Error(`Unknown tool: ${name}. Known: ${ALL_TOOLS.map((t) => t.name).join(', ')}`),
      );
    }
    try {
      const args = tool.inputSchema.parse(rawArgs ?? {});
      return await tool.handler(args, { client: opts.client, logger: opts.logger });
    } catch (e) {
      opts.logger.warn('tool.invocation_failed', {
        tool: name,
        error: (e as Error).message,
      });
      return toErrorResponse(e);
    }
  };
  // SDK's `ServerResult` union has evolved to include optional `task` fields
  // for long-running tool invocations. We don't use that yet, so cast through
  // `never` — the runtime contract we produce (`ToolResponse`) is valid.
  server.setRequestHandler(CallToolRequestSchema, callToolHandler as never);

  return server;
}
