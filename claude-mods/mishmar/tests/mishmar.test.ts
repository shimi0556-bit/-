import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderPropsOf } from 'claude-code'

import { checkCommand, checkPath } from '../hooks/guard'

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
