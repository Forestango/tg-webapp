// UI: render, toasts, pointer drag, modal popups
(() => {
  'use strict';
  const { CFG, STORE_BASE_PRICES, getTier } = window.JV_DATA;
  const { xpNeed, queueInfo, isCellUnlocked, currentSpawnIntervalSec, giftPaidCost } = window.JV_GAME;

  const size = CFG.rows * CFG.cols;

  function fmtInt(n){ return new Intl.NumberFormat('ru-RU').format(Math.floor(n)); }
  function fmtSec(sec){ sec = Math.max(0, Math.floor(sec)); return `${sec} сек`; }

  function storePrice(base, level){
    const mul = 1 + Math.max(0, (level - 1)) * CFG.storePricePerLevel;
    return Math.max(1, Math.round(base * mul));
  }

  function initUI(state, handlers){
    const elBoard = document.getElementById('board');
    const elBonusPoints = document.getElementById('bonusPoints');

    const elLevel = document.getElementById('level');
    const elLevelBar = document.getElementById('levelBar');
    const elXpText = document.getElementById('xpText');

    const elNextIcon = document.getElementById('nextIcon');
    const elNextName = document.getElementById('nextName');
    const elSpawnIn = document.getElementById('spawnIn');

    const elBonusBtn = document.getElementById('bonusBtn');

    // Gifts page
    const elGiftTrack = document.getElementById('giftTrack');
    const elGiftFreeBtn = document.getElementById('giftFreeBtn');
    const elGiftPaidBtn = document.getElementById('giftPaidBtn');
    const elGiftPaidCost = document.getElementById('giftPaidCost');
    const elGiftFreeTimer = document.getElementById('giftFreeTimer');
    const elGiftSkipBtn = document.getElementById('giftSkipBtn');
    const elGiftResult = document.getElementById('giftResult');

    const elBonusLabel = document.getElementById('bonusLabel');

    const elPlaceBtn = document.getElementById('placeBtn');

    const elToast = document.getElementById('toast');

    const elTrash = document.getElementById('trashDrop');

    // Modal
    const elModal = document.getElementById('modal');
    const elModalTitle = document.getElementById('modalTitle');
    const elModalBody = document.getElementById('modalBody');
    const elModalOk = document.getElementById('modalOk');

    // Telegram WebApp optional
    const TG = window.Telegram?.WebApp;
    const haptic = (type) => {
      if (!TG) return;
      if (!state.settings?.haptics) return;
      try{ TG.HapticFeedback?.impactOccurred?.(type); }catch(_){}
    };

    let toastTimer = 0;

    function showTrash(on){
      if (!elTrash) return;
      if (on) { elTrash.classList.add('trashDrop--show'); }
      else { elTrash.classList.remove('trashDrop--show','trashDrop--hot'); }
    }
    let giftSpinning = false;
    let giftSkip = null;

    function playGiftRoll(prizeLabel, rarity, onDone){
      if (!elGiftTrack) { onDone?.(); return; }
      if (giftSpinning) return;
      giftSpinning = true;

      const pool = [
        { t:'common', label:'🪙 +' },
        { t:'common', label:'🐾 +1 пациент' },
        { t:'rare', label:'🐾 +3 пациента' },
        { t:'rare', label:'⏱ быстрее спавн' },
        { t:'legend', label:'⚡️ 2× готов' },
        { t:'legend', label:'🔓 открыть клетку' }
      ];

      const items = [];
      const total = 24;
      const winAt = 18;
      for (let i=0;i<total;i++){
        if (i === winAt){
          items.push({ t: rarity === 'legend' ? 'legend' : (rarity === 'rare' ? 'rare' : 'common'), label: prizeLabel });
        } else {
          const it = pool[Math.floor(Math.random()*pool.length)];
          items.push(it);
        }
      }

      elGiftTrack.innerHTML = items.map(it => {
        const cls = it.t === 'legend'
          ? 'giftItem giftItem--legend'
          : (it.t === 'rare' ? 'giftItem giftItem--rare' : 'giftItem giftItem--common');
        return `<div class="${cls}">${it.label}</div>`;
      }).join('');

      // reset transform instantly
      elGiftTrack.style.transition = 'none';
      elGiftTrack.style.transform = 'translateX(0px)';
      // show skip
      if (elGiftSkipBtn){
        elGiftSkipBtn.style.display = '';
        elGiftSkipBtn.disabled = false;
      }
      if (elGiftResult){ elGiftResult.style.display = 'none'; elGiftResult.textContent = ''; }

      const finish = () => {
        if (!giftSpinning) return;
        giftSpinning = false;
        if (elGiftSkipBtn){ elGiftSkipBtn.style.display = 'none'; }
        onDone?.();
      };

      giftSkip = () => {
        // jump to end
        elGiftTrack.style.transition = 'none';
        // compute translate to center winning item
        const first = elGiftTrack.querySelector('.giftItem');
        if (!first){ finish(); return; }
        const itemW = first.getBoundingClientRect().width;
        const gap = 10;
        const targetX = (winAt * (itemW + gap));
        const winCenter = targetX + itemW/2;
        const viewportW = elGiftTrack.parentElement.getBoundingClientRect().width;
        const translate = -(winCenter - viewportW/2);
        elGiftTrack.style.transform = `translateX(${translate}px)`;
        finish();
      };

      // allow skip
      if (elGiftSkipBtn){
        elGiftSkipBtn.onclick = () => { giftSkip?.(); };
      }

      requestAnimationFrame(() => {
        const first = elGiftTrack.querySelector('.giftItem');
        if (!first){ finish(); return; }
        const itemW = first.getBoundingClientRect().width;
        const gap = 10;
        const targetX = (winAt * (itemW + gap));
        const winCenter = targetX + itemW/2;
        const viewportW = elGiftTrack.parentElement.getBoundingClientRect().width;
        const translate = -(winCenter - viewportW/2);

        const duration = 1400 + Math.floor(Math.random()*600);
        elGiftTrack.style.transition = `transform ${duration}ms cubic-bezier(.15,.85,.15,1)`;
        elGiftTrack.style.transform = `translateX(${translate}px)`;

        const onEnd = () => {
          elGiftTrack.removeEventListener('transitionend', onEnd);
          finish();
        };
        elGiftTrack.addEventListener('transitionend', onEnd);
      });
    }

    function hotTrash(on){
      if (!elTrash) return;
      if (on) elTrash.classList.add('trashDrop--hot');
      else elTrash.classList.remove('trashDrop--hot');
    }

    function toast(msg){
      elToast.textContent = msg;
      elToast.classList.add('toast--show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => elToast.classList.remove('toast--show'), 1400);
    }

    // Reliable taps for iOS Telegram: prefer pointerup over click
    function bindTap(el, fn){
      if (!el) return;
      let pid = null, sx = 0, sy = 0, down = false;
      el.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        down = true;
        pid = e.pointerId ?? null;
        sx = e.clientX; sy = e.clientY;
        // Prevent iOS from treating tap as selection/gesture
        e.preventDefault();
      }, { passive:false });
      el.addEventListener('pointerup', (e) => {
        if (!down) return;
        if (pid != null && e.pointerId != null && pid !== e.pointerId) return;
        down = false; pid = null;
        const dx = Math.abs(e.clientX - sx);
        const dy = Math.abs(e.clientY - sy);
        if (dx + dy <= 14){
          e.preventDefault();
          fn(e);
        }
      }, { passive:false });
      el.addEventListener('pointercancel', () => { down = false; pid = null; }, { passive:true });
      // Keep click for desktop
      el.addEventListener('click', (e) => { e.preventDefault(); fn(e); });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fn(e); }
      });
    }

    // Simple popup queue
    const popupQueue = [];
    let popupOpen = false;

    function openPopupNext(){
      if (popupOpen) return;
      const item = popupQueue.shift();
      if (!item) return;
      popupOpen = true;
      elModalTitle.textContent = item.title;
      elModalBody.innerHTML = item.body;
      elModal.classList.remove('modal--hidden');
    }

    function closePopup(){
      popupOpen = false;
      elModal.classList.add('modal--hidden');
      openPopupNext();
    }
    elModalOk?.addEventListener('click', closePopup);
    elModal?.querySelector('.modal__backdrop')?.addEventListener('click', closePopup);

    function queuePopup(p){
      popupQueue.push(p);
      openPopupNext();
    }

    // Marks for animations
    const marks = { mergeIdx:-1, mergeAt:0, placeIdx:-1, placeAt:0, moveIdx:-1, moveAt:0 };
    function markMerge(i){ marks.mergeIdx=i; marks.mergeAt=Date.now(); }
    function markPlace(i){ marks.placeIdx=i; marks.placeAt=Date.now(); }
    function markMove(i){ marks.moveIdx=i; marks.moveAt=Date.now(); }

    // --- Pointer drag ghost
    const drag = { active:false, fromIdx:-1, hoverIdx:-1, hoverTrash:false, startX:0, startY:0, moved:false, ghost:null, pointerId:null };

    function clearDropHighlights(){
      document.querySelectorAll('.cell--drop').forEach(c => c.classList.remove('cell--drop'));
    }
    
    // --- Robust hit-testing for iOS Telegram (avoid elementFromPoint quirks) ---
    let cellRects = null;
    function refreshCellRects(){
      if (!elBoard) return;
      const cells = Array.from(elBoard.querySelectorAll('.cell'));
      cellRects = cells.map((c) => {
        const idx = Number(c.dataset.idx);
        const r = c.getBoundingClientRect();
        return { idx: Number.isFinite(idx) ? idx : -1, r };
      }).filter(x => x.idx >= 0);
    }
    function pointInRect(x, y, r){
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }
    function isTrashFromPoint(x, y){
      if (!elTrash) return false;
      const r = elTrash.getBoundingClientRect();
      return pointInRect(x, y, r);
    }
    function cellFromPoint(x, y){
      if (!cellRects || !cellRects.length) refreshCellRects();
      if (!cellRects) return -1;
      for (let i=0; i<cellRects.length; i++){
        const it = cellRects[i];
        if (pointInRect(x, y, it.r)) return it.idx;
      }
      return -1;
    }
function makeGhost(animalEl){
      const g = animalEl.cloneNode(true);
      g.classList.add('drag-ghost');
      g.classList.remove('animal--pop','animal--merge');
      document.body.appendChild(g);
      return g;
    }
    function positionGhost(x, y){
      if (!drag.ghost) return;
      const w = drag.ghost.offsetWidth || 120;
      const h = drag.ghost.offsetHeight || 120;
      drag.ghost.style.transform = `translate(${x - w/2}px, ${y - h/2}px) scale(1.02)`;
    }

    function onPointerDown(e){
      const animalEl = e.target.closest('.animal');
      if (!animalEl) return;
      e.preventDefault();
      const fromIdx = Number(animalEl.dataset.idx);
      if (!Number.isFinite(fromIdx)) return;

      drag.active = true;
      drag.fromIdx = fromIdx;
      drag.hoverIdx = fromIdx;
      drag.startX = e.clientX;
      drag.lastX = e.clientX;
      drag.startY = e.clientY;
      drag.lastY = e.clientY;
      refreshCellRects();
      drag.moved = false;
      drag.pointerId = e.pointerId;
      // iOS Telegram: avoid pointer capture
drag.ghost = makeGhost(animalEl);
      drag.lastX = e.clientX; drag.lastY = e.clientY;
      positionGhost(e.clientX, e.clientY);

      showTrash(true);
      haptic('light');
    }

    function onPointerMove(e){
      if (!drag.active || drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && (Math.abs(dx) + Math.abs(dy) > 6)) drag.moved = true;

      drag.lastX = e.clientX; drag.lastY = e.clientY;
      positionGhost(e.clientX, e.clientY);

      const overTrash = isTrashFromPoint(e.clientX, e.clientY);
      if (overTrash !== drag.hoverTrash){
        drag.hoverTrash = overTrash;
        hotTrash(overTrash);
        if (overTrash) clearDropHighlights();
      // Re-evaluate drop target from last pointer position (iOS safety)
      const lx = drag.lastX ?? drag.startX;
      const ly = drag.lastY ?? drag.startY;
      const overTrashNow = isTrashFromPoint(lx, ly);
      if (overTrashNow) { drag.hoverTrash = true; drag.hoverIdx = -1; }
      else if (drag.hoverIdx < 0) { drag.hoverIdx = cellFromPoint(lx, ly); }

      }
      if (overTrash){
        drag.hoverIdx = -1;
        return;
      }

      const idx = cellFromPoint(e.clientX, e.clientY);
      if (idx !== drag.hoverIdx){
        drag.hoverIdx = idx;
        clearDropHighlights();
        if (idx >= 0){
          const cell = elBoard.querySelector(`.cell[data-idx="${idx}"]`);
          cell?.classList.add('cell--drop');
        }
      }
    }

    function endDrag(apply){
      if (!drag.active) return;
      clearDropHighlights();
      if (drag.ghost){ drag.ghost.remove(); drag.ghost=null; }
      const from = drag.fromIdx;
      const to = drag.hoverIdx;
      const overTrash = drag.hoverTrash;
      const moved = drag.moved;

      // reset drag state
      drag.active=false; drag.fromIdx=-1; drag.hoverIdx=-1; drag.hoverTrash=false; drag.pointerId=null; drag.moved=false;

      showTrash(false);

      if (apply && moved){
        if (overTrash){
          handlers.onSell?.(from, { toast, haptic, queuePopup });
          return;
        }
        if (to >= 0){
          handlers.onDrop(from, to, { toast, haptic, markMerge, markPlace, markMove, queuePopup });
        }
      }
    }
    function onPointerUp(e){
      if (!drag.active) return;
      if (drag.pointerId != null && e.pointerId != null && drag.pointerId !== e.pointerId) return;
      endDrag(true);
    }
    function onPointerCancel(e){
      if (!drag.active) return;
      if (drag.pointerId != null && e.pointerId != null && drag.pointerId !== e.pointerId) return;
      endDrag(false);
    }

    elBoard.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive:false });
    window.addEventListener('pointerup', onPointerUp, { passive:true });
    window.addEventListener('pointercancel', onPointerCancel, { passive:true });
    // iOS Telegram: pointerup/cancel sometimes doesn't reach window -> listen on document (capture)
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    // Touch fallbacks
    document.addEventListener('touchend', () => { if (drag.active) endDrag(true); }, { passive:true });
    document.addEventListener('touchcancel', () => { if (drag.active) endDrag(false); }, { passive:true });
    // Never keep drag active when app loses focus
    window.addEventListener('blur', () => { if (drag.active) endDrag(false); }, { passive:true });
    document.addEventListener('visibilitychange', () => { if (document.hidden && drag.active) endDrag(false); }, { passive:true });


    // Controls
    bindTap(elPlaceBtn, () => handlers.onPlace({ toast, haptic, markPlace, queuePopup }));
    bindTap(elBonusBtn, () => handlers.onBonus({ toast, haptic, queuePopup }));
    function render(){
      // Next patient
      const next = state.queue[0] || null;
      const qi = queueInfo(next);
      if (elNextIcon){
        if (qi.img){
          elNextIcon.innerHTML = `<img class="petIcon" src="${qi.img}" alt="">`;
        } else {
          elNextIcon.textContent = qi.emoji;
        }
      }
      if (elNextName) elNextName.textContent = qi.name;

      // Spawn timer
      const leftSec = (state.spawnAt - Date.now()) / 1000;
      if (elSpawnIn) elSpawnIn.textContent = fmtSec(leftSec);

      // Level + bar
      const need = xpNeed(state.level);
      const pct = need > 0 ? Math.max(0, Math.min(1, state.xp / need)) : 0;
      if (elLevel) elLevel.textContent = String(state.level);
      if (elLevelBar) elLevelBar.style.width = `${Math.round(pct * 100)}%`;
      if (elXpText) elXpText.textContent = `${Math.floor(state.xp)}/${need}`;
      // Money
      if (elBonusPoints) elBonusPoints.textContent = fmtInt(state.bonusPoints);

      // Gifts UI
      if (elGiftPaidCost){
        const cost = giftPaidCost(state);
        elGiftPaidCost.textContent = fmtInt(cost);
        if (elGiftPaidBtn) elGiftPaidBtn.disabled = cost > state.bonusPoints;
      }
      if (elGiftFreeTimer){
        const now2 = Date.now();
        const left = (state.giftNextFreeAt - now2) / 1000;
        if (left <= 0){
          elGiftFreeTimer.textContent = 'Готово';
          if (elGiftFreeBtn) elGiftFreeBtn.disabled = false;
          if (elGiftFreeBtn) elGiftFreeBtn.textContent = 'Бесплатно';
        } else {
          elGiftFreeTimer.textContent = `через ${fmtSec(left)}`;
          if (elGiftFreeBtn) elGiftFreeBtn.disabled = true;
          if (elGiftFreeBtn) elGiftFreeBtn.textContent = 'Бесплатно (ожидание)';
        }
      }

      // Bonus UI
      const now = Date.now();
      const activeLeft = (state.bonus.activeUntil - now) / 1000;
      const cdLeft = (state.bonus.cooldownUntil - now) / 1000;

      if (activeLeft > 0){
        elBonusLabel.textContent = fmtSec(activeLeft);
        elBonusBtn.disabled = true;
        elBonusBtn.classList.add('chip--bonus-active');
      } else if (cdLeft > 0){
        elBonusLabel.textContent = `КД ${fmtSec(cdLeft)}`;
        elBonusBtn.disabled = true;
        elBonusBtn.classList.remove('chip--bonus-active');
      } else {
        elBonusLabel.textContent = 'Готов';
        elBonusBtn.disabled = false;
        elBonusBtn.classList.remove('chip--bonus-active');
      }

      // Board
      const isFresh = (idx, kind) => {
        const now = Date.now();
        if (kind === 'merge') return marks.mergeIdx===idx && (now - marks.mergeAt) < 650;
        if (kind === 'place') return marks.placeIdx===idx && (now - marks.placeAt) < 450;
        if (kind === 'move')  return marks.moveIdx===idx  && (now - marks.moveAt)  < 300;
        return false;
      };

      elBoard.innerHTML = '';
      for (let i=0;i<size;i++){
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.idx = String(i);

        if (!isCellUnlocked(state, i)) cell.classList.add('cell--locked');
        if (isFresh(i,'merge')) cell.classList.add('cell--merge');
        if (isFresh(i,'place')) cell.classList.add('cell--place');

        const a = state.board[i];
        if (a){
          const tier = getTier(a.lineId, a.tier);
          const animal = document.createElement('div');
          animal.className = 'animal';
          animal.dataset.idx = String(i);
          animal.draggable = false;

          if (isFresh(i,'move') || isFresh(i,'place')) animal.classList.add('animal--pop');
          if (isFresh(i,'merge')) animal.classList.add('animal--merge');

          const gradA = tier?.colorA ?? '#60a5fa';
          const gradB = tier?.colorB ?? '#2563eb';
          animal.style.background =
            `radial-gradient(240px 180px at 30% 25%, rgba(255,255,255,.32), transparent 55%), linear-gradient(135deg, ${gradA}, ${gradB})`;

          let iconEl;
          if (tier?.img){
            const img = document.createElement('img');
            img.className = 'animal__img';
            img.src = tier.img;
            img.alt = tier?.name ?? '';
            img.draggable = false;
            iconEl = img;
          } else {
            const emoji = document.createElement('div');
            emoji.className = 'animal__emoji';
            emoji.textContent = tier?.emoji ?? '🐾';
            iconEl = emoji;
          }

          const name = document.createElement('div');
          name.className = 'animal__name';
          name.textContent = tier?.name ?? 'Пациент';

          const rate = document.createElement('div');
          rate.className = 'animal__rate';
          rate.textContent = `+${tier?.rate ?? 1}/с`;

          animal.appendChild(iconEl);
          animal.appendChild(name);
          animal.appendChild(rate);

          animal.addEventListener('click', () => {
            if (!tier) return;
            toast(`${tier.emoji} ${tier.name} · +${tier.rate}/с`);
          });

          cell.appendChild(animal);
        }

        elBoard.appendChild(cell);
      }

      // Store: dynamic prices scale with level
      document.querySelectorAll('[data-buy][data-base-price]').forEach(btn => {
        const base = Number(btn.getAttribute('data-base-price'));
        if (!Number.isFinite(base)) return;
        const price = storePrice(base, state.level);
        btn.setAttribute('data-price', String(price));

        // Update button label if it contains a placeholder
        const buyLabel = btn.querySelector('.buyPrice');
        if (buyLabel) buyLabel.textContent = `🪙 ${price}`;
        else {
          // fallback: rewrite text content (simple)
          const t = btn.textContent;
          if (/🪙\s*\d+/.test(t)) btn.textContent = t.replace(/🪙\s*\d+/, `🪙 ${price}`);
        }

        btn.disabled = state.bonusPoints < price;
      });
    }

    return { render, toast, haptic, markMerge, markPlace, markMove, queuePopup, playGiftRoll };
  }

  window.JV_UI = { initUI };
})();
