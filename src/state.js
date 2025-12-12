// State: load/save and defaults
(() => {
  'use strict';
  const { CFG } = window.JV_DATA;

  const size = CFG.rows * CFG.cols;

  function emptyBoard(){ return Array.from({ length: size }, () => null); }
  function newId(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }

  function defaultState(){
    return {
      // deprecated: old metric (was "очки лечения"). Keep for backward compat.
      score: 0,

      // money (монеты). Earned per second from animals, used in store.
      bonusPoints: 0,

      // sticky metric used for pricing (prevents cheap-roll exploit by selling)
      bestIncomePerSec: 0,

      // leveling
      level: 1,
      xp: 0,

      // unlocked content
      unlockedLines: [],            // line ids that can spawn/buy
      unlockedBottomCells: 0,       // 0..4 unlocked in bottom row

      // board + queue
      board: emptyBoard(),
      queue: [],                    // array of {lineId, tier}
      spawnAt: Date.now() + CFG.spawnEverySec * 1000,
      spawnBoostUntil: 0,           // timestamp
      spawnBoostIntervalSec: 0,

      // bonus 2x
      bonus: { activeUntil: 0, cooldownUntil: 0 },

      // settings
      settings: { sound: true, haptics: true },

      // gifts
      giftNextFreeAt: 0,
      giftPityRare: 0,
      giftPityLegend: 0,

      // pending UI events
      pendingPopups: []             // {title, body}
    };
  }

  function sanitize(state){
    // Ensure shapes
    if (!Array.isArray(state.board) || state.board.length !== size) state.board = emptyBoard();
    if (!Array.isArray(state.queue)) state.queue = [];
    if (!Array.isArray(state.unlockedLines)) state.unlockedLines = [];
    if (!Number.isFinite(state.unlockedBottomCells)) state.unlockedBottomCells = 0;
    if (!Number.isFinite(state.bestIncomePerSec)) state.bestIncomePerSec = 0;

    // Ensure at least one unlocked line at start
    if (state.unlockedLines.length === 0){
      // will be filled by progression init
    }

    // Remove animals placed in locked bottom row (if any) -> move to first empty unlocked cell
    // (We do it later in game init where we know unlocked cells)
  }

  function load(){
    try{
      const raw = localStorage.getItem(CFG.storageKey);
      if (!raw) return defaultState();
      const st = JSON.parse(raw);
      const base = defaultState();
      const merged = { ...base, ...st };
      merged.bonus = { ...base.bonus, ...(st?.bonus || {}) };
      merged.settings = { ...base.settings, ...(st?.settings || {}) };
      sanitize(merged);
      return merged;
    }catch(_){
      return defaultState();
    }
  }

  function save(state){
    try{ localStorage.setItem(CFG.storageKey, JSON.stringify(state)); }catch(_){}
  }

  window.JV_STATE = { load, save, defaultState, newId };
})();
