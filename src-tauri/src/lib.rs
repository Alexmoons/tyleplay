use chrono::{Datelike, Local, NaiveDate, TimeZone};
use reqwest::{blocking::Client, header::RANGE};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    env,
    fs,
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex, TryLockError},
    thread,
    time::{Duration, Instant},
};
use sysinfo::System;
use tauri::{
    menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, WindowEvent, RESTART_EXIT_CODE,
};

const TRAY_ID: &str = "main-tray";
const TRAY_MENU_TITLE_MAX_CHARS: usize = 24;

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Connection>>,
    archive_db: Arc<Mutex<Connection>>,
    tracker: Arc<Mutex<TrackerState>>,
    scan_state: Arc<Mutex<ScanState>>,
    exit_guard: Arc<Mutex<bool>>,
}

#[derive(Default)]
struct TrackerState {
    active: HashMap<i64, ActiveSession>,
}

#[derive(Default)]
struct ScanState {
    last_run_at: Option<Instant>,
}

#[derive(Clone)]
struct ActiveSession {
    session_id: i64,
    game_id: i64,
    game_name: String,
    exe_name: String,
    exe_path: String,
    started_at: i64,
}

#[derive(Serialize)]
struct Dashboard {
    today_seconds: i64,
    week_seconds: i64,
    active_games: Vec<ActiveGame>,
    recent_games: Vec<GameSummary>,
}

#[derive(Clone, Serialize)]
struct AppNotification {
    id: i64,
    kind: String,
    game_name: String,
    created_at: i64,
    read_at: Option<i64>,
}

#[derive(Serialize)]
struct NotificationOverview {
    unread_count: i64,
    items: Vec<AppNotification>,
}

#[derive(Serialize)]
struct AppSystemInfo {
    os: String,
}

#[derive(Serialize)]
struct DailyPlaytimeOverview {
    days: Vec<DailyPlaytimeDay>,
}

#[derive(Serialize)]
struct WeeklyPlaytimeOverview {
    weeks: Vec<WeeklyPlaytimeWeek>,
}

#[derive(Serialize)]
struct PlaytimeOverview {
    mode: String,
    buckets: Vec<PlaytimeOverviewBucket>,
}

#[derive(Serialize)]
struct PlaytimeOverviewBucket {
    label: String,
    short_label: String,
    total_seconds: i64,
}

#[derive(Serialize)]
struct DailyPlaytimeDay {
    day_start: i64,
    total_seconds: i64,
    top_games: Vec<DailyTopGame>,
    all_games: Vec<DailyTopGame>,
}

#[derive(Serialize)]
struct WeeklyPlaytimeWeek {
    week_start: i64,
    total_seconds: i64,
    top_games: Vec<DailyTopGame>,
    all_games: Vec<DailyTopGame>,
}

#[derive(Clone, Serialize)]
struct DailyTopGame {
    name: String,
    total_seconds: i64,
}

#[derive(Clone, Serialize)]
struct ActiveGame {
    game_id: i64,
    session_id: i64,
    name: String,
    cover_url: Option<String>,
    cover_position_x: Option<f64>,
    cover_position_y: Option<f64>,
    cover_zoom: Option<f64>,
    backdrop_url: Option<String>,
    backdrop_position_x: Option<f64>,
    backdrop_position_y: Option<f64>,
    backdrop_zoom: Option<f64>,
    exe_name: String,
    exe_path: String,
    started_at: i64,
    elapsed_seconds: i64,
}

#[derive(Serialize)]
struct GameSummary {
    id: i64,
    name: String,
    igdb_id: Option<i64>,
    steam_appid: Option<i64>,
    steam_header_url: Option<String>,
    cover_url: Option<String>,
    cover_position_x: Option<f64>,
    cover_position_y: Option<f64>,
    cover_zoom: Option<f64>,
    backdrop_url: Option<String>,
    backdrop_position_x: Option<f64>,
    backdrop_position_y: Option<f64>,
    backdrop_zoom: Option<f64>,
    store: Option<String>,
    created_at: i64,
    release_year: Option<i32>,
    total_seconds: i64,
    last_played: Option<i64>,
    finished_last_played: Option<i64>,
    is_favorite: bool,
    executable_count: i64,
    executable_name: Option<String>,
    executable_path: Option<String>,
    tracking_status: String,
    completion_status: String,
    user_rating: Option<i32>,
    user_review: Option<String>,
}

#[derive(Serialize)]
struct ArchivedGameSummary {
    archive_id: i64,
    name: String,
    cover_url: Option<String>,
    store: Option<String>,
    release_year: Option<i32>,
    archived_at: i64,
    has_igdb_link: bool,
    primary_exe_name: Option<String>,
    total_seconds: i64,
}

#[derive(Serialize)]
struct ArchivedGameDetail {
    archive_id: i64,
    name: String,
    cover_url: Option<String>,
    backdrop_url: Option<String>,
    title_logo_url: Option<String>,
    use_title_logo: bool,
    title_logo_position_x: Option<f64>,
    title_logo_position_y: Option<f64>,
    title_logo_zoom: Option<f64>,
    store: Option<String>,
    summary: Option<String>,
    release_year: Option<i32>,
    genres: Vec<String>,
    platforms: Vec<String>,
    developers: Vec<String>,
    publishers: Vec<String>,
    age_rating: Option<AgeRatingInfo>,
    total_seconds: i64,
    playtime_adjustment_seconds: i64,
    archived_at: i64,
    has_igdb_link: bool,
    primary_exe_name: Option<String>,
}

#[derive(Clone, Serialize)]
struct IgdbGame {
    id: i64,
    name: String,
    first_release_year: Option<i32>,
    cover_url: Option<String>,
    game_type: Option<i64>,
}

#[derive(Serialize)]
struct IgdbSettings {
    client_id: String,
    has_client_secret: bool,
}

#[derive(Serialize, Clone, PartialEq, Eq)]
struct AppSettings {
    start_on_system_startup: bool,
    close_to_system_tray: bool,
    default_page: String,
    language: String,
    app_theme: String,
    top_game_artwork: String,
    playtime_display_mode: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UserSettings {
    full_name: String,
    username: String,
    display_name: String,
    bio: String,
    email: String,
    phone: String,
    github: String,
    instagram: String,
    facebook: String,
    telegram: String,
    language: String,
    timezone: String,
    date_format: String,
    time_format: String,
    member_since: String,
    last_login: String,
    account_status: String,
    user_id: String,
    avatar_data_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveUserSettingsInput {
    full_name: String,
    username: String,
    display_name: String,
    bio: String,
    email: String,
    phone: String,
    github: String,
    instagram: String,
    facebook: String,
    telegram: String,
    language: String,
    timezone: String,
    date_format: String,
    time_format: String,
    avatar_data_url: String,
}

#[derive(Serialize)]
struct AddGameResult {
    status: String,
    game_name: String,
}

#[derive(Serialize)]
struct AddGameDuplicateWarning {
    game_id: i64,
    game_name: String,
    store: Option<String>,
    release_year: Option<i32>,
}

#[derive(Serialize)]
struct AddGamePreflightResult {
    duplicate_igdb_game: Option<AddGameDuplicateWarning>,
    executable_conflict_message: Option<String>,
}

const AUTOSTART_ARG: &str = "--autostart";

#[derive(Clone, Serialize, Deserialize)]
struct AgeRatingInfo {
    label: String,
    description: Option<String>,
    image_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateGameMetadataInput {
    game_id: i64,
    name: String,
    store: Option<String>,
    cover_url: Option<String>,
    cover_position_x: Option<f64>,
    cover_position_y: Option<f64>,
    cover_zoom: Option<f64>,
    backdrop_url: Option<String>,
    backdrop_position_x: Option<f64>,
    backdrop_position_y: Option<f64>,
    backdrop_zoom: Option<f64>,
    title_logo_url: Option<String>,
    use_title_logo: Option<bool>,
    title_logo_position_x: Option<f64>,
    title_logo_position_y: Option<f64>,
    title_logo_zoom: Option<f64>,
    summary: Option<String>,
    release_year: Option<i32>,
    genres: Vec<String>,
    platforms: Vec<String>,
    developers: Vec<String>,
    publishers: Vec<String>,
    age_rating_label: Option<String>,
    completion_status: Option<String>,
    user_rating: Option<i32>,
    user_review: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateGamePlaytimeInput {
    game_id: i64,
    total_seconds: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateGameExecutableInput {
    game_id: i64,
    exe_path: String,
}

#[derive(Serialize)]
struct GameDetail {
    id: i64,
    name: String,
    cover_url: Option<String>,
    cover_position_x: Option<f64>,
    cover_position_y: Option<f64>,
    cover_zoom: Option<f64>,
    backdrop_url: Option<String>,
    steam_header_url: Option<String>,
    backdrop_position_x: Option<f64>,
    backdrop_position_y: Option<f64>,
    backdrop_zoom: Option<f64>,
    title_logo_url: Option<String>,
    use_title_logo: bool,
    title_logo_position_x: Option<f64>,
    title_logo_position_y: Option<f64>,
    title_logo_zoom: Option<f64>,
    metadata_locked: bool,
    has_igdb_link: bool,
    store: Option<String>,
    total_seconds: i64,
    playtime_adjustment_seconds: i64,
    has_manual_playtime: bool,
    last_played: Option<i64>,
    is_favorite: bool,
    executable_count: i64,
    executable_name: Option<String>,
    executable_path: Option<String>,
    release_year: Option<i32>,
    genres: Vec<String>,
    summary: Option<String>,
    platforms: Vec<String>,
    developers: Vec<String>,
    publishers: Vec<String>,
    age_rating: Option<AgeRatingInfo>,
    created_at: i64,
    completion_status: String,
    user_rating: Option<i32>,
    user_review: Option<String>,
    play_sessions: Vec<PlaySession>,
}

#[derive(Serialize)]
struct PlaySession {
    id: Option<i64>,
    started_at: i64,
    ended_at: Option<i64>,
    duration_seconds: i64,
    is_active: bool,
    note: Option<String>,
}

#[derive(Serialize)]
struct StatsSnapshotGame {
    id: i64,
    name: String,
    store: Option<String>,
    cover_url: Option<String>,
    total_seconds: i64,
    play_sessions: Vec<PlaySession>,
}

#[derive(Serialize)]
struct StatsSnapshot {
    games: Vec<StatsSnapshotGame>,
}

#[derive(Deserialize)]
struct TwitchTokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct IgdbSearchResponse {
    id: i64,
    name: String,
    first_release_date: Option<i64>,
    cover: Option<IgdbImageResponse>,
    game_type: Option<i64>,
}

#[derive(Deserialize)]
struct IgdbDetailResponse {
    name: String,
    first_release_date: Option<i64>,
    summary: Option<String>,
    cover: Option<IgdbImageResponse>,
    screenshots: Option<Vec<IgdbImageResponse>>,
    artworks: Option<Vec<IgdbImageResponse>>,
    genres: Option<Vec<IgdbNamedResponse>>,
    platforms: Option<Vec<IgdbPlatformResponse>>,
    involved_companies: Option<Vec<IgdbCompanyRoleResponse>>,
    age_ratings: Option<Vec<IgdbAgeRatingResponse>>,
    external_games: Option<Vec<IgdbExternalGameResponse>>,
    websites: Option<Vec<IgdbWebsiteResponse>>,
}

#[derive(Clone, Deserialize)]
struct IgdbImageResponse {
    url: String,
    width: Option<i64>,
    height: Option<i64>,
}

#[derive(Deserialize)]
struct IgdbNamedResponse {
    name: String,
}

#[derive(Deserialize)]
struct IgdbPlatformResponse {
    name: String,
    abbreviation: Option<String>,
}

#[derive(Deserialize)]
struct IgdbCompanyRoleResponse {
    developer: Option<bool>,
    publisher: Option<bool>,
    company: Option<IgdbNamedResponse>,
}

#[derive(Deserialize)]
struct IgdbAgeRatingResponse {
    id: Option<i64>,
    category: Option<i64>,
    organization: Option<i64>,
    rating: Option<i64>,
    rating_category: Option<IgdbAgeRatingCategoryResponse>,
    rating_cover_url: Option<String>,
    synopsis: Option<String>,
}

#[derive(Deserialize)]
struct IgdbAgeRatingCategoryResponse {
    rating: Option<String>,
}

#[derive(Deserialize)]
struct IgdbExternalGameResponse {
    category: Option<i64>,
    external_game_source: Option<i64>,
    uid: Option<String>,
}

#[derive(Deserialize)]
struct IgdbWebsiteResponse {
    url: Option<String>,
    r#type: Option<i64>,
    trusted: Option<bool>,
}

#[derive(Deserialize)]
struct SteamStoreAppDetailsEnvelope {
    success: bool,
    data: Option<SteamStoreAppDetailsResponse>,
}

#[derive(Deserialize)]
struct SteamStoreAppDetailsResponse {
    steam_appid: Option<i64>,
    r#type: Option<String>,
    header_image: Option<String>,
    header_image_2x: Option<String>,
    capsule_image: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Default)]
struct SteamAssetUrls {
    appid: Option<i64>,
    small_capsule_url: Option<String>,
    small_capsule_2x_url: Option<String>,
    cover_url: Option<String>,
    cover_2x_url: Option<String>,
    library_hero_url: Option<String>,
    library_header_url: Option<String>,
    header_url: Option<String>,
    header_2x_url: Option<String>,
    logo_url: Option<String>,
    logo_2x_url: Option<String>,
    library_logo_url: Option<String>,
}

struct SteamVisualAssets {
    appid: i64,
    cover_url: Option<String>,
    backdrop_url: Option<String>,
    steam_header_url: Option<String>,
    title_logo_url: Option<String>,
    asset_urls: SteamAssetUrls,
}

struct IgdbAuth {
    client_id: String,
    access_token: String,
}

struct LocalGameDetailRow {
    id: i64,
    name: String,
    store: Option<String>,
    cover_url: Option<String>,
    cover_position_x: Option<f64>,
    cover_position_y: Option<f64>,
    cover_zoom: Option<f64>,
    backdrop_url: Option<String>,
    steam_header_url: Option<String>,
    backdrop_position_x: Option<f64>,
    backdrop_position_y: Option<f64>,
    backdrop_zoom: Option<f64>,
    title_logo_url: Option<String>,
    use_title_logo: bool,
    title_logo_position_x: Option<f64>,
    title_logo_position_y: Option<f64>,
    title_logo_zoom: Option<f64>,
    igdb_id: Option<i64>,
    metadata_locked: bool,
    created_at: i64,
    total_seconds: i64,
    playtime_adjustment_seconds: i64,
    last_played: Option<i64>,
    is_favorite: bool,
    executable_count: i64,
    executable_name: Option<String>,
    executable_path: Option<String>,
    release_year: Option<i32>,
    genres: Vec<String>,
    summary: Option<String>,
    platforms: Vec<String>,
    developers: Vec<String>,
    publishers: Vec<String>,
    age_rating: Option<AgeRatingInfo>,
    completion_status: String,
    user_rating: Option<i32>,
    user_review: Option<String>,
}

struct SessionRow {
    id: i64,
    started_at: i64,
    ended_at: Option<i64>,
    duration_seconds: Option<i64>,
    note: Option<String>,
}

struct GameRecord {
    name: String,
    store: Option<String>,
    cover_url: Option<String>,
    cover_position_x: Option<f64>,
    cover_position_y: Option<f64>,
    cover_zoom: Option<f64>,
    backdrop_url: Option<String>,
    steam_header_url: Option<String>,
    backdrop_position_x: Option<f64>,
    backdrop_position_y: Option<f64>,
    backdrop_zoom: Option<f64>,
    title_logo_url: Option<String>,
    use_title_logo: bool,
    title_logo_position_x: Option<f64>,
    title_logo_position_y: Option<f64>,
    title_logo_zoom: Option<f64>,
    summary: Option<String>,
    release_year: Option<i32>,
    genres_json: Option<String>,
    platforms_json: Option<String>,
    developers_json: Option<String>,
    publishers_json: Option<String>,
    age_rating_json: Option<String>,
    playtime_adjustment_seconds: i64,
    igdb_id: Option<i64>,
    steam_appid: Option<i64>,
    steam_assets_json: Option<String>,
    is_favorite: bool,
    metadata_locked: bool,
    created_at: i64,
    updated_at: i64,
    completion_status: String,
    user_rating: Option<i32>,
    user_review: Option<String>,
}

struct ArchivedGameRecord {
    archive_id: i64,
    record: GameRecord,
}

struct ExecutableRecord {
    exe_name: String,
    exe_path: String,
    exe_path_display: Option<String>,
    status: String,
    created_at: i64,
    updated_at: i64,
}

struct DailySessionSource {
    game_name: String,
    started_at: i64,
    ended_at: i64,
}

#[derive(Clone)]
struct PlaytimeRangeSource {
    started_at: i64,
    ended_at: i64,
}

fn now_ts() -> i64 {
    Local::now().timestamp()
}

const NOTIFICATION_RETENTION_DAYS: i64 = 30;
const NOTIFICATION_RETENTION_SECONDS: i64 = NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60;
const ARCHIVE_RETENTION_DAYS: i64 = 90;
const ARCHIVE_RETENTION_SECONDS: i64 = ARCHIVE_RETENTION_DAYS * 24 * 60 * 60;

fn escape_igdb_search(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn looks_like_non_main_game(name: &str) -> bool {
    let normalized = name.to_ascii_lowercase();
    [
        " update",
        " - update",
        " edition",
        " deluxe",
        " bundle",
        " dlc",
        " add-on",
        " addon",
        " expansion",
        " pack",
        " pass",
        " season",
        " soundtrack",
        " demo",
        " beta",
        " alpha",
        " trial",
        " upgrade",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
}

fn normalize_image_url(url: String, size: &str) -> String {
    let mut normalized = url.replace("t_thumb", size);
    normalized = normalized.replace("t_cover_big", size);
    normalized = normalized.replace("t_screenshot_med", size);
    normalized = normalized.replace("t_1080p", size);
    if normalized.starts_with("//") {
        format!("https:{normalized}")
    } else if normalized.starts_with('/') {
        format!("https://www.igdb.com{normalized}")
    } else {
        normalized
    }
}

fn parse_json_vec(value: Option<String>) -> Vec<String> {
    value
        .and_then(|raw| serde_json::from_str::<Vec<String>>(&raw).ok())
        .unwrap_or_default()
}

fn parse_json_age_rating(value: Option<String>) -> Option<AgeRatingInfo> {
    value.and_then(|raw| serde_json::from_str::<AgeRatingInfo>(&raw).ok())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_store(value: Option<String>) -> Option<String> {
    let normalized = normalize_optional_text(value)?;
    let compact = normalized
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    let canonical = match compact.as_str() {
        "steam" => "Steam",
        "epic" | "epic games" | "epic games store" => "Epic Games",
        "gog" | "gog.com" => "GOG",
        "microsoft" | "microsoft store" | "ms store" | "xbox app" => "Microsoft Store",
        "playstation" | "ps" => "PlayStation",
        "rockstar" | "rockstar games" => "Rockstar",
        "ea" | "ea app" | "origin" => "EA App",
        "ubisoft" | "ubisoft connect" | "uplay" => "Ubisoft Connect",
        _ => normalized.as_str(),
    };

    Some(canonical.to_string())
}

fn insert_notification(
    conn: &Connection,
    kind: &str,
    game_name: &str,
    created_at: i64,
) -> Result<(), String> {
    let game_name = game_name.trim();
    if game_name.is_empty() {
        return Ok(());
    }

    conn
    .execute(
      "INSERT INTO notifications (kind, game_name, created_at, read_at) VALUES (?1, ?2, ?3, NULL)",
      params![kind.trim(), game_name, created_at],
    )
    .map_err(|err| format!("failed to insert notification: {err}"))?;

    Ok(())
}

fn seed_notifications_if_empty(conn: &Connection) -> rusqlite::Result<()> {
    let count = conn.query_row("SELECT COUNT(*) FROM notifications", [], |row| {
        row.get::<_, i64>(0)
    })?;
    if count > 0 {
        return Ok(());
    }

    let mut stmt = conn.prepare(
        "
    SELECT g.name, MAX(s.ended_at) AS ended_at
    FROM games g
    JOIN sessions s ON s.game_id = g.id
    WHERE s.duration_seconds IS NOT NULL AND s.ended_at IS NOT NULL
    GROUP BY g.id, g.name
    ORDER BY ended_at DESC, g.id DESC
    LIMIT 15
    ",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })?;

    for row in rows {
        let (game_name, created_at) = row?;
        conn.execute(
      "INSERT INTO notifications (kind, game_name, created_at, read_at) VALUES ('played', ?1, ?2, ?2)",
      params![game_name, created_at],
    )?;
    }

    Ok(())
}

fn query_notifications(
    conn: &Connection,
    limit: Option<i64>,
) -> Result<Vec<AppNotification>, String> {
    let normalized_limit = limit.unwrap_or(0).max(0);
    if normalized_limit > 0 {
        let mut stmt = conn
            .prepare(
                "
        SELECT id, kind, game_name, created_at, read_at
        FROM notifications
        ORDER BY created_at DESC, id DESC
        LIMIT ?1
        ",
            )
            .map_err(|err| format!("failed to prepare notifications query: {err}"))?;

        let rows = stmt
            .query_map(params![normalized_limit], |row| {
                Ok(AppNotification {
                    id: row.get(0)?,
                    kind: row.get(1)?,
                    game_name: row.get(2)?,
                    created_at: row.get(3)?,
                    read_at: row.get(4)?,
                })
            })
            .map_err(|err| format!("failed to read notifications: {err}"))?;

        return rows
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|err| format!("failed to collect notifications: {err}"));
    }

    let mut stmt = conn
        .prepare(
            "
      SELECT id, kind, game_name, created_at, read_at
      FROM notifications
      ORDER BY created_at DESC, id DESC
      ",
        )
        .map_err(|err| format!("failed to prepare notifications query: {err}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(AppNotification {
                id: row.get(0)?,
                kind: row.get(1)?,
                game_name: row.get(2)?,
                created_at: row.get(3)?,
                read_at: row.get(4)?,
            })
        })
        .map_err(|err| format!("failed to read notifications: {err}"))?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| format!("failed to collect notifications: {err}"))
}

fn query_unread_notification_count(conn: &Connection) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM notifications WHERE read_at IS NULL",
        [],
        |row| row.get::<_, i64>(0),
    )
    .map_err(|err| format!("failed to count unread notifications: {err}"))
}

fn prune_expired_notifications(conn: &Connection, now: i64) -> Result<(), String> {
    let cutoff = now.saturating_sub(NOTIFICATION_RETENTION_SECONDS);
    conn.execute(
        "DELETE FROM notifications WHERE created_at < ?1",
        params![cutoff],
    )
    .map_err(|err| format!("failed to prune expired notifications: {err}"))?;
    Ok(())
}

fn normalize_game_name_for_match(value: &str) -> String {
    let mut normalized = String::with_capacity(value.len());
    let mut last_was_space = false;
    for ch in value.chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_alphanumeric() {
            normalized.push(ch);
            last_was_space = false;
        } else if !last_was_space {
            normalized.push(' ');
            last_was_space = true;
        }
    }
    normalized.trim().to_string()
}

fn build_manual_fingerprint(name: &str, exe_name: &str, store: Option<&str>) -> String {
    let normalized_name = normalize_game_name_for_match(name);
    let normalized_store = store
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_default();
    format!(
        "{normalized_name}|{}|{normalized_store}",
        normalize_exe_name(exe_name)
    )
}

fn normalize_string_list(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .flat_map(|value| {
            value
                .split([',', '\n'])
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .filter(|value| seen.insert(value.to_ascii_lowercase()))
        .collect()
}

fn normalize_platform_label(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.eq_ignore_ascii_case("pc") || trimmed.eq_ignore_ascii_case("windows") {
        "Windows".to_string()
    } else if trimmed.eq_ignore_ascii_case("xone")
        || trimmed.eq_ignore_ascii_case("xbone")
        || trimmed.eq_ignore_ascii_case("xbox one")
    {
        "Xbox One".to_string()
    } else if trimmed.eq_ignore_ascii_case("x360")
        || trimmed.eq_ignore_ascii_case("xb360")
        || trimmed.eq_ignore_ascii_case("xbox 360")
    {
        "Xbox 360".to_string()
    } else if trimmed.eq_ignore_ascii_case("xsx|s")
        || trimmed.eq_ignore_ascii_case("xsx")
        || trimmed.eq_ignore_ascii_case("xss")
        || trimmed.eq_ignore_ascii_case("xbox series x|s")
        || trimmed.eq_ignore_ascii_case("xbox series x")
        || trimmed.eq_ignore_ascii_case("xbox series s")
    {
        "Xbox Series X|S".to_string()
    } else if trimmed.eq_ignore_ascii_case("xbox") {
        "Xbox".to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_platform_list(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .flat_map(|value| {
            value
                .split([',', '\n'])
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(normalize_platform_label)
                .collect::<Vec<_>>()
        })
        .filter(|value| seen.insert(value.to_ascii_lowercase()))
        .collect()
}

fn build_manual_age_rating(label: Option<String>) -> Option<AgeRatingInfo> {
    normalize_optional_text(label).map(|label| AgeRatingInfo {
        label,
        description: None,
        image_url: None,
    })
}

fn is_landscape_image(image: &IgdbImageResponse) -> bool {
    match (image.width, image.height) {
        (Some(width), Some(height)) if width > 0 && height > 0 => width * 10 >= height * 16,
        _ => false,
    }
}

fn pick_backdrop_url(detail: &IgdbDetailResponse) -> Option<String> {
    detail
        .artworks
        .as_ref()
        .and_then(|items| {
            items
                .iter()
                .find(|image| is_landscape_image(image))
                .or_else(|| items.first())
        })
        .or_else(|| {
            detail.screenshots.as_ref().and_then(|items| {
                items
                    .iter()
                    .find(|image| is_landscape_image(image))
                    .or_else(|| items.first())
            })
        })
        .or_else(|| detail.cover.as_ref())
        .map(|image| normalize_image_url(image.url.clone(), "t_1080p"))
}

fn igdb_external_steam_appids(detail: &IgdbDetailResponse) -> Vec<i64> {
    let mut seen = HashSet::new();
    detail
        .external_games
        .as_ref()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let source = item.external_game_source.or(item.category);
                    (source == Some(1))
                        .then_some(item.uid.as_deref())
                        .flatten()
                        .and_then(|uid| uid.trim().parse::<i64>().ok())
                })
                .filter(|appid| seen.insert(*appid))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn igdb_website_steam_appids(detail: &IgdbDetailResponse) -> Vec<i64> {
    let mut seen = HashSet::new();
    let mut ordered = Vec::new();

    if let Some(websites) = detail.websites.as_ref() {
        for website in websites
            .iter()
            .filter(|item| item.trusted.unwrap_or(false))
            .filter(|item| item.r#type == Some(13) || item.r#type.is_none())
        {
            let Some(appid) = website
                .url
                .as_deref()
                .and_then(extract_steam_appid_from_url)
            else {
                continue;
            };
            if seen.insert(appid) {
                ordered.push(appid);
            }
        }

        for website in websites {
            let Some(appid) = website
                .url
                .as_deref()
                .and_then(extract_steam_appid_from_url)
            else {
                continue;
            };
            if seen.insert(appid) {
                ordered.push(appid);
            }
        }
    }

    ordered
}

fn preferred_steam_appids(
    stored_steam_appid: Option<i64>,
    stored_urls: &[Option<String>],
    detail: Option<&IgdbDetailResponse>,
) -> Vec<i64> {
    let mut seen = HashSet::new();
    let mut ordered = Vec::new();

    if let Some(appid) = stored_steam_appid {
        if seen.insert(appid) {
            ordered.push(appid);
        }
    }

    for value in stored_urls {
        if let Some(appid) = value
            .as_deref()
            .and_then(extract_steam_appid_from_url)
            .filter(|appid| seen.insert(*appid))
        {
            ordered.push(appid);
        }
    }

    if let Some(detail) = detail {
        for appid in igdb_external_steam_appids(detail) {
            if seen.insert(appid) {
                ordered.push(appid);
            }
        }
        for appid in igdb_website_steam_appids(detail) {
            if seen.insert(appid) {
                ordered.push(appid);
            }
        }
    }

    ordered
}

fn steam_store_asset_bases(appid: i64) -> [String; 2] {
    [
        format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{appid}"),
        format!("https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}"),
    ]
}

fn steam_store_asset_base(appid: i64) -> String {
    steam_store_asset_bases(appid)[0].clone()
}

fn steam_url_has_known_asset_extension(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return false;
    }

    let path_part = trimmed
        .split('?')
        .next()
        .unwrap_or(trimmed)
        .rsplit('/')
        .next()
        .unwrap_or(trimmed);

    [".jpg", ".jpeg", ".png", ".webp"]
        .iter()
        .any(|suffix| path_part.to_ascii_lowercase().ends_with(suffix))
}

fn normalize_steam_store_header_url(value: &str, appid: Option<i64>) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    if steam_url_has_known_asset_extension(trimmed) {
        return Some(trimmed.to_string());
    }

    let resolved_appid = appid.or_else(|| extract_steam_appid_from_url(trimmed));
    resolved_appid.map(|id| format!("{}/header.jpg", steam_store_asset_base(id)))
}

fn steam_url_looks_like_hashed_store_asset(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return false;
    }

    let normalized = trimmed.replace('\\', "/");
    let Some((_, after_apps)) = normalized.split_once("/apps/") else {
        return false;
    };

    let mut parts = after_apps.split('/');
    let Some(appid_part) = parts.next() else {
        return false;
    };
    if appid_part.trim().parse::<i64>().ok().filter(|value| *value > 0).is_none() {
        return false;
    }

    let Some(hash_part) = parts.next() else {
        return false;
    };
    if hash_part.len() < 8 || !hash_part.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return false;
    }

    let Some(file_part) = parts.next() else {
        return false;
    };
    let file_name = file_part.split('?').next().unwrap_or(file_part).to_ascii_lowercase();
    [".jpg", ".jpeg", ".png", ".webp"]
        .iter()
        .any(|suffix| file_name.ends_with(suffix))
}

fn steam_asset_cache_dir(app: &AppHandle, appid: i64) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("failed to resolve app data dir: {err}"))?
        .join("asset-cache")
        .join("steam")
        .join(appid.to_string());
    fs::create_dir_all(&dir).map_err(|err| format!("failed to create steam asset cache dir: {err}"))?;
    Ok(dir)
}

fn steam_cached_asset_path(app: &AppHandle, appid: i64, file_name: &str) -> Option<String> {
    let path = steam_asset_cache_dir(app, appid).ok()?.join(file_name);
    let metadata = fs::metadata(&path).ok()?;
    if !metadata.is_file() || metadata.len() == 0 {
        return None;
    }
    Some(path.to_string_lossy().to_string())
}

fn clear_steam_asset_cache(app: &AppHandle, appid: Option<i64>) -> Result<(), String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("failed to resolve app data dir: {err}"))?
        .join("asset-cache")
        .join("steam");

    let target = match appid {
        Some(value) if value > 0 => base_dir.join(value.to_string()),
        _ => base_dir,
    };

    if target.exists() {
        fs::remove_dir_all(&target).map_err(|err| format!("failed to clear steam asset cache: {err}"))?;
    }

    Ok(())
}

fn cache_steam_asset(
    app: &AppHandle,
    client: &Client,
    appid: i64,
    file_name: &str,
    url: &str,
) -> Result<Option<String>, String> {
    if appid <= 0 {
        return Ok(None);
    }

    if let Some(cached_path) = steam_cached_asset_path(app, appid, file_name) {
        return Ok(Some(cached_path));
    }

    let source = url.trim();
    if source.is_empty() {
        return Ok(None);
    }

    let bytes = client
        .get(source)
        .send()
        .map_err(|err| format!("failed to download Steam asset: {err}"))?
        .error_for_status()
        .map_err(|err| format!("Steam asset request failed: {err}"))?
        .bytes()
        .map_err(|err| format!("failed to read Steam asset bytes: {err}"))?;

    if bytes.is_empty() {
        return Ok(None);
    }

    let path = steam_asset_cache_dir(app, appid)?.join(file_name);
    fs::write(&path, &bytes).map_err(|err| format!("failed to write Steam asset cache: {err}"))?;
    Ok(Some(path.to_string_lossy().to_string()))
}

fn build_steam_asset_urls(
    appid: i64,
    small_capsule_url: Option<String>,
    small_capsule_2x_url: Option<String>,
    cover_url: Option<String>,
    backdrop_url: Option<String>,
    steam_header_url: Option<String>,
    title_logo_url: Option<String>,
) -> SteamAssetUrls {
    let primary_base = steam_store_asset_base(appid);
    SteamAssetUrls {
        appid: Some(appid),
        small_capsule_url: small_capsule_url
            .clone()
            .or_else(|| Some(format!("{primary_base}/capsule_231x87.jpg"))),
        small_capsule_2x_url: small_capsule_2x_url
            .clone()
            .or_else(|| Some(format!("{primary_base}/capsule_231x87_2x.jpg"))),
        cover_url: cover_url
            .clone()
            .or_else(|| Some(format!("{primary_base}/library_600x900.jpg"))),
        cover_2x_url: Some(format!("{primary_base}/library_600x900_2x.jpg")),
        library_hero_url: backdrop_url
            .clone()
            .or_else(|| Some(format!("{primary_base}/library_hero.jpg"))),
        library_header_url: Some(format!("{primary_base}/library_header.jpg")),
        header_url: Some(format!("{primary_base}/header.jpg")),
        header_2x_url: steam_header_url
            .clone()
            .or_else(|| Some(format!("{primary_base}/header_2x.jpg"))),
        logo_url: title_logo_url
            .clone()
            .or_else(|| Some(format!("{primary_base}/logo.png"))),
        logo_2x_url: Some(format!("{primary_base}/logo_2x.png")),
        library_logo_url: Some(format!("{primary_base}/library_logo.png")),
    }
}

fn parse_steam_assets_json(value: Option<String>) -> Option<SteamAssetUrls> {
    value
        .as_deref()
        .and_then(|text| serde_json::from_str::<SteamAssetUrls>(text).ok())
}

fn merge_steam_asset_urls(existing: Option<SteamAssetUrls>, next: SteamAssetUrls) -> SteamAssetUrls {
    let mut merged = existing.unwrap_or_default();
    if merged.appid.is_none() {
        merged.appid = next.appid;
    }
    if merged.small_capsule_url.is_none() {
        merged.small_capsule_url = next.small_capsule_url;
    }
    if merged.small_capsule_2x_url.is_none() {
        merged.small_capsule_2x_url = next.small_capsule_2x_url;
    }
    if merged.cover_url.is_none() {
        merged.cover_url = next.cover_url;
    }
    if merged.cover_2x_url.is_none() {
        merged.cover_2x_url = next.cover_2x_url;
    }
    if merged.library_hero_url.is_none() {
        merged.library_hero_url = next.library_hero_url;
    }
    if merged.library_header_url.is_none() {
        merged.library_header_url = next.library_header_url;
    }
    if merged.header_url.is_none() {
        merged.header_url = next.header_url;
    }
    if merged.header_2x_url.is_none() {
        merged.header_2x_url = next.header_2x_url;
    }
    if merged.logo_url.is_none() {
        merged.logo_url = next.logo_url;
    }
    if merged.logo_2x_url.is_none() {
        merged.logo_2x_url = next.logo_2x_url;
    }
    if merged.library_logo_url.is_none() {
        merged.library_logo_url = next.library_logo_url;
    }
    merged
}

fn candidate_steam_library_cache_dirs() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(program_files_x86) = env::var("ProgramFiles(x86)") {
        candidates.push(
            PathBuf::from(program_files_x86)
                .join("Steam")
                .join("appcache")
                .join("librarycache"),
        );
    }
    if let Ok(program_files) = env::var("ProgramFiles") {
        candidates.push(
            PathBuf::from(program_files)
                .join("Steam")
                .join("appcache")
                .join("librarycache"),
        );
    }
    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(local_app_data)
                .join("Steam")
                .join("appcache")
                .join("librarycache"),
        );
    }

    candidates.push(
        PathBuf::from(r"C:\Program Files (x86)\Steam")
            .join("appcache")
            .join("librarycache"),
    );
    candidates.push(
        PathBuf::from(r"C:\Program Files\Steam")
            .join("appcache")
            .join("librarycache"),
    );

    let mut deduped = Vec::new();
    let mut seen = HashSet::new();
    for path in candidates {
        if seen.insert(path.clone()) {
            deduped.push(path);
        }
    }

    deduped
}

fn find_local_steam_asset_path(appid: i64, file_names: &[&str]) -> Option<String> {
    let app_dir = candidate_steam_library_cache_dirs()
        .into_iter()
        .map(|root| root.join(appid.to_string()))
        .find(|path| path.is_dir())?;

    let mut matches = HashMap::<String, PathBuf>::new();
    let mut stack = vec![app_dir];
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }

            let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
                continue;
            };
            if file_names.iter().any(|candidate| name.eq_ignore_ascii_case(candidate)) {
                matches
                    .entry(name.to_ascii_lowercase())
                    .or_insert(path.clone());
            }
        }
    }

    file_names.iter().find_map(|candidate| {
        matches
            .get(&candidate.to_ascii_lowercase())
            .map(|path| local_steam_asset_to_url(appid, path))
    })
}

fn local_steam_asset_to_url(appid: i64, path: &Path) -> String {
    let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
        return path.to_string_lossy().into_owned();
    };
    let Some(parent_dir) = path.parent() else {
        return path.to_string_lossy().into_owned();
    };
    let Some(hash_dir) = parent_dir.file_name().and_then(|value| value.to_str()) else {
        return path.to_string_lossy().into_owned();
    };

    let is_hash_dir = hash_dir.len() >= 8 && hash_dir.chars().all(|ch| ch.is_ascii_hexdigit());
    if !is_hash_dir {
        return path.to_string_lossy().into_owned();
    }

    format!("{}/{hash_dir}/{file_name}", steam_store_asset_base(appid))
}

fn extract_steam_appid_from_url(value: &str) -> Option<i64> {
    let normalized = value.replace('\\', "/");
    for marker in ["/apps/", "/librarycache/", "/app/"] {
        let Some((_, suffix)) = normalized.split_once(marker) else {
            continue;
        };
        if let Some(appid) = suffix
            .split('/')
            .next()
            .and_then(|part| part.trim().parse::<i64>().ok())
        {
            return Some(appid);
        }
    }

    None
}

fn normalize_title_for_matching(value: &str) -> String {
    value
        .chars()
        .flat_map(|ch| ch.to_lowercase())
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect()
}

fn strip_html_tags(value: &str) -> String {
    let mut plain = String::new();
    let mut inside_tag = false;
    for ch in value.chars() {
        match ch {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => plain.push(ch),
            _ => {}
        }
    }

    plain
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .trim()
        .to_string()
}

fn search_steam_appid_by_name(client: &Client, query: &str) -> Option<i64> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return None;
    }

    let normalized_query = normalize_title_for_matching(trimmed);
    if normalized_query.is_empty() {
        return None;
    }

    let body = client
        .get("https://store.steampowered.com/search/suggest")
        .query(&[
            ("term", trimmed),
            ("f", "games"),
            ("cc", "us"),
            ("realm", "1"),
            ("l", "english"),
        ])
        .send()
        .ok()?
        .error_for_status()
        .ok()?
        .text()
        .ok()?;

    let mut cursor = body.as_str();
    let mut best_partial_match: Option<(usize, i64)> = None;
    while let Some(appid_marker) = cursor.find("data-ds-appid=\"") {
        let after_marker = &cursor[appid_marker + "data-ds-appid=\"".len()..];
        let appid_end = after_marker.find('"')?;
        let appid = after_marker[..appid_end].trim().parse::<i64>().ok()?;
        let Some(name_start) = after_marker.find("<div class=\"match_name\">") else {
            cursor = &after_marker[appid_end..];
            continue;
        };
        let name_section = &after_marker[name_start + "<div class=\"match_name\">".len()..];
        let Some(name_end) = name_section.find("</div>") else {
            cursor = &after_marker[appid_end..];
            continue;
        };
        let candidate_name = strip_html_tags(&name_section[..name_end]);
        let normalized_candidate = normalize_title_for_matching(&candidate_name);
        if normalized_candidate == normalized_query {
            return Some(appid);
        }

        if normalized_candidate.contains(&normalized_query)
            || normalized_query.contains(&normalized_candidate)
        {
            let length_delta = normalized_candidate
                .len()
                .abs_diff(normalized_query.len());
            match best_partial_match {
                Some((best_delta, _)) if best_delta <= length_delta => {}
                _ => best_partial_match = Some((length_delta, appid)),
            }
        }

        cursor = &name_section[name_end..];
    }

    best_partial_match.map(|(_, appid)| appid)
}

fn steam_store_asset_exists(client: &Client, url: &str) -> bool {
    if client
        .head(url)
        .send()
        .and_then(|response| response.error_for_status())
        .is_ok()
    {
        return true;
    }

    client
        .get(url)
        .header(RANGE, "bytes=0-0")
        .send()
        .and_then(|response| response.error_for_status())
        .is_ok()
}

fn fetch_steam_visual_assets(appid: i64) -> Result<Option<SteamVisualAssets>, String> {
    let client = Client::new();
    let key = appid.to_string();
    let response = client
        .get(format!(
            "https://store.steampowered.com/api/appdetails?appids={appid}"
        ))
        .header("Accept", "application/json")
        .send()
        .map_err(|err| format!("failed to load Steam storefront detail: {err}"))?
        .error_for_status()
        .map_err(|err| format!("Steam storefront detail request failed: {err}"))?
        .json::<HashMap<String, SteamStoreAppDetailsEnvelope>>()
        .map_err(|err| format!("failed to read Steam storefront response: {err}"))?;

    let Some(envelope) = response.get(&key) else {
        return Ok(None);
    };
    if !envelope.success {
        return Ok(None);
    }

    let detail = envelope.data.as_ref();
    if detail
        .and_then(|item| item.r#type.as_deref())
        .is_some_and(|app_type| !app_type.eq_ignore_ascii_case("game"))
    {
        return Ok(None);
    }
    let canonical_appid = detail
        .and_then(|item| item.steam_appid)
        .unwrap_or(appid);
    let asset_bases = steam_store_asset_bases(canonical_appid);
    let local_cover_url = find_local_steam_asset_path(
        canonical_appid,
        &[
            "library_600x900_2x.jpg",
            "library_600x900.jpg",
            "library_capsule_2x.jpg",
            "library_capsule.jpg",
        ],
    );
    let local_backdrop_url = find_local_steam_asset_path(
        canonical_appid,
        &["library_hero.jpg", "library_header.jpg", "header.jpg"],
    );
    let local_title_logo_url =
        find_local_steam_asset_path(canonical_appid, &["logo_2x.png", "logo.png"]);
    let cover_candidates = asset_bases
        .iter()
        .flat_map(|base| {
            [
                format!("{base}/library_600x900_2x.jpg"),
                format!("{base}/library_600x900.jpg"),
            ]
        })
        .collect::<Vec<_>>();
    let backdrop_candidates = asset_bases
        .iter()
        .flat_map(|base| {
            [
                format!("{base}/library_hero.jpg"),
                format!("{base}/library_header.jpg"),
            ]
        })
        .collect::<Vec<_>>();
    let logo_candidates = asset_bases
        .iter()
        .flat_map(|base| [format!("{base}/logo.png"), format!("{base}/library_logo.png")])
        .collect::<Vec<_>>();

    let cover_url = local_cover_url.or_else(|| {
        cover_candidates
            .into_iter()
            .find(|url| steam_store_asset_exists(&client, url))
    });
    let backdrop_url = local_backdrop_url.or_else(|| {
        backdrop_candidates
            .into_iter()
            .find(|url| steam_store_asset_exists(&client, url))
    })
        .or_else(|| detail.and_then(|item| item.header_image.clone()));
    let steam_header_url = fetch_steam_store_header_url(&client, canonical_appid)?;
    let title_logo_url = local_title_logo_url.or_else(|| {
        logo_candidates
            .into_iter()
            .find(|url| steam_store_asset_exists(&client, url))
    });

    if cover_url.is_none()
        && backdrop_url.is_none()
        && steam_header_url.is_none()
        && title_logo_url.is_none()
    {
        return Ok(None);
    }

    Ok(Some(SteamVisualAssets {
        appid: canonical_appid,
        cover_url: cover_url.clone(),
        backdrop_url: backdrop_url.clone(),
        steam_header_url: steam_header_url.clone(),
        title_logo_url: title_logo_url.clone(),
        asset_urls: build_steam_asset_urls(
            canonical_appid,
            None,
            None,
            cover_url,
            backdrop_url,
            steam_header_url,
            title_logo_url,
        ),
    }))
}

fn fetch_steam_small_capsule_url(client: &Client, appid: i64) -> Result<Option<String>, String> {
    let key = appid.to_string();
    let response = client
        .get(format!(
            "https://store.steampowered.com/api/appdetails?appids={appid}"
        ))
        .header("Accept", "application/json")
        .send()
        .map_err(|err| format!("failed to load Steam storefront detail: {err}"))?
        .error_for_status()
        .map_err(|err| format!("Steam storefront detail request failed: {err}"))?
        .json::<HashMap<String, SteamStoreAppDetailsEnvelope>>()
        .map_err(|err| format!("failed to read Steam storefront response: {err}"))?;

    let Some(envelope) = response.get(&key) else {
        return Ok(None);
    };
    if !envelope.success {
        return Ok(None);
    }

    let detail = envelope.data.as_ref();
    if detail
        .and_then(|item| item.r#type.as_deref())
        .is_some_and(|app_type| !app_type.eq_ignore_ascii_case("game"))
    {
        return Ok(None);
    }

    Ok(detail.and_then(|item| item.capsule_image.clone()))
}

fn fetch_steam_store_header_url(client: &Client, appid: i64) -> Result<Option<String>, String> {
    let key = appid.to_string();
    let response = client
        .get(format!(
            "https://store.steampowered.com/api/appdetails?appids={appid}"
        ))
        .header("Accept", "application/json")
        .send()
        .map_err(|err| format!("failed to load Steam storefront detail: {err}"))?
        .error_for_status()
        .map_err(|err| format!("Steam storefront detail request failed: {err}"))?
        .json::<HashMap<String, SteamStoreAppDetailsEnvelope>>()
        .map_err(|err| format!("failed to read Steam storefront response: {err}"))?;

    let Some(envelope) = response.get(&key) else {
        return Ok(None);
    };
    if !envelope.success {
        return Ok(None);
    }

    let detail = envelope.data.as_ref();
    if detail
        .and_then(|item| item.r#type.as_deref())
        .is_some_and(|app_type| !app_type.eq_ignore_ascii_case("game"))
    {
        return Ok(None);
    }

    let header = detail
        .and_then(|item| item.header_image_2x.clone())
        .or_else(|| {
            detail
                .and_then(|item| item.header_image.clone())
                .and_then(|value| {
                    let candidate = value.replace("/header.jpg", "/header_2x.jpg");
                    if steam_store_asset_exists(client, &candidate) {
                        Some(candidate)
                    } else {
                        None
                    }
                })
        })
        .or_else(|| detail.and_then(|item| item.header_image.clone()));

    Ok(header)
}

fn release_year(timestamp: Option<i64>) -> Option<i32> {
    timestamp
        .and_then(|value| Local.timestamp_opt(value, 0).single())
        .map(|date| date.year())
}

fn pegi_label(rating: i64) -> Option<&'static str> {
    match rating {
        1 => Some("PEGI 3"),
        2 => Some("PEGI 7"),
        3 => Some("PEGI 12"),
        4 => Some("PEGI 16"),
        5 => Some("PEGI 18"),
        _ => None,
    }
}

fn age_rating_organization(rating: &IgdbAgeRatingResponse) -> Option<i64> {
    rating.organization.or(rating.category)
}

fn age_rating_label(rating: &IgdbAgeRatingResponse) -> Option<String> {
    rating
        .rating_category
        .as_ref()
        .and_then(|category| category.rating.clone())
        .map(|value| {
            if value.to_ascii_uppercase().starts_with("PEGI ") {
                value
            } else {
                format!("PEGI {value}")
            }
        })
        .or_else(|| rating.rating.and_then(pegi_label).map(str::to_string))
}

fn app_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("failed to resolve app data dir: {err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("failed to create app data dir: {err}"))?;
    Ok(dir.join("tyleplay.sqlite"))
}

fn archive_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("failed to resolve app data dir: {err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("failed to create app data dir: {err}"))?;
    Ok(dir.join("tyleplay_archive.sqlite"))
}

fn count_games_in_db(path: &Path) -> Option<i64> {
    if !path.exists() {
        return None;
    }

    let conn = Connection::open(path).ok()?;
    conn.query_row("SELECT COUNT(*) FROM games", [], |row| row.get::<_, i64>(0))
        .ok()
}

fn migrate_legacy_db_if_needed(_app: &AppHandle, target_db_path: &Path) -> Result<(), String> {
    let target_count = count_games_in_db(target_db_path).unwrap_or(0);
    if target_count > 0 {
        return Ok(());
    }

    let appdata = std::env::var("APPDATA")
        .map(PathBuf::from)
        .map_err(|err| format!("failed to read APPDATA: {err}"))?;

    let candidates = [
        appdata.join("com.artyle.tyleplay").join("playplay.sqlite"),
        appdata.join("com.artyle.tyleplay").join("tyleplay.sqlite"),
        appdata.join("com.artyle.playplay").join("playplay.sqlite"),
        appdata.join("artyle").join("playplay.sqlite"),
        appdata.join("artyle").join("tyleplay.sqlite"),
    ];

    let target_canonical = target_db_path.canonicalize().ok();
    let mut best_source: Option<(PathBuf, i64)> = None;

    for source in candidates {
        if !source.exists() {
            continue;
        }

        if let (Some(target), Ok(source_canonical)) = (&target_canonical, source.canonicalize()) {
            if &source_canonical == target {
                continue;
            }
        }

        let Some(count) = count_games_in_db(&source) else {
            continue;
        };

        if count <= 0 {
            continue;
        }

        let replace = best_source
            .as_ref()
            .is_none_or(|(_, best_count)| count > *best_count);

        if replace {
            best_source = Some((source, count));
        }
    }

    let Some((source, source_count)) = best_source else {
        return Ok(());
    };

    if target_db_path.exists() {
        fs::remove_file(target_db_path)
            .map_err(|err| format!("failed to replace empty database with migrated data: {err}"))?;
    }

    fs::copy(&source, target_db_path).map_err(|err| {
        format!(
            "failed to migrate legacy database from {}: {err}",
            source.display()
        )
    })?;

    log::info!(
        "migrated legacy database from {} with {source_count} game(s)",
        source.display()
    );
    Ok(())
}

fn init_db(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      store TEXT,
      cover_url TEXT,
      cover_position_x REAL,
      cover_position_y REAL,
      cover_zoom REAL,
      backdrop_url TEXT,
      steam_header_url TEXT,
      backdrop_position_x REAL,
      backdrop_position_y REAL,
      backdrop_zoom REAL,
      title_logo_url TEXT,
      use_title_logo INTEGER NOT NULL DEFAULT 0,
      title_logo_position_x REAL,
      title_logo_position_y REAL,
      title_logo_zoom REAL,
      summary TEXT,
      release_year INTEGER,
      genres_json TEXT,
      platforms_json TEXT,
      developers_json TEXT,
      publishers_json TEXT,
      age_rating_json TEXT,
      playtime_adjustment_seconds INTEGER NOT NULL DEFAULT 0,
      igdb_id INTEGER,
      steam_appid INTEGER,
      steam_assets_json TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      metadata_locked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS executables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER,
      exe_name TEXT NOT NULL,
      exe_path TEXT NOT NULL,
      exe_path_display TEXT,
      status TEXT NOT NULL CHECK(status IN ('tracked', 'ignored')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(exe_name, exe_path),
      FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      executable_id INTEGER,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_seconds INTEGER,
      FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      game_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER
    );
    ",
    )
}

fn init_archive_db(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS archive_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_game_id INTEGER,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      store TEXT,
      cover_url TEXT,
      cover_position_x REAL,
      cover_position_y REAL,
      cover_zoom REAL,
      backdrop_url TEXT,
      steam_header_url TEXT,
      backdrop_position_x REAL,
      backdrop_position_y REAL,
      backdrop_zoom REAL,
      title_logo_url TEXT,
      use_title_logo INTEGER NOT NULL DEFAULT 0,
      title_logo_position_x REAL,
      title_logo_position_y REAL,
      title_logo_zoom REAL,
      summary TEXT,
      release_year INTEGER,
      genres_json TEXT,
      platforms_json TEXT,
      developers_json TEXT,
      publishers_json TEXT,
      age_rating_json TEXT,
      playtime_adjustment_seconds INTEGER NOT NULL DEFAULT 0,
      igdb_id INTEGER,
      steam_appid INTEGER,
      steam_assets_json TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      metadata_locked INTEGER NOT NULL DEFAULT 0,
      primary_exe_name TEXT,
      manual_fingerprint TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      archived_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS archive_executables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      archive_game_id INTEGER NOT NULL,
      exe_name TEXT NOT NULL,
      exe_path TEXT NOT NULL,
      exe_path_display TEXT,
      status TEXT NOT NULL CHECK(status IN ('tracked', 'ignored')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(archive_game_id) REFERENCES archive_games(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS archive_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      archive_game_id INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_seconds INTEGER,
      FOREIGN KEY(archive_game_id) REFERENCES archive_games(id) ON DELETE CASCADE
    );
    ",
    )
}

fn run_migrations(conn: &Connection) -> rusqlite::Result<()> {
    let _ = conn.execute("ALTER TABLE games ADD COLUMN cover_url TEXT", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN cover_position_x REAL", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN cover_position_y REAL", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN cover_zoom REAL", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN store TEXT", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN backdrop_url TEXT", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN steam_header_url TEXT", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN backdrop_position_x REAL", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN backdrop_position_y REAL", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN backdrop_zoom REAL", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN title_logo_url TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE games ADD COLUMN use_title_logo INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE games ADD COLUMN title_logo_position_x REAL",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE games ADD COLUMN title_logo_position_y REAL",
        [],
    );
    let _ = conn.execute("ALTER TABLE games ADD COLUMN title_logo_zoom REAL", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN summary TEXT", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN release_year INTEGER", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN genres_json TEXT", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN platforms_json TEXT", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN developers_json TEXT", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN publishers_json TEXT", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN age_rating_json TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE games ADD COLUMN playtime_adjustment_seconds INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute("ALTER TABLE games ADD COLUMN igdb_id INTEGER", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN steam_appid INTEGER", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN steam_assets_json TEXT", []);
    let _ = conn.execute(
        "ALTER TABLE games ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE games ADD COLUMN metadata_locked INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE games ADD COLUMN completion_status TEXT NOT NULL DEFAULT 'Backlog'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE executables ADD COLUMN exe_path_display TEXT",
        [],
    );
    let _ = conn.execute("ALTER TABLE games ADD COLUMN user_rating INTEGER", []);
    let _ = conn.execute("ALTER TABLE games ADD COLUMN user_review TEXT", []);
    let _ = conn.execute("ALTER TABLE sessions ADD COLUMN note TEXT", []);
    conn.execute(
        "
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      game_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      read_at INTEGER
    )
    ",
        [],
    )?;
    migrate_sessions_table(conn)?;
    let cleaned = cleanup_legacy_executables(conn)?;
    if cleaned > 0 {
        log::info!("legacy executable cleanup removed {cleaned} stale executable record(s)");
    }
    let _ = conn.execute(
        "
        UPDATE games
        SET completion_status = 'In Progress'
        WHERE completion_status = 'Backlog'
          AND (
            id IN (SELECT DISTINCT game_id FROM sessions WHERE duration_seconds IS NOT NULL AND duration_seconds > 0)
            OR playtime_adjustment_seconds > 0
          )
        ",
        [],
    );
    seed_notifications_if_empty(conn)?;
    Ok(())
}

fn run_archive_migrations(conn: &Connection) -> rusqlite::Result<()> {
    let _ = conn.execute(
        "ALTER TABLE archive_games ADD COLUMN steam_appid INTEGER",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE archive_games ADD COLUMN steam_assets_json TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE archive_games ADD COLUMN title_logo_url TEXT",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE archive_games ADD COLUMN use_title_logo INTEGER NOT NULL DEFAULT 0",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE archive_games ADD COLUMN title_logo_position_x REAL",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE archive_games ADD COLUMN title_logo_position_y REAL",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE archive_games ADD COLUMN title_logo_zoom REAL",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE archive_games ADD COLUMN completion_status TEXT NOT NULL DEFAULT 'Backlog'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE archive_games ADD COLUMN steam_header_url TEXT",
        [],
    );
    let _ = conn.execute("ALTER TABLE archive_games ADD COLUMN user_rating INTEGER", []);
    let _ = conn.execute("ALTER TABLE archive_games ADD COLUMN user_review TEXT", []);
    let _ = conn.execute("ALTER TABLE archive_sessions ADD COLUMN note TEXT", []);
    Ok(())
}

fn migrate_sessions_table(conn: &Connection) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare("PRAGMA foreign_key_list(sessions)")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(2)?, row.get::<_, String>(6)?))
    })?;

    let mut has_executable_cascade = false;
    for row in rows {
        let (table, on_delete) = row?;
        if table == "executables" && on_delete.eq_ignore_ascii_case("CASCADE") {
            has_executable_cascade = true;
            break;
        }
    }
    drop(stmt);

    if !has_executable_cascade {
        return Ok(());
    }

    conn.execute_batch(
        "
    PRAGMA foreign_keys = OFF;

    CREATE TABLE IF NOT EXISTS sessions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      executable_id INTEGER,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_seconds INTEGER,
      FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
    );

    INSERT INTO sessions_new (id, game_id, executable_id, started_at, ended_at, duration_seconds)
    SELECT id, game_id, executable_id, started_at, ended_at, duration_seconds
    FROM sessions;

    DROP TABLE sessions;
    ALTER TABLE sessions_new RENAME TO sessions;

    PRAGMA foreign_keys = ON;
    ",
    )
}

fn cleanup_legacy_executables(conn: &Connection) -> rusqlite::Result<usize> {
    if get_setting(conn, "legacy_executable_cleanup_v1")?.as_deref() == Some("done") {
        return Ok(0);
    }

    let tx = conn.unchecked_transaction()?;
    let mut stmt = tx.prepare(
        "
    SELECT game_id
    FROM executables
    WHERE game_id IS NOT NULL
    GROUP BY game_id
    HAVING COUNT(*) > 1
    ",
    )?;
    let game_ids = stmt
        .query_map([], |row| row.get::<_, i64>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);
    let mut removed_total = 0usize;

    for game_id in game_ids {
        let keeper_id = tx
            .query_row(
                "
        SELECT id
        FROM executables
        WHERE game_id = ?1
        ORDER BY
          CASE status WHEN 'tracked' THEN 0 ELSE 1 END,
          updated_at DESC,
          id DESC
        LIMIT 1
        ",
                params![game_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?;

        let Some(keeper_id) = keeper_id else {
            continue;
        };

        tx.execute(
            "
      UPDATE executables
      SET status = 'tracked', updated_at = ?3
      WHERE id = ?1 AND game_id = ?2
      ",
            params![keeper_id, game_id, now_ts()],
        )?;

        removed_total += tx.execute(
            "
      DELETE FROM executables
      WHERE game_id = ?1 AND id <> ?2
      ",
            params![game_id, keeper_id],
        )?;
    }

    tx.execute(
        "
    INSERT INTO settings (key, value, updated_at)
    VALUES ('legacy_executable_cleanup_v1', 'done', ?1)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
    ",
        params![now_ts()],
    )?;

    tx.commit()?;
    Ok(removed_total)
}

fn get_setting(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
}

fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "
    INSERT INTO settings (key, value, updated_at)
    VALUES (?1, ?2, ?3)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
    ",
        params![key, value, now_ts()],
    )?;
    Ok(())
}

fn get_igdb_auth(conn: &Connection) -> Result<IgdbAuth, String> {
    let stored_client_id = get_setting(conn, "igdb_client_id").map_err(|err| err.to_string())?;
    let stored_client_secret =
        get_setting(conn, "igdb_client_secret").map_err(|err| err.to_string())?;

    let client_id = stored_client_id
        .filter(|value| !value.trim().is_empty())
        .or_else(|| std::env::var("IGDB_CLIENT_ID").ok())
        .ok_or_else(|| "IGDB Client ID is not configured".to_string())?;
    let client_secret = stored_client_secret
        .filter(|value| !value.trim().is_empty())
        .or_else(|| std::env::var("IGDB_CLIENT_SECRET").ok())
        .ok_or_else(|| "IGDB Client Secret is not configured".to_string())?;

    let client = Client::new();
    let token = client
        .post("https://id.twitch.tv/oauth2/token")
        .query(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("grant_type", "client_credentials"),
        ])
        .send()
        .map_err(|err| format!("failed to request Twitch token: {err}"))?
        .error_for_status()
        .map_err(|err| format!("Twitch token request failed: {err}"))?
        .json::<TwitchTokenResponse>()
        .map_err(|err| format!("failed to read Twitch token response: {err}"))?;

    Ok(IgdbAuth {
        client_id,
        access_token: token.access_token,
    })
}

fn call_igdb_api<T: serde::de::DeserializeOwned>(
    conn: &Connection,
    endpoint: &str,
    body: String,
) -> Result<T, String> {
    let client = Client::new();
    let stored_client_id = get_setting(conn, "igdb_client_id").ok().flatten();
    let stored_client_secret = get_setting(conn, "igdb_client_secret").ok().flatten();

    let has_custom_keys = stored_client_id
        .as_deref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
        && stored_client_secret
            .as_deref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);

    if has_custom_keys {
        let auth = get_igdb_auth(conn)?;
        client
            .post(format!("https://api.igdb.com/v4/{endpoint}"))
            .header("Client-ID", auth.client_id)
            .header("Authorization", format!("Bearer {}", auth.access_token))
            .header("Accept", "application/json")
            .body(body)
            .send()
            .map_err(|err| format!("failed to query IGDB: {err}"))?
            .error_for_status()
            .map_err(|err| format!("IGDB request failed: {err}"))?
            .json::<T>()
            .map_err(|err| format!("failed to parse IGDB response: {err}"))
    } else {
        client
            .post("https://igdb-proxy-phi.vercel.app/api/igdb")
            .header("x-endpoint", endpoint)
            .header("Content-Type", "text/plain")
            .body(body)
            .send()
            .map_err(|err| format!("failed to query IGDB proxy: {err}"))?
            .error_for_status()
            .map_err(|err| format!("IGDB proxy request failed: {err}"))?
            .json::<T>()
            .map_err(|err| format!("failed to parse IGDB proxy response: {err}"))
    }
}

fn normalize_exe_name(name: &str) -> String {
    name.trim().to_ascii_lowercase()
}

fn normalize_exe_path(path: &str) -> String {
    path.trim()
        .trim_matches('"')
        .replace('/', "\\")
        .to_ascii_lowercase()
}

fn display_exe_path(path: &str) -> String {
    path.trim().trim_matches('"').replace('/', "\\")
}

fn restore_windows_path_case(path: &str) -> String {
    let normalized = display_exe_path(path);
    let Some((drive, rest)) = normalized.split_once(':') else {
        return normalized;
    };

    let drive_prefix = format!("{}:", drive.to_ascii_uppercase());
    let mut current = PathBuf::from(format!("{drive_prefix}\\"));
    let mut resolved_parts = Vec::new();

    for raw_part in rest.split('\\').filter(|part| !part.is_empty()) {
        let mut matched = None;
        if let Ok(entries) = fs::read_dir(&current) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.eq_ignore_ascii_case(raw_part) {
                    matched = Some(name);
                    break;
                }
            }
        }

        let part = matched.unwrap_or_else(|| raw_part.to_string());
        current.push(&part);
        resolved_parts.push(part);
    }

    if resolved_parts.is_empty() {
        format!("{drive_prefix}\\")
    } else {
        format!("{drive_prefix}\\{}", resolved_parts.join("\\"))
    }
}

fn process_snapshot() -> Vec<(String, String)> {
    let mut system = System::new_all();
    system.refresh_processes();

    let mut seen = HashSet::new();
    let mut processes = Vec::new();

    for process in system.processes().values() {
        let exe_name = normalize_exe_name(process.name());
        if exe_name.is_empty() {
            continue;
        }

        let exe_path = process
            .exe()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
        let exe_path = normalize_exe_path(&exe_path);
        let key = format!("{exe_name}\n{exe_path}");
        if seen.insert(key) {
            processes.push((exe_name, exe_path));
        }
    }

    processes.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
    processes
}

fn lookup_executable(
    conn: &Connection,
    exe_name: &str,
    exe_path: &str,
) -> rusqlite::Result<Option<(i64, i64, String, String)>> {
    conn.query_row(
        "
      SELECT e.id, e.game_id, g.name, e.status
      FROM executables e
      LEFT JOIN games g ON g.id = e.game_id
      WHERE e.exe_name = ?1 AND e.exe_path = ?2
      ",
        params![exe_name, exe_path],
        |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<i64>>(1)?.unwrap_or_default(),
                row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                row.get::<_, String>(3)?,
            ))
        },
    )
    .optional()
}

fn load_game_record(conn: &Connection, game_id: i64) -> Result<Option<GameRecord>, String> {
    conn.query_row(
        "
      SELECT
        name,
        store,
        cover_url,
        cover_position_x,
        cover_position_y,
        cover_zoom,
        backdrop_url,
        steam_header_url,
        backdrop_position_x,
        backdrop_position_y,
        backdrop_zoom,
        title_logo_url,
        use_title_logo,
        title_logo_position_x,
        title_logo_position_y,
        title_logo_zoom,
        summary,
        release_year,
        genres_json,
        platforms_json,
        developers_json,
        publishers_json,
        age_rating_json,
        playtime_adjustment_seconds,
        igdb_id,
        steam_appid,
        steam_assets_json,
        is_favorite,
        metadata_locked,
        created_at,
        updated_at,
        COALESCE(completion_status, 'Backlog') AS completion_status,
        user_rating,
        user_review
      FROM games
      WHERE id = ?1
      ",
        params![game_id],
        |row| {
            Ok(GameRecord {
                name: row.get(0)?,
                store: row.get(1)?,
                cover_url: row.get(2)?,
                cover_position_x: row.get(3)?,
                cover_position_y: row.get(4)?,
                cover_zoom: row.get(5)?,
                backdrop_url: row.get(6)?,
                steam_header_url: row.get(7)?,
                backdrop_position_x: row.get(8)?,
                backdrop_position_y: row.get(9)?,
                backdrop_zoom: row.get(10)?,
                title_logo_url: row.get(11)?,
                use_title_logo: row.get::<_, i64>(12)? != 0,
                title_logo_position_x: row.get(13)?,
                title_logo_position_y: row.get(14)?,
                title_logo_zoom: row.get(15)?,
                summary: row.get(16)?,
                release_year: row.get(17)?,
                genres_json: row.get(18)?,
                platforms_json: row.get(19)?,
                developers_json: row.get(20)?,
                publishers_json: row.get(21)?,
                age_rating_json: row.get(22)?,
                playtime_adjustment_seconds: row.get(23)?,
                igdb_id: row.get(24)?,
                steam_appid: row.get(25)?,
                steam_assets_json: row.get(26)?,
                is_favorite: row.get::<_, i64>(27)? != 0,
                metadata_locked: row.get::<_, i64>(28)? != 0,
                created_at: row.get(29)?,
                updated_at: row.get(30)?,
                completion_status: row.get(31)?,
                user_rating: row.get(32)?,
                user_review: row.get(33)?,
            })
        },
    )
    .optional()
    .map_err(|err| err.to_string())
}

fn load_archived_game_record(
    conn: &Connection,
    archive_id: i64,
) -> Result<Option<ArchivedGameRecord>, String> {
    conn.query_row(
        "
      SELECT
        id,
        name,
        store,
        cover_url,
        cover_position_x,
        cover_position_y,
        cover_zoom,
        backdrop_url,
        steam_header_url,
        backdrop_position_x,
        backdrop_position_y,
        backdrop_zoom,
        title_logo_url,
        use_title_logo,
        title_logo_position_x,
        title_logo_position_y,
        title_logo_zoom,
        summary,
        release_year,
        genres_json,
        platforms_json,
        developers_json,
        publishers_json,
        age_rating_json,
        playtime_adjustment_seconds,
        igdb_id,
        steam_appid,
        steam_assets_json,
        is_favorite,
        metadata_locked,
        created_at,
        updated_at,
        COALESCE(completion_status, 'Backlog') AS completion_status,
        user_rating,
        user_review
      FROM archive_games
      WHERE id = ?1
      ",
        params![archive_id],
        |row| {
            Ok(ArchivedGameRecord {
                archive_id: row.get(0)?,
                record: GameRecord {
                    name: row.get(1)?,
                    store: row.get(2)?,
                    cover_url: row.get(3)?,
                    cover_position_x: row.get(4)?,
                    cover_position_y: row.get(5)?,
                    cover_zoom: row.get(6)?,
                    backdrop_url: row.get(7)?,
                    steam_header_url: row.get(8)?,
                    backdrop_position_x: row.get(9)?,
                    backdrop_position_y: row.get(10)?,
                    backdrop_zoom: row.get(11)?,
                    title_logo_url: row.get(12)?,
                    use_title_logo: row.get::<_, i64>(13)? != 0,
                    title_logo_position_x: row.get(14)?,
                    title_logo_position_y: row.get(15)?,
                    title_logo_zoom: row.get(16)?,
                    summary: row.get(17)?,
                    release_year: row.get(18)?,
                    genres_json: row.get(19)?,
                    platforms_json: row.get(20)?,
                    developers_json: row.get(21)?,
                    publishers_json: row.get(22)?,
                    age_rating_json: row.get(23)?,
                    playtime_adjustment_seconds: row.get(24)?,
                    igdb_id: row.get(25)?,
                    steam_appid: row.get(26)?,
                    steam_assets_json: row.get(27)?,
                    is_favorite: row.get::<_, i64>(28)? != 0,
                    metadata_locked: row.get::<_, i64>(29)? != 0,
                    created_at: row.get(30)?,
                    updated_at: row.get(31)?,
                    completion_status: row.get(32)?,
                    user_rating: row.get(33)?,
                    user_review: row.get(34)?,
                },
            })
        },
    )
    .optional()
    .map_err(|err| err.to_string())
}

fn load_game_executables(conn: &Connection, game_id: i64) -> Result<Vec<ExecutableRecord>, String> {
    let mut stmt = conn
        .prepare(
            "
      SELECT exe_name, exe_path, exe_path_display, status, created_at, updated_at
      FROM executables
      WHERE game_id = ?1
      ORDER BY
        CASE status WHEN 'tracked' THEN 0 ELSE 1 END,
        updated_at DESC,
        id DESC
      ",
        )
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map(params![game_id], |row| {
            Ok(ExecutableRecord {
                exe_name: row.get(0)?,
                exe_path: row.get(1)?,
                exe_path_display: row.get(2)?,
                status: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|err| err.to_string())?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| err.to_string())
}

fn archive_game(
    main_conn: &mut Connection,
    archive_conn: &mut Connection,
    game_id: i64,
) -> Result<(), String> {
    let Some(game) = load_game_record(main_conn, game_id)? else {
        return Err("game not found".to_string());
    };
    let executables = load_game_executables(main_conn, game_id)?;
    let primary_exe_name = executables
        .iter()
        .find(|item| item.status == "tracked")
        .or_else(|| executables.first())
        .map(|item| item.exe_name.clone());
    let manual_fingerprint = primary_exe_name
        .as_deref()
        .map(|exe_name| build_manual_fingerprint(&game.name, exe_name, game.store.as_deref()));

    let tx = archive_conn
        .unchecked_transaction()
        .map_err(|err| err.to_string())?;
    tx.execute(
        "
    INSERT INTO archive_games (
      source_game_id, name, normalized_name, store, cover_url, cover_position_x, cover_position_y,
      cover_zoom, backdrop_url, steam_header_url, backdrop_position_x, backdrop_position_y, backdrop_zoom,
      title_logo_url, use_title_logo, title_logo_position_x, title_logo_position_y, title_logo_zoom, summary,
      release_year, genres_json, platforms_json, developers_json, publishers_json, age_rating_json,
      playtime_adjustment_seconds, igdb_id, steam_appid, steam_assets_json, is_favorite, metadata_locked, primary_exe_name,
      manual_fingerprint, created_at, updated_at, archived_at, completion_status
    ) VALUES (
      ?1, ?2, ?3, ?4, ?5, ?6, ?7,
      ?8, ?9, ?10, ?11, ?12, ?13, ?14,
      ?15, ?16, ?17, ?18, ?19, ?20,
      ?21, ?22, ?23, ?24, ?25, ?26, ?27,
      ?28, ?29, ?30, ?31, ?32, ?33,
      ?34, ?35, ?36, ?37
    )
    ",
        params![
            game_id,
            game.name,
            normalize_game_name_for_match(&game.name),
            game.store,
            game.cover_url,
            game.cover_position_x,
            game.cover_position_y,
            game.cover_zoom,
            game.backdrop_url,
            game.steam_header_url,
            game.backdrop_position_x,
            game.backdrop_position_y,
            game.backdrop_zoom,
            game.title_logo_url,
            if game.use_title_logo { 1 } else { 0 },
            game.title_logo_position_x,
            game.title_logo_position_y,
            game.title_logo_zoom,
            game.summary,
            game.release_year,
            game.genres_json,
            game.platforms_json,
            game.developers_json,
            game.publishers_json,
            game.age_rating_json,
            game.playtime_adjustment_seconds,
            game.igdb_id,
            game.steam_appid,
            game.steam_assets_json,
            if game.is_favorite { 1 } else { 0 },
            if game.metadata_locked { 1 } else { 0 },
            primary_exe_name,
            manual_fingerprint,
            game.created_at,
            game.updated_at,
            now_ts(),
            game.completion_status
        ],
    )
    .map_err(|err| err.to_string())?;

    let archive_game_id = tx.last_insert_rowid();

    for executable in executables {
        tx.execute(
            "
      INSERT INTO archive_executables (
        archive_game_id, exe_name, exe_path, exe_path_display, status, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ",
            params![
                archive_game_id,
                executable.exe_name,
                executable.exe_path,
                executable.exe_path_display,
                executable.status,
                executable.created_at,
                executable.updated_at
            ],
        )
        .map_err(|err| err.to_string())?;
    }

    let mut stmt = main_conn
        .prepare(
            "
      SELECT id, started_at, ended_at, duration_seconds, note
      FROM sessions
      WHERE game_id = ?1
      ORDER BY started_at ASC, id ASC
      ",
        )
        .map_err(|err| err.to_string())?;
    let sessions = stmt
        .query_map(params![game_id], |row| {
            Ok(SessionRow {
                id: row.get(0)?,
                started_at: row.get(1)?,
                ended_at: row.get(2)?,
                duration_seconds: row.get(3)?,
                note: row.get(4)?,
            })
        })
        .map_err(|err| err.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| err.to_string())?;
    drop(stmt);

    for session in sessions {
        tx.execute(
            "
      INSERT INTO archive_sessions (archive_game_id, started_at, ended_at, duration_seconds, note)
      VALUES (?1, ?2, ?3, ?4, ?5)
      ",
            params![
                archive_game_id,
                session.started_at,
                session.ended_at,
                session.duration_seconds,
                session.note,
            ],
        )
        .map_err(|err| err.to_string())?;
    }

    tx.commit().map_err(|err| err.to_string())
}

fn find_archived_game_candidate(
    archive_conn: &Connection,
    game_name: &str,
    exe_name: &str,
    store: Option<&str>,
    igdb_id: Option<i64>,
) -> Result<Option<i64>, String> {
    if let Some(igdb_id) = igdb_id {
        return archive_conn
      .query_row(
        "SELECT id FROM archive_games WHERE igdb_id = ?1 ORDER BY archived_at DESC, id DESC LIMIT 1",
        params![igdb_id],
        |row| row.get::<_, i64>(0),
      )
      .optional()
      .map_err(|err| err.to_string());
    }

    let normalized_name = normalize_game_name_for_match(game_name);
    let fingerprint = build_manual_fingerprint(game_name, exe_name, store);
    let normalized_store = store
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty());

    let exact = archive_conn
        .query_row(
            "
      SELECT id
      FROM archive_games
      WHERE igdb_id IS NULL
        AND manual_fingerprint = ?1
      ORDER BY archived_at DESC, id DESC
      LIMIT 1
      ",
            params![fingerprint],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;

    if exact.is_some() {
        return Ok(exact);
    }

    if let Some(normalized_store) = normalized_store {
        let store_and_exe_match = archive_conn
            .query_row(
                "
        SELECT id
        FROM archive_games
        WHERE igdb_id IS NULL
          AND normalized_name = ?1
          AND primary_exe_name = ?2
          AND LOWER(COALESCE(store, '')) = ?3
        ORDER BY archived_at DESC, id DESC
        LIMIT 1
        ",
                params![normalized_name, exe_name, normalized_store],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(|err| err.to_string())?;

        if store_and_exe_match.is_some() {
            return Ok(store_and_exe_match);
        }
    }

    let exe_match = archive_conn
        .query_row(
            "
      SELECT id
      FROM archive_games
      WHERE igdb_id IS NULL
        AND normalized_name = ?1
        AND primary_exe_name = ?2
      ORDER BY archived_at DESC, id DESC
      LIMIT 1
      ",
            params![normalized_name, exe_name],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;

    if exe_match.is_some() {
        return Ok(exe_match);
    }

    archive_conn
        .query_row(
            "
      SELECT id
      FROM archive_games
      WHERE igdb_id IS NULL
        AND normalized_name = ?1
      ORDER BY archived_at DESC, id DESC
      LIMIT 1
      ",
            params![normalized_name],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|err| err.to_string())
}

fn restore_archived_game(
    main_conn: &mut Connection,
    archive_conn: &Connection,
    archive_id: i64,
    exe_name: &str,
    exe_path: &str,
    exe_path_display: &str,
) -> Result<(), String> {
    let Some(archived) = load_archived_game_record(archive_conn, archive_id)? else {
        return Err("archived game not found".to_string());
    };

    let tx = main_conn
        .unchecked_transaction()
        .map_err(|err| err.to_string())?;
    tx.execute(
    "
    INSERT INTO games (
      name, store, cover_url, cover_position_x, cover_position_y, cover_zoom, backdrop_url,
      steam_header_url, backdrop_position_x, backdrop_position_y, backdrop_zoom, title_logo_url, use_title_logo, title_logo_position_x,
      title_logo_position_y, title_logo_zoom, summary, release_year, genres_json,
      platforms_json, developers_json, publishers_json, age_rating_json, playtime_adjustment_seconds,
      igdb_id, steam_appid, steam_assets_json, is_favorite, metadata_locked, created_at, updated_at, completion_status
    ) VALUES (
      ?1, ?2, ?3, ?4, ?5, ?6, ?7,
      ?8, ?9, ?10, ?11, ?12, ?13, ?14,
      ?15, ?16, ?17, ?18, ?19, ?20, ?21,
      ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32
    )
    ",
    params![
      archived.record.name,
      archived.record.store,
      archived.record.cover_url,
      archived.record.cover_position_x,
      archived.record.cover_position_y,
      archived.record.cover_zoom,
      archived.record.backdrop_url,
      archived.record.steam_header_url,
      archived.record.backdrop_position_x,
      archived.record.backdrop_position_y,
      archived.record.backdrop_zoom,
      archived.record.title_logo_url,
      if archived.record.use_title_logo { 1 } else { 0 },
      archived.record.title_logo_position_x,
      archived.record.title_logo_position_y,
      archived.record.title_logo_zoom,
      archived.record.summary,
      archived.record.release_year,
      archived.record.genres_json,
      archived.record.platforms_json,
      archived.record.developers_json,
      archived.record.publishers_json,
      archived.record.age_rating_json,
      archived.record.playtime_adjustment_seconds,
      archived.record.igdb_id,
      archived.record.steam_appid,
      archived.record.steam_assets_json,
      if archived.record.is_favorite { 1 } else { 0 },
      if archived.record.metadata_locked { 1 } else { 0 },
      archived.record.created_at,
      now_ts(),
      archived.record.completion_status
    ],
  )
  .map_err(|err| err.to_string())?;
    let game_id = tx.last_insert_rowid();

    tx.execute(
    "
    INSERT INTO executables (game_id, exe_name, exe_path, exe_path_display, status, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, 'tracked', ?5, ?6)
    ",
    params![game_id, exe_name, exe_path, exe_path_display, now_ts(), now_ts()],
  )
  .map_err(|err| err.to_string())?;

    let mut stmt = archive_conn
        .prepare(
            "
      SELECT id, started_at, ended_at, duration_seconds, note
      FROM archive_sessions
      WHERE archive_game_id = ?1
      ORDER BY started_at ASC, id ASC
      ",
        )
        .map_err(|err| err.to_string())?;
    let sessions = stmt
        .query_map(params![archived.archive_id], |row| {
            Ok(SessionRow {
                id: row.get(0)?,
                started_at: row.get(1)?,
                ended_at: row.get(2)?,
                duration_seconds: row.get(3)?,
                note: row.get(4)?,
            })
        })
        .map_err(|err| err.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| err.to_string())?;
    drop(stmt);

    for session in sessions {
        tx.execute(
            "
      INSERT INTO sessions (game_id, executable_id, started_at, ended_at, duration_seconds, note)
      VALUES (?1, NULL, ?2, ?3, ?4, ?5)
      ",
            params![
                game_id,
                session.started_at,
                session.ended_at,
                session.duration_seconds,
                session.note,
            ],
        )
        .map_err(|err| err.to_string())?;
    }

    tx.commit().map_err(|err| err.to_string())?;

    archive_conn
        .execute(
            "DELETE FROM archive_games WHERE id = ?1",
            params![archived.archive_id],
        )
        .map_err(|err| err.to_string())?;

    Ok(())
}

fn scan_once(state: &AppState) -> Result<bool, String> {
    let snapshot = process_snapshot();
    let now = now_ts();
    let mut live_tracked_ids = HashSet::new();
    let mut changed = false;

    {
        let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
        let mut tracker = state.tracker.lock().map_err(|_| "tracker lock poisoned")?;

        for (exe_name, exe_path) in &snapshot {
            let Some((executable_id, game_id, game_name, status)) =
                lookup_executable(&conn, exe_name, exe_path).map_err(|err| err.to_string())?
            else {
                continue;
            };

            if status != "tracked" || game_id == 0 {
                continue;
            }

            live_tracked_ids.insert(executable_id);
            if !tracker.active.contains_key(&executable_id) {
                conn.execute(
                    "INSERT INTO sessions (game_id, executable_id, started_at) VALUES (?1, ?2, ?3)",
                    params![game_id, executable_id, now],
                )
                .map_err(|err| err.to_string())?;

                let _ = conn.execute(
                    "UPDATE games SET completion_status = 'In Progress' WHERE id = ?1 AND completion_status = 'Backlog'",
                    params![game_id],
                );

                let session_id = conn.last_insert_rowid();
                tracker.active.insert(
                    executable_id,
                    ActiveSession {
                        session_id,
                        game_id,
                        game_name,
                        exe_name: exe_name.clone(),
                        exe_path: exe_path.clone(),
                        started_at: now,
                    },
                );
                changed = true;
            }
        }

        let ended_ids: Vec<i64> = tracker
            .active
            .keys()
            .copied()
            .filter(|id| !live_tracked_ids.contains(id))
            .collect();

        for executable_id in ended_ids {
            if let Some(active) = tracker.active.remove(&executable_id) {
                let duration = (now - active.started_at).max(0);
                conn.execute(
                    "UPDATE sessions SET ended_at = ?1, duration_seconds = ?2 WHERE id = ?3",
                    params![now, duration, active.session_id],
                )
                .map_err(|err| err.to_string())?;

                let _ = conn.execute(
                    "UPDATE games SET completion_status = 'In Progress' WHERE id = ?1 AND completion_status = 'Backlog'",
                    params![active.game_id],
                );

                insert_notification(&conn, "played", &active.game_name, now)?;
                changed = true;
            }
        }
    }

    Ok(changed)
}

fn finalize_active_sessions(
    conn: &Connection,
    tracker: &mut TrackerState,
    ended_at: i64,
) -> Result<usize, String> {
    let active_sessions = tracker
        .active
        .drain()
        .map(|(_, active)| active)
        .collect::<Vec<_>>();

    for active in &active_sessions {
        let duration = (ended_at - active.started_at).max(0);
        conn.execute(
            "UPDATE sessions SET ended_at = ?1, duration_seconds = ?2 WHERE id = ?3",
            params![ended_at, duration, active.session_id],
        )
        .map_err(|err| err.to_string())?;
        insert_notification(conn, "played", &active.game_name, ended_at)?;
    }

    Ok(active_sessions.len())
}

fn confirm_exit_with_active_sessions(app: &AppHandle, code: Option<i32>) -> bool {
    let state = app.state::<AppState>();
    if let Err(err) = scan_once(&state) {
        log::warn!("failed to refresh active sessions before exit confirmation: {err}");
    }
    let active_count = match state.tracker.lock() {
        Ok(tracker) => tracker.active.len(),
        Err(_) => {
            log::warn!("failed to lock tracker while confirming exit");
            return true;
        }
    };

    if active_count == 0 {
        return true;
    }

    let action_label = if code == Some(RESTART_EXIT_CODE) {
        "restart"
    } else {
        "close"
    };
    let session_label = if active_count == 1 {
        "session"
    } else {
        "sessions"
    };
    let description = format!(
        "{active_count} game {session_label} is still running.\n\nIf you continue, TylePlay will save the current playtime and {action_label} the application."
    );
    let confirmed = matches!(
        rfd::MessageDialog::new()
            .set_title("Confirm Exit")
            .set_description(&description)
            .set_level(rfd::MessageLevel::Warning)
            .set_buttons(rfd::MessageButtons::OkCancel)
            .show(),
        rfd::MessageDialogResult::Ok | rfd::MessageDialogResult::Yes
    );

    if !confirmed {
        return false;
    }

    let ended_at = now_ts();
    let Ok(conn) = state.db.lock() else {
        log::warn!("failed to lock database while finalizing active sessions on exit");
        return true;
    };
    let Ok(mut tracker) = state.tracker.lock() else {
        log::warn!("failed to lock tracker while finalizing active sessions on exit");
        return true;
    };

    if let Err(err) = finalize_active_sessions(&conn, &mut tracker, ended_at) {
        log::warn!("failed to finalize active sessions on exit: {err}");
    }

    true
}

fn request_confirmed_app_exit(app: &AppHandle, code: Option<i32>) {
    let state = app.state::<AppState>();
    let mut exit_guard = match state.exit_guard.lock() {
        Ok(guard) => guard,
        Err(_) => {
            log::warn!("failed to lock exit guard while requesting app exit");
            return;
        }
    };

    if *exit_guard {
        return;
    }

    if !confirm_exit_with_active_sessions(app, code) {
        return;
    }

    *exit_guard = true;
    drop(exit_guard);

    if code == Some(RESTART_EXIT_CODE) {
        app.restart();
    } else {
        app.exit(code.unwrap_or(0));
    }
}

fn default_user_avatar_data_url() -> String {
    let svg = r##"
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#bac6d6"/>
          <stop offset="100%" stop-color="#6e7b8d"/>
        </linearGradient>
        <linearGradient id="coat" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f1721"/>
          <stop offset="100%" stop-color="#202b39"/>
        </linearGradient>
      </defs>
      <rect width="240" height="240" rx="120" fill="url(#bg)"/>
      <circle cx="120" cy="96" r="46" fill="#e5bf9e"/>
      <path d="M74 206c8-32 28-54 46-63h0c20 3 44 30 46 63Z" fill="url(#coat)"/>
      <path d="M78 90c3-28 25-49 50-49 27 0 48 20 50 49-3-4-8-8-14-10-10-4-21-4-30-2-15 4-29 10-56 12Z" fill="#111821"/>
      <path d="M88 95c8 0 15-5 17-12 4 9 14 14 24 14 11 0 20-5 24-13 4 7 11 12 18 12v18c0 30-21 53-51 53-29 0-50-23-50-53Z" fill="#efc7a3"/>
      <path d="M103 114c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9Zm34 0c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9Z" fill="#fff" opacity=".18"/>
      <path d="M105 145c11 7 20 7 31 0" stroke="#b2745c" stroke-width="4" fill="none" stroke-linecap="round"/>
    </svg>
  "##;
    format!(
        "data:image/svg+xml;utf8,{}",
        urlencoding::encode(svg.trim())
    )
}

fn now_display_string() -> String {
    Local::now().format("%b %-d, %Y %-I:%M %p").to_string()
}

fn truncate_tray_menu_label(value: &str, max_chars: usize) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let total_chars = trimmed.chars().count();
    if total_chars <= max_chars {
        return trimmed.to_string();
    }

    let safe_len = max_chars.saturating_sub(3);
    let mut truncated = String::with_capacity(max_chars);
    for ch in trimmed.chars().take(safe_len) {
        truncated.push(ch);
    }
    truncated.push_str("...");
    truncated
}

fn date_display_string() -> String {
    Local::now().format("%b %-d, %Y").to_string()
}

fn pseudo_random_alphanumeric(len: usize) -> String {
    const CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut value = now_ts().unsigned_abs()
        ^ u64::from(Local::now().timestamp_subsec_nanos())
        ^ 0xA5A5_5A5A_u64;
    let mut output = String::with_capacity(len);
    for _ in 0..len {
        let index = (value % CHARSET.len() as u64) as usize;
        output.push(CHARSET[index] as char);
        value = value.rotate_left(7) ^ 0x9E37_79B9_7F4A_7C15_u64;
    }
    output
}

fn generate_local_user_id() -> String {
    let now = Local::now();
    format!(
        "TP-{}-{}-1-{}",
        now.format("%y"),
        now.format("%m"),
        pseudo_random_alphanumeric(5)
    )
}

fn generate_local_user_id_from_member_since(member_since: &str) -> String {
    let year_month = NaiveDate::parse_from_str(member_since.trim(), "%b %e, %Y")
        .map(|date| (date.format("%y").to_string(), date.format("%m").to_string()))
        .unwrap_or_else(|_| {
            let now = Local::now();
            (now.format("%y").to_string(), now.format("%m").to_string())
        });

    format!(
        "TP-{}-{}-1-{}",
        year_month.0,
        year_month.1,
        pseudo_random_alphanumeric(5)
    )
}

fn is_legacy_user_id(user_id: &str) -> bool {
    let trimmed = user_id.trim();
    trimmed.is_empty() || trimmed.starts_with("PT-")
}

fn default_user_settings() -> UserSettings {
    UserSettings {
        full_name: "".to_string(),
        username: "".to_string(),
        display_name: "".to_string(),
        bio: "".to_string(),
        email: "".to_string(),
        phone: "".to_string(),
        github: "".to_string(),
        instagram: "".to_string(),
        facebook: "".to_string(),
        telegram: "".to_string(),
        language: "English".to_string(),
        timezone: "(GMT+7) Jakarta".to_string(),
        date_format: date_display_string(),
        time_format: "12 Hour (07:30 PM)".to_string(),
        member_since: "-".to_string(),
        last_login: "-".to_string(),
        account_status: "Inactive".to_string(),
        user_id: "-".to_string(),
        avatar_data_url: default_user_avatar_data_url(),
    }
}

fn is_auto_default_or_legacy_user_settings(settings: &UserSettings) -> bool {
    let fn_lower = settings.full_name.trim().to_lowercase();
    let un_lower = settings.username.trim().to_lowercase();
    let em_lower = settings.email.trim().to_lowercase();
    fn_lower == "alex moons"
        || fn_lower == "rivay ramadhan"
        || un_lower == "alexmoons"
        || un_lower == "rivay.dev"
        || em_lower == "alexmoons.artyle@gmail.com"
        || em_lower == "rivay.dev@gmail.com"
}

fn normalize_social_handle(value: &str, domain_prefix: &str, strip_at: bool) -> String {
    let mut normalized = value.trim().to_string();
    if let Some(rest) = normalized.strip_prefix("https://") {
        normalized = rest.to_string();
    } else if let Some(rest) = normalized.strip_prefix("http://") {
        normalized = rest.to_string();
    }
    if let Some(rest) = normalized.strip_prefix("www.") {
        normalized = rest.to_string();
    }
    if normalized
        .to_lowercase()
        .starts_with(&domain_prefix.to_lowercase())
    {
        normalized = normalized[domain_prefix.len()..].to_string();
    }
    normalized = normalized.trim_start_matches('/').to_string();
    if strip_at {
        normalized = normalized.trim_start_matches('@').to_string();
    }
    normalized
}

fn normalize_user_settings(mut settings: UserSettings) -> UserSettings {
    settings.full_name = settings.full_name.trim().to_string();
    settings.username = settings.username.trim().to_string();
    settings.display_name = settings.display_name.trim().to_string();
    settings.bio = settings.bio.trim().to_string();
    settings.email = settings.email.trim().to_string();
    settings.phone = settings.phone.trim().to_string();
    settings.github = normalize_social_handle(&settings.github, "github.com/", false);
    settings.instagram = normalize_social_handle(&settings.instagram, "instagram.com/", false);
    settings.facebook = normalize_social_handle(&settings.facebook, "facebook.com/", false);
    settings.telegram = normalize_social_handle(&settings.telegram, "t.me/", true);
    settings.language = if settings.language.trim().is_empty() {
        "English".to_string()
    } else {
        settings.language.trim().to_string()
    };
    settings.timezone = if settings.timezone.trim().is_empty() {
        "(GMT+7) Jakarta".to_string()
    } else {
        settings.timezone.trim().to_string()
    };
    settings.date_format = if settings.date_format.trim().is_empty() {
        date_display_string()
    } else {
        settings.date_format.trim().to_string()
    };
    settings.time_format = if settings.time_format.trim().is_empty() {
        "12 Hour (07:30 PM)".to_string()
    } else {
        settings.time_format.trim().to_string()
    };
    let is_created = !settings.full_name.is_empty()
        || !settings.username.is_empty()
        || !settings.display_name.is_empty();

    settings.member_since = if is_created && (settings.member_since.trim().is_empty() || settings.member_since.trim() == "-") {
        Local::now().format("%b %-d, %Y").to_string()
    } else {
        settings.member_since.trim().to_string()
    };
    settings.last_login = if is_created && (settings.last_login.trim().is_empty() || settings.last_login.trim() == "-") {
        now_display_string()
    } else {
        settings.last_login.trim().to_string()
    };
    settings.account_status = if is_created {
        if settings.account_status.trim().is_empty()
            || settings.account_status.trim() == "-"
            || settings.account_status.trim() == "Inactive"
        {
            "Active".to_string()
        } else {
            settings.account_status.trim().to_string()
        }
    } else {
        "Inactive".to_string()
    };
    settings.user_id = if is_created && (is_legacy_user_id(&settings.user_id) || settings.user_id.trim() == "-") {
        generate_local_user_id_from_member_since(&settings.member_since)
    } else {
        settings.user_id.trim().to_string()
    };
    if settings.avatar_data_url.trim().is_empty() {
        settings.avatar_data_url = default_user_avatar_data_url();
    }
    settings
}

fn read_user_settings(conn: &Connection) -> Result<UserSettings, String> {
    let stored = get_setting(conn, "user_settings_v1").map_err(|err| err.to_string())?;
    match stored {
        Some(raw) => {
            let parsed = serde_json::from_str::<UserSettings>(&raw)
                .unwrap_or_else(|_| default_user_settings());
            if is_auto_default_or_legacy_user_settings(&parsed) {
                let _ = conn.execute("DELETE FROM settings WHERE key = ?1", params!["user_settings_v1"]);
                Ok(default_user_settings())
            } else {
                Ok(normalize_user_settings(parsed))
            }
        }
        None => Ok(default_user_settings()),
    }
}

fn touch_user_last_login_on_startup(conn: &Connection) -> Result<(), String> {
    let stored = get_setting(conn, "user_settings_v1").map_err(|err| err.to_string())?;
    if let Some(raw) = stored {
        if let Ok(mut settings) = serde_json::from_str::<UserSettings>(&raw) {
            let is_created = !settings.full_name.trim().is_empty()
                || !settings.username.trim().is_empty()
                || !settings.display_name.trim().is_empty();

            if is_created {
                let current_session_time = now_display_string();
                let active_session = get_setting(conn, "last_login_active_session")
                    .map_err(|err| err.to_string())?;

                if let Some(prev_active) = active_session {
                    if !prev_active.trim().is_empty() {
                        settings.last_login = prev_active.trim().to_string();
                    }
                } else if settings.last_login.trim().is_empty() || settings.last_login.trim() == "-" {
                    settings.last_login = current_session_time.clone();
                }

                set_setting(conn, "last_login_active_session", &current_session_time)
                    .map_err(|err| err.to_string())?;

                let serialized = serde_json::to_string(&settings).map_err(|err| err.to_string())?;
                set_setting(conn, "user_settings_v1", &serialized).map_err(|err| err.to_string())?;
            }
        }
    }
    Ok(())
}

fn save_user_settings_record(
    conn: &Connection,
    input: SaveUserSettingsInput,
) -> Result<UserSettings, String> {
    let existing = read_user_settings(conn)?;
    let is_first_save = existing.member_since.trim().is_empty() || existing.member_since.trim() == "-";
    let now_str = now_display_string();

    let last_login = if is_first_save {
        now_str.clone()
    } else if existing.last_login.trim().is_empty() || existing.last_login.trim() == "-" {
        now_str.clone()
    } else {
        existing.last_login
    };

    if is_first_save {
        let _ = set_setting(conn, "last_login_active_session", &now_str);
    }

    let normalized = normalize_user_settings(UserSettings {
        full_name: input.full_name,
        username: input.username,
        display_name: input.display_name,
        bio: input.bio,
        email: input.email,
        phone: input.phone,
        github: input.github,
        instagram: input.instagram,
        facebook: input.facebook,
        telegram: input.telegram,
        language: input.language,
        timezone: input.timezone,
        date_format: input.date_format,
        time_format: input.time_format,
        member_since: existing.member_since,
        last_login,
        account_status: existing.account_status,
        user_id: existing.user_id,
        avatar_data_url: input.avatar_data_url,
    });
    let serialized = serde_json::to_string(&normalized).map_err(|err| err.to_string())?;
    set_setting(conn, "user_settings_v1", &serialized).map_err(|err| err.to_string())?;
    Ok(normalized)
}

fn scan_once_if_stale(state: &AppState, min_interval: Duration) -> Result<bool, String> {
    let now = Instant::now();
    let mut scan_state = match state.scan_state.try_lock() {
        Ok(guard) => guard,
        Err(TryLockError::WouldBlock) => return Ok(false),
        Err(TryLockError::Poisoned(_)) => return Err("scan state lock poisoned".to_string()),
    };

    if let Some(last_run_at) = scan_state.last_run_at {
        if now.duration_since(last_run_at) < min_interval {
            return Ok(false);
        }
    }

    scan_state.last_run_at = Some(now);
    drop(scan_state);
    scan_once(state)
}

fn start_watcher(_app: AppHandle, state: AppState) {
    thread::spawn(move || loop {
        match scan_once_if_stale(&state, Duration::from_secs(2)) {
            Ok(true) => {
                if let Err(err) = refresh_tray_menu(&_app, &state) {
                    log::warn!("tray refresh failed: {err}");
                }
            }
            Ok(false) => {}
            Err(err) => {
                log::warn!("process scan failed: {err}");
            }
        }
        thread::sleep(Duration::from_secs(3));
    });
}

fn day_start_ts() -> Result<i64, String> {
    let today = Local::now().date_naive();
    day_start_ts_for_date(today)
}

fn week_start_ts() -> Result<i64, String> {
    let today = Local::now().date_naive();
    let days_from_monday = today.weekday().num_days_from_monday() as i64;
    let monday = today - chrono::Duration::days(days_from_monday);
    day_start_ts_for_date(monday)
}

fn day_start_ts_for_date(date: chrono::NaiveDate) -> Result<i64, String> {
    Local
        .from_local_datetime(&date.and_hms_opt(0, 0, 0).ok_or("invalid local date")?)
        .single()
        .ok_or_else(|| "failed to resolve local day start".to_string())
        .map(|dt| dt.timestamp())
}

fn week_start_ts_for_timestamp(timestamp: i64) -> Result<i64, String> {
    let local_dt = Local
        .timestamp_opt(timestamp, 0)
        .single()
        .ok_or_else(|| "failed to resolve local timestamp".to_string())?;
    let date = local_dt.date_naive();
    let days_from_monday = date.weekday().num_days_from_monday() as i64;
    day_start_ts_for_date(date - chrono::Duration::days(days_from_monday))
}

fn split_range_by_local_day<F>(start_ts: i64, end_ts: i64, mut callback: F) -> Result<(), String>
where
    F: FnMut(i64, i64) -> Result<(), String>,
{
    if end_ts <= start_ts {
        return Ok(());
    }

    let mut cursor = start_ts;
    while cursor < end_ts {
        let local_dt = Local
            .timestamp_opt(cursor, 0)
            .single()
            .ok_or_else(|| "failed to resolve local timestamp".to_string())?;
        let current_day = local_dt.date_naive();
        let next_day = current_day
            .succ_opt()
            .ok_or_else(|| "failed to resolve next local day".to_string())?;
        let next_day_start = day_start_ts_for_date(next_day)?;
        let chunk_end = end_ts.min(next_day_start);
        callback(day_start_ts_for_date(current_day)?, chunk_end - cursor)?;
        cursor = chunk_end;
    }

    Ok(())
}

fn overlap_seconds(session_start: i64, session_end: i64, since: i64) -> i64 {
    (session_end.min(now_ts()) - session_start.max(since)).max(0)
}

fn played_since(conn: &Connection, since: i64, active: &[ActiveGame]) -> Result<i64, String> {
    let finished: i64 = conn
        .query_row(
            "
      SELECT COALESCE(SUM(
        CASE
          WHEN ended_at IS NULL OR ended_at <= ?1 THEN 0
          WHEN started_at < ?1 THEN ended_at - ?1
          ELSE ended_at - started_at
        END
      ), 0)
      FROM sessions
      WHERE ended_at IS NOT NULL
      ",
            params![since],
            |row| row.get(0),
        )
        .map_err(|err| err.to_string())?;

    let active_seconds = active
        .iter()
        .map(|session| overlap_seconds(session.started_at, now_ts(), since))
        .sum::<i64>();

    Ok(finished + active_seconds)
}

fn active_games_snapshot(state: &AppState) -> Result<Vec<ActiveGame>, String> {
    let now = now_ts();
    let active_sessions = {
        let tracker = state.tracker.lock().map_err(|_| "tracker lock poisoned")?;
        tracker.active.values().cloned().collect::<Vec<_>>()
    };

    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let mut stmt = conn
    .prepare("SELECT cover_url, cover_position_x, cover_position_y, cover_zoom, backdrop_url, backdrop_position_x, backdrop_position_y, backdrop_zoom FROM games WHERE id = ?1")
    .map_err(|err| err.to_string())?;

    let mut active_games = Vec::with_capacity(active_sessions.len());
    for active in active_sessions {
        let artwork = stmt
            .query_row(params![active.game_id], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<f64>>(1)?,
                    row.get::<_, Option<f64>>(2)?,
                    row.get::<_, Option<f64>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<f64>>(5)?,
                    row.get::<_, Option<f64>>(6)?,
                    row.get::<_, Option<f64>>(7)?,
                ))
            })
            .optional()
            .map_err(|err| err.to_string())?
            .unwrap_or((None, None, None, None, None, None, None, None));

        active_games.push(ActiveGame {
            game_id: active.game_id,
            session_id: active.session_id,
            name: active.game_name,
            cover_url: artwork.0,
            cover_position_x: artwork.1,
            cover_position_y: artwork.2,
            cover_zoom: artwork.3,
            backdrop_url: artwork.4,
            backdrop_position_x: artwork.5,
            backdrop_position_y: artwork.6,
            backdrop_zoom: artwork.7,
            exe_name: active.exe_name,
            exe_path: active.exe_path,
            started_at: active.started_at,
            elapsed_seconds: (now - active.started_at).max(0),
        });
    }

    Ok(active_games)
}

fn query_daily_playtime_overview(
    conn: &Connection,
    tracker: &TrackerState,
) -> Result<DailyPlaytimeOverview, String> {
    let sources = load_playtime_sources(conn, tracker)?;
    let mut totals_by_day: HashMap<i64, i64> = HashMap::new();
    let mut games_by_day: HashMap<i64, HashMap<String, i64>> = HashMap::new();

    for session in sources {
        split_range_by_local_day(
            session.started_at,
            session.ended_at,
            |day_start, seconds| {
                *totals_by_day.entry(day_start).or_default() += seconds;
                *games_by_day
                    .entry(day_start)
                    .or_default()
                    .entry(session.game_name.clone())
                    .or_default() += seconds;
                Ok(())
            },
        )?;
    }

    let mut days = totals_by_day
        .into_iter()
        .map(|(day_start, total_seconds)| {
            let mut all_games = games_by_day
                .remove(&day_start)
                .unwrap_or_default()
                .into_iter()
                .map(|(name, total_seconds)| DailyTopGame {
                    name,
                    total_seconds,
                })
                .collect::<Vec<_>>();
            all_games.sort_by(|left, right| {
                right
                    .total_seconds
                    .cmp(&left.total_seconds)
                    .then_with(|| left.name.cmp(&right.name))
            });
            let mut top_games = all_games.clone();
            top_games.truncate(3);

            DailyPlaytimeDay {
                day_start,
                total_seconds,
                top_games,
                all_games,
            }
        })
        .collect::<Vec<_>>();

    days.sort_by(|left, right| right.day_start.cmp(&left.day_start));

    Ok(DailyPlaytimeOverview { days })
}

fn query_weekly_playtime_overview(
    conn: &Connection,
    tracker: &TrackerState,
) -> Result<WeeklyPlaytimeOverview, String> {
    let sources = load_playtime_sources(conn, tracker)?;
    let mut totals_by_week: HashMap<i64, i64> = HashMap::new();
    let mut games_by_week: HashMap<i64, HashMap<String, i64>> = HashMap::new();

    for session in sources {
        split_range_by_local_day(
            session.started_at,
            session.ended_at,
            |day_start, seconds| {
                let week_start = week_start_ts_for_timestamp(day_start)?;
                *totals_by_week.entry(week_start).or_default() += seconds;
                *games_by_week
                    .entry(week_start)
                    .or_default()
                    .entry(session.game_name.clone())
                    .or_default() += seconds;
                Ok(())
            },
        )?;
    }

    let mut weeks = totals_by_week
        .into_iter()
        .map(|(week_start, total_seconds)| {
            let mut all_games = games_by_week
                .remove(&week_start)
                .unwrap_or_default()
                .into_iter()
                .map(|(name, total_seconds)| DailyTopGame {
                    name,
                    total_seconds,
                })
                .collect::<Vec<_>>();
            all_games.sort_by(|left, right| {
                right
                    .total_seconds
                    .cmp(&left.total_seconds)
                    .then_with(|| left.name.cmp(&right.name))
            });
            let mut top_games = all_games.clone();
            top_games.truncate(3);

            WeeklyPlaytimeWeek {
                week_start,
                total_seconds,
                top_games,
                all_games,
            }
        })
        .collect::<Vec<_>>();

    weeks.sort_by(|left, right| right.week_start.cmp(&left.week_start));

    Ok(WeeklyPlaytimeOverview { weeks })
}

fn load_playtime_sources(
    conn: &Connection,
    tracker: &TrackerState,
) -> Result<Vec<DailySessionSource>, String> {
    let mut stmt = conn
        .prepare(
            "
      SELECT g.name, s.started_at, s.ended_at
      FROM sessions s
      INNER JOIN games g ON g.id = s.game_id
      WHERE s.duration_seconds IS NOT NULL AND s.ended_at IS NOT NULL
      ORDER BY s.started_at DESC, s.id DESC
      ",
        )
        .map_err(|err| format!("failed to prepare daily playtime query: {err}"))?;

    let mut sources = stmt
        .query_map([], |row| {
            Ok(DailySessionSource {
                game_name: row.get(0)?,
                started_at: row.get(1)?,
                ended_at: row.get(2)?,
            })
        })
        .map_err(|err| format!("failed to read daily playtime rows: {err}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| format!("failed to collect daily playtime rows: {err}"))?;

    let now = now_ts();
    sources.extend(tracker.active.values().map(|active| DailySessionSource {
        game_name: active.game_name.clone(),
        started_at: active.started_at,
        ended_at: now,
    }));

    Ok(sources)
}

fn load_playtime_ranges(
    conn: &Connection,
    tracker: &TrackerState,
) -> Result<Vec<PlaytimeRangeSource>, String> {
    let mut stmt = conn
        .prepare(
            "
      SELECT s.started_at, s.ended_at
      FROM sessions s
      WHERE s.duration_seconds IS NOT NULL AND s.ended_at IS NOT NULL
      ORDER BY s.started_at DESC, s.id DESC
      ",
        )
        .map_err(|err| format!("failed to prepare playtime range query: {err}"))?;

    let mut sources = stmt
        .query_map([], |row| {
            Ok(PlaytimeRangeSource {
                started_at: row.get(0)?,
                ended_at: row.get(1)?,
            })
        })
        .map_err(|err| format!("failed to read playtime range rows: {err}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| format!("failed to collect playtime range rows: {err}"))?;

    let now = now_ts();
    sources.extend(tracker.active.values().map(|active| PlaytimeRangeSource {
        started_at: active.started_at,
        ended_at: now,
    }));

    Ok(sources)
}

fn query_playtime_overview(
    conn: &Connection,
    tracker: &TrackerState,
    mode: &str,
) -> Result<PlaytimeOverview, String> {
    let sources = load_playtime_ranges(conn, tracker)?;
    let normalized_mode = mode.trim().to_ascii_lowercase();
    match normalized_mode.as_str() {
        "day" => query_playtime_overview_day(&sources),
        "week" => query_playtime_overview_week(&sources),
        "month" => query_playtime_overview_month(&sources),
        _ => Err("unsupported playtime overview mode".to_string()),
    }
}

fn query_playtime_overview_day(
    sources: &[PlaytimeRangeSource],
) -> Result<PlaytimeOverview, String> {
    let today = Local::now().date_naive();
    let buckets = build_day_buckets_for_date(sources, today)?;

    Ok(PlaytimeOverview {
        mode: "day".to_string(),
        buckets,
    })
}

fn build_day_buckets_for_date(
    sources: &[PlaytimeRangeSource],
    date: chrono::NaiveDate,
) -> Result<Vec<PlaytimeOverviewBucket>, String> {
    let day_start = day_start_ts_for_date(date)?;
    let mut buckets = Vec::with_capacity(12);

    for index in 0..12 {
        let bucket_start = day_start + index * 7200;
        let bucket_end = bucket_start + 7200;
        let total_seconds = sources
            .iter()
            .map(|source| {
                overlap_range(source.started_at, source.ended_at, bucket_start, bucket_end)
            })
            .sum::<i64>();
        let start_hour = index * 2;
        let end_hour = start_hour + 2;
        buckets.push(PlaytimeOverviewBucket {
            label: format!("{start_hour:02}:00-{end_hour:02}:00"),
            short_label: format!("{start_hour:02}"),
            total_seconds,
        });
    }

    Ok(buckets)
}

fn query_playtime_overview_week(
    sources: &[PlaytimeRangeSource],
) -> Result<PlaytimeOverview, String> {
    let today = Local::now().date_naive();
    let days_from_monday = today.weekday().num_days_from_monday() as i64;
    let week_start = today - chrono::Duration::days(days_from_monday);
    let mut totals = vec![0i64; 7];
    let mut labels = Vec::with_capacity(7);

    for offset in 0..7 {
        let date = week_start + chrono::Duration::days(offset as i64);
        labels.push(date.format("%a").to_string());
        let bucket_start = day_start_ts_for_date(date)?;
        let bucket_end = bucket_start + 86400;
        totals[offset] = sources
            .iter()
            .map(|source| {
                overlap_range(source.started_at, source.ended_at, bucket_start, bucket_end)
            })
            .sum::<i64>();
    }

    Ok(PlaytimeOverview {
        mode: "week".to_string(),
        buckets: totals
            .into_iter()
            .zip(labels)
            .map(|(total_seconds, label)| PlaytimeOverviewBucket {
                short_label: label.clone(),
                label,
                total_seconds,
            })
            .collect(),
    })
}

fn query_playtime_overview_month(
    sources: &[PlaytimeRangeSource],
) -> Result<PlaytimeOverview, String> {
    let year = Local::now().year();
    let mut totals = [0i64; 12];

    for source in sources {
        split_range_by_local_day(source.started_at, source.ended_at, |day_start, seconds| {
            let local = Local
                .timestamp_opt(day_start, 0)
                .single()
                .ok_or_else(|| "failed to resolve local timestamp".to_string())?;
            let date = local.date_naive();
            if date.year() == year {
                let month_index = (date.month0()) as usize;
                totals[month_index] += seconds;
            }
            Ok(())
        })?;
    }

    let labels = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    Ok(PlaytimeOverview {
        mode: "month".to_string(),
        buckets: totals
            .into_iter()
            .enumerate()
            .map(|(index, total_seconds)| PlaytimeOverviewBucket {
                label: labels[index].to_string(),
                short_label: labels[index].to_string(),
                total_seconds,
            })
            .collect(),
    })
}

fn overlap_range(start_a: i64, end_a: i64, start_b: i64, end_b: i64) -> i64 {
    (end_a.min(end_b) - start_a.max(start_b)).max(0)
}

#[tauri::command]
fn get_dashboard(state: tauri::State<AppState>) -> Result<Dashboard, String> {
    let _ = scan_once_if_stale(&state, Duration::from_secs(2))?;
    let active_games = active_games_snapshot(&state)?;
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let recent_games = query_recent_games(&conn, Some(5), &active_games)?;

    Ok(Dashboard {
        today_seconds: played_since(&conn, day_start_ts()?, &active_games)?,
        week_seconds: played_since(&conn, week_start_ts()?, &active_games)?,
        active_games,
        recent_games,
    })
}

fn query_games(
    conn: &Connection,
    limit: Option<i64>,
    active_games: &[ActiveGame],
) -> Result<Vec<GameSummary>, String> {
    let mut active_by_game: HashMap<i64, i64> = HashMap::new();
    for active in active_games {
        *active_by_game.entry(active.game_id).or_default() += active.elapsed_seconds;
    }

    let sql = format!(
    "
      SELECT
        g.id,
        g.name,
        g.igdb_id,
        g.steam_appid,
        g.store,
        g.cover_url,
        g.steam_header_url,
        g.cover_position_x,
        g.cover_position_y,
        g.cover_zoom,
        g.backdrop_url,
        g.backdrop_position_x,
        g.backdrop_position_y,
        g.backdrop_zoom,
        g.created_at,
        g.release_year,
        (
          SELECT COALESCE(exe_path_display, exe_path)
          FROM executables
          WHERE game_id = g.id AND status = 'tracked'
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        ) AS executable_path,
        COALESCE(SUM(s.duration_seconds), 0) AS tracked_total_seconds,
        g.playtime_adjustment_seconds,
        MAX(s.ended_at) AS last_played,
        g.is_favorite,
        COUNT(DISTINCT e.id) AS executable_count,
        COALESCE(g.completion_status, 'Backlog') AS completion_status,
        g.user_rating,
        g.user_review
      FROM games g
      LEFT JOIN sessions s ON s.game_id = g.id AND s.duration_seconds IS NOT NULL
      LEFT JOIN executables e ON e.game_id = g.id AND e.status = 'tracked'
      GROUP BY g.id, g.name, g.igdb_id, g.steam_appid, g.store, g.cover_url, g.steam_header_url, g.cover_position_x, g.cover_position_y, g.cover_zoom, g.backdrop_url, g.backdrop_position_x, g.backdrop_position_y, g.backdrop_zoom, g.created_at, g.release_year, g.playtime_adjustment_seconds, g.is_favorite, g.completion_status, g.user_rating, g.user_review
      ORDER BY tracked_total_seconds + g.playtime_adjustment_seconds DESC, last_played DESC, g.name ASC
      {}
    ",
    limit.map(|value| format!("LIMIT {value}")).unwrap_or_default()
  );

    let mut stmt = conn.prepare(&sql).map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let id = row.get::<_, i64>(0)?;
            let finished_total = row.get::<_, i64>(17)?;
            let playtime_adjustment_seconds = row.get::<_, i64>(18)?;
            let raw_exe_path = row.get::<_, Option<String>>(16)?;
            let exe_exists = raw_exe_path
                .as_deref()
                .map(|path| Path::new(path).is_file())
                .unwrap_or(false);
            let executable_path = if exe_exists {
                raw_exe_path.map(|path| restore_windows_path_case(&path))
            } else {
                None
            };
            let executable_name = executable_path.as_deref().and_then(|path| {
                Path::new(path)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|s| s.to_string())
            });
            let executable_count = if exe_exists { 1i64 } else { 0i64 };

            let total_seconds = finished_total
                + active_by_game.get(&id).copied().unwrap_or_default()
                + playtime_adjustment_seconds;
            let last_played = row.get::<_, Option<i64>>(19)?;
            let completion_status = row.get::<_, String>(22)?;

            Ok(GameSummary {
                id,
                name: row.get(1)?,
                igdb_id: row.get(2)?,
                steam_appid: row.get(3)?,
                store: row.get::<_, Option<String>>(4)?,
                cover_url: row.get::<_, Option<String>>(5)?,
                steam_header_url: row.get::<_, Option<String>>(6)?,
                cover_position_x: row.get(7)?,
                cover_position_y: row.get(8)?,
                cover_zoom: row.get(9)?,
                backdrop_url: row.get::<_, Option<String>>(10)?,
                backdrop_position_x: row.get(11)?,
                backdrop_position_y: row.get(12)?,
                backdrop_zoom: row.get(13)?,
                created_at: row.get(14)?,
                release_year: row.get(15)?,
                total_seconds,
                last_played,
                finished_last_played: last_played,
                is_favorite: row.get::<_, i64>(20)? != 0,
                executable_count,
                executable_name,
                executable_path,
                tracking_status: "tracked".to_string(),
                completion_status,
                user_rating: row.get(23)?,
                user_review: row.get(24)?,
            })
        })
        .map_err(|err| err.to_string())?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| err.to_string())
}

fn query_recent_games(
    conn: &Connection,
    limit: Option<i64>,
    active_games: &[ActiveGame],
) -> Result<Vec<GameSummary>, String> {
    let mut games = query_games(conn, None, active_games)?;
    games.retain(|game| game.finished_last_played.is_some() || game.total_seconds > 0);
    games.sort_by(|a, b| {
        b.finished_last_played
            .cmp(&a.finished_last_played)
            .then(b.total_seconds.cmp(&a.total_seconds))
            .then(a.name.cmp(&b.name))
    });

    if let Some(limit) = limit {
        games.truncate(limit.max(0) as usize);
    }

    Ok(games)
}

fn query_archived_games(conn: &Connection) -> Result<Vec<ArchivedGameSummary>, String> {
    let mut stmt = conn
        .prepare(
            "
      SELECT
        g.id,
        g.name,
        g.cover_url,
        g.store,
        g.release_year,
        g.archived_at,
        g.igdb_id,
        g.primary_exe_name,
        COALESCE(SUM(s.duration_seconds), 0) + g.playtime_adjustment_seconds AS total_seconds
      FROM archive_games g
      LEFT JOIN archive_sessions s ON s.archive_game_id = g.id AND s.duration_seconds IS NOT NULL
      GROUP BY
        g.id, g.name, g.cover_url, g.store, g.release_year, g.archived_at, g.igdb_id,
        g.primary_exe_name, g.playtime_adjustment_seconds
      ORDER BY g.archived_at DESC, g.id DESC
      ",
        )
        .map_err(|err| format!("failed to prepare archive query: {err}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ArchivedGameSummary {
                archive_id: row.get(0)?,
                name: row.get(1)?,
                cover_url: row.get(2)?,
                store: row.get(3)?,
                release_year: row.get(4)?,
                archived_at: row.get(5)?,
                has_igdb_link: row.get::<_, Option<i64>>(6)?.is_some(),
                primary_exe_name: row.get(7)?,
                total_seconds: row.get(8)?,
            })
        })
        .map_err(|err| format!("failed to read archive list: {err}"))?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| format!("failed to collect archive list: {err}"))
}

fn purge_expired_archived_games(conn: &Connection) -> Result<usize, String> {
    let cutoff = now_ts() - ARCHIVE_RETENTION_SECONDS;
    conn.execute(
        "DELETE FROM archive_games WHERE archived_at <= ?1",
        params![cutoff],
    )
    .map_err(|err| format!("failed to purge expired archive games: {err}"))
}

fn query_archived_games_by_name(
    conn: &Connection,
    query: &str,
) -> Result<Vec<ArchivedGameSummary>, String> {
    let normalized_query = normalize_game_name_for_match(query);
    if normalized_query.is_empty() {
        return Ok(Vec::new());
    }

    let like_query = format!("%{normalized_query}%");
    let mut stmt = conn
        .prepare(
            "
      SELECT
        g.id,
        g.name,
        g.cover_url,
        g.store,
        g.release_year,
        g.archived_at,
        g.igdb_id,
        g.primary_exe_name,
        COALESCE(SUM(s.duration_seconds), 0) + g.playtime_adjustment_seconds AS total_seconds
      FROM archive_games g
      LEFT JOIN archive_sessions s ON s.archive_game_id = g.id AND s.duration_seconds IS NOT NULL
      WHERE g.normalized_name LIKE ?1
      GROUP BY
        g.id, g.name, g.cover_url, g.store, g.release_year, g.archived_at, g.igdb_id,
        g.primary_exe_name, g.playtime_adjustment_seconds
      ORDER BY g.archived_at DESC, g.id DESC
      LIMIT 20
      ",
        )
        .map_err(|err| format!("failed to prepare archive search query: {err}"))?;

    let rows = stmt
        .query_map(params![like_query], |row| {
            Ok(ArchivedGameSummary {
                archive_id: row.get(0)?,
                name: row.get(1)?,
                cover_url: row.get(2)?,
                store: row.get(3)?,
                release_year: row.get(4)?,
                archived_at: row.get(5)?,
                has_igdb_link: row.get::<_, Option<i64>>(6)?.is_some(),
                primary_exe_name: row.get(7)?,
                total_seconds: row.get(8)?,
            })
        })
        .map_err(|err| format!("failed to read archive search results: {err}"))?;

    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| format!("failed to collect archive search results: {err}"))
}

fn query_archived_game_detail(
    conn: &Connection,
    archive_id: i64,
) -> Result<ArchivedGameDetail, String> {
    conn.query_row(
        "
      SELECT
        g.id,
        g.name,
        g.cover_url,
        g.backdrop_url,
        g.title_logo_url,
        g.use_title_logo,
        g.title_logo_position_x,
        g.title_logo_position_y,
        g.title_logo_zoom,
        g.store,
        g.summary,
        g.release_year,
        g.genres_json,
        g.platforms_json,
        g.developers_json,
        g.publishers_json,
        g.age_rating_json,
        g.playtime_adjustment_seconds,
        g.archived_at,
        g.igdb_id,
        g.primary_exe_name,
        COALESCE((
          SELECT SUM(duration_seconds)
          FROM archive_sessions
          WHERE archive_game_id = g.id AND duration_seconds IS NOT NULL
        ), 0) + g.playtime_adjustment_seconds AS total_seconds
      FROM archive_games g
      WHERE g.id = ?1
      ",
        params![archive_id],
        |row| {
            Ok(ArchivedGameDetail {
                archive_id: row.get(0)?,
                name: row.get(1)?,
                cover_url: row.get(2)?,
                backdrop_url: row.get(3)?,
                title_logo_url: row.get(4)?,
                use_title_logo: row.get::<_, i64>(5)? != 0,
                title_logo_position_x: row.get(6)?,
                title_logo_position_y: row.get(7)?,
                title_logo_zoom: row.get(8)?,
                store: row.get(9)?,
                summary: row.get(10)?,
                release_year: row.get(11)?,
                genres: parse_json_vec(row.get(12)?),
                platforms: parse_json_vec(row.get(13)?),
                developers: parse_json_vec(row.get(14)?),
                publishers: parse_json_vec(row.get(15)?),
                age_rating: parse_json_age_rating(row.get(16)?),
                playtime_adjustment_seconds: row.get(17)?,
                archived_at: row.get(18)?,
                has_igdb_link: row.get::<_, Option<i64>>(19)?.is_some(),
                primary_exe_name: row.get(20)?,
                total_seconds: row.get(21)?,
            })
        },
    )
    .optional()
    .map_err(|err| err.to_string())?
    .ok_or_else(|| "archived game not found".to_string())
}

#[tauri::command]
fn list_games(state: tauri::State<AppState>) -> Result<Vec<GameSummary>, String> {
    let _ = scan_once_if_stale(&state, Duration::from_secs(2))?;
    let active_games = active_games_snapshot(&state)?;
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    query_games(&conn, None, &active_games)
}

#[tauri::command]
fn get_steam_small_capsules(
    app: AppHandle,
    state: tauri::State<AppState>,
    app_ids: Vec<i64>,
) -> Result<HashMap<i64, String>, String> {
    let client = Client::new();
    let mut result = HashMap::new();
    let mut seen = HashSet::new();
    let mut pending = Vec::new();

    for appid in app_ids {
        if appid <= 0 || !seen.insert(appid) {
            continue;
        }

        if let Some(cached_path) = steam_cached_asset_path(&app, appid, "small_capsule.jpg") {
            result.insert(appid, cached_path);
        } else {
            pending.push(appid);
        }
    }

    let pending_set = pending.iter().copied().collect::<HashSet<_>>();
    let mut stored_remote_urls = HashMap::<i64, String>::new();

    if !pending_set.is_empty() {
        let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
        let mut stmt = conn
            .prepare("SELECT steam_appid, steam_assets_json FROM games WHERE steam_appid IS NOT NULL")
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, Option<i64>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            })
            .map_err(|err| err.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|err| err.to_string())?;
        drop(stmt);
        drop(conn);

        for (steam_appid, steam_assets_json) in rows {
            let Some(appid) = steam_appid else {
                continue;
            };
            if !pending_set.contains(&appid) || stored_remote_urls.contains_key(&appid) {
                continue;
            }
            if let Some(url) = parse_steam_assets_json(steam_assets_json)
                .and_then(|assets| assets.small_capsule_2x_url.or(assets.small_capsule_url))
                .filter(|value| !value.trim().is_empty())
            {
                stored_remote_urls.insert(appid, url);
            }
        }
    }

    let mut fetched_remote_urls = HashMap::<i64, String>::new();

    for appid in pending {
        if let Some(url) = stored_remote_urls.get(&appid).cloned() {
            match cache_steam_asset(&app, &client, appid, "small_capsule.jpg", &url) {
                Ok(Some(cached_path)) => {
                    result.insert(appid, cached_path);
                    continue;
                }
                Ok(None) => {
                    if steam_url_looks_like_hashed_store_asset(&url) {
                        result.insert(appid, url);
                        continue;
                    }
                }
                Err(_) => {
                    if steam_url_looks_like_hashed_store_asset(&url) {
                        result.insert(appid, url);
                        continue;
                    }
                }
            }
        }

        if let Some(url) = fetch_steam_small_capsule_url(&client, appid)? {
            let resolved = cache_steam_asset(&app, &client, appid, "small_capsule.jpg", &url)
                .ok()
                .flatten()
                .unwrap_or_else(|| url.clone());
            result.insert(appid, resolved);
            fetched_remote_urls.insert(appid, url);
        }
    }

    if !fetched_remote_urls.is_empty() {
        let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
        let mut stmt = conn
            .prepare("SELECT id, steam_appid, steam_assets_json FROM games WHERE steam_appid IS NOT NULL")
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Option<i64>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })
            .map_err(|err| err.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|err| err.to_string())?;
        drop(stmt);

        for (game_id, steam_appid, steam_assets_json) in rows {
            let Some(appid) = steam_appid else {
                continue;
            };
            let Some(_) = fetched_remote_urls.get(&appid) else {
                continue;
            };
            let fetched_url = fetched_remote_urls.get(&appid).cloned();
            let next_assets = build_steam_asset_urls(appid, fetched_url.clone(), fetched_url, None, None, None, None);
            let merged_assets =
                merge_steam_asset_urls(parse_steam_assets_json(steam_assets_json), next_assets);
            let _ = conn.execute(
                "UPDATE games SET steam_assets_json = ?2, updated_at = ?3 WHERE id = ?1",
                params![
                    game_id,
                    serde_json::to_string(&merged_assets).map_err(|err| err.to_string())?,
                    now_ts()
                ],
            );
        }
    }

    Ok(result)
}

#[tauri::command]
fn get_steam_store_headers(app_ids: Vec<i64>) -> Result<HashMap<i64, String>, String> {
    let client = Client::new();
    let mut result = HashMap::new();
    let mut seen = HashSet::new();

    for appid in app_ids {
        if appid <= 0 || !seen.insert(appid) {
            continue;
        }

        if let Some(url) = fetch_steam_store_header_url(&client, appid)? {
            result.insert(appid, url);
        }
    }

    Ok(result)
}

#[tauri::command]
fn get_library_steam_headers(
    app: AppHandle,
    state: tauri::State<AppState>,
    game_ids: Vec<i64>,
) -> Result<HashMap<i64, String>, String> {
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let mut rows = Vec::new();
    let mut seen_games = HashSet::new();

    for game_id in game_ids {
        if game_id <= 0 || !seen_games.insert(game_id) {
            continue;
        }

        let row = conn
            .query_row(
                "SELECT id, name, cover_url, backdrop_url, title_logo_url, steam_appid, steam_header_url, steam_assets_json FROM games WHERE id = ?1",
                params![game_id],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, Option<i64>>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<String>>(7)?,
                    ))
                },
            )
            .optional()
            .map_err(|err| err.to_string())?;

        if let Some(row) = row {
            rows.push(row);
        }
    }
    drop(conn);

    let client = Client::new();
    let mut result = HashMap::new();
    let mut header_cache = HashMap::<i64, Option<String>>::new();

    let mut updates = Vec::<(i64, Option<i64>, String, Option<String>)>::new();

    for (game_id, name, cover_url, backdrop_url, title_logo_url, steam_appid, stored_header_url, steam_assets_json) in rows {
        if let Some(appid) = steam_appid {
            if let Some(cached_path) = steam_cached_asset_path(&app, appid, "header.jpg") {
                result.insert(game_id, cached_path);
                continue;
            }
        }

        if let Some(url) = stored_header_url
            .as_deref()
            .and_then(|value| normalize_steam_store_header_url(value, steam_appid))
            .or_else(|| {
                parse_steam_assets_json(steam_assets_json.clone()).and_then(|assets| {
                    assets
                        .header_2x_url
                        .as_deref()
                        .and_then(|value| normalize_steam_store_header_url(value, steam_appid))
                        .or_else(|| {
                            assets
                                .header_url
                                .as_deref()
                                .and_then(|value| normalize_steam_store_header_url(value, steam_appid))
                        })
                })
            })
        {
            if let Some(appid) = steam_appid {
                if let Some(cached_path) = cache_steam_asset(&app, &client, appid, "header.jpg", &url)? {
                    result.insert(game_id, cached_path);
                    if stored_header_url.as_deref() != Some(url.as_str()) {
                        updates.push((game_id, Some(appid), url, None));
                    }
                    continue;
                }
            }

            result.insert(game_id, url.clone());
            if stored_header_url.as_deref() != Some(url.as_str()) {
                updates.push((game_id, steam_appid, url, None));
            }
            continue;
        }

        let mut appids = preferred_steam_appids(
            steam_appid,
            &[cover_url.clone(), backdrop_url.clone(), title_logo_url.clone()],
            None,
        );

        if let Some(appid) = search_steam_appid_by_name(&client, &name) {
            if !appids.contains(&appid) {
                appids.push(appid);
            }
        }

        for appid in appids {
            if let Some(cached_path) = steam_cached_asset_path(&app, appid, "header.jpg") {
                result.insert(game_id, cached_path);
                if steam_appid != Some(appid) {
                    let merged_assets = merge_steam_asset_urls(
                        parse_steam_assets_json(steam_assets_json.clone()),
                        build_steam_asset_urls(appid, None, None, None, None, None, None),
                    );
                    updates.push((
                        game_id,
                        Some(appid),
                        stored_header_url.clone().unwrap_or_default(),
                        Some(serde_json::to_string(&merged_assets).map_err(|err| err.to_string())?),
                    ));
                }
                break;
            }

            let header = if let Some(cached) = header_cache.get(&appid) {
                cached.clone()
            } else {
                let fetched = fetch_steam_store_header_url(&client, appid)?;
                header_cache.insert(appid, fetched.clone());
                fetched
            };

            if let Some(url) = header {
                let resolved = cache_steam_asset(&app, &client, appid, "header.jpg", &url)?
                    .unwrap_or_else(|| url.clone());
                result.insert(game_id, resolved);
                let merged_assets = merge_steam_asset_urls(
                    parse_steam_assets_json(steam_assets_json.clone()),
                    build_steam_asset_urls(appid, None, None, None, None, Some(url.clone()), None),
                );
                updates.push((
                    game_id,
                    Some(appid),
                    url,
                    Some(serde_json::to_string(&merged_assets).map_err(|err| err.to_string())?),
                ));
                break;
            }
        }
    }

    if !updates.is_empty() {
        let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
        for (game_id, steam_appid, steam_header_url, steam_assets_json) in updates {
            let next_header = if steam_header_url.trim().is_empty() {
                None::<String>
            } else {
                Some(steam_header_url)
            };
            let _ = conn.execute(
                "UPDATE games SET steam_appid = COALESCE(?2, steam_appid), steam_header_url = COALESCE(?3, steam_header_url), steam_assets_json = COALESCE(?4, steam_assets_json), updated_at = ?5 WHERE id = ?1",
                params![game_id, steam_appid, next_header, steam_assets_json, now_ts()],
            );
        }
    }

    Ok(result)
}

#[tauri::command]
fn list_archived_games(state: tauri::State<AppState>) -> Result<Vec<ArchivedGameSummary>, String> {
    let conn = state
        .archive_db
        .lock()
        .map_err(|_| "archive database lock poisoned")?;
    let _ = purge_expired_archived_games(&conn)?;
    query_archived_games(&conn)
}

#[tauri::command]
fn get_archived_game_detail(
    state: tauri::State<AppState>,
    archive_id: i64,
) -> Result<ArchivedGameDetail, String> {
    let conn = state
        .archive_db
        .lock()
        .map_err(|_| "archive database lock poisoned")?;
    let _ = purge_expired_archived_games(&conn)?;
    query_archived_game_detail(&conn, archive_id)
}

#[tauri::command]
fn search_archived_games_by_name(
    state: tauri::State<AppState>,
    query: String,
) -> Result<Vec<ArchivedGameSummary>, String> {
    let conn = state
        .archive_db
        .lock()
        .map_err(|_| "archive database lock poisoned")?;
    let _ = purge_expired_archived_games(&conn)?;
    query_archived_games_by_name(&conn, &query)
}

#[tauri::command]
fn add_game(
    state: tauri::State<AppState>,
    game_name: String,
    exe_path: String,
    store: Option<String>,
    cover_url: Option<String>,
    igdb_id: Option<i64>,
    skip_archive_restore: Option<bool>,
) -> Result<AddGameResult, String> {
    let exe_path_display = display_exe_path(&exe_path);
    let exe_path = normalize_exe_path(&exe_path);
    let game_name = game_name.trim();
    if exe_path.is_empty() || game_name.is_empty() {
        return Err("game name and exe path are required".to_string());
    }

    let extension = Path::new(&exe_path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    if extension.as_deref() != Some("exe") {
        return Err("exe path must point to a .exe file".to_string());
    }

    let exe_name = Path::new(&exe_path)
        .file_name()
        .and_then(|value| value.to_str())
        .map(normalize_exe_name)
        .ok_or_else(|| "failed to read exe file name".to_string())?;

    if exe_name.is_empty() {
        return Err("failed to read exe file name".to_string());
    }

    let now = now_ts();
    let store = normalize_store(store);
    let cover_url = cover_url.and_then(|value| {
        let value = value.trim().to_string();
        (!value.is_empty()).then_some(value)
    });
    let mut conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let archive_conn = state
        .archive_db
        .lock()
        .map_err(|_| "archive database lock poisoned")?;
    let _ = purge_expired_archived_games(&archive_conn)?;

    if let Some(existing_game_name) =
        find_existing_game_name_for_executable(&conn, &exe_name, &exe_path)?
    {
        return Err(format!(
      "this executable is already linked to \"{existing_game_name}\". Use a different .exe or delete/update the existing game first."
    ));
    }

    if !skip_archive_restore.unwrap_or(false) {
        if let Some(archive_id) = find_archived_game_candidate(
            &archive_conn,
            game_name,
            &exe_name,
            store.as_deref(),
            igdb_id,
        )? {
            restore_archived_game(
                &mut conn,
                &archive_conn,
                archive_id,
                &exe_name,
                &exe_path,
                &exe_path_display,
            )?;
            insert_notification(&conn, "restored", game_name, now)?;
            return Ok(AddGameResult {
                status: "restored".to_string(),
                game_name: game_name.to_string(),
            });
        }
    }

    conn
    .execute(
      "INSERT INTO games (name, store, cover_url, backdrop_url, igdb_id, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?5)",
      params![game_name, store, cover_url, igdb_id, now],
    )
    .map_err(|err| err.to_string())?;
    let game_id = conn.last_insert_rowid();

    conn
    .execute(
      "
      INSERT INTO executables (game_id, exe_name, exe_path, exe_path_display, status, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, 'tracked', ?5, ?5)
      ",
      params![game_id, exe_name, exe_path, exe_path_display, now],
    )
    .map_err(|err| err.to_string())?;

    if igdb_id.is_some() {
        if let Err(err) = sync_game_metadata_inner(&conn, game_id) {
            let _ = conn.execute(
                "DELETE FROM executables WHERE game_id = ?1",
                params![game_id],
            );
            let _ = conn.execute("DELETE FROM games WHERE id = ?1", params![game_id]);
            return Err(format!(
                "failed to sync IGDB metadata while adding the game: {err}"
            ));
        }
    }

    insert_notification(&conn, "added", game_name, now)?;

    Ok(AddGameResult {
        status: "added".to_string(),
        game_name: game_name.to_string(),
    })
}

#[tauri::command]
fn get_daily_playtime_overview(
    state: tauri::State<AppState>,
) -> Result<DailyPlaytimeOverview, String> {
    let _ = scan_once_if_stale(&state, Duration::from_secs(2))?;
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let tracker = state.tracker.lock().map_err(|_| "tracker lock poisoned")?;
    query_daily_playtime_overview(&conn, &tracker)
}

#[tauri::command]
fn get_weekly_playtime_overview(
    state: tauri::State<AppState>,
) -> Result<WeeklyPlaytimeOverview, String> {
    let _ = scan_once_if_stale(&state, Duration::from_secs(2))?;
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let tracker = state.tracker.lock().map_err(|_| "tracker lock poisoned")?;
    query_weekly_playtime_overview(&conn, &tracker)
}

#[tauri::command]
fn get_playtime_overview(
    state: tauri::State<AppState>,
    mode: String,
) -> Result<PlaytimeOverview, String> {
    let _ = scan_once_if_stale(&state, Duration::from_secs(2))?;
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let tracker = state.tracker.lock().map_err(|_| "tracker lock poisoned")?;
    query_playtime_overview(&conn, &tracker, &mode)
}

fn bool_setting_or_default(conn: &Connection, key: &str, default: bool) -> Result<bool, String> {
    let value = get_setting(conn, key).map_err(|err| err.to_string())?;
    Ok(match value.as_deref().map(str::trim) {
        Some("1") | Some("true") | Some("TRUE") | Some("yes") | Some("on") => true,
        Some("0") | Some("false") | Some("FALSE") | Some("no") | Some("off") => false,
        Some(_) | None => default,
    })
}

fn read_app_settings(conn: &Connection) -> Result<AppSettings, String> {
    let legacy_launch_to_tray = bool_setting_or_default(conn, "launch_to_tray", true)?;
    let start_on_system_startup =
        bool_setting_or_default(conn, "start_on_system_startup", legacy_launch_to_tray)?;
    let close_to_system_tray =
        bool_setting_or_default(conn, "close_to_system_tray", legacy_launch_to_tray)?;
    let default_page = get_setting(conn, "default_page")
        .map_err(|err| err.to_string())?
        .unwrap_or_else(|| "dashboard".to_string());
    let language = get_setting(conn, "language")
        .map_err(|err| err.to_string())?
        .unwrap_or_else(|| "English".to_string());
    let app_theme = get_setting(conn, "app_theme")
        .map_err(|err| err.to_string())?
        .unwrap_or_else(|| "dark".to_string());
    let top_game_artwork = get_setting(conn, "top_game_artwork")
        .map_err(|err| err.to_string())?
        .unwrap_or_else(|| "capsule".to_string());
    let playtime_display_mode = get_setting(conn, "playtime_display_mode")
        .map_err(|err| err.to_string())?
        .unwrap_or_else(|| "standard".to_string());

    Ok(AppSettings {
        start_on_system_startup,
        close_to_system_tray,
        default_page,
        language,
        app_theme,
        top_game_artwork,
        playtime_display_mode,
    })
}

fn find_existing_game_name_for_executable(
    conn: &Connection,
    exe_name: &str,
    exe_path: &str,
) -> Result<Option<String>, String> {
    let existing_assignment = conn
        .query_row(
            "
      SELECT game_id
      FROM executables
      WHERE exe_name = ?1 AND exe_path = ?2
      LIMIT 1
      ",
            params![exe_name, exe_path],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
        .flatten();

    let Some(existing_game_id) = existing_assignment else {
        return Ok(None);
    };

    let existing_game_name = conn
        .query_row(
            "SELECT name FROM games WHERE id = ?1",
            params![existing_game_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
        .unwrap_or_else(|| "another game".to_string());

    Ok(Some(existing_game_name))
}

fn find_duplicate_igdb_game(
    conn: &Connection,
    igdb_id: i64,
) -> Result<Option<AddGameDuplicateWarning>, String> {
    conn.query_row(
        "
      SELECT id, name, store, release_year
      FROM games
      WHERE igdb_id = ?1
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
      ",
        params![igdb_id],
        |row| {
            Ok(AddGameDuplicateWarning {
                game_id: row.get(0)?,
                game_name: row.get(1)?,
                store: row.get(2)?,
                release_year: row.get(3)?,
            })
        },
    )
    .optional()
    .map_err(|err| err.to_string())
}

#[tauri::command]
fn preflight_add_game(
    state: tauri::State<AppState>,
    exe_path: String,
    igdb_id: Option<i64>,
) -> Result<AddGamePreflightResult, String> {
    let exe_path = normalize_exe_path(&exe_path);
    if exe_path.is_empty() {
        return Ok(AddGamePreflightResult {
            duplicate_igdb_game: None,
            executable_conflict_message: None,
        });
    }

    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;

    let exe_name = Path::new(&exe_path)
        .file_name()
        .and_then(|value| value.to_str())
        .map(normalize_exe_name)
        .ok_or_else(|| "failed to read exe file name".to_string())?;

    if exe_name.is_empty() {
        return Err("failed to read exe file name".to_string());
    }

    let executable_conflict_message = find_existing_game_name_for_executable(&conn, &exe_name, &exe_path)?
    .map(|existing_game_name| {
      format!(
        "this executable is already linked to \"{existing_game_name}\". Use a different .exe or delete/update the existing game first."
      )
    });

    if executable_conflict_message.is_some() {
        return Ok(AddGamePreflightResult {
            duplicate_igdb_game: None,
            executable_conflict_message,
        });
    }

    if let Some(igdb_id) = igdb_id {
        let duplicate_igdb_game = find_duplicate_igdb_game(&conn, igdb_id)?;
        if duplicate_igdb_game.is_some() {
            return Ok(AddGamePreflightResult {
                duplicate_igdb_game,
                executable_conflict_message: None,
            });
        }
    }

    Ok(AddGamePreflightResult {
        duplicate_igdb_game: None,
        executable_conflict_message,
    })
}

#[tauri::command]
fn delete_game(state: tauri::State<AppState>, game_id: i64) -> Result<(), String> {
    {
        let tracker = state.tracker.lock().map_err(|_| "tracker lock poisoned")?;
        if tracker
            .active
            .values()
            .any(|active| active.game_id == game_id)
        {
            return Err("cannot delete a game while it is running".to_string());
        }
    }

    let mut conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let mut archive_conn = state
        .archive_db
        .lock()
        .map_err(|_| "archive database lock poisoned")?;
    let game_name = conn
        .query_row(
            "SELECT name FROM games WHERE id = ?1",
            params![game_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "game not found".to_string())?;
    archive_game(&mut conn, &mut archive_conn, game_id)?;
    conn.execute(
        "DELETE FROM executables WHERE game_id = ?1",
        params![game_id],
    )
    .map_err(|err| err.to_string())?;
    let deleted = conn
        .execute("DELETE FROM games WHERE id = ?1", params![game_id])
        .map_err(|err| err.to_string())?;

    if deleted == 0 {
        return Err("game not found".to_string());
    }

    insert_notification(&conn, "deleted", &game_name, now_ts())?;

    Ok(())
}

#[tauri::command]
fn pick_exe_path() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Windows executable", &["exe", "lnk", "bat"])
        .pick_file()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn pick_image_path() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "bmp", "gif"])
        .pick_file()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn export_game_sessions_csv(file_name: String, content: String) -> Result<Option<String>, String> {
    let sanitized = file_name.trim();
    let base_name = if sanitized.is_empty() {
        "game-sessions.csv"
    } else {
        sanitized
    };
    let export_dir = default_export_dir()?;
    fs::create_dir_all(&export_dir).map_err(|err| err.to_string())?;
    let path = unique_export_path(&export_dir, base_name);
    fs::write(&path, content).map_err(|err| err.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

fn default_export_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(profile) = std::env::var_os("USERPROFILE") {
            return Ok(PathBuf::from(profile).join("Downloads"));
        }
    }

    std::env::current_dir().map_err(|err| err.to_string())
}

fn unique_export_path(dir: &Path, file_name: &str) -> PathBuf {
    let sanitized = if file_name.trim().is_empty() {
        "game-sessions.csv"
    } else {
        file_name.trim()
    };

    let base_path = dir.join(sanitized);
    if !base_path.exists() {
        return base_path;
    }

    let stem = Path::new(sanitized)
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("game-sessions");
    let ext = Path::new(sanitized)
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("csv");

    for index in 2..10_000 {
        let candidate = dir.join(format!("{stem}-{index}.{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }

    dir.join(format!("{stem}-{}.{}", now_ts(), ext))
}

#[tauri::command]
fn restore_archived_game_entry(
    state: tauri::State<AppState>,
    archive_id: i64,
    exe_path: String,
) -> Result<AddGameResult, String> {
    let exe_path_display = display_exe_path(&exe_path);
    let exe_path = normalize_exe_path(&exe_path);
    if exe_path.is_empty() {
        return Err("exe path is required".to_string());
    }

    let extension = Path::new(&exe_path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    if extension.as_deref() != Some("exe") {
        return Err("exe path must point to a .exe file".to_string());
    }

    let exe_name = Path::new(&exe_path)
        .file_name()
        .and_then(|value| value.to_str())
        .map(normalize_exe_name)
        .ok_or_else(|| "failed to read exe file name".to_string())?;

    if exe_name.is_empty() {
        return Err("failed to read exe file name".to_string());
    }

    let archive_conn = state
        .archive_db
        .lock()
        .map_err(|_| "archive database lock poisoned")?;
    let _ = purge_expired_archived_games(&archive_conn)?;
    let archived = load_archived_game_record(&archive_conn, archive_id)?
        .ok_or_else(|| "archived game not found".to_string())?;

    let mut conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let existing_assignment = conn
        .query_row(
            "
      SELECT game_id
      FROM executables
      WHERE exe_name = ?1 AND exe_path = ?2
      LIMIT 1
      ",
            params![exe_name, exe_path],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
        .flatten();

    if let Some(existing_game_id) = existing_assignment {
        let existing_game_name = conn
            .query_row(
                "SELECT name FROM games WHERE id = ?1",
                params![existing_game_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|err| err.to_string())?
            .unwrap_or_else(|| "another game".to_string());

        return Err(format!(
      "this executable is already linked to \"{existing_game_name}\". Use a different .exe or delete/update the existing game first."
    ));
    }

    restore_archived_game(
        &mut conn,
        &archive_conn,
        archive_id,
        &exe_name,
        &exe_path,
        &exe_path_display,
    )?;

    insert_notification(&conn, "restored", &archived.record.name, now_ts())?;

    Ok(AddGameResult {
        status: "restored".to_string(),
        game_name: archived.record.name,
    })
}

#[tauri::command]
fn delete_archived_game_entry(
    state: tauri::State<AppState>,
    archive_id: i64,
) -> Result<(), String> {
    let conn = state
        .archive_db
        .lock()
        .map_err(|_| "archive database lock poisoned")?;
    let game_name = conn
        .query_row(
            "SELECT name FROM archive_games WHERE id = ?1",
            params![archive_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "archived game not found".to_string())?;
    let deleted = conn
        .execute(
            "DELETE FROM archive_games WHERE id = ?1",
            params![archive_id],
        )
        .map_err(|err| err.to_string())?;

    if deleted == 0 {
        return Err("archived game not found".to_string());
    }

    drop(conn);
    let main_conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    insert_notification(&main_conn, "permanently_deleted", &game_name, now_ts())?;

    Ok(())
}

fn clamp_backdrop_position(value: Option<f64>) -> Option<f64> {
    value.map(|number| number.clamp(0.0, 100.0))
}

fn clamp_media_zoom(value: Option<f64>) -> Option<f64> {
    value.map(|number| number.clamp(100.0, 250.0))
}

#[tauri::command]
fn update_game_metadata(
    state: tauri::State<AppState>,
    input: UpdateGameMetadataInput,
) -> Result<(), String> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err("game name is required".to_string());
    }

    let store = normalize_store(input.store);
    let cover_url = normalize_optional_text(input.cover_url);
    let cover_position_x = clamp_backdrop_position(input.cover_position_x);
    let cover_position_y = clamp_backdrop_position(input.cover_position_y);
    let cover_zoom = clamp_media_zoom(input.cover_zoom);
    let backdrop_url = normalize_optional_text(input.backdrop_url);
    let backdrop_position_x = clamp_backdrop_position(input.backdrop_position_x);
    let backdrop_position_y = clamp_backdrop_position(input.backdrop_position_y);
    let backdrop_zoom = clamp_media_zoom(input.backdrop_zoom);
    let title_logo_url = normalize_optional_text(input.title_logo_url);
    let use_title_logo = input.use_title_logo.unwrap_or(false);
    let title_logo_position_x = clamp_backdrop_position(input.title_logo_position_x);
    let title_logo_position_y = clamp_backdrop_position(input.title_logo_position_y);
    let title_logo_zoom = clamp_media_zoom(input.title_logo_zoom);
    let summary = normalize_optional_text(input.summary);
    let genres = normalize_string_list(input.genres);
    let platforms = normalize_platform_list(input.platforms);
    let developers = normalize_string_list(input.developers);
    let publishers = normalize_string_list(input.publishers);
    let age_rating = build_manual_age_rating(input.age_rating_label);
    let completion_status = normalize_optional_text(input.completion_status).unwrap_or_else(|| "Backlog".to_string());
    let release_year = input
        .release_year
        .filter(|year| (1970..=2100).contains(year));
    let now = now_ts();

    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let updated = conn
        .execute(
            "
      UPDATE games
      SET
        name = ?2,
        store = ?3,
        cover_url = ?4,
        cover_position_x = ?5,
        cover_position_y = ?6,
        cover_zoom = ?7,
        backdrop_url = ?8,
        backdrop_position_x = ?9,
        backdrop_position_y = ?10,
        backdrop_zoom = ?11,
        title_logo_url = ?12,
        use_title_logo = ?13,
        title_logo_position_x = ?14,
        title_logo_position_y = ?15,
        title_logo_zoom = ?16,
        summary = ?17,
        release_year = ?18,
        genres_json = ?19,
        platforms_json = ?20,
        developers_json = ?21,
        publishers_json = ?22,
        age_rating_json = ?23,
        completion_status = ?25,
        metadata_locked = 1,
        updated_at = ?24
      WHERE id = ?1
      ",
            params![
                input.game_id,
                name,
                store,
                cover_url,
                cover_position_x,
                cover_position_y,
                cover_zoom,
                backdrop_url,
                backdrop_position_x,
                backdrop_position_y,
                backdrop_zoom,
                title_logo_url,
                if use_title_logo { 1 } else { 0 },
                title_logo_position_x,
                title_logo_position_y,
                title_logo_zoom,
                summary,
                release_year,
                serde_json::to_string(&genres).map_err(|err| err.to_string())?,
                serde_json::to_string(&platforms).map_err(|err| err.to_string())?,
                serde_json::to_string(&developers).map_err(|err| err.to_string())?,
                serde_json::to_string(&publishers).map_err(|err| err.to_string())?,
                age_rating
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()
                    .map_err(|err| err.to_string())?,
                now,
                completion_status,
            ],
        )
        .map_err(|err| err.to_string())?;

    if updated == 0 {
        return Err("game not found".to_string());
    }

    Ok(())
}

#[tauri::command]
fn set_game_favorite(
    state: tauri::State<AppState>,
    game_id: i64,
    is_favorite: bool,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let updated = conn
        .execute(
            "UPDATE games SET is_favorite = ?2, updated_at = ?3 WHERE id = ?1",
            params![game_id, if is_favorite { 1 } else { 0 }, now_ts()],
        )
        .map_err(|err| err.to_string())?;

    if updated == 0 {
        return Err("game not found".to_string());
    }

    Ok(())
}

#[tauri::command]
fn update_game_playtime(
    state: tauri::State<AppState>,
    input: UpdateGamePlaytimeInput,
) -> Result<(), String> {
    if input.total_seconds < 0 {
        return Err("playtime cannot be negative".to_string());
    }

    {
        let tracker = state.tracker.lock().map_err(|_| "tracker lock poisoned")?;
        if tracker
            .active
            .values()
            .any(|session| session.game_id == input.game_id)
        {
            return Err("cannot edit playtime while this game is currently running".to_string());
        }
    }

    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let tracked_total = conn
    .query_row(
      "SELECT COALESCE(SUM(duration_seconds), 0) FROM sessions WHERE game_id = ?1 AND duration_seconds IS NOT NULL",
      params![input.game_id],
      |row| row.get::<_, i64>(0),
    )
    .map_err(|err| err.to_string())?;
    let adjustment_seconds = input.total_seconds - tracked_total;

    let updated = conn
        .execute(
            "UPDATE games SET playtime_adjustment_seconds = ?2, updated_at = ?3 WHERE id = ?1",
            params![input.game_id, adjustment_seconds, now_ts()],
        )
        .map_err(|err| err.to_string())?;

    if updated == 0 {
        return Err("game not found".to_string());
    }

    Ok(())
}

#[tauri::command]
fn reset_game_playtime(state: tauri::State<AppState>, game_id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let updated = conn
        .execute(
            "UPDATE games SET playtime_adjustment_seconds = 0, updated_at = ?2 WHERE id = ?1",
            params![game_id, now_ts()],
        )
        .map_err(|err| err.to_string())?;

    if updated == 0 {
        return Err("game not found".to_string());
    }

    Ok(())
}

#[tauri::command]
fn update_game_executable(
    state: tauri::State<AppState>,
    input: UpdateGameExecutableInput,
) -> Result<(), String> {
    {
        let tracker = state.tracker.lock().map_err(|_| "tracker lock poisoned")?;
        if tracker
            .active
            .values()
            .any(|active| active.game_id == input.game_id)
        {
            return Err("cannot change executable while the game is running".to_string());
        }
    }

    let exe_path_display = display_exe_path(&input.exe_path);
    let exe_path = normalize_exe_path(&input.exe_path);
    if exe_path.is_empty() {
        return Err("exe path is required".to_string());
    }

    let extension = Path::new(&exe_path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    if extension.as_deref() != Some("exe") {
        return Err("exe path must point to a .exe file".to_string());
    }

    let exe_name = Path::new(&exe_path)
        .file_name()
        .and_then(|value| value.to_str())
        .map(normalize_exe_name)
        .ok_or_else(|| "failed to read exe file name".to_string())?;
    if exe_name.is_empty() {
        return Err("failed to read exe file name".to_string());
    }

    let now = now_ts();
    let mut conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let tx = conn.transaction().map_err(|err| err.to_string())?;

    let target_game_name = tx
        .query_row(
            "SELECT name FROM games WHERE id = ?1",
            params![input.game_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "game not found".to_string())?;

    let existing_assignment = tx
        .query_row(
            "
      SELECT id, COALESCE(game_id, 0), status
      FROM executables
      WHERE exe_name = ?1 AND exe_path = ?2
      LIMIT 1
      ",
            params![exe_name, exe_path],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|err| err.to_string())?;

    if let Some((_, existing_game_id, _)) = existing_assignment.as_ref() {
        if *existing_game_id != 0 && *existing_game_id != input.game_id {
            let existing_game_name = tx
                .query_row(
                    "SELECT name FROM games WHERE id = ?1",
                    params![existing_game_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(|err| err.to_string())?
                .unwrap_or_else(|| "another game".to_string());

            return Err(format!(
        "this executable is already linked to \"{existing_game_name}\". Use a different .exe or delete/update the existing game first."
      ));
        }
    }

    let selected_executable_id = if let Some((executable_id, existing_game_id, _)) =
        existing_assignment
    {
        tx.execute(
            "
      UPDATE executables
      SET game_id = ?2,
          exe_name = ?3,
          exe_path = ?4,
          exe_path_display = ?5,
          status = 'tracked',
          updated_at = ?6
      WHERE id = ?1
      ",
            params![
                executable_id,
                input.game_id,
                exe_name,
                exe_path,
                exe_path_display,
                now
            ],
        )
        .map_err(|err| err.to_string())?;

        if existing_game_id == 0 {
            log::info!("linked unassigned executable to game \"{target_game_name}\"");
        }

        executable_id
    } else {
        tx.execute(
      "
      INSERT INTO executables (game_id, exe_name, exe_path, exe_path_display, status, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, 'tracked', ?5, ?5)
      ",
      params![input.game_id, exe_name, exe_path, exe_path_display, now],
    )
    .map_err(|err| err.to_string())?;

        tx.last_insert_rowid()
    };

    tx.execute(
        "
    DELETE FROM executables
    WHERE game_id = ?1 AND id <> ?2
    ",
        params![input.game_id, selected_executable_id],
    )
    .map_err(|err| err.to_string())?;

    tx.commit().map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_igdb_settings(state: tauri::State<AppState>) -> Result<IgdbSettings, String> {
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let client_id = get_setting(&conn, "igdb_client_id").map_err(|err| err.to_string())?;
    let client_secret = get_setting(&conn, "igdb_client_secret").map_err(|err| err.to_string())?;

    let effective_client_id = client_id
        .filter(|value| !value.trim().is_empty())
        .or_else(|| std::env::var("IGDB_CLIENT_ID").ok())
        .unwrap_or_default();

    let has_secret = client_secret
        .as_deref()
        .map(|value| !value.trim().is_empty())
        .or_else(|| std::env::var("IGDB_CLIENT_SECRET").ok().map(|v| !v.trim().is_empty()))
        .unwrap_or(false);

    Ok(IgdbSettings {
        client_id: effective_client_id,
        has_client_secret: has_secret,
    })
}

#[tauri::command]
fn save_igdb_settings(
    state: tauri::State<AppState>,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    let client_id = client_id.trim();
    let client_secret = client_secret.trim();

    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    set_setting(&conn, "igdb_client_id", client_id).map_err(|err| err.to_string())?;
    set_setting(&conn, "igdb_client_secret", client_secret).map_err(|err| err.to_string())?;

    Ok(())
}

#[tauri::command]
fn validate_executable_path(exe_path: String) -> Result<(), String> {
    let exe_path = normalize_exe_path(&exe_path);
    if exe_path.is_empty() {
        return Err("exe path is required".to_string());
    }

    let extension = Path::new(&exe_path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    if extension.as_deref() != Some("exe") {
        return Err("exe path must point to a .exe file".to_string());
    }

    let metadata = fs::metadata(&exe_path)
        .map_err(|_| "exe file was not found at that path".to_string())?;
    if !metadata.is_file() {
        return Err("exe path must point to a file".to_string());
    }

    Ok(())
}

#[tauri::command]
fn search_igdb_games(
    state: tauri::State<AppState>,
    query: String,
) -> Result<Vec<IgdbGame>, String> {
    let query = query.trim();
    if query.len() < 2 {
        return Ok(Vec::new());
    }

    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let body = format!(
        "search \"{}\"; fields name,first_release_date,cover.url,game_type; limit 20;",
        escape_igdb_search(query)
    );

    let games: Vec<IgdbSearchResponse> = call_igdb_api(&conn, "games", body)?;

    Ok(games
        .into_iter()
        .take(12)
        .map(|game| IgdbGame {
            cover_url: game
                .cover
                .map(|cover| normalize_image_url(cover.url, "t_cover_big")),
            game_type: game.game_type,
            id: game.id,
            name: game.name,
            first_release_year: release_year(game.first_release_date),
        })
        .collect())
}

fn query_local_game_detail(
    conn: &Connection,
    game_id: i64,
    active_games: &[ActiveGame],
) -> Result<LocalGameDetailRow, String> {
    let active_total = active_games
        .iter()
        .filter(|game| game.game_id == game_id)
        .map(|game| game.elapsed_seconds)
        .sum::<i64>();

    let row = conn
    .query_row(
      "
      SELECT
        g.id,
        g.name,
        g.store,
        g.cover_url,
        g.cover_position_x,
        g.cover_position_y,
        g.cover_zoom,
        g.backdrop_url,
        g.steam_header_url,
        g.backdrop_position_x,
        g.backdrop_position_y,
        g.backdrop_zoom,
        g.title_logo_url,
        g.use_title_logo,
        g.title_logo_position_x,
        g.title_logo_position_y,
        g.title_logo_zoom,
        g.igdb_id,
        g.metadata_locked,
        g.created_at,
        g.updated_at,
        g.release_year,
        g.summary,
        g.genres_json,
        g.platforms_json,
        g.developers_json,
        g.publishers_json,
        g.age_rating_json,
        COALESCE(SUM(s.duration_seconds), 0) AS tracked_total_seconds,
        g.playtime_adjustment_seconds,
        MAX(s.ended_at) AS last_played,
        g.is_favorite,
        COUNT(DISTINCT e.id) AS executable_count,
        (
          SELECT exe_name
          FROM executables
          WHERE game_id = g.id AND status = 'tracked'
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        ) AS executable_name,
        (
          SELECT COALESCE(exe_path_display, exe_path)
          FROM executables
          WHERE game_id = g.id AND status = 'tracked'
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        ) AS executable_path,
        COALESCE(g.completion_status, 'Backlog') AS completion_status,
        g.user_rating,
        g.user_review
      FROM games g
      LEFT JOIN sessions s ON s.game_id = g.id AND s.duration_seconds IS NOT NULL
      LEFT JOIN executables e ON e.game_id = g.id AND e.status = 'tracked'
      WHERE g.id = ?1
      GROUP BY g.id, g.name, g.store, g.cover_url, g.cover_position_x, g.cover_position_y, g.cover_zoom, g.backdrop_url, g.steam_header_url, g.backdrop_position_x, g.backdrop_position_y, g.backdrop_zoom, g.title_logo_url, g.use_title_logo, g.title_logo_position_x, g.title_logo_position_y, g.title_logo_zoom, g.igdb_id, g.metadata_locked, g.created_at, g.updated_at, g.release_year, g.summary, g.genres_json, g.platforms_json, g.developers_json, g.publishers_json, g.age_rating_json, g.playtime_adjustment_seconds, g.is_favorite, g.completion_status, g.user_rating, g.user_review
      ",
      params![game_id],
      |row| {
        let raw_executable_path = row.get::<_, Option<String>>(34)?;
        let tracked_total_seconds = row.get::<_, i64>(28)?;
        let playtime_adjustment_seconds = row.get::<_, i64>(29)?;
        let _metadata_updated_at = row.get::<_, i64>(20)?;

        let exe_exists = raw_executable_path
          .as_deref()
          .map(|path| Path::new(path).is_file())
          .unwrap_or(false);
        let executable_path = if exe_exists {
          raw_executable_path.map(|path| restore_windows_path_case(&path))
        } else {
          None
        };
        let executable_name = if exe_exists {
          row.get::<_, Option<String>>(33)?
        } else {
          None
        };
        let executable_count = if exe_exists {
          row.get::<_, i64>(32)?
        } else {
          0i64
        };

        let total_seconds = tracked_total_seconds + active_total + playtime_adjustment_seconds;
        let last_played = row.get::<_, Option<i64>>(30)?;
        let completion_status = row.get::<_, String>(35)?;

        Ok(LocalGameDetailRow {
          id: row.get(0)?,
          name: row.get(1)?,
          store: row.get(2)?,
          cover_url: row.get(3)?,
          cover_position_x: row.get(4)?,
          cover_position_y: row.get(5)?,
          cover_zoom: row.get(6)?,
          backdrop_url: row.get(7)?,
          steam_header_url: row.get(8)?,
          backdrop_position_x: row.get(9)?,
          backdrop_position_y: row.get(10)?,
          backdrop_zoom: row.get(11)?,
          title_logo_url: row.get(12)?,
          use_title_logo: row.get::<_, i64>(13)? != 0,
          title_logo_position_x: row.get(14)?,
          title_logo_position_y: row.get(15)?,
          title_logo_zoom: row.get(16)?,
          igdb_id: row.get(17)?,
          metadata_locked: row.get::<_, i64>(18)? != 0,
          created_at: row.get(19)?,
          release_year: row.get(21)?,
          summary: row.get(22)?,
          genres: parse_json_vec(row.get(23)?),
          platforms: parse_json_vec(row.get(24)?),
          developers: parse_json_vec(row.get(25)?),
          publishers: parse_json_vec(row.get(26)?),
          age_rating: parse_json_age_rating(row.get(27)?),
          total_seconds,
          playtime_adjustment_seconds,
          last_played,
          is_favorite: row.get::<_, i64>(31)? != 0,
          executable_count,
          executable_name,
          executable_path,
          completion_status,
          user_rating: row.get(36)?,
          user_review: row.get(37)?,
        })
      },
    )
    .optional()
    .map_err(|err| err.to_string())?;

    row.ok_or_else(|| "game not found".to_string())
}

fn query_game_sessions(
    conn: &Connection,
    game_id: i64,
    tracker: &TrackerState,
) -> Result<Vec<PlaySession>, String> {
    let mut stmt = conn
        .prepare(
            "
      SELECT id, started_at, ended_at, duration_seconds, note
      FROM sessions
      WHERE game_id = ?1 AND duration_seconds IS NOT NULL
      ORDER BY started_at DESC, id DESC
      ",
        )
        .map_err(|err| format!("failed to prepare game sessions query: {err}"))?;

    let mut sessions = stmt
        .query_map(params![game_id], |row| {
            Ok(SessionRow {
                id: row.get(0)?,
                started_at: row.get(1)?,
                ended_at: row.get(2)?,
                duration_seconds: row.get(3)?,
                note: row.get(4)?,
            })
        })
        .map_err(|err| format!("failed to read game sessions: {err}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| format!("failed to collect game sessions: {err}"))?
        .into_iter()
        .map(|session| PlaySession {
            id: Some(session.id),
            started_at: session.started_at,
            ended_at: session.ended_at,
            duration_seconds: session.duration_seconds.unwrap_or(0),
            is_active: false,
            note: session.note,
        })
        .collect::<Vec<_>>();

    sessions.extend(
        tracker
            .active
            .values()
            .filter(|session| session.game_id == game_id)
            .map(|session| PlaySession {
                id: Some(session.session_id),
                started_at: session.started_at,
                ended_at: None,
                duration_seconds: (now_ts() - session.started_at).max(0),
                is_active: true,
                note: None,
            }),
    );

    sessions.sort_by(|left, right| right.started_at.cmp(&left.started_at));
    Ok(sessions)
}

fn fetch_igdb_detail(conn: &Connection, igdb_id: i64) -> Result<Option<IgdbDetailResponse>, String> {
    let body = format!(
    "fields name,first_release_date,summary,cover.url,cover.width,cover.height,screenshots.url,screenshots.width,screenshots.height,artworks.url,artworks.width,artworks.height,genres.name,platforms.name,platforms.abbreviation,involved_companies.developer,involved_companies.publisher,involved_companies.company.name,age_ratings.id,age_ratings.category,age_ratings.organization,age_ratings.rating,age_ratings.rating_category.rating,age_ratings.rating_cover_url,age_ratings.synopsis,external_games.uid,external_games.category,external_games.external_game_source,websites.url,websites.type,websites.trusted; where id = {igdb_id}; limit 1;"
  );

    let mut games: Vec<IgdbDetailResponse> = call_igdb_api(conn, "games", body)?;
    Ok(games.pop())
}

fn fetch_age_rating_cover_url(
    conn: &Connection,
    age_rating_id: i64,
) -> Result<Option<String>, String> {
    let body = format!("fields rating_cover_url; where id = {age_rating_id}; limit 1;");

    let mut ratings: Vec<IgdbAgeRatingResponse> = call_igdb_api(conn, "age_ratings", body)?;

    Ok(ratings
        .pop()
        .and_then(|rating| rating.rating_cover_url)
        .map(|url| normalize_image_url(url, "t_logo_med")))
}

fn search_best_igdb_match(conn: &Connection, query: &str) -> Result<Option<IgdbGame>, String> {
    let body = format!(
        "search \"{}\"; fields name,first_release_date,cover.url,game_type; limit 10;",
        escape_igdb_search(query)
    );

    let games: Vec<IgdbSearchResponse> = call_igdb_api(conn, "games", body)?;

    let main_games = games
        .iter()
        .filter(|game| game.game_type == Some(0))
        .count();

    Ok(games
        .into_iter()
        .filter(|game| main_games == 0 || game.game_type == Some(0))
        .filter(|game| !looks_like_non_main_game(&game.name))
        .next()
        .map(|game| IgdbGame {
            cover_url: game
                .cover
                .map(|cover| normalize_image_url(cover.url, "t_cover_big")),
            game_type: game.game_type,
            id: game.id,
            name: game.name,
            first_release_year: release_year(game.first_release_date),
        }))
}

fn sync_game_metadata_inner(conn: &Connection, game_id: i64) -> Result<bool, String> {
    let row = conn
    .query_row(
      "SELECT name, cover_url, backdrop_url, title_logo_url, igdb_id, steam_appid, steam_header_url, steam_assets_json, metadata_locked FROM games WHERE id = ?1",
      params![game_id],
      |row| {
        Ok((
          row.get::<_, String>(0)?,
          row.get::<_, Option<String>>(1)?,
          row.get::<_, Option<String>>(2)?,
          row.get::<_, Option<String>>(3)?,
          row.get::<_, Option<i64>>(4)?,
          row.get::<_, Option<i64>>(5)?,
          row.get::<_, Option<String>>(6)?,
          row.get::<_, Option<String>>(7)?,
          row.get::<_, i64>(8)? != 0,
        ))
      },
    )
    .optional()
    .map_err(|err| err.to_string())?;

    let Some((
        name,
        stored_cover_url,
        stored_backdrop_url,
        stored_title_logo_url,
        stored_igdb_id,
        stored_steam_appid,
        stored_steam_header_url,
        stored_steam_assets_json,
        metadata_locked,
    )) = row
    else {
        return Err("game not found".to_string());
    };

    if metadata_locked {
        return Ok(false);
    }

    let matched = if let Some(igdb_id) = stored_igdb_id {
        fetch_igdb_detail(conn, igdb_id)?
            .map(|detail| IgdbGame {
                game_type: None,
                id: igdb_id,
                name: detail.name,
                first_release_year: release_year(detail.first_release_date),
                cover_url: detail
                    .cover
                    .map(|cover| normalize_image_url(cover.url, "t_cover_big")),
            })
            .or_else(|| search_best_igdb_match(conn, &name).ok().flatten())
    } else {
        search_best_igdb_match(conn, &name)?
    };

    let Some(game) = matched else {
        return Ok(false);
    };

    let detail_images = fetch_igdb_detail(conn, game.id).ok().flatten();
    let mut steam_appids = preferred_steam_appids(
        stored_steam_appid,
        &[
            stored_cover_url.clone(),
            stored_backdrop_url.clone(),
            stored_title_logo_url.clone(),
        ],
        detail_images.as_ref(),
    );
    for candidate_name in [
        Some(name.as_str()),
        Some(game.name.as_str()),
        detail_images.as_ref().map(|detail| detail.name.as_str()),
    ]
    .into_iter()
    .flatten()
    {
        let Some(appid) = search_steam_appid_by_name(&Client::new(), candidate_name) else {
            continue;
        };
        if !steam_appids.contains(&appid) {
            steam_appids.push(appid);
        }
    }
    let steam_visuals = steam_appids
        .into_iter()
        .find_map(|appid| fetch_steam_visual_assets(appid).ok().flatten());
    let next_cover_url = steam_visuals
        .as_ref()
        .and_then(|assets| assets.cover_url.clone())
        .or_else(|| {
            detail_images
                .as_ref()
                .and_then(|detail| detail.cover.as_ref())
                .map(|cover| normalize_image_url(cover.url.clone(), "t_cover_big"))
        })
        .or(game.cover_url)
        .or(stored_cover_url);
    let next_backdrop_url = steam_visuals
        .as_ref()
        .and_then(|assets| assets.backdrop_url.clone())
        .or_else(|| detail_images.as_ref().and_then(pick_backdrop_url))
        .or(stored_backdrop_url);
    let next_title_logo_url = steam_visuals
        .as_ref()
        .and_then(|assets| assets.title_logo_url.clone())
        .or(stored_title_logo_url);
    let next_steam_header_url = steam_visuals
        .as_ref()
        .and_then(|assets| assets.steam_header_url.clone())
        .or(stored_steam_header_url);
    let next_steam_assets_json = steam_visuals
        .as_ref()
        .map(|assets| serde_json::to_string(&assets.asset_urls))
        .transpose()
        .map_err(|err| err.to_string())?
        .or(stored_steam_assets_json);
    let release_year = detail_images
        .as_ref()
        .and_then(|detail| release_year(detail.first_release_date));
    let summary = detail_images
        .as_ref()
        .and_then(|detail| detail.summary.clone());
    let genres = detail_images
        .as_ref()
        .and_then(|detail| detail.genres.as_ref())
        .map(|items| {
            items
                .iter()
                .map(|item| item.name.clone())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let platforms = detail_images
        .as_ref()
        .and_then(|detail| detail.platforms.as_ref())
        .map(|items| {
            items
                .iter()
                .map(|item| {
                    item.abbreviation
                        .clone()
                        .unwrap_or_else(|| item.name.clone())
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let developers = detail_images
        .as_ref()
        .and_then(|detail| detail.involved_companies.as_ref())
        .map(|items| {
            items
                .iter()
                .filter(|item| item.developer.unwrap_or(false))
                .filter_map(|item| item.company.as_ref().map(|company| company.name.clone()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let publishers = detail_images
        .as_ref()
        .and_then(|detail| detail.involved_companies.as_ref())
        .map(|items| {
            items
                .iter()
                .filter(|item| item.publisher.unwrap_or(false))
                .filter_map(|item| item.company.as_ref().map(|company| company.name.clone()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let age_rating = detail_images
        .as_ref()
        .and_then(|detail| detail.age_ratings.as_ref())
        .and_then(|ratings| {
            ratings
                .iter()
                .find(|rating| age_rating_organization(rating) == Some(2))
        })
        .and_then(|rating| {
            age_rating_label(rating).map(|label| {
                let image_url = rating
                    .rating_cover_url
                    .clone()
                    .map(|url| normalize_image_url(url, "t_logo_med"))
                    .or_else(|| {
                        rating.id.and_then(|age_rating_id| {
                            fetch_age_rating_cover_url(conn, age_rating_id)
                                .ok()
                                .flatten()
                        })
                    });

                AgeRatingInfo {
                    label,
                    description: rating.synopsis.clone(),
                    image_url,
                }
            })
        });
    conn.execute(
        "
      UPDATE games
      SET name = ?2,
          cover_url = ?3,
          backdrop_url = ?4,
          title_logo_url = ?5,
          steam_header_url = ?6,
          steam_assets_json = ?7,
          summary = ?8,
          release_year = ?9,
          genres_json = ?10,
          platforms_json = ?11,
          developers_json = ?12,
          publishers_json = ?13,
          age_rating_json = ?14,
          igdb_id = ?15,
          steam_appid = ?16,
          updated_at = ?17
      WHERE id = ?1
      ",
        params![
            game_id,
            game.name,
            next_cover_url,
            next_backdrop_url,
            next_title_logo_url,
            next_steam_header_url,
            next_steam_assets_json,
            summary,
            release_year,
            serde_json::to_string(&genres).map_err(|err| err.to_string())?,
            serde_json::to_string(&platforms).map_err(|err| err.to_string())?,
            serde_json::to_string(&developers).map_err(|err| err.to_string())?,
            serde_json::to_string(&publishers).map_err(|err| err.to_string())?,
            age_rating
                .as_ref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(|err| err.to_string())?,
            game.id,
            steam_visuals
                .as_ref()
                .map(|assets| assets.appid)
                .or(stored_steam_appid),
            now_ts()
        ],
    )
    .map_err(|err| err.to_string())?;

    Ok(true)
}

#[tauri::command]
fn get_game_detail(state: tauri::State<AppState>, game_id: i64) -> Result<GameDetail, String> {
    let active_games = active_games_snapshot(&state)?;
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let tracker = state.tracker.lock().map_err(|_| "tracker lock poisoned")?;
    let local = query_local_game_detail(&conn, game_id, &active_games)?;

    Ok(GameDetail {
        id: local.id,
        name: local.name,
        cover_url: local.cover_url.clone(),
        cover_position_x: local.cover_position_x,
        cover_position_y: local.cover_position_y,
        cover_zoom: local.cover_zoom,
        backdrop_url: local
            .backdrop_url
            .clone()
            .or_else(|| local.cover_url.clone()),
        steam_header_url: local.steam_header_url.clone(),
        backdrop_position_x: local.backdrop_position_x,
        backdrop_position_y: local.backdrop_position_y,
        backdrop_zoom: local.backdrop_zoom,
        title_logo_url: local.title_logo_url,
        use_title_logo: local.use_title_logo,
        title_logo_position_x: local.title_logo_position_x,
        title_logo_position_y: local.title_logo_position_y,
        title_logo_zoom: local.title_logo_zoom,
        metadata_locked: local.metadata_locked,
        has_igdb_link: local.igdb_id.is_some(),
        store: local.store,
        total_seconds: local.total_seconds,
        playtime_adjustment_seconds: local.playtime_adjustment_seconds,
        has_manual_playtime: local.playtime_adjustment_seconds != 0,
        last_played: local.last_played,
        is_favorite: local.is_favorite,
        executable_count: local.executable_count,
        executable_name: local.executable_name,
        executable_path: local.executable_path,
        release_year: local.release_year,
        genres: local.genres,
        summary: local.summary,
        platforms: local.platforms,
        developers: local.developers,
        publishers: local.publishers,
        age_rating: local.age_rating,
        created_at: local.created_at,
        completion_status: local.completion_status,
        user_rating: local.user_rating,
        user_review: local.user_review,
        play_sessions: query_game_sessions(&conn, game_id, &tracker)?,
    })
}

#[tauri::command]
fn update_game_user_rating_review(
    app: AppHandle,
    game_id: i64,
    user_rating: Option<i32>,
    user_review: Option<String>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let conn = state.db.lock().map_err(|_| "failed to lock db".to_string())?;
    let normalized_review = normalize_optional_text(user_review);
    let valid_rating = user_rating.filter(|&r| (1..=5).contains(&r));
    let now = now_ts();

    conn.execute(
        "UPDATE games SET user_rating = ?1, user_review = ?2, updated_at = ?3 WHERE id = ?4",
        params![valid_rating, normalized_review, now, game_id],
    )
    .map_err(|err| format!("failed to update rating/review: {err}"))?;

    app.emit("game-updated", game_id).ok();
    Ok(())
}

#[tauri::command]
fn update_session_note(
    app: AppHandle,
    session_id: i64,
    note: Option<String>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let conn = state.db.lock().map_err(|_| "failed to lock db".to_string())?;
    let normalized_note = normalize_optional_text(note);

    conn.execute(
        "UPDATE sessions SET note = ?1 WHERE id = ?2",
        params![normalized_note, session_id],
    )
    .map_err(|err| format!("failed to update session note: {err}"))?;

    app.emit("session-updated", session_id).ok();
    Ok(())
}

#[tauri::command]
fn get_stats_snapshot(state: tauri::State<AppState>) -> Result<StatsSnapshot, String> {
    let _ = scan_once_if_stale(&state, Duration::from_secs(2))?;
    let active_games = active_games_snapshot(&state)?;
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let tracker = state.tracker.lock().map_err(|_| "tracker lock poisoned")?;
    let games = query_games(&conn, None, &active_games)?;

    let snapshot_games = games
        .into_iter()
        .map(|game| {
            let play_sessions = query_game_sessions(&conn, game.id, &tracker)?;
            Ok(StatsSnapshotGame {
                id: game.id,
                name: game.name,
                store: game.store,
                cover_url: game.cover_url,
                total_seconds: game.total_seconds,
                play_sessions,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    Ok(StatsSnapshot {
        games: snapshot_games,
    })
}

#[tauri::command]
fn launch_game(state: tauri::State<AppState>, game_id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let exe_path = conn
        .query_row(
            "
      SELECT exe_path
      FROM executables
      WHERE game_id = ?1 AND status = 'tracked'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
      ",
            params![game_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
        .ok_or_else(|| "tracked executable not found for this game".to_string())?;
    drop(conn);

    if !Path::new(&exe_path).is_file() {
        return Err(format!("Game executable file was not found on disk: {exe_path}"));
    }

    match Command::new(&exe_path).spawn() {
        Ok(_) => {}
        Err(err) if err.raw_os_error() == Some(740) => launch_game_with_elevation(&exe_path)?,
        Err(err) => return Err(format!("failed to launch game: {err}")),
    }

    Ok(())
}

#[tauri::command]
fn get_app_settings(state: tauri::State<AppState>) -> Result<AppSettings, String> {
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    read_app_settings(&conn)
}

#[tauri::command]
fn get_user_settings(state: tauri::State<AppState>) -> Result<UserSettings, String> {
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    read_user_settings(&conn)
}

#[tauri::command]
fn get_notification_overview(
    state: tauri::State<AppState>,
    limit: Option<i64>,
) -> Result<NotificationOverview, String> {
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    prune_expired_notifications(&conn, now_ts())?;
    Ok(NotificationOverview {
        unread_count: query_unread_notification_count(&conn)?,
        items: query_notifications(&conn, limit)?,
    })
}

#[tauri::command]
fn mark_all_notifications_read(state: tauri::State<AppState>) -> Result<(), String> {
    let now = now_ts();
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    prune_expired_notifications(&conn, now)?;
    conn.execute(
        "UPDATE notifications SET read_at = ?1 WHERE read_at IS NULL",
        params![now],
    )
    .map_err(|err| format!("failed to mark notifications as read: {err}"))?;
    Ok(())
}

#[tauri::command]
fn get_app_system_info() -> AppSystemInfo {
    AppSystemInfo {
        os: detect_os_label(),
    }
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("url is required".to_string());
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("only http and https urls are supported".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", trimmed])
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("unsupported platform".to_string())
}

#[tauri::command]
fn save_app_settings(
    app: AppHandle,
    state: tauri::State<AppState>,
    start_on_system_startup: bool,
    close_to_system_tray: bool,
    default_page: String,
    language: String,
    app_theme: String,
    top_game_artwork: String,
    playtime_display_mode: String,
) -> Result<(), String> {
    let normalized_default_page = default_page.trim().to_lowercase();
    let normalized_default_page = match normalized_default_page.as_str() {
        "dashboard" | "library" | "archive" => normalized_default_page,
        _ => "dashboard".to_string(),
    };
    let normalized_language = if language.trim().is_empty() {
        "English".to_string()
    } else {
        language.trim().to_string()
    };
    let normalized_theme = match app_theme.trim().to_lowercase().as_str() {
        "light" => "light".to_string(),
        _ => "dark".to_string(),
    };
    let normalized_top_game_artwork = match top_game_artwork.trim().to_lowercase().as_str() {
        "capsule" => "capsule".to_string(),
        _ => "poster".to_string(),
    };
    let normalized_playtime_display_mode = match playtime_display_mode.trim().to_lowercase().as_str() {
        "hours_only" => "hours_only".to_string(),
        _ => "standard".to_string(),
    };

    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let previous_settings = read_app_settings(&conn)?;
    let next_settings = AppSettings {
        start_on_system_startup,
        close_to_system_tray,
        default_page: normalized_default_page,
        language: normalized_language,
        app_theme: normalized_theme,
        top_game_artwork: normalized_top_game_artwork,
        playtime_display_mode: normalized_playtime_display_mode,
    };
    if previous_settings == next_settings {
        return Ok(());
    }

    let tx = conn
        .unchecked_transaction()
        .map_err(|err| err.to_string())?;
    set_setting(
        &tx,
        "start_on_system_startup",
        if next_settings.start_on_system_startup {
            "true"
        } else {
            "false"
        },
    )
    .map_err(|err| err.to_string())?;
    set_setting(
        &tx,
        "close_to_system_tray",
        if next_settings.close_to_system_tray {
            "true"
        } else {
            "false"
        },
    )
    .map_err(|err| err.to_string())?;
    set_setting(
        &tx,
        "launch_to_tray",
        if next_settings.start_on_system_startup && next_settings.close_to_system_tray {
            "true"
        } else {
            "false"
        },
    )
    .map_err(|err| err.to_string())?;
    set_setting(&tx, "default_page", &next_settings.default_page).map_err(|err| err.to_string())?;
    set_setting(&tx, "language", &next_settings.language).map_err(|err| err.to_string())?;
    set_setting(&tx, "app_theme", &next_settings.app_theme).map_err(|err| err.to_string())?;
    set_setting(&tx, "top_game_artwork", &next_settings.top_game_artwork).map_err(|err| err.to_string())?;
    set_setting(&tx, "playtime_display_mode", &next_settings.playtime_display_mode).map_err(|err| err.to_string())?;
    tx.commit().map_err(|err| err.to_string())?;
    drop(conn);

    #[cfg(desktop)]
    {
        use tauri_plugin_autostart::ManagerExt;

        if !cfg!(debug_assertions)
            && previous_settings.start_on_system_startup != next_settings.start_on_system_startup
        {
            let autostart = app.autolaunch();
            if next_settings.start_on_system_startup {
                autostart.enable().map_err(|err| err.to_string())?;
            } else {
                autostart.disable().map_err(|err| err.to_string())?;
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn clear_local_data(state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    conn.execute_batch(
        "
      DELETE FROM notifications;
      DELETE FROM sessions;
      DELETE FROM executables;
      DELETE FROM games;
      ",
    )
    .map_err(|err| err.to_string())?;
    drop(conn);

    let archive_conn = state
        .archive_db
        .lock()
        .map_err(|_| "archive database lock poisoned")?;
    archive_conn
        .execute_batch(
            "
      DELETE FROM archive_executables;
      DELETE FROM archive_games;
      ",
        )
        .map_err(|err| err.to_string())?;

    Ok(())
}

#[tauri::command]
fn delete_user_account(state: tauri::State<AppState>) -> Result<UserSettings, String> {
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    conn.execute("DELETE FROM settings WHERE key = ?1", params!["user_settings_v1"])
        .map_err(|err| err.to_string())?;
    let _ = conn.execute("DELETE FROM settings WHERE key = ?1", params!["last_login_active_session"]);
    read_user_settings(&conn)
}

#[tauri::command]
fn save_user_settings(
    state: tauri::State<AppState>,
    input: SaveUserSettingsInput,
) -> Result<UserSettings, String> {
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    save_user_settings_record(&conn, input)
}

#[cfg(target_os = "windows")]
fn launch_game_with_elevation(exe_path: &str) -> Result<(), String> {
    let escaped_path = exe_path.replace('\'', "''");
    let command = format!("Start-Process -FilePath '{}' -Verb RunAs", escaped_path);

    Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &command])
        .spawn()
        .map_err(|err| format!("failed to launch elevated game: {err}"))?;

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn launch_game_with_elevation(_exe_path: &str) -> Result<(), String> {
    Err("launching elevated games is only supported on Windows".to_string())
}

#[tauri::command]
fn refresh_game_metadata(state: tauri::State<AppState>, game_id: i64) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    sync_game_metadata_inner(&conn, game_id)
}

fn reset_game_metadata_to_igdb_inner(conn: &Connection, game_id: i64) -> Result<bool, String> {
    let has_igdb_link = conn
        .query_row(
            "SELECT igdb_id FROM games WHERE id = ?1",
            params![game_id],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
        .flatten()
        .is_some();

    if !has_igdb_link {
        return Err("this game has no IGDB link to reset from".to_string());
    }

    let now = now_ts();
    conn
        .execute(
            "UPDATE games SET metadata_locked = 0, steam_header_url = NULL, steam_assets_json = NULL, cover_position_x = NULL, cover_position_y = NULL, cover_zoom = NULL, backdrop_position_x = NULL, backdrop_position_y = NULL, backdrop_zoom = NULL, use_title_logo = 0, title_logo_position_x = NULL, title_logo_position_y = NULL, title_logo_zoom = NULL, updated_at = ?2 WHERE id = ?1",
            params![game_id, now],
        )
        .map_err(|err| err.to_string())?;

    match sync_game_metadata_inner(conn, game_id) {
        Ok(updated) => Ok(updated),
        Err(err) => {
            let _ = conn.execute(
                "UPDATE games SET metadata_locked = 1, updated_at = ?2 WHERE id = ?1",
                params![game_id, now_ts()],
            );
            Err(err)
        }
    }
}

#[derive(Serialize)]
struct ResetLibraryMetadataResult {
    processed: usize,
    reset: usize,
    skipped: usize,
    failed: usize,
}

#[tauri::command]
fn reset_game_metadata_to_igdb(
    app: AppHandle,
    state: tauri::State<AppState>,
    game_id: i64,
) -> Result<bool, String> {
    let appid = {
        let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
        conn.query_row(
            "SELECT steam_appid FROM games WHERE id = ?1",
            params![game_id],
            |row| row.get::<_, Option<i64>>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
        .flatten()
    };
    let _ = clear_steam_asset_cache(&app, appid);
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    reset_game_metadata_to_igdb_inner(&conn, game_id)
}

#[tauri::command]
fn reset_library_metadata_to_igdb(
    app: AppHandle,
    state: tauri::State<AppState>,
) -> Result<ResetLibraryMetadataResult, String> {
    let _ = clear_steam_asset_cache(&app, None);
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let mut stmt = conn
        .prepare("SELECT id, igdb_id FROM games ORDER BY id ASC")
        .map_err(|err| err.to_string())?;
    let games = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<i64>>(1)?,
            ))
        })
        .map_err(|err| err.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| err.to_string())?;
    drop(stmt);

    let mut result = ResetLibraryMetadataResult {
        processed: games.len(),
        reset: 0,
        skipped: 0,
        failed: 0,
    };

    for (game_id, igdb_id) in games {
        if igdb_id.is_none() {
            result.skipped += 1;
            continue;
        }

        match reset_game_metadata_to_igdb_inner(&conn, game_id) {
            Ok(_) => result.reset += 1,
            Err(_) => result.failed += 1,
        }
    }

    Ok(result)
}

#[tauri::command]
fn refresh_library_metadata(state: tauri::State<AppState>) -> Result<usize, String> {
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let mut stmt = conn
        .prepare("SELECT id FROM games ORDER BY id ASC")
        .map_err(|err| err.to_string())?;
    let game_ids = stmt
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(|err| err.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|err| err.to_string())?;
    drop(stmt);

    let mut updated = 0usize;
    for game_id in game_ids {
        if sync_game_metadata_inner(&conn, game_id)? {
            updated += 1;
        }
    }

    Ok(updated)
}

fn build_tray_menu<R: tauri::Runtime, M: Manager<R>>(
    manager: &M,
    state: &AppState,
) -> Result<Menu<R>, String> {
    let _ = scan_once_if_stale(state, Duration::from_secs(2));
    let active_games = active_games_snapshot(state).unwrap_or_default();
    let recent_games = {
        let conn = state
            .db
            .lock()
            .map_err(|_| "database lock poisoned".to_string())?;
        query_recent_games(&conn, Some(3), &active_games)?
    };

    let running_label = MenuItem::with_id(
        manager,
        "tray-running-label",
        ":: Running Game ::",
        true,
        None::<&str>,
    )
    .map_err(|err| err.to_string())?;
    let mut items: Vec<Box<dyn IsMenuItem<R>>> = vec![Box::new(running_label)];

    if active_games.is_empty() {
        items.push(Box::new(
            MenuItem::with_id(
                manager,
                "tray-running-empty",
                "No active game",
                true,
                None::<&str>,
            )
            .map_err(|err| err.to_string())?,
        ));
    } else {
        for game in active_games.iter().take(3) {
            let label = truncate_tray_menu_label(&game.name, TRAY_MENU_TITLE_MAX_CHARS);
            items.push(Box::new(
                MenuItem::with_id(
                    manager,
                    format!("tray-running-{}", game.game_id),
                    &label,
                    true,
                    None::<&str>,
                )
                .map_err(|err| err.to_string())?,
            ));
        }
    }

    items.push(Box::new(
        PredefinedMenuItem::separator(manager).map_err(|err| err.to_string())?,
    ));

    items.push(Box::new(
        MenuItem::with_id(
            manager,
            "tray-recent-label",
            ":: Recently Played ::",
            true,
            None::<&str>,
        )
        .map_err(|err| err.to_string())?,
    ));

    if recent_games.is_empty() {
        items.push(Box::new(
            MenuItem::with_id(
                manager,
                "tray-recent-empty",
                "No recent games",
                false,
                None::<&str>,
            )
            .map_err(|err| err.to_string())?,
        ));
    } else {
        for game in recent_games.iter().take(3) {
            let label = truncate_tray_menu_label(&game.name, TRAY_MENU_TITLE_MAX_CHARS);
            items.push(Box::new(
                MenuItem::with_id(
                    manager,
                    format!("tray-recent-{}", game.id),
                    &label,
                    true,
                    None::<&str>,
                )
                .map_err(|err| err.to_string())?,
            ));
        }
    }

    items.push(Box::new(
        PredefinedMenuItem::separator(manager).map_err(|err| err.to_string())?,
    ));

    let open = MenuItem::with_id(manager, "open", "Open", true, None::<&str>)
        .map_err(|err| err.to_string())?;
    let exit = MenuItem::with_id(manager, "exit", "Exit", true, None::<&str>)
        .map_err(|err| err.to_string())?;
    items.push(Box::new(open));
    items.push(Box::new(exit));
    let item_refs: Vec<&dyn IsMenuItem<R>> = items.iter().map(|item| item.as_ref()).collect();
    Menu::with_items(manager, &item_refs).map_err(|err| err.to_string())
}

fn refresh_tray_menu<R: tauri::Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
) -> Result<(), String> {
    let menu = build_tray_menu(app, state)?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu)).map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn build_tray(app: &mut tauri::App, state: &AppState) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_tray_menu(app.handle(), state).map_err(std::io::Error::other)?;
    let tray_state = state.clone();

    TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("TylePlay")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(move |tray, event| {
            if event.id().as_ref() != TRAY_ID {
                return;
            }

            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Down,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = refresh_tray_menu(&app, &tray_state);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        })
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            "exit" => app.exit(0),
            id if id.starts_with("tray-running-") => {
                if let Ok(game_id) = id.trim_start_matches("tray-running-").parse::<i64>() {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("tray-open-game-detail", game_id);
                }
            }
            id if id.starts_with("tray-recent-") => {
                if let Ok(game_id) = id.trim_start_matches("tray-recent-").parse::<i64>() {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("tray-open-game-detail", game_id);
                }
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn launched_from_autostart() -> bool {
    std::env::args().any(|arg| arg == AUTOSTART_ARG)
}

fn should_start_hidden(start_on_system_startup: bool, close_to_system_tray: bool) -> bool {
    !cfg!(debug_assertions)
        && start_on_system_startup
        && close_to_system_tray
        && launched_from_autostart()
}

fn detect_os_label() -> String {
    System::long_os_version()
        .or_else(System::name)
        .unwrap_or_else(|| std::env::consts::OS.to_string())
}

fn write_boot_log(message: &str) {
    let path = std::env::temp_dir().join("tyleplay_boot.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{message}");
    }
}

#[tauri::command]
fn debug_log(message: String) {
    write_boot_log(&format!("frontend: {message}"));
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn should_show_main_window_on_boot(state: tauri::State<AppState>) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let legacy_launch_to_tray = bool_setting_or_default(&conn, "launch_to_tray", true)?;
    let start_on_system_startup =
        bool_setting_or_default(&conn, "start_on_system_startup", legacy_launch_to_tray)?;
    let close_to_system_tray =
        bool_setting_or_default(&conn, "close_to_system_tray", legacy_launch_to_tray)?;
    Ok(!should_start_hidden(
        start_on_system_startup,
        close_to_system_tray,
    ))
}

#[tauri::command]
fn window_minimize(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window.minimize().map_err(|err| err.to_string())
}

#[tauri::command]
fn window_toggle_maximize(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    if window.is_maximized().map_err(|err| err.to_string())? {
        window.unmaximize().map_err(|err| err.to_string())?;
    } else {
        window.maximize().map_err(|err| err.to_string())?;
    }
    window.is_maximized().map_err(|err| err.to_string())
}

#[tauri::command]
fn window_is_maximized(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window.is_maximized().map_err(|err| err.to_string())
}

#[tauri::command]
fn window_close(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window.close().map_err(|err| err.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    write_boot_log("run(): starting builder");
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .on_page_load(|window, payload| {
            write_boot_log(&format!(
                "on_page_load: label={} url={}",
                window.label(),
                payload.url()
            ));
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                if let Some(state) = window.try_state::<AppState>() {
                    if let Ok(conn) = state.db.lock() {
                        let legacy_launch_to_tray =
                            bool_setting_or_default(&conn, "launch_to_tray", true).unwrap_or(true);
                        let close_to_system_tray = bool_setting_or_default(
                            &conn,
                            "close_to_system_tray",
                            legacy_launch_to_tray,
                        )
                        .unwrap_or(true);
                        if close_to_system_tray {
                            api.prevent_close();
                            let _ = window.hide();
                        } else {
                            api.prevent_close();
                            drop(conn);
                            request_confirmed_app_exit(&window.app_handle(), Some(0));
                        }
                    }
                }
            }
        })
        .setup(|app| {
            write_boot_log("setup(): begin");
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec![AUTOSTART_ARG]),
            ))?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let db_path = app_db_path(app.handle())?;
            let archive_path = archive_db_path(app.handle())?;
            migrate_legacy_db_if_needed(app.handle(), &db_path)?;
            let conn = Connection::open(db_path)?;
            let archive_conn = Connection::open(archive_path)?;
            init_db(&conn)?;
            init_archive_db(&archive_conn)?;
            run_migrations(&conn)?;
            run_archive_migrations(&archive_conn)?;

            let state = AppState {
                db: Arc::new(Mutex::new(conn)),
                archive_db: Arc::new(Mutex::new(archive_conn)),
                tracker: Arc::new(Mutex::new(TrackerState::default())),
                scan_state: Arc::new(Mutex::new(ScanState::default())),
                exit_guard: Arc::new(Mutex::new(false)),
            };

            write_boot_log("setup(): state initialized");
            build_tray(app, &state)?;
            start_watcher(app.handle().clone(), state.clone());
            let (start_on_system_startup, close_to_system_tray) = {
                let conn = state
                    .db
                    .lock()
                    .map_err(|_| std::io::Error::other("database lock poisoned"))?;
                let _ = touch_user_last_login_on_startup(&conn);
                let legacy_launch_to_tray = bool_setting_or_default(&conn, "launch_to_tray", true)
                    .map_err(std::io::Error::other)?;
                let start_on_system_startup = bool_setting_or_default(
                    &conn,
                    "start_on_system_startup",
                    legacy_launch_to_tray,
                )
                .map_err(std::io::Error::other)?;
                let close_to_system_tray =
                    bool_setting_or_default(&conn, "close_to_system_tray", legacy_launch_to_tray)
                        .map_err(std::io::Error::other)?;
                (start_on_system_startup, close_to_system_tray)
            };
            app.manage(state);
            write_boot_log("setup(): state managed");

            #[cfg(desktop)]
            {
                use tauri_plugin_autostart::ManagerExt;

                if !cfg!(debug_assertions) {
                    let autostart = app.autolaunch();
                    if start_on_system_startup {
                        autostart.enable().map_err(std::io::Error::other)?;
                    } else {
                        autostart.disable().map_err(std::io::Error::other)?;
                    }
                }
            }

            if should_start_hidden(start_on_system_startup, close_to_system_tray) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            write_boot_log("setup(): complete");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            debug_log,
            show_main_window,
            should_show_main_window_on_boot,
            window_minimize,
            window_toggle_maximize,
            window_is_maximized,
            window_close,
            get_dashboard,
            get_notification_overview,
            mark_all_notifications_read,
            get_daily_playtime_overview,
            get_weekly_playtime_overview,
            get_playtime_overview,
            list_games,
            get_steam_small_capsules,
            get_steam_store_headers,
            get_library_steam_headers,
            preflight_add_game,
            list_archived_games,
            get_archived_game_detail,
            search_archived_games_by_name,
            add_game,
            delete_game,
            restore_archived_game_entry,
            delete_archived_game_entry,
            pick_exe_path,
            pick_image_path,
            export_game_sessions_csv,
            update_game_metadata,
            set_game_favorite,
            update_game_playtime,
            update_game_executable,
            validate_executable_path,
            get_app_settings,
            get_user_settings,
            get_app_system_info,
            open_external_url,
            save_app_settings,
            save_user_settings,
            delete_user_account,
            clear_local_data,
            get_igdb_settings,
            save_igdb_settings,
            search_igdb_games,
            get_game_detail,
            get_stats_snapshot,
            launch_game,
            refresh_game_metadata,
            reset_game_playtime,
            reset_game_metadata_to_igdb,
            reset_library_metadata_to_igdb,
            refresh_library_metadata,
            update_game_user_rating_review,
            update_session_note
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            RunEvent::ExitRequested { code, api, .. } => {
                let should_allow_exit = match app.state::<AppState>().exit_guard.lock() {
                    Ok(guard) => *guard,
                    Err(_) => {
                        log::warn!("failed to lock exit guard during exit request");
                        true
                    }
                };

                if should_allow_exit {
                    return;
                }

                api.prevent_exit();
                request_confirmed_app_exit(app, code);
            }
            RunEvent::Exit => {
                if let Ok(mut exit_guard) = app.state::<AppState>().exit_guard.lock() {
                    *exit_guard = false;
                }
            }
            _ => {}
        });
}
