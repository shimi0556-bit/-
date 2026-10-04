import type { EngineInterface, Register, RenderInput } from 'claude-code'

import { LOGO_PNG_160 } from './logo'
import { collect, type Call, type Row } from './stats'

const PANE = 'session-activity'
// שאלות שאתה הקלדת: בטרמינל (composer), מהאפליקציה מרחוק (bridge) או דרך ה-SDK
const PERSON = new Set(['composer', 'bridge', 'sdk'])
const TITLE = 'הפעילות שלי בסשן'
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160"><image href="data:image/png;base64,${LOGO_PNG_160}" width="160" height="160"/></svg>`

type LogoSite = RenderInput<'AbovePrompt' | 'UserMessage' | 'AssistantMessage'>

function openPane($: EngineInterface): void {
  void $.ui.open({ id: PANE, title: TITLE })
  $.ui.invalidate('ui.render')
}

// הלוגו וכפתור הפתיחה, בכל משטח: תמונה בטרמינל, SVG בדסקטופ, בנייד וב-VS Code
function logoRow($: EngineInterface, e: LogoSite, size: number, key: string) {
  const { Box, Button } = $.ui.resolve(e)
  let picture
  if (e.surface === 'terminal') {
    const { Image } = $.ui.resolve(e)
    picture = <Image source={{ png: LOGO_PNG_160 }} columns={Math.round(size / 6)} rows={Math.round(size / 12)} alt="◉" />
  } else {
    const { Svg } = $.ui.resolve(e)
    picture = <Svg source={SVG} alt="לוגו" width={size} height={size} />
  }
  return (
    <Box flexDirection="row" alignItems="center" gap={1}>
      {picture}
      <Button key={key} label="📊 הפעילות שלי" onPress={() => openPane($)} />
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'activity', description: 'פתיחת טבלת הפעילות: גיטהאב, מיומנויות, תוספים ומחברים' })
    return next(e)
  })

  on('command.run', { command: 'activity' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    $.ui.invalidate('ui.render')
    return { text: 'טבלת הפעילות נפתחה.' }
  })

  // רענון הטבלה אחרי כל תור, כדי שתישאר עדכנית כשהיא פתוחה
  on('turn.complete', ($, e, next) => {
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // מעל שורת הכתיבה (טרמינל ודסקטופ בלבד — שם ה-engine מצייר את הפס הזה)
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    return logoRow($, e, 48, 'open')
  })

  // בכל שאלה שלך ובתחילת כל תשובה שלי — מוצג בכל המשטחים
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!PERSON.has(e.props.origin.kind)) return next(e)
    const { Box } = $.ui.resolve(e)
    const body = await next(e)
    return (
      <Box flexDirection="column">
        {logoRow($, e, 32, `open-u-${e.requestId}`)}
        {body}
      </Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!e.props.isFirstOfReply) return next(e)
    const { Box } = $.ui.resolve(e)
    const body = await next(e)
    return (
      <Box flexDirection="column">
        {logoRow($, e, 32, `open-a-${e.requestId}`)}
        {body}
      </Box>
    )
  })

  // הטבלה עצמה
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const messages = await $.session.messages()
    const calls: Call[] = messages.flatMap(m => m.toolUses.map(u => ({ tool: u.tool, input: u.input })))
    const stats = collect(calls)

    const section = (title: string, list: Row[], empty: string) => (
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">{title}</Text>
        {list.length === 0 ? (
          <Text dimColor>  {empty}</Text>
        ) : (
          list.map(row => (
            <Box flexDirection="row">
              <Box width={34}><Text wrap="truncate-end">  {row.name}</Text></Box>
              <Box width={8}><Text>{String(row.count)}</Text></Box>
              <Text dimColor>{row.percent}%</Text>
            </Box>
          ))
        )}
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Text dimColor>
          {stats.total} קריאות כלים בסשן · עמודות: שם · מספר שימושים · אחוז מכל הקריאות
        </Text>
        <Text> </Text>
        {section('🐙 פעולות בגיטהאב', stats.github, 'עוד לא היו פעולות בגיטהאב')}
        {section('🧠 מיומנויות (Skills)', stats.skills, 'עוד לא הופעלו מיומנויות')}
        {section('🧩 תוספים (Plugins)', stats.plugins, 'עוד לא נעשה שימוש בתוספים')}
        {section('🔌 מחברים (MCP)', stats.connectors, 'עוד לא נעשה שימוש במחברים')}
        {section('🛠 כלים מובנים', stats.builtins, 'אין')}
        <Button key="close" label="סגור" role="dismiss" onPress={() => void $.ui.close({ id: PANE })} />
      </Box>
    )
  })
}
