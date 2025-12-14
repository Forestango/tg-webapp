// Game logic: spawn, merge->xp->level, rewards, locked cells
(() => {
  'use strict';
  const { CFG, PROGRESSION, getTier, canUpgrade, unlockLabel } = window.JV_DATA;
  const { newId } = window.JV_STATE;

  const size = CFG.rows * CFG.cols;

  function randInt(n){ return Math.floor(Math.random() * n); }

  function xpNeed(level){
    return Math.max(20, Math.round(CFG.xpNeedBase * Math.pow(level, CFG.xpNeedPow)));
  }

  function multiplier(state){
    return Date.now() < state.bonus.activeUntil ? 2 : 1;
  }

  function currentSpawnIntervalSec(state){
    const now = Date.now();
    if (now < state.spawnBoostUntil && state.spawnBoostIntervalSec > 0) return state.spawnBoostIntervalSec;
    return CFG.spawnEverySec;
  }

  function bottomRowStart(){ return CFG.bottomRowIndex * CFG.cols; } // 12
  function isBottomRowIdx(idx){
    return idx >= bottomRowStart() && idx < bottomRowStart() + CFG.cols;
  }
  function isCellUnlocked(state, idx){
    if (!isBottomRowIdx(idx)) return true;
    // bottom row unlocks from left to right
    const pos = idx - bottomRowStart(); // 0..3
    return pos < state.unlockedBottomCells;
  }

  function findEmptyUnlockedCell(state){
    const empties = [];
    for (let i=0;i<size;i++){
      if (!isCellUnlocked(state, i)) continue;
      if (!state.board[i]) empties.push(i);
    }
    if (empties.length === 0) return -1;
    return empties[randInt(empties.length)];
  }

  function queueInfo(qItem){
    if (!qItem) return { name: '—', emoji: '🐾', img: null, rate: 0 };
    const t = getTier(qItem.lineId, qItem.tier);
    if (!t) return { name: '—', emoji: '🐾', img: null, rate: 0 };
    return { name: t.name, emoji: t.emoji, img: t.img, rate: t.rate };
  }

  function rollUnlockedLine(state){
    const list = state.unlockedLines;
    if (!list || list.length === 0) return null;
    return list[randInt(list.length)];
  }

  function rollAnimal(state){
    const lineId = rollUnlockedLine(state);
    if (!lineId) return null;
    return { lineId, tier: 0 };
  }

  function ensureSpawn(state, ui){
    const now = Date.now();
    if (state.queue.length >= CFG.spawnQueueMax) return;

    if (now >= state.spawnAt){
      const a = rollAnimal(state);
      if (a){
        state.queue.push(a);
        ui.toast?.('Новый пациент готов!');
        ui.haptic?.('light');
      }
      state.spawnAt = now + currentSpawnIntervalSec(state) * 1000;
    }
  }

  function placeFromQueue(state, ui){
    ensureSpawn(state, ui);
    if (state.queue.length === 0){
      ui.toast?.('Пока нет пациента');
      return;
    }
    const idx = findEmptyUnlockedCell(state);
    if (idx < 0){
      ui.toast?.('Нет свободных открытых коек');
      ui.haptic?.('rigid');
      return;
    }
    const item = state.queue.shift();
    state.board[idx] = { id: newId(), lineId: item.lineId, tier: item.tier };

    ui.markPlace?.(idx);
    ui.haptic?.('medium');
  }

  function addXpFromMerge(state, tier){
    const gain = CFG.xpPerMergeBase * (tier + 1);
    state.xp += gain;
    return gain;
  }

  function applyReward(state, reward, ui){
    if (reward.type === 'coins'){
      state.bonusPoints += reward.amount;
      return `🪙 +${reward.amount}`;
    }
    if (reward.type === 'pack'){
      // add patients to queue
      let added = 0;
      for (let i=0;i<reward.count;i++){
        if (state.queue.length >= CFG.spawnQueueMax) break;
        const a = rollAnimal(state);
        if (!a) break;
        state.queue.push(a);
        added++;
      }
      return added > 0 ? `🎁 +${added} пациент(а) в очередь` : '🎁 Очередь заполнена';
    }
    if (reward.type === 'bonus2x'){
      const now = Date.now();
      // extend active or activate (ignore cooldown for gift)
      const addMs = reward.seconds * 1000;
      if (now < state.bonus.activeUntil){
        state.bonus.activeUntil += addMs;
      } else {
        state.bonus.activeUntil = now + addMs;
      }
      // do not change cooldown on gift
      return `⚡ 2× на ${reward.seconds}с`;
    }
    if (reward.type === 'spawnBoost'){
      const now = Date.now();
      state.spawnBoostUntil = now + reward.seconds * 1000;
      state.spawnBoostIntervalSec = reward.intervalSec;
      // adjust next spawn sooner if waiting
      state.spawnAt = Math.min(state.spawnAt, now + reward.intervalSec * 1000);
      return `⏱ Спавн чаще (${reward.intervalSec}с) на ${reward.seconds}с`;
    }
    return '🎁 Подарок';
  }

  function unlockBottomCellIfNeeded(state){
    const levels = CFG.bottomRowUnlockLevels;
    if (!levels.includes(state.level)) return false;
    if (state.unlockedBottomCells >= CFG.cols) return false;
    state.unlockedBottomCells += 1;
    return true;
  }

  function applyLevelUp(state, ui){
    // Find progression row, apply unlocks and rewards
    const row = PROGRESSION.find(p => p.level === state.level);
    const unlocked = [];
    const rewardTexts = [];

    if (row?.unlock){
      for (const id of row.unlock){
        // treat unlock as "this line becomes available" at least once
        if (!state.unlockedLines.includes(id)){
          state.unlockedLines.push(id);
        }
        unlocked.push(unlockLabel(id));
      }
    }

    if (row?.rewards){
      for (const r of row.rewards){
        rewardTexts.push(applyReward(state, r, ui));
      }
    } else {
      // default gift
      rewardTexts.push(applyReward(state, {type:'coins', amount: 10}, ui));
    }

    const cellUnlocked = unlockBottomCellIfNeeded(state);
    if (cellUnlocked){
      rewardTexts.push('🔓 Открыта новая койка (нижний ряд)');
    }

    // Popup
    const body = [
      unlocked.length ? `Открыто: <b>${unlocked.join(', ')}</b>` : '',
      rewardTexts.length ? `Подарок: <b>${rewardTexts.join(' · ')}</b>` : ''
    ].filter(Boolean).join('<br/>');

    ui.queuePopup?.({ title: `Уровень ${state.level}!`, body });

    ui.haptic?.('heavy');
  }

  function checkLevelUps(state, ui){
    let leveled = false;
    while (state.xp >= xpNeed(state.level)){
      state.xp -= xpNeed(state.level);
      state.level += 1;
      applyLevelUp(state, ui);
      leveled = true;
    }
    return leveled;
  }

  function activateBonus(state, ui){
    const now = Date.now();
    if (now < state.bonus.activeUntil) return;
    if (now < state.bonus.cooldownUntil){
      ui.toast?.('Бонус на перезарядке');
      return;
    }
    state.bonus.activeUntil = now + CFG.bonusDurationSec * 1000;
    state.bonus.cooldownUntil = state.bonus.activeUntil + CFG.bonusCooldownSec * 1000;
    ui.toast?.('2× на 90 секунд!');
    ui.haptic?.('heavy');
  }

  function handleDrop(state, fromIdx, toIdx, ui){
    if (fromIdx === toIdx) return;
    if (!Number.isFinite(fromIdx) || !Number.isFinite(toIdx)) return;
    if (!isCellUnlocked(state, toIdx)){
      ui.toast?.('Эта койка ещё закрыта');
      ui.haptic?.('rigid');
      return;
    }

    const src = state.board[fromIdx];
    if (!src) return;

    const dst = state.board[toIdx];

    // move into empty
    if (!dst){
      state.board[toIdx] = src;
      state.board[fromIdx] = null;
      ui.markMove?.(toIdx);
      ui.haptic?.('light');
      return;
    }

    // merge if same line+tier
    if (dst.lineId === src.lineId && dst.tier === src.tier){
      if (canUpgrade(src.lineId, src.tier)){
        state.board[toIdx] = { id: newId(), lineId: src.lineId, tier: src.tier + 1 };
        state.board[fromIdx] = null;

        const gain = addXpFromMerge(state, src.tier);
        ui.markMerge?.(toIdx);

        const next = getTier(src.lineId, src.tier + 1);
        ui.toast?.(`Слияние! ${next?.emoji ?? '✨'} ${next?.name ?? ''}  (+${gain} XP)`);
        ui.haptic?.('medium');

        checkLevelUps(state, ui);
        return;
      } else {
        ui.toast?.('Максимальная редкость');
        ui.haptic?.('rigid');
        return;
      }
    }

    // otherwise swap (but ensure target unlocked already checked)
    state.board[toIdx] = src;
    state.board[fromIdx] = dst;
    ui.markMove?.(toIdx);
    ui.haptic?.('light');
  }

  function tick(state, dt){
    // Money farms from placed animals (rate/sec) with 2× bonus and small level multiplier.
    let sum = 0;
    for (const a of state.board){
      if (!a) continue;
      const t = getTier(a.lineId, a.tier);
      sum += (t?.rate ?? 1);
    }
    state.bonusPoints += sum * multiplier(state) * dt;
  }

  function initProgression(state, ui){
    // Ensure level 1 progression applied once (unlocks base line + gift)
    if (!state.unlockedLines || state.unlockedLines.length === 0){
      state.unlockedLines = [];
      // Apply level 1 unlocks & gifts
      state.level = Math.max(1, state.level || 1);
      applyLevelUp(state, ui);
      // Put starter animals
      // Place 2 starters in unlocked cells
      const idx0 = findEmptyUnlockedCell(state);
      if (idx0 >= 0) state.board[idx0] = { id: newId(), lineId: state.unlockedLines[0], tier: 0 };
      const idx1 = findEmptyUnlockedCell(state);
      if (idx1 >= 0 && state.unlockedLines[1]) state.board[idx1] = { id: newId(), lineId: state.unlockedLines[1], tier: 0 };
    }
    // Unlock bottom row based on current level
    const levels = CFG.bottomRowUnlockLevels;
    const should = levels.filter(l => l <= state.level).length;
    state.unlockedBottomCells = Math.min(CFG.cols, Math.max(state.unlockedBottomCells, should));

    // Sanitize any animals in locked cells -> move out
    for (let idx=0; idx<size; idx++){
      if (!state.board[idx]) continue;
      if (isCellUnlocked(state, idx)) continue;
      const moveTo = findEmptyUnlockedCell(state);
      if (moveTo >= 0){
        state.board[moveTo] = state.board[idx];
        state.board[idx] = null;
      } else {
        // nowhere to move -> drop it
        state.board[idx] = null;
      }
    }
  }


  function animalValue(animal){
    if (!animal) return 0;
    const t = getTier(animal.lineId, animal.tier);
    const rate = (t?.rate ?? 1);
    // Simple, stable economy: value scales with income power.
    return Math.max(1, Math.round(rate * CFG.valuePerRate));
  }

  function sellAnimalAt(state, idx){
    const a = state.board[idx];
    if (!a) return { sold:false, amount:0 };
    const value = animalValue(a);
    const amount = Math.max(1, Math.floor(value / CFG.sellDivisor));
    state.board[idx] = null;
    state.bonusPoints += amount;
    return { sold:true, amount, value };
  }


  function incomePerSec(state){
    let sum = 0;
    for (let i=0;i<size;i++){
      const a = state.board[i];
      if (!a) continue;
      const t = getTier(a.lineId, a.tier);
      if (!t) continue;
      sum += (t.rate || 0);
    }
    return sum;
  }

  function giftPaidCost(state){
    const inc = Math.max(0, incomePerSec(state));
    if (inc <= 0) return CFG.giftPaidBaseCost;
    // about N seconds of current income
    return Math.max(CFG.giftPaidBaseCost, Math.round(inc * CFG.giftPaidCostSeconds));
  }

  function unlockNextBottomCell(state){
    if (typeof state.unlockedBottomCells !== 'number') state.unlockedBottomCells = 0;
    const before = state.unlockedBottomCells;
    state.unlockedBottomCells = Math.min(CFG.cols, state.unlockedBottomCells + 1);
    return state.unlockedBottomCells > before;
  }

  function rollGiftRarity(state){
    // pity timers
    const legendPity = Math.max(1, CFG.giftPityLegend);
    const rarePity = Math.max(1, CFG.giftPityRare);

    if (state.giftPityLegend >= legendPity - 1) return 'legend';
    if (state.giftPityRare >= rarePity - 1){
      // guarantee at least rare; keep small chance for legend
      const pLegendGivenRare = CFG.giftChanceLegend / Math.max(1e-9, (CFG.giftChanceLegend + CFG.giftChanceRare));
      return Math.random() < pLegendGivenRare ? 'legend' : 'rare';
    }

    const r = Math.random();
    if (r < CFG.giftChanceLegend) return 'legend';
    if (r < CFG.giftChanceLegend + CFG.giftChanceRare) return 'rare';
    return 'common';
  }

  function pickWeighted(items){
    let total = 0;
    for (const it of items) total += it.w;
    let r = Math.random() * total;
    for (const it of items){
      r -= it.w;
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  function rollGift(state, mode){
    const now = Date.now();

    if (mode === 'free'){
      if (now < state.giftNextFreeAt) return { ok:false, reason:'cooldown' };
      state.giftNextFreeAt = now + CFG.giftFreeEverySec * 1000;
    } else {
      const cost = giftPaidCost(state);
      if (state.bonusPoints < cost) return { ok:false, reason:'money', cost };
      state.bonusPoints -= cost;
    }

    const rarity = rollGiftRarity(state);

    // update pity counters
    const isLegend = rarity === 'legend';
    const isRare = rarity === 'rare' || rarity === 'legend';

    if (isLegend) state.giftPityLegend = 0; else state.giftPityLegend += 1;
    if (isRare) state.giftPityRare = 0; else state.giftPityRare += 1;

    const inc = Math.max(1, incomePerSec(state));
    const coinsS = Math.round(inc * 20);
    const coinsM = Math.round(inc * 40);
    const coinsL = Math.round(inc * 80);
    const coinsXL = Math.round(inc * 180);

    const intervalHalf = Math.max(1, Math.round(CFG.spawnEverySec * 0.5));

    const commonPool = [
      { id:'coinsS', w:5, label:`🪙 +${coinsS}` },
      { id:'coinsM', w:3, label:`🪙 +${coinsM}` },
      { id:'queue1', w:2, label:`🐾 +1 пациент` }
    ];
    const rarePool = [
      { id:'coinsL', w:3, label:`🪙 +${coinsL}` },
      { id:'queue3', w:2, label:`🐾 +3 пациента` },
      { id:'spawnBoost', w:2, label:`⏱ быстрее спавн` }
    ];
    const legendPool = [
      { id:'bonusReady', w:3, label:`⚡️ 2× готов` },
      { id:'bonusNow', w:2, label:`⚡️ 2× 90 сек` },
      { id:'unlockCell', w:1, label:`🔓 открыть клетку` },
      { id:'coinsXL', w:1, label:`🪙 +${coinsXL}` }
    ];

    let pick;
    if (rarity === 'legend') pick = pickWeighted(legendPool);
    else if (rarity === 'rare') pick = pickWeighted(rarePool);
    else pick = pickWeighted(commonPool);

    // apply prize
    if (pick.id === 'coinsS') state.bonusPoints += coinsS;
    if (pick.id === 'coinsM') state.bonusPoints += coinsM;
    if (pick.id === 'coinsL') state.bonusPoints += coinsL;
    if (pick.id === 'coinsXL') state.bonusPoints += coinsXL;

    if (pick.id === 'queue1' || pick.id === 'queue3'){
      const n = (pick.id === 'queue3') ? 3 : 1;
      for (let i=0;i<n;i++){
        if (state.queue.length >= CFG.spawnQueueMax) break;
        const a = rollAnimal(state);
        if (a) state.queue.push(a);
      }
    }

    if (pick.id === 'spawnBoost'){
      state.spawnBoostIntervalSec = intervalHalf;
      state.spawnBoostUntil = now + 120 * 1000;
    }

    if (pick.id === 'bonusReady'){
      state.bonus.cooldownUntil = 0;
      if (state.bonus.activeUntil < now) state.bonus.activeUntil = 0;
    }

    if (pick.id === 'bonusNow'){
      // activate immediately (even if cooldown), but don't stack if already active
      if (now >= state.bonus.activeUntil){
        state.bonus.activeUntil = now + CFG.bonusDurationSec * 1000;
        state.bonus.cooldownUntil = state.bonus.activeUntil + CFG.bonusCooldownSec * 1000;
      }
    }

    if (pick.id === 'unlockCell'){
      const ok = unlockNextBottomCell(state);
      if (!ok){
        // fallback if fully unlocked
        state.bonusPoints += coinsL;
        pick = { ...pick, id:'coinsL', label:`🪙 +${coinsL}` };
      }
    }

    return { ok:true, mode, rarity, prize: pick, paidCost: mode==='paid' ? giftPaidCost(state) : 0 };
  }

  window.JV_GAME = {
    xpNeed,
    queueInfo,
    ensureSpawn,
    placeFromQueue,
    activateBonus,
    handleDrop,
    tick,
    initProgression,
    isCellUnlocked,
    animalValue,
    sellAnimalAt,
    currentSpawnIntervalSec,
    incomePerSec,
    giftPaidCost,
    rollGift
  };
})();
