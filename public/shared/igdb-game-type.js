(function attachIgdbGameTypeHelper(globalScope) {
  const IGDB_GAME_TYPE_LABELS = Object.freeze({
    0: "Main Game",
    1: "DLC / Add-on",
    2: "Expansion",
    3: "Bundle",
    4: "Standalone Expansion",
    5: "Mod",
    6: "Episode",
    7: "Season",
    8: "Remake",
    9: "Remaster",
    10: "Expanded Game",
    11: "Port",
    12: "Fork",
    13: "Pack",
    14: "Update",
  });

  function igdbCategoryLabel(gameType) {
    const normalizedType = Number(gameType);
    return IGDB_GAME_TYPE_LABELS[normalizedType] || "";
  }

  globalScope.TylePlayIgdbGameType = {
    IGDB_GAME_TYPE_LABELS,
    igdbCategoryLabel,
  };
  globalScope.igdbCategoryLabel = igdbCategoryLabel;
})(typeof globalThis !== "undefined" ? globalThis : window);
