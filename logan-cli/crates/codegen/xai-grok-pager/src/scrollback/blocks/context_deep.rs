//! Load + render deep-dive context window text (system prompt, messages).

use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use serde_json::Value;
use std::path::Path;

use crate::theme::{Theme, quantize};

/// One role / section of the live context window with a text preview.
#[derive(Debug, Clone)]
pub struct DeepSection {
    pub kind: DeepKind,
    pub title: String,
    pub chars: u64,
    /// Rough estimate (chars/4) - not the API billable count.
    pub tokens_est: u64,
    pub preview: String,
    pub truncated: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeepKind {
    System,
    User,
    Assistant,
    Reasoning,
    Tool,
    Other,
}

/// Full deep-dive payload attached to a `/context deep` block.
#[derive(Debug, Clone, Default)]
pub struct ContextDeepDive {
    pub session_dir: Option<String>,
    pub system_prompt_path: Option<String>,
    pub chat_history_path: Option<String>,
    pub sections: Vec<DeepSection>,
    pub total_chars: u64,
    pub total_tokens_est: u64,
}

const PREVIEW_CHARS: usize = 900;
const MAX_SECTIONS: usize = 24;

/// Load system prompt + chat history previews for a session id.
pub fn load_context_deep_dive(session_id: &str) -> Option<ContextDeepDive> {
    let dir = xai_grok_shell::session::persistence::find_session_dir_by_id(session_id)?;
    load_from_session_dir(&dir)
}

pub fn load_from_session_dir(dir: &Path) -> Option<ContextDeepDive> {
    let mut dive = ContextDeepDive {
        session_dir: Some(dir.display().to_string()),
        ..Default::default()
    };

    let sys_path = dir.join("system_prompt.txt");
    if sys_path.is_file() {
        dive.system_prompt_path = Some(sys_path.display().to_string());
        if let Ok(text) = std::fs::read_to_string(&sys_path) {
            let (preview, truncated) = preview_text(&text, PREVIEW_CHARS * 2);
            let chars = text.chars().count() as u64;
            let tokens_est = (chars + 3) / 4;
            dive.total_chars += chars;
            dive.total_tokens_est += tokens_est;
            dive.sections.push(DeepSection {
                kind: DeepKind::System,
                title: "System prompt (system_prompt.txt)".into(),
                chars,
                tokens_est,
                preview,
                truncated,
            });
        }
    }

    let hist_path = dir.join("chat_history.jsonl");
    if hist_path.is_file() {
        dive.chat_history_path = Some(hist_path.display().to_string());
        if let Ok(file) = std::fs::File::open(&hist_path) {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(file);
            let mut idx = 0usize;
            for line in reader.lines().map_while(Result::ok) {
                if dive.sections.len() >= MAX_SECTIONS {
                    dive.sections.push(DeepSection {
                        kind: DeepKind::Other,
                        title: "… more messages truncated (open chat_history.jsonl)".into(),
                        chars: 0,
                        tokens_est: 0,
                        preview: String::new(),
                        truncated: true,
                    });
                    break;
                }
                let Ok(val) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                let kind_str = val
                    .get("type")
                    .or_else(|| val.get("role"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("other");
                // Skip duplicate raw system row if we already have system_prompt.txt
                if kind_str == "system" && dive.system_prompt_path.is_some() && idx == 0 {
                    idx += 1;
                    continue;
                }
                let text = extract_text(&val);
                if text.trim().is_empty() {
                    idx += 1;
                    continue;
                }
                let (kind, label) = match kind_str {
                    "system" => (DeepKind::System, "system"),
                    "user" => (DeepKind::User, "user"),
                    "assistant" => (DeepKind::Assistant, "assistant"),
                    "reasoning" | "thinking" => (DeepKind::Reasoning, "reasoning"),
                    "tool" | "tool_result" | "function" => (DeepKind::Tool, "tool"),
                    other => (DeepKind::Other, other),
                };
                let chars = text.chars().count() as u64;
                let tokens_est = (chars + 3) / 4;
                dive.total_chars += chars;
                dive.total_tokens_est += tokens_est;
                let (preview, truncated) = preview_text(&text, PREVIEW_CHARS);
                dive.sections.push(DeepSection {
                    kind,
                    title: format!("#{idx} {label}"),
                    chars,
                    tokens_est,
                    preview,
                    truncated,
                });
                idx += 1;
            }
        }
    }

    if dive.sections.is_empty() {
        None
    } else {
        Some(dive)
    }
}

fn extract_text(val: &Value) -> String {
    if let Some(s) = val.get("content").and_then(|c| c.as_str()) {
        return s.to_string();
    }
    if let Some(arr) = val.get("content").and_then(|c| c.as_array()) {
        let mut parts = Vec::new();
        for item in arr {
            if let Some(t) = item.get("text").and_then(|t| t.as_str()) {
                parts.push(t.to_string());
            } else if let Some(t) = item.as_str() {
                parts.push(t.to_string());
            } else if let Some(summary) = item.get("summary").and_then(|s| s.as_array()) {
                for s in summary {
                    if let Some(t) = s.get("text").and_then(|t| t.as_str()) {
                        parts.push(t.to_string());
                    }
                }
            }
        }
        return parts.join("\n");
    }
    // reasoning summary shape
    if let Some(summary) = val.get("summary").and_then(|s| s.as_array()) {
        let mut parts = Vec::new();
        for s in summary {
            if let Some(t) = s.get("text").and_then(|t| t.as_str()) {
                parts.push(t.to_string());
            }
        }
        if !parts.is_empty() {
            return parts.join("\n");
        }
    }
    String::new()
}

fn preview_text(text: &str, max_chars: usize) -> (String, bool) {
    let trimmed = text.trim();
    let count = trimmed.chars().count();
    if count <= max_chars {
        return (trimmed.to_string(), false);
    }
    let preview: String = trimmed.chars().take(max_chars).collect();
    (preview, true)
}

/// Append deep-dive lines to a context block render.
pub fn append_deep_lines(lines: &mut Vec<Line<'static>>, dive: &ContextDeepDive, theme: &Theme) {
    let bold = |fg| Style::default().fg(fg).add_modifier(Modifier::BOLD);
    let muted = theme.muted();
    let c_sys = quantize(theme.accent_skill);
    let c_user = quantize(theme.accent_user);
    let c_asst = quantize(theme.accent_success);
    let c_reason = quantize(theme.warning);
    let c_tool = quantize(theme.accent_verify);
    let c_other = quantize(theme.gray_bright);
    let c_title = quantize(theme.text_primary);

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "── Deep dive (actual window text) ──",
        bold(c_title),
    )));
    lines.push(Line::from(Span::styled(
        format!(
            "est. {} chars · ~{} tokens (chars/4) · not API billable counts",
            dive.total_chars, dive.total_tokens_est
        ),
        muted,
    )));
    if let Some(ref p) = dive.session_dir {
        lines.push(Line::from(Span::styled(format!("session  {p}"), muted)));
    }
    if let Some(ref p) = dive.system_prompt_path {
        lines.push(Line::from(Span::styled(format!("sys file {p}"), muted)));
    }
    if let Some(ref p) = dive.chat_history_path {
        lines.push(Line::from(Span::styled(format!("history  {p}"), muted)));
    }
    lines.push(Line::from(""));

    for sec in &dive.sections {
        let color = match sec.kind {
            DeepKind::System => c_sys,
            DeepKind::User => c_user,
            DeepKind::Assistant => c_asst,
            DeepKind::Reasoning => c_reason,
            DeepKind::Tool => c_tool,
            DeepKind::Other => c_other,
        };
        let trunc = if sec.truncated { " …" } else { "" };
        lines.push(Line::from(Span::styled(
            format!(
                "▸ {}  ·  {} chars  ·  ~{} tok{trunc}",
                sec.title, sec.chars, sec.tokens_est
            ),
            bold(color),
        )));
        if sec.preview.is_empty() {
            continue;
        }
        // Body in slightly dimmer same hue
        let body_style = Style::default().fg(color);
        for line in sec.preview.lines() {
            // Indent body so headers stay scannable
            lines.push(Line::from(Span::styled(format!("  {line}"), body_style)));
        }
        if sec.truncated {
            lines.push(Line::from(Span::styled(
                "  … truncated · open file for full text",
                muted,
            )));
        }
        lines.push(Line::from(""));
    }

    lines.push(Line::from(Span::styled(
        "Tip: /stats for colorful API in/out/cache · dump: examples/scripts/dump-prompt-journey.sh",
        muted,
    )));
}


