import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'
import { logger } from './logger.js'

loadDotenv()

const ConfigSchema = z.object({
  QUIP_TOKEN: z.string().min(10, 'QUIP_TOKEN is required — get it at https://quip.com/dev/token'),
  NOTION_TOKEN: z.string().min(10, 'NOTION_TOKEN is required — create an integration at https://notion.so/my-integrations'),
  NOTION_TARGET_PAGE_ID: z.string().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  CONCURRENCY: z.coerce.number().int().min(1).max(10).default(4),
})

export type AppConfig = z.infer<typeof ConfigSchema>

let _config: AppConfig | null = null

export function getConfig(): AppConfig {
  if (_config) return _config
  const result = ConfigSchema.safeParse(process.env)
  if (!result.success) {
    const errs = result.error.errors.map((e) => `  • ${e.path.join('.')}: ${e.message}`).join('\n')
    logger.error('Configuration error:\n' + errs)
    logger.error('Copy .env.example to .env and fill in your tokens.')
    process.exit(1)
  }
  _config = result.data
  return _config
}

export function resetConfig(): void {
  _config = null
}
