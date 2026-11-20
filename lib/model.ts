// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// strongest pre-token protocols below that floor: the early rows the radar exists to find. A protocol
// is pre-token when its record carries no token (no market cap, no CoinGecko id, no symbol); protocols
// whose token already trades are set aside and shown at the market's own values, never ranked by a
// model and never mixed into the board.
//
// THE VALUE MODEL — implied value is what a token would be worth if it were priced the way the market
// already prices this protocol's tokenized peers, adjusted for the protocol's own momentum and record:
//
//   implied = round( tvl_usd x category_multiple x momentum x maturity )
//
// 1. category_multiple is CALIBRATED FROM THE SNAPSHOT, never asserted. For every protocol whose
//    token trades (mcap_usd > 0), the market's price of one TVL dollar is mcap_usd / tvl_usd. A
//    category's raw multiple is the MEDIAN of that ratio across its tokenized protocols (a median,
//    so one runaway token cannot drag it). Sparse categories are shrunk toward the global median
//    with a prior worth SHRINK_K observations, and the result is clamped to a sane band, so a
//    category with a single wild peer lands near the market-wide figure instead of on top of it:
//      multiple(c) = clamp( (n_c x clamp(median_c, MEDIAN_FLOOR, MEDIAN_CAP) + K x global)
//                           / (n_c + K),  MULTIPLE_FLOOR, MULTIPLE_CAP )
//    A category with no tokenized peer at all uses the global median.
// 2. momentum reads the snapshot's seven-day TVL change: a protocol the market is moving into is
//    worth more at launch than one it is leaving.
//      momentum = clamp(1 + clamp(change_7d, GROWTH_FLOOR, GROWTH_CAP) / 100 x GROWTH_WEIGHT,
//                       MOMENTUM_FLOOR, MOMENTUM_CAP)        (unreported change: 1.0, neutral)
// 3. maturity reads listed_at: how long the protocol has run with no token. A launch after years of
//    operation is a different claim from one after a fortnight, so the factor ramps linearly from
//    MATURITY_FLOOR to MATURITY_FLOOR + MATURITY_RANGE over MATURITY_DAYS and then holds.
//    (An unrecorded listing date is scored as UNKNOWN_AGE_DAYS.)
//
// No protocol name is ever special-cased: the same three factors score every row, and the dashboard
// recomputes each row from the same figures, so the page and board.json cannot drift apart.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  shrink_k: number;
  median_floor: number;
  median_cap: number;
  multiple_floor: number;
  multiple_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  momentum_floor: number;
  momentum_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 4,
  median_floor: 0.01,
  median_cap: 3,
  multiple_floor: 0.02,
  multiple_cap: 2.5,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  momentum_floor: 0.65,
  momentum_cap: 1.6,
  maturity_floor: 0.7,
  maturity_range: 0.6,
  maturity_days: 1460,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 120;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 30;

/** One category's calibration: how many tokenized peers priced it, their median, and the multiple used. */
export interface CategoryCalibration {
  category: string | null;
  peers: number;
  median_ratio: number | null;
  multiple: number;
}

/** The market's own pricing, read off the snapshot: a global multiple and one row per category. */
export interface Calibration {
  global_multiple: number;
  tokenized_peers: number;
  categories: CategoryCalibration[];
  /** Every tokenized protocol's ratio, for the dashboard to re-derive the table from: c is the category, r the ratio. */
  market: { c: string | null; r: number }[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    category_peers: number;
    growth_pct: number;
    momentum_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; the page regenerates its farm plan from the same inputs. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  category_multiple: number;
  category_peers: number;
  momentum_multiplier: number;
  maturity_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the market ratios and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  tokenized_peers: number;
  market: { c: string | null; r: number }[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The median of a non-empty list (the list is sorted in place). */
function median(values: number[]): number {
  const v = values.sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The calibration: what the market pays for a TVL dollar, read off the snapshot's tokenized
 * protocols. Only protocols with a real market cap and real TVL price anything; a token that
 * records no cap (or a cap of zero) is not a price and calibrates nothing.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const market: { c: string | null; r: number }[] = [];
  const byCategory = new Map<string | null, number[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const r = round4(p.mcap_usd / p.tvl_usd);
    market.push({ c: p.category, r });
    const list = byCategory.get(p.category) ?? [];
    list.push(r);
    byCategory.set(p.category, list);
  }
  const global = market.length > 0 ? median(market.map((m) => m.r)) : 0;
  const categories: CategoryCalibration[] = [...byCategory.entries()].map(([category, ratios]) => {
    const med = median([...ratios]);
    const shrunk = (ratios.length * clamp(med, model.median_floor, model.median_cap) + model.shrink_k * global) / (ratios.length + model.shrink_k);
    return { category, peers: ratios.length, median_ratio: round4(med), multiple: round4(clamp(shrunk, model.multiple_floor, model.multiple_cap)) };
  });
  categories.sort((a, b) => b.peers - a.peers || String(a.category).localeCompare(String(b.category)));
  return { global_multiple: round4(global), tokenized_peers: market.length, categories, market };
}

/** The category multiple one protocol is priced with, and how many tokenized peers priced it. */
function multipleFor(calibration: Calibration, category: string | null): { multiple: number; peers: number } {
  const row = calibration.categories.find((c) => c.category === category);
  return row !== undefined ? { multiple: row.multiple, peers: row.peers } : { multiple: calibration.global_multiple, peers: 0 };
}

/** The three factors and the implied value one protocol gets under `model` and `calibration`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  model: ModelConstants,
): { implied: number; multiple: number; peers: number; growthPct: number; momentumMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple, peers } = multipleFor(calibration, protocol.category);
  const growthPct = protocol.change_7d === null ? 0 : clamp(finite(protocol.change_7d, 0), model.growth_floor, model.growth_cap);
  const momentumMult = protocol.change_7d === null ? 1 : clamp(1 + (growthPct / 100) * model.growth_weight, model.momentum_floor, model.momentum_cap);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * momentumMult * maturityMult));
  return { implied, multiple, peers, growthPct, momentumMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, calibration, model) }));
  // The ranking is the model's claim: implied value first, then TVL, then slug, so two runs of the
  // same snapshot write the same board byte for byte.
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watch.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.multiple,
      category_peers: s.peers,
      growth_pct: s.growthPct,
      momentum_multiplier: round4(s.momentumMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain: mainnet is dear, rollups and Solana are not. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $8 in gas';
  if (chain === 'Solana') return 'a few cents in fees';
  if (['Arbitrum', 'Base', 'Optimism', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Mode', 'Blast', 'Unichain', 'Polygon', 'Polygon zkEVM', 'Gnosis', 'Avalanche', 'BSC'].includes(chain)) return 'under $1 in gas';
  return 'about $2 in gas';
}

/** How much capital one serious farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 1000;
  if (p.tvl_usd >= 250_000_000) return 500;
  if (p.tvl_usd >= 50_000_000) return 250;
  return 100;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** How many weekly qualifying actions to plan for, from the protocol's age. */
function weeksFor(age: number | null): number {
  if (age === null) return 10;
  return age < 365 ? 12 : 8;
}

/**
 * The category's two core actions, in the words a farmer can follow: what the protocol is for,
 * done properly. Each is written for the protocol's own first chain and capital tier.
 */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): [string, string] {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  const half = Math.max(50, Math.round(capital / 2));
  if (c.includes('bridge')) return [
    `Bridge $${capital} of USDC from Ethereum to ${chain} through ${n}, then put the bridged funds to work in a ${chain} app so the trip counts as real usage.`,
    `Bridge $${half} back a week later over a different route ${n} offers, and keep a small working balance on ${chain} instead of emptying the wallet.`,
  ];
  if (c.includes('staking') || c.includes('restaking') || c.includes('restak')) return [
    `Stake $${capital} of ${chain}'s staking asset through ${n} and keep the liquid receipt token in the same wallet.`,
    `Put the receipt token to work: supply it as collateral or pair it in a pool on ${chain}, so one deposit earns both the staking record and a DeFi position.`,
  ];
  if (c.includes('curator') || c.includes('allocator') || c.includes('collateral market') || c.includes('collateral management')) return [
    `Deposit $${capital} of USDC into a ${n} curated vault on ${chain}: read the vault's risk page first and pick the vault whose curator publishes its methodology.`,
    `Split a second $${half} into a different ${n} vault with a different strategy, and compare the two vaults' reports monthly; curators reward depositors who stay through a full quarter.`,
  ];
  if (c.includes('cdp')) return [
    `Open a vault on ${n}: lock $${capital} of ETH or a liquid staking token as collateral on ${chain} and mint its stablecoin against it.`,
    `Keep the collateral ratio above 200 per cent, and repay and re-mint once a month so the vault shows a full borrow cycle, not one deposit.`,
  ];
  if (c.includes('lend') || c.includes('uncollateralized')) return [
    `Supply $${capital} of USDC to ${n}'s main market on ${chain}; if it lists an isolated market too, split $50 into that market so both books see the wallet.`,
    `Borrow about 40 per cent against the supply and re-supply the borrowed asset once, then hold: one careful loop, with the health factor kept above 1.8 at all times.`,
  ];
  if (c.includes('dex') || c.includes('liquidity manager')) return [
    `Swap about $${half} through ${n} on ${chain}, split across two or three trades on different days, so the wallet builds a real trading record, not one wash.`,
    `Provide $${capital} to ${n}'s flagship pool on ${chain} (the deepest stable or ETH pair it lists) and leave the LP position untouched between weekly visits.`,
  ];
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('option')) return [
    `Deposit $${capital} of USDC as margin on ${n} and open one small hedged position: long the spot asset, short the same size on the perp, so the account trades without betting.`,
    `Trade about $${capital * 4} of volume a month in small clips on ${chain}, closing and reopening the hedge weekly; volume tiers are what perp farms usually count.`,
  ];
  if (c.includes('rwa')) return [
    `Subscribe $${capital} to ${n}'s tokenized asset on ${chain}: complete its KYC first if it asks (a one-off check, usually same-day), then hold the asset in the farming wallet.`,
    `Hold through at least one full distribution or interest cycle, and use ${n}'s own secondary or redemption window once so the wallet shows a complete round trip.`,
  ];
  if (c.includes('basis')) return [
    `Deposit $${capital} of USDC into ${n}'s basis-trading vault on ${chain} and take the vault shares in the farming wallet.`,
    `Keep the shares through a full funding cycle (about a month) instead of redeeming early; basis strategies snapshot holders, and churn is what they discount.`,
  ];
  if (c.includes('stable')) return [
    `Mint or deposit $${capital} of ${n}'s stable asset on ${chain}, through its own mint page rather than a swap, so the mint itself is recorded to the wallet.`,
    `Put half the minted asset into ${n}'s stability or savings pool and hold the rest liquid, so the wallet shows both the mint and the hold.`,
  ];
  if (c.includes('yield') || c.includes('farm') || c.includes('leveraged')) return [
    `Deposit $${capital} of USDC or ETH into ${n}'s flagship vault on ${chain} and keep the vault shares; do not chase the highest-APY vault, the flagship is the one a launch rewards.`,
    `Harvest and re-compound the yield once a month rather than withdrawing it, so the position grows on the record the protocol can see.`,
  ];
  if (c.includes('chain')) return [
    `Bridge $${capital} to ${chain} and make it the wallet's home chain for this farm: hold the gas token, and use two of the chain's native apps so the wallet reads as a resident, not a tourist.`,
    `Transact on ${chain} every week (a swap, a mint, a small transfer between your own wallets) and keep at least $${half} of working balance on the chain.`,
  ];
  if (c.includes('insurance')) return [
    `Stake $${capital} into ${n}'s insurance pool on ${chain} (or buy cover of the same size on a protocol you actually use), and keep the position through one full cover period.`,
    `Renew or roll the position when the period ends instead of letting it lapse; underwriters count continuous cover, not a single purchase.`,
  ];
  if (c.includes('prediction')) return [
    `Fund the ${n} account with $${capital} on ${chain} and take positions in two or three liquid markets a week, sized at $10 to $25 each.`,
    `Hold at least one position to settlement every month, so the account shows resolved trades and not only entries.`,
  ];
  if (c.includes('payment') || c.includes('card')) return [
    `Open a ${n} account, complete its KYC, and route $${capital} of ordinary spending or one invoice a month through it on ${chain}.`,
    `Keep the account active every month (a payment in, a payment out) rather than funding it once; payment farms count months of activity.`,
  ];
  if (c.includes('launchpad')) return [
    `Register the wallet on ${n}, complete its KYC or staking qualification, and hold the qualifying balance (about $${capital}) from the day you register.`,
    `Take part in one sale on ${n} when it runs, even a $50 ticket, and hold the allocation rather than flipping it on day one.`,
  ];
  if (c.includes('index')) return [
    `Buy and hold $${capital} of ${n}'s flagship index on ${chain} in the farming wallet, through its own mint page where it has one.`,
    `Add about $${half} a month so the position shows steady accumulation across several rebalances.`,
  ];
  if (c.includes('privacy')) return [
    `Deposit $${capital} into ${n}'s shielded pool on ${chain} from the farming wallet and let the deposit age at least two weeks before moving it.`,
    `Make one shielded transfer or withdrawal a month, so the wallet shows ordinary private use rather than a single pass-through.`,
  ];
  return [
    `Deposit $${capital} of USDC into ${n}'s flagship product on ${chain} and keep the position open; if it lists several products, the one holding most of its TVL is the one to use.`,
    `Use ${n}'s core feature once a week beyond the deposit (a swap, a claim, a vote or a second smaller deposit), so the wallet reads as a user and not a parked balance.`,
  ];
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names: the category picks the two core actions, the chains price the gas and name the second-chain
 * step, the TVL sizes the capital, and the age sets the weekly routine and the hold.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = weeksFor(age);
  const [first, second] = actionsFor(p, capital, chain);
  const steps: FarmStep[] = [
    {
      text: `Set up a fresh wallet for ${p.name} alone, fund it from your main wallet, and keep its seed phrase offline; one wallet per farm keeps every protocol's record clean.`,
      cost: `${gas} for the first transaction`,
      time: '5 minutes',
    },
    { text: first, cost: `$${capital} of capital, ${gas}`, time: '15 minutes to set up' },
    { text: second, cost: `about $${Math.max(50, Math.round(capital / 2))} more at most, ${gas} a visit`, time: '10 minutes' },
  ];
  if (p.chains.length > 1) {
    steps.push({
      text: `Repeat a half-size position on ${p.chains[1]!}, ${p.name}'s second chain: multichain activity is the cheapest signal that a wallet is a real user of the whole protocol.`,
      cost: `about $${Math.max(50, Math.round(capital / 2))} of capital, ${gasFor(p.chains[1]!)}`,
      time: '15 minutes',
    });
  } else {
    steps.push({
      text: `Open ${p.name}'s own points, rewards or governance page and link the wallet there; if it runs a points program, enrol before you transact, because points rarely backdate.`,
      cost: 'nothing to enrol, and never pay anyone to claim points',
      time: '10 minutes',
    });
  }
  steps.push(
    {
      text: `Keep a weekly routine for ${weeks} weeks: one qualifying action a week (a deposit, a swap, a borrow or a vote), on roughly the same day, so the record reads as habit, not a burst.`,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days in total, so the activity spans more than one monthly snapshot; withdrawing inside the first month is the commonest way farms are wasted.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Once a month, check ${p.name}'s official announcements and keep a farm log (wallet, dates, amounts, transaction hashes); if a claim ever opens, claim only from the link the protocol itself publishes.`,
      cost: 'nothing to check or log, and never a fee to claim',
      time: '15 minutes a month',
    },
  );
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    category_peers: row.model.category_peers,
    momentum_multiplier: row.model.momentum_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const calibration = calibrate(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: calibration.global_multiple,
    tokenized_peers: calibration.tokenized_peers,
    market: calibration.market,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
