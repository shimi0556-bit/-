// מילון התרגום של הממשק. כל מה שלא נמצא כאן נשאר באנגלית כמו שהוא.

// מילות הספינר (ה-engine מגריל מילה באנגלית כמו "Sauteing"; אנחנו ממפים אותה דטרמיניסטית למילה בעברית)
export const SPINNER_WORDS = [
  'חושב', 'מעבד', 'מבשל', 'רוקח', 'מגלגל', 'מנתח', 'בונה', 'מסדר', 'מחשב',
  'מהרהר', 'מתכנן', 'מלטש', 'מפענח', 'מרכיב', 'מערבב', 'אופה', 'מתבשל',
  'מסנן', 'מחבר', 'מצייר', 'מנסח', 'מחפש', 'שוקל', 'מגבש', 'יוצר',
]

// המילה בשורה שסוגרת תור ("Baked for 3s")
export const DONE_WORDS = [
  'חשב', 'עבד', 'בישל', 'רקח', 'בנה', 'סידר', 'חישב', 'הרהר', 'תכנן', 'ליטש',
  'פענח', 'הרכיב', 'אפה', 'ניסח', 'יצר', 'גיבש',
]

// ביטויים שמופיעים בשורות הרמז, בהודעות ובמצבים. הסדר לא משנה: מוחלפים מהארוך לקצר.
export const PHRASES: Record<string, string> = {
  '? for shortcuts': '? לקיצורי מקלדת',
  'esc to interrupt': 'esc לעצירה',
  'esc to cancel': 'esc לביטול',
  'esc to undo': 'esc לביטול',
  'esc to go back': 'esc לחזרה',
  'Esc to cancel': 'Esc לביטול',
  'Press Ctrl-C again to exit': 'לחץ שוב Ctrl-C ליציאה',
  'Press Ctrl-D again to exit': 'לחץ שוב Ctrl-D ליציאה',
  'Press Esc again to clear': 'לחץ שוב Esc לניקוי',
  'ctrl+b to run in background': 'ctrl+b להרצה ברקע',
  'to run in background': 'להרצה ברקע',
  'shift+tab to cycle': 'shift+tab למעבר בין מצבים',
  'accept edits on': 'אישור עריכות אוטומטי פעיל',
  'plan mode on': 'מצב תכנון פעיל',
  'auto mode on': 'מצב אוטומטי פעיל',
  'bypass permissions on': 'עקיפת הרשאות פעילה',
  'ctrl+o to expand': 'ctrl+o להרחבה',
  'ctrl+r to expand': 'ctrl+r להרחבה',
  'ctrl+t to show todos': 'ctrl+t להצגת המשימות',
  'ctrl+t to hide todos': 'ctrl+t להסתרת המשימות',
  'ctrl+e to explain': 'ctrl+e להסבר',
  '! for bash mode': '! למצב פקודות',
  '/ for commands': '/ לפקודות',
  '@ for file paths': '@ לנתיבי קבצים',
  '# to memorize': '# לשמירה בזיכרון',
  'double tap esc to clear input': 'לחיצה כפולה על esc לניקוי',
  'Compacting conversation': 'דוחס את השיחה',
  'Auto-compacting conversation': 'דוחס את השיחה אוטומטית',
  'Waiting for permission': 'ממתין לאישור',
  'Running in background': 'רץ ברקע',
  'Interrupted': 'נעצר',
  'Thinking': 'חושב',
  'Working': 'עובד',
  'thinking': 'חושב',
  'memory paused': 'זיכרון מושהה',
  'focus': 'מיקוד',
  'fast': 'מהיר',
  'Context left until auto-compact': 'הקשר שנותר עד דחיסה אוטומטית',
  'Update available': 'עדכון זמין',
  'Run': 'הרץ',
  'to': 'כדי',
}

// כותרות שורות ב-/config
export const CONFIG_LABELS: Record<string, string> = {
  'Auto-compact': 'דחיסה אוטומטית',
  'Show tips': 'הצגת טיפים',
  'Reduce motion': 'הפחתת אנימציות',
  'Thinking mode': 'מצב חשיבה',
  'Rewind code (checkpoints)': 'החזרת קוד (נקודות שמירה)',
  'Verbose output': 'פלט מפורט',
  'Terminal progress bar': 'פס התקדמות בטרמינל',
  'Default permission mode': 'מצב הרשאות ברירת מחדל',
  'Respect .gitignore in file picker': 'כיבוד .gitignore בבוחר הקבצים',
  'Auto-update channel': 'ערוץ עדכונים אוטומטיים',
  'Theme': 'ערכת נושא',
  'Notifications': 'התראות',
  'Output style': 'סגנון פלט',
  'Language': 'שפה',
  'Editor mode': 'מצב עורך',
  'Model': 'מודל',
  'Diff tool': 'כלי השוואה',
  'Auto-connect to IDE (external terminal)': 'חיבור אוטומטי ל-IDE (טרמינל חיצוני)',
  'Auto-install IDE extension': 'התקנה אוטומטית של תוסף IDE',
  'Claude in Chrome enabled by default': 'Claude ב-Chrome מופעל כברירת מחדל',
  'Use todo list': 'שימוש ברשימת משימות',
  'Fast mode': 'מצב מהיר',
  'Prompt suggestions': 'הצעות להנחיה',
  'Copy on select': 'העתקה בסימון',
  'Status line': 'שורת מצב',
}

// תיאורי פקודות הסלאש המובנות
export const COMMANDS: Record<string, string> = {
  'add-dir': 'הוספת תיקיית עבודה חדשה',
  agents: 'ניהול תצורת סוכנים',
  clear: 'ניקוי היסטוריית השיחה ופינוי הקשר',
  compact: 'ניקוי השיחה תוך שמירת סיכום בהקשר',
  config: 'פתיחת לוח ההגדרות',
  context: 'הצגת השימוש הנוכחי בהקשר',
  cost: 'הצגת העלות והמשך של הסשן הנוכחי',
  doctor: 'בדיקת תקינות ההתקנה וההגדרות',
  exit: 'יציאה מהתוכנה',
  export: 'ייצוא השיחה לקובץ או ללוח',
  help: 'הצגת עזרה ופקודות זמינות',
  hooks: 'ניהול הגדרות hooks לאירועי כלים',
  ide: 'ניהול חיבורי IDE והצגת מצבם',
  init: 'יצירת קובץ CLAUDE.md עם תיעוד הפרויקט',
  login: 'התחברות לחשבון Anthropic',
  logout: 'התנתקות מהחשבון',
  mcp: 'ניהול שרתי MCP',
  memory: 'עריכת קבצי הזיכרון של Claude',
  model: 'בחירת מודל AI',
  permissions: 'ניהול כללי הרשאות לכלים',
  plugin: 'ניהול תוספים',
  'pr-comments': 'הצגת תגובות מ-Pull Request',
  'release-notes': 'הצגת הערות גרסה',
  resume: 'חזרה לשיחה קודמת',
  review: 'סקירת Pull Request',
  rewind: 'החזרת הקוד ו/או השיחה לנקודה קודמת',
  'security-review': 'סקירת אבטחה של השינויים הממתינים',
  status: 'הצגת מצב Claude Code: גרסה, מודל, חשבון וחיבורים',
  statusline: 'הגדרת שורת המצב',
  tasks: 'הצגת וניהול משימות רקע',
  'terminal-setup': 'הגדרת קיצור Shift+Enter לשורה חדשה',
  theme: 'החלפת ערכת נושא',
  todos: 'הצגת רשימת המשימות הנוכחית',
  upgrade: 'שדרוג התוכנית',
  usage: 'הצגת מגבלות השימוש בתוכנית',
  vim: 'מעבר בין מצב Vim למצב עריכה רגיל',
  'output-style': 'בחירת סגנון פלט',
  'privacy-settings': 'הגדרות פרטיות',
  feedback: 'שליחת משוב על Claude Code',
  bug: 'דיווח על באג',
  fast: 'הפעלה/כיבוי של מצב מהיר',
  loop: 'הרצת הנחיה שוב ושוב במרווח זמן',
}

const PHRASE_KEYS = Object.keys(PHRASES).sort((a, b) => b.length - a.length)

/** מתרגם ביטויים מוכרים בתוך טקסט; מילים בודדות קצרות מוחלפות רק כשהן הטקסט כולו. */
export function translate(text: string): string {
  const whole = PHRASES[text.trim()]
  if (whole !== undefined) return whole

  let out = text
  for (const key of PHRASE_KEYS) {
    if (key.length < 6) continue
    out = out.split(key).join(PHRASES[key] as string)
  }
  return out
}

export function pick(list: readonly string[], seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return list[Math.abs(hash) % list.length] as string
}

export function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h} שע׳`)
  if (m > 0) parts.push(`${m} דק׳`)
  if (s > 0 || parts.length === 0) parts.push(`${s} שנ׳`)
  return parts.join(' ')
}

const GROUP_VERBS: Record<string, { done: string; live: string; noun: (n: number) => string }> = {
  Read: { done: 'קרא', live: 'קורא', noun: n => (n === 1 ? 'קובץ אחד' : `${n} קבצים`) },
  Grep: { done: 'חיפש', live: 'מחפש', noun: n => (n === 1 ? 'תבנית אחת' : `${n} תבניות`) },
  Glob: { done: 'איתר', live: 'מאתר', noun: n => (n === 1 ? 'תבנית קבצים אחת' : `${n} תבניות קבצים`) },
  Bash: { done: 'הריץ', live: 'מריץ', noun: n => (n === 1 ? 'פקודה אחת' : `${n} פקודות`) },
  LS: { done: 'סרק', live: 'סורק', noun: n => (n === 1 ? 'תיקייה אחת' : `${n} תיקיות`) },
  WebFetch: { done: 'טען', live: 'טוען', noun: n => (n === 1 ? 'דף אחד' : `${n} דפים`) },
  WebSearch: { done: 'חיפש ברשת', live: 'מחפש ברשת', noun: n => (n === 1 ? 'פעם אחת' : `${n} פעמים`) },
}

/** "קרא 3 קבצים, הריץ 2 פקודות" */
export function groupSummary(tools: readonly string[], isActive: boolean): string {
  const counts = new Map<string, number>()
  for (const tool of tools) counts.set(tool, (counts.get(tool) ?? 0) + 1)

  const parts = [...counts].map(([tool, n]) => {
    const verb = GROUP_VERBS[tool]
    if (verb === undefined) return `השתמש ב-${tool} ${n === 1 ? 'פעם אחת' : `${n} פעמים`}`
    return `${isActive ? verb.live : verb.done} ${verb.noun(n)}`
  })
  return parts.join(', ')
}
