import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_URL: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),

  // JWT
  JWT_SECRET: z
    .string()
    .min(8, 'JWT_SECRET must be at least 8 characters long'),
  JWT_EXPIRES_IN: z.string().default('1d'),

  // Sentry
  SENTRY_DSN: z.string().optional(),

  // Mailer
  SMTP_HOST: z.string().default('smtp.ethereal.email'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('noreply@cms.com'),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const errorMessages = result.error.issues
      .map(
        (issue) =>
          `❌ [Config Error] ${issue.path.join('.')}: ${issue.message}`,
      )
      .join('\n');

    throw new Error(
      `\n========================================\n🚨 ENVIRONMENT CONFIGURATION VALIDATION FAILED:\n${errorMessages}\n========================================\n`,
    );
  }

  return result.data;
}
