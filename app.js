// App bootstrap (no modules)
(() => {
  'use strict';

  const { CFG, LINES, STORE_BASE_PRICES } = window.JV_DATA;
  const STATE = window.JV_STATE;
  const GAME = window.JV_GAME;
  const UI = window.JV_UI;

  let state = STATE.load();

  // Prepare board grid sizes
  const elBoard = document.getElementById('board');
  elBoard.style.gridTemplateColumns = `repeat(${CFG.cols}, 1fr)`;
  elBoard.style.gridTemplateRows = `repeat(${CFG.rows}, 1fr)`;

  // Telegram WebApp optional cosmetics
  const TG = window.Telegram?.WebApp;
  try{
    TG?.expand?.();
    TG?.disableVerticalSwipes?.();
    TG?.setHeaderColor?.('#0f172a');
    TG?.setBackgroundColor?.('#0b1226');
  }catch(_){}

  const ui = UI.initUI(state, {
    onSell: (from, helpers) => {
      const res = GAME.sellAnimalAt(state, from);
      if (res.sold){
        helpers.toast?.(`Продано за 🪙 ${Math.floor(res.amount)}`);
        helpers.haptic?.('medium');
        ui.render();
      }
    },
    onDrop: (from, to, helpers) => {
      GAME.handleDrop(state, from, to, helpers);
      ui.render();
    },
    onPlace: (helpers) => {
      GAME.placeFromQueue(state, helpers);
      ui.render();
    },
    onBonus: (helpers) => {
      GAME.activateBonus(state, helpers);
      ui.render();
    }
  });

  // Init progression + starters + sanitize
  GAME.initProgression(state, ui);
  ui.render();

  // Tabs
  function setTab(name){
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page--active'));
    document.getElementById('page-' + name)?.classList.add('page--active');

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
    document.querySelector(`.tab[data-tab="${name}"]`)?.classList.add('tab--active');
  }
  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));

  // --- Store: redesigned to buy random unlocked patient / packs / 2x
  function spendCoins(amount){
    if (state.bonusPoints < amount) return false;
    state.bonusPoints -= amount;
    return true;
  }

  function addAnimalToQueue(lineId){
    if (state.queue.length >= CFG.spawnQueueMax){
      ui.toast('Очередь заполнена');
      return false;
    }
    state.queue.push({ lineId, tier: 0 });
    return true;
  }

  function buyRandomUnlocked(){
    const list = state.unlockedLines;
    if (!list || list.length === 0){
      ui.toast('Сначала открой зверей уровнем');
      return;
    }
    const lineId = list[Math.floor(Math.random()*list.length)];
    const ok = addAnimalToQueue(lineId);
    if (ok) ui.toast('Куплено: пациент в очередь');
  }

  function buyPack(n){
    let added = 0;
    for (let i=0;i<n;i++){
      const list = state.unlockedLines;
      if (!list || list.length === 0) break;
      if (state.queue.length >= CFG.spawnQueueMax) break;
      const lineId = list[Math.floor(Math.random()*list.length)];
      state.queue.push({ lineId, tier: 0 });
      added++;
    }
    ui.toast(added ? `Куплено: +${added} в очередь` : 'Очередь заполнена');
  }

  function buyBonus2x(){
    const now = Date.now();
    if (now < state.bonus.cooldownUntil){
      ui.toast('2× на кулдауне');
      return false;
    }
    GAME.activateBonus(state, ui);
    return true;
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-buy][data-price], [data-buy][data-base-price]');
    if (!btn) return;

    const what = btn.getAttribute('data-buy');
    let price = Number(btn.getAttribute('data-price'));
    if (!Number.isFinite(price)) {
      const base = Number(btn.getAttribute('data-base-price'));
      if (!Number.isFinite(base)) return;
      const mul = 1 + Math.max(0, (state.level - 1)) * CFG.storePricePerLevel;
      price = Math.max(1, Math.round(base * mul));
    }

    if (!spendCoins(price)){
      ui.toast('Не хватает 🪙');
      ui.render();
      return;
    }

    if (what === 'random'){
      buyRandomUnlocked();
    } else if (what === 'pack3'){
      buyPack(3);
    } else if (what === 'bonus'){
      const ok = buyBonus2x();
      if (!ok){
        // refund
        state.bonusPoints += price;
      }
    } else {
      // legacy buttons (forest/home/exotic) -> treat as random
      buyRandomUnlocked();
    }

    ui.render();
  });

  // Update store page HTML if still old: do it on the fly (non-destructive)
  function patchStoreCopy(){
    const store = document.getElementById('page-store');
    if (!store) return;
    const cards = store.querySelector('.cards');
    if (!cards) return;

    // If already patched, exit
    if (store.querySelector('[data-buy="random"]')) return;

    cards.innerHTML = `
      <div class="card">
        <div class="card__title">Случайный пациент</div>
        <div class="card__body">Любой из открытых на твоём уровне</div>
        <button class="btn btn--primary" type="button" data-buy="random" data-price="6">Купить за 🪙 6</button>
      </div>
      <div class="card">
        <div class="card__title">Пак 3 пациента</div>
        <div class="card__body">Добавит до 3 пациентов в очередь</div>
        <button class="btn btn--primary" type="button" data-buy="pack3" data-price="14">Купить за 🪙 14</button>
      </div>
      <div class="card">
        <div class="card__title">Бустер 2× (90с)</div>
        <div class="card__body">Если не в кулдауне — активируй 2×</div>
        <button class="btn" type="button" data-buy="bonus" data-price="10">Купить за 🪙 10</button>
      </div>
    `;
  }
  patchStoreCopy();

  // Autosave
  setInterval(() => STATE.save(state), CFG.saveEveryMs);
  window.addEventListener('beforeunload', () => STATE.save(state));

  // Main loop
  let last = performance.now();
  function loop(){
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;

    GAME.ensureSpawn(state, ui);
    GAME.tick(state, dt);
    ui.render();

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
