import { join } from 'node:path'
import { initProfile } from '@deepseek-ai/dsh-app-boot'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import { runDesktopCli } from './cli.ts'

if (process.argv[2] === 'init') initProfile(join(process.env.DSH_HOME, 'profiles', 'desktop'), PROFILE_TEMPLATES.web.bundles)
else await runDesktopCli(process.env.TEAM_CHAT_E2E_RUNTIME, process.env.TEAM_CHAT_DESKTOP_SUPPORT)
