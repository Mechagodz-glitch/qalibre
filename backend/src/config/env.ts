import 'dotenv/config';

import { z } from 'zod';

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('0.0.0.0'),
    CORS_ORIGIN: z.string().default('http://localhost:4200'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    AZURE_TENANT_ID: z.string().trim().optional(),
    MICROSOFT_TENANT_ID: z.string().trim().optional(),
    AZURE_CLIENT_ID: z.string().trim().optional(),
    MICROSOFT_CLIENT_ID: z.string().trim().optional(),
    MICROSOFT_SCOPE: z.string().trim().optional(),
    APP_BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
    APP_BOOTSTRAP_ADMIN_NAME: z.string().min(1).optional(),
    APP_BOOTSTRAP_ADMIN_PAGE_ACCESSES: z
      .string()
      .default('dashboard,test-generator,test-generator/runs,test-generator/review,test-generator/export,manual-execution,knowledge-base,admin')
      .transform((value) =>
        value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default('gpt-5.4-nano-2026-03-17'),
    OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
    OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    FIGMA_ACCESS_TOKEN: z.string().optional(),
    FIGMA_API_BASE_URL: z.string().default('https://api.figma.com'),
    FIGMA_NODE_DEPTH: z.coerce.number().int().min(1).max(8).default(3),
    FIGMA_IMAGE_SCALE: z.coerce.number().min(0.5).max(4).default(1),
    DEFAULT_ACTOR: z.string().default('local-admin'),
  })
  .superRefine((value, context) => {
    const hasTenantId = Boolean(value.AZURE_TENANT_ID?.trim() || value.MICROSOFT_TENANT_ID?.trim());
    const hasClientId = Boolean(value.AZURE_CLIENT_ID?.trim() || value.MICROSOFT_CLIENT_ID?.trim());

    if ((hasTenantId || hasClientId) && !hasTenantId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AZURE_TENANT_ID or MICROSOFT_TENANT_ID is required when auth is configured',
        path: ['AZURE_TENANT_ID'],
      });
    }

    if ((hasTenantId || hasClientId) && !hasClientId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AZURE_CLIENT_ID or MICROSOFT_CLIENT_ID is required when auth is configured',
        path: ['AZURE_CLIENT_ID'],
      });
    }
  })
  .transform((value) => ({
    PORT: value.PORT,
    HOST: value.HOST,
    CORS_ORIGIN: value.CORS_ORIGIN,
    DATABASE_URL: value.DATABASE_URL,
    AZURE_TENANT_ID: value.AZURE_TENANT_ID?.trim() || value.MICROSOFT_TENANT_ID?.trim() || '',
    AZURE_CLIENT_ID: value.AZURE_CLIENT_ID?.trim() || value.MICROSOFT_CLIENT_ID?.trim() || '',
    AUTH_DISABLED: !(
      value.AZURE_TENANT_ID?.trim() || value.MICROSOFT_TENANT_ID?.trim()
    ) && !(
      value.AZURE_CLIENT_ID?.trim() || value.MICROSOFT_CLIENT_ID?.trim()
    ),
    MICROSOFT_SCOPE: value.MICROSOFT_SCOPE?.trim() || '',
    APP_BOOTSTRAP_ADMIN_EMAIL: value.APP_BOOTSTRAP_ADMIN_EMAIL,
    APP_BOOTSTRAP_ADMIN_NAME: value.APP_BOOTSTRAP_ADMIN_NAME,
    APP_BOOTSTRAP_ADMIN_PAGE_ACCESSES: value.APP_BOOTSTRAP_ADMIN_PAGE_ACCESSES,
    OPENAI_API_KEY: value.OPENAI_API_KEY,
    OPENAI_MODEL: value.OPENAI_MODEL,
    OPENAI_TIMEOUT_MS: value.OPENAI_TIMEOUT_MS,
    OPENAI_MAX_RETRIES: value.OPENAI_MAX_RETRIES,
    FIGMA_ACCESS_TOKEN: value.FIGMA_ACCESS_TOKEN,
    FIGMA_API_BASE_URL: value.FIGMA_API_BASE_URL,
    FIGMA_NODE_DEPTH: value.FIGMA_NODE_DEPTH,
    FIGMA_IMAGE_SCALE: value.FIGMA_IMAGE_SCALE,
    DEFAULT_ACTOR: value.DEFAULT_ACTOR,
  }));

export const env = envSchema.parse(process.env);
