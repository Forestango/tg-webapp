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
        { name: 'Сибирская кошка', emoji: '🐱', rate: 1, colorA:'#60a5fa', colorB:'#2563eb' },
        { name: 'Британец', emoji: '🐱', rate: 2, colorA:'#93c5fd', colorB:'#4f46e5' },
        { name: 'Мейн-кун', emoji: '🐱', rate: 4, colorA:'#fb7185', colorB:'#f43f5e' },
        { name: 'Сфинкс', emoji: '🐱', rate: 8, colorA:'#fda4af', colorB:'#fb7185' },
        { name: 'Снежный барс', emoji: '🐆', rate: 16, colorA:'#cbd5e1', colorB:'#64748b' }
      ]
    },
    {
      id: 'dog_husky',
      tiers: [
        { name: 'Хаски', emoji: '🐶', rate: 1, colorA:'#fbbf24', colorB:'#f97316' },
        { name: 'Корги', emoji: '🐶', rate: 2, colorA:'#34d399', colorB:'#10b981' },
        { name: 'Такса', emoji: '🐶', rate: 4, colorA:'#a78bfa', colorB:'#6d28d9' },
        { name: 'Самоед', emoji: '🐶', rate: 8, colorA:'#93c5fd', colorB:'#6366f1' },
        { name: 'Лабрадор', emoji: '🐕', rate: 16, colorA:'#fbbf24', colorB:'#ef4444' }
      ]
    },
    {
      id: 'rodent_hamster',
      tiers: [
        { name: 'Хомяк', emoji: '🐹', rate: 2, colorA:'#86efac', colorB:'#22c55e' },
        { name: 'Морская свинка', emoji: '🐹', rate: 4, colorA:'#7ee2ff', colorB:'#2ec3ff' },
        { name: 'Шиншилла', emoji: '🐭', rate: 8, colorA:'#cbd5e1', colorB:'#64748b' },
        { name: 'Кролик', emoji: '🐰', rate: 16, colorA:'#fb7185', colorB:'#f43f5e' },
        { name: 'Капибара', emoji: '🦫', rate: 32, colorA:'#f59e0b', colorB:'#ef4444' }
      ]
    },
    {
      id: 'wild_fox',
      tiers: [
        { name: 'Лиса', emoji: '🦊', rate: 4, colorA:'#ffb020', colorB:'#ff7a18' },
        { name: 'Фенек', emoji: '🦊', rate: 8, colorA:'#fbbf24', colorB:'#f97316' },
        { name: 'Енот', emoji: '🦝', rate: 12, colorA:'#34d399', colorB:'#10b981' },
        { name: 'Панда', emoji: '🐼', rate: 18, colorA:'#cbd5e1', colorB:'#64748b' },
        { name: 'Коала', emoji: '🐨', rate: 28, colorA:'#a3e635', colorB:'#16a34a' }
      ]
    },
    {
      id: 'weird_axolotl',
      tiers: [
        { name: 'Аксолотль', emoji: '🫧', rate: 6, colorA:'#fda4af', colorB:'#fb7185' },
        { name: 'Осьминожка', emoji: '🐙', rate: 12, colorA:'#a78bfa', colorB:'#6d28d9' },
        { name: 'Иглобрюх', emoji: '🐡', rate: 24, colorA:'#7ee2ff', colorB:'#2ec3ff' },
        { name: 'Лемур', emoji: '🐒', rate: 48, colorA:'#fbbf24', colorB:'#f97316' },
        { name: 'Фламинго', emoji: '🦩', rate: 96, colorA:'#fb7185', colorB:'#db2777' }
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

  
  const STORE_BASE_PRICES = {
    random: 80,
    pack3: 220,
    bonus: 450
  };



// Educational facts shown ONLY on merge (modal card).
// Keys should match lineId. If missing, FACTS.default is used.
const FACTS = {
  // Future medical lineIds (when you rename content)
  first_aid: [
    { title: 'Первая помощь', text: 'При переломах фиксируют два сустава, чтобы кость не двигалась и боль была меньше.' },
    { title: 'Первая помощь', text: 'Кровотечение останавливают давящей повязкой: так сосуды сжимаются и кровь идёт медленнее.' },
    { title: 'Первая помощь', text: 'Пульс считают не только “есть/нет”, а чтобы понимать, как тело реагирует на стресс и нагрузку.' },
  ],
  dentistry: [
    { title: 'Стоматология', text: 'Кариес — это не “дырка сама по себе”, а работа бактерий, которым нравится сладкое.' },
    { title: 'Стоматология', text: 'Чистка зубов вечером важнее, чем кажется: ночью слюны меньше, бактерии активнее.' },
    { title: 'Стоматология', text: 'Налёт — это “дом” для бактерий. Щётка убирает дом, а паста помогает закрепить результат.' },
  ],
  ent: [
    { title: 'ЛОР и инфекции', text: 'Температура — это способ организма мешать микробам размножаться слишком быстро.' },
    { title: 'ЛОР и инфекции', text: 'Дышать носом полезно: воздух согревается и очищается, прежде чем попасть в лёгкие.' },
    { title: 'ЛОР и инфекции', text: 'Мы моем руки, потому что микробы любят “переезды” с поверхности на лицо и еду.' },
  ],
  // Fallback for current build (пока lineId ещё “про зверей”)
  default: [
    { title: 'Мини‑факт', text: 'Врач — это не “лечит таблетками”, а думает: что случилось, почему и как помочь безопасно.' },
    { title: 'Мини‑факт', text: 'Самый частый инструмент врача — вопросы. Сначала выясняем, что происходит, потом действуем.' },
    { title: 'Мини‑факт', text: 'Рейтинг клиники растёт от опыта: чем больше похожих случаев ты решаешь, тем легче сложные.' },
  ],
};

window.JV_DATA = { CFG, LINES, PROGRESSION, STORE_BASE_PRICES, FACTS, getLine, getTier, canUpgrade, unlockLabel };
})();
