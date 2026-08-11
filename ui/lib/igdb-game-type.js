export function igdbCategoryLabel(gameType) {
  return globalThis.TylePlayIgdbGameType?.igdbCategoryLabel?.(gameType) || "";
}
