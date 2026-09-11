//! `/stats` -- session token usage (input / output / cache / $ by model).

use crate::app::actions::Action;
use crate::slash::command::{CommandExecCtx, CommandResult, SlashCommand};

/// Show first-class token stats from the session usage ledger.
///
/// Backed by the same session-info fetch as `/session-info`, but the rendered
/// block always includes the token_stats section (input/output/cache/cost).
pub struct StatsCommand;

impl SlashCommand for StatsCommand {
    fn name(&self) -> &str {
        "stats"
    }

    fn aliases(&self) -> &[&str] {
        &["tokens", "token-stats"]
    }

    fn description(&self) -> &str {
        "Colorful token stats: in / out / cache / $ by model"
    }

    fn session_scoped(&self) -> bool {
        true
    }

    fn usage(&self) -> &str {
        "/stats"
    }

    fn run(&self, ctx: &mut CommandExecCtx, _args: &str) -> CommandResult {
        if ctx.session_id.is_none() {
            return CommandResult::Error("No active session".to_string());
        }
        // Reuses session-info pipeline which now embeds token_stats.
        CommandResult::Action(Action::ShowSessionInfo)
    }
}
