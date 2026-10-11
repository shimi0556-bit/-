<!-- Output of the step-6 test from the video: `/karpathy-teach` → the karpathy agent, 2026-10-11. Graded against wiki/rules.md: 1✅ 2✅ 3✅ 4✅ 5✅ 6✅ 7✅. All outputs re-run and matched. -->

# בונים BPE tokenizer מאפס

אני לא קרפתי ולא מדבר בשמו. אני משתמש בשיטות שלו כפי שהן מתועדות בוויקי: בונים את הדבר הכי פשוט שעובד, מנחשים לפני כל הרצה, ומציגים קודם את הגרסה השבורה.

## 1. מתי זה נחשב גמור
אמור להיות לנו tokenizer שמתאמן על טקסט קטן, מקודד (encode) ומפענח (decode) בחזרה בלי לאבד אף תו. בדקתי את זה בהרצות אמיתיות על אנגלית ועל עברית, ובכל אחת מהן `round trip ok: True`.

## 2. הנחות
- Python 3 עם הספרייה הסטנדרטית בלבד. הקלטים זעירים ("aaabdaaabac", "שלום שלום שלום").
- BPE ברמת הבתים (byte-level): מתחילים מבתים של UTF-8, ולכן אוצר המילים ההתחלתי הוא 256.
- כשיש שני זוגות עם אותה ספירה, מנצח הזוג שהופיע ראשון בטקסט. זו בחירה שלי, ומימושים אחרים יכולים להחליט אחרת.
- אין כאן פיצול מקדים עם regex (מה ש-GPT עושה). על זה בסוף.

## 3. למה בכלל: הכאב של הגרסה הנאיבית
ה-tokenizer הכי טיפש שיש נותן token אחד לכל בית. כך עולה הסולם שקרפתי מתאר בהרצאה על tokenizers: מתחילים מהגרסה הנאיבית ומשם עוברים ל-BPE (wiki: methods/ramps-to-knowledge.md, sources/minbpe-lecture.md).

**ניחוש לפני ההרצה:** ל-"hello" יהיו 5 tokens. ל-"שלום" יהיו 8, כי כל אות עברית תופסת 2 בתים ב-UTF-8 ומתחילה בבית 215 (0xd7).

```
'hello': 5 chars -> 5 tokens: [104, 101, 108, 108, 111]
'שלום': 4 chars -> 8 tokens: [215, 169, 215, 156, 215, 149, 215, 157]
```
**השוואה:** יצא בדיוק מה שניחשתי. ויש כאן שתי בעיות:
1. הרצפים ארוכים. בעברית הם כפולים ממספר האותיות, ומודל שפה רואה רק מספר מוגבל של tokens בכל פעם.
2. יש מבנה שחוזר על עצמו: 215 מופיע בכל בית שני. זה בדיוק הדפוס ש-BPE מנצל. **(inferred)**

## 4. האיבר מהסדר הראשון: לולאת ה-BPE
הרעיון כולו: **סופרים את כל הזוגות הצמודים, ממזגים את הזוג השכיח ביותר ל-token חדש, וחוזרים על זה.** כל השאר הוא פרטים. הקוד ב-`bpe.py` (52 שורות) מורכב מארבע פונקציות:

- `get_stats(ids)`: סופרת זוגות צמודים.
- `merge(ids, pair, idx)`: מחליפה כל הופעה של הזוג ב-token החדש.
- `train`: מתחילה מהבתים ומבצעת `num_merges` מיזוגים. כל מיזוג נרשם ב-`merges` ומוסיף ערך ל-`vocab`.
- `encode`: מפעילה את המיזוגים **באותו סדר שבו נלמדו**. לכן `min` לפי מספר ה-token.
- `decode`: מחברת את כל הבתים ורק אז מפענחת, פעם אחת.

**ניחוש לפני ההרצה על "aaabdaaabac":**
- מיזוג 1 יהיה `aa`, כי הוא מופיע 4 פעמים.
- אחריו יש תיקו של 2 בין `(256,a)` לבין `(a,b)`. `(256,a)` מופיע ראשון, אז ייווצר `aaa`.
- מיזוג 3 יהיה `aaab`.
- התוצאה: 11 בתים יהפכו ל-5 tokens, `[258, 100, 258, 97, 99]`.

```
merge 1: (97, 97) -> 256 b'aa'  (count 4, length now 9)
merge 2: (256, 97) -> 257 b'aaa'  (count 2, length now 7)
merge 3: (257, 98) -> 258 b'aaab'  (count 2, length now 5)
encoded: [258, 100, 258, 97, 99] (11 bytes -> 5 tokens)
round trip ok: True
```
**השוואה:** יצא בדיוק כפי שניחשתי, כולל איך נשבר התיקו.

**אותו קוד על עברית.** הניחוש: 26 בתים. שבעה מיזוגים יבנו את "שלום" כ-token אחד, והשמיני יצרף אליו את הרווח. התוצאה תהיה 3 tokens: `[263, 263, 262]`.

```
merge 1: (215, 169) -> 256 b'\xd7\xa9'  (count 3, length now 23)
merge 2: (256, 215) -> 257 b'\xd7\xa9\xd7'  (count 3, length now 20)
...
merge 7: (261, 157) -> 262 b'\xd7\xa9\xd7\x9c\xd7\x95\xd7\x9d'  (count 3, length now 5)
merge 8: (262, 32) -> 263 b'\xd7\xa9\xd7\x9c\xd7\x95\xd7\x9d '  (count 2, length now 3)
encoded: [263, 263, 262] (26 bytes -> 3 tokens)
round trip ok: True
```
**השוואה:** יצא כפי שניחשתי. אבל שימו לב ל-token 257: הוא מכיל "ש" ועוד **חצי** מהאות הבאה (`\xd7` בודד). BPE לא יודע מה זה תו. הוא רואה רק בתים שכיחים.

## 5. שוברים בכוונה
מי שכותב decoder בפעם הראשונה כותב אותו בדרך כלל כך: מפענחים כל token לבד ומחברים את המחרוזות.

**ניחוש לפני ההרצה:** `encode("שמש")` ייתן `[257, 158, 256]`. ה-decoder הנאיבי ייפול על token 257, כי הוא נגמר באמצע תו.

```
encode('שמש') -> [257, 158, 256] [b'\xd7\xa9\xd7', b'\x9e', b'\xd7\xa9']
wrong: UnicodeDecodeError: 'utf-8' codec can't decode byte 0xd7 in position 2: unexpected end of data
fixed: שמש
fixed, lone token 257: 'ש�'
```
**אבחנה:** אות עברית אחת התפצלה בין שני tokens, 257 ו-158. אף אחד מהם הוא לא UTF-8 תקין לבד, רק שניהם יחד.

**התיקון,** שכבר נמצא ב-`decode` שב-`bpe.py`:
1. מחברים את כל הבתים ורק אז מפענחים.
2. מוסיפים `errors="replace"`, כי מודל שפה יכול לפלוט token כמו 257 לבדו. במקרה כזה מקבלים `�` במקום קריסה.

זה המקום שבו "זה רץ" עדיין לא אומר "זה נכון": באנגלית הבאג הזה לא היה מופיע אף פעם. **(inferred)**

לפי הערות ההרצאה, קרפתי טוען ש-"a lot of the shortcomings of LLMs that may be attributed to the neural network or otherwise appear mysterious actually trace back to tokenization." (wiki: sources/minbpe-lecture.md)

## 6. מה הצעד הבא (לא נבנה ולא הורץ)
ב-minbpe יש שלוש גרסאות: basic, regex ו-GPT-4 compatible (wiki: sources/minbpe.md). מה שבנינו כאן מתאים לגרסת basic. הצעד הבא הוא פיצול מקדים עם regex, כדי שמיזוג לא יחצה גבול של מילה או רווח. ראינו למה זה חשוב במיזוג 8: הוא הדביק רווח ל-"שלום". לא הוספתי את זה כי ההדגמה לא צריכה את זה. **(inferred)**

## 7. שאלת העברה: תנחשו לפני שאתם מריצים
אמנו את ה-tokenizer על "aaabdaaabac", ואחר כך הריצו `encode("שלום", merges)`. **כמה tokens תקבלו, ולמה?** ומה זה אומר על מודל שה-tokenizer שלו אומן בעיקר על אנגלית, כשהוא מקבל עברית?

---
### מה הורץ / What ran
- `python3 step1_naive.py`
- `python3 step2_train.py`
- `python3 step3_hebrew.py`
- `python3 step4_break.py`
(כולן מתוך `/home/user/-/karpathy-brain/demo/bpe/`, עם Python 3 בסביבה הזאת. ההוכחה תקפה רק לקלטים האלה.)
### מה יצא / What came out
- `'שלום': 4 chars -> 8 tokens: [215, 169, 215, 156, 215, 149, 215, 157]`
- `encoded: [258, 100, 258, 97, 99] (11 bytes -> 5 tokens)` / `round trip ok: True`
- `encoded: [263, 263, 262] (26 bytes -> 3 tokens)` / `round trip ok: True`
- `wrong: UnicodeDecodeError: 'utf-8' codec can't decode byte 0xd7 in position 2: unexpected end of data` / `fixed: שמש`
### מה השתנה / What changed
- נוצרו: `/home/user/-/karpathy-brain/demo/bpe/bpe.py`, `step1_naive.py`, `step2_train.py`, `step3_hebrew.py`, `step4_break.py`
- לא שיניתי שום דבר מחוץ לתיקייה הזאת, ולא עשיתי commit.
