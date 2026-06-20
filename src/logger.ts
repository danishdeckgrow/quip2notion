import pino from 'pino'

const level = (process.env.LOG_LEVEL ?? 'info') as pino.LevelWithSilent

export const logger = pino({
  level,
  redact: {
    paths: ['QUIP_TOKEN', 'NOTION_TOKEN', 'token', 'authorization'],
    censor: '[REDACTED]',
  },
  transport:
    process.env.NODE_ENV !== 'test'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
})
