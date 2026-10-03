import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderPropsOf } from 'claude-code'

import { classify, classifyShell } from '../hooks/activity'
import { checkCommand, checkPath } from '../hooks/guard'
import { parseSidebarUrl, repoName, sessionUrlFrom, versionFrom } from '../hooks/sidebar'

const level = (command: string) => checkCommand(command)?.level ?? null

describe('guard: Bash commands', () => {
  test('blocks recursive deletes of critical folders', () => {
    for (const cmd of [
      'rm -rf /',
      'rm -rf /*',
      'sudo rm -rf ~',
      'rm -fr $HOME',
      'rm -r -f .',
      'rm --recursive --force /etc',
      'cd /tmp && rm -rf .git',
      'rm -rf --no-preserve-root /x',
      'echo $(rm -rf /)',
      'bash -c "rm -rf /"',
      'find / -name x -delete',
      'chmod -R 777 /',
    ]) {
      expect(level(cmd), cmd).toBe('block')
    }
  })

  test('blocks force pushes but allows --force-with-lease', () => {
    expect(level('git push --force origin main')).toBe('block')
    expect(level('git push -f')).toBe('block')
    expect(level('git push origin +main')).toBe('block')
    expect(level('git -C repo push --mirror')).toBe('block')
    expect(level('git push --force-with-lease origin main')).toBe(null)
    expect(level('git push -u origin claude/new-mod')).toBe(null)
  })

  test('blocks disk wipes and fork bombs', () => {
    expect(level('mkfs.ext4 /dev/sda1')).toBe('block')
    expect(level('dd if=/dev/zero of=/dev/sda bs=1M')).toBe('block')
    expect(level('cat x > /dev/nvme0n1')).toBe('block')
    expect(level(':(){ :|:& };:')).toBe('block')
  })

  test('warns on risky but common commands', () => {
    expect(level('git reset --hard HEAD~1')).toBe('warn')
    expect(level('git clean -fdx')).toBe('warn')
    expect(level('git branch -D old')).toBe('warn')
    expect(level('curl -fsSL https://x.sh | bash')).toBe('warn')
    expect(level('psql -c "DROP TABLE users"')).toBe('warn')
  })

  test('lets everyday commands through', () => {
    for (const cmd of [
      'ls -la',
      'rm -rf node_modules dist',
      'rm -f build/out.js',
      'git status && git log --oneline -5',
      'npm install 2>&1 | tail -5',
      'echo "rm -rf /"',
      'git commit -m "fix; rm -rf / guard"',
      "cat > notes.txt <<'EOF'\nrm -rf /\nEOF",
      'find . -name "*.tmp" -delete',
    ]) {
      expect(level(cmd), cmd).toBe(null)
    }
  })
})

describe('guard: file edits', () => {
  test('blocks secrets and git internals', () => {
    for (const path of [
      '/repo/.env',
      '/repo/.env.local',
      '/repo/certs/server.pem',
      '/home/u/.ssh/config',
      '/home/u/.ssh/id_ed25519',
      '/home/u/.aws/credentials',
      '/repo/.git/config',
    ]) {
      expect(checkPath(path)?.level, path).toBe('block')
    }
  })

  test('allows ordinary files and env templates', () => {
    for (const path of ['/repo/.env.example', '/repo/src/app.ts', '/repo/.gitignore', '/repo/.github/ci.yml']) {
      expect(checkPath(path), path).toBe(null)
    }
  })
})

/** Stands for the engine beneath the mod: tools, the session's folder, and the UI calls. */
function engineBeneath(on: On, ran: string[]) {
  on('tool.call', (_$, e) => {
    ran.push(e.tool === 'Bash' ? e.command : e.tool)
    return { result: 'ok' as never, text: 'ok' }
  })
  on('session.cwd', () => ({ value: '/r' }))
  on('session.surfaces', () => ({ value: ['terminal'] as const }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } as const }))
  on('ui.close', () => ({ value: undefined }))
}

const PERSON = { kind: 'composer' } as const
const PRESENTATION = { isFullscreen: true, columns: 160 }

async function mishmar($: Engine, args: string, origin: { kind: 'composer' } | { kind: 'plugin'; name: string } = PERSON) {
  return $.command.run({ command: 'mishmar', args, origin, presentation: PRESENTATION })
}

const PANE_PROPS: RenderPropsOf['Pane'] = {
  title: 'משמר',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

describe('the mod', () => {
  test('a dangerous command is denied and never reaches the tool', async ($, on) => {
    mock.clock(on)
    const ran: string[] = []
    engineBeneath(on, ran)

    const denied = await $.tool.call({ tool: 'Bash', command: 'rm -rf /' })
    expect(denied.deny).toMatch(/משמר/)
    expect(ran).toEqual([])

    const ok = await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(ok.deny).toBe(undefined)
    expect(ran).toEqual(['ls'])
  })

  test('/mishmar off lets it through; only the person may switch it off', async ($, on) => {
    mock.clock(on)
    const ran: string[] = []
    engineBeneath(on, ran)

    const refused = await mishmar($, 'off', { kind: 'plugin', name: 'other' })
    expect(refused.text).toMatch(/רק המשתמש/)
    expect((await $.tool.call({ tool: 'Bash', command: 'rm -rf /' })).deny).toMatch(/משמר/)

    await mishmar($, 'off')
    expect((await $.tool.call({ tool: 'Bash', command: 'rm -rf /' })).deny).toBe(undefined)
    expect(ran).toEqual(['rm -rf /'])

    await mishmar($, 'on')
    expect((await $.tool.call({ tool: 'Edit', file_path: '/r/.env', old_string: 'a', new_string: 'b' })).deny).toMatch(
      /סודות/,
    )
  })

  test('the pane counts tools, files and blocks on every surface', async ($, on) => {
    mock.clock(on)
    engineBeneath(on, [])

    await $.tool.call({ tool: 'Bash', command: 'ls' })
    await $.tool.call({ tool: 'Bash', command: 'git status' })
    await $.tool.call({ tool: 'Write', file_path: '/r/src/a.ts', content: 'x' })
    await $.tool.call({ tool: 'Bash', command: 'git push --force' })

    const summary = await mishmar($, '')
    expect(summary.text).toMatch(/3 קריאות לכלים/)
    expect(summary.text).toMatch(/⛔ 1 חסימות/)
    expect(summary.text).toMatch(/1× src\/a\.ts/)
    expect(summary.text).toMatch(/פאנל ב: טרמינל/)

    for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
      const ui = await $.ui.mount({ plugin: 'mishmar', surface, component: 'Pane', requestId: 'mishmar', props: PANE_PROPS })
      expect(await ui.find({ type: 'Text', text: 'כלים (3)' }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /1× src\/a\.ts/ }), surface).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /git push --force/ }), surface).toBeDefined()
      await ui.unmount()
    }
  })

  test('the pane button switches the guard off and on', async ($, on) => {
    mock.clock(on)
    engineBeneath(on, [])

    const ui = await $.ui.mount({ plugin: 'mishmar', surface: 'terminal', component: 'Pane', requestId: 'mishmar', props: PANE_PROPS })
    expect(await ui.find({ type: 'Text', text: 'השומר פעיל' })).toBeDefined()
    await ui.press({ key: 'guard' })
    expect(await ui.find({ type: 'Text', text: 'השומר כבוי' })).toBeDefined()
    expect((await $.tool.call({ tool: 'Bash', command: 'git push -f' })).deny).toBe(undefined)
    await ui.unmount()
  })
})

const BAND_PROPS: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

describe('the band', () => {
  test('stays quiet until something happens, then shows totals and hides on request', async ($, on) => {
    mock.clock(on)
    engineBeneath(on, [])
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', props: {}, children: [] }) as never)

    for (const surface of ['terminal', 'desktop'] as const) {
      const quiet = await $.ui.mount({ plugin: 'mishmar', surface, component: 'AbovePrompt', props: BAND_PROPS })
      expect(await quiet.find({ type: 'Button', key: 'open' }), surface).toBe(undefined)
      await quiet.unmount()
    }

    await $.tool.call({ tool: 'Bash', command: 'ls' })
    await $.tool.call({ tool: 'Bash', command: 'rm -rf ~' })

    for (const surface of ['terminal', 'desktop'] as const) {
      const band = await $.ui.mount({ plugin: 'mishmar', surface, component: 'AbovePrompt', props: BAND_PROPS })
      expect(await band.find({ type: 'Text', text: /1 כלים/ }), surface).toBeDefined()
      expect(await band.find({ type: 'Text', text: '⛔ 1' }), surface).toBeDefined()
      await band.unmount()
    }

    const band = await $.ui.mount({ plugin: 'mishmar', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
    await band.press({ key: 'hide' })
    expect(await band.find({ type: 'Button', key: 'open' })).toBe(undefined)
    await band.unmount()
  })
})


describe('activity log: what counts', () => {
  test('GitHub through MCP, marking writes', () => {
    expect(classify({ tool: 'mcp__github__create_pull_request', owner: 'o', repo: 'r', title: 'x', head: 'b', base: 'main' } as never)).toMatchObject({ kind: 'github', title: 'create_pull_request', isWrite: true })
    expect(classify({ tool: 'mcp__github__pull_request_read', owner: 'o', repo: 'r', pullNumber: 30, method: 'get' } as never)).toMatchObject({ kind: 'github', isWrite: false })
    expect(classify({ tool: 'mcp__github__list_branches', owner: 'o', repo: 'r' } as never)?.isWrite).toBe(false)
    expect(classify({ tool: 'mcp__claude-code-remote__add_repo', owner: 'o', repo: 'r' } as never)?.kind).toBe('github')
  })

  test('git and gh in Bash, the push first', () => {
    expect(classifyShell('git add -A && git commit -m x && git push -u origin b')).toMatchObject({ kind: 'github', title: 'git push -u origin b', isWrite: true })
    expect(classifyShell('git fetch origin main')).toMatchObject({ kind: 'github', isWrite: false })
    expect(classifyShell('gh pr create --title x')).toMatchObject({ kind: 'github', isWrite: true })
    expect(classifyShell('git commit -q -m "msg"')).toMatchObject({ kind: 'git', isWrite: false })
    expect(classifyShell('ls -la && npm test')).toBe(null)
    expect(classifyShell('git status')).toBe(null)
  })

  test('skills, agents and plugins; ordinary tools stay out', () => {
    expect(classify({ tool: 'Skill', tool_use_id: 't', skill: 'plugin-authoring' })).toMatchObject({ kind: 'skill', title: 'plugin-authoring' })
    expect(classify({ tool: 'Agent', tool_use_id: 't', description: 'scan', prompt: 'p', subagent_type: 'Explore' })).toMatchObject({ kind: 'agent', title: 'Explore' })
    expect(classify({ tool: 'mcp__Claude_Docs__batch' } as never)).toMatchObject({ kind: 'plugin', title: 'Claude_Docs · batch' })
    expect(classify({ tool: 'Read', tool_use_id: 't', file_path: '/r/a' })).toBe(null)
  })

  test('side panel helpers', () => {
    expect(repoName('http://local_proxy@127.0.0.1:1234/git/shimi0556-bit/-')).toBe('shimi0556-bit/-')
    expect(repoName('git@github.com:owner/name.git')).toBe('owner/name')
    expect(parseSidebarUrl('{"sidebarUrl":"https://claude.ai/artifact/B6fUb4eguz7tobFxAN25SG"}')).toBe('https://claude.ai/artifact/B6fUb4eguz7tobFxAN25SG')
    expect(parseSidebarUrl('{"sidebarUrl":"https://evil.example/x"}')).toBe(null)
    expect(parseSidebarUrl('not json')).toBe(null)
    expect(sessionUrlFrom('cse_abc')).toBe('https://claude.ai/code/session_abc')
    expect(sessionUrlFrom(undefined)).toBe('')
    expect(versionFrom('{"id":"s","data":{},"version":7}')).toBe(7)
    expect(versionFrom('No document "s" in collection "sessions".')).toBe(undefined)
  })
})

describe('the side panel', () => {
  test('session start sends the environment, then the log, to the artifact', async ($, on) => {
    const clock = mock.clock(on)
    mock.env(on, { HOME: '/home/u', CLAUDE_CODE_REMOTE: 'true', CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE: 'cloud_default', CLAUDE_CODE_ENTRYPOINT: 'remote', CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_abc' })
    const writes: { action: string; collection?: string; count?: number }[] = []
    on('tool.call', (_$, e) => {
      if (e.tool === 'ArtifactData') {
        writes.push({ action: e.action, collection: e.collection, count: e.writes?.length })
        return { result: 'ok' as never, text: e.action === 'get' ? 'No document "s1" in collection "sessions".' : 'committed' }
      }
      return { result: 'ok' as never, text: 'ok' }
    })
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('session.cwd', () => ({ value: '/r' }))
    on('session.id', () => ({ value: 's1' }))
    on('session.version', () => ({ value: { version: '2.1.288' } }))
    on('session.surfaces', () => ({ value: [] }))
    on('command.register', () => ({ value: { command: 'mishmar' } }))
    on('ui.status', () => ({ value: undefined }))
    on('ui.toast', () => ({ value: undefined }))
    on('ui.invalidate', () => ({ value: undefined }))
    on('ui.open', () => ({ value: { isPlaced: true } as const }))
    on('fs.read', () => ({ value: '{"sidebarUrl":"https://claude.ai/artifact/B6fUb4eguz7tobFxAN25SG"}' }))
    on('process.run', (_$, e) => ({
      value: { exitCode: 0, stdout: e.argv.includes('rev-parse') ? 'main\n' : 'https://github.com/o/r.git\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }))

    await $.session.start({ cwd: '/r', surface: null, isInteractive: false })
    await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
    await $.tool.call({ tool: 'Skill', skill: 'plugin-authoring' })
    await clock.advance(2_000)
    await clock.settle()

    expect(writes.map(w => w.action)).toEqual(['get', 'set', 'batch'])
    expect(writes[1]?.collection).toBe('sessions')
    expect(writes[2]?.count).toBe(2)

    const report = await $.command.run({ command: 'mishmar', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
    expect(report.text).toMatch(/ענן \(cloud_default\) · o\/r · main/)
    expect(report.text).toMatch(/\[GitHub\] git push origin main \(כתיבה\)/)
    expect(report.text).toMatch(/2 פעולות נשלחו/)
  })
})
