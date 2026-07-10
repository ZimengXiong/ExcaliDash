import { z } from "zod";
import {
  buildPasswordPolicyMessage,
  config,
  validatePasswordAgainstPolicy,
} from "../config";

const passwordPolicyMessage = () => buildPasswordPolicyMessage(config.passwordPolicy);

const passwordSchema = z.string().superRefine((value, ctx) => {
  const validationMessage = validatePasswordAgainstPolicy(value, config.passwordPolicy);
  if (!validationMessage) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: validationMessage,
  });
});
export const registerSchema = z.object({
  username: z.string().trim().min(3).max(50).optional(),
  email: z.string().email().toLowerCase().trim(),
  password: passwordSchema,
  name: z.string().trim().min(1).max(100),
  setupCode: z.string().trim().min(1).max(64).optional(),
});

export const loginSchema = z
  .object({
    identifier: z.string().trim().min(1).max(255).optional(),
    email: z.string().email().toLowerCase().trim().optional(),
    username: z.string().trim().min(1).max(255).optional(),
    password: z.string(),
  })
  .refine((data) => Boolean(data.identifier || data.email || data.username), {
    message: "identifier/email/username is required",
  });

export const registrationToggleSchema = z.object({
  enabled: z.boolean(),
});

export const oidcJitProvisioningToggleSchema = z.object({
  enabled: z.boolean(),
});

export const adminRoleUpdateSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
  role: z.enum(["ADMIN", "USER"]),
});

export const authEnabledToggleSchema = z.object({
  enabled: z.boolean(),
});

export const authOnboardingChoiceSchema = z.object({
  enableAuth: z.boolean(),
});

export const adminCreateUserSchema = z.object({
  username: z.string().trim().min(3).max(50).optional(),
  email: z.string().email().toLowerCase().trim(),
  password: passwordSchema.optional(),
  oidcOnly: z.boolean().optional(),
  name: z.string().trim().min(1).max(100),
  role: z.enum(["ADMIN", "USER"]).optional(),
  mustResetPassword: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (!data.oidcOnly && !data.password) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["password"],
      message: passwordPolicyMessage(),
    });
  }
});

export const adminUpdateUserSchema = z.object({
  username: z.string().trim().min(3).max(50).nullable().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["ADMIN", "USER"]).optional(),
  mustResetPassword: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const impersonateSchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    identifier: z.string().trim().min(1).optional(),
  })
  .refine((data) => Boolean(data.userId || data.identifier), {
    message: "userId/identifier is required",
  });

export const loginRateLimitUpdateSchema = z.object({
  enabled: z.boolean(),
  windowMs: z.number().int().min(10_000).max(24 * 60 * 60 * 1000),
  max: z.number().int().min(1).max(10_000),
});

export const loginRateLimitResetSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const updateEmailSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  currentPassword: z.string().min(1).max(100),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: passwordSchema,
});

export const mustResetPasswordSchema = z.object({
  newPassword: passwordSchema,
});

export const apiKeyCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.string()).optional(),
});


export const userPreferencesSchema = z.object({
  theme: z.enum(["light", "dark"]).optional(),
  dashboardSortField: z.enum(["name", "createdAt", "updatedAt"]).optional(),
  dashboardSortDirection: z.enum(["asc", "desc"]).optional(),
  language: z.string().trim().min(1).max(35).optional(),
  gridStep: z.number().int().min(1).max(100).optional(),
}).strict();
