//! Logan native modes + creative routes.
//!
//! Modes: `/caveman`, `/ponytail`, `/think`, `/modes`
//! Profile/learn: `/whoami`, `/improve`
//! Creative: `/site`, `/reel`, `/creative`
//!
//! Modes persist in `~/.logan/modes.toml` and mirror to
//! `~/.logan/rules/logan-modes.md`. `/think` (yuvai-thinking) and `/caveman`
//! are mutually exclusive - deep explain vs terse talk.

use crate::slash::command::{
    AppCtx, ArgItem, CommandExecCtx, CommandResult, SlashCommand,
};
use std::path::{Path, PathBuf};

// ── shared filesystem helpers ─────────────────────────────────────────────

fn logan_home() -> PathBuf {
    if let Ok(v) = std::env::var("LOGAN_HOME") {
        return PathBuf::from(v);
    }
    #[allow(deprecated)]
    std::env::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".logan")
}

fn modes_path() -> PathBuf {
    logan_home().join("modes.toml")
}

fn rules_path() -> PathBuf {
    logan_home().join("rules").join("logan-modes.md")
}

fn memory_dir() -> PathBuf {
    logan_home().join("memory")
}

fn skills_dir() -> PathBuf {
    logan_home().join("skills")
}

/// Optional library of skills the user can install. Never auto-activated.
fn catalog_dir() -> PathBuf {
    if let Ok(v) = std::env::var("LOGAN_SKILL_CATALOG") {
        let p = PathBuf::from(v);
        if !p.as_os_str().is_empty() {
            return p;
        }
    }
    logan_home().join("catalog").join("skills")
}

fn skill_installed(name: &str) -> bool {
    skills_dir().join(name).join("SKILL.md").is_file()
}

fn list_skill_names(dir: &Path) -> Vec<String> {
    let mut names = Vec::new();
    let Ok(rd) = std::fs::read_dir(dir) else {
        return names;
    };
    for ent in rd.flatten() {
        let p = ent.path();
        if p.is_dir() && p.join("SKILL.md").is_file() {
            if let Some(n) = p.file_name().and_then(|s| s.to_str()) {
                names.push(n.to_string());
            }
        }
    }
    names.sort();
    names
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dest)?;
    for ent in std::fs::read_dir(src)? {
        let ent = ent?;
        let from = ent.path();
        let to = dest.join(ent.file_name());
        if from.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

fn add_skill_from_catalog(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name.contains('/') || name.contains("..") {
        return Err("Invalid skill name".into());
    }
    let src = catalog_dir().join(name);
    if !src.join("SKILL.md").is_file() {
        return Err(format!(
            "Skill `{name}` not in catalog at {}.\n\
             Install catalog: re-run install, or set LOGAN_SKILL_CATALOG, or copy skills into ~/.logan/catalog/skills/\n\
             List catalog: `/skills catalog`",
            catalog_dir().display()
        ));
    }
    let dest = skills_dir().join(name);
    if dest.exists() {
        // Refresh in place
        let _ = std::fs::remove_dir_all(&dest);
    }
    copy_dir_recursive(&src, &dest).map_err(|e| e.to_string())?;
    Ok(format!(
        "Installed skill `{name}` → {}\nEnable related mode if needed: `/think` `/caveman` `/ponytail` or invoke the skill by name.",
        dest.display()
    ))
}

fn remove_skill(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() || name.contains('/') || name.contains("..") {
        return Err("Invalid skill name".into());
    }
    let dest = skills_dir().join(name);
    if !dest.exists() {
        return Err(format!("Skill `{name}` is not installed under {}", skills_dir().display()));
    }
    std::fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    // If a mode depended on this skill, turn it off.
    let mut state = load_modes();
    let mut flipped = Vec::new();
    if name == "caveman" && state.caveman != Intensity::Off {
        state.caveman = Intensity::Off;
        flipped.push("caveman");
    }
    if name == "ponytail" && state.ponytail != Intensity::Off {
        state.ponytail = Intensity::Off;
        flipped.push("ponytail");
    }
    if name == "yuvai-thinking" && state.think != Intensity::Off {
        state.think = Intensity::Off;
        flipped.push("think");
    }
    if !flipped.is_empty() {
        let _ = save_modes(&state);
    }
    let extra = if flipped.is_empty() {
        String::new()
    } else {
        format!(" Also turned off modes: {}.", flipped.join(", "))
    };
    Ok(format!("Removed skill `{name}`.{extra}"))
}

fn ensure_skill_or_hint(name: &str) -> Result<(), String> {
    if skill_installed(name) {
        return Ok(());
    }
    Err(format!(
        "Skill `{name}` is not installed (Logan starts with an empty skill set).\n\
         Add it: `/skills add {name}`\n\
         Or pack: `/skills add pack creative` · `/skills add pack modes`\n\
         Catalog: `/skills catalog`"
    ))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Intensity {
    Off,
    Lite,
    Full,
    Ultra,
}

impl Intensity {
    fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "off" | "0" | "false" | "disable" | "disabled" | "stop" | "normal" => {
                Some(Self::Off)
            }
            "on" | "true" | "enable" | "enabled" => Some(Self::Full),
            "lite" | "light" => Some(Self::Lite),
            "full" | "default" => Some(Self::Full),
            "ultra" | "max" => Some(Self::Ultra),
            "" => None,
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::Lite => "lite",
            Self::Full => "full",
            Self::Ultra => "ultra",
        }
    }
}

#[derive(Debug, Clone)]
struct ModesState {
    caveman: Intensity,
    ponytail: Intensity,
    /// yuvai-thinking deep explain mode. Exclusive with caveman.
    think: Intensity,
}

impl Default for ModesState {
    fn default() -> Self {
        Self {
            caveman: Intensity::Off,
            ponytail: Intensity::Off,
            think: Intensity::Off,
        }
    }
}

fn load_modes() -> ModesState {
    let path = modes_path();
    let Ok(text) = std::fs::read_to_string(&path) else {
        return ModesState::default();
    };
    let mut state = ModesState::default();
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('#') || line.is_empty() || line.starts_with('[') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            let k = k.trim();
            let v = v.trim().trim_matches('"').trim_matches('\'');
            if let Some(i) = Intensity::parse(v) {
                match k {
                    "caveman" => state.caveman = i,
                    "ponytail" => state.ponytail = i,
                    "think" | "yuvai_thinking" | "yuvai-thinking" => state.think = i,
                    _ => {}
                }
            }
        }
    }
    state
}

fn save_modes(state: &ModesState) -> Result<(), String> {
    let home = logan_home();
    std::fs::create_dir_all(home.join("rules")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(home.join("memory")).map_err(|e| e.to_string())?;
    let toml = format!(
        r#"# Logan communication / coding modes
# Author: Yuval Avidani (YUV.AI)
# Toggle: /caveman /ponytail /think /modes
# Note: caveman and think are mutually exclusive (terse vs deep explain).

[modes]
caveman = "{}"
ponytail = "{}"
think = "{}"
"#,
        state.caveman.as_str(),
        state.ponytail.as_str(),
        state.think.as_str()
    );
    std::fs::write(modes_path(), toml).map_err(|e| e.to_string())?;
    write_rules_mirror(state)?;
    Ok(())
}

fn write_rules_mirror(state: &ModesState) -> Result<(), String> {
    let mut body = String::from(
        r#"# Logan active modes (auto-generated)

Do not edit by hand - use `/caveman`, `/ponytail`, `/think`, or `/modes`.
Generated for every session as a global rule under `~/.logan/rules/`.

"#,
    );
    match state.caveman {
        Intensity::Off => {
            body.push_str("## Caveman: OFF\nSpeak normally unless think mode is on.\n\n")
        }
        level => {
            body.push_str(&format!(
                "## Caveman: ON ({})\n\nFollow the **caveman** skill at intensity **{}**.\n\
                 Terse smart-caveman prose. Code and errors stay exact. No filler.\n\
                 Skill path: `~/.logan/skills/caveman/SKILL.md`\n\n",
                level.as_str(),
                level.as_str()
            ));
        }
    }
    match state.ponytail {
        Intensity::Off => body.push_str(
            "## Ponytail: OFF\nNormal engineering judgment (still avoid pointless bloat).\n\n",
        ),
        level => {
            body.push_str(&format!(
                "## Ponytail: ON ({})\n\nFollow the **ponytail** skill at intensity **{}**.\n\
                 YAGNI ladder. Shortest working diff. Stdlib/native first.\n\
                 Skill path: `~/.logan/skills/ponytail/SKILL.md`\n\n",
                level.as_str(),
                level.as_str()
            ));
        }
    }
    match state.think {
        Intensity::Off => body.push_str(
            "## Think (yuvai-thinking): OFF\nNormal explanations - not the full crumb cascade.\n\n",
        ),
        level => {
            body.push_str(&format!(
                "## Think (yuvai-thinking): ON ({})\n\n\
                 Follow **yuvai-thinking** skill: every crumb, always the why, intuition before formula,\n\
                 zero forward-references, zero assumed knowledge, real examples under the hood.\n\
                 Skill path: `~/.logan/skills/yuvai-thinking/SKILL.md`\n\
                 When think is on, prefer completeness of understanding over brevity.\n\n",
                level.as_str()
            ));
        }
    }
    // Only mention optional skills when the user has installed them.
    let installed = list_skill_names(&skills_dir());
    if installed.is_empty() {
        body.push_str(
            "## Skills\n\
             No user skills installed (default empty). User can add with `/skills add <name>` \
             or `/skills add pack creative`.\n\n",
        );
    } else {
        body.push_str("## Installed skills (user chose these)\n");
        for n in &installed {
            body.push_str(&format!("- `{n}`\n"));
        }
        body.push('\n');
        if installed.iter().any(|s| s.contains("hyperframes") || s == "video-edit") {
            body.push_str(
                "When video/motion work is requested and HyperFrames skills are installed, prefer them.\n\n",
            );
        }
    }
    body.push_str(
        "## Notes\n\
         - Modes above are sticky only while ON. Off = normal Logan behavior.\n\
         - User owns `~/.logan/skills/` - add/remove anytime via `/skills`.\n\
         - Profile/memory files are optional (`/whoami`, `/improve`).\n",
    );
    std::fs::write(rules_path(), body).map_err(|e| e.to_string())
}

fn read_file_capped(path: &Path, max: usize) -> String {
    match std::fs::read_to_string(path) {
        Ok(s) if s.len() <= max => s,
        Ok(s) => {
            let start = s.len().saturating_sub(max);
            format!("…(truncated)…\n{}", &s[start..])
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => "(missing)\n".into(),
        Err(e) => format!("(error reading {}: {e})\n", path.display()),
    }
}

fn mode_levels_suggestions() -> Vec<ArgItem> {
    ["off", "lite", "full", "ultra"]
        .into_iter()
        .map(|s| ArgItem {
            display: s.into(),
            match_text: s.into(),
            insert_text: s.into(),
            description: format!("Set intensity to {s}"),
        })
        .collect()
}

fn set_mode(which: &str, args: &str) -> CommandResult {
    let mut state = load_modes();
    let trimmed = args.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("status") {
        return CommandResult::Message(format!(
            "Modes · caveman={} · ponytail={} · think={}\n\
             Toggle: /{which} off|lite|full|ultra\n\
             All: /modes · Creative: /creative · /site · /reel\n\
             Persist: {} + {}",
            state.caveman.as_str(),
            state.ponytail.as_str(),
            state.think.as_str(),
            modes_path().display(),
            rules_path().display(),
        ));
    }
    let Some(level) = Intensity::parse(trimmed) else {
        return CommandResult::Error(format!(
            "Unknown level `{trimmed}`. Use: off | lite | full | ultra"
        ));
    };
    let mut note = String::new();
    // Require the backing skill to be installed before enabling a mode.
    if level != Intensity::Off {
        let need = match which {
            "caveman" => "caveman",
            "ponytail" => "ponytail",
            "think" => "yuvai-thinking",
            _ => "",
        };
        if !need.is_empty() {
            if let Err(e) = ensure_skill_or_hint(need) {
                return CommandResult::Error(e);
            }
        }
    }
    match which {
        "caveman" => {
            state.caveman = level;
            // Exclusive with think: deep explain vs terse talk.
            if level != Intensity::Off && state.think != Intensity::Off {
                state.think = Intensity::Off;
                note.push_str(" (think turned off - exclusive with caveman)");
            }
        }
        "ponytail" => state.ponytail = level,
        "think" => {
            state.think = level;
            if level != Intensity::Off && state.caveman != Intensity::Off {
                state.caveman = Intensity::Off;
                note.push_str(" (caveman turned off - exclusive with think)");
            }
        }
        _ => return CommandResult::Error("internal: unknown mode".into()),
    }
    if let Err(e) = save_modes(&state) {
        return CommandResult::Error(format!("Failed to save modes: {e}"));
    }
    let skill_name = if which == "think" {
        "yuvai-thinking"
    } else {
        which
    };
    let skill_hint = if level == Intensity::Off {
        format!(
            "{which} off for new turns (rules updated).{note}"
        )
    } else {
        format!(
            "{which} → **{}**{note}. Sticky rule written.\n\
             Skill: ~/.logan/skills/{skill_name}/SKILL.md\n\
             New sessions load automatically. This session: obey intensity now.",
            level.as_str()
        )
    };
    CommandResult::Message(skill_hint)
}

// ── /caveman ──────────────────────────────────────────────────────────────

pub struct CavemanCommand;

impl SlashCommand for CavemanCommand {
    fn name(&self) -> &str {
        "caveman"
    }
    fn aliases(&self) -> &[&str] {
        &["terse", "brief"]
    }
    fn description(&self) -> &str {
        "Token-saving talk mode (caveman) - off|lite|full|ultra"
    }
    fn usage(&self) -> &str {
        "/caveman [off|lite|full|ultra]"
    }
    fn takes_args(&self) -> bool {
        true
    }
    fn arg_placeholder(&self) -> Option<&str> {
        Some("[off|lite|full|ultra]")
    }
    fn suggest_args(&self, _ctx: &AppCtx, _q: &str) -> Option<Vec<ArgItem>> {
        Some(mode_levels_suggestions())
    }
    fn run(&self, _ctx: &mut CommandExecCtx, args: &str) -> CommandResult {
        set_mode("caveman", args)
    }
}

// ── /ponytail ─────────────────────────────────────────────────────────────

pub struct PonytailCommand;

impl SlashCommand for PonytailCommand {
    fn name(&self) -> &str {
        "ponytail"
    }
    fn aliases(&self) -> &[&str] {
        &["yagni", "lazy"]
    }
    fn description(&self) -> &str {
        "Minimal-code mode (ponytail YAGNI) - off|lite|full|ultra"
    }
    fn usage(&self) -> &str {
        "/ponytail [off|lite|full|ultra]"
    }
    fn takes_args(&self) -> bool {
        true
    }
    fn arg_placeholder(&self) -> Option<&str> {
        Some("[off|lite|full|ultra]")
    }
    fn suggest_args(&self, _ctx: &AppCtx, _q: &str) -> Option<Vec<ArgItem>> {
        Some(mode_levels_suggestions())
    }
    fn run(&self, _ctx: &mut CommandExecCtx, args: &str) -> CommandResult {
        set_mode("ponytail", args)
    }
}

// ── /think ────────────────────────────────────────────────────────────────

pub struct ThinkCommand;

impl SlashCommand for ThinkCommand {
    fn name(&self) -> &str {
        "think"
    }
    fn aliases(&self) -> &[&str] {
        &["yuvai-thinking", "explain-mode", "teach"]
    }
    fn description(&self) -> &str {
        "Deep explain mode (yuvai-thinking) - exclusive with caveman"
    }
    fn usage(&self) -> &str {
        "/think [off|lite|full|ultra]"
    }
    fn takes_args(&self) -> bool {
        true
    }
    fn arg_placeholder(&self) -> Option<&str> {
        Some("[off|lite|full|ultra]")
    }
    fn suggest_args(&self, _ctx: &AppCtx, _q: &str) -> Option<Vec<ArgItem>> {
        Some(mode_levels_suggestions())
    }
    fn run(&self, _ctx: &mut CommandExecCtx, args: &str) -> CommandResult {
        set_mode("think", args)
    }
}

// ── /modes ────────────────────────────────────────────────────────────────

pub struct ModesCommand;

impl SlashCommand for ModesCommand {
    fn name(&self) -> &str {
        "modes"
    }
    fn description(&self) -> &str {
        "Show caveman + ponytail + think mode status"
    }
    fn usage(&self) -> &str {
        "/modes"
    }
    fn run(&self, _ctx: &mut CommandExecCtx, _args: &str) -> CommandResult {
        let state = load_modes();
        CommandResult::Message(format!(
            "## Logan modes\n\n\
             | Mode | Level | Skill |\n\
             | --- | --- | --- |\n\
             | caveman | `{}` | talk less (tokens) |\n\
             | ponytail | `{}` | build less (YAGNI) |\n\
             | think | `{}` | yuvai-thinking deep explain |\n\n\
             Exclusive: `/think` ↔ `/caveman` (deep vs terse).\n\
             Toggle: `/caveman …` · `/ponytail …` · `/think …`\n\
             Creative: `/creative` · `/site <video>` · `/reel <video>`\n\
             Profile: `/whoami` · Learn: `/improve`\n\
             State: `{}`\n\
             Rules: `{}`\n",
            state.caveman.as_str(),
            state.ponytail.as_str(),
            state.think.as_str(),
            modes_path().display(),
            rules_path().display(),
        ))
    }
}

// ── /creative ─────────────────────────────────────────────────────────────

pub struct CreativeCommand;

impl SlashCommand for CreativeCommand {
    fn name(&self) -> &str {
        "creative"
    }
    fn aliases(&self) -> &[&str] {
        &["stack", "yuv-stack"]
    }
    fn description(&self) -> &str {
        "YUV.AI creative stack map - HyperFrames, scrub landings, reels"
    }
    fn usage(&self) -> &str {
        "/creative"
    }
    fn run(&self, _ctx: &mut CommandExecCtx, _args: &str) -> CommandResult {
        let installed = list_skill_names(&skills_dir());
        let catalog = list_skill_names(&catalog_dir());
        let inst = if installed.is_empty() {
            "(none - empty by default)".into()
        } else {
            installed.join(", ")
        };
        let cat = if catalog.is_empty() {
            "(catalog empty - re-run install to populate ~/.logan/catalog/skills)".into()
        } else {
            catalog.join(", ")
        };
        CommandResult::Message(format!(
            "## Logan creative stack (opt-in)\n\n\
             **Nothing is forced.** Skills start empty. You add what you want.\n\n\
             | Intent | Command | Skill to install |\n\
             | --- | --- | --- |\n\
             | Mouse-scrub landing | `/site mouse video.mp4` | `cinematic-scrub-landing` |\n\
             | Scroll-scrub parallax | `/site parallax video.mp4` | `parallax-landing-page` |\n\
             | Apple sticky scroll | `/site scroll video.mp4` | `video-to-landing-page` |\n\
             | Captioned reel | `/reel video.mp4` | `video-edit` |\n\
             | HyperFrames engine | ask in chat | `hyperframes-master` |\n\
             | Brand multi-output | ask in chat | `yuv-pilot` |\n\
             | Deep teach | `/think full` | `yuvai-thinking` |\n\n\
             **Installed:** {inst}\n\
             **Catalog (available):** {cat}\n\n\
             ```text\n\
             /skills add pack creative   # install creative pack\n\
             /skills add yuvai-thinking  # install one skill\n\
             /skills remove video-edit   # remove one\n\
             /skills                     # list\n\
             ```\n\
             Docs: docs/CREATIVE.md · docs/MODES.md\n"
        ))
    }
}

/// Shared by `/skills <args>` (see `plugin::SkillsCommand`).
pub fn run_skills_manage(trimmed: &str) -> CommandResult {
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("list") {
        let installed = list_skill_names(&skills_dir());
        let body = if installed.is_empty() {
            "(empty - Logan does not pre-install skills)\n\
             Add: `/skills add pack creative` or `/skills add yuvai-thinking`"
                .into()
        } else {
            installed
                .iter()
                .map(|n| format!("- `{n}`"))
                .collect::<Vec<_>>()
                .join("\n")
        };
        return CommandResult::Message(format!(
            "## Installed skills\n\n{body}\n\n\
             Dir: `{}`\n\
             Catalog: `/skills catalog` · Add: `/skills add <name>` · Remove: `/skills remove <name>`\n\
             Bare `/skills` opens the skills modal.",
            skills_dir().display()
        ));
    }
    if trimmed.eq_ignore_ascii_case("catalog") {
        let catalog = list_skill_names(&catalog_dir());
        let body = if catalog.is_empty() {
            format!(
                "(no catalog at `{}`)\n\
                 Fix: re-run install-logan.sh (copies repo skills into **catalog only**), \
                 or set LOGAN_SKILL_CATALOG, or copy skills there yourself.",
                catalog_dir().display()
            )
        } else {
            catalog
                .iter()
                .map(|n| {
                    let mark = if skill_installed(n) {
                        " ✓ installed"
                    } else {
                        ""
                    };
                    format!("- `{n}`{mark}")
                })
                .collect::<Vec<_>>()
                .join("\n")
        };
        return CommandResult::Message(format!(
            "## Skill catalog (opt-in library)\n\n{body}\n\n\
             Install one: `/skills add <name>`\n\
             Packs: `/skills add pack creative` · `modes` · `all`\n\
             Nothing is active until you add it and enable modes if needed."
        ));
    }
    if let Some(rest) = trimmed.strip_prefix("add ") {
        let rest = rest.trim();
        if let Some(pack) = rest.strip_prefix("pack ") {
            return add_pack(pack.trim());
        }
        return match add_skill_from_catalog(rest) {
            Ok(m) => CommandResult::Message(m),
            Err(e) => CommandResult::Error(e),
        };
    }
    if let Some(name) = trimmed
        .strip_prefix("remove ")
        .or_else(|| trimmed.strip_prefix("rm "))
    {
        return match remove_skill(name.trim()) {
            Ok(m) => CommandResult::Message(m),
            Err(e) => CommandResult::Error(e),
        };
    }
    CommandResult::Error(
        "Usage: /skills [list|catalog|add <name>|add pack <creative|modes|all>|remove <name>]\n\
         Bare `/skills` opens the UI modal."
            .into(),
    )
}

fn add_pack(pack: &str) -> CommandResult {
    let names: &[&str] = match pack.to_ascii_lowercase().as_str() {
        "creative" | "video" | "scrub" | "design" => &[
            "yuv-design-dna",
            "hyperframes-master",
            "cinematic-scrub-landing",
            "parallax-landing-page",
            "video-to-landing-page",
            "video-edit",
            "yuv-pilot",
        ],
        "modes" | "style" => &["caveman", "ponytail", "yuvai-thinking", "whoami", "self-improve"],
        "all" => {
            let all = list_skill_names(&catalog_dir());
            if all.is_empty() {
                return CommandResult::Error(format!(
                    "Catalog empty at {}. Cannot add pack all.",
                    catalog_dir().display()
                ));
            }
            let mut ok = Vec::new();
            let mut err = Vec::new();
            for n in &all {
                match add_skill_from_catalog(n) {
                    Ok(_) => ok.push(n.clone()),
                    Err(e) => err.push(format!("{n}: {e}")),
                }
            }
            return CommandResult::Message(format!(
                "Pack `all`: installed {} skill(s): {}\n{}",
                ok.len(),
                ok.join(", "),
                if err.is_empty() {
                    String::new()
                } else {
                    format!("Errors:\n{}", err.join("\n"))
                }
            ));
        }
        _ => {
            return CommandResult::Error(
                "Unknown pack. Use: creative | modes | all".into(),
            );
        }
    };
    let mut ok = Vec::new();
    let mut err = Vec::new();
    for n in names {
        match add_skill_from_catalog(n) {
            Ok(_) => ok.push((*n).to_string()),
            Err(e) => err.push(format!("{n}: {e}")),
        }
    }
    CommandResult::Message(format!(
        "Pack `{pack}`: installed {} → {}\n{}",
        ok.len(),
        if ok.is_empty() {
            "(none)".into()
        } else {
            ok.join(", ")
        },
        if err.is_empty() {
            "Modes stay off until you enable them (`/think full`, `/caveman full`, …).".into()
        } else {
            format!("Notes/errors:\n{}", err.join("\n"))
        }
    ))
}

// ── /site ─────────────────────────────────────────────────────────────────

pub struct SiteCommand;

impl SlashCommand for SiteCommand {
    fn name(&self) -> &str {
        "site"
    }
    fn aliases(&self) -> &[&str] {
        &["landing", "scrub"]
    }
    fn description(&self) -> &str {
        "Build cinematic landing from video (scrub / parallax / scroll)"
    }
    fn usage(&self) -> &str {
        "/site [mouse|parallax|scroll] <video-path> [brand notes…]"
    }
    fn takes_args(&self) -> bool {
        true
    }
    fn session_scoped(&self) -> bool {
        true
    }
    fn arg_placeholder(&self) -> Option<&str> {
        Some("[mouse|parallax|scroll] <video> [notes]")
    }
    fn suggest_args(&self, _ctx: &AppCtx, _q: &str) -> Option<Vec<ArgItem>> {
        Some(vec![
            ArgItem {
                display: "mouse".into(),
                match_text: "mouse".into(),
                insert_text: "mouse ".into(),
                description: "cinematic-scrub-landing (cursor scrubs video)".into(),
            },
            ArgItem {
                display: "parallax".into(),
                match_text: "parallax".into(),
                insert_text: "parallax ".into(),
                description: "parallax-landing-page (scroll scrubs frames)".into(),
            },
            ArgItem {
                display: "scroll".into(),
                match_text: "scroll".into(),
                insert_text: "scroll ".into(),
                description: "video-to-landing-page (Apple sticky scroll)".into(),
            },
        ])
    }
    fn run(&self, _ctx: &mut CommandExecCtx, args: &str) -> CommandResult {
        let trimmed = args.trim();
        if trimmed.is_empty() {
            return CommandResult::Error(
                "Usage: /site [mouse|parallax|scroll] <path-to-video> [brand notes]\n\
                 Defaults to mouse (cinematic-scrub) if style omitted."
                    .into(),
            );
        }
        let (style, rest) = {
            let mut parts = trimmed.splitn(2, char::is_whitespace);
            let first = parts.next().unwrap_or("");
            let rest = parts.next().unwrap_or("").trim();
            match first.to_ascii_lowercase().as_str() {
                "mouse" | "cinematic" | "scrub" => ("mouse", rest),
                "parallax" | "parasites" => ("parallax", rest),
                "scroll" | "apple" | "sticky" => ("scroll", rest),
                _ => ("mouse", trimmed), // first token is path
            }
        };
        if rest.is_empty() {
            return CommandResult::Error(
                "Provide a video path after the style (or as the only arg).".into(),
            );
        }
        let (skill, label) = match style {
            "parallax" => (
                "parallax-landing-page",
                "scroll-scrub single-viewport parallax landing",
            ),
            "scroll" => (
                "video-to-landing-page",
                "Apple-style sticky scroll-frame landing",
            ),
            _ => (
                "cinematic-scrub-landing",
                "mouse-scrub cinematic landing (golden template)",
            ),
        };
        if let Err(e) = ensure_skill_or_hint(skill) {
            return CommandResult::Error(e);
        }
        CommandResult::PassThrough(format!(
            "Use the Logan skill **{skill}** now ({label}).\n\
             Source video / args: {rest}\n\
             Follow that skill's workflow end-to-end (hard rules, save paths, verification).\n\
             Prefer PROFILE.md stack defaults only if the user filled them in.\n\
             Save under ~/Documents/yuv-projects/landings/<slug>/ unless the user overrode.\n\
             When done, print the output path and how to open it."
        ))
    }
}

// ── /reel ─────────────────────────────────────────────────────────────────

pub struct ReelCommand;

impl SlashCommand for ReelCommand {
    fn name(&self) -> &str {
        "reel"
    }
    fn aliases(&self) -> &[&str] {
        &["caption", "video-edit"]
    }
    fn description(&self) -> &str {
        "Captioned showcase / reel via video-edit + HyperFrames"
    }
    fn usage(&self) -> &str {
        "/reel <video-path> [notes…]"
    }
    fn takes_args(&self) -> bool {
        true
    }
    fn session_scoped(&self) -> bool {
        true
    }
    fn arg_placeholder(&self) -> Option<&str> {
        Some("<video-path> [notes]")
    }
    fn run(&self, _ctx: &mut CommandExecCtx, args: &str) -> CommandResult {
        let trimmed = args.trim();
        if trimmed.is_empty() {
            return CommandResult::Error(
                "Usage: /reel <path-to-video> [notes]\n\
                 Requires skill `video-edit` (add: `/skills add video-edit` or `/skills add pack creative`)."
                    .into(),
            );
        }
        if let Err(e) = ensure_skill_or_hint("video-edit") {
            return CommandResult::Error(e);
        }
        CommandResult::PassThrough(format!(
            "Use the Logan skill **video-edit** now (captioned HyperFrames showcase).\n\
             Source: {trimmed}\n\
             Follow the full pipeline: transcribe → pause for transcript_review → liquid-glass captions →\n\
             render both 16:9 and 9:16. Hebrew+English as needed. Use HyperFrames skills for render.\n\
             Save under ~/Documents/yuv-projects/videos/<slug>/.\n\
             Do not skip the human transcript approval step."
        ))
    }
}

// ── /whoami ───────────────────────────────────────────────────────────────

pub struct WhoamiCommand;

impl SlashCommand for WhoamiCommand {
    fn name(&self) -> &str {
        "whoami"
    }
    fn aliases(&self) -> &[&str] {
        &["profile", "identity"]
    }
    fn description(&self) -> &str {
        "Show / update your identity profile (socials, stack, taste)"
    }
    fn usage(&self) -> &str {
        "/whoami [grill|update <note>|show]"
    }
    fn takes_args(&self) -> bool {
        true
    }
    fn session_scoped(&self) -> bool {
        true
    }
    fn arg_placeholder(&self) -> Option<&str> {
        Some("[grill|update <note>|show]")
    }
    fn suggest_args(&self, _ctx: &AppCtx, _q: &str) -> Option<Vec<ArgItem>> {
        Some(vec![
            ArgItem {
                display: "show".into(),
                match_text: "show".into(),
                insert_text: "show".into(),
                description: "Show PROFILE.md + preferences".into(),
            },
            ArgItem {
                display: "grill".into(),
                match_text: "grill".into(),
                insert_text: "grill".into(),
                description: "Interview for identity + stack".into(),
            },
            ArgItem {
                display: "update".into(),
                match_text: "update".into(),
                insert_text: "update ".into(),
                description: "Append a fact to PROFILE".into(),
            },
        ])
    }
    fn run(&self, _ctx: &mut CommandExecCtx, args: &str) -> CommandResult {
        let mem = memory_dir();
        let _ = std::fs::create_dir_all(&mem);
        let profile = mem.join("PROFILE.md");
        let memory = mem.join("MEMORY.md");
        let trimmed = args.trim();

        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("show") {
            let p = read_file_capped(&profile, 6000);
            let m = read_file_capped(&memory, 4000);
            return CommandResult::Message(format!(
                "## Whoami\n\n### PROFILE.md\n```markdown\n{p}\n```\n\n\
                 ### MEMORY.md (head)\n```markdown\n{m}\n```\n\n\
                 Update: `/whoami grill` · `/whoami update I prefer Next.js` · `/remember …`\n\
                 Paths: `{}` · `{}`",
                profile.display(),
                memory.display()
            ));
        }

        if let Some(rest) = trimmed
            .strip_prefix("update ")
            .or_else(|| trimmed.strip_prefix("update\t"))
        {
            let note = rest.trim();
            if note.is_empty() {
                return CommandResult::Error("Usage: /whoami update <fact>".into());
            }
            let ts = chrono_lite_now();
            let block = format!("\n- ({ts}) {note}\n");
            if !profile.exists() {
                let seed = format!(
                    "# PROFILE\n\n## Identity\n\n## Links\n\n## Tech stack defaults\n\n## Taste\n\n## Ongoing notes\n"
                );
                if let Err(e) = std::fs::write(&profile, seed) {
                    return CommandResult::Error(e.to_string());
                }
            }
            if let Err(e) = append_file(&profile, &block) {
                return CommandResult::Error(e.to_string());
            }
            return CommandResult::Message(format!(
                "Saved to PROFILE.md:\n- {note}\n\nShow: `/whoami`"
            ));
        }

        if trimmed.eq_ignore_ascii_case("grill") {
            // Send a structured prompt so the model runs the whoami skill interview.
            return CommandResult::PassThrough(
                "Run the Logan **whoami** skill interview now (skill: whoami / PROFILE.md). \
                 Grill me in clusters (identity → social links → tech stack defaults including HyperFrames → taste). \
                 One cluster at a time. After each cluster, propose the markdown you will save and ask me to confirm. \
                 Persist to ~/.logan/memory/PROFILE.md and summarize into MEMORY.md ## Preferences. \
                 If PROFILE already has content, show it first and only ask what is missing or outdated."
                    .into(),
            );
        }

        CommandResult::Error(format!(
            "Unknown whoami arg `{trimmed}`. Use: show | grill | update <note>"
        ))
    }
}

// ── /improve ──────────────────────────────────────────────────────────────

pub struct ImproveCommand;

impl SlashCommand for ImproveCommand {
    fn name(&self) -> &str {
        "improve"
    }
    fn aliases(&self) -> &[&str] {
        &["heal", "reflections", "lessons"]
    }
    fn description(&self) -> &str {
        "Self-heal / self-improve visibility - what changed and why"
    }
    fn usage(&self) -> &str {
        "/improve [why|log|open]"
    }
    fn takes_args(&self) -> bool {
        true
    }
    fn session_scoped(&self) -> bool {
        true
    }
    fn arg_placeholder(&self) -> Option<&str> {
        Some("[why|log|open]")
    }
    fn suggest_args(&self, _ctx: &AppCtx, _q: &str) -> Option<Vec<ArgItem>> {
        Some(vec![
            ArgItem {
                display: "why".into(),
                match_text: "why".into(),
                insert_text: "why".into(),
                description: "Explain last decision path".into(),
            },
            ArgItem {
                display: "log".into(),
                match_text: "log".into(),
                insert_text: "log".into(),
                description: "Show reflections + IMPROVEMENTS".into(),
            },
            ArgItem {
                display: "open".into(),
                match_text: "open".into(),
                insert_text: "open".into(),
                description: "Dashboard + next improve actions".into(),
            },
        ])
    }
    fn run(&self, _ctx: &mut CommandExecCtx, args: &str) -> CommandResult {
        let mem = memory_dir();
        let reflections = mem.join("reflections.log");
        let improvements = mem.join("IMPROVEMENTS.md");
        let memory = mem.join("MEMORY.md");
        let modes = load_modes();
        let trimmed = args.trim();

        if trimmed.eq_ignore_ascii_case("why") {
            return CommandResult::PassThrough(
                "Using the **self-improve** skill: explain your last non-trivial decision in this session. \
                 Structure: (1) goal/constraint (2) options considered (3) evidence (4) choice + risk \
                 (5) what would change the decision. Cite files/errors/memory if any. \
                 If nothing non-trivial yet, say so and summarize current plan."
                    .into(),
            );
        }

        if trimmed.eq_ignore_ascii_case("log")
            || trimmed.eq_ignore_ascii_case("reflections")
            || trimmed.is_empty()
            || trimmed.eq_ignore_ascii_case("open")
        {
            let rlog = read_file_capped(&reflections, 3500);
            let impr = read_file_capped(&improvements, 5000);
            let mem_tail = read_file_capped(&memory, 3000);
            return CommandResult::Message(format!(
                "## Improve / heal dashboard\n\n\
                 **Modes:** caveman=`{}` ponytail=`{}` think=`{}`\n\n\
                 ### reflections.log (tail)\n```\n{rlog}\n```\n\n\
                 ### IMPROVEMENTS.md\n```markdown\n{impr}\n```\n\n\
                 ### MEMORY.md (tail)\n```markdown\n{mem_tail}\n```\n\n\
                 Steer: `/improve why` · `/whoami` · `/think full` · `/flush`\n\
                 Files: `{}` · `{}`",
                modes.caveman.as_str(),
                modes.ponytail.as_str(),
                modes.think.as_str(),
                reflections.display(),
                improvements.display(),
            ));
        }

        CommandResult::Error(format!(
            "Unknown improve arg `{trimmed}`. Use: (none)|log|why|open"
        ))
    }
}

fn append_file(path: &Path, block: &str) -> std::io::Result<()> {
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    f.write_all(block.as_bytes())
}

fn chrono_lite_now() -> String {
    // Avoid extra deps: local ISO-ish via SystemTime.
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("unix:{secs}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intensity_parse() {
        assert_eq!(Intensity::parse("ultra"), Some(Intensity::Ultra));
        assert_eq!(Intensity::parse("OFF"), Some(Intensity::Off));
        assert_eq!(Intensity::parse("nope"), None);
    }

    #[test]
    #[serial_test::serial]
    fn save_load_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        // SAFETY: serial test + unique LOGAN_HOME.
        unsafe {
            std::env::set_var("LOGAN_HOME", dir.path());
        }
        let mut s = ModesState::default();
        s.caveman = Intensity::Full;
        s.ponytail = Intensity::Lite;
        s.think = Intensity::Off;
        save_modes(&s).unwrap();
        let loaded = load_modes();
        assert_eq!(loaded.caveman, Intensity::Full);
        assert_eq!(loaded.ponytail, Intensity::Lite);
        assert_eq!(loaded.think, Intensity::Off);
        assert!(rules_path().exists());
        unsafe {
            std::env::remove_var("LOGAN_HOME");
        }
    }
}
