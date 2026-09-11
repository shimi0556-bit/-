//! `/update` - fetch latest Logan from the hoodini/logan-cli repo (or release channel).
//!
//! Default re-runs the public install script (git pull/clone + build + install)
//! in the background so the TUI stays responsive. Restart Logan when it finishes.
//!
//! Author: Yuval Avidani (YUV.AI)

use crate::slash::command::{
    AppCtx, ArgItem, CommandExecCtx, CommandResult, SlashCommand,
};
use std::path::PathBuf;
use std::process::{Command, Stdio};

const INSTALL_URL: &str =
    "https://raw.githubusercontent.com/hoodini/logan-cli/main/scripts/install-logan.sh";

fn logan_home() -> PathBuf {
    if let Ok(v) = std::env::var("LOGAN_HOME") {
        return PathBuf::from(v);
    }
    #[allow(deprecated)]
    std::env::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".logan")
}

fn update_log_path() -> PathBuf {
    logan_home().join("logs").join("update.log")
}

fn log_path_escaped(path: &std::path::Path) -> String {
    path.display().to_string().replace('\'', "'\\''")
}

fn current_binary() -> PathBuf {
    std::env::current_exe().unwrap_or_else(|_| PathBuf::from("logan"))
}

/// Run `logan update --check` and return captured text.
fn run_release_check() -> CommandResult {
    let bin = current_binary();
    let output = Command::new(&bin)
        .args(["update", "--check"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();
    match output {
        Ok(o) => {
            let mut text = String::from_utf8_lossy(&o.stdout).into_owned();
            let err = String::from_utf8_lossy(&o.stderr);
            if !err.trim().is_empty() {
                if !text.is_empty() {
                    text.push('\n');
                }
                text.push_str(&err);
            }
            if text.trim().is_empty() {
                text = if o.status.success() {
                    "Update check finished (no output).".into()
                } else {
                    format!("Update check failed (exit {}).", o.status)
                };
            }
            CommandResult::Message(format!(
                "## Logan update check (release channel)\n\n```\n{}\n```\n\n\
                 Install latest release: `/update release`\n\
                 Rebuild from GitHub main: `/update` or `/update source`",
                text.trim()
            ))
        }
        Err(e) => CommandResult::Error(format!(
            "Could not run `{} update --check`: {e}",
            bin.display()
        )),
    }
}

/// Spawn a long update job; log to ~/.logan/logs/update.log
fn spawn_background(label: &str, shell_cmd: &str) -> CommandResult {
    let home = logan_home();
    if let Err(e) = std::fs::create_dir_all(home.join("logs")) {
        return CommandResult::Error(format!("Cannot create logs dir: {e}"));
    }
    let log = update_log_path();
    // Truncate log with a header so each run is clear.
    let header = format!(
        "=== Logan /update ({label}) started unix:{} ===\ncmd: {shell_cmd}\n\n",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    );
    if let Err(e) = std::fs::write(&log, &header) {
        return CommandResult::Error(format!("Cannot write {}: {e}", log.display()));
    }

    let log_esc = log_path_escaped(&log);
    // Append all output to the log file; keep PATH for cargo/rustup.
    let full = format!(
        "set -o pipefail 2>/dev/null; set +e; \
         ({shell_cmd}) >>'{log_esc}' 2>&1; \
         ec=$?; \
         echo; echo \"=== finished exit=$ec unix:$(date +%s) ===\" >>'{log_esc}'; \
         exit $ec"
    );

    match Command::new("bash")
        .arg("-lc")
        .arg(&full)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => CommandResult::Message(format!(
            "## Logan update started ({label})\n\n\
             Background PID: **{}**\n\
             Log: `{}`\n\n\
             ```bash\n\
             tail -f {}\n\
             ```\n\n\
             When the log says `finished exit=0`, **quit Logan and start it again**:\n\
             ```bash\n\
             logan --version\n\
             logan\n\
             ```\n\
             Active skills stay as you left them (catalog may refresh). Modes stay off unless you enabled them.\n\
             Options: `/update check` · `/update release` · `/update source`",
            child.id(),
            log.display(),
            log.display()
        )),
        Err(e) => CommandResult::Error(format!("Failed to spawn update: {e}")),
    }
}

fn source_update_cmd() -> String {
    // Prefer re-running the public install script (pulls main, builds, installs binaries).
    // LOGAN_INSTALL_NO_START=1 so we do not open a second TUI from the installer.
    format!(
        "export LOGAN_INSTALL_NO_START=1 LOGAN_INSTALL_NO_BUILD=0; \
         export PATH=\"$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH\"; \
         curl -fsSL {INSTALL_URL} | bash"
    )
}

fn release_update_cmd() -> String {
    let bin = current_binary();
    format!(
        "\"{}\" update --force-reinstall",
        bin.display()
    )
}

/// Slash `/update`.
pub struct UpdateCommand;

impl SlashCommand for UpdateCommand {
    fn name(&self) -> &str {
        "update"
    }

    fn aliases(&self) -> &[&str] {
        &["upgrade", "self-update"]
    }

    fn description(&self) -> &str {
        "Fetch latest Logan from GitHub (source install) or release channel"
    }

    fn usage(&self) -> &str {
        "/update [source|release|check|status]"
    }

    fn takes_args(&self) -> bool {
        true
    }

    fn arg_placeholder(&self) -> Option<&str> {
        Some("[source|release|check|status]")
    }

    fn suggest_args(&self, _ctx: &AppCtx, _q: &str) -> Option<Vec<ArgItem>> {
        Some(vec![
            ArgItem {
                display: "source".into(),
                match_text: "source".into(),
                insert_text: "source".into(),
                description: "GitHub main via install script (default)".into(),
            },
            ArgItem {
                display: "release".into(),
                match_text: "release".into(),
                insert_text: "release".into(),
                description: "Official release channel (logan update)".into(),
            },
            ArgItem {
                display: "check".into(),
                match_text: "check".into(),
                insert_text: "check".into(),
                description: "Check release channel only".into(),
            },
            ArgItem {
                display: "status".into(),
                match_text: "status".into(),
                insert_text: "status".into(),
                description: "Show last update log tail".into(),
            },
        ])
    }

    fn run(&self, _ctx: &mut CommandExecCtx, args: &str) -> CommandResult {
        let trimmed = args.trim().to_ascii_lowercase();
        match trimmed.as_str() {
            "" | "source" | "repo" | "git" | "main" => {
                spawn_background("source / GitHub main", &source_update_cmd())
            }
            "release" | "channel" | "binary" => {
                spawn_background("release channel", &release_update_cmd())
            }
            "check" | "--check" => run_release_check(),
            "status" | "log" => {
                let log = update_log_path();
                match std::fs::read_to_string(&log) {
                    Ok(s) => {
                        let tail = if s.len() > 4000 {
                            format!("…\n{}", &s[s.len() - 4000..])
                        } else {
                            s
                        };
                        CommandResult::Message(format!(
                            "## Last update log\n\n`{}`\n\n```\n{}\n```",
                            log.display(),
                            tail.trim()
                        ))
                    }
                    Err(_) => CommandResult::Message(format!(
                        "No update log yet at `{}`.\nRun `/update` to start one.",
                        log.display()
                    )),
                }
            }
            "help" | "-h" | "--help" => CommandResult::Message(
                "## /update\n\n\
                 | Arg | Meaning |\n\
                 | --- | --- |\n\
                 | (none) / `source` | Pull **GitHub main** via install script, rebuild, install |\n\
                 | `release` | Run `logan update` (published releases) |\n\
                 | `check` | Check release channel without installing |\n\
                 | `status` | Tail `~/.logan/logs/update.log` |\n\n\
                 Updates run in the **background**. Restart Logan when finished.\n\
                 Skills stay opt-in (catalog may refresh; active skills unchanged)."
                    .into(),
            ),
            other => CommandResult::Error(format!(
                "Unknown `/update` arg `{other}`. Use: source | release | check | status | help"
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata() {
        let cmd = UpdateCommand;
        assert_eq!(cmd.name(), "update");
        assert!(cmd.aliases().contains(&"upgrade"));
        assert!(cmd.takes_args());
    }

    #[test]
    fn source_cmd_uses_install_url() {
        let c = source_update_cmd();
        assert!(c.contains("install-logan.sh"));
        assert!(c.contains("LOGAN_INSTALL_NO_START=1"));
    }
}
