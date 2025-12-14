// Data: animals, progression, balance
(() => {
  'use strict';

  const CFG = {
    rows: 4,
    cols: 4,
    // Spawn base interval. Can be temporarily reduced by rewards.
    spawnEverySec: 10,
    spawnQueueMax: 3,

    bonusDurationSec: 90,
    bonusCooldownSec: 5 * 60,

    // Money economy
    moneyLevelBonusPerLevel: 0, // +3% money/sec per level

    // Sell / value
    valuePerRate: 60, // each +1/с roughly worth 60 coins
    sellDivisor: 3,  // sell returns 1/3 of value

    // Store price scaling
    storePricePerLevel: 0.15, // price scaling per level

    // Gifts
    giftPaidBaseCost: 600,       // fallback if income=0
    giftPaidCostSeconds: 60,     // paid spin costs ~N seconds of current income
    giftFreeEverySec: 86400,     // once per day
    giftPityRare: 7,             // guarantee rare after N without rare
    giftPityLegend: 20,          // guarantee legend after N without legend
    giftChanceRare: 0.22,
    giftChanceLegend: 0.03,

    // XP/leveling
    xpPerMergeBase: 10,
    xpNeedBase: 80,
    xpNeedPow: 1.35,

    // Locked bottom row (row index 3)
    bottomRowIndex: 3,
    bottomRowUnlockLevels: [3, 6, 10, 15], // unlock 1 cell each

    saveEveryMs: 5000,
    storageKey: 'junyVet_vNext_level_rewards'
  };

  // Hidden internal “lines”. UI never shows categories.
  // Each line has tiers (merge upgrades).
  const LINES = [
    {
      id: 'cat_siberian',
      tiers: [
        { name: 'Сибирская кошка', emoji: '🐱', img: 'assets/pets/cat_siberian_0.png', rate: 1, colorA:'#60a5fa', colorB:'#2563eb' },
        { name: 'Британец', emoji: '🐱', img: 'assets/pets/cat_siberian_1.png', rate: 2, colorA:'#93c5fd', colorB:'#4f46e5' },
        { name: 'Мейн-кун', emoji: '🐱', img: 'assets/pets/cat_siberian_2.png', rate: 4, colorA:'#fb7185', colorB:'#f43f5e' },
        { name: 'Сфинкс', emoji: '🐱', img: 'assets/pets/cat_siberian_3.png', rate: 8, colorA:'#fda4af', colorB:'#fb7185' },
        { name: 'Снежный барс', emoji: '🐆', img: 'assets/pets/cat_siberian_4.png', rate: 16, colorA:'#cbd5e1', colorB:'#64748b' }
      ]
    },
    {
      id: 'dog_husky',
      tiers: [
        { name: 'Хаски', emoji: '🐶', img: 'assets/pets/dog_husky_0.png', rate: 1, colorA:'#fbbf24', colorB:'#f97316' },
        { name: 'Корги', emoji: '🐶', img: 'assets/pets/dog_husky_1.png', rate: 2, colorA:'#34d399', colorB:'#10b981' },
        { name: 'Такса', emoji: '🐶', img: 'assets/pets/dog_husky_2.png', rate: 4, colorA:'#a78bfa', colorB:'#6d28d9' },
        { name: 'Самоед', emoji: '🐶', img: 'assets/pets/dog_husky_3.png', rate: 8, colorA:'#93c5fd', colorB:'#6366f1' },
        { name: 'Лабрадор', emoji: '🐕', img: 'assets/pets/dog_husky_4.png', rate: 16, colorA:'#fbbf24', colorB:'#ef4444' }
      ]
    },
    {
      id: 'rodent_hamster',
      tiers: [
        { name: 'Хомяк', emoji: '🐹', img: 'assets/pets/rodent_hamster_0.png', rate: 2, colorA:'#86efac', colorB:'#22c55e' },
        { name: 'Морская свинка', emoji: '🐹', img: 'assets/pets/rodent_hamster_1.png', rate: 4, colorA:'#7ee2ff', colorB:'#2ec3ff' },
        { name: 'Шиншилла', emoji: '🐭', img: 'assets/pets/rodent_hamster_2.png', rate: 8, colorA:'#cbd5e1', colorB:'#64748b' },
        { name: 'Кролик', emoji: '🐰', img: 'assets/pets/rodent_hamster_3.png', rate: 16, colorA:'#fb7185', colorB:'#f43f5e' },
        { name: 'Капибара', emoji: '🦫', img: 'assets/pets/rodent_hamster_4.png', rate: 32, colorA:'#f59e0b', colorB:'#ef4444' }
      ]
    },
    {
      id: 'wild_fox',
      tiers: [
        { name: 'Лиса', emoji: '🦊', img: 'assets/pets/wild_fox_0.png', rate: 4, colorA:'#ffb020', colorB:'#ff7a18' },
        { name: 'Фенек', emoji: '🦊', img: 'assets/pets/wild_fox_1.png', rate: 8, colorA:'#fbbf24', colorB:'#f97316' },
        { name: 'Енот', emoji: '🦝', img: 'assets/pets/wild_fox_2.png', rate: 12, colorA:'#34d399', colorB:'#10b981' },
        { name: 'Панда', emoji: '🐼', img: 'assets/pets/wild_fox_3.png', rate: 18, colorA:'#cbd5e1', colorB:'#64748b' },
        { name: 'Коала', emoji: '🐨', img: 'assets/pets/wild_fox_4.png', rate: 28, colorA:'#a3e635', colorB:'#16a34a' }
      ]
    },
    {
      id: 'weird_axolotl',
      tiers: [
        { name: 'Аксолотль', emoji: '🫧', img: 'assets/pets/weird_axolotl_0.png', rate: 6, colorA:'#fda4af', colorB:'#fb7185' },
        { name: 'Осьминожка', emoji: '🐙', img: 'assets/pets/weird_axolotl_1.png', rate: 12, colorA:'#a78bfa', colorB:'#6d28d9' },
        { name: 'Иглобрюх', emoji: '🐡', img: 'assets/pets/weird_axolotl_2.png', rate: 24, colorA:'#7ee2ff', colorB:'#2ec3ff' },
        { name: 'Лемур', emoji: '🐒', img: 'assets/pets/weird_axolotl_3.png', rate: 48, colorA:'#fbbf24', colorB:'#f97316' },
        { name: 'Фламинго', emoji: '🦩', img: 'assets/pets/weird_axolotl_4.png', rate: 96, colorA:'#fb7185', colorB:'#db2777' }
      ]
    }
  ];

  function getLine(id){ return LINES.find(l => l.id === id) || null; }
  function getTier(lineId, tier){
    const line = getLine(lineId);
    return line?.tiers[tier] ?? null;
  }
  function canUpgrade(lineId, tier){
    const line = getLine(lineId);
    return !!line && tier < line.tiers.length - 1;
  }

  // Progression: each level unlocks 1 line (base tier) + gifts.
  // Rewards:
  // - {type:'coins', amount:number}
  // - {type:'pack', count:number} -> add patients to queue
  // - {type:'bonus2x', seconds:number} -> extend/activate
  // - {type:'spawnBoost', seconds:number, intervalSec:number} -> faster spawns temporarily
  const PROGRESSION = [
    { level: 1, unlock: ['cat_siberian'], rewards: [{type:'coins', amount: 10}] },
    { level: 2, unlock: ['dog_husky'], rewards: [{type:'coins', amount: 12}, {type:'pack', count: 1}] },
    { level: 3, unlock: ['rodent_hamster'], rewards: [{type:'coins', amount: 14}, {type:'spawnBoost', seconds: 60, intervalSec: 6}] },
    { level: 4, unlock: ['wild_fox'], rewards: [{type:'coins', amount: 16}] },
    { level: 5, unlock: ['weird_axolotl'], rewards: [{type:'coins', amount: 18}, {type:'bonus2x', seconds: 30}] },

    // After level 5, keep unlocking “variants” by reusing same lines but only as “unlock events”
    // In MVP we treat this as “new patient card” unlocked (still spawns as base tier of that line).
    { level: 6, unlock: ['cat_siberian'], rewards: [{type:'coins', amount: 22}, {type:'pack', count: 2}] },
    { level: 7, unlock: ['dog_husky'], rewards: [{type:'coins', amount: 24}] },
    { level: 8, unlock: ['rodent_hamster'], rewards: [{type:'coins', amount: 26}, {type:'bonus2x', seconds: 45}] },
    { level: 9, unlock: ['wild_fox'], rewards: [{type:'coins', amount: 28}, {type:'spawnBoost', seconds: 60, intervalSec: 5}] },
    { level: 10, unlock: ['weird_axolotl'], rewards: [{type:'coins', amount: 30}, {type:'pack', count: 2}] },

    { level: 11, unlock: ['cat_siberian'], rewards: [{type:'coins', amount: 34}] },
    { level: 12, unlock: ['dog_husky'], rewards: [{type:'coins', amount: 36}, {type:'bonus2x', seconds: 60}] },
    { level: 13, unlock: ['rodent_hamster'], rewards: [{type:'coins', amount: 38}] },
    { level: 14, unlock: ['wild_fox'], rewards: [{type:'coins', amount: 40}, {type:'pack', count: 3}] },
    { level: 15, unlock: ['weird_axolotl'], rewards: [{type:'coins', amount: 42}, {type:'spawnBoost', seconds: 90, intervalSec: 5}] }
  ];

  // Human-friendly label for “unlock” (uses tier0 name)
  function unlockLabel(lineId){
    const t0 = getTier(lineId, 0);
    return t0 ? `${t0.emoji} ${t0.name}` : lineId;
  }

  

  // Educational merge facts (shown only after merges)
  const MERGE_FACTS = [
    { title: 'Факт', body: 'При любой первой помощи сначала оценивают <b>безопасность</b>: себе, пострадавшему и окружающим.' },
    { title: 'Факт', body: 'Если человек упал и ударился, важно проверить, что он <b>в сознании</b> и нормально <b>дышит</b>.' },
    { title: 'Факт', body: 'Давящая повязка помогает остановить небольшое кровотечение — это аккуратно и без «страшных» деталей.' },
    { title: 'Факт', body: 'Иммобилизация (фиксирование) нужна, чтобы место травмы меньше двигалось и не усиливало боль.' },
    { title: 'Факт', body: 'Температуру тела измеряют не «ради цифры», а чтобы понять, как организм реагирует на инфекцию.' },
    { title: 'Факт', body: 'Кариес связан с бактериями: сахар — их любимая еда, а кислота повреждает эмаль.' },
    { title: 'Факт', body: 'Частота дыхания — важный показатель: иногда по дыханию проблему видно раньше, чем по пульсу.' },
    { title: 'Факт', body: 'Врач всегда собирает «анамнез»: что случилось, когда началось, что помогало — это половина диагностики.' },
    { title: 'Факт', body: 'Чистые руки — самый простой способ снизить риск инфекций. Поэтому врачи так много моют руки.' },
    { title: 'Факт', body: 'Пульс считают не только на запястье: ещё есть сонная артерия на шее и лучевая на руке.' },
    { title: 'Факт', body: 'Лёд через ткань иногда используют при ушибах, но не держат долго: короткими подходами.' },
    { title: 'Факт', body: 'Скорая помощь нужна, если человеку трудно дышать, он теряет сознание или боль очень сильная.' }
  ];

  const STORE_BASE_PRICES = {
    random: 80,
    pack3: 220,
    bonus: 450
  };

window.JV_DATA = { CFG, LINES, PROGRESSION, MERGE_FACTS, STORE_BASE_PRICES, getLine, getTier, canUpgrade, unlockLabel };
})();
