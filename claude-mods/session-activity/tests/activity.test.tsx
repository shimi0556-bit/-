import { expect, test } from 'claude-code/testing'

import { collect, githubAction } from '../hooks/stats'

test('מסווג קריאות ומחשב אחוזים', async () => {
  const stats = collect([
    { tool: 'Bash', input: { command: 'git push -u origin main' } },
    { tool: 'mcp__github__create_pull_request', input: {} },
    { tool: 'mcp__Gmail__search_threads', input: {} },
    { tool: 'Skill', input: { skill: 'anthropic-skills:pdf' } },
    { tool: 'Read', input: {} },
  ])
  expect(stats.total).toBe(5)
  expect(stats.github.map(r => r.name)).toEqual(['git push', 'github: create_pull_request'])
  expect(stats.connectors.map(r => r.name)).toEqual(['github', 'Gmail'])
  expect(stats.skills[0]).toEqual({ name: 'anthropic-skills:pdf', count: 1, percent: 20 })
  expect(stats.plugins[0]?.name).toBe('anthropic-skills')
  expect(stats.builtins.map(r => r.name)).toEqual(['Bash', 'Read'])
  expect(githubAction({ tool: 'Bash', input: { command: 'ls' } })).toBeUndefined()
})

test('הלוגו והכפתור מופיעים מעל שורת הכתיבה', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'session-activity', surface, component: 'AbovePrompt',
      props: {
        hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80,
        scroll: { offset: 0, bodyRows: 9 } as never, view: {} as never,
      },
    })
    expect(await ui.find({ key: 'open' })).toBeDefined()
    await ui.unmount()
  }
})

test('הלוגו מופיע בשאלה ובתשובה בכל המשטחים', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  for (const surface of ['terminal', 'desktop', 'mobile', 'vscode'] as const) {
    const user = await $.ui.mount({
      plugin: 'session-activity', surface, component: 'UserMessage',
      props: { text: 'שלום', origin: { kind: 'bridge' } as never, isExpanded: true },
    })
    expect(await user.find({ type: 'Button' })).toBeDefined()
    await user.unmount()
    const reply = await $.ui.mount({
      plugin: 'session-activity', surface, component: 'AssistantMessage',
      props: { text: 'היי', isFirstOfReply: true },
    })
    expect(await reply.find({ type: 'Button' })).toBeDefined()
    await reply.unmount()
  }
})
