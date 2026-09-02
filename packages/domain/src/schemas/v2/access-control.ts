import { z } from "zod";

import {
  ADMIN_USER_LIST_RESPONSE_V2,
  ADMIN_USER_RESPONSE_V2,
  AUTHENTICATED_IDENTITY_RESPONSE_V2,
  CREATE_ADMIN_USER_REQUEST_V2,
  PROJECT_ACCESS_RESPONSE_V2,
  UPDATE_ADMIN_USER_ROLE_REQUEST_V2,
  UPDATE_ADMIN_USER_STATUS_REQUEST_V2
} from "../versions.js";
import { CorrelationIdSchema, type DeepReadonly, UtcDateTimeSchema } from "../primitives.js";
import { DatabaseIdV2Schema } from "./project-transport.js";

export const APP_ROLES = ["designer", "reviewer", "administrator", "viewer"] as const;
export const APP_CAPABILITIES = [
  "project:create",
  "project:read",
  "project:edit",
  "calculation:execute",
  "revision:save",
  "revision:check",
  "revision:approve",
  "users:administer",
  "catalog:administer",
  "audit:read"
] as const;

export const AppRoleSchema = z.enum(APP_ROLES);
export const AppCapabilitySchema = z.enum(APP_CAPABILITIES);

export const PublicCapabilityListSchema = z
  .array(AppCapabilitySchema)
  .max(APP_CAPABILITIES.length)
  .superRefine((capabilities, context) => {
    const seen = new Set<string>();
    for (const [index, capability] of capabilities.entries()) {
      if (seen.has(capability)) {
        context.addIssue({
          code: "custom",
          message: "Capabilities must be unique",
          path: [index]
        });
      }
      seen.add(capability);
    }
  });

const UsernameV2Schema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/u);
const DisplayNameV2Schema = z.string().trim().min(2).max(100);

export const AuthenticatedUserV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    username: UsernameV2Schema,
    displayName: DisplayNameV2Schema,
    role: AppRoleSchema,
    capabilities: PublicCapabilityListSchema
  })
  .strict();

export const AuthenticatedIdentityResponseV2Schema = z
  .object({
    schemaVersion: z.literal(AUTHENTICATED_IDENTITY_RESPONSE_V2),
    correlationId: CorrelationIdSchema,
    user: AuthenticatedUserV2Schema
  })
  .strict();

export const AdminUserSummaryV2Schema = z
  .object({
    id: DatabaseIdV2Schema,
    username: UsernameV2Schema,
    displayName: DisplayNameV2Schema,
    role: AppRoleSchema,
    enabled: z.boolean(),
    createdAt: UtcDateTimeSchema,
    updatedAt: UtcDateTimeSchema
  })
  .strict();

export const AdminUserListResponseV2Schema = z
  .object({
    schemaVersion: z.literal(ADMIN_USER_LIST_RESPONSE_V2),
    correlationId: CorrelationIdSchema,
    users: z.array(AdminUserSummaryV2Schema).max(100),
    nextCursor: DatabaseIdV2Schema.nullable()
  })
  .strict();

export const CreateAdminUserRequestV2Schema = z
  .object({
    schemaVersion: z.literal(CREATE_ADMIN_USER_REQUEST_V2),
    username: UsernameV2Schema,
    displayName: DisplayNameV2Schema,
    password: z.string().min(6).max(1024),
    role: AppRoleSchema
  })
  .strict();

export const UpdateAdminUserRoleRequestV2Schema = z
  .object({
    schemaVersion: z.literal(UPDATE_ADMIN_USER_ROLE_REQUEST_V2),
    role: AppRoleSchema
  })
  .strict();

export const UpdateAdminUserStatusRequestV2Schema = z
  .object({
    schemaVersion: z.literal(UPDATE_ADMIN_USER_STATUS_REQUEST_V2),
    enabled: z.boolean()
  })
  .strict();

export const AdminUserResponseV2Schema = z
  .object({
    schemaVersion: z.literal(ADMIN_USER_RESPONSE_V2),
    correlationId: CorrelationIdSchema,
    user: AdminUserSummaryV2Schema
  })
  .strict();

export const ProjectAccessV2Schema = z
  .object({
    canEditDraft: z.boolean(),
    canValidate: z.boolean(),
    canCalculate: z.boolean(),
    canSaveRevision: z.boolean(),
    canReadHistory: z.boolean()
  })
  .strict();

export const ProjectAccessResponseV2Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_ACCESS_RESPONSE_V2),
    correlationId: CorrelationIdSchema,
    projectId: DatabaseIdV2Schema,
    access: ProjectAccessV2Schema
  })
  .strict();

export type AppRole = z.infer<typeof AppRoleSchema>;
export type AppCapability = z.infer<typeof AppCapabilitySchema>;
export type AuthenticatedUserV2 = DeepReadonly<z.infer<typeof AuthenticatedUserV2Schema>>;
export type AuthenticatedIdentityResponseV2 = DeepReadonly<
  z.infer<typeof AuthenticatedIdentityResponseV2Schema>
>;
export type AdminUserSummaryV2 = DeepReadonly<z.infer<typeof AdminUserSummaryV2Schema>>;
export type AdminUserListResponseV2 = DeepReadonly<z.infer<typeof AdminUserListResponseV2Schema>>;
export type CreateAdminUserRequestV2 = DeepReadonly<z.infer<typeof CreateAdminUserRequestV2Schema>>;
export type UpdateAdminUserRoleRequestV2 = DeepReadonly<
  z.infer<typeof UpdateAdminUserRoleRequestV2Schema>
>;
export type UpdateAdminUserStatusRequestV2 = DeepReadonly<
  z.infer<typeof UpdateAdminUserStatusRequestV2Schema>
>;
export type AdminUserResponseV2 = DeepReadonly<z.infer<typeof AdminUserResponseV2Schema>>;
export type ProjectAccessV2 = DeepReadonly<z.infer<typeof ProjectAccessV2Schema>>;
export type ProjectAccessResponseV2 = DeepReadonly<z.infer<typeof ProjectAccessResponseV2Schema>>;

export {
  ADMIN_USER_LIST_RESPONSE_V2,
  ADMIN_USER_RESPONSE_V2,
  AUTHENTICATED_IDENTITY_RESPONSE_V2,
  CREATE_ADMIN_USER_REQUEST_V2,
  PROJECT_ACCESS_RESPONSE_V2,
  UPDATE_ADMIN_USER_ROLE_REQUEST_V2,
  UPDATE_ADMIN_USER_STATUS_REQUEST_V2
};
