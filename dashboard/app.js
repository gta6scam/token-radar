// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, a filterable and sortable table, a per-protocol detail drawer, a live-token view
// and the model itself. No network: every byte it shows is in data.js.
//
// The page does not merely print the board's numbers: data.js also carries the market ratios of the
// snapshot's tokenized protocols, and this file re-derives the category multiples from them and
// recomputes every row's implied value with the same arithmetic lib/model.ts used for board.json.
// The detail drawer shows that recomputation next to the board's figure, so a reader can see the
// screenshots and the code agree.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var M = DATA.model;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', min: 0, watch: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var boardSlot = null;
  var modelSlot = null;
  var countEl = null;

  /* ---------- formatting ---------- */
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + Number(n).toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0'); }

  /* ---------- the model, re-derived in the page ----------
     The same three factors lib/model.ts scores with:
       implied = round( tvl x category_multiple x momentum x maturity )
     The category multiple is calibrated from the snapshot itself: for each tokenized protocol the
     market's price of a TVL dollar is mcap / tvl (carried in DATA.market); a category's multiple is
     its median ratio, shrunk toward the global median by a prior of shrink_k peers and clamped. */
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function round4(n) { return Math.round(n * 1e4) / 1e4; }
  function medianOf(values) {
    var v = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(v.length / 2);
    return v.length % 2 === 1 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }
  var CALIB = (function () {
    var byCat = {};
    DATA.market.forEach(function (m) {
      var key = m.c === null ? '' : m.c;
      if (!byCat[key]) byCat[key] = { category: m.c, ratios: [] };
      byCat[key].ratios.push(m.r);
    });
    var global = DATA.market.length ? medianOf(DATA.market.map(function (m) { return m.r; })) : 0;
    var table = Object.keys(byCat).map(function (key) {
      var g = byCat[key];
      var med = medianOf(g.ratios);
      var shrunk = (g.ratios.length * clamp(med, M.median_floor, M.median_cap) + M.shrink_k * global) / (g.ratios.length + M.shrink_k);
      return { category: g.category, peers: g.ratios.length, median: round4(med), multiple: round4(clamp(shrunk, M.multiple_floor, M.multiple_cap)) };
    });
    table.sort(function (a, b) { return b.peers - a.peers || String(a.category).localeCompare(String(b.category)); });
    return { global: round4(global), table: table };
  })();
  function multipleFor(category) {
    for (var i = 0; i < CALIB.table.length; i++) if (CALIB.table[i].category === category) return CALIB.table[i];
    return { category: category, peers: 0, median: null, multiple: CALIB.global };
  }
  function impliedOf(row) {
    var mult = multipleFor(row.category).multiple;
    var growthPct = row.change_7d === null || row.change_7d === undefined ? 0 : clamp(row.change_7d, M.growth_floor, M.growth_cap);
    var momentum = row.change_7d === null || row.change_7d === undefined ? 1 : clamp(1 + (growthPct / 100) * M.growth_weight, M.momentum_floor, M.momentum_cap);
    var age = row.age_days === null || row.age_days === undefined ? M.unknown_age_days : row.age_days;
    var maturity = M.maturity_floor + (Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
    return { value: Math.max(1, Math.round(row.tvl_usd * mult * momentum * maturity)), multiple: mult, momentum: momentum, maturity: maturity };
  }

  /* ---------- the farm plan, the same derivation board.json carries ----------
     Category picks the two core actions, the first chain prices the gas and names the second-chain
     step, TVL sizes the capital, age sets the weekly routine and the hold. No name is special-cased. */
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    if (chain === 'Ethereum') return 'about $8 in gas';
    if (chain === 'Solana') return 'a few cents in fees';
    if (['Arbitrum', 'Base', 'Optimism', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Mode', 'Blast', 'Unichain', 'Polygon', 'Polygon zkEVM', 'Gnosis', 'Avalanche', 'BSC'].indexOf(chain) >= 0) return 'under $1 in gas';
    return 'about $2 in gas';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 1000;
    if (p.tvl_usd >= 2.5e8) return 500;
    if (p.tvl_usd >= 5e7) return 250;
    return 100;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function weeksFor(age) {
    if (age === null || age === undefined) return 10;
    return age < 365 ? 12 : 8;
  }
  function actionsFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var n = p.name;
    var half = Math.max(50, Math.round(capital / 2));
    if (c.indexOf('bridge') >= 0) return [
      'Bridge $' + capital + ' of USDC from Ethereum to ' + chain + ' through ' + n + ', then put the bridged funds to work in a ' + chain + ' app so the trip counts as real usage.',
      'Bridge $' + half + ' back a week later over a different route ' + n + ' offers, and keep a small working balance on ' + chain + ' instead of emptying the wallet.'];
    if (c.indexOf('staking') >= 0 || c.indexOf('restaking') >= 0 || c.indexOf('restak') >= 0) return [
      'Stake $' + capital + ' of ' + chain + "'s staking asset through " + n + ' and keep the liquid receipt token in the same wallet.',
      'Put the receipt token to work: supply it as collateral or pair it in a pool on ' + chain + ', so one deposit earns both the staking record and a DeFi position.'];
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('collateral market') >= 0 || c.indexOf('collateral management') >= 0) return [
      'Deposit $' + capital + ' of USDC into a ' + n + ' curated vault on ' + chain + ': read the vault\'s risk page first and pick the vault whose curator publishes its methodology.',
      'Split a second $' + half + ' into a different ' + n + ' vault with a different strategy, and compare the two vaults\' reports monthly; curators reward depositors who stay through a full quarter.'];
    if (c.indexOf('cdp') >= 0) return [
      'Open a vault on ' + n + ': lock $' + capital + ' of ETH or a liquid staking token as collateral on ' + chain + ' and mint its stablecoin against it.',
      'Keep the collateral ratio above 200 per cent, and repay and re-mint once a month so the vault shows a full borrow cycle, not one deposit.'];
    if (c.indexOf('lend') >= 0 || c.indexOf('uncollateralized') >= 0) return [
      'Supply $' + capital + ' of USDC to ' + n + "'s main market on " + chain + '; if it lists an isolated market too, split $50 into that market so both books see the wallet.',
      'Borrow about 40 per cent against the supply and re-supply the borrowed asset once, then hold: one careful loop, with the health factor kept above 1.8 at all times.'];
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity manager') >= 0) return [
      'Swap about $' + half + ' through ' + n + ' on ' + chain + ', split across two or three trades on different days, so the wallet builds a real trading record, not one wash.',
      'Provide $' + capital + ' to ' + n + "'s flagship pool on " + chain + ' (the deepest stable or ETH pair it lists) and leave the LP position untouched between weekly visits.'];
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('option') >= 0) return [
      'Deposit $' + capital + ' of USDC as margin on ' + n + ' and open one small hedged position: long the spot asset, short the same size on the perp, so the account trades without betting.',
      'Trade about $' + (capital * 4) + ' of volume a month in small clips on ' + chain + ', closing and reopening the hedge weekly; volume tiers are what perp farms usually count.'];
    if (c.indexOf('rwa') >= 0) return [
      'Subscribe $' + capital + ' to ' + n + "'s tokenized asset on " + chain + ': complete its KYC first if it asks (a one-off check, usually same-day), then hold the asset in the farming wallet.',
      'Hold through at least one full distribution or interest cycle, and use ' + n + "'s own secondary or redemption window once so the wallet shows a complete round trip."];
    if (c.indexOf('basis') >= 0) return [
      'Deposit $' + capital + ' of USDC into ' + n + "'s basis-trading vault on " + chain + ' and take the vault shares in the farming wallet.',
      'Keep the shares through a full funding cycle (about a month) instead of redeeming early; basis strategies snapshot holders, and churn is what they discount.'];
    if (c.indexOf('stable') >= 0) return [
      'Mint or deposit $' + capital + ' of ' + n + "'s stable asset on " + chain + ', through its own mint page rather than a swap, so the mint itself is recorded to the wallet.',
      'Put half the minted asset into ' + n + "'s stability or savings pool and hold the rest liquid, so the wallet shows both the mint and the hold."];
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('leveraged') >= 0) return [
      'Deposit $' + capital + ' of USDC or ETH into ' + n + "'s flagship vault on " + chain + ' and keep the vault shares; do not chase the highest-APY vault, the flagship is the one a launch rewards.',
      'Harvest and re-compound the yield once a month rather than withdrawing it, so the position grows on the record the protocol can see.'];
    if (c.indexOf('chain') >= 0) return [
      'Bridge $' + capital + ' to ' + chain + " and make it the wallet's home chain for this farm: hold the gas token, and use two of the chain's native apps so the wallet reads as a resident, not a tourist.",
      'Transact on ' + chain + ' every week (a swap, a mint, a small transfer between your own wallets) and keep at least $' + half + ' of working balance on the chain.'];
    if (c.indexOf('insurance') >= 0) return [
      'Stake $' + capital + ' into ' + n + "'s insurance pool on " + chain + ' (or buy cover of the same size on a protocol you actually use), and keep the position through one full cover period.',
      'Renew or roll the position when the period ends instead of letting it lapse; underwriters count continuous cover, not a single purchase.'];
    if (c.indexOf('prediction') >= 0) return [
      'Fund the ' + n + ' account with $' + capital + ' on ' + chain + ' and take positions in two or three liquid markets a week, sized at $10 to $25 each.',
      'Hold at least one position to settlement every month, so the account shows resolved trades and not only entries.'];
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return [
      'Open a ' + n + ' account, complete its KYC, and route $' + capital + ' of ordinary spending or one invoice a month through it on ' + chain + '.',
      'Keep the account active every month (a payment in, a payment out) rather than funding it once; payment farms count months of activity.'];
    if (c.indexOf('launchpad') >= 0) return [
      'Register the wallet on ' + n + ', complete its KYC or staking qualification, and hold the qualifying balance (about $' + capital + ') from the day you register.',
      'Take part in one sale on ' + n + ' when it runs, even a $50 ticket, and hold the allocation rather than flipping it on day one.'];
    if (c.indexOf('index') >= 0) return [
      'Buy and hold $' + capital + ' of ' + n + "'s flagship index on " + chain + ' in the farming wallet, through its own mint page where it has one.',
      'Add about $' + half + ' a month so the position shows steady accumulation across several rebalances.'];
    if (c.indexOf('privacy') >= 0) return [
      'Deposit $' + capital + ' into ' + n + "'s shielded pool on " + chain + ' from the farming wallet and let the deposit age at least two weeks before moving it.',
      'Make one shielded transfer or withdrawal a month, so the wallet shows ordinary private use rather than a single pass-through.'];
    return [
      'Deposit $' + capital + ' of USDC into ' + n + "'s flagship product on " + chain + ' and keep the position open; if it lists several products, the one holding most of its TVL is the one to use.',
      'Use ' + n + "'s core feature once a week beyond the deposit (a swap, a claim, a vote or a second smaller deposit), so the wallet reads as a user and not a parked balance."];
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var gas = gasFor(chain);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var weeks = weeksFor(p.age_days);
    var acts = actionsFor(p, capital, chain);
    var steps = [
      { text: 'Set up a fresh wallet for ' + p.name + ' alone, fund it from your main wallet, and keep its seed phrase offline; one wallet per farm keeps every protocol\'s record clean.', cost: gas + ' for the first transaction', time: '5 minutes' },
      { text: acts[0], cost: '$' + capital + ' of capital, ' + gas, time: '15 minutes to set up' },
      { text: acts[1], cost: 'about $' + Math.max(50, Math.round(capital / 2)) + ' more at most, ' + gas + ' a visit', time: '10 minutes' }
    ];
    if (p.chains && p.chains.length > 1) {
      steps.push({ text: 'Repeat a half-size position on ' + p.chains[1] + ', ' + p.name + "'s second chain: multichain activity is the cheapest signal that a wallet is a real user of the whole protocol.", cost: 'about $' + Math.max(50, Math.round(capital / 2)) + ' of capital, ' + gasFor(p.chains[1]), time: '15 minutes' });
    } else {
      steps.push({ text: 'Open ' + p.name + "'s own points, rewards or governance page and link the wallet there; if it runs a points program, enrol before you transact, because points rarely backdate.", cost: 'nothing to enrol, and never pay anyone to claim points', time: '10 minutes' });
    }
    steps.push(
      { text: 'Keep a weekly routine for ' + weeks + ' weeks: one qualifying action a week (a deposit, a swap, a borrow or a vote), on roughly the same day, so the record reads as habit, not a burst.', cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days in total, so the activity spans more than one monthly snapshot; withdrawing inside the first month is the commonest way farms are wasted.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Once a month, check ' + p.name + "'s official announcements and keep a farm log (wallet, dates, amounts, transaction hashes); if a claim ever opens, claim only from the link the protocol itself publishes.", cost: 'nothing to check or log, and never a fee to claim', time: '15 minutes a month' }
    );
    return steps;
  }

  /* ---------- tiny DOM helper ---------- */
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  /* ---------- state in the hash, so a view can be linked and screenshotted ---------- */
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('min')) state.min = Number(params.get('min')) || 0;
    if (params.get('watch') === '1') state.watch = true;
    if (params.get('tab') === 'live') state.tab = 'live';
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.min) params.set('min', String(state.min));
    if (state.watch) params.set('watch', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.min && r.tvl_usd < state.min) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.category_multiple; bv = b.category_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.rank - b.rank;
    });
  }

  /* ---------- page sections ---------- */
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('div', null,
          el('div', { class: 'brand-name', text: 'TOKEN RADAR' }),
          el('div', { class: 'brand-sub', text: 'pre-token protocols, priced by their peers' })
        )
      ),
      el('div', { class: 'top-meta' },
        el('span', null, 'snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'model ', el('b', { text: DATA.model_version })),
        el('span', null, 'watchlist floor ', el('b', { text: fmtUsd(DATA.floor_usd) + ' TVL' }))
      )
    );
  }

  function lede() {
    var total = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Every protocol with no token on record, ranked by what its token would be worth.' }),
        el('p', null,
          'The radar prices a launch the way the market already prices the protocol\'s tokenized peers: ',
          el('b', { text: 'TVL x the category\'s median market-cap/TVL' }),
          ', adjusted for seven-day momentum and for how long the protocol has run with no token. Protocols whose token already trades are never ranked by the model \u2014 they are set aside at their real market caps, and their prices are what calibrate everyone else.')
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist covered' }), el('b', null, el('em', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }))),
        el('div', { class: 'stat' }, el('span', { text: 'Pre-token rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Combined implied value' }), el('b', { text: fmtUsd(total) })),
        el('div', { class: 'stat' }, el('span', { text: 'Tokenized peers read' }), el('b', { text: String(DATA.tokenized_peers) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorized'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); refresh(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); refresh(); });
    var minSel = el('select', { id: 'min', 'aria-label': 'Minimum TVL' },
      [['0', 'Any TVL'], ['25000000', '$25M +'], ['50000000', '$50M +'], ['100000000', '$100M +'], ['500000000', '$500M +']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: String(state.min) === o[0] ? 'selected' : null });
      })
    );
    minSel.addEventListener('change', function () { state.min = Number(minSel.value) || 0; writeHash(); refresh(); });
    var watchBox = el('input', { type: 'checkbox', id: 'watch', 'aria-label': 'Watchlist only' });
    if (state.watch) watchBox.setAttribute('checked', '');
    watchBox.addEventListener('change', function () { state.watch = watchBox.checked; writeHash(); refresh(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'min', text: 'Min TVL' }), minSel),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Scope' }), el('label', { class: 'check' }, watchBox, ' Watchlist only')),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      (countEl = el('span', { class: 'count', text: '' }))
    );
  }

  /* Rebuild only the board and model slots: filter keystrokes keep their focus and their control. */
  function refresh() {
    if (!boardSlot || !modelSlot) return;
    boardSlot.textContent = '';
    modelSlot.textContent = '';
    boardSlot.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') modelSlot.appendChild(modelPanel());
    if (countEl) countEl.textContent = state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows' : DATA.live.length + ' live-token protocols';
  }

  function sortHeader(key, label, naturalDir) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = naturalDir; }
        refresh();
      } }, label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null)
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search, lower the TVL floor or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.min = 0; state.watch = false; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        'data-watch': r.watchlist ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('div', null, el('b', { text: r.name }), r.watchlist ? el('span', { class: 'tag', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Uncategorized') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.category_multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('button', { class: 'plan-btn', type: 'button', text: 'Farm plan', onclick: function (e) { e.stopPropagation(); openDetail(r.slug); } })),
        el('td', null, el('span', { class: 'status', text: 'no token on record' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols ranked by implied value. The \u00d7Cat column is the category multiple the market itself set (see the model below). Select a row for its full breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank', 1),
            sortHeader('name', 'Protocol', 1),
            sortHeader('tvl', 'TVL', -1),
            sortHeader('growth', '7d', -1),
            sortHeader('age', 'Age', -1),
            sortHeader('multiple', '\u00d7Cat', -1),
            sortHeader('implied', 'Implied value', -1),
            el('th', { scope: 'col', text: 'Plan' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'rank', text: '\u2014' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Uncategorized') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.tvl_usd > 0 && r.mcap_usd ? fmtMult(r.mcap_usd / r.tvl_usd) : 'n/a' }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Set aside, not ranked: these protocols already trade, so their market cap is a fact, not a model. Their mcap/TVL ratios are the calibration the pre-token board is priced with \u2014 the \u00d7TVL column is each one\'s own ratio.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: '' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }),
            el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: '\u00d7TVL' }), el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var shown = CALIB.table.filter(function (c) { return c.peers >= 2; }).slice(0, 14);
    var rest = CALIB.table.length - CALIB.table.filter(function (c) { return c.peers >= 2; }).length;
    var tbody = el('tbody');
    shown.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', { text: c.category === null ? 'Uncategorized' : c.category }),
        el('td', { class: 'num', text: String(c.peers) }),
        el('td', { class: 'num', text: fmtMult(c.median) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) })
      ));
    });
    return el('section', { class: 'panel model' },
      el('h2', null, 'How the radar prices a launch ', el('span', { class: 'sub', text: 'model ' + DATA.model_version + ' \u00b7 no name is special-cased' })),
      el('div', { class: 'formula' },
        'implied = round( tvl \u00d7 ', el('b', { text: 'category multiple' }), ' \u00d7 ', el('b', { text: 'momentum' }), ' \u00d7 ', el('b', { text: 'maturity' }), ' )'),
      el('div', { class: 'factors' },
        el('div', { class: 'factor' },
          el('h3', { text: '1 \u00b7 Category multiple \u2014 calibrated' }),
          el('p', null, 'For every tokenized protocol in the snapshot, the market\'s price of one TVL dollar is ', el('b', { text: 'mcap / TVL' }), '. A category\'s multiple is the ', el('b', { text: 'median' }), ' of that ratio across its ', el('b', { text: String(DATA.tokenized_peers) }), ' priced peers, shrunk toward the global median (' + fmtMult(CALIB.global) + ') by a prior of ' + M.shrink_k + ' peers and clamped to [' + M.multiple_floor + ', ' + M.multiple_cap + ']. A category with no priced peer uses the global median. Nothing here is asserted: change the snapshot and every multiple moves.')),
        el('div', { class: 'factor' },
          el('h3', { text: '2 \u00b7 Momentum \u2014 the 7-day tape' }),
          el('p', null, 'The snapshot\'s seven-day TVL change, clamped to [' + M.growth_floor + '%, +' + M.growth_cap + '%] and weighted ' + M.growth_weight + ': a protocol the market is moving into launches richer than one it is leaving. The factor runs ' + M.momentum_floor + ' to ' + M.momentum_cap + '; an unreported change is neutral.')),
        el('div', { class: 'factor' },
          el('h3', { text: '3 \u00b7 Maturity \u2014 time with no token' }),
          el('p', null, 'Days since DefiLlama first listed the protocol: the record of how long it has operated with no token. The factor ramps ' + M.maturity_floor + ' to ' + (M.maturity_floor + M.maturity_range).toFixed(2) + ' over ' + M.maturity_days + ' days, then holds; an unrecorded listing date scores as ' + M.unknown_age_days + ' days.'))
      ),
      el('table', { class: 'calib' },
        el('caption', { text: 'The calibration, re-derived by this page from the market ratios in its data: the categories with at least two priced peers.' }),
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Priced peers' }),
          el('th', { scope: 'col', text: 'Median mcap/TVL' }), el('th', { scope: 'col', text: 'Multiple used' }))),
        tbody
      ),
      el('p', { class: 'more-note', text: (rest > 0 ? '+ ' + rest + ' categories with a single priced peer, each shrunk most of the way to the global median. ' : '') + 'Snapshot source: ' + DATA.source + '. An implied value is this entry\'s own claim about a hypothetical token, not a price, a prediction that a token will exist, or advice.' })
    );
  }

  /* ---------- detail drawer ---------- */
  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var check = impliedOf(row);
    var calib = multipleFor(row.category);
    var steps = farmSteps(row);
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'eyebrow', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' \u00b7 watchlist' : ' \u00b7 early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Uncategorized') + ' \u00b7 ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' \u00b7 records no token as of ' + DATA.as_of })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    var checkP = el('p', { class: 'check-line' },
      'This page recomputes the row from the snapshot figures and the market ratios in its data: ',
      el('b', { text: fmtUsd(check.value) }),
      check.value === row.implied_value_usd ? ' \u2014 the same number board.json carries. The screenshots and the code are the same arithmetic.' : ' \u2014 which differs from the board, so the data would be stale.');
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value \u2014 the model, line by line' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', null, 'TVL (snapshot)', el('small', { text: 'total value locked, ' + DATA.as_of })), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', null, 'Category multiple', el('small', { text: calib.peers > 0 ? 'median mcap/TVL of ' + calib.peers + ' tokenized ' + (row.category || 'Uncategorized') + ' peer' + (calib.peers === 1 ? '' : 's') + ', shrunk to the global median' : 'no tokenized peer in this category: the global median' })), el('b', { text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', null, 'Momentum', el('small', { text: 'seven-day TVL change ' + fmtPct(row.change_7d) + ', clamped and weighted' })), el('b', { text: fmtMult(row.momentum_multiplier) })),
        el('div', null, el('span', null, 'Maturity', el('small', { text: row.age_days === null ? 'listing date unrecorded: scored as ' + M.unknown_age_days + ' days' : 'listed ' + row.age_days + ' days with no token on record' })), el('b', { text: fmtMult(row.maturity_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) }))
      ),
      checkP
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan \u2014 what to do before any launch' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        return el('li', null,
          el('b', { text: s.text }),
          el('div', { class: 'chips' },
            el('span', { class: 'chip' }, 'Cost \u2014 ', el('b', { text: s.cost })),
            el('span', { class: 'chip' }, 'Time \u2014 ', el('b', { text: s.time }))
          )
        );
      })),
      el('p', { class: 'fineprint', text: 'A plan, not a promise: ' + row.name + ' records no token on DefiLlama as of ' + DATA.as_of + ', which is a statement about the record, not about the future. Farming costs the gas and capital above and may return nothing.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    boardSlot = el('div');
    modelSlot = el('div');
    shell.appendChild(boardSlot);
    shell.appendChild(modelSlot);
    app.appendChild(shell);
    refresh();
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  /* writeHash uses replaceState, which never fires hashchange: this only answers real navigation. */
  window.addEventListener('hashchange', function () { readHash(); render(); });
  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
