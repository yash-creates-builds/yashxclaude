// What can be given to the dhobi, and what each service costs by default.
// Rates are typical Indian city prices (₹) — every one is editable in the Rates screen.

export const SERVICES = ['iron', 'wash', 'dry']; // Iron · Wash + Iron · Dry clean

//            id            iron  wash  dry
const BASE = [
  ['shirt',       10,  25,  80],
  ['tshirt',       8,  20,  70],
  ['pant',        10,  25,  90],
  ['jeans',       12,  35, 100],
  ['kurta',       12,  30, 100],
  ['saree',       40,  80, 250],
  ['salwar',      25,  60, 200],
  ['dupatta',     10,  25,  80],
  ['bedsheet',    20,  50, 150],
  ['pillow',       5,  15,  40],
  ['towel',        8,  20,  60],
  ['blouse',       8,  20,  70],
  ['kids',         6,  15,  60],
  ['blazer',      40, 120, 300],
  ['sherwani',   100, 250, 700],
  ['curtain',     30,  80, 250],
  ['pieces',      10,  25,  80], // "Just count": any clothes, no category
];

export const BUILT_IN_ITEMS = BASE.map(([id]) => id);

export const DEFAULT_RATES = Object.fromEntries(
  BASE.map(([id, iron, wash, dry]) => [id, { iron, wash, dry }]),
);

/** Rates a new custom ("Other") item starts with. */
export const CUSTOM_RATE = { iron: 10, wash: 25, dry: 100 };
