//! `/context` -- show detailed context usage (instant, not queued).
//!
//! `/context`       → window composition bar + categories  
//! `/context deep`  → same + actual system prompt + message texts

use crate::app::actions::Action;
use crate::slash::command::{CommandExecCtx, CommandResult, SlashCommand};

/// Show context usage breakdown (progress bar, token categories, stats).
pub struct ContextCommand;

impl SlashCommand for ContextCommand {
    fn name(&self) -> &str {
        "context"
    }

    fn aliases(&self) -> &[&str] {
        &["window", "ctx"]
    }

    fn description(&self) -> &str {
        "Context window: bar · /context deep for actual prompt text"
    }

    fn session_scoped(&self) -> bool {
        true
    }

    fn usage(&self) -> &str {
        "/context [deep|full|sys]"
    }

    fn takes_args(&self) -> bool {
        true
    }

    fn run(&self, ctx: &mut CommandExecCtx, args: &str) -> CommandResult {
        if ctx.session_id.is_none() {
            return CommandResult::Error("No active session".to_string());
        }

        let deep = match args.trim().to_ascii_lowercase().as_str() {
            "" | "bar" | "summary" => false,
            "deep" | "full" | "sys" | "text" | "all" | "prompt" => true,
            other => {
                return CommandResult::Error(format!(
                    "Unknown arg `{other}`. Use /context or /context deep"
                ));
            }
        };

        CommandResult::Action(Action::ShowContextInfo { deep })
    }
}
