#!/usr/bin/env node
import { Command } from 'commander'
import { initCommand } from './commands/init.js'
import { planCommand } from './commands/plan.js'
import { migrateCommand } from './commands/migrate.js'
import { resumeCommand } from './commands/resume.js'
import { reportCommand } from './commands/report.js'
import { verifyCommand } from './commands/verify.js'

const program = new Command()

program
  .name('quip2notion')
  .description(
    'Bulk-migrate your Quip workspace to Notion. Runs locally — never sends data to third parties.'
  )
  .version('0.1.0')

program.addCommand(initCommand())
program.addCommand(planCommand())
program.addCommand(migrateCommand())
program.addCommand(resumeCommand())
program.addCommand(reportCommand())
program.addCommand(verifyCommand())

program.parse()
