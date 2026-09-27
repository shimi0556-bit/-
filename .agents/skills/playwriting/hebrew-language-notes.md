# Hebrew-Language Notes

Everything in [Dramatic Structure](dramatic-structure.md) and [Dialogue & Character](dialogue-and-character.md) applies as-is regardless of language — structure, objective/obstacle/tactic, subtext, and voice differentiation are not English-specific. What changes for a Hebrew-language script (מחזה) is layout direction and a few naming/formatting conventions.

## RTL layout

Hebrew is written right-to-left, which affects the script's physical layout, not the dramatic craft:

- **Character cues and dialogue** still appear as name-then-line, but the whole block flows right-to-left: the character name sits at the right margin (not centered the way some English house styles do), with dialogue starting from the right.
- **Stage directions in parentheses** still visually separate from dialogue, but check that the word processor or tool being used doesn't mis-order Hebrew/English mixed text inside a single line (a common bug: a Hebrew line containing a Latin-script proper noun or a number can render out of order without explicit direction marks). If the script mixes Hebrew and English/Latin content (a character's foreign name, a quoted English phrase), test the actual rendered PDF output rather than trusting the editor's on-screen preview alone.
- **Page/scene numbering** and act headers (`מערכה ראשונה`, `תמונה 1`) still read right-to-left but numerals themselves display left-to-right within the Hebrew text (standard bidi behavior) — this is normal, not a formatting error.

## Tooling

- **Celtx** and most mainstream screenwriting/playwriting software are built RTL-agnostic (Latin-first) — Hebrew text may work but the layout conventions above (name position, margins) may not automatically match Hebrew theatrical convention. Verify actual output rather than assuming a Latin-oriented tool produces correct Hebrew stage-play layout by default.
- A plain word processor (Google Docs/LibreOffice/Word) with RTL paragraph direction set explicitly, and a manually-built character-cue/stage-direction style (see [Format & Stagecraft](format-and-stagecraft.md)), is often the most reliable free path for a properly laid-out Hebrew script — full manual control over direction avoids surprises from a tool that assumes LTR.
- If the script (or a bilingual/dual-language version) is ever turned into a rendered video or presentation asset rather than a printed/PDF script, the RTL and Hebrew-font guidance in this account's Hebrew-focused skills (e.g. Hebrew Google Fonts, `dir="rtl"`, bidirectional text handling) applies — check whether a Hebrew-specific presentation/video skill is more relevant at that point than this one.

## Common Israeli theatrical conventions worth knowing

- **מערכה** (act) and **תמונה** (scene/tableau) are the standard structural terms; **תפאורה** (set/scenery) and **הוראת במה** (stage direction) are the standard terms for the format elements above.
- School and community productions (הצגות בית ספר / תיאטרון קהילתי) are exactly the context where the [Stagecraft Constraints](format-and-stagecraft.md#stagecraft-constraints--writing-for-what-a-stage-can-actually-do) section matters most in practice — small casts, doubling, and minimal set changes are the norm, not the exception, so plan for them from the outline stage rather than writing an ambitious script and cutting it down later.
