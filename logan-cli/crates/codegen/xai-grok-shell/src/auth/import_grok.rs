//! Adopt Grok Build (`~/.grok/auth.json`) credentials into Logan (`~/.logan`).
//!
//! # When auto-import runs
//!
//! Only when Logan has **no usable session** for the active OAuth scope, and
//! none of the "user chose something else" signals fire (see
//! [`ImportPolicy`]).
//!
//! # How this interacts with the LLM the user configured
//!
//! Credential resolution for a chat turn (see `resolve_credentials`):
//!
//! 1. **Per-model BYOK** (`[model.*] api_key` / `env_key`) - always wins for
//!    that model. Importing a Grok session does **not** override Anthropic /
//!    OpenAI / Ollama keys.
//! 2. **Logan session** (`~/.logan/auth.json` OIDC) - default xAI models when
//!    present (including after import).
//! 3. **`XAI_API_KEY`** - used when no session and no model key.
//!
//! Pin either path with `[auth] preferred_method = "oidc" | "api_key"`.
//! Prefer API key (and skip auto-import) when `XAI_API_KEY` is set unless
//! the pin is explicitly `oidc`.
//!
//! After `logan logout`, a sentinel blocks re-import so Grok Build credentials
//! do not silently reappear. Clear it with `logan login` or
//! `logan login --from-grok`.

use std::path::{Path, PathBuf};

use super::config::{GrokComConfig, PreferredAuthMethod};
use super::model::{
    API_KEY_SCOPE, AuthMode, AuthStore, GrokAuth, is_expired, lookup_auth,
};
use super::storage::{
    read_auth_json, read_auth_json_or_empty_recovering_corrupt, write_auth_json,
};

/// Sentinel next to `auth.json`: user logged out of Logan on purpose.
pub const NO_IMPORT_SENTINEL: &str = "auth.no-import-from-grok";

/// Env to force-disable auto-import (`1` / `true` / `never` / `0` / `false`).
pub const ENV_NO_IMPORT: &str = "LOGAN_NO_IMPORT_GROK_AUTH";

/// Optional override for Grok Build home (default `~/.grok`).
pub const ENV_GROK_BUILD_HOME: &str = "GROK_BUILD_HOME";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportSkipReason {
    /// `GROK_AUTH` / `GROK_AUTH_PATH` override owns credentials.
    AuthPathOverride,
    /// Env `LOGAN_NO_IMPORT_GROK_AUTH` or config disabled import.
    ExplicitlyDisabled,
    /// User ran `logan logout` (sentinel present).
    LogoutSentinel,
    /// `[auth] preferred_method = "api_key"`.
    PreferApiKey,
    /// `XAI_API_KEY` set and not pinned to OIDC - keep API-key path.
    PreferEnvApiKey,
    /// Logan already has a usable (non-expired) session for the scope.
    LoganAlreadyHasSession,
    /// No `~/.grok/auth.json` (or custom home).
    SourceMissing,
    /// Source has no adoptable OIDC/session entry.
    SourceHasNoUsableSession,
}

impl ImportSkipReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::AuthPathOverride => "auth_path_override",
            Self::ExplicitlyDisabled => "explicitly_disabled",
            Self::LogoutSentinel => "logout_sentinel",
            Self::PreferApiKey => "prefer_api_key",
            Self::PreferEnvApiKey => "prefer_env_api_key",
            Self::LoganAlreadyHasSession => "logan_already_has_session",
            Self::SourceMissing => "source_missing",
            Self::SourceHasNoUsableSession => "source_has_no_usable_session",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImportGrokAuthResult {
    Imported {
        scopes: usize,
        email: Option<String>,
        source: PathBuf,
    },
    Skipped {
        reason: ImportSkipReason,
    },
}

/// Policy knobs for auto vs forced import.
#[derive(Debug, Clone, Copy)]
pub struct ImportPolicy {
    /// When true, overwrite Logan session scopes from Grok even if Logan has
    /// a session (`logan login --from-grok`).
    pub force: bool,
    /// When true, ignore logout sentinel and env disable (still respect
    /// `GROK_AUTH` / `GROK_AUTH_PATH` path ownership).
    pub ignore_opt_outs: bool,
    pub preferred_method: Option<PreferredAuthMethod>,
}

impl Default for ImportPolicy {
    fn default() -> Self {
        Self {
            force: false,
            ignore_opt_outs: false,
            preferred_method: None,
        }
    }
}

impl ImportPolicy {
    pub fn auto(cfg: &GrokComConfig) -> Self {
        Self {
            force: false,
            ignore_opt_outs: false,
            preferred_method: cfg.preferred_method,
        }
    }

    pub fn force_from_cli(cfg: &GrokComConfig) -> Self {
        Self {
            force: true,
            ignore_opt_outs: true,
            preferred_method: cfg.preferred_method,
        }
    }
}

/// Default Grok Build config directory (`$GROK_BUILD_HOME` or `~/.grok`).
pub fn grok_build_home() -> Option<PathBuf> {
    if let Ok(v) = std::env::var(ENV_GROK_BUILD_HOME) {
        let p = PathBuf::from(v);
        if !p.as_os_str().is_empty() {
            return Some(p);
        }
    }
    #[allow(deprecated)]
    std::env::home_dir().map(|h| h.join(".grok"))
}

pub fn no_import_sentinel_path(logan_home: &Path) -> PathBuf {
    logan_home.join(NO_IMPORT_SENTINEL)
}

/// Block auto-import after intentional logout.
pub fn write_no_import_sentinel(logan_home: &Path) -> std::io::Result<()> {
    let path = no_import_sentinel_path(logan_home);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(
        &path,
        b"# Written by `logan logout`.\n# Blocks auto-import of ~/.grok/auth.json.\n# Clear via: logan login  or  logan login --from-grok\n",
    )?;
    Ok(())
}

/// Clear the logout sentinel (browser login or explicit --from-grok).
pub fn clear_no_import_sentinel(logan_home: &Path) {
    let path = no_import_sentinel_path(logan_home);
    let _ = std::fs::remove_file(path);
}

fn env_disables_import() -> bool {
    match std::env::var(ENV_NO_IMPORT) {
        Ok(v) => {
            let v = v.trim().to_ascii_lowercase();
            matches!(v.as_str(), "1" | "true" | "yes" | "never")
        }
        Err(_) => false,
    }
}

fn is_session_mode(mode: &AuthMode) -> bool {
    matches!(mode, AuthMode::Oidc | AuthMode::External)
}

/// Session entries worth adopting (skip plain API key scopes).
fn adoptable_entries(store: &AuthStore) -> Vec<(String, GrokAuth)> {
    store
        .iter()
        .filter(|(scope, auth)| {
            *scope != API_KEY_SCOPE
                && is_session_mode(&auth.auth_mode)
                && !auth.key.trim().is_empty()
        })
        .map(|(s, a)| (s.clone(), a.clone()))
        .collect()
}

fn logan_has_usable_session(store: &AuthStore, scope: &str) -> bool {
    lookup_auth(store, scope)
        .filter(|a| is_session_mode(&a.auth_mode) && !is_expired(a))
        .is_some()
}

/// Try to copy Grok Build session credentials into Logan's `auth.json`.
///
/// `logan_auth_path` is the target file (`$LOGAN_HOME/auth.json`).
/// `scope` is the active OAuth scope key for the current deployment.
pub fn try_import_grok_build_auth(
    logan_home: &Path,
    logan_auth_path: &Path,
    scope: &str,
    policy: ImportPolicy,
) -> ImportGrokAuthResult {
    // Path ownership: never fight GROK_AUTH_PATH / inline GROK_AUTH.
    if std::env::var_os("GROK_AUTH").is_some() || std::env::var_os("GROK_AUTH_PATH").is_some() {
        return ImportGrokAuthResult::Skipped {
            reason: ImportSkipReason::AuthPathOverride,
        };
    }

    if !policy.ignore_opt_outs {
        if env_disables_import() {
            return ImportGrokAuthResult::Skipped {
                reason: ImportSkipReason::ExplicitlyDisabled,
            };
        }
        if no_import_sentinel_path(logan_home).exists() {
            return ImportGrokAuthResult::Skipped {
                reason: ImportSkipReason::LogoutSentinel,
            };
        }
        if matches!(policy.preferred_method, Some(PreferredAuthMethod::ApiKey)) {
            return ImportGrokAuthResult::Skipped {
                reason: ImportSkipReason::PreferApiKey,
            };
        }
        // XAI_API_KEY users: stay on API key unless they pinned OIDC.
        if crate::agent::auth_method::has_xai_api_key_env()
            && !matches!(policy.preferred_method, Some(PreferredAuthMethod::Oidc))
        {
            return ImportGrokAuthResult::Skipped {
                reason: ImportSkipReason::PreferEnvApiKey,
            };
        }
    }

    let logan_store = match read_auth_json_or_empty_recovering_corrupt(logan_auth_path) {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!(error = %e, "auth: import: cannot read logan auth.json");
            return ImportGrokAuthResult::Skipped {
                reason: ImportSkipReason::SourceMissing,
            };
        }
    };

    if !policy.force && logan_has_usable_session(&logan_store, scope) {
        return ImportGrokAuthResult::Skipped {
            reason: ImportSkipReason::LoganAlreadyHasSession,
        };
    }

    let Some(source_home) = grok_build_home() else {
        return ImportGrokAuthResult::Skipped {
            reason: ImportSkipReason::SourceMissing,
        };
    };
    // Never import from the same directory (LOGAN_HOME accidentally == .grok).
    if source_home == logan_home {
        return ImportGrokAuthResult::Skipped {
            reason: ImportSkipReason::SourceMissing,
        };
    }
    let source_path = source_home.join("auth.json");
    let source_store = match read_auth_json(&source_path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return ImportGrokAuthResult::Skipped {
                reason: ImportSkipReason::SourceMissing,
            };
        }
        Err(e) => {
            tracing::warn!(
                error = %e,
                path = %source_path.display(),
                "auth: import: cannot read Grok Build auth.json"
            );
            return ImportGrokAuthResult::Skipped {
                reason: ImportSkipReason::SourceMissing,
            };
        }
    };

    let mut candidates = adoptable_entries(&source_store);
    if candidates.is_empty() {
        return ImportGrokAuthResult::Skipped {
            reason: ImportSkipReason::SourceHasNoUsableSession,
        };
    }

    // Prefer non-expired; if all expired still import (refresh may heal).
    let any_fresh = candidates.iter().any(|(_, a)| !is_expired(a));
    if any_fresh {
        candidates.retain(|(_, a)| !is_expired(a));
    }

    // If the primary scope has an entry, ensure we include it; otherwise take
    // all session scopes (multi-scope auth.json from Grok).
    let mut merged = logan_store;
    let mut imported = 0usize;
    let mut email = None;
    for (s, auth) in candidates {
        if !policy.force {
            if let Some(existing) = merged.get(&s)
                && is_session_mode(&existing.auth_mode)
                && !is_expired(existing)
            {
                continue;
            }
        }
        if email.is_none() {
            email = auth.email.clone();
        }
        merged.insert(s, auth);
        imported += 1;
    }

    if imported == 0 {
        return ImportGrokAuthResult::Skipped {
            reason: ImportSkipReason::LoganAlreadyHasSession,
        };
    }

    if let Err(e) = write_auth_json(logan_auth_path, &merged) {
        tracing::warn!(error = %e, "auth: import: failed to write logan auth.json");
        return ImportGrokAuthResult::Skipped {
            reason: ImportSkipReason::SourceMissing,
        };
    }

    clear_no_import_sentinel(logan_home);

    tracing::info!(
        scopes = imported,
        source = %source_path.display(),
        "auth: imported Grok Build session into Logan"
    );
    xai_grok_telemetry::unified_log::info(
        "auth: imported from Grok Build",
        None,
        Some(serde_json::json!({
            "scopes": imported,
            "source": source_path.display().to_string(),
            "force": policy.force,
        })),
    );

    ImportGrokAuthResult::Imported {
        scopes: imported,
        email,
        source: source_path,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Utc};
    use xai_grok_test_support::EnvGuard;

    fn oidc_auth(key: &str, email: &str, hours_valid: i64) -> GrokAuth {
        GrokAuth {
            key: key.into(),
            auth_mode: AuthMode::Oidc,
            create_time: Utc::now(),
            user_id: "u1".into(),
            email: Some(email.into()),
            expires_at: Some(Utc::now() + Duration::hours(hours_valid)),
            oidc_issuer: Some("https://auth.x.ai".into()),
            oidc_client_id: Some("client".into()),
            refresh_token: Some("refresh".into()),
            ..GrokAuth::test_default()
        }
    }

    fn write_store(path: &Path, scope: &str, auth: GrokAuth) {
        let mut map = AuthStore::new();
        map.insert(scope.into(), auth);
        write_auth_json(path, &map).unwrap();
    }

    fn base_env(grok_home: &Path) -> (EnvGuard, EnvGuard, EnvGuard, EnvGuard, EnvGuard) {
        (
            EnvGuard::unset("GROK_AUTH"),
            EnvGuard::unset("GROK_AUTH_PATH"),
            EnvGuard::unset("XAI_API_KEY"),
            EnvGuard::unset(ENV_NO_IMPORT),
            EnvGuard::set(ENV_GROK_BUILD_HOME, &grok_home.to_string_lossy()),
        )
    }

    #[test]
    #[serial_test::serial]
    fn imports_when_logan_empty() {
        let logan = tempfile::tempdir().unwrap();
        let grok = tempfile::tempdir().unwrap();
        let _env = base_env(grok.path());
        let scope = "https://auth.x.ai::client";
        write_store(
            &grok.path().join("auth.json"),
            scope,
            oidc_auth("tok-from-grok", "a@yuv.ai", 6),
        );
        let dest = logan.path().join("auth.json");
        let r = try_import_grok_build_auth(logan.path(), &dest, scope, ImportPolicy::default());
        match r {
            ImportGrokAuthResult::Imported { scopes, email, .. } => {
                assert_eq!(scopes, 1);
                assert_eq!(email.as_deref(), Some("a@yuv.ai"));
            }
            other => panic!("expected Imported, got {other:?}"),
        }
        let loaded = read_auth_json(&dest).unwrap();
        assert_eq!(loaded.get(scope).unwrap().key, "tok-from-grok");
    }

    #[test]
    #[serial_test::serial]
    fn skips_when_logan_has_fresh_session() {
        let logan = tempfile::tempdir().unwrap();
        let grok = tempfile::tempdir().unwrap();
        let _env = base_env(grok.path());
        let scope = "https://auth.x.ai::client";
        write_store(
            &logan.path().join("auth.json"),
            scope,
            oidc_auth("tok-logan", "logan@yuv.ai", 6),
        );
        write_store(
            &grok.path().join("auth.json"),
            scope,
            oidc_auth("tok-grok", "grok@yuv.ai", 6),
        );
        let r = try_import_grok_build_auth(
            logan.path(),
            &logan.path().join("auth.json"),
            scope,
            ImportPolicy::default(),
        );
        assert_eq!(
            r,
            ImportGrokAuthResult::Skipped {
                reason: ImportSkipReason::LoganAlreadyHasSession
            }
        );
        assert_eq!(
            read_auth_json(&logan.path().join("auth.json"))
                .unwrap()
                .get(scope)
                .unwrap()
                .key,
            "tok-logan"
        );
    }

    #[test]
    #[serial_test::serial]
    fn force_overwrites_logan_session() {
        let logan = tempfile::tempdir().unwrap();
        let grok = tempfile::tempdir().unwrap();
        let _env = base_env(grok.path());
        let scope = "https://auth.x.ai::client";
        write_store(
            &logan.path().join("auth.json"),
            scope,
            oidc_auth("tok-logan", "logan@yuv.ai", 6),
        );
        write_store(
            &grok.path().join("auth.json"),
            scope,
            oidc_auth("tok-grok", "grok@yuv.ai", 6),
        );
        let r = try_import_grok_build_auth(
            logan.path(),
            &logan.path().join("auth.json"),
            scope,
            ImportPolicy {
                force: true,
                ignore_opt_outs: true,
                preferred_method: None,
            },
        );
        assert!(matches!(r, ImportGrokAuthResult::Imported { .. }));
        assert_eq!(
            read_auth_json(&logan.path().join("auth.json"))
                .unwrap()
                .get(scope)
                .unwrap()
                .key,
            "tok-grok"
        );
    }

    #[test]
    #[serial_test::serial]
    fn logout_sentinel_blocks_auto_import() {
        let logan = tempfile::tempdir().unwrap();
        let grok = tempfile::tempdir().unwrap();
        let _env = base_env(grok.path());
        let scope = "https://auth.x.ai::client";
        write_store(
            &grok.path().join("auth.json"),
            scope,
            oidc_auth("tok", "a@yuv.ai", 6),
        );
        write_no_import_sentinel(logan.path()).unwrap();
        let r = try_import_grok_build_auth(
            logan.path(),
            &logan.path().join("auth.json"),
            scope,
            ImportPolicy::default(),
        );
        assert_eq!(
            r,
            ImportGrokAuthResult::Skipped {
                reason: ImportSkipReason::LogoutSentinel
            }
        );
    }

    #[test]
    #[serial_test::serial]
    fn preferred_api_key_blocks_auto_import() {
        let logan = tempfile::tempdir().unwrap();
        let grok = tempfile::tempdir().unwrap();
        let _env = base_env(grok.path());
        let scope = "https://auth.x.ai::client";
        write_store(
            &grok.path().join("auth.json"),
            scope,
            oidc_auth("tok", "a@yuv.ai", 6),
        );
        let r = try_import_grok_build_auth(
            logan.path(),
            &logan.path().join("auth.json"),
            scope,
            ImportPolicy {
                force: false,
                ignore_opt_outs: false,
                preferred_method: Some(PreferredAuthMethod::ApiKey),
            },
        );
        assert_eq!(
            r,
            ImportGrokAuthResult::Skipped {
                reason: ImportSkipReason::PreferApiKey
            }
        );
    }
}
