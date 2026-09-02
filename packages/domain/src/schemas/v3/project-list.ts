import { z } from "zod";

import { CorrelationIdSchema, type DeepReadonly } from "../primitives.js";
import { PROJECT_LIST_RESPONSE_V3 } from "../versions.js";
import { DatabaseIdV2Schema, ProjectListItemV2Schema } from "../v2/project-transport.js";

export const ProjectListResponseV3Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_LIST_RESPONSE_V3),
    correlationId: CorrelationIdSchema,
    projects: z.array(ProjectListItemV2Schema).max(100),
    nextCursor: DatabaseIdV2Schema.nullable()
  })
  .strict();

export type ProjectListResponseV3 = DeepReadonly<z.infer<typeof ProjectListResponseV3Schema>>;

export { PROJECT_LIST_RESPONSE_V3 };
