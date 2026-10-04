import { expect, test } from 'claude-code/testing'

import { duration, groupSummary, translate } from '../hooks/he'

test('מתרגם ביטויים ומשכי זמן', async () => {
  expect(translate('? for shortcuts')).toBe('? לקיצורי מקלדת')
  expect(translate('esc to interrupt · ctrl+t to show todos')).toBe('esc לעצירה · ctrl+t להצגת המשימות')
  expect(translate('unknown text')).toBe('unknown text')
  expect(duration(64_000)).toBe('1 דק׳ 4 שנ׳')
  expect(groupSummary(['Read', 'Read', 'Bash'], false)).toBe('קרא 2 קבצים, הריץ פקודה אחת')
})

test('הספינר מקבל מילה בעברית', async ($, on) => {
  let seen = ''
  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    seen = e.props.word
    const { Text } = $.ui.resolve(e)
    return <Text>{seen}</Text>
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'hebrew-ui', surface, component: 'Spinner',
      props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' },
    })
    expect(seen).toMatch(/[֐-׿]/)
    await ui.unmount()
  }
})

test('שורת סיום התור וקבוצת הכלים בעברית', async $ => {
  const done = await $.ui.mount({
    plugin: 'hebrew-ui', surface: 'terminal', component: 'TurnDuration',
    props: { word: 'Baked', durationMs: 3000 },
  })
  expect(await done.find({ type: 'Text', text: /במשך 3 שנ׳/ })).toBeDefined()
  await done.unmount()

  for (const surface of ['terminal', 'desktop'] as const) {
    const group = await $.ui.mount({
      plugin: 'hebrew-ui', surface, component: 'ToolGroup',
      props: {
        isActive: false, isExpanded: false,
        calls: [{ tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false }],
      },
    })
    expect(await group.find({ type: 'Text', text: /קרא קובץ אחד/ })).toBeDefined()
    await group.unmount()
  }
})
