//! Pre-sample model routing for token savings (`--route auto` / config).
//!
//! Pure classifier: maps a user prompt (and optional hints) to a model tier
//! id that should exist in the user's catalog (`tier-fast`, `tier-default`,
//! `tier-premium`, `tier-local`, or a concrete model slug).
//!
//! Author: Yuval Avidani (YUV.AI)

/// Routing modes accepted by the CLI / config.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RouteMode {
    /// Heuristic classifier picks a tier.
    Auto,
    /// Force a named tier or model id (no classify).
    Force(String),
}

impl RouteMode {
    /// Parse `auto` or a concrete model/tier id.
    pub fn parse(s: &str) -> Self {
        let t = s.trim();
        if t.eq_ignore_ascii_case("auto") {
            Self::Auto
        } else {
            Self::Force(t.to_string())
        }
    }
}

/// Default tier names used by `examples/config/auto-routing.toml`.
pub const TIER_FAST: &str = "tier-fast";
pub const TIER_DEFAULT: &str = "tier-default";
pub const TIER_PREMIUM: &str = "tier-premium";
pub const TIER_LOCAL: &str = "tier-local";

/// Result of routing: model id + human reason (for logs / UI).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RouteDecision {
    pub model_id: String,
    pub reason: String,
    pub tier: &'static str,
}

/// Classify a prompt into a tier. Conservative: prefers default unless clear
/// signals for fast or premium. Offline/privacy keywords → local.
pub fn classify_route(prompt: &str) -> RouteDecision {
    let p = prompt.to_ascii_lowercase();
    let len = prompt.chars().count();

    // Local / privacy first
    if contains_any(
        &p,
        &[
            "offline",
            "airgapped",
            "air-gapped",
            "no network",
            "local only",
            "private code",
            "on-prem",
            "on prem",
        ],
    ) {
        return RouteDecision {
            model_id: TIER_LOCAL.to_string(),
            reason: "privacy/offline keywords".into(),
            tier: "local",
        };
    }

    // Premium: architecture, security, multi-package, production incidents
    if contains_any(
        &p,
        &[
            "architecture",
            "redesign",
            "migrate the entire",
            "security audit",
            "cve",
            "production incident",
            "outage",
            "multi-package",
            "multi package",
            "cross-repo",
            "distributed system",
            "race condition",
            "deadlock",
            "formal verification",
        ],
    ) || (len > 1200
        && contains_any(
            &p,
            &["refactor", "rewrite", "migrate", "redesign", "overhaul"],
        ))
    {
        return RouteDecision {
            model_id: TIER_PREMIUM.to_string(),
            reason: "hard/architecture/security signals or long complex ask".into(),
            tier: "premium",
        };
    }

    // Fast: Q&A, explain, summarize, tiny edits, search-only
    let fast_kw = contains_any(
        &p,
        &[
            "what does",
            "what is",
            "explain",
            "summarize",
            "summary",
            "where is",
            "which file",
            "list the",
            "show me",
            "how many",
            "typo",
            "rename variable",
            "one line",
            "quick question",
            "tl;dr",
            "tldr",
        ],
    );
    let tiny = len < 180;
    if fast_kw || (tiny && !contains_any(&p, &["implement", "add feature", "fix bug", "write"]))
    {
        return RouteDecision {
            model_id: TIER_FAST.to_string(),
            reason: "short Q&A / explain / tiny edit signals".into(),
            tier: "fast",
        };
    }

    RouteDecision {
        model_id: TIER_DEFAULT.to_string(),
        reason: "standard implementation / default tier".into(),
        tier: "default",
    }
}

/// Resolve a route mode against an optional prompt. `Force` ignores the
/// prompt. `Auto` requires a prompt (falls back to default if empty).
pub fn resolve_route(mode: &RouteMode, prompt: Option<&str>) -> RouteDecision {
    match mode {
        RouteMode::Force(id) => RouteDecision {
            model_id: id.clone(),
            reason: "explicit --route / -m override".into(),
            tier: "forced",
        },
        RouteMode::Auto => {
            let p = prompt.unwrap_or("");
            if p.trim().is_empty() {
                RouteDecision {
                    model_id: TIER_DEFAULT.to_string(),
                    reason: "auto with empty prompt → default".into(),
                    tier: "default",
                }
            } else {
                classify_route(p)
            }
        }
    }
}

fn contains_any(hay: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| hay.contains(n))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_fast_for_explain() {
        let d = classify_route("What does main.rs do?");
        assert_eq!(d.model_id, TIER_FAST);
    }

    #[test]
    fn auto_premium_for_architecture() {
        let d = classify_route("Redesign the auth architecture for multi-tenant security audit");
        assert_eq!(d.model_id, TIER_PREMIUM);
    }

    #[test]
    fn auto_local_for_offline() {
        let d = classify_route("Work offline only on this private code");
        assert_eq!(d.model_id, TIER_LOCAL);
    }

    #[test]
    fn auto_default_for_implement() {
        let d = classify_route("Implement a /stats slash command that shows token usage by model");
        assert_eq!(d.model_id, TIER_DEFAULT);
    }

    #[test]
    fn parse_auto() {
        assert_eq!(RouteMode::parse("auto"), RouteMode::Auto);
        assert_eq!(
            RouteMode::parse("tier-premium"),
            RouteMode::Force("tier-premium".into())
        );
    }
}
