//! TokenStatsBlock - colorful `/stats` API usage ledger in scrollback.

use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};

use crate::render::wrapping::word_wrap_lines;
use crate::scrollback::block::BlockContent;
use crate::scrollback::types::{AccentStyle, BlockContext, BlockLine, BlockOutput};
use crate::theme::{Theme, quantize};
use xai_grok_shell::session::SessionTokenStats;

/// Colored session API usage block for `/stats`.
#[derive(Debug, Clone)]
pub struct TokenStatsBlock {
    pub stats: SessionTokenStats,
    pub model: String,
    /// Last-call usage when known (from status bar / last sample).
    pub last_input: Option<u64>,
    pub last_output: Option<u64>,
    pub last_cache: Option<u64>,
}

impl TokenStatsBlock {
    pub fn new(stats: SessionTokenStats, model: impl Into<String>) -> Self {
        Self {
            stats,
            model: model.into(),
            last_input: None,
            last_output: None,
            last_cache: None,
        }
    }

    pub fn with_last_call(mut self, input: u64, output: u64, cache: u64) -> Self {
        self.last_input = Some(input);
        self.last_output = Some(output);
        self.last_cache = Some(cache);
        self
    }

    fn build_lines(&self, theme: &Theme) -> Vec<Line<'static>> {
        let s = &self.stats;
        let bold = |fg| Style::default().fg(fg).add_modifier(Modifier::BOLD);
        let dim = Style::default().fg(quantize(theme.gray_bright));
        let muted = theme.muted();

        // High-contrast palette so numbers pop.
        let c_in = quantize(theme.accent_skill); // teal - input
        let c_out = quantize(theme.accent_success); // green - output
        let c_cache = quantize(theme.accent_verify); // violet - cache
        let c_reason = quantize(theme.warning); // amber - reasoning
        let c_cost = quantize(theme.accent_user); // brand accent - $
        let c_title = quantize(theme.text_primary);

        let mut lines: Vec<Line<'static>> = Vec::new();
        lines.push(Line::from(Span::styled("Token stats", bold(c_title))));
        lines.push(Line::from(Span::styled(
            format!("session API ledger · {}", self.model),
            dim,
        )));
        lines.push(Line::from(""));

        // Big number row
        lines.push(Line::from(vec![
            Span::styled("  IN  ", bold(c_in)),
            Span::styled(fmt_big(s.input_tokens), bold(c_in)),
            Span::styled("   OUT  ", bold(c_out)),
            Span::styled(fmt_big(s.output_tokens), bold(c_out)),
            Span::styled("   CACHE  ", bold(c_cache)),
            Span::styled(fmt_big(s.cached_read_tokens), bold(c_cache)),
        ]));
        lines.push(Line::from(vec![
            Span::styled("  REASON  ", bold(c_reason)),
            Span::styled(fmt_big(s.reasoning_tokens), bold(c_reason)),
            Span::styled("   CALLS  ", bold(c_title)),
            Span::styled(
                format!("{} (main {})", s.model_calls, s.main_loop_model_calls),
                bold(c_title),
            ),
        ]));

        // Cost
        lines.push(Line::from(""));
        let cost_line = match s.cost_usd {
            Some(usd) => {
                let partial = if s.cost_partial { " (partial)" } else { "" };
                format!("  est. cost  ${usd:.6}{partial}")
            }
            None => "  est. cost  n/a (provider did not report)".into(),
        };
        lines.push(Line::from(Span::styled(cost_line, bold(c_cost))));

        if s.incomplete {
            lines.push(Line::from(Span::styled(
                "  note: ledger incomplete (some subagent usage may be missing)",
                Style::default().fg(quantize(theme.warning)),
            )));
        }

        // Last sample chip (live status-bar values)
        if self.last_input.is_some() || self.last_output.is_some() || self.last_cache.is_some() {
            lines.push(Line::from(""));
            lines.push(Line::from(Span::styled("Last sample", bold(c_title))));
            lines.push(Line::from(vec![
                Span::styled("  in ", dim),
                Span::styled(fmt_big(self.last_input.unwrap_or(0)), bold(c_in)),
                Span::styled("  out ", dim),
                Span::styled(fmt_big(self.last_output.unwrap_or(0)), bold(c_out)),
                Span::styled("  cache ", dim),
                Span::styled(fmt_big(self.last_cache.unwrap_or(0)), bold(c_cache)),
            ]));
        }

        // By model breakdown
        if !s.by_model.is_empty() {
            lines.push(Line::from(""));
            lines.push(Line::from(Span::styled("By model", bold(c_title))));
            for m in &s.by_model {
                let cost = m
                    .cost_usd
                    .map(|c| format!("  ${c:.4}"))
                    .unwrap_or_default();
                lines.push(Line::from(Span::styled(
                    format!("  {}", m.model),
                    Style::default()
                        .fg(quantize(theme.text_secondary))
                        .add_modifier(Modifier::BOLD),
                )));
                lines.push(Line::from(vec![
                    Span::styled(format!("    in {}", fmt_big(m.input_tokens)), bold(c_in)),
                    Span::styled(format!("  out {}", fmt_big(m.output_tokens)), bold(c_out)),
                    Span::styled(
                        format!("  cache {}", fmt_big(m.cached_read_tokens)),
                        bold(c_cache),
                    ),
                    Span::styled(format!("  calls {}", m.model_calls), dim),
                    Span::styled(cost, bold(c_cost)),
                ]));
            }
        }

        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            "Tip: /context deep  → full system prompt + message texts for these tokens",
            muted,
        )));
        lines.push(Line::from(Span::styled(
            "     /context       → window composition bar",
            muted,
        )));
        lines
    }
}

fn fmt_big(n: u64) -> String {
    if n >= 1_000_000 {
        format!("{:.2}M", n as f64 / 1_000_000.0)
    } else if n >= 10_000 {
        format!("{:.1}K", n as f64 / 1_000.0)
    } else if n >= 1_000 {
        format!("{:.2}K", n as f64 / 1_000.0)
    } else {
        format!("{n}")
    }
}

impl BlockContent for TokenStatsBlock {
    fn output(&self, ctx: &BlockContext) -> BlockOutput {
        let theme = Theme::current();
        let styled = self.build_lines(&theme);
        let wrapped = word_wrap_lines(styled, ctx.width as usize);
        let all_lines: Vec<BlockLine> = wrapped
            .into_iter()
            .map(|line| BlockLine::styled(line).with_selection_range(Some(0)))
            .collect();

        let lines = if let Some(max) = ctx.max_lines {
            let max = max as usize;
            if all_lines.len() > max && max > 0 {
                let take = max.saturating_sub(1).max(1);
                let mut truncated: Vec<BlockLine> = all_lines.into_iter().take(take).collect();
                if let Some(last) = truncated.last_mut() {
                    last.content.spans.push(Span::styled(
                        " …".to_string(),
                        theme.muted(),
                    ));
                }
                truncated
            } else {
                all_lines
            }
        } else {
            all_lines
        };

        BlockOutput {
            lines: if lines.is_empty() {
                vec![BlockLine::styled(Line::from("")).with_selection_range(Some(0))]
            } else {
                lines
            },
        }
    }

    fn accent(&self, _ctx: &BlockContext) -> Option<AccentStyle> {
        let theme = Theme::current();
        Some(AccentStyle::static_color(quantize(theme.accent_skill)))
    }

    fn has_vpad(&self, _ctx: &BlockContext) -> bool {
        true
    }

    fn has_raw_mode(&self) -> bool {
        false
    }

    fn is_foldable(&self) -> bool {
        true
    }

    fn is_selectable(&self) -> bool {
        true
    }

    fn is_groupable(&self) -> bool {
        false
    }
}
