import type { Register } from 'claude-code'

import {
  COMMANDS,
  CONFIG_LABELS,
  DONE_WORDS,
  SPINNER_WORDS,
  duration,
  groupSummary,
  pick,
  translate,
} from './he'

export const register: Register = on => {
  // הספינר שרץ בזמן תור: "Sauteing…" ← "מבשל…"
  on('ui.render', { component: 'Spinner' }, ($, e, next) =>
    next({
      ...e,
      props: {
        ...e.props,
        word: pick(SPINNER_WORDS, e.props.word),
        message: e.props.message === null ? null : translate(e.props.message),
      },
    }),
  )

  // השורה שסוגרת תור: "Baked for 3s" ← "אפה במשך 3 שנ׳"
  on('ui.render', { component: 'TurnDuration' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return (
      <Text dimColor>
        ✻ {pick(DONE_WORDS, e.props.word)} במשך {duration(e.props.durationMs)}
      </Text>
    )
  })

  // שורת הרמז מתחת לתיבת ההקלדה; נוגעים בה רק כשיש מה לתרגם, כדי שהכפתורים יישארו חיים
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    const hint = translate(e.props.hint)
    return hint === e.props.hint ? next(e) : next({ ...e, props: { ...e.props, hint } })
  })

  // תוויות המצב בצד ימין של שורת התחתית
  on('ui.render', { component: 'SessionMode' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, modes: e.props.modes.map(translate) } }),
  )

  // "(ctrl+b to run in background)"
  on('ui.render', { component: 'ToolProgress' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, hint: translate(e.props.hint) } }),
  )

  // הודעות המידע מתחת ללוגו
  on('ui.render', { component: 'InfoNotice' }, ($, e, next) =>
    next({ ...e, props: { ...e.props, text: translate(e.props.text) } }),
  )

  // שורת הסיכום של קבוצת כלים: "Read 3 files, ran 2 shell commands"
  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    if (e.props.isExpanded || e.props.calls.length === 0) return next(e)

    const { Text } = $.ui.resolve(e)
    const hasError = e.props.calls.some(call => call.isErrored)
    const summary = groupSummary(
      e.props.calls.map(call => call.tool),
      e.props.isActive,
    )
    return (
      <Text>
        <Text color={hasError ? 'red' : 'green'}>● </Text>
        {summary}
        {e.props.isActive ? '…' : ''}
        <Text dimColor> (ctrl+o להרחבה)</Text>
      </Text>
    )
  })

  // שורות /config
  on('config.describe', ($, e, next) => {
    const label = CONFIG_LABELS[e.label]
    return label === undefined ? next(e) : next({ ...e, label })
  })

  // תיאורי פקודות הסלאש המובנות בלבד (לא של תוספים או סקילים)
  on('command.describe', ($, e, next) => {
    const description = COMMANDS[e.command]
    const isBuiltIn = e.provider.tier === 'core'
    return isBuiltIn && description !== undefined ? next({ ...e, description }) : next(e)
  })

  // שתשובות המודל עצמן יהיו בעברית
  on('prompt.compose', async ($, e, next) => {
    const { sections } = await next(e)
    return {
      sections: [
        ...sections,
        {
          id: 'hebrew-ui:language',
          scope: 'session',
          text: 'The user interface is in Hebrew. Always reply to the user in Hebrew, including questions and option labels, unless they explicitly ask for another language. Code, identifiers and commands stay as they are.',
        },
      ],
    }
  })

  on('session.start', ($, e, next) => {
    $.ui.toast('הממשק בעברית פעיל')
    return next(e)
  })
}
