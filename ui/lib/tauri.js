import { convertFileSrc, invoke as tauriInvoke } from "@tauri-apps/api/core";
import tauriConfig from "../../src-tauri/tauri.conf.json";

const mockNow = Math.floor(Date.now() / 1000);

const mockDashboard = {
  today_seconds: 9900,
  week_seconds: 43200,
  active_games: [
    {
      game_id: 2,
      name: "Baldur's Gate 3",
      cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co5vmg.png",
      cover_position_x: 50,
      cover_position_y: 50,
      cover_zoom: 100,
      backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc9lcu.jpg",
      backdrop_position_x: 50,
      backdrop_position_y: 50,
      backdrop_zoom: 100,
      exe_name: "bg3.exe",
      exe_path: "C:\\Games\\BG3\\bg3.exe",
      started_at: mockNow - 4800,
      elapsed_seconds: 4800
    },
    {
      game_id: 1,
      name: "Elden Ring",
      cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.png",
      cover_position_x: 50,
      cover_position_y: 50,
      cover_zoom: 100,
      backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc85gb.jpg",
      backdrop_position_x: 50,
      backdrop_position_y: 50,
      backdrop_zoom: 100,
      exe_name: "eldenring.exe",
      exe_path: "D:\\Games\\Elden Ring\\Game\\eldenring.exe",
      started_at: mockNow - 1500,
      elapsed_seconds: 1500
    }
  ],
  recent_games: [
    {
      id: 1,
      name: "Elden Ring",
      igdb_id: 1001,
      cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.png",
      cover_position_x: 50,
      cover_position_y: 50,
      cover_zoom: 100,
      backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc85gb.jpg",
      backdrop_position_x: 50,
      backdrop_position_y: 50,
      backdrop_zoom: 100,
      store: "Steam",
      created_at: mockNow - 86400 * 40,
      release_year: 2022,
      total_seconds: 156000,
      last_played: mockNow - 10800,
      executable_count: 1,
      tracking_status: "tracked"
    },
    {
      id: 2,
      name: "Hades",
      cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2lbd.png",
      cover_position_x: 50,
      cover_position_y: 50,
      cover_zoom: 100,
      backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc7lyo.jpg",
      backdrop_position_x: 50,
      backdrop_position_y: 50,
      backdrop_zoom: 100,
      store: "Steam",
      created_at: mockNow - 86400 * 80,
      release_year: 2020,
      total_seconds: 101700,
      last_played: mockNow - 86400,
      executable_count: 1,
      tracking_status: "tracked"
    }
  ]
};

const mockDailyOverview = {
  days: [
    { day_start: mockNow - 86400 * 6, total_seconds: 8100, top_games: [], all_games: [{ name: "Elden Ring", total_seconds: 8100 }] },
    { day_start: mockNow - 86400 * 5, total_seconds: 7500, top_games: [], all_games: [{ name: "Hades", total_seconds: 7500 }] },
    { day_start: mockNow - 86400 * 4, total_seconds: 11100, top_games: [], all_games: [{ name: "Baldur's Gate 3", total_seconds: 11100 }] },
    { day_start: mockNow - 86400 * 3, total_seconds: 9300, top_games: [], all_games: [{ name: "Elden Ring", total_seconds: 5400 }, { name: "Hades", total_seconds: 3900 }] },
    { day_start: mockNow - 86400 * 2, total_seconds: 19800, top_games: [], all_games: [{ name: "Baldur's Gate 3", total_seconds: 19800 }] },
    { day_start: mockNow - 86400, total_seconds: 7200, top_games: [], all_games: [{ name: "Hades", total_seconds: 7200 }] },
    { day_start: mockNow, total_seconds: 9900, top_games: [], all_games: [{ name: "Baldur's Gate 3", total_seconds: 4800 }, { name: "Elden Ring", total_seconds: 5100 }] }
  ]
};

const mockPlaytimeOverview = {
  day: {
    mode: "day",
    buckets: [
      { label: "00:00-02:00", short_label: "00", total_seconds: 0 },
      { label: "02:00-04:00", short_label: "02", total_seconds: 0 },
      { label: "04:00-06:00", short_label: "04", total_seconds: 1800 },
      { label: "06:00-08:00", short_label: "06", total_seconds: 2400 },
      { label: "08:00-10:00", short_label: "08", total_seconds: 1200 },
      { label: "10:00-12:00", short_label: "10", total_seconds: 3000 },
      { label: "12:00-14:00", short_label: "12", total_seconds: 4200 },
      { label: "14:00-16:00", short_label: "14", total_seconds: 3600 },
      { label: "16:00-18:00", short_label: "16", total_seconds: 1800 },
      { label: "18:00-20:00", short_label: "18", total_seconds: 0 },
      { label: "20:00-22:00", short_label: "20", total_seconds: 900 },
      { label: "22:00-24:00", short_label: "22", total_seconds: 2700 },
    ],
  },
  week: {
    mode: "week",
    buckets: [
      { label: "Tue", short_label: "Tue", total_seconds: 7200 },
      { label: "Wed", short_label: "Wed", total_seconds: 8400 },
      { label: "Thu", short_label: "Thu", total_seconds: 5400 },
      { label: "Fri", short_label: "Fri", total_seconds: 11100 },
      { label: "Sat", short_label: "Sat", total_seconds: 18000 },
      { label: "Sun", short_label: "Sun", total_seconds: 4200 },
      { label: "Mon", short_label: "Mon", total_seconds: 21600 },
    ],
  },
  month: {
    mode: "month",
    buckets: [
      { label: "Jan", short_label: "Jan", total_seconds: 0 },
      { label: "Feb", short_label: "Feb", total_seconds: 5400 },
      { label: "Mar", short_label: "Mar", total_seconds: 3600 },
      { label: "Apr", short_label: "Apr", total_seconds: 10800 },
      { label: "May", short_label: "May", total_seconds: 12600 },
      { label: "Jun", short_label: "Jun", total_seconds: 7200 },
      { label: "Jul", short_label: "Jul", total_seconds: 8400 },
      { label: "Aug", short_label: "Aug", total_seconds: 4200 },
      { label: "Sep", short_label: "Sep", total_seconds: 3900 },
      { label: "Oct", short_label: "Oct", total_seconds: 12000 },
      { label: "Nov", short_label: "Nov", total_seconds: 16200 },
      { label: "Dec", short_label: "Dec", total_seconds: 9000 },
    ],
  },
};

const mockLibrary = [
  ...mockDashboard.recent_games,
  {
    id: 23,
    name: "FIFA 23",
    igdb_id: 205780,
    cover_url: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1811260/library_600x900_2x.jpg",
    cover_position_x: 50,
    cover_position_y: 50,
    cover_zoom: 100,
    backdrop_url: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1811260/library_hero.jpg",
    backdrop_position_x: 50,
    backdrop_position_y: 50,
    backdrop_zoom: 100,
    store: "Steam",
    created_at: mockNow - 86400 * 28,
    release_year: 2022,
    total_seconds: 86400,
    last_played: mockNow - 7200,
    executable_count: 1,
    tracking_status: "tracked"
  },
  {
    id: 3,
    name: "Red Dead Redemption 2",
    igdb_id: 1007,
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1q1f.png",
    cover_position_x: 50,
    cover_position_y: 50,
    cover_zoom: 100,
    backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc2q8i.jpg",
    backdrop_position_x: 50,
    backdrop_position_y: 50,
    backdrop_zoom: 100,
    store: "Rockstar",
    created_at: mockNow - 86400 * 200,
    release_year: 2018,
    total_seconds: 5400,
    last_played: mockNow - 86400 * 3,
    executable_count: 1,
    tracking_status: "tracked"
  },
  {
    id: 4,
    name: "Ghost of Tsushima",
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co744o.png",
    backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc6z7b.jpg",
    store: "Steam",
    created_at: mockNow - 86400 * 150,
    release_year: 2024,
    total_seconds: 76200,
    last_played: mockNow - 86400 * 4,
    executable_count: 1,
    tracking_status: "tracked"
  },
  {
    id: 5,
    name: "God of War",
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1tmu.png",
    backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc4wrx.jpg",
    store: "Steam",
    created_at: mockNow - 86400 * 210,
    release_year: 2022,
    total_seconds: 67200,
    last_played: mockNow - 86400 * 6,
    executable_count: 1,
    tracking_status: "tracked"
  },
  {
    id: 6,
    name: "Cyberpunk 2077",
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co7497.png",
    backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc7w8r.jpg",
    store: "GOG",
    created_at: mockNow - 86400 * 320,
    release_year: 2020,
    total_seconds: 63300,
    last_played: mockNow - 86400 * 9,
    executable_count: 1,
    tracking_status: "tracked"
  },
  {
    id: 7,
    name: "The Witcher 3",
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.png",
    backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc6l3z.jpg",
    store: "Steam",
    created_at: mockNow - 86400 * 700,
    release_year: 2015,
    total_seconds: 57000,
    last_played: mockNow - 86400 * 12,
    executable_count: 1,
    tracking_status: "tracked"
  },
  {
    id: 8,
    name: "Stardew Valley",
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2o67.png",
    backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc6k7l.jpg",
    store: "Steam",
    created_at: mockNow - 86400 * 960,
    release_year: 2016,
    total_seconds: 45000,
    last_played: mockNow - 86400 * 15,
    executable_count: 1,
    tracking_status: "tracked"
  },
  {
    id: 9,
    name: "Horizon Zero Dawn",
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2una.png",
    backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc7j7v.jpg",
    store: "Epic Games",
    created_at: mockNow - 86400 * 280,
    release_year: 2020,
    total_seconds: 40800,
    last_played: mockNow - 86400 * 18,
    executable_count: 1,
    tracking_status: "tracked"
  },
  {
    id: 10,
    name: "Sekiro",
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1p2d.png",
    backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc64w9.jpg",
    store: "Steam",
    created_at: mockNow - 86400 * 430,
    release_year: 2019,
    total_seconds: 35100,
    last_played: mockNow - 86400 * 20,
    executable_count: 1,
    tracking_status: "tracked"
  },
  {
    id: 11,
    name: "Marvel's Spider-Man Remastered",
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.png",
    backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc8rwa.jpg",
    store: "Steam",
    created_at: mockNow - 86400 * 220,
    release_year: 2022,
    total_seconds: 31800,
    last_played: mockNow - 86400 * 24,
    executable_count: 1,
    tracking_status: "tracked"
  },
  {
    id: 12,
    name: "Disco Elysium",
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1sfj.png",
    backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc3i1f.jpg",
    store: "Steam",
    created_at: mockNow - 86400 * 540,
    release_year: 2019,
    total_seconds: 28800,
    last_played: mockNow - 86400 * 27,
    executable_count: 1,
    tracking_status: "tracked"
  },
  {
    id: 13,
    name: "Resident Evil 4",
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co6bo0.png",
    backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc8y3b.jpg",
    store: "Steam",
    created_at: mockNow - 86400 * 130,
    release_year: 2023,
    total_seconds: 24600,
    last_played: mockNow - 86400 * 30,
    executable_count: 1,
    tracking_status: "tracked"
  },
  {
    id: 14,
    name: "Slay the Spire",
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1r77.png",
    backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc6tvg.jpg",
    store: "Steam",
    created_at: mockNow - 86400 * 820,
    release_year: 2019,
    total_seconds: 19800,
    last_played: mockNow - 86400 * 34,
    executable_count: 1,
    tracking_status: "tracked"
  }
];

const mockArchiveGames = [
  {
    archive_id: 101,
    name: "Dragon Age: Origins",
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1sfj.png",
    store: "Steam",
    release_year: 2009,
    archived_at: mockNow - 86400 * 2,
    has_igdb_link: true,
    primary_exe_name: "daorigins.exe",
    total_seconds: 18400,
  },
  {
    archive_id: 102,
    name: "Custom RPG Build",
    cover_url: null,
    store: "Manual",
    release_year: null,
    archived_at: mockNow - 86400 * 6,
    has_igdb_link: false,
    primary_exe_name: "game.exe",
    total_seconds: 5400,
  },
];

for (const game of mockLibrary) {
  if (typeof game.is_favorite !== "boolean") {
    game.is_favorite = false;
  }
  if (!game.completion_status || game.completion_status === "Backlog") {
    if ((game.total_seconds || 0) > 0 || game.last_played) {
      game.completion_status = "In Progress";
    } else {
      game.completion_status = "Backlog";
    }
  }
}

mockLibrary[2].is_favorite = true;
mockLibrary[4].is_favorite = true;

const mockGameDetails = {
  1: {
    id: 1,
    name: "Elden Ring",
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.png",
    cover_position_x: 50,
    cover_position_y: 50,
    cover_zoom: 100,
    backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc85gb.jpg",
    backdrop_position_x: 50,
    backdrop_position_y: 50,
    backdrop_zoom: 100,
    metadata_locked: false,
    has_igdb_link: true,
    store: "Steam",
    total_seconds: 156000,
    playtime_adjustment_seconds: 0,
    has_manual_playtime: false,
    last_played: mockNow - 10800,
    is_favorite: false,
    executable_count: 1,
    executable_name: "eldenring.exe",
    executable_path: "D:\\Games\\Elden Ring\\Game\\eldenring.exe",
    release_year: 2022,
    genres: ["Action", "Adventure", "RPG"],
    summary: "Rise, Tarnished, and explore the Lands Between in a vast action RPG shaped by dangerous bosses, cryptic lore, and relentless discovery.",
    platforms: ["PC (Steam)"],
    developers: ["FromSoftware"],
    publishers: ["Bandai Namco Entertainment"],
    age_rating: { label: "PEGI 16", description: "Violence", image_url: null },
    play_sessions: [{ started_at: mockNow - 14400, ended_at: mockNow - 10800, duration_seconds: 3600, is_active: false }]
  },
  2: {
    id: 2,
    name: "Hades",
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2lbd.png",
    cover_position_x: 50,
    cover_position_y: 50,
    cover_zoom: 100,
    backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc7lyo.jpg",
    backdrop_position_x: 50,
    backdrop_position_y: 50,
    backdrop_zoom: 100,
    metadata_locked: false,
    has_igdb_link: true,
    store: "Steam",
    total_seconds: 101700,
    playtime_adjustment_seconds: 0,
    has_manual_playtime: false,
    last_played: mockNow - 86400,
    is_favorite: false,
    executable_count: 1,
    executable_name: "Hades.exe",
    executable_path: "D:\\Games\\Hades\\Hades.exe",
    release_year: 2020,
    genres: ["Roguelike", "Action", "Indie"],
    summary: "Battle out of the Underworld as Zagreus in a fast, stylish roguelike with reactive storytelling and build-driven runs.",
    platforms: ["PC (Steam)"],
    developers: ["Supergiant Games"],
    publishers: ["Supergiant Games"],
    age_rating: { label: "PEGI 12", description: "Moderate violence", image_url: null },
    play_sessions: [{ started_at: mockNow - 96000, ended_at: mockNow - 86400, duration_seconds: 9600, is_active: false }]
  },
  5: {
    id: 5,
    name: "God of War",
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1tmu.png",
    cover_position_x: 50,
    cover_position_y: 50,
    cover_zoom: 100,
    backdrop_url: "https://images.igdb.com/igdb/image/upload/t_1080p/sc4wrx.jpg",
    backdrop_position_x: 50,
    backdrop_position_y: 50,
    backdrop_zoom: 100,
    metadata_locked: false,
    has_igdb_link: true,
    store: "Steam",
    total_seconds: 67200,
    playtime_adjustment_seconds: 0,
    has_manual_playtime: false,
    last_played: mockNow - 86400 * 6,
    is_favorite: false,
    executable_count: 1,
    executable_name: "GoW.exe",
    executable_path: "D:\\Games\\God of War\\GoW.exe",
    release_year: 2018,
    genres: ["Action", "Adventure", "RPG"],
    summary: "Kratos and Atreus journey through the harsh Norse realms, confronting gods, monsters, and grief across a cinematic action adventure.",
    platforms: ["PC (Steam)"],
    developers: ["Santa Monica Studio"],
    publishers: ["PlayStation PC LLC"],
    age_rating: { label: "PEGI 18", description: "Violence, bad language", image_url: null },
    play_sessions: [
      { started_at: mockNow - 86400 * 8, ended_at: mockNow - 86400 * 8 + 5400, duration_seconds: 5400, is_active: false },
      { started_at: mockNow - 86400 * 6, ended_at: mockNow - 86400 * 6 + 4500, duration_seconds: 4500, is_active: false }
    ]
  },
  23: {
    id: 23,
    name: "FIFA 23",
    cover_url: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1811260/library_600x900_2x.jpg",
    cover_position_x: 50,
    cover_position_y: 50,
    cover_zoom: 100,
    backdrop_url: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1811260/library_hero.jpg",
    backdrop_position_x: 50,
    backdrop_position_y: 50,
    backdrop_zoom: 100,
    title_logo_url: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1811260/logo.png",
    use_title_logo: false,
    title_logo_position_x: 50,
    title_logo_position_y: 50,
    title_logo_zoom: 100,
    metadata_locked: false,
    has_igdb_link: true,
    store: "Steam",
    total_seconds: 86400,
    playtime_adjustment_seconds: 0,
    has_manual_playtime: false,
    last_played: mockNow - 7200,
    is_favorite: false,
    executable_count: 1,
    executable_name: "FIFA23.exe",
    executable_path: "D:\\Games\\FIFA 23\\FIFA23.exe",
    release_year: 2022,
    genres: ["Simulation", "Sports"],
    summary: "FIFA 23 brings The World's Game to the pitch, with HyperMotion2 Technology that delivers even more gameplay realism, men's and women's FIFA World Cup coming during the season, women's club teams, cross-play features, and more.",
    platforms: ["PC (Steam)"],
    developers: ["EA Canada", "EA Romania"],
    publishers: ["Electronic Arts"],
    age_rating: { label: "PEGI 3", description: "In-game purchases", image_url: null },
    play_sessions: [
      { started_at: mockNow - 14400, ended_at: mockNow - 12600, duration_seconds: 1800, is_active: false },
      { started_at: mockNow - 9000, ended_at: mockNow - 7200, duration_seconds: 1800, is_active: false }
    ]
  }
};

for (const game of mockLibrary) {
  if (typeof game.is_favorite !== "boolean") {
    game.is_favorite = false;
  }
  if (!game.completion_status) {
    game.completion_status = "Backlog";
  }
  const detail = mockGameDetails[game.id];
  if (detail) {
    game.executable_path = detail.executable_path || null;
    game.executable_name = detail.executable_name || null;
    game.executable_count = detail.executable_path ? 1 : 0;
    detail.completion_status = detail.completion_status || game.completion_status || "Backlog";
  }
}

syncMockFavorite(3, true);
syncMockFavorite(5, true);

const mockIgdbSearchCatalog = [
  {
    id: 1001,
    name: "Elden Ring",
    first_release_year: 2022,
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.png",
    game_type: 0,
  },
  {
    id: 1002,
    name: "Elden Ring: Shadow of the Erdtree",
    first_release_year: 2024,
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co6lbe.png",
    game_type: 1,
  },
  {
    id: 1003,
    name: "Elden Ring Deluxe Bundle",
    first_release_year: 2024,
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.png",
    game_type: 3,
  },
  {
    id: 1004,
    name: "Red Dead Revolver",
    first_release_year: 2004,
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2sjj.png",
    game_type: 0,
  },
  {
    id: 1005,
    name: "Red Dead Redemption",
    first_release_year: 2010,
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1q2p.png",
    game_type: 0,
  },
  {
    id: 1006,
    name: "Red Dead Redemption: Undead Nightmare",
    first_release_year: 2010,
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2xif.png",
    game_type: 4,
  },
  {
    id: 1007,
    name: "Red Dead Redemption 2",
    first_release_year: 2018,
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1q1f.png",
    game_type: 0,
  },
  {
    id: 1008,
    name: "Red Dead Redemption 2: Ultimate Edition",
    first_release_year: 2018,
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1q1f.png",
    game_type: 3,
  },
  {
    id: 1009,
    name: "Persona 3 Reload",
    first_release_year: 2024,
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co6wod.png",
    game_type: 8,
  },
  {
    id: 1010,
    name: "The Last of Us Part I",
    first_release_year: 2022,
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co5sok.png",
    game_type: 8,
  },
  {
    id: 1011,
    name: "Metroid Prime Remastered",
    first_release_year: 2023,
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co6q5n.png",
    game_type: 9,
  },
  {
    id: 1012,
    name: "Cyberpunk 2077: Phantom Liberty",
    first_release_year: 2023,
    cover_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co7h3x.png",
    game_type: 2,
  },
];

const mockNotifications = [
  { id: 1, kind: "played", game_name: "TBH: Task Bar Hero", created_at: mockNow - 3 * 3600, read_at: null },
  { id: 2, kind: "played", game_name: "Clair Obsur Trainer", created_at: mockNow - 5 * 86400, read_at: null },
  { id: 3, kind: "played", game_name: "Red Dead Redemption 2", created_at: mockNow - 7 * 86400, read_at: null },
  { id: 4, kind: "played", game_name: "Grand Theft Auto: San Andreas", created_at: mockNow - 8 * 86400, read_at: null },
  { id: 5, kind: "added", game_name: "Feeding Frenzy", created_at: mockNow - 10 * 86400, read_at: null },
];

const mockAppSettings = {
  start_on_system_startup: true,
  close_to_system_tray: true,
  default_page: "dashboard",
  language: "English",
  app_theme: "dark",
  top_game_artwork: "capsule",
  playtime_display_mode: "standard",
};

const mockUserSettings = {
  fullName: "",
  username: "",
  displayName: "",
  bio: "",
  email: "",
  phone: "",
  github: "",
  instagram: "",
  facebook: "",
  telegram: "",
  language: "English",
  timezone: "(GMT+7) Jakarta",
  dateFormat: "May 25, 2026",
  timeFormat: "12 Hour (07:30 PM)",
  memberSince: "-",
  lastLogin: "-",
  accountStatus: "-",
  userId: "-",
  avatarDataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
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
  `)}`,
};

const mockIgdbSettings = {
  client_id: "",
  has_client_secret: false,
};

function findMockLibraryGame(gameId) {
  return mockLibrary.find((game) => Number(game.id) === Number(gameId)) || null;
}

function syncMockFavorite(gameId, isFavorite) {
  const normalized = Boolean(isFavorite);
  const libraryGame = findMockLibraryGame(gameId);
  if (libraryGame) {
    libraryGame.is_favorite = normalized;
  }

  if (mockGameDetails[gameId]) {
    mockGameDetails[gameId].is_favorite = normalized;
  }
}

function createMockNotification(kind, gameName) {
  const nextId = mockNotifications.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  mockNotifications.unshift({
    id: nextId,
    kind: String(kind || "played"),
    game_name: String(gameName || "").trim() || "Unknown game",
    created_at: Math.floor(Date.now() / 1000),
    read_at: null,
  });
}

function hasTauriInvoke() {
  return Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__?.core || window.__TAURI_INVOKE__);
}

export async function invoke(command, args) {
  if (hasTauriInvoke()) {
    return tauriInvoke(command, args);
  }

  purgeExpiredMockArchiveGames();

  if (command === "get_dashboard") {
    return mockDashboard;
  }

  if (command === "get_notification_overview") {
    const limit = Number(args?.limit || 0);
    const items = limit > 0 ? mockNotifications.slice(0, limit) : [...mockNotifications];
    return {
      unread_count: mockNotifications.filter((item) => !item.read_at).length,
      items,
    };
  }

  if (command === "mark_all_notifications_read") {
    const now = Math.floor(Date.now() / 1000);
    for (const item of mockNotifications) {
      if (!item.read_at) {
        item.read_at = now;
      }
    }
    return null;
  }

  if (command === "get_app_settings") {
    return { ...mockAppSettings };
  }

  if (command === "get_user_settings") {
    const fn = String(mockUserSettings.fullName || "").trim();
    const un = String(mockUserSettings.username || "").trim();
    const em = String(mockUserSettings.email || "").trim();
    if (fn === "Alex Moons" || fn === "Rivay Ramadhan" || un === "alexmoons" || un === "rivay.dev" || em === "alexmoons.artyle@gmail.com" || em === "rivay.dev@gmail.com") {
      Object.assign(mockUserSettings, {
        fullName: "",
        username: "",
        displayName: "",
        bio: "",
        email: "",
        phone: "",
        github: "",
        instagram: "",
        facebook: "",
        telegram: "",
        memberSince: "-",
        lastLogin: "-",
        accountStatus: "-",
        userId: "-",
      });
    }
    return { ...mockUserSettings };
  }

  if (command === "should_show_main_window_on_boot") {
    return true;
  }

  if (command === "show_main_window") {
    return null;
  }

  if (command === "get_app_system_info") {
    return {
      os: "Windows 11 build 26100",
      version: String(tauriConfig.version || ""),
    };
  }

  if (command === "open_external_url") {
    const url = String(args?.url || "");
    if (url && typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    return null;
  }

  if (command === "save_app_settings") {
    mockAppSettings.start_on_system_startup = Boolean(args?.startOnSystemStartup);
    mockAppSettings.close_to_system_tray = Boolean(args?.closeToSystemTray);
    mockAppSettings.default_page = String(args?.defaultPage || "dashboard").toLowerCase();
    mockAppSettings.language = String(args?.language || "English") || "English";
    mockAppSettings.app_theme = String(args?.appTheme || "dark").toLowerCase() === "light" ? "light" : "dark";
    mockAppSettings.top_game_artwork = String(args?.topGameArtwork || "capsule").toLowerCase() === "poster" ? "poster" : "capsule";
    mockAppSettings.playtime_display_mode = String(args?.playtimeDisplayMode || "standard").toLowerCase() === "hours_only" ? "hours_only" : "standard";
    return null;
  }

  if (command === "save_user_settings") {
    Object.assign(mockUserSettings, args?.input || {});
    return { ...mockUserSettings };
  }

  if (command === "delete_user_account") {
    const now = new Date();
    Object.assign(mockUserSettings, {
      ...mockUserSettings,
      ...{
        fullName: "Alex Moons",
        username: "alexmoons",
        displayName: "Artyle",
        bio: "Gamer. Developer. Explorer.\nTracking every adventure, one game at a time.",
        email: "alexmoons.artyle@gmail.com",
        phone: "+123456789",
        github: "your-username",
        instagram: "your-username",
        facebook: "your-username",
        telegram: "your-username",
        language: "English",
        timezone: "(GMT+7) Jakarta",
        dateFormat: "May 25, 2026",
        timeFormat: "12 Hour (07:30 PM)",
        memberSince: "-",
        lastLogin: "-",
        accountStatus: "-",
        userId: "-",
      },
    });
    return { ...mockUserSettings };
  }

  if (command === "export_backup_data") {
    return "C:\\Users\\User\\Downloads\\TylePlay_Backup.tyleplaybak";
  }

  if (command === "import_backup_data") {
    return true;
  }

  if (command === "get_igdb_settings") {
    return { ...mockIgdbSettings };
  }

  if (command === "save_igdb_settings") {
    const clientId = String(args?.clientId || "").trim();
    const clientSecret = String(args?.clientSecret || "").trim();
    if (!clientId || !clientSecret) {
      throw new Error("Client ID and Client Secret are required");
    }
    mockIgdbSettings.client_id = clientId;
    mockIgdbSettings.has_client_secret = true;
    return null;
  }

  if (command === "get_daily_playtime_overview") {
    return mockDailyOverview;
  }

  if (command === "list_games") {
    return mockLibrary;
  }

  if (command === "list_archived_games") {
    return mockArchiveGames;
  }

  if (command === "get_archived_game_detail") {
    const archiveId = Number(args?.archiveId || 0);
    const archived = mockArchiveGames.find((game) => Number(game.archive_id) === archiveId);
    if (!archived) {
      throw new Error("archived game not found");
    }
    return {
      archive_id: archived.archive_id,
      name: archived.name,
      cover_url: archived.cover_url,
      backdrop_url: archived.cover_url,
      store: archived.store,
      summary: archived.has_igdb_link
        ? "Archived entry kept from the main library backup database."
        : "Manual archived entry with locally preserved metadata.",
      release_year: archived.release_year,
      genres: archived.has_igdb_link ? ["RPG"] : [],
      platforms: ["Windows"],
      developers: archived.has_igdb_link ? ["BioWare"] : [],
      publishers: archived.store ? [archived.store] : [],
      age_rating: null,
      total_seconds: archived.total_seconds || 0,
      playtime_adjustment_seconds: 0,
      archived_at: archived.archived_at,
      has_igdb_link: archived.has_igdb_link,
      primary_exe_name: archived.primary_exe_name,
    };
  }

  if (command === "search_archived_games_by_name") {
    const query = String(args?.query || "").trim().toLowerCase();
    if (!query) {
      return [];
    }
    return mockArchiveGames.filter((game) => String(game.name || "").toLowerCase().includes(query));
  }

  if (command === "search_igdb_games") {
    const query = String(args?.query || "").trim().toLowerCase();
    if (!query) {
      return [];
    }

    const seen = new Set();
    return mockIgdbSearchCatalog
      .filter((game) => String(game.name || "").toLowerCase().includes(query))
      .filter((game) => {
        const key = String(game.name || "").toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, 12);
  }

  if (command === "get_playtime_overview") {
    return mockPlaytimeOverview[String(args?.mode || "week").toLowerCase()] || mockPlaytimeOverview.week;
  }

  if (command === "get_stats_snapshot") {
    return {
      games: mockLibrary.map((game) => {
        const detail = mockGameDetails[Number(game.id)] || {};
        return {
          id: Number(game.id),
          name: game.name,
          store: game.store || null,
          cover_url: game.cover_url || null,
          total_seconds: Number(game.total_seconds || 0),
          play_sessions: Array.isArray(detail.play_sessions) ? detail.play_sessions : [],
        };
      }),
    };
  }

  if (command === "get_game_detail") {
    const gameId = Number(args?.gameId || 0);
    const summary = mockLibrary.find((game) => Number(game.id) === gameId);
    const detail = mockGameDetails[gameId];
    if (detail) {
      return {
        created_at: summary?.created_at || Math.floor(Date.now() / 1000),
        ...detail,
      };
    }
    return {
      id: gameId,
      name: summary?.name || "Unknown Game",
      cover_url: summary?.cover_url || null,
      cover_position_x: summary?.cover_position_x || 50,
      cover_position_y: summary?.cover_position_y || 50,
      cover_zoom: summary?.cover_zoom || 100,
      backdrop_url: summary?.backdrop_url || summary?.cover_url || null,
      steam_header_url: summary?.steam_header_url || null,
      backdrop_position_x: summary?.backdrop_position_x || 50,
      backdrop_position_y: summary?.backdrop_position_y || 50,
      backdrop_zoom: summary?.backdrop_zoom || 100,
      title_logo_url: summary?.title_logo_url || null,
      use_title_logo: Boolean(summary?.use_title_logo),
      title_logo_position_x: summary?.title_logo_position_x || 50,
      title_logo_position_y: summary?.title_logo_position_y || 50,
      title_logo_zoom: summary?.title_logo_zoom || 100,
      metadata_locked: false,
      has_igdb_link: false,
      store: summary?.store || "PC",
      total_seconds: summary?.total_seconds || 0,
      playtime_adjustment_seconds: 0,
      has_manual_playtime: false,
      last_played: summary?.last_played || null,
      is_favorite: Boolean(summary?.is_favorite),
      executable_count: summary?.executable_count || 0,
      executable_name: null,
      executable_path: null,
      release_year: summary?.release_year || null,
      genres: [],
      summary: "",
      platforms: [],
      developers: [],
      publishers: [],
      age_rating: null,
      created_at: summary?.created_at || Math.floor(Date.now() / 1000),
      play_sessions: []
    };
  }

  if (command === "refresh_game_metadata") {
    return true;
  }

  if (command === "pick_exe_path") {
    return "C:\\Games\\Restored Game\\game.exe";
  }

  if (command === "validate_executable_path") {
    const exePath = String(args?.exePath || "").trim();
    if (!exePath) {
      throw new Error("exe path is required");
    }
    if (!/\.exe$/i.test(exePath)) {
      throw new Error("exe path must point to a .exe file");
    }
    if (/missing|invalid|not-found/i.test(exePath)) {
      throw new Error("exe file was not found at that path");
    }
    return null;
  }

  if (command === "export_game_sessions_csv") {
    const fileName = String(args?.fileName || "game-sessions.csv").trim() || "game-sessions.csv";
    return `C:\\Users\\Public\\Downloads\\${fileName}`;
  }

  if (command === "preflight_add_game") {
    const exePath = String(args?.exePath || "").trim();
    const igdbId = Number(args?.igdbId || 0);

    const normalizedExePath = exePath.toLowerCase();
    const conflictingDetail = Object.values(mockGameDetails).find((detail) => String(detail?.executable_path || "").toLowerCase() === normalizedExePath);
    if (conflictingDetail) {
      return {
        duplicate_igdb_game: null,
        executable_conflict_message: `this executable is already linked to "${conflictingDetail.name}". Use a different .exe or delete/update the existing game first.`,
      };
    }

    if (igdbId) {
      const duplicate = mockLibrary.find((game) => Number(game.igdb_id) === igdbId);
      if (duplicate) {
        return {
          duplicate_igdb_game: {
            game_id: duplicate.id,
            game_name: duplicate.name,
            store: duplicate.store || null,
            release_year: duplicate.release_year || null,
          },
          executable_conflict_message: null,
        };
      }
    }

    return {
      duplicate_igdb_game: null,
      executable_conflict_message: null,
    };
  }

  if (command === "add_game") {
    const gameName = String(args?.gameName || "").trim();
    const exePath = String(args?.exePath || "").trim();
    if (!gameName || !exePath) {
      throw new Error("game name and exe path are required");
    }

    const nextId = mockLibrary.reduce((max, game) => Math.max(max, Number(game.id) || 0), 0) + 1;
    const releaseYear = mockLibrary.find((game) => String(game.name || "").toLowerCase() === gameName.toLowerCase())?.release_year || null;
    const coverUrl = args?.coverUrl || null;
    const store = args?.store || null;
    const createdAt = Math.floor(Date.now() / 1000);
    const nextGame = {
      id: nextId,
      name: gameName,
      cover_url: coverUrl,
      backdrop_url: coverUrl,
      store,
      created_at: createdAt,
      release_year: releaseYear,
      total_seconds: 0,
      last_played: null,
      executable_count: 1,
      tracking_status: "tracked",
      igdb_id: args?.igdbId || null,
      is_favorite: false,
    };

    mockLibrary.unshift(nextGame);
    mockGameDetails[nextId] = {
      id: nextId,
      name: gameName,
      cover_url: coverUrl,
      cover_position_x: 50,
      cover_position_y: 50,
      cover_zoom: 100,
      backdrop_url: coverUrl,
      backdrop_position_x: 50,
      backdrop_position_y: 50,
      backdrop_zoom: 100,
      metadata_locked: false,
      has_igdb_link: Boolean(args?.igdbId),
      store,
      total_seconds: 0,
      playtime_adjustment_seconds: 0,
      has_manual_playtime: false,
      last_played: null,
      is_favorite: false,
      executable_count: 1,
      executable_name: exePath.split(/[/\\]/).pop() || null,
      executable_path: exePath,
      release_year: releaseYear,
      genres: [],
      summary: "",
      platforms: [],
      developers: [],
      publishers: [],
      age_rating: null,
      play_sessions: [],
    };

    createMockNotification("added", gameName);

    return {
      status: "added",
      game_name: gameName,
    };
  }

  if (command === "pick_image_path") {
    return null;
  }

  if (command === "restore_archived_game_entry") {
    const archiveId = Number(args?.archiveId || 0);
    const archiveIndex = mockArchiveGames.findIndex((game) => Number(game.archive_id) === archiveId);
    if (archiveIndex < 0) {
      throw new Error("archived game not found");
    }

    const archived = mockArchiveGames[archiveIndex];
    const nextId = mockLibrary.reduce((max, game) => Math.max(max, Number(game.id) || 0), 0) + 1;
    mockLibrary.unshift({
      id: nextId,
      name: archived.name,
      cover_url: archived.cover_url,
      backdrop_url: archived.cover_url,
      store: archived.store,
      created_at: Math.floor(Date.now() / 1000),
      release_year: archived.release_year,
      total_seconds: 0,
      last_played: null,
      executable_count: 1,
      tracking_status: "tracked",
      is_favorite: false,
    });
    mockArchiveGames.splice(archiveIndex, 1);
    createMockNotification("restored", archived.name);
    return {
      status: "restored",
      game_name: archived.name,
    };
  }

  if (command === "delete_archived_game_entry") {
    const archiveId = Number(args?.archiveId || 0);
    const archiveIndex = mockArchiveGames.findIndex((game) => Number(game.archive_id) === archiveId);
    if (archiveIndex < 0) {
      throw new Error("archived game not found");
    }
    const archived = mockArchiveGames[archiveIndex];
    mockArchiveGames.splice(archiveIndex, 1);
    createMockNotification("permanently_deleted", archived.name);
    return null;
  }

  if (command === "delete_game") {
    const gameId = Number(args?.gameId || 0);
    const index = mockLibrary.findIndex((game) => Number(game.id) === gameId);
    if (index < 0) {
      throw new Error("game not found");
    }

    const removed = mockLibrary.splice(index, 1)[0];
    mockArchiveGames.unshift({
      archive_id: Math.max(100, ...mockArchiveGames.map((game) => Number(game.archive_id) || 0)) + 1,
      name: removed.name,
      cover_url: removed.cover_url || null,
      store: removed.store || null,
      release_year: removed.release_year || null,
      archived_at: Math.floor(Date.now() / 1000),
      has_igdb_link: false,
      primary_exe_name: mockGameDetails[gameId]?.executable_name || null,
      total_seconds: Number(removed.total_seconds || 0),
    });
    delete mockGameDetails[gameId];
    createMockNotification("deleted", removed.name);
    return null;
  }

  if (command === "clear_local_data") {
    mockLibrary.splice(0, mockLibrary.length);
    mockArchiveGames.splice(0, mockArchiveGames.length);
    mockNotifications.splice(0, mockNotifications.length);
    Object.keys(mockGameDetails).forEach((key) => {
      delete mockGameDetails[key];
    });
    mockDashboard.active_games = [];
    mockDashboard.recent_games = [];
    mockDashboard.today_seconds = 0;
    mockDashboard.week_seconds = 0;
    return null;
  }

  if (command === "update_game_executable") {
    const gameId = Number(args?.input?.gameId || 0);
    const exePath = String(args?.input?.exePath || "").trim();
    const detail = mockGameDetails[gameId] || (mockGameDetails[gameId] = { ...(findMockLibraryGame(gameId) || { id: gameId, name: "Unknown Game" }) });

    detail.executable_path = exePath || null;
    detail.executable_name = exePath ? exePath.split(/[/\\]/).pop() || null : null;
    detail.executable_count = exePath ? 1 : 0;

    const libraryGame = findMockLibraryGame(gameId);
    if (libraryGame) {
      libraryGame.executable_count = detail.executable_count;
    }
    return null;
  }

  if (command === "update_game_metadata") {
    const input = args?.input || {};
    const gameId = Number(input.gameId || 0);
    const detail = mockGameDetails[gameId] || (mockGameDetails[gameId] = { ...(findMockLibraryGame(gameId) || { id: gameId, name: "Unknown Game" }) });
    const libraryGame = findMockLibraryGame(gameId);

    const nextAgeRating = input.ageRatingLabel
      ? { label: input.ageRatingLabel, description: "", image_url: null }
      : null;

    const resolvedStatus = input.completionStatus || detail.completion_status || "Backlog";

    Object.assign(detail, {
      id: gameId,
      name: input.name,
      store: input.store || null,
      cover_url: input.coverUrl || null,
      cover_position_x: input.coverPositionX ?? 50,
      cover_position_y: input.coverPositionY ?? 50,
      cover_zoom: input.coverZoom ?? 100,
      backdrop_url: input.backdropUrl || null,
      backdrop_position_x: input.backdropPositionX ?? 50,
      backdrop_position_y: input.backdropPositionY ?? 50,
      backdrop_zoom: input.backdropZoom ?? 100,
      title_logo_url: input.titleLogoUrl || null,
      use_title_logo: Boolean(input.useTitleLogo),
      title_logo_position_x: input.titleLogoPositionX ?? 50,
      title_logo_position_y: input.titleLogoPositionY ?? 50,
      title_logo_zoom: input.titleLogoZoom ?? 100,
      release_year: input.releaseYear || null,
      summary: input.summary || "",
      genres: Array.isArray(input.genres) ? input.genres : [],
      platforms: Array.isArray(input.platforms) ? input.platforms : [],
      developers: Array.isArray(input.developers) ? input.developers : [],
      publishers: Array.isArray(input.publishers) ? input.publishers : [],
      age_rating: nextAgeRating,
      completion_status: resolvedStatus,
      metadata_locked: true,
      has_igdb_link: Boolean(detail.has_igdb_link),
      total_seconds: detail.total_seconds || libraryGame?.total_seconds || 0,
      playtime_adjustment_seconds: detail.playtime_adjustment_seconds || 0,
      has_manual_playtime: Boolean(detail.has_manual_playtime),
      last_played: detail.last_played || libraryGame?.last_played || null,
      executable_count: detail.executable_count || libraryGame?.executable_count || 0,
      play_sessions: Array.isArray(detail.play_sessions) ? detail.play_sessions : [],
    });

    if (libraryGame) {
      Object.assign(libraryGame, {
        name: input.name,
        store: input.store || null,
        cover_url: input.coverUrl || null,
        cover_position_x: input.coverPositionX ?? 50,
        cover_position_y: input.coverPositionY ?? 50,
        cover_zoom: input.coverZoom ?? 100,
        completion_status: resolvedStatus,
        backdrop_url: input.backdropUrl || null,
        backdrop_position_x: input.backdropPositionX ?? 50,
        backdrop_position_y: input.backdropPositionY ?? 50,
        backdrop_zoom: input.backdropZoom ?? 100,
        title_logo_url: input.titleLogoUrl || null,
        use_title_logo: Boolean(input.useTitleLogo),
        title_logo_position_x: input.titleLogoPositionX ?? 50,
        title_logo_position_y: input.titleLogoPositionY ?? 50,
        title_logo_zoom: input.titleLogoZoom ?? 100,
        release_year: input.releaseYear || null,
      });
    }

    return null;
  }

  if (command === "update_game_playtime") {
    const input = args?.input || {};
    const gameId = Number(input.gameId || 0);
    const requestedTotalSeconds = Math.max(0, Number(input.totalSeconds || 0));
    const detail = mockGameDetails[gameId] || (mockGameDetails[gameId] = { ...(findMockLibraryGame(gameId) || { id: gameId, name: "Unknown Game" }) });
    const libraryGame = findMockLibraryGame(gameId);
    const trackedSeconds = Math.max(
      0,
      Number(detail.total_seconds || libraryGame?.total_seconds || 0) - Number(detail.playtime_adjustment_seconds || 0)
    );
    const nextAdjustment = requestedTotalSeconds - trackedSeconds;

    detail.playtime_adjustment_seconds = nextAdjustment;
    detail.has_manual_playtime = nextAdjustment !== 0;
    detail.total_seconds = trackedSeconds + nextAdjustment;

    if (libraryGame) {
      libraryGame.total_seconds = detail.total_seconds;
    }

    return null;
  }

  if (command === "reset_game_playtime") {
    const gameId = Number(args?.gameId || 0);
    const detail = mockGameDetails[gameId];
    const libraryGame = findMockLibraryGame(gameId);

    if (detail) {
      const trackedSeconds = Math.max(0, Number(detail.total_seconds || 0) - Number(detail.playtime_adjustment_seconds || 0));
      detail.playtime_adjustment_seconds = 0;
      detail.has_manual_playtime = false;
      detail.total_seconds = trackedSeconds;

      if (libraryGame) {
        libraryGame.total_seconds = trackedSeconds;
      }
    }

    return null;
  }

  if (command === "set_game_favorite") {
    const gameId = Number(args?.gameId || 0);
    syncMockFavorite(gameId, args?.isFavorite);
    return null;
  }

  if (command === "reset_game_metadata_to_igdb") {
    const gameId = Number(args?.gameId || 0);
    const detail = mockGameDetails[gameId];
    if (detail) {
      detail.cover_position_x = 50;
      detail.cover_position_y = 50;
      detail.cover_zoom = 100;
      detail.backdrop_position_x = 50;
      detail.backdrop_position_y = 50;
      detail.backdrop_zoom = 100;
      detail.title_logo_position_x = 50;
      detail.title_logo_position_y = 50;
      detail.title_logo_zoom = 100;
      detail.use_title_logo = false;
      detail.metadata_locked = false;
    }
    return true;
  }

  if (command === "reset_library_metadata_to_igdb") {
    let reset = 0;
    let skipped = 0;

    Object.entries(mockGameDetails).forEach(([gameId, detail]) => {
      if (!detail?.igdb_id) {
        skipped += 1;
        return;
      }

      detail.cover_position_x = 50;
      detail.cover_position_y = 50;
      detail.cover_zoom = 100;
      detail.backdrop_position_x = 50;
      detail.backdrop_position_y = 50;
      detail.backdrop_zoom = 100;
      detail.title_logo_position_x = 50;
      detail.title_logo_position_y = 50;
      detail.title_logo_zoom = 100;
      detail.use_title_logo = false;
      detail.metadata_locked = false;
      reset += 1;
    });

    return {
      processed: Object.keys(mockGameDetails).length,
      reset,
      skipped,
      failed: 0,
    };
  }

  if (command === "get_library_steam_headers") {
    return {};
  }

  if (command === "update_game_user_rating_review") {
    const { gameId, userRating, userReview } = payload || {};
    const game = mockDashboard.recent_games.find(g => g.id === Number(gameId));
    if (game) {
      game.user_rating = userRating;
      game.user_review = userReview;
    }
    const detail = mockGameDetails[Number(gameId)];
    if (detail) {
      detail.user_rating = userRating;
      detail.user_review = userReview;
    }
    return true;
  }

  if (command === "update_session_note") {
    const { sessionId, note } = payload || {};
    Object.values(mockGameDetails).forEach(detail => {
      const session = detail?.play_sessions?.find(s => s.id === Number(sessionId));
      if (session) {
        session.note = note;
      }
    });
    return true;
  }

  if (command === "launch_game") {
    return null;
  }

  throw new Error(`Unsupported mock command: ${command}`);
}

const MOCK_ARCHIVE_RETENTION_DAYS = 90;
const MOCK_ARCHIVE_RETENTION_SECONDS = MOCK_ARCHIVE_RETENTION_DAYS * 24 * 60 * 60;

function purgeExpiredMockArchiveGames() {
  const cutoff = Math.floor(Date.now() / 1000) - MOCK_ARCHIVE_RETENTION_SECONDS;
  for (let index = mockArchiveGames.length - 1; index >= 0; index -= 1) {
    if (Number(mockArchiveGames[index]?.archived_at || 0) <= cutoff) {
      mockArchiveGames.splice(index, 1);
    }
  }
}

export function toAssetUrl(value) {
  if (!value) {
    return "";
  }

  const raw = String(value);
  const isWindowsPath = /^[a-zA-Z]:\\/.test(raw);
  const isUnixPath = raw.startsWith("/");
  if ((isWindowsPath || isUnixPath) && hasTauriInvoke()) {
    return convertFileSrc(raw);
  }

  return raw;
}

export async function minimizeWindow() {
  if (!hasTauriInvoke()) {
    return;
  }
  await tauriInvoke("window_minimize");
}

export async function toggleWindowMaximize() {
  if (!hasTauriInvoke()) {
    return false;
  }
  return tauriInvoke("window_toggle_maximize");
}

export async function closeWindow() {
  if (!hasTauriInvoke()) {
    return;
  }
  await tauriInvoke("window_close");
}

export async function getWindowMaximized() {
  if (!hasTauriInvoke()) {
    return false;
  }
  return tauriInvoke("window_is_maximized");
}

export async function toggleWindowFullscreen() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const appWindow = getCurrentWindow();
    const isFullscreen = await appWindow.isFullscreen();
    await appWindow.setFullscreen(!isFullscreen);
    return !isFullscreen;
  } catch {
    return false;
  }
}
