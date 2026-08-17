import React, { useEffect, useState, useMemo } from "react";
import { invoke } from "../lib/tauri";
import { CloseIcon, RefreshIcon, SearchIcon, FolderIcon, WarningTriangleIcon, CheckIcon } from "./icons";
import LoadingIndicator from "./LoadingIndicator";

const STORE_FILTERS = ["All", "Steam", "Epic Games", "GOG"];

export default function AutoScanModal({ open, onClose, onImported, onNotify }) {
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [scannedGames, setScannedGames] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeStoreFilter, setActiveStoreFilter] = useState("All");
  const [searchFilter, setSearchFilter] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleScan = async () => {
    setScanning(false);
    setScannedGames([]);
    setErrorMsg("Scan installed games feature is temporarily disabled.");
  };

  useEffect(() => {
    if (open) {
      handleScan();
    } else {
      setScannedGames([]);
      setSelectedIds(new Set());
      setActiveStoreFilter("All");
      setSearchFilter("");
      setErrorMsg("");
    }
  }, [open]);

  const filteredGames = useMemo(() => {
    return scannedGames.filter((game) => {
      const matchesStore =
        activeStoreFilter === "All" ||
        game.store.toLowerCase() === activeStoreFilter.toLowerCase();
      const matchesSearch =
        !searchFilter.trim() ||
        game.name.toLowerCase().includes(searchFilter.trim().toLowerCase()) ||
        game.store.toLowerCase().includes(searchFilter.trim().toLowerCase());
      return matchesStore && matchesSearch;
    });
  }, [scannedGames, activeStoreFilter, searchFilter]);

  const toggleSelect = (id, disabled) => {
    if (disabled) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    const selectable = filteredGames.filter(
      (g) => !g.is_already_imported && g.exe_path
    );
    const allSelected = selectable.every((g) => selectedIds.has(g.id));

    setSelectedIds((prev) => {
      const next = new Set(prev);
      selectable.forEach((g) => {
        if (allSelected) {
          next.delete(g.id);
        } else {
          next.add(g.id);
        }
      });
      return next;
    });
  };

  const handleBatchImport = async () => {
    const itemsToImport = scannedGames
      .filter((g) => selectedIds.has(g.id) && g.exe_path && !g.is_already_imported)
      .map((g) => ({
        name: g.name,
        store: g.store,
        exe_path: g.exe_path,
        steam_header_url: g.steam_header_url || null,
        cover_url: g.cover_url || null,
      }));

    if (itemsToImport.length === 0) return;

    setImporting(true);
    try {
      const result = await invoke("batch_import_games", { items: itemsToImport });
      if (result.errors && result.errors.length > 0) {
        onNotify?.({
          tone: "warning",
          title: "Import Completed with Warnings",
          message: `Imported ${result.imported_count} games. ${result.errors.length} items failed.`,
        });
      } else {
        onNotify?.({
          tone: "success",
          title: "Auto-Import Successful",
          message: `Successfully imported ${result.imported_count} games into your library!`,
        });
      }
      onImported?.();
      onClose();
    } catch (err) {
      console.error("Failed batch import:", err);
      onNotify?.({
        tone: "danger",
        title: "Import Failed",
        message: err?.message || String(err) || "Failed to import selected games.",
      });
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  const selectedCount = selectedIds.size;
  const selectableFiltered = filteredGames.filter(
    (g) => !g.is_already_imported && g.exe_path
  );
  const isAllFilteredSelected =
    selectableFiltered.length > 0 &&
    selectableFiltered.every((g) => selectedIds.has(g.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fadeIn">
      <div
        className="flex h-[620px] max-h-[85vh] w-full max-w-4xl flex-col rounded-[14px] bg-[#161616] text-[#ffffff] shadow-2xl overflow-hidden"
        style={{ backgroundColor: "#161616", color: "#ffffff", border: 0, height: "620px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">
              Scan Installed Games
            </h2>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-[#161616]">
          {/* Store Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {STORE_FILTERS.map((store) => {
              const isActive = activeStoreFilter === store;
              return (
                <button
                  key={store}
                  onClick={() => setActiveStoreFilter(store)}
                  className="transition-all"
                  style={{
                    backgroundColor: isActive ? "#6f63ff" : "#282828",
                    color: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.75)",
                    borderRadius: "9999px",
                    padding: "6px 16px",
                    fontSize: "12px",
                    fontWeight: isActive ? "700" : "500",
                    border: 0,
                    cursor: "pointer",
                    boxShadow: isActive ? "0 2px 10px rgba(111, 99, 255, 0.45)" : "none",
                  }}
                >
                  {store}
                </button>
              );
            })}
          </div>

          {/* Search & Rescan */}
          <div className="flex items-center gap-2 ml-auto">
            <div className="relative flex items-center">
              <SearchIcon className="absolute left-3 h-3.5 w-3.5 text-white/50" />
              <input
                type="text"
                placeholder="Search games..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-48 text-xs text-white placeholder-white/40 outline-none focus:ring-1 focus:ring-[#6f63ff]"
                style={{
                  backgroundColor: "#282828",
                  borderRadius: "9999px",
                  padding: "6px 14px 6px 34px",
                  border: 0,
                }}
              />
            </div>
            <button
              onClick={handleScan}
              disabled={true}
              title="Rescan is temporarily disabled"
              className="flex items-center gap-1.5 transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "#282828",
                color: "#ffffff",
                borderRadius: "9999px",
                padding: "6px 16px",
                fontSize: "12px",
                fontWeight: "500",
                border: 0,
                cursor: "not-allowed",
              }}
            >
              <RefreshIcon className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
              <span>Rescan</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {scanning ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-white/60">
              <LoadingIndicator size="lg" />
            </div>
          ) : errorMsg ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-rose-400 text-center">
              <WarningTriangleIcon className="h-10 w-10 text-rose-500 mb-1" />
              <p className="text-sm font-semibold">{errorMsg}</p>
              <button
                onClick={handleScan}
                style={{
                  backgroundColor: "#282828",
                  color: "#ffffff",
                  borderRadius: "9999px",
                  padding: "8px 20px",
                  fontSize: "12px",
                  border: 0,
                  cursor: "pointer",
                }}
              >
                Try Again
              </button>
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-white/40 text-center">
              <FolderIcon className="h-12 w-12 text-white/20 mb-1" />
              <p className="text-sm font-medium text-white/70">No games found</p>
              <p className="text-xs max-w-sm">
                {scannedGames.length === 0
                  ? "We couldn't detect installed games from default Steam/Epic/GOG directories."
                  : "No games match the current store or search filter."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-2 pb-2 text-xs font-semibold text-white/50 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSelectAllFiltered}
                    disabled={selectableFiltered.length === 0}
                    className="disabled:opacity-30 transition-colors"
                    style={{
                      backgroundColor: "#282828",
                      color: "#8a80ff",
                      borderRadius: "9999px",
                      padding: "4px 14px",
                      fontSize: "12px",
                      fontWeight: "600",
                      border: 0,
                      cursor: "pointer",
                    }}
                  >
                    <span>{isAllFilteredSelected ? "Deselect All" : "Select All Available"}</span>
                  </button>
                </div>
                <span>Found {filteredGames.length} games</span>
              </div>

              <div className="divide-y divide-white/5">
                {filteredGames.map((game) => {
                  const isDisabled = game.is_already_imported || !game.exe_path;
                  const isChecked = selectedIds.has(game.id);

                  return (
                    <div
                      key={game.id}
                      onClick={() => toggleSelect(game.id, isDisabled)}
                      className={`flex items-center justify-between gap-4 p-3 rounded-xl transition-all cursor-pointer ${
                        isDisabled
                          ? "opacity-50 bg-[#161616] cursor-not-allowed"
                          : isChecked
                          ? "bg-[#1f1f1f] border border-[#6f63ff]/60"
                          : "hover:bg-[#1f1f1f]/60"
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={() => {}}
                          className="h-4 w-4 rounded accent-[#6f63ff] bg-[#161616] border-white/20"
                        />

                        {/* Thumbnail or Store Icon */}
                        {game.cover_url ? (
                          <img
                            src={game.cover_url}
                            alt={game.name}
                            className="h-11 w-8 object-cover rounded-md bg-[#1f1f1f]"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="flex h-11 w-8 items-center justify-center rounded-md bg-[#1f1f1f] text-xs font-bold text-white/40">
                            {game.store.charAt(0)}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-white truncate">
                              {game.name}
                            </h4>
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80">
                              {game.store}
                            </span>
                          </div>
                          <p className="text-xs text-white/40 truncate mt-0.5">
                            {game.exe_path || game.install_dir}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {game.is_already_imported ? (
                          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/50">
                            In Library
                          </span>
                        ) : !game.exe_path ? (
                          <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-400">
                            No .exe Found
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                            Ready
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#161616]">
          <div className="text-xs text-white/60">
            Selected: <span className="font-semibold text-white">{selectedCount}</span> games
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={importing}
              style={{
                backgroundColor: "#282828",
                color: "#ffffff",
                borderRadius: "9999px",
                padding: "8px 20px",
                fontSize: "13px",
                fontWeight: "500",
                border: 0,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleBatchImport}
              disabled={selectedCount === 0 || importing}
              className="flex items-center gap-2 disabled:opacity-50"
              style={{
                backgroundColor: selectedCount > 0 ? "#6f63ff" : "#38383f",
                color: "#ffffff",
                borderRadius: "9999px",
                padding: "8px 24px",
                fontSize: "13px",
                fontWeight: "600",
                border: 0,
                cursor: selectedCount > 0 ? "pointer" : "not-allowed",
                boxShadow: selectedCount > 0 ? "0 4px 12px rgba(111, 99, 255, 0.4)" : "none",
              }}
            >
              {importing ? (
                <>
                  <LoadingIndicator size="sm" />
                  <span>Importing...</span>
                </>
              ) : (
                <span>Import {selectedCount} Games</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
