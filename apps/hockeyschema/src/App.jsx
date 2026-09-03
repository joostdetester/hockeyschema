import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc, getDoc, collection, deleteField } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, functions, auth } from './firebase.js';
import { useAuth } from './AuthContext.jsx';
import { useTeam } from './TeamContext.jsx';
import Login from './Login.jsx';
import { DEFAULT_SC } from './scDefaults.js';
import { NOTE_GROUPS, DEFAULT_NOTE_CATEGORIES } from './noteDefaults.js';

function css(str) {
  const obj = {};
  (str || '').split(';').forEach(rule => {
    const idx = rule.indexOf(':');
    if (idx < 0) return;
    const prop = rule.slice(0, idx).trim();
    const val = rule.slice(idx + 1).trim();
    if (!prop || !val) return;
    const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    obj[camel] = val;
  });
  return obj;
}

const POS = [
  { k: 'LV', label: 'Links voor', short: 'LV', zone: 'links', line: 0 },
  { k: 'SP', label: 'Spits', short: 'SP', zone: 'as', line: 0 },
  { k: 'RV', label: 'Rechts voor', short: 'RV', zone: 'rechts', line: 0 },
  { k: 'LH', label: 'Linkshalf', short: 'LH', zone: 'links', line: 1 },
  { k: 'MM', label: 'Mid mid', short: 'MM', zone: 'as', line: 1 },
  { k: 'RH', label: 'Rechtshalf', short: 'RH', zone: 'rechts', line: 1 },
  { k: 'VS', label: 'Voorstopper', short: 'VS', zone: 'as', line: 2 },
  { k: 'LA', label: 'Links achter', short: 'LA', zone: 'links', line: 3 },
  { k: 'LM', label: 'Laatste man', short: 'LM', zone: 'as', line: 3 },
  { k: 'RA', label: 'Rechts achter', short: 'RA', zone: 'rechts', line: 3 }
];
const PMAP = {};
POS.forEach(p => { PMAP[p.k] = p; });
const FILL_ORDER = ['SP', 'MM', 'VS', 'LM', 'RV', 'RH', 'RA', 'LV', 'LH', 'LA'];
const LINES = [['LV', 'SP', 'RV'], ['LH', 'MM', 'RH'], ['LA', 'VS', 'RA'], ['LM']];
const ZONE_W = { as: 1.0, rechts: 0.6, links: 0.3 };
const QUARTER_MIN = 17.5;
// Aftelklok in wedstrijdmodus: telt een kwart af en waarschuwt 1 minuut vóór de helft van het
// kwart (het moment waarop meestal binnen het speelblok gewisseld wordt), zodat de meiden
// daar tijdig van op de hoogte gebracht kunnen worden.
const TIMER_TOTAL_MS = Math.round(QUARTER_MIN * 60 * 1000);
const TIMER_ALERT_REMAINING_MS = TIMER_TOTAL_MS - Math.round((QUARTER_MIN / 2 - 1) * 60 * 1000);
// Live wedstrijdvolgen: de klok per kwart leeft in m.clocks (Firestore-gesynchroniseerd, dus
// voor iedereen live zichtbaar) i.p.v. lokale state - dit is de standaardwaarde voor een kwart
// dat nog niet is aangeraakt.
const DEFAULT_CLOCK = { running: false, endAt: null, remainingMs: TIMER_TOTAL_MS };

const DEFAULT_PLAYERS = [
  ['Babette', 'van Dijk', { LA: 2, RA: 1 }],
  ['Carmen', 'Scharloo', { SP: 4, RV: 3, LA: 2, RA: 1 }],
  ['Emma', 'Hakker', { LH: 2, LA: 1, RA: 3 }],
  ['Emmily', 'Breijs', { RV: 3, LH: 2, MM: 4, RH: 1 }],
  ['Evi', 'te Linde', { LM: 1 }],
  ['Fenna', 'Vonk', { LV: 1, SP: 3, RV: 2, LH: 4, RH: 5 }],
  ['Floor', 'Lutjes', { LV: 2, SP: 1, RV: 3 }],
  ['Guusje', 'Verboom', { LH: 4, MM: 5, RH: 3, VS: 1, LM: 2 }],
  ['Lotte', 'van Os', { LV: 2, SP: 3, LH: 1 }],
  ['Madelief', 'Schreuders', { LV: 1, SP: 2, MM: 3, VS: 4 }],
  ['Madeline', 'de Witt Wijnen', { MM: 2, VS: 1, LM: 3 }],
  ['Mirre', 'de Jong', { MM: 1 }],
  ['Roos', 'de Bruijn', { LA: 1, RA: 2 }],
  ['Sanne', 'van Dongen', { LV: 1, SP: 2, RV: 3 }],
  ['Sara', 'van Groningen', { LV: 3, SP: 2, RV: 1 }]
].map((r, i) => ({ id: 'p' + i, first: r[0], last: r[1], level: 3, sub: false, prefs: r[2] }));

const DEFAULT_FIXTURES = [
  ['2026-08-29', '14:00', 'MO18-1 HCRB', false],
  ['2026-09-05', '11:15', 'Alphen MO18-3', false],
  ['2026-09-12', '11:15', 'Ypenburg MO18-3', true],
  ['2026-09-19', '13:35', 'Ring Pass MO18-3', false],
  ['2026-09-26', '', 'HUDITO MO18-3', false],
  ['2026-10-03', '11:15', 'Rotterdam MO18-6', true]
].map((f, i) => ({ id: 'fx' + i, date: f[0], time: f[1], opponent: f[2], home: f[3] }));

const FX0_ON = [
  { LV: 'p9', SP: 'p6', RV: 'p14', LH: 'p8', MM: 'p11', RH: 'p5', VS: 'p10', LA: 'p12', LM: 'p4', RA: 'p0' },
  { LV: 'p9', SP: 'p6', RV: 'p14', LH: 'p8', MM: 'p11', RH: 'p3', VS: 'p7', LA: 'p2', LM: 'p4', RA: 'p0' },
  { LV: 'p5', SP: 'p10', RV: 'p14', LH: 'p9', MM: 'p11', RH: 'p3', VS: 'p7', LA: 'p12', LM: 'p4', RA: 'p0' },
  { LV: 'p5', SP: 'p6', RV: 'p14', LH: 'p8', MM: 'p11', RH: 'p3', VS: 'p7', LA: 'p2', LM: 'p4', RA: 'p0' },
  { LV: 'p9', SP: 'p6', RV: 'p1', LH: 'p8', MM: 'p10', RH: 'p3', VS: 'p7', LA: 'p2', LM: 'p4', RA: 'p12' },
  { LV: 'p9', SP: 'p6', RV: 'p14', LH: 'p5', MM: 'p10', RH: 'p3', VS: 'p7', LA: 'p2', LM: 'p4', RA: 'p0' },
  { LV: 'p8', SP: 'p14', RV: 'p1', LH: 'p2', MM: 'p9', RH: 'p5', VS: 'p10', LA: 'p12', LM: 'p7', RA: 'p0' },
  { LV: 'p8', SP: 'p6', RV: 'p1', LH: 'p2', MM: 'p3', RH: 'p5', VS: 'p10', LA: 'p12', LM: 'p4', RA: 'p0' }
];
const FX0_BENCH = [
  ['p3', 'p2', 'p7'], ['p12', 'p5', 'p10'], ['p2', 'p6', 'p8'], ['p12', 'p9', 'p10'],
  ['p0', 'p14', 'p5'], ['p12', 'p1', 'p8'], ['p3', 'p4', 'p6'], ['p14', 'p9', 'p7']
];
const FX0_SCHEDULE = FX0_ON.map((on, i) => ({ on, bench: FX0_BENCH[i] }));
const FX0_SELECTED = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12', 'p14'];
const FX0_MATCH = {
  fixtureId: 'fx0', opponent: 'MO18-1 HCRB', date: '2026-08-29',
  selected: FX0_SELECTED, keeperId: 'p1', keeper2Id: 'p11', keeperSwitches: true, keepersPlayOut: true,
  schedule: FX0_SCHEDULE, injuries: {}, locked: true
};
const FX0_HALVES = {};
FX0_SCHEDULE.forEach(b => Object.keys(b.on).forEach(k => { FX0_HALVES[b.on[k]] = (FX0_HALVES[b.on[k]] || 0) + 1; }));
DEFAULT_FIXTURES[0].savedMatch = FX0_MATCH;
DEFAULT_FIXTURES[0].locked = true;
DEFAULT_FIXTURES[0].friendly = true;
const DEFAULT_HISTORY = [{
  id: 'hist_fx0', date: '2026-08-29', opponent: 'MO18-1 HCRB',
  keeperId: 'p1', keeperIds: ['p1', 'p11'], gf: '', ga: '', halves: FX0_HALVES
}];

const KEY = 'hockeyschema.v2';
const OWN_TEAM = 'HCRB MO18-2';
const LEVELS = [
  { v: 5, label: 'Uitblinkend' },
  { v: 4, label: 'Sterk ontwikkeld' },
  { v: 3, label: 'Goed op weg' },
  { v: 2, label: 'In ontwikkeling' },
  { v: 1, label: 'Pril' }
];
const C_OUT = '#a32020';
const C_IN = '#1c6b3d';
const C_MOVE = 'var(--color-accent-700)';
const C_IN_BG = '#e7f1ea';
const C_MOVE_BG = 'var(--color-accent-100)';
// Zelfde iconen als de fullscreen-toggle bij videospelers - vier hoek-haakjes die naar buiten
// wijzen om volledig scherm te activeren, naar binnen om het te verlaten.
const ICON_FULLSCREEN = 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z';
const ICON_FULLSCREEN_EXIT = 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z';

// Invallers kunnen dezelfde voornaam hebben als een vaste speelster - overal waar alleen de
// voornaam wordt getoond (dus niet waar ook de achternaam erbij staat) moet dat onderscheidbaar
// blijven.
function displayFirst(p) { return p && p.sub ? p.first + ' (I)' : (p ? p.first : '?'); }

// Klein rond knopje op een schemacel om een notitie toe te voegen - toont een stipje/aantal
// zodra er al aantekeningen voor die speler in dat kwart bestaan (rood als er een werkpunt
// bij zit, anders groen), zodat je in één oogopslag ziet waar al iets genoteerd is.
function noteDotStyle(badge) {
  const bg = !badge ? 'var(--color-neutral-100)' : badge.hasNeg ? C_OUT : C_IN;
  const color = !badge ? 'var(--color-neutral-700)' : '#fff';
  return 'width:16px;height:16px;min-width:16px;border-radius:50%;border:1px solid var(--color-neutral-400);'
    + 'background:' + bg + ';color:' + color + ';font-size:10px;line-height:1;padding:0;cursor:pointer;'
    + 'display:inline-flex;align-items:center;justify-content:center;';
}

function InfoDot({ text }) {
  return (
    <span className="info-dot">
      <button type="button" tabIndex={0} aria-label="Meer uitleg"
        style={css('width:18px;height:18px;border-radius:50%;border:1px solid var(--color-neutral-400);background:var(--color-neutral-100);color:var(--color-neutral-700);font-size:11px;font-style:italic;font-family:serif;line-height:1;cursor:default;padding:0;display:inline-flex;align-items:center;justify-content:center')}>
        i
      </button>
      <span className="info-dot-tip card elev-sm" style={css('position:absolute;left:24px;top:-6px;z-index:5;width:270px;font-size:13px;font-weight:400;line-height:1.4;color:var(--color-neutral-800);text-wrap:pretty')}>
        {text}
      </span>
    </span>
  );
}

function Switch({ checked, onChange, disabled }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="switch-track" />
      <span className="switch-knob">{checked ? '✓' : '✕'}</span>
    </label>
  );
}

function ratingOf(p) { return 50 + ((p && p.level ? p.level : 3) - 1) * 12.5; }
// mode 'sterk': sterkste speelsters krijgen iets meer speeltijd.
// mode 'zwak': gespiegeld — minder sterke speelsters krijgen iets meer speeltijd (zelfde bandbreedte).
// mode 'standaard': speeltijd genegeerd sterkte — iedereen evenveel, alleen voorkeurspositie telt.
function weight(p, mode) {
  if (mode === 'standaard') return 1;
  const r = ratingOf(p);
  const rr = mode === 'zwak' ? 150 - r : r;
  return 0.94 + 0.12 * (Math.max(40, Math.min(100, rr)) - 50) / 50;
}

function assign(onPlayers, prevOn, mode, opts) {
  const zoneOn = !opts || opts.zone !== false;
  const contOn = !opts || opts.continuity !== false;
  const cost = (p, pos) => {
    const r = p.prefs[pos];
    const base = (r ? r : 9) * 1000;
    const z = (mode === 'standaard' || !zoneOn) ? 0 : ZONE_W[PMAP[pos].zone] * (100 - ratingOf(p));
    const cont = (contOn && prevOn && prevOn[pos] === p.id) ? -800 : 0;
    return base + z + cont;
  };
  let pool = onPlayers.slice();
  const res = {};
  FILL_ORDER.forEach(pos => {
    if (!pool.length) return;
    let best = null, bc = Infinity;
    pool.forEach(p => { const c = cost(p, pos); if (c < bc) { bc = c; best = p; } });
    res[pos] = best.id;
    pool = pool.filter(p => p !== best);
  });
  const byId = {};
  onPlayers.forEach(p => { byId[p.id] = p; });
  let improved = true, guard = 0;
  while (improved && guard++ < 60) {
    improved = false;
    for (let i = 0; i < FILL_ORDER.length; i++) {
      for (let j = i + 1; j < FILL_ORDER.length; j++) {
        const a = FILL_ORDER[i], b = FILL_ORDER[j];
        if (!res[a] || !res[b]) continue;
        const pa = byId[res[a]], pb = byId[res[b]];
        if (cost(pb, a) + cost(pa, b) < cost(pa, a) + cost(pb, b) - 0.001) {
          res[a] = pb.id; res[b] = pa.id; improved = true;
        }
      }
    }
  }
  return res;
}

// Afspraak: bij een volledige wedstrijd (geen uitvaller) mogen twee veldspeelsters nooit meer dan
// 1 speelblok van elkaar verschillen. Keepers en uitvallers vallen hierbuiten - zij spelen
// structureel minder/anders. Werkt alleen op blocks vanaf fromBlock, zodat al gespeelde/vergrendelde
// blokken niet met terugwerkende kracht wijzigen, en respecteert de "bank 1e helft -> gegarandeerd
// veld 2e helft"-garantie door nooit iemand uit de tweede helft van een kwart te halen die daar
// verplicht staat, en nooit iemand een heel kwart op de bank te zetten.
function enforceFairness(blocks, field, keeperIds, injuries, ptMode, fromBlock, assignOpts) {
  const fullMatch = field.filter(p => injuries[p.id] == null && keeperIds.indexOf(p.id) < 0);
  const fmIds = fullMatch.map(p => p.id);
  if (fmIds.length < 2) return blocks;
  const byId = {};
  field.forEach(p => { byId[p.id] = p; });
  const countOf = () => {
    const c = {};
    fmIds.forEach(id => { c[id] = 0; });
    blocks.forEach(blk => Object.keys(blk.on).forEach(k => { if (c[blk.on[k]] != null) c[blk.on[k]]++; }));
    return c;
  };
  const sitsWholeQuarter = (b, id) => {
    const partner = b % 2 === 0 ? b + 1 : b - 1;
    if (partner < 0 || partner >= blocks.length) return false;
    return !Object.keys(blocks[partner].on).some(k => blocks[partner].on[k] === id);
  };
  let guard = 0;
  while (guard++ < 300) {
    const counts = countOf();
    let maxId = fmIds[0], minId = fmIds[0];
    fmIds.forEach(id => {
      if (counts[id] > counts[maxId]) maxId = id;
      if (counts[id] < counts[minId]) minId = id;
    });
    if (counts[maxId] - counts[minId] <= 1) break;
    let done = false;
    for (let b = fromBlock; b < blocks.length && !done; b++) {
      const blk = blocks[b];
      const onIds = Object.keys(blk.on).map(k => blk.on[k]);
      if (onIds.indexOf(maxId) < 0 || blk.bench.indexOf(minId) < 0) continue;
      if (b % 2 === 1 && blocks[b - 1] && blocks[b - 1].bench.indexOf(maxId) >= 0) continue;
      if (sitsWholeQuarter(b, maxId)) continue;
      const prevOn = b > 0 ? blocks[b - 1].on : null;
      const newOnPlayers = onIds.map(id => id === maxId ? byId[minId] : byId[id]);
      blk.on = assign(newOnPlayers, prevOn, ptMode, assignOpts);
      blk.bench = blk.bench.filter(id => id !== minId).concat([maxId]);
      done = true;
    }
    if (!done) break;
  }
  return blocks;
}

function buildSchedule(match, players, fromHalf) {
  const keeperIds = [match.keeperId, match.keeper2Id].filter(Boolean);
  const keeperAt = i => (match.keeper2Id && i >= 4) ? match.keeper2Id : match.keeperId;
  const sel = match.selected || [];
  const selectedPlayers = players.filter(p => sel.indexOf(p.id) >= 0);
  const field = selectedPlayers.filter(p => match.keepersPlayOut || keeperIds.indexOf(p.id) < 0);
  if (field.length < 6) return null;
  const prev = (match.schedule || []).slice(0, fromHalf);
  const played = {};
  field.forEach(p => { played[p.id] = 0; });
  prev.forEach(b => Object.keys(b.on).forEach(k => { if (played[b.on[k]] != null) played[b.on[k]]++; }));
  const ptMode = match.playTimeMode === 'zwak' || match.playTimeMode === 'standaard' ? match.playTimeMode : 'sterk';
  const assignOpts = { zone: match.zoneStrength !== false, continuity: match.continuity !== false };
  const prefCorrectionOn = match.prefCorrection !== false;
  const wsum = field.reduce((s, p) => s + weight(p, ptMode), 0);
  const slots = Math.min(10, field.length);
  const blocks = prev.slice();
  const injuries = match.injuries || {};
  for (let b = prev.length; b < 8; b++) {
    const avail = field.filter(p => p.id !== keeperAt(b) && !(injuries[p.id] != null && b >= injuries[p.id]));
    const need = Math.min(10, avail.length);
    const frac = (b + 1) / 8;
    const prevOnSet = blocks[b - 1] ? Object.keys(blocks[b - 1].on).map(k => blocks[b - 1].on[k]) : null;
    const imp = (b < 2 || b >= 6) ? 1 : -0.6;
    const scored = avail.map(p => {
      const E = Math.min(8, 8 * slots * weight(p, ptMode) / wsum);
      const deficit = E * frac - played[p.id];
      const sat = prevOnSet ? prevOnSet.indexOf(p.id) < 0 : false;
      const strengthNudge = ptMode === 'standaard' ? 0 : imp * 1 * ((ratingOf(p) - 70) / 100);
      return { p, s: deficit + strengthNudge + (sat ? 1.5 : 0) };
    });
    scored.sort((x, y) => y.s - x.s);
    let on = [], pool = scored.slice();
    const mustPlay = (b % 2 === 1 && blocks[b - 1])
      ? blocks[b - 1].bench.filter(id => avail.some(p => p.id === id))
      : [];
    mustPlay.slice(0, need).forEach(id => {
      const i = pool.findIndex(x => x.p.id === id);
      if (i >= 0) on.push(pool.splice(i, 1)[0].p);
    });
    on = on.concat(pool.slice(0, Math.max(0, need - on.length)).map(x => x.p));
    const onIds = on.map(p => p.id);
    let bench = pool.filter(x => onIds.indexOf(x.p.id) < 0).map(x => x.p);
    const prevOn = blocks[b - 1] ? blocks[b - 1].on : null;
    const byId = {};
    avail.forEach(p => { byId[p.id] = p; });
    let assignMap = assign(on, prevOn, ptMode, assignOpts);
    if (prefCorrectionOn) {
      const prefCost = map => Object.keys(map).reduce((s, pos) => {
        const p = byId[map[pos]];
        return s + (p && p.prefs[pos] ? p.prefs[pos] : 9);
      }, 0);
      let guard = 0, changed = true;
      while (changed && guard++ < 12) {
        changed = false;
        const bad = Object.keys(assignMap).filter(pos => {
          const p = byId[assignMap[pos]];
          return p && !p.prefs[pos] && mustPlay.indexOf(p.id) < 0;
        });
        for (let bi = 0; bi < bad.length && !changed; bi++) {
          const pos = bad[bi];
          const offId = assignMap[pos];
          let best = null;
          bench.filter(bp => bp.prefs[pos]).forEach(bp => {
            const newOn = on.map(p => p.id === offId ? bp : p);
            const cand = assign(newOn, prevOn, ptMode, assignOpts);
            const c = prefCost(cand);
            if (!best || c < best.c) best = { c, cand, newOn, bp };
          });
          if (best && best.c < prefCost(assignMap)) {
            const offP = byId[offId];
            on = best.newOn;
            bench = bench.filter(x => x.id !== best.bp.id).concat([offP]);
            assignMap = best.cand;
            changed = true;
          }
        }
      }
    }
    on.forEach(p => { played[p.id]++; });
    blocks.push({ on: assignMap, bench: bench.map(p => p.id) });
  }
  return enforceFairness(blocks, field, keeperIds, injuries, ptMode, prev.length, assignOpts);
}

function halvesPlayed(schedule) {
  const out = {};
  (schedule || []).forEach(b => Object.keys(b.on).forEach(k => {
    out[b.on[k]] = (out[b.on[k]] || 0) + 1;
  }));
  return out;
}

function playsInQuarter(sched, q, id) {
  return [2 * q, 2 * q + 1].some(i => sched[i] && Object.keys(sched[i].on).some(k => sched[i].on[k] === id));
}

const DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const SUP = ['\u2070', '\u00b9', '\u00b2', '\u00b3', '\u2074', '\u2075', '\u2076', '\u2077', '\u2078', '\u2079'];
const supNum = n => String(n).split('').map(c => SUP[+c] || '').join('');
const GRID_ORDER = ['LV', 'SP', 'RV', 'LH', 'MM', 'RH', 'VS', 'LA', 'LM', 'RA'];
const CELL = 'flex:0 0 31%;min-width:0;padding:5px 7px;border-radius:var(--radius-md);text-align:center;';

const BLANK_MATCH = { opponent: '', date: '', keeperId: '', selected: [], injuries: {}, schedule: null, notes: [] };

export default function App() {
  const { user, myTeams, role, isAdmin, logout } = useAuth();
  const { teams, teamsLoaded, currentTeamId, setCurrentTeamId, createTeam, deleteTeam, defaultTeamId, setDefaultTeam } = useTeam();
  // Rol van de ingelogde gebruiker specifiek voor het team dat nu bekeken wordt - iemand kan
  // coach van het ene team zijn en manager van een ander, dus dit hangt af van currentTeamId.
  const myRoleForCurrentTeam = (myTeams && currentTeamId && myTeams[currentTeamId]) || null;

  const [tab, setTab] = useState('programma');
  const [players, setPlayers] = useState([]);
  const [sc, setSc] = useState({ verdedigen: [], aanval: [] });
  const [newName, setNewName] = useState('');
  const [newIsSub, setNewIsSub] = useState(false);
  const [injPlayer, setInjPlayer] = useState('');
  const [injFrom, setInjFrom] = useState('2');
  const [fixtures, setFixtures] = useState([]);
  const [addFixtureOpen, setAddFixtureOpen] = useState(false);
  const [addFixtureForm, setAddFixtureForm] = useState({ date: '', time: '', opponent: '', home: true });
  const [addFixtureError, setAddFixtureError] = useState('');
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const desktopMoreMenuRef = useRef(null);
  const mobileMoreMenuRef = useRef(null);
  const [printOptions, setPrintOptions] = useState({ wedstrijdschema: true, strafcorner: false, speeltijd: false, notities: false });
  const [history, setHistory] = useState([]);
  const [match, setMatch] = useState(BLANK_MATCH);
  const [editing, setEditing] = useState(null);
  const [relocating, setRelocating] = useState(null);
  const [noteCategories, setNoteCategories] = useState(DEFAULT_NOTE_CATEGORIES);
  const [noteEditor, setNoteEditor] = useState(null);
  const [notesFilterPlayer, setNotesFilterPlayer] = useState('');
  const [loadedTeamId, setLoadedTeamId] = useState(null);
  const [historyLoadedTeamId, setHistoryLoadedTeamId] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [teamError, setTeamError] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [expandedUserUid, setExpandedUserUid] = useState(null);
  const [coachEmailByTeam, setCoachEmailByTeam] = useState({});
  const [coachRoleByTeam, setCoachRoleByTeam] = useState({});
  const [coachBusyByTeam, setCoachBusyByTeam] = useState({});
  const [coachErrorByTeam, setCoachErrorByTeam] = useState({});
  const [lisaConfig, setLisaConfig] = useState(null);
  const [lisaForm, setLisaForm] = useState({ clubDudaId: '', teamId: '', teamName: '', authHeader: '' });
  const [lisaBusy, setLisaBusy] = useState(false);
  const [lisaError, setLisaError] = useState('');
  const [lisaEditing, setLisaEditing] = useState(false);
  const [lisaTeamOptions, setLisaTeamOptions] = useState(null);
  const [lisaTeamsBusy, setLisaTeamsBusy] = useState(false);
  const [standings, setStandings] = useState([]);
  const [standingsUpdatedAt, setStandingsUpdatedAt] = useState(null);
  const [standingsBusy, setStandingsBusy] = useState(false);
  const [standingsError, setStandingsError] = useState('');
  const [selectedPouleId, setSelectedPouleId] = useState(null);
  // Los van selectedPouleId (dat is specifiek voor de Standen-tabel/importlabel): dit filtert
  // de wedstrijdenlijst op Programma zelf, en kan behalve een echte competitie ook
  // 'friendly' (oefenwedstrijden) of 'all' (alles) zijn.
  const [programmaCompetitionFilter, setProgrammaCompetitionFilter] = useState(null);
  const [showPastOuders, setShowPastOuders] = useState(false);
  const [showPastFixtures, setShowPastFixtures] = useState(false);
  // Wedstrijdmodus: compacte weergave voor tijdens de wedstrijd (alleen coaches, zie isMyTeam
  // hieronder) i.p.v. de volledige pagina. Blijft aan staan na een ververs (bijv. verbinding
  // verloren tijdens de wedstrijd) door de keuze in localStorage te bewaren i.p.v. alleen in
  // React state. Dit is puur of de coach zélf de compacte weergave open heeft staan op zijn eigen
  // toestel - los van m.liveOpened hieronder (de "Start wedstrijd"-schakelaar die de Live-pagina
  // voor iedereen zichtbaar maakt).
  const [matchMode, setMatchMode] = useState(() => {
    try { return window.localStorage.getItem('hockeyschema.matchMode') === '1'; } catch { return false; }
  });
  // Volledig scherm - handig op een tablet/2-in-1 met toetsenbord ingeklapt, zodat de
  // browserbalken niet onnodig schermruimte innemen. Los bijgehouden (i.p.v. alleen de knoptekst
  // op aanname te zetten) omdat de gebruiker ook via Esc of de browser zelf kan uitstappen -
  // dan moet de knoptekst vanzelf weer "Volledig scherm" tonen.
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }
  // Puur lokale tik voor het live aftellen (elke kijker rekent zelf door op basis van het
  // gesynchroniseerde endAt-tijdstip in m.clocks - zie hieronder) - wordt nooit weggeschreven.
  const [timerNow, setTimerNow] = useState(() => Date.now());
  // Het wisselsignaal (1 min voor de helft van een kwart) is puur een sideline-cue op het eigen
  // toestel van de coach, dus lokaal en per kwart-index bijgehouden - anders zou het wegklikken
  // van het signaal in kwart 1 het signaal in kwart 3 ook onterecht onderdrukken.
  const [alertDismissedByQuarter, setAlertDismissedByQuarter] = useState({});
  const [scorerPicker, setScorerPicker] = useState(false);
  const [scorerSelected, setScorerSelected] = useState(null);
  const [goalRemark, setGoalRemark] = useState('');
  const [themGoalDialog, setThemGoalDialog] = useState(false);
  const [commentDialog, setCommentDialog] = useState(false);
  const [commentText, setCommentText] = useState('');
  // Gedeeld door de "wie scoorde"/"tegenstander scoort"/"extra commentaar"-dialogen - er staat
  // er nooit meer dan één tegelijk open, dus één stukje state volstaat. Wordt bij het openen van
  // een dialoog gezet op de op dat moment verstreken speeltijd, maar blijft door de coach
  // aanpasbaar (bv. een doelpunt dat pas 5 minuten later wordt ingevoerd).
  const [minuteInput, setMinuteInput] = useState('');
  const [endMatchConfirm, setEndMatchConfirm] = useState(false);
  const [manualClockInput, setManualClockInput] = useState('');
  const [expandedReportId, setExpandedReportId] = useState(null);
  // Index (in m.goalLog) van de logregel die de coach nu aan het bewerken is, plus het
  // bijbehorende bewerkformulier - null = geen bewerkdialoog open.
  const [editEntryIdx, setEditEntryIdx] = useState(null);
  const [editMinute, setEditMinute] = useState('');
  const [editText, setEditText] = useState('');
  const migratedRef = useRef(false);

  // isMyTeam: ingelogd én (coach van het bekeken team, of gebruiker is admin) - een manager
  // telt hier bewust niet mee, die krijgt geen coach-rechten, alleen via canManageOuders
  // hieronder specifiek het bewerken van Ouders. Iemand kan coach van meerdere teams zijn -
  // myRoleForCurrentTeam is al gescopet op het team dat nu bekeken wordt.
  const isMyTeam = !!user && ((myRoleForCurrentTeam && myRoleForCurrentTeam !== 'manager') || isAdmin);
  const readOnly = !isMyTeam;
  const canSeeHistory = isMyTeam;
  // Ouders is - anders dan de rest - zichtbaar voor iedereen (ook uitgelogd), zie
  // LOGGED_IN_ONLY_TABS hieronder. Bewerken mag alleen de manager van dit team, of een admin -
  // bewust géén coach, die krijgt hier geen extra rechten via isMyTeam.
  const canManageOuders = isAdmin || myRoleForCurrentTeam === 'manager';

  // Volledig scherm is alleen zinvol tijdens de wedstrijd (de knop is alleen zichtbaar in
  // wedstrijdmodus, zie de header) - verlaat je wedstrijdmodus (of raak je isMyTeam kwijt)
  // terwijl je nog in volledig scherm zit, dan sluit dat vanzelf mee af, anders zou je zonder
  // knop vastzitten (Esc werkt dan nog wel, maar dit is netter).
  useEffect(() => {
    if (!(matchMode && isMyTeam) && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [matchMode, isMyTeam]);

  const publicSyncRef = useRef('');
  const managerFixturesSyncRef = useRef('');
  const historySyncRef = useRef('');

  // Publieke teamdata (speelsters, strafcorner, programma, wedstrijd) — leesbaar voor iedereen,
  // her-abonneert zodra van team gewisseld wordt. `loadedTeamId` (i.p.v. een simpele boolean)
  // onthoudt VOOR WELK team de laatst ontvangen data was, zodat het opslaan-effect hieronder
  // nooit de net-verlaten data van team A per ongeluk naar team B's document schrijft terwijl
  // team B's eigen data nog onderweg is (race condition bij wisselen van team).
  useEffect(() => {
    if (!currentTeamId) { setLoadedTeamId(null); return; }
    publicSyncRef.current = '';
    managerFixturesSyncRef.current = '';
    const unsub = onSnapshot(doc(db, 'teams', currentTeamId, 'state', 'public'), snap => {
      const d = snap.data() || {};
      publicSyncRef.current = JSON.stringify({ players: d.players || [], sc: d.sc, fixtures: d.fixtures, match: d.match, standings: d.standings || [], standingsUpdatedAt: d.standingsUpdatedAt || null, noteCategories: d.noteCategories });
      managerFixturesSyncRef.current = JSON.stringify(d.fixtures || []);
      setPlayers(d.players || []);
      setSc(d.sc || { verdedigen: [], aanval: [] });
      setFixtures(d.fixtures || []);
      setMatch(d.match || BLANK_MATCH);
      setStandings(d.standings || []);
      setNoteCategories(d.noteCategories || DEFAULT_NOTE_CATEGORIES);
      setStandingsUpdatedAt(d.standingsUpdatedAt || null);
      setLoadedTeamId(currentTeamId);
    }, () => setLoadedTeamId(currentTeamId));
    return unsub;
  }, [currentTeamId]);

  useEffect(() => {
    if (loadedTeamId !== currentTeamId || readOnly || !currentTeamId) return;
    const blob = { players, sc, fixtures, match, standings, standingsUpdatedAt, noteCategories };
    const json = JSON.stringify(blob);
    if (json === publicSyncRef.current) return;
    publicSyncRef.current = json;
    setDoc(doc(db, 'teams', currentTeamId, 'state', 'public'), blob).catch(() => {});
  }, [loadedTeamId, readOnly, currentTeamId, players, sc, fixtures, match, standings, standingsUpdatedAt, noteCategories]);

  // Managers zijn geen coach (isMyTeam/readOnly geldt niet voor ze), dus de blob-sync
  // hierboven slaat voor hen over - maar ze mogen wél de Ouders-indeling (fixtures)
  // bewerken. Een aparte, veld-gerichte merge-write voor alleen fixtures voorkomt zowel dat
  // een manager per ongeluk een stale kopie van players/sc/match/standings terugschrijft, als
  // dat zo'n write de firestore.rules-eis (alleen 'fixtures' gewijzigd) zou schenden.
  useEffect(() => {
    if (isMyTeam || !canManageOuders || loadedTeamId !== currentTeamId || !currentTeamId) return;
    const json = JSON.stringify(fixtures);
    if (json === managerFixturesSyncRef.current) return;
    managerFixturesSyncRef.current = json;
    setDoc(doc(db, 'teams', currentTeamId, 'state', 'public'), { fixtures }, { merge: true }).catch(() => {});
  }, [isMyTeam, canManageOuders, loadedTeamId, currentTeamId, fixtures]);

  // Historie — alleen op te halen als je bij dit team hoort (of admin bent); anders leeg,
  // en er wordt geen leespoging gedaan (voorkomt permission-denied ruis). Zelfde
  // race-condition-bescherming als hierboven, via `historyLoadedTeamId`.
  useEffect(() => {
    historySyncRef.current = '';
    setHistoryLoadedTeamId(null);
    if (!currentTeamId || !canSeeHistory) { setHistory([]); return; }
    return onSnapshot(doc(db, 'teams', currentTeamId, 'state', 'history'), snap => {
      const entries = (snap.data() || {}).entries || [];
      historySyncRef.current = JSON.stringify(entries);
      setHistory(entries);
      setHistoryLoadedTeamId(currentTeamId);
    });
  }, [currentTeamId, canSeeHistory]);

  useEffect(() => {
    if (historyLoadedTeamId !== currentTeamId || !currentTeamId || !canSeeHistory) return;
    const json = JSON.stringify(history);
    if (json === historySyncRef.current) return;
    historySyncRef.current = json;
    setDoc(doc(db, 'teams', currentTeamId, 'state', 'history'), { entries: history }).catch(() => {});
  }, [historyLoadedTeamId, currentTeamId, canSeeHistory, history]);

  // Koppeling met de clubwebsite (LISA) voor het importeren van wedstrijden — zelfde
  // team-lidmaatschap-eis als historie, want dit bevat een auth-sleutel van de clubsite.
  useEffect(() => {
    setLisaConfig(null);
    setLisaEditing(false);
    setLisaTeamOptions(null);
    if (!currentTeamId || !canSeeHistory) return;
    return onSnapshot(doc(db, 'teams', currentTeamId, 'config', 'lisa'), snap => {
      const d = snap.data() || null;
      setLisaConfig(d);
      setLisaForm(d
        ? { clubDudaId: d.clubDudaId || '', teamId: d.teamId || '', teamName: d.teamName || '', authHeader: d.authHeader || '' }
        : { clubDudaId: '', teamId: '', teamName: '', authHeader: '' });
    });
  }, [currentTeamId, canSeeHistory]);

  // Alle gebruikers, om per team te tonen wie er als coach aan gekoppeld is - alleen
  // beheerders mogen andermans users/{uid} lezen (zie firestore.rules).
  useEffect(() => {
    if (!isAdmin) { setAllUsers([]); return; }
    return onSnapshot(collection(db, 'users'), snap => {
      setAllUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    });
  }, [isAdmin]);

  // Backward compat, zelfde als in AuthContext.jsx: een gebruikersdoc dat nog niet door de
  // huidige addCoachToTeam is aangeraakt, heeft nog het oude losse teamId/role-veld i.p.v. de
  // teams-kaart - hier zowel gebruikt voor de coach/manager-lijst per team als Inlogpogingen.
  const teamsOf = u => {
    const teams = u.teams || {};
    if (Object.keys(teams).length || !u.teamId || !u.role || u.role === 'admin') return teams;
    return { [u.teamId]: u.role };
  };

  // Maakt (indien nodig) het account aan via een Cloud Function - dat vereist Admin-
  // rechten, want de client-SDK kan alleen de eigen ingelogde gebruiker aanmaken/wijzigen,
  // niet een account voor een ander e-mailadres zonder de beheerder zelf uit te loggen.
  // Zolang het account nog geen wachtwoord heeft sturen we daarna zelf de wachtwoord-instel-
  // mail - ook als het account al bestond (bv. een eerdere poging waarbij het aanmaken wél
  // lukte maar de mail toen niet aankwam) - dat is een gewone publieke Firebase Auth-aanroep,
  // geen extra infrastructuur nodig.
  async function addCoach(teamId) {
    const email = (coachEmailByTeam[teamId] || '').trim();
    if (!email) { setCoachErrorByTeam(m => ({ ...m, [teamId]: 'Vul een e-mailadres in.' })); return; }
    setCoachBusyByTeam(m => ({ ...m, [teamId]: true }));
    setCoachErrorByTeam(m => ({ ...m, [teamId]: '' }));
    try {
      const call = httpsCallable(functions, 'addCoachToTeam');
      const role = coachRoleByTeam[teamId] || 'coach';
      const res = await call({ email, teamId, role });
      if (res.data && !res.data.hasPassword) {
        await sendPasswordResetEmail(auth, email);
      }
      setCoachEmailByTeam(m => ({ ...m, [teamId]: '' }));
    } catch (e) {
      setCoachErrorByTeam(m => ({ ...m, [teamId]: e.message || 'Toevoegen mislukt.' }));
    } finally {
      setCoachBusyByTeam(m => ({ ...m, [teamId]: false }));
    }
  }

  // Loskoppelen is een gewone Firestore-write (geen nieuw account, geen Auth-actie nodig),
  // dus dat kan direct vanuit de client - beheerders mogen users/{uid} schrijven. Verwijdert
  // alleen dit ene team uit de teams-kaart (iemand kan aan meerdere teams gekoppeld zijn); een
  // niet-gemigreerd account (nog met het oude losse teamId/role-veld) wordt hier meteen
  // meegenomen naar de nieuwe vorm i.p.v. per ongeluk gekoppeld te blijven via dat oude veld.
  async function unlinkCoach(uid, teamId) {
    setCoachErrorByTeam(m => ({ ...m, [teamId]: '' }));
    try {
      const u = allUsers.find(x => x.uid === uid) || {};
      const patch = { [`teams.${teamId}`]: deleteField() };
      if (u.teamId === teamId && u.role !== 'admin') {
        patch.teamId = deleteField();
        patch.role = deleteField();
      }
      await setDoc(doc(db, 'users', uid), patch, { merge: true });
    } catch (e) {
      setCoachErrorByTeam(m => ({ ...m, [teamId]: e.message || 'Loskoppelen mislukt.' }));
    }
  }

  async function fetchLisaTeams() {
    const clubDudaId = lisaForm.clubDudaId.trim();
    const authHeader = lisaForm.authHeader.trim();
    if (!clubDudaId || !authHeader) { setLisaError('Vul club-id en autorisatie-header in.'); return; }
    setLisaTeamsBusy(true);
    setLisaError('');
    try {
      const url = `https://api.lisahockey.nl/v1/duda/${clubDudaId}/teams`;
      const res = await fetch(url, { headers: { authorization: authHeader, accept: '*/*' } });
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      const options = (data.teams || [])
        .map(t => ({ id: t.data.id, name: t.data.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!options.length) { setLisaError('Geen teams gevonden voor dit club-id.'); return; }
      setLisaTeamOptions(options);
    } catch (e) {
      setLisaError('Teams ophalen mislukt — controleer club-id en autorisatie-header.');
    } finally {
      setLisaTeamsBusy(false);
    }
  }

  async function saveLisaConfig() {
    if (readOnly || !currentTeamId) return;
    setLisaError('');
    const cfg = {
      clubDudaId: lisaForm.clubDudaId.trim(),
      teamId: lisaForm.teamId.trim(),
      teamName: lisaForm.teamName.trim(),
      authHeader: lisaForm.authHeader.trim(),
    };
    if (!cfg.clubDudaId || !cfg.teamId || !cfg.authHeader) { setLisaError('Vul club-id, autorisatie-header en team in.'); return; }
    try { await setDoc(doc(db, 'teams', currentTeamId, 'config', 'lisa'), cfg); setLisaEditing(false); setLisaTeamOptions(null); }
    catch (e) { setLisaError('Opslaan mislukt.'); }
  }

  async function importLisaMatches() {
    if (readOnly || !lisaConfig) return;
    setLisaBusy(true);
    setLisaError('');
    try {
      const url = `https://api.lisahockey.nl/v1/duda/${lisaConfig.clubDudaId}/teams/${lisaConfig.teamId}/matches_upcoming_round`;
      const res = await fetch(url, { headers: { authorization: lisaConfig.authHeader, accept: '*/*' } });
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      const rows = (data.matches_upcoming_round || [])
        .filter(m => m.is_selected_team)
        .map(m => {
          const [d, mo, y] = (m.date || '').split('-');
          return {
            id: 'lisa' + y + mo + d + '_' + Date.now() + Math.random().toString(36).slice(2, 6),
            date: (y && mo && d) ? `${y}-${mo}-${d}` : '',
            time: m.time || '',
            opponent: m.home_team_is_current ? m.away_team_name : m.home_team_name,
            home: !!m.home_team_is_current,
            friendly: false,
            competitie: competitionShortName,
          };
        });
      if (!rows.length) { setLisaError('Geen wedstrijden gevonden.'); return; }
      setFixtures(fs => {
        const idxByKey = {};
        fs.forEach((f, i) => { idxByKey[f.date + '|' + f.opponent] = i; });
        const next = fs.slice();
        const added = [];
        rows.forEach(r => {
          const idx = idxByKey[r.date + '|' + r.opponent];
          if (idx == null) { added.push(r); return; }
          const existing = next[idx];
          if (existing.time !== r.time || existing.home !== r.home || existing.competitie !== r.competitie) {
            next[idx] = { ...existing, time: r.time, home: r.home, competitie: r.competitie };
          }
        });
        return next.concat(added);
      });
    } catch (e) {
      setLisaError('Importeren mislukt — controleer de koppeling (mogelijk verlopen sleutel).');
    } finally {
      setLisaBusy(false);
    }
  }

  // Standen komen van dezelfde LISA-koppeling als de wedstrijd-import, maar worden
  // gecached in het publieke teamdocument (hierboven) zodat ook uitgelogde bezoekers
  // ze kunnen zien zonder de auth-sleutel van de clubsite bloot te geven.
  // Iedereen mag verversen - de Cloud Function doet de LISA-aanroep server-side (de
  // auth-sleutel in teams/{teamId}/config/lisa is alleen leesbaar voor teamleden) en
  // schrijft alleen de standen terug; het resultaat komt via de bestaande onSnapshot op
  // state/public vanzelf binnen, dus hier hoeft niets lokaal te worden bijgewerkt.
  async function refreshStandings() {
    if (!currentTeamId) return;
    setStandingsBusy(true);
    setStandingsError('');
    try {
      const call = httpsCallable(functions, 'refreshTeamStandings');
      await call({ teamId: currentTeamId });
    } catch (e) {
      setStandingsError(e.message || 'Stand ophalen mislukt.');
    } finally {
      setStandingsBusy(false);
    }
  }

  useEffect(() => {
    try { window.localStorage.setItem('hockeyschema.matchMode', matchMode ? '1' : '0'); } catch { /* localStorage niet beschikbaar */ }
  }, [matchMode]);

  // Esc sluit het bovenste open dialoogje - één centrale listener i.p.v. er eentje per dialoog,
  // zodat elk nieuw dialoogje dit gratis meekrijgt. Volgorde maakt in de praktijk niet uit (er
  // staat normaal maar één dialoog tegelijk open), maar staat hier van "meest recent toegevoegd"
  // naar oud zodat een nieuw dialoog dat per ongeluk over een ander dialoog heen zou vallen wint.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (noteEditor) { setNoteEditor(null); return; }
      if (relocating) { setRelocating(null); return; }
      if (editing) { setEditing(null); return; }
      if (printDialogOpen) { setPrintDialogOpen(false); return; }
      if (addFixtureOpen) { setAddFixtureOpen(false); return; }
      if (scorerPicker) { setScorerPicker(false); setScorerSelected(null); setGoalRemark(''); return; }
      if (themGoalDialog) { setThemGoalDialog(false); return; }
      if (commentDialog) { setCommentDialog(false); setCommentText(''); return; }
      if (editEntryIdx != null) { setEditEntryIdx(null); return; }
      if (endMatchConfirm) { setEndMatchConfirm(false); return; }
      if (moreMenuOpen) { setMoreMenuOpen(false); return; }
      // Extra vangnet: de browser zou Esc al zelf moeten afhandelen zolang je in volledig scherm
      // zit, maar dat bleek niet altijd te gebeuren - dus hier expliciet ook nog geprobeerd.
      if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [noteEditor, relocating, editing, printDialogOpen, addFixtureOpen, scorerPicker, themGoalDialog, commentDialog, editEntryIdx, endMatchConfirm, moreMenuOpen]);

  // Klikken buiten het "Meer"-afrolmenu sluit het - net als bij een gewone <select>, geen tweede
  // klik nodig om 'm daarna weer te kunnen openen.
  useEffect(() => {
    if (!moreMenuOpen) return;
    function onDocClick(e) {
      if (desktopMoreMenuRef.current && desktopMoreMenuRef.current.contains(e.target)) return;
      if (mobileMoreMenuRef.current && mobileMoreMenuRef.current.contains(e.target)) return;
      setMoreMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [moreMenuOpen]);

  function fmtTimer(ms) {
    const total = Math.ceil(ms / 1000);
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return mm + ':' + String(ss).padStart(2, '0');
  }

  // Zelfde als fmtTimer, maar met voorloopnul op de minuten - nodig als waarde voor het
  // <input type="time">-veld hieronder, dat een genormaliseerde "MM:SS" verwacht.
  function fmtTimerPadded(ms) {
    const total = Math.ceil(ms / 1000);
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  }

  // Eenmalige migratie: zodra de eerste admin inlogt en er nog geen teams bestaan, wordt het
  // bestaande team (HCRB MO18-2) aangemaakt met wat er nu nog in localStorage staat.
  useEffect(() => {
    if (!isAdmin || !teamsLoaded || teams.length || migratedRef.current) return;
    migratedRef.current = true;
    (async () => {
      try {
        const id = 'hcrb-mo18-2';
        if ((await getDoc(doc(db, 'teams', id))).exists()) return;
        let seed = { players: DEFAULT_PLAYERS, sc: DEFAULT_SC, fixtures: DEFAULT_FIXTURES, match: BLANK_MATCH, noteCategories: DEFAULT_NOTE_CATEGORIES };
        let seedHistory = DEFAULT_HISTORY;
        const raw = window.localStorage.getItem(KEY);
        if (raw) {
          const d = JSON.parse(raw);
          seed = {
            players: d.players || DEFAULT_PLAYERS, sc: d.sc || DEFAULT_SC,
            fixtures: d.fixtures || DEFAULT_FIXTURES, match: d.match || BLANK_MATCH,
            noteCategories: d.noteCategories || DEFAULT_NOTE_CATEGORIES
          };
          seedHistory = d.history || DEFAULT_HISTORY;
        }
        await setDoc(doc(db, 'teams', id), { name: OWN_TEAM, createdAt: new Date().toISOString() });
        await setDoc(doc(db, 'teams', id, 'state', 'public'), seed);
        await setDoc(doc(db, 'teams', id, 'state', 'history'), { entries: seedHistory });
      } catch (e) { /* migratie mislukt — team blijft leeg, kan later opnieuw via Teams-tab */ }
    })();
  }, [isAdmin, teamsLoaded, teams.length]);

  // Als de selectie een vaste keeper bevat (aangevinkt bij Team) en er nog geen keeper is
  // gekozen voor deze wedstrijd, vul die dan automatisch in bij Stap 2 — scheelt een handmatige
  // stap bij elke wedstrijd. Een al gekozen keeper wordt nooit overschreven.
  useEffect(() => {
    if (readOnly || match.locked || match.keeperId) return;
    const sel = match.selected || [];
    const fixed = players.find(p => p.fixedKeeper && sel.indexOf(p.id) >= 0);
    if (fixed) setMatch(m => (m.keeperId ? m : { ...m, keeperId: fixed.id }));
  }, [match.selected, match.keeperId, match.locked, players, readOnly]);

  const patchMatch = obj => { if (readOnly) return; setMatch(m => ({ ...m, ...obj })); };
  const byId = id => players.find(p => p.id === id);
  const nameOf = id => { const p = byId(id); return p ? displayFirst(p) : '—'; };
  // Notities zonder playerId zijn team-brede notities (geen specifieke speelster).
  const noteSubjectName = n => n.playerId ? nameOf(n.playerId) : 'Team';
  // Categorie is niet verplicht (een toelichting-alleen mag ook) - zonder categorie valt de
  // ": "-scheiding tussen categorie en toelichting weg, anders zou dat een kaal ": tekst" geven.
  const noteSummary = n => {
    const val = n.valence === '+' ? '+ ' : '– ';
    return n.categoryLabel ? val + n.categoryLabel + (n.text ? ': ' + n.text : '') : val + (n.text || '');
  };
  const selectedPlayers = () => {
    const sel = match.selected || [];
    return players.filter(p => sel.indexOf(p.id) >= 0);
  };

  function applyInjury() {
    if (readOnly || !injPlayer) return;
    const fromQ = Number(injFrom) || 1;
    const fromHalf = (fromQ - 1) * 2;
    const inj = { ...match.injuries, [injPlayer]: fromHalf };
    const newMatch = { ...match, injuries: inj };
    const sched = buildSchedule(newMatch, players, fromHalf);
    setMatch({ ...newMatch, schedule: sched || match.schedule });
    setInjPlayer('');
  }

  function clearInjury(id) {
    if (readOnly) return;
    const inj = { ...match.injuries };
    const from = inj[id];
    delete inj[id];
    const newMatch = { ...match, injuries: inj };
    const sched = buildSchedule(newMatch, players, from || 0);
    setMatch({ ...newMatch, schedule: sched || match.schedule });
  }

  // Notitie-vorm: { id, playerId, group, categoryId, categoryLabel, valence, text, quarter, half, createdAt }.
  // categoryLabel wordt bewust mee-opgeslagen (snapshot) zodat een latere hernoeming/verwijdering
  // van de categorie oude aantekeningen niet corrumpeert.
  function openNoteEditor(playerId, quarter, half) {
    if (readOnly) return;
    setNoteEditor({ id: null, playerId, quarter, half, group: NOTE_GROUPS[0].key, categoryId: '', valence: '-', text: '' });
  }

  // Team-brede notitie: playerId null, geen kwart uit een geklikte cel af te leiden - daarom
  // krijgt de dialoog voor dit geval een eigen kwart-keuze (zie noteDialog.quarterTabs hieronder).
  // startQuarter is het kwart waarmee de kwart-keuze opent - vanuit wedstrijdmodus is dat het
  // kwart dat nu live loopt (liveQuarter), vanuit het gewone wedstrijdschema gewoon kwart 1.
  function openTeamNoteEditor(startQuarter) {
    if (readOnly) return;
    setNoteEditor({ id: null, playerId: null, quarter: startQuarter || 0, half: 0, group: NOTE_GROUPS[0].key, categoryId: '', valence: '-', text: '' });
  }

  // Een bestaande notitie openen om te wijzigen - vult de dialoog met de opgeslagen waarden en
  // onthoudt het id, zodat "Opslaan" hem bijwerkt in plaats van een nieuwe aan te maken.
  function openNoteEditorForEdit(n) {
    if (readOnly) return;
    setNoteEditor({
      id: n.id, playerId: n.playerId, quarter: n.quarter, half: n.half,
      group: n.group || NOTE_GROUPS[0].key, categoryId: n.categoryId || '', valence: n.valence, text: n.text || ''
    });
  }

  function saveNote() {
    if (readOnly || !noteEditor) return;
    const text = (noteEditor.text || '').trim();
    // Een categorie kiezen is niet strikt verplicht - een toelichting alleen (bv. een algemene
    // opmerking die niet in één categorie past) is ook een geldige notitie. Is er wél een
    // categorie gekozen, dan wordt die (net als de rest) toegepast.
    const cat = noteEditor.categoryId ? (noteCategories[noteEditor.group] || []).find(c => c.id === noteEditor.categoryId) : null;
    if (!cat && !text) return;
    const fields = {
      playerId: noteEditor.playerId, group: cat ? noteEditor.group : '', categoryId: cat ? cat.id : '', categoryLabel: cat ? cat.label : '',
      valence: noteEditor.valence, text, quarter: noteEditor.quarter, half: noteEditor.half
    };
    if (noteEditor.id) {
      setMatch(mm => ({ ...mm, notes: (mm.notes || []).map(n => n.id === noteEditor.id ? { ...n, ...fields } : n) }));
    } else {
      const entry = { id: 'note' + Date.now() + Math.random().toString(36).slice(2, 6), createdAt: Date.now(), ...fields };
      setMatch(mm => ({ ...mm, notes: (mm.notes || []).concat([entry]) }));
    }
    setNoteEditor(null);
  }

  function removeNote(id) {
    if (readOnly) return;
    setMatch(mm => ({ ...mm, notes: (mm.notes || []).filter(n => n.id !== id) }));
  }

  function applySwap(b, pos, newId) {
    if (readOnly) return;
    const sched = (match.schedule || []).map(x => ({ on: { ...x.on }, bench: x.bench.slice() }));
    const blk = sched[b];
    if (!blk) return;
    const oldId = blk.on[pos];
    const fromPos = Object.keys(blk.on).find(k => blk.on[k] === newId);
    if (fromPos) {
      blk.on[fromPos] = oldId;
      blk.on[pos] = newId;
    } else {
      blk.on[pos] = newId;
      blk.bench = blk.bench.filter(x => x !== newId).concat(oldId ? [oldId] : []);
    }
    const q = Math.floor(b / 2);
    const benched = oldId && !playsInQuarter(sched, q, oldId);
    setEditing(null);
    setRelocating(benched ? { q, id: oldId } : null);
    setMatch(m => ({ ...m, schedule: sched, edited: true }));
  }

  function generate() {
    if (readOnly) return;
    if (!match.keeperId) { window.alert('Kies eerst een keeper.'); return; }
    const sched = buildSchedule(match, players, 0);
    if (!sched) { window.alert('Selecteer minimaal 7 speelsters (keeper + 6 veldspeelsters).'); return; }
    setMatch(m => ({ ...m, schedule: sched, scheduleSelected: (m.selected || []).slice() }));
  }

  function saveMatch() {
    if (readOnly || !match.schedule) return;
    const fx = fixtures.find(f => f.id === match.fixtureId);
    const entry = {
      id: 'm' + Date.now(),
      date: match.date || new Date().toISOString().slice(0, 10),
      opponent: match.opponent || 'Onbekend',
      keeperId: match.keeperId,
      keeperIds: [match.keeperId, match.keeper2Id].filter(Boolean),
      gf: fx ? fx.gf : '', ga: fx ? fx.ga : '',
      home: fx ? !!fx.home : true,
      friendly: fx ? !!fx.friendly : false,
      halves: halvesPlayed(match.schedule),
      notes: match.notes || []
    };
    setHistory(h => {
      const idx = h.findIndex(x => x.date === entry.date && x.opponent === entry.opponent);
      return idx >= 0 ? h.map((x, i) => i === idx ? entry : x) : [entry, ...h];
    });
    if (match.fixtureId) {
      setFixtures(fs => fs.map(f => f.id === match.fixtureId ? { ...f, savedMatch: { ...match, locked: true }, locked: true } : f));
    }
    setMatch(m => ({ ...m, locked: true }));
  }

  const reopenMatch = () => patchMatch({ locked: false });

  function loadFixture(f) {
    if (readOnly) return;
    setTab('wedstrijd');
    if (f.savedMatch) {
      setMatch({ ...f.savedMatch, fixtureId: f.id, opponent: f.opponent, date: f.date });
    } else {
      setMatch({
        fixtureId: f.id, opponent: f.opponent, date: f.date,
        selected: [], keeperId: '', keeper2Id: '', keeperSwitches: false, keepersPlayOut: false,
        schedule: null, injuries: {}, locked: false, notes: []
      });
    }
  }

  function addPlayer() {
    if (readOnly) return;
    const n = (newName || '').trim();
    if (!n) return;
    const parts = n.split(' ');
    setPlayers(ps => ps.concat([{ id: 'p' + Date.now(), first: parts[0], last: parts.slice(1).join(' '), level: 3, sub: !!newIsSub, prefs: {} }]));
    setNewName('');
    setNewIsSub(false);
  }

  function openAddFixture() {
    if (readOnly) return;
    setAddFixtureForm({ date: '', time: '', opponent: '', home: true });
    setAddFixtureError('');
    setAddFixtureOpen(true);
  }

  // Handmatig toegevoegde wedstrijden zijn altijd oefenwedstrijden - een echte competitie-
  // wedstrijd komt binnen via de LISA-import (die zet friendly:false en de korte
  // competitienaam, zie importLisaMatches), dus hier is geen keuze meer nodig.
  function saveNewFixture() {
    if (readOnly) return;
    const f = addFixtureForm;
    if (!f.date || !f.opponent.trim()) { setAddFixtureError('Vul in elk geval datum en tegenstander in.'); return; }
    setFixtures(fs => fs.concat([{
      id: 'f' + Date.now(), date: f.date, time: f.time, opponent: f.opponent.trim(), home: f.home, friendly: true
    }]));
    setAddFixtureOpen(false);
  }

  function doPrint() {
    try { window.print(); }
    catch (e) { window.alert('Printen lukt hier niet — gebruik het browsermenu (Ctrl/Cmd+P).'); }
  }

  // ---- derived values (mirrors the original renderVals) ----
  const m = match;
  const ownTeamName = (teams.find(t => t.id === currentTeamId) || {}).name || OWN_TEAM;
  // Teams-tab directory: admin ziet alles, een coach alleen zijn eigen team(s), een niet-
  // ingelogde bezoeker geen enkel team - "je ziet alleen teams waar je bij hoort".
  const visibleTeams = isAdmin ? teams : teams.filter(t => myTeams && myTeams[t.id]);
  // Wedstrijdschema, Strafcorner, Historie, Afspraken en Teams zijn alleen zinvol voor wie
  // ingelogd is (de inhoud erachter is toch afgeschermd tot het eigen team / adminrechten) -
  // een anonieme bezoeker krijgt deze items daarom niet eens in het menu te zien. Ouders is
  // bewust wél voor iedereen zichtbaar (ook uitgelogd) - dat is juist waar ouders zonder
  // account kunnen zien wie de pauzehap heeft en wie er rijdt.
  const LOGGED_IN_ONLY_TABS = ['wedstrijd', 'sc', 'notities', 'historie', 'afspraken', 'teams'];
  // Iemand die voor het bekeken team geen coach (of admin) is - bv. manager van dit team,
  // coach/manager van een ánder team dat nu even niet bekeken wordt, of nergens aan gekoppeld -
  // krijgt dezelfde tabs te zien als een uitgelogde bezoeker (Programma, Standen, Team, Ouders).
  // Teams blijft daarbij wél zichtbaar (los van limitedNav, zie de filter hieronder), zodat hij
  // altijd naar een team kan wisselen waar hij wél coach/manager van is. Bij Ouders heeft een
  // manager via canManageOuders nog daadwerkelijk bewerkrechten, de rest zou toch alleen de
  // accessGate tonen.
  const limitedNav = !!user && !isMyTeam;
  const tabs = [
    ['programma', 'Programma'], ['verslagen', 'Wedstrijdverslagen'], ['standen', 'Standen'], ['wedstrijd', 'Wedstrijdschema'], ['team', 'Team'], ['ouders', 'Ouders'], ['sc', 'Strafcorner'],
    ['notities', 'Notities'], ['historie', 'Historie'], ['afspraken', 'Afspraken'], ['teams', 'Teams'],
    // Live: verschijnt voor IEDEREEN die dit team heeft geselecteerd (ook uitgelogd) zodra de
    // coach "Start wedstrijd" heeft aangevinkt - staat daarom niet in LOGGED_IN_ONLY_TABS en komt
    // hier al kant-en-klaar door de filter hieronder.
    ...(m.liveOpened ? [['live', 'Live']] : []),
    ...(isAdmin ? [['inlog', 'Inlogpogingen']] : []),
  ].filter(t => t[0] === 'teams' ? !!user : ((user && !limitedNav) || !LOGGED_IN_ONLY_TABS.includes(t[0]))).map(t => ({
    key: t[0], label: t[1], go: () => setTab(t[0]),
    style: 'background:none;border:none;padding:4px 0 6px;cursor:pointer;font-family:var(--font-heading);font-size:18px;letter-spacing:0.01em;'
      + (t[0] === 'live'
        ? 'color:#c23b3b;font-weight:700;' + (tab === t[0] ? 'border-bottom:3px solid #c23b3b' : 'border-bottom:3px solid transparent')
        : (tab === t[0]
          ? 'color:var(--color-text);border-bottom:3px solid var(--color-accent);font-weight:600'
          : 'color:var(--color-neutral-700);border-bottom:3px solid transparent;font-weight:400'))
  }));

  // Twee losse navigatie-indelingen - welke ervan zichtbaar is, bepaalt puur CSS (zie
  // .nav-desktop/.nav-mobile in index.css), niet React-state, want de gebruiker wil bewust een
  // écht andere indeling per schermbreedte i.p.v. één indeling die overal hetzelfde is.
  //
  // Desktop: ongewijzigd t.o.v. voor het "Meer"-menu - een coach krijgt de minst gebruikte
  // tabbladen achter "Meer" (aan het eind), een niet-coach ziet gewoon de platte lijst.
  const COACH_MORE_KEYS = ['verslagen', 'sc', 'notities', 'historie', 'afspraken', 'teams'];
  const desktopPrimaryTabs = isMyTeam ? tabs.filter(t => !COACH_MORE_KEYS.includes(t.key)) : tabs;
  const desktopMoreTabs = isMyTeam ? tabs.filter(t => COACH_MORE_KEYS.includes(t.key)) : [];
  const desktopMoreMenuActive = desktopMoreTabs.some(t => t.key === tab);
  //
  // Mobiel: alleen Programma en Standen blijven los zichtbaar, alle overige tabbladen (ook
  // Wedstrijdschema/Team/Ouders/Live, die op desktop wél los staan) gaan achter "Meer" - geldt
  // voor iedereen, ook de kortere navigatie voor ouders/uitgelogde bezoekers.
  const MOBILE_PRIMARY_KEYS = ['programma', 'standen'];
  const mobilePrimaryTabs = tabs.filter(t => MOBILE_PRIMARY_KEYS.includes(t.key));
  const mobileMoreTabs = tabs.filter(t => !MOBILE_PRIMARY_KEYS.includes(t.key));
  const mobileMoreMenuActive = mobileMoreTabs.some(t => t.key === tab);

  // Gedeeld door de desktop- en mobiele navigatie hieronder - scheelt dat de "Meer"-dialoog twee
  // keer moet worden uitgeschreven. Beide varianten delen ook dezelfde moreMenuOpen-state (er is
  // toch maar één van de twee tegelijk zichtbaar, dus dat kan geen kwaad).
  const moreMenuButton = (items, active, refObj) => {
    if (!items.length) return false;
    // "Live" verdwijnt in de lijst achter Meer zonder z'n gebruikelijke rode, opvallende styling
    // (die anders altijd meldt dat er nu een wedstrijd bezig is) - de Meer-knop zelf licht daarom
    // rood op zolang dat item erin zit, ongeacht welk tabblad je op dat moment bekijkt.
    const hasLive = items.some(t => t.key === 'live');
    return (
      <div ref={refObj} style={css('position:relative;flex:0 0 auto')}>
        <button type="button" onClick={() => setMoreMenuOpen(v => !v)}
          style={css('background:none;border:none;padding:4px 0 6px;cursor:pointer;font-family:var(--font-heading);font-size:18px;letter-spacing:0.01em;'
            + (hasLive
              ? 'color:#c23b3b;font-weight:700;' + (active ? 'border-bottom:3px solid #c23b3b' : 'border-bottom:3px solid transparent')
              : (active ? 'color:var(--color-text);border-bottom:3px solid var(--color-accent);font-weight:600' : 'color:var(--color-neutral-700);border-bottom:3px solid transparent;font-weight:400')))}>
          Meer {moreMenuOpen ? '▴' : '▾'}
        </button>
        {moreMenuOpen && (
          <div style={css('position:absolute;top:100%;left:0;margin-top:4px;min-width:180px;background:var(--color-surface);border-radius:var(--radius-md);box-shadow:var(--shadow-lg);padding:6px;display:flex;flex-direction:column;z-index:40')}>
            {items.map(t => (
              <button key={t.key} type="button" onClick={() => { t.go(); setMoreMenuOpen(false); }}
                style={css('text-align:left;background:none;border:none;padding:8px 10px;border-radius:var(--radius-md);cursor:pointer;font-family:var(--font-body);font-size:15px;white-space:nowrap;'
                  + (t.key === 'live' ? 'color:#c23b3b;font-weight:700;' : (tab === t.key ? 'color:var(--color-text);font-weight:600;background:var(--color-neutral-100)' : 'color:var(--color-neutral-700);font-weight:400')))}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const sel = m.selected || [];
  const selectionChips = players.map(p => {
    const on = sel.indexOf(p.id) >= 0;
    const isK = m.keeperId === p.id;
    return {
      key: p.id,
      label: isK ? displayFirst(p) + ' · keep' : displayFirst(p),
      toggle: () => {
        const next = on ? sel.filter(x => x !== p.id) : sel.concat([p.id]);
        patchMatch({ selected: next, keeperId: on && isK ? '' : m.keeperId });
      },
      style: 'cursor:pointer;white-space:nowrap;font-family:var(--font-body);font-size:16px;padding:5px 12px;border-radius:var(--radius-md);'
        + (isK
          ? 'background:var(--color-accent-2-700);color:#fff;border:1px solid var(--color-accent-2-700)'
          : on
            ? 'background:var(--color-accent-700);color:#fff;border:1px solid var(--color-accent-700)'
            : 'background:transparent;color:var(--color-neutral-700);border:1px solid var(--color-neutral-400)')
    };
  });

  const nSel = sel.length;
  const keeperOptions = players.filter(p => sel.indexOf(p.id) >= 0).map(p => ({ id: p.id, label: p.first + ' ' + p.last }));

  const keeperIdsOf = h => (h.keeperIds && h.keeperIds.length ? h.keeperIds : [h.keeperId]).filter(Boolean);
  const keeps = {};
  history.forEach(h => keeperIdsOf(h).forEach(id => { keeps[id] = (keeps[id] || 0) + 1; }));
  const never = players.filter(p => !keeps[p.id]).map(p => displayFirst(p));
  const keeperHint = history.length
    ? 'Keeprotatie tot nu toe: ' + players.filter(p => keeps[p.id]).map(p => displayFirst(p) + ' (' + keeps[p.id] + '×)').join(', ')
      + (never.length ? ' — nog nooit gekeept: ' + never.join(', ') + '.' : '')
    : 'Nog geen wedstrijden opgeslagen, dus nog geen keeprotatie bekend.';

  const sched = m.schedule;
  const keeperAt = i => (m.keeper2Id && i >= 4) ? m.keeper2Id : m.keeperId;
  const ids = blk => Object.keys(blk.on).map(k => blk.on[k]);
  const nm = arr => arr.map(x => nameOf(x)).join(', ');
  const cumBy = [];
  const cumRun = {};
  (sched || []).forEach((blk, i) => {
    ids(blk).forEach(id => { cumRun[id] = (cumRun[id] || 0) + 1; });
    cumBy[i] = { ...cumRun };
  });
  const nmSub = (arrIds, blockIdx) => arrIds.map(id => nameOf(id) + supNum((blockIdx >= 0 && cumBy[blockIdx] && cumBy[blockIdx][id]) || 0)).join(', ');
  const orderBench = (benchIds, prevBlockIdx) => {
    const posOf = id => {
      if (prevBlockIdx < 0 || !sched[prevBlockIdx]) return -1;
      const k = Object.keys(sched[prevBlockIdx].on).find(kk => sched[prevBlockIdx].on[kk] === id);
      return k ? GRID_ORDER.indexOf(k) : -1;
    };
    return benchIds.slice().sort((x, y) => {
      const px = posOf(x), py = posOf(y);
      if (px === -1 && py === -1) return 0;
      if (px === -1) return 1;
      if (py === -1) return -1;
      return px - py;
    });
  };

  const halves = [0, 1, 2, 3].filter(q => sched && sched[2 * q + 1]).map(q => {
    const a = sched[2 * q], b = sched[2 * q + 1];
    const prevBlk = q > 0 ? sched[2 * q - 1] : null;
    const aIds = ids(a), bIds = ids(b);
    const prevIds = prevBlk ? ids(prevBlk) : [];
    const inStart = prevBlk ? aIds.filter(x => prevIds.indexOf(x) < 0) : [];
    const outStart = prevBlk ? prevIds.filter(x => aIds.indexOf(x) < 0) : [];
    const fmt = v => Math.floor(v) + ':' + String(Math.round((v % 1) * 60)).padStart(2, '0');
    const posOfPrev = {}, posOfA = {}, posOfB = {};
    if (prevBlk) Object.keys(prevBlk.on).forEach(k => { posOfPrev[prevBlk.on[k]] = k; });
    Object.keys(a.on).forEach(k => { posOfA[a.on[k]] = k; });
    Object.keys(b.on).forEach(k => { posOfB[b.on[k]] = k; });
    const movers = Object.keys(a.on).filter(k => a.on[k] && posOfB[a.on[k]] && posOfB[a.on[k]] !== k).map(k => a.on[k]);
    const rows = LINES.map((line, li) => ({
      key: li,
      cells: line.map(k => {
        const pa = a.on[k], pb = b.on[k];
        const swap = pa !== pb;
        const goesOff = pa && !posOfB[pa];
        const moves = pa && posOfB[pa] && posOfB[pa] !== k;
        const arrivesFromBench = pb && !posOfA[pb];
        const startedNew = pa && prevBlk && !posOfPrev[pa];
        const startedMoved = pa && prevBlk && posOfPrev[pa] && posOfPrev[pa] !== k;
        const playedA = pa && ids(a).indexOf(pa) >= 0;
        const playedB = pa && ids(b).indexOf(pa) >= 0;
        const subA = pa ? ((playedA && playedB) ? cumBy[2 * q + 1][pa] : cumBy[2 * q][pa]) || 0 : 0;
        const pbPlayedA = pb && ids(a).indexOf(pb) >= 0;
        const subB = pb ? ((pbPlayedA && ids(b).indexOf(pb) >= 0) ? cumBy[2 * q + 1][pb] : cumBy[2 * q + 1][pb]) || 0 : 0;
        // Badge telt ALLE notities van deze speler in de hele wedstrijd, niet alleen dit kwart -
        // zo blijft zichtbaar dat er iets over haar genoteerd staat in elk kwart waarin ze speelt.
        const badgeFor = pid => {
          const ns = pid ? (m.notes || []).filter(n => n.playerId === pid) : [];
          return ns.length ? { count: ns.length, hasNeg: ns.some(n => n.valence === '-') } : null;
        };
        return {
          key: k,
          pos: PMAP[k].label,
          nameA: (pa ? nameOf(pa) + supNum(subA) : '—') + (goesOff ? ' ◂' : moves ? ' ⇄' : ''),
          nameB: swap ? (pb ? nameOf(pb) + supNum(subB) : '—') + (arrivesFromBench ? ' ▸' : ' ⇄') : '',
          onEdit: readOnly ? undefined : () => { setEditing({ q, half: 0, pos: k }); setRelocating(null); },
          onEditB: readOnly ? undefined : () => { setEditing({ q, half: 1, pos: k }); setRelocating(null); },
          onNote: (readOnly || !pa) ? undefined : () => openNoteEditor(pa, q, 0),
          noteBadge: badgeFor(pa),
          onNoteB: (readOnly || !swap || !pb) ? undefined : () => openNoteEditor(pb, q, 1),
          noteBadgeB: swap ? badgeFor(pb) : null,
          style: CELL + 'cursor:pointer;border:1px solid transparent;'
            + (startedNew ? 'background:' + C_IN_BG : startedMoved ? 'background:' + C_MOVE_BG : 'background:var(--color-neutral-200)'),
          nameAStyle: 'font-size:16px;line-height:1.2;font-weight:500;'
            + (goesOff ? 'color:' + C_OUT : moves ? 'color:' + C_MOVE : 'color:var(--color-text)'),
          subStyle: swap
            ? 'margin-top:4px;padding-top:4px;border-top:1px solid var(--color-neutral-400);font-size:16px;line-height:1.2;font-weight:500;color:'
              + (arrivesFromBench ? C_IN : C_MOVE)
            : 'display:none'
        };
      })
    })).concat([{
      key: 'keep',
      cells: [{
        key: 'keep', pos: 'Keep', nameA: nameOf(keeperAt(2 * q)), nameB: '',
        style: CELL + 'background:transparent;border:1px dashed var(--color-neutral-400)',
        nameAStyle: 'font-size:16px;line-height:1.2;font-weight:500;color:var(--color-text)',
        subStyle: 'display:none', onEdit: undefined, onEditB: undefined
      }]
    }]);
    const injuredNow = Object.keys(m.injuries || {}).filter(id => m.injuries[id] <= 2 * q + 1).map(id => nameOf(id));
    return {
      key: q,
      title: (q + 1) + 'e kwart',
      time: fmt(q * QUARTER_MIN) + ' – ' + fmt((q + 1) * QUARTER_MIN),
      rows,
      notes: [
        {
          key: 'start',
          label: q === 0 ? 'Startopstelling' : 'Bij aanvang van dit kwart',
          text: q === 0 ? 'Deze opstelling begint de wedstrijd.' : (outStart.length || inStart.length
            ? (outStart.length ? nm(outStart) + ' eruit' : 'niemand eruit') + ' · ' + (inStart.length ? nm(inStart) + ' erin' : 'niemand erin')
            : 'geen wissels'),
          style: 'color:var(--color-accent-800)'
        },
        { key: 'movers', label: 'Positiewissels halverwege', text: movers.length ? '⇄ ' + nm(movers) : 'geen', style: 'color:' + C_MOVE },
        {
          key: 'bench1', label: (2 * q + 1) + 'e bank',
          text: a.bench.length ? nmSub(orderBench(a.bench, 2 * q - 1), 2 * q) : 'leeg',
          style: 'color:var(--color-neutral-700)'
        },
        {
          key: 'bench2', label: (2 * q + 2) + 'e bank',
          text: (b.bench.length ? nmSub(orderBench(b.bench, 2 * q), 2 * q + 1) : 'leeg')
            + (injuredNow.length ? ' · geblesseerd: ' + injuredNow.join(', ') : ''),
          style: 'color:var(--color-neutral-700)'
        }
      ]
    };
  });

  const perQ = {};
  (sched || []).forEach((b, i) => {
    const q = Math.floor(i / 2);
    Object.keys(b.on).forEach(k => {
      const id = b.on[k];
      perQ[id] = perQ[id] || [0, 0, 0, 0];
      perQ[id][q]++;
    });
  });
  const hm = QUARTER_MIN / 2;
  const timeRows = selectedPlayers().map(p => {
    const arr = perQ[p.id] || [0, 0, 0, 0];
    const keepsQ = [0, 1, 2, 3].map(q => keeperAt(2 * q) === p.id);
    const kHalves = keepsQ.filter(Boolean).length * 2;
    const tot = arr.reduce((a, b) => a + b, 0) + kHalves;
    const cell = (v, q) => (keepsQ[q] ? 'K' : (v ? String(v) : '·'));
    return {
      key: p.id,
      name: displayFirst(p) + (kHalves === 8 ? ' (keep)' : kHalves ? ' (keep ½)' : ''),
      q1: cell(arr[0], 0), q2: cell(arr[1], 1), q3: cell(arr[2], 2), q4: cell(arr[3], 3),
      halves: String(tot), minutes: String(Math.round(tot * hm)),
      _minutesNum: tot * hm
    };
  }).sort((a, b) => b._minutesNum - a._minutesNum);

  const matchNoteRowsForPrint = (m.notes || []).slice()
    .sort((a, b) => noteSubjectName(a).localeCompare(noteSubjectName(b)) || a.quarter - b.quarter)
    .map(n => ({
      key: n.id, player: noteSubjectName(n), quarter: n.quarter + 1,
      valence: n.valence === '+' ? '+' : '–', category: n.categoryLabel || '—', text: n.text || ''
    }));

  const injOptions = selectedPlayers().filter(p => p.id !== m.keeperId && (m.injuries || {})[p.id] == null).map(p => ({ id: p.id, label: displayFirst(p) }));
  const injFromOptions = [1, 2, 3, 4].map(q => ({ value: String(q), label: 'vanaf ' + q + 'e kwart' }));
  const injuryList = Object.keys(m.injuries || {}).map(id => ({
    key: id,
    label: nameOf(id) + ' geblesseerd vanaf kwart ' + (Math.floor(m.injuries[id] / 2) + 1) + ' — klik om terug te zetten',
    clear: () => clearInjury(id)
  }));

  const matchNoteChips = (m.notes || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(n => ({
    key: n.id,
    valence: n.valence,
    label: noteSubjectName(n) + ' · kwart ' + (n.quarter + 1) + ' · ' + noteSummary(n) + ' — klik om te wijzigen',
    edit: () => openNoteEditorForEdit(n)
  }));

  const fitOf = (p, pos) => p && p.prefs[pos] ? 'voorkeur ' + p.prefs[pos] + ' op deze plek' : 'speelt hier normaal niet';
  let editor = null;
  if (sched && editing && sched[2 * editing.q + editing.half]) {
    const ed = editing;
    const b = 2 * ed.q + ed.half;
    const blk = sched[b];
    const curId = blk.on[ed.pos];
    const cands = [];
    blk.bench.forEach(id => cands.push({ id, from: null }));
    Object.keys(blk.on).forEach(k => { if (k !== ed.pos && blk.on[k]) cands.push({ id: blk.on[k], from: k }); });
    const rank = c => { const p = byId(c.id); return p && p.prefs[ed.pos] ? p.prefs[ed.pos] : 9; };
    cands.sort((a, b2) => rank(a) - rank(b2) || (ratingOf(byId(b2.id)) - ratingOf(byId(a.id))));
    editor = {
      title: (ed.q + 1) + 'e kwart · ' + PMAP[ed.pos].label,
      current: curId ? nameOf(curId) + ' — ' + fitOf(byId(curId), ed.pos) : 'leeg',
      halfTabs: [0, 1].map(h => ({
        key: h, label: h === 0 ? '1e helft' : '2e helft (na 8:00)',
        go: () => setEditing({ q: ed.q, half: h, pos: ed.pos }),
        style: 'cursor:pointer;font-family:var(--font-body);font-size:16px;padding:4px 12px;border-radius:var(--radius-md);'
          + (ed.half === h ? 'background:var(--color-accent-700);color:#fff;border:1px solid var(--color-accent-700)' : 'background:transparent;color:var(--color-neutral-700);border:1px solid var(--color-neutral-400)')
      })),
      options: cands.map((c, ci) => {
        const p = byId(c.id);
        let effect;
        if (c.from) {
          effect = curId ? nameOf(curId) + ' gaat naar ' + PMAP[c.from].label : 'ruil van positie';
        } else {
          const after = [2 * ed.q, 2 * ed.q + 1].filter(i => i !== b).some(i => Object.keys(sched[i].on).some(k => sched[i].on[k] === curId));
          effect = curId
            ? (after ? nameOf(curId) + ' zit deze helft op de bank' : nameOf(curId) + ' speelt dan niet in dit kwart — je krijgt daarna alternatieven voor haar')
            : 'komt van de bank';
        }
        return {
          key: ci, name: displayFirst(p),
          meta: (c.from ? 'nu ' + PMAP[c.from].label : 'nu op de bank') + ' · ' + fitOf(p, ed.pos),
          effect,
          style: 'display:flex;flex-direction:column;gap:1px;text-align:left;width:100%;cursor:pointer;background:none;font-family:var(--font-body);padding:7px 10px;border-radius:var(--radius-md);border:1px solid var(--color-neutral-300)',
          apply: () => applySwap(b, ed.pos, c.id)
        };
      }),
      close: () => setEditing(null)
    };
  }

  let relocator = null;
  if (sched && relocating) {
    const rel = relocating;
    const p = byId(rel.id);
    const slots = [];
    [0, 1].forEach(h => {
      const b = 2 * rel.q + h;
      if (!sched[b]) return;
      Object.keys(sched[b].on).forEach(k => {
        const occ = byId(sched[b].on[k]);
        if (!occ || occ.id === rel.id) return;
        slots.push({ b, h, pos: k, occ });
      });
    });
    const myRank = s => p && p.prefs[s.pos] ? p.prefs[s.pos] : 9;
    const hurt = s => s.occ.prefs[s.pos] ? s.occ.prefs[s.pos] : 9;
    slots.sort((a, b2) => myRank(a) - myRank(b2) || hurt(b2) - hurt(a));
    relocator = {
      title: (p ? displayFirst(p) : '') + ' speelt nu niet in kwart ' + (rel.q + 1),
      intro: 'Kies waar zij alsnog speelt. De speelster die daar staat gaat op de bank in die helft.',
      options: slots.slice(0, 8).map((s, si) => ({
        key: si,
        name: PMAP[s.pos].label + ' · ' + (s.h === 0 ? '1e helft' : '2e helft'),
        meta: fitOf(p, s.pos),
        effect: displayFirst(s.occ) + ' gaat daar weg',
        style: 'display:flex;flex-direction:column;gap:1px;text-align:left;width:100%;cursor:pointer;background:none;font-family:var(--font-body);padding:7px 10px;border-radius:var(--radius-md);border:1px solid var(--color-neutral-300)',
        apply: () => applySwap(s.b, s.pos, rel.id)
      })),
      close: () => setRelocating(null)
    };
  }

  let noteDialog = null;
  if (noteEditor) {
    const ne = noteEditor;
    // "Eerder genoteerd" toont ALLE notities van deze speler (elk kwart), niet alleen dit kwart -
    // consistent met de badge in het schema, die ook match-breed telt i.p.v. per kwart.
    const existing = (m.notes || []).filter(n => n.playerId === ne.playerId);
    noteDialog = {
      title: (ne.id ? 'Notitie bewerken · ' : 'Notitie · ') + (ne.playerId ? nameOf(ne.playerId) : 'Team') + ' · kwart ' + (ne.quarter + 1),
      quarterTabs: ne.playerId ? null : [0, 1, 2, 3].map(q => ({
        key: q, label: 'Kwart ' + (q + 1),
        go: () => setNoteEditor({ ...ne, quarter: q }),
        style: 'cursor:pointer;font-family:var(--font-body);font-size:15px;padding:4px 10px;border-radius:var(--radius-md);'
          + (ne.quarter === q ? 'background:var(--color-accent-700);color:#fff;border:1px solid var(--color-accent-700)' : 'background:transparent;color:var(--color-neutral-700);border:1px solid var(--color-neutral-400)')
      })),
      groupTabs: NOTE_GROUPS.map(g => ({
        key: g.key, label: g.label,
        go: () => setNoteEditor({ ...ne, group: g.key, categoryId: '' }),
        style: 'cursor:pointer;font-family:var(--font-body);font-size:15px;padding:4px 10px;border-radius:var(--radius-md);'
          + (ne.group === g.key ? 'background:var(--color-accent-700);color:#fff;border:1px solid var(--color-accent-700)' : 'background:transparent;color:var(--color-neutral-700);border:1px solid var(--color-neutral-400)')
      })),
      categories: (noteCategories[ne.group] || []).map(c => ({
        key: c.id, label: c.label,
        go: () => setNoteEditor({ ...ne, categoryId: c.id }),
        style: 'cursor:pointer;font-family:var(--font-body);font-size:15px;padding:5px 12px;border-radius:999px;'
          + (ne.categoryId === c.id ? 'background:var(--color-accent-700);color:#fff;border:1px solid var(--color-accent-700)' : 'background:transparent;color:var(--color-text);border:1px solid var(--color-neutral-400)')
      })),
      valence: ne.valence,
      setValence: v => setNoteEditor({ ...ne, valence: v }),
      text: ne.text,
      setText: v => setNoteEditor({ ...ne, text: v }),
      canSave: !!ne.categoryId || !!(ne.text && ne.text.trim()),
      isEditing: !!ne.id,
      save: saveNote,
      remove: ne.id ? () => removeNote(ne.id) : null,
      close: () => setNoteEditor(null),
      // Klikken op een eerder gemaakte notitie laadt 'm in de dialoog om te wijzigen (i.p.v.
      // 'm direct te verwijderen) - de notitie die nu al in bewerking is, is uitgelicht.
      existing: existing.map(n => ({
        key: n.id,
        label: 'kwart ' + (n.quarter + 1) + ' · ' + noteSummary(n),
        active: n.id === ne.id,
        edit: () => openNoteEditorForEdit(n)
      }))
    };
  }

  const posCols = POS.map(p => ({ key: p.k, short: p.short, count: players.filter(pl => pl.prefs[p.k]).length }));
  const kpCount = players.filter(pl => pl.fixedKeeper).length;
  const teamRows = players.map(p => ({
    key: p.id,
    name: p.first + ' ' + p.last,
    posCount: Object.values(p.prefs).filter(Boolean).length + (p.fixedKeeper ? 1 : 0),
    level: String(p.level || 3),
    onLevel: e => { if (readOnly) return; const v = Number(e.target.value); setPlayers(ps => ps.map(x => x.id === p.id ? { ...x, level: v } : x)); },
    dp: String(p.dp || 0),
    onDp: e => { if (readOnly) return; const v = Math.max(0, Number(e.target.value) || 0); setPlayers(ps => ps.map(x => x.id === p.id ? { ...x, dp: v } : x)); },
    subLabel: p.sub ? 'Invaller' : 'Vast',
    onToggleSub: () => { if (readOnly) return; setPlayers(ps => ps.map(x => x.id === p.id ? { ...x, sub: !x.sub } : x)); },
    cells: POS.map(pos => ({
      key: pos.k,
      value: p.prefs[pos.k] ? String(p.prefs[pos.k]) : '',
      onChange: e => {
        if (readOnly) return;
        const raw = e.target.value;
        const prefs = { ...p.prefs };
        if (raw === '' || Number(raw) <= 0) delete prefs[pos.k]; else prefs[pos.k] = Number(raw);
        setPlayers(ps => ps.map(x => x.id === p.id ? { ...x, prefs } : x));
      }
    })),
    fixedKeeper: !!p.fixedKeeper,
    onToggleFixedKeeper: () => { if (readOnly) return; setPlayers(ps => ps.map(x => x.id === p.id ? { ...x, fixedKeeper: !x.fixedKeeper } : x)); },
    remove: () => {
      if (readOnly) return;
      setPlayers(ps => ps.filter(x => x.id !== p.id));
      setMatch(mm => ({ ...mm, selected: (mm.selected || []).filter(x => x !== p.id) }));
    }
  }));

  const scRows = group => (sc[group] || []).map(row => ({
    key: row.id,
    role: row.role,
    onRoleChange: e => {
      if (readOnly) return;
      const val = e.target.value;
      setSc(s => ({ ...s, [group]: s[group].map(r => r.id === row.id ? { ...r, role: val } : r) }));
    },
    cells: (row.picks || [null, null, null]).map((pid, ci, picks) => {
      const usedElsewhere = picks.filter((v, j) => j !== ci && v);
      return {
        key: ci, value: pid || '',
        options: players.filter(p => usedElsewhere.indexOf(p.id) < 0),
        onChange: e => {
          if (readOnly) return;
          const val = e.target.value || null;
          if (val && usedElsewhere.indexOf(val) >= 0) return;
          setSc(s => ({
            ...s,
            [group]: s[group].map(r => r.id === row.id ? { ...r, picks: r.picks.map((p, j) => j === ci ? val : p) } : r)
          }));
        }
      };
    }),
    remove: () => { if (readOnly) return; setSc(s => ({ ...s, [group]: s[group].filter(r => r.id !== row.id) })); }
  }));
  const addScRole = group => {
    if (readOnly) return;
    setSc(s => ({ ...s, [group]: (s[group] || []).concat([{ id: 'sc' + Date.now() + Math.random().toString(36).slice(2, 6), role: '', picks: [null, null, null] }]) }));
  };

  // Notities-categorieën per groep — de 4 groepen zelf liggen vast (NOTE_GROUPS), maar de
  // items eronder zijn hier in de app zelf te beheren (net als de strafcorner-rollen hierboven).
  const noteCategoryRows = group => (noteCategories[group] || []).map((c, i, arr) => ({
    key: c.id,
    label: c.label,
    onLabelChange: e => {
      if (readOnly) return;
      const v = e.target.value;
      setNoteCategories(nc => ({ ...nc, [group]: (nc[group] || []).map(x => x.id === c.id ? { ...x, label: v } : x) }));
    },
    moveUp: i > 0 ? () => {
      if (readOnly) return;
      setNoteCategories(nc => {
        const list = (nc[group] || []).slice();
        [list[i - 1], list[i]] = [list[i], list[i - 1]];
        return { ...nc, [group]: list };
      });
    } : null,
    moveDown: i < arr.length - 1 ? () => {
      if (readOnly) return;
      setNoteCategories(nc => {
        const list = (nc[group] || []).slice();
        [list[i + 1], list[i]] = [list[i], list[i + 1]];
        return { ...nc, [group]: list };
      });
    } : null,
    remove: () => {
      if (readOnly) return;
      setNoteCategories(nc => ({ ...nc, [group]: (nc[group] || []).filter(x => x.id !== c.id) }));
    }
  }));
  const addNoteCategory = group => {
    if (readOnly) return;
    setNoteCategories(nc => ({
      ...nc,
      [group]: (nc[group] || []).concat([{ id: 'nc' + Date.now() + Math.random().toString(36).slice(2, 6), label: '' }])
    }));
  };

  // Overzicht voor trainingsvoorbereiding: alle notities uit de historie plus de lopende
  // wedstrijd, optioneel gefilterd op één speler, nieuwste eerst.
  const noteSources = history.map(h => ({ date: h.date, opponent: h.opponent, notes: h.notes || [] }))
    .concat((m.notes && m.notes.length) ? [{ date: m.date, opponent: m.opponent, notes: m.notes }] : []);
  const noteRows = noteSources.flatMap(src => (src.notes || [])
    .filter(n => {
      if (!notesFilterPlayer) return true;
      if (notesFilterPlayer === '__team__') return !n.playerId;
      return n.playerId === notesFilterPlayer;
    })
    .map(n => ({
      key: src.date + '|' + src.opponent + '|' + n.id,
      date: src.date, opponent: src.opponent, player: noteSubjectName(n),
      valence: n.valence === '+' ? '+' : '–', category: n.categoryLabel || '—', text: n.text || '',
      _createdAt: n.createdAt || 0
    })))
    .sort((a, b) => b._createdAt - a._createdAt);
  // Strafcorner-picks voor déze wedstrijd: standaard de seizoensvolgorde (uit de Strafcorner-tab),
  // maar alleen de spelers die voor deze wedstrijd geselecteerd én (nog) niet uitgevallen zijn.
  // Wie wegvalt (niet geselecteerd, of tijdens de wedstrijd geblesseerd) wordt uit de rij
  // gefilterd i.p.v. alleen leeggemaakt, zodat een volgende keus automatisch opschuift. Een
  // handmatige vervanging (m.scOverrides) geldt alleen voor deze wedstrijd en raakt de
  // seizoensvolgorde zelf niet aan.
  const scAvailIds = () => {
    const selIds = m.selected || [];
    const injuredIds = Object.keys(m.injuries || {});
    return selIds.filter(id => injuredIds.indexOf(id) < 0);
  };
  const scAvailablePlayers = () => {
    const avail = scAvailIds();
    return players.filter(p => avail.indexOf(p.id) >= 0);
  };
  const scRolePicks = (group, row) => {
    const avail = scAvailIds();
    const overrides = (m.scOverrides && m.scOverrides[group]) || {};
    const raw = overrides[row.id] || row.picks;
    const f = (raw || []).filter(pid => pid && avail.indexOf(pid) >= 0);
    while (f.length < 3) f.push(null);
    return f;
  };
  const scMatchRows = group => (sc[group] || []).map(row => {
    const picks = scRolePicks(group, row);
    const overrides = (m.scOverrides && m.scOverrides[group]) || {};
    return {
      key: row.id,
      role: row.role,
      cells: picks.map((pid, ci) => {
        const usedElsewhere = picks.filter((v, j) => j !== ci && v);
        return {
          key: ci,
          value: pid || '',
          options: scAvailablePlayers().filter(p => usedElsewhere.indexOf(p.id) < 0),
          onChange: e => {
            if (readOnly || matchLocked) return;
            const val = e.target.value || null;
            if (val && usedElsewhere.indexOf(val) >= 0) return;
            const next = picks.map((p, j) => j === ci ? val : p);
            patchMatch({ scOverrides: { ...(m.scOverrides || {}), [group]: { ...overrides, [row.id]: next } } });
          }
        };
      })
    };
  });
  // Strafcornerschema: per speelblok de hoogste keus per rol die op dat moment ook echt in het
  // veld staat (een reserve op de bank kan geen corner nemen).
  const scBlockRows = (sched || []).map((blk, i) => {
    const onIds = Object.keys(blk.on).map(k => blk.on[k]);
    // Eén speler kan niet op twee plekken tegelijk staan: rollen worden in volgorde toegekend
    // (1e uitloop eerst, dan 2e uitloop, enz.) en wie al aan een eerdere rol in dit blok is
    // toegewezen, valt bij de volgende rol af — die kijkt dan naar haar eigen volgende keus.
    const per = group => {
      const used = new Set();
      return (sc[group] || []).map(row => {
        const picks = scRolePicks(group, row);
        const assignedId = picks.find(pid => pid && onIds.indexOf(pid) >= 0 && !used.has(pid));
        if (assignedId) used.add(assignedId);
        return { key: row.id, role: row.role, name: assignedId ? nameOf(assignedId) : '—' };
      });
    };
    const q = Math.floor(i / 2);
    return {
      key: i,
      label: (q + 1) + 'e kwart – ' + (i % 2 === 0 ? '1e helft' : '2e helft'),
      verdedigen: per('verdedigen'),
      aanval: per('aanval')
    };
  });

  const totals = {};
  history.forEach(h => {
    Object.keys(h.halves).forEach(id => {
      totals[id] = totals[id] || { m: 0, k: 0, h: 0 };
      totals[id].h += h.halves[id];
    });
    const ks = keeperIdsOf(h);
    ks.forEach(id => {
      totals[id] = totals[id] || { m: 0, k: 0, h: 0 };
      totals[id].k += 1;
      totals[id].h += ks.length > 1 ? 4 : 8;
    });
    const seen = {};
    Object.keys(h.halves).forEach(id => { seen[id] = true; });
    ks.forEach(id => { seen[id] = true; });
    Object.keys(seen).forEach(id => {
      totals[id] = totals[id] || { m: 0, k: 0, h: 0 };
      totals[id].m += 1;
    });
  });
  const seasonRows = players.map(p => {
    const t = totals[p.id] || { m: 0, k: 0, h: 0 };
    return { key: p.id, name: p.first + ' ' + p.last, matches: String(t.m), keeps: String(t.k), halves: String(t.h), minutes: String(Math.round(t.h * hm)), _halves: t.h };
  }).sort((a, b) => b._halves - a._halves || a.name.localeCompare(b.name));

  // "Wedstrijden" toont elke gespeelde wedstrijd (eindstand ingevuld bij Programma), niet
  // alleen die waar ook een schema voor is opgeslagen — anders vielen scores zonder schema weg.
  const historyByKey = {};
  history.forEach(h => { historyByKey[h.date + '|' + h.opponent] = h; });
  const historyRows = fixtures
    .filter(f => f.gf !== '' && f.gf != null && f.ga !== '' && f.ga != null)
    .slice().sort((a, b) => (a.date || '9') < (b.date || '9') ? -1 : 1)
    .map(f => {
      const h = historyByKey[f.date + '|' + f.opponent];
      return {
        key: f.id, date: f.date,
        wedstrijd: f.home === false ? (f.opponent || 'Onbekend') + ' – ' + ownTeamName : ownTeamName + ' – ' + (f.opponent || 'Onbekend'),
        friendly: !!f.friendly,
        keeper: h ? keeperIdsOf(h).map(id => nameOf(id)).join(' / ') : '—',
        score: (f.gf || 0) + ' – ' + (f.ga || 0),
        remove: () => {
          if (readOnly) return;
          setFixtures(fs => fs.map(x => x.id === f.id ? { ...x, gf: '', ga: '' } : x));
          if (h) setHistory(hs => hs.filter(x => x.id !== h.id));
        }
      };
    });

  const rotationOrder = players.slice().sort((a, b) => (keeps[a.id] || 0) - (keeps[b.id] || 0));
  const keeperRotationText = history.length
    ? 'Aan de beurt om te keepen: ' + rotationOrder.slice(0, 4).map(p => displayFirst(p)).join(', ') + '.'
    : 'Zodra je wedstrijden opslaat, zie je hier wie het langst niet gekeept heeft.';

  // Eén poule (competitie) per gevonden poule_id, gesorteerd op id (loopt in de praktijk
  // op naarmate een nieuwe competitiefase - bijv. de hoofdcompetitie na de voorcompetitie -
  // bekend wordt). `is_current` markeert op welke poule-rij van dit team LISA op dit moment
  // aanspeelt; die poule is de standaardselectie totdat iemand zelf een andere kiest.
  const poules = Array.from(new Map(standings.map(r => [r.poule_id, r.poule_name])).entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.id - b.id);
  const currentPouleRow = standings.find(r => r.is_current);
  const currentPouleId = currentPouleRow ? currentPouleRow.poule_id : (poules.length ? poules[poules.length - 1].id : null);
  const effectivePouleId = selectedPouleId != null ? selectedPouleId : currentPouleId;
  // Standaard headertekst (buiten een live wedstrijd om): de eigen positie in de huidige
  // competitie i.p.v. de eerstvolgende tegenstander - altijd op de actuele poule (currentPouleId),
  // ongeacht welke poule er net op Standen is geselecteerd. Geen tekst als er nog geen stand is
  // (bijv. geen LISA-koppeling) - net als bij "geen tegenstander" laten we 'm dan gewoon weg.
  const ownStandingRow = standings.find(r => r.poule_id === currentPouleId && (r.name === lisaConfig?.teamName || r.name === ownTeamName));
  const standingsLine = ownStandingRow
    ? 'Plek ' + ownStandingRow.position + ' · ' + ownStandingRow.points + ' punten · ' + ownStandingRow.goals_for + ' doelpunten voor · ' + ownStandingRow.goals_against + ' tegen'
    : null;
  // Korte notatie voor bij geïmporteerde wedstrijden (bv. "voorcompetitie 4e klasse" i.p.v.
  // de volledige "Meisjes O18 voorcompetitie 4e klasse") - de leeftijdscategorie staat er
  // sowieso al overal bij (teamnaam, header), dus die hoeft hier niet herhaald te worden.
  const shortPouleName = name => name ? name.replace(/^(Meisjes|Jongens|Dames|Heren)\s+[A-Za-z]*\d+\s+/i, '').trim() : null;
  // Volgt de zelf gekozen competitie (effectivePouleId, ook gebruikt door Standen) i.p.v.
  // altijd de LISA-"huidige" poule, zodat een handmatige keuze hier ook echt gebruikt wordt.
  const effectivePouleName = (poules.find(p => p.id === effectivePouleId) || {}).name || null;
  const competitionShortName = shortPouleName(effectivePouleName);
  // Standaard dezelfde "huidige" competitie als effectivePouleId (of 'all' zolang er nog geen
  // enkele poule bekend is) - los instelbaar van Standen, want hier kan ook op oefenwedstrijden
  // of "alles" gefilterd worden, wat voor de standenpagina geen betekenis heeft.
  const effectiveProgrammaFilter = programmaCompetitionFilter != null ? programmaCompetitionFilter : (currentPouleId != null ? currentPouleId : 'all');
  const pouleRows = standings
    .filter(r => r.poule_id === effectivePouleId)
    .slice()
    .sort((a, b) => a.position - b.position);

  const fixturesSorted = fixtures.slice().sort((a, b) => (a.date || '9') < (b.date || '9') ? -1 : 1);
  const fixtureRows = fixturesSorted.map(f => {
    const upd = obj => { if (!readOnly) setFixtures(fs => fs.map(x => x.id === f.id ? { ...x, ...obj } : x)); };
    const d = f.date ? new Date(f.date + 'T12:00:00') : null;
    const homeName = f.home ? ownTeamName : (f.opponent || 'tegenstander ?');
    const awayName = f.home ? (f.opponent || 'tegenstander ?') : ownTeamName;
    const played = f.gf !== '' && f.gf != null && f.ga !== '' && f.ga != null;
    // Live stand: alleen voor de wedstrijd die nu "gestart" is (m.liveOpened, via Wedstrijdmodus)
    // en nog geen Eindstand heeft - zodra de coach naar een andere wedstrijd wisselt, de
    // wedstrijd beëindigt (Eindstand wordt dan automatisch ingevuld) of de selectie wist,
    // verdwijnt dit vanzelf weer.
    const isLive = m.liveOpened && f.id === m.fixtureId && !played;
    return {
      key: f.id,
      date: f.date, time: f.time, opponent: f.opponent, home: !!f.home,
      verzameltijd: f.verzameltijd || '',
      day: d && !isNaN(d) ? DAGEN[d.getDay()] : '—',
      homeName, awayName,
      homeStyle: f.home ? 'color:var(--color-accent-700);font-weight:600' : 'color:var(--color-text)',
      awayStyle: !f.home ? 'color:var(--color-accent-700);font-weight:600' : 'color:var(--color-text)',
      played,
      live: isLive ? { home: f.home ? (m.liveUs || 0) : (m.liveThem || 0), away: f.home ? (m.liveThem || 0) : (m.liveUs || 0) } : null,
      onDate: e => upd({ date: e.target.value }),
      onTime: e => upd({ time: e.target.value }),
      onVerzameltijd: e => upd({ verzameltijd: e.target.value }),
      gf: f.gf == null ? '' : String(f.gf),
      ga: f.ga == null ? '' : String(f.ga),
      onGf: e => { if (readOnly) return; const v = e.target.value; upd({ gf: v }); setHistory(hs => hs.map(h => (h.date === f.date && h.opponent === f.opponent) ? { ...h, gf: v } : h)); },
      onGa: e => { if (readOnly) return; const v = e.target.value; upd({ ga: v }); setHistory(hs => hs.map(h => (h.date === f.date && h.opponent === f.opponent) ? { ...h, ga: v } : h)); },
      friendly: !!f.friendly,
      // Type-kolom: oefenwedstrijden zijn altijd handmatig toegevoegd (geen keuze meer, zie
      // saveNewFixture); een echte wedstrijd toont de korte competitienaam die bij het
      // importeren is vastgelegd (zie importLisaMatches) - oudere imports van vóór die
      // wijziging hebben nog geen competitie, die tonen dan gewoon "—".
      type: f.friendly ? 'Oefenwedstrijd' : (f.competitie || '—'),
      points: (() => {
        if (f.friendly || f.gf === '' || f.gf == null || f.ga === '' || f.ga == null) return '—';
        const us = f.home ? Number(f.gf) : Number(f.ga);
        const them = f.home ? Number(f.ga) : Number(f.gf);
        return us > them ? '3' : us === them ? '1' : '0';
      })(),
      planLabel: f.locked ? 'Bekijk schema' : 'Plan',
      plan: () => loadFixture(f),
      remove: () => { if (!readOnly) setFixtures(fs => fs.filter(x => x.id !== f.id)); },
      // Wedstrijdverslag: alleen aanwezig voor wedstrijden die via "Wedstrijd beëindigen" in
      // wedstrijdmodus zijn afgesloten - oudere/handmatige resultaten hebben dit niet.
      report: f.report && f.report.length ? f.report : null,
    };
  });
  // Filtert eerst op de gekozen competitie/type (zie effectiveProgrammaFilter hierboven),
  // daarna pas op gespeeld/nog te spelen - zodat "Ook X gespeelde wedstrijden tonen" het
  // aantal binnen de huidige filter toont, niet het seizoentotaal.
  const competitionFilteredFixtureRows = fixtureRows.filter(f => {
    if (effectiveProgrammaFilter === 'all') return true;
    if (effectiveProgrammaFilter === 'friendly') return f.friendly;
    // f.type is al 'Oefenwedstrijd' of de opgeslagen competitienaam (zie fixtureRows hierboven) -
    // vergelijk daarmee i.p.v. een apart f.competitie-veld dat niet op de rij zelf staat.
    const shortName = shortPouleName((poules.find(p => p.id === effectiveProgrammaFilter) || {}).name);
    return !f.friendly && shortName != null && f.type === shortName;
  });
  const pastFixtureCount = competitionFilteredFixtureRows.filter(f => f.played).length;
  const visibleFixtureRows = showPastFixtures ? competitionFilteredFixtureRows : competitionFilteredFixtureRows.filter(f => !f.played);

  const RIJDER_SLOTS = 4;
  const todayISO = new Date().toISOString().slice(0, 10);
  const nlDate = d => d && d.length === 10 ? d.slice(8, 10) + '-' + d.slice(5, 7) + '-' + d.slice(0, 4) : '?';
  // Het hoeveelste keer dit seizoen een speelster de pauzehap doet (1e keer -> "(1)", 2e keer
  // -> "(2)", enz.) - laat dat oplopende getal achter haar naam zien in de keuzelijst, zodat
  // eerlijk verdelen makkelijker is. Telt alle wedstrijden mee (verleden én toekomst), inclusief
  // de rij die je nu bekijkt - dus wie hier voor het eerst gekozen wordt, springt meteen naar "(1)".
  const pauzehapCount = playerId => fixtures.filter(x => x.pauzehapId === playerId).length;
  // Zelfde idee, maar dan voor het aantal keer dat iemand is ingedeeld om te rijden (in om het
  // even welke van de 4 rijder-plekken), zodat ook dat eerlijk te verdelen is.
  const rijderCount = playerId => fixtures.filter(x => (x.rijders || []).indexOf(playerId) >= 0).length;

  const ouderRowsAll = fixturesSorted.map(f => {
    const upd = obj => { if (!canManageOuders) return; setFixtures(fs => fs.map(x => x.id === f.id ? { ...x, ...obj } : x)); };
    const rijders = f.rijders || [];
    const isPast = !!f.date && f.date < todayISO;
    return {
      key: f.id,
      isPast,
      home: !!f.home,
      // Zelfde wedstrijden als in Programma: begint het (in Programma getoonde) duel met HCRB,
      // dan is dat een thuiswedstrijd; anders is de tegenstander de plek waar gespeeld wordt -
      // zonder het leeftijdsteam-nummer erachter (bv "Ring Pass MO18-3" -> "Ring Pass").
      waar: f.home ? 'Thuis' : (f.opponent ? f.opponent.replace(/\s+[A-Z]{1,4}\d+(-\d+)?$/, '') : 'tegenstander ?'),
      datum: nlDate(f.date),
      verzameltijd: f.verzameltijd || '',
      startTijd: f.time || '',
      pauzehapId: f.pauzehapId || '',
      onPauzehap: e => upd({ pauzehapId: e.target.value || null }),
      pauzehapOptions: players.map(p => {
        const n = pauzehapCount(p.id);
        return { id: p.id, label: displayFirst(p) + (n > 0 ? ` (${n})` : '') };
      }),
      // Altijd 4 slots (ook bij thuis) zodat elke rij dezelfde kolommen heeft in de tabel -
      // bij thuis is active false en toont de cel gewoon een streepje, geen keuzelijst.
      rijderSlots: Array.from({ length: RIJDER_SLOTS }, (_, i) => {
        const chosenElsewhere = rijders.filter((id, j) => j !== i && id);
        return {
          key: i,
          active: !f.home,
          value: rijders[i] || '',
          options: players.filter(p => chosenElsewhere.indexOf(p.id) < 0).map(p => {
            const n = rijderCount(p.id);
            return { id: p.id, label: displayFirst(p) + (n > 0 ? ` (${n})` : '') };
          }),
          onChange: e => {
            const next = rijders.slice(0, RIJDER_SLOTS);
            while (next.length < RIJDER_SLOTS) next.push(null);
            next[i] = e.target.value || null;
            upd({ rijders: next });
          },
        };
      }),
    };
  });
  const ouderRows = showPastOuders ? ouderRowsAll : ouderRowsAll.filter(r => !r.isPast);
  const pastOuderCount = ouderRowsAll.length - ouderRowsAll.filter(r => !r.isPast).length;

  const matchOptions = fixturesSorted.map(f => {
    const d = f.date ? new Date(f.date + 'T12:00:00') : null;
    return {
      id: f.id,
      label: (d && !isNaN(d) ? DAGEN[d.getDay()] + ' ' + f.date.slice(8) + '-' + f.date.slice(5, 7) : 'datum ?')
        + (f.time ? ' ' + f.time : '') + ' · ' + (f.home ? 'thuis' : 'uit') + ' · ' + (f.opponent || 'tegenstander ?')
    };
  });

  const scheduleTitle = (() => {
    const fx = fixtures.find(f => f.id === m.fixtureId);
    const opp = m.opponent || (fx ? fx.opponent : 'onbekend');
    return fx && fx.home === false ? opp + ' – ' + ownTeamName : ownTeamName + ' – ' + opp;
  })();

  const dateline = 'tegen ' + m.opponent + ' · 4 × ' + QUARTER_MIN + ' min';
  const scoreFxObj = fixtures.find(x => x.id === m.fixtureId);
  const matchDateTimeLine = scheduleTitle + (m.date ? ' · ' + nlDate(m.date) : '') + (scoreFxObj && scoreFxObj.time ? ' ' + scoreFxObj.time : '');

  // Live wedstrijdvolgen: de klok leeft per kwart in m.clocks (Firestore-gesynchroniseerd via de
  // gewone match-blob-sync), zodat hij voor IEDERE kijker meetikt, niet alleen op het toestel van
  // de coach. Elk kwart heeft een eigen "vakje" zodat even terugbladeren naar een vorig kwart
  // (om het schema/strafcorner na te kijken) de lopende klok van het huidige kwart niet verstoort.
  const liveQuarter = Number(m.liveQuarter || 0);
  const activeClockKey = String(liveQuarter);
  const activeClock = (m.clocks && m.clocks[activeClockKey]) || DEFAULT_CLOCK;
  const timerRemainingMs = activeClock.running
    ? Math.max(0, (activeClock.endAt || timerNow) - timerNow)
    : activeClock.remainingMs;
  const timerAlertActive = !alertDismissedByQuarter[activeClockKey] && timerRemainingMs <= TIMER_ALERT_REMAINING_MS;

  // Tikt elke 250ms door zolang de actieve klok loopt, puur om timerNow te verversen — de
  // daadwerkelijke resterende tijd wordt berekend uit endAt (een tijdstip), niet opgeteld in
  // stapjes. Moet voor IEDERE kijker lopen (niet alleen de coach), anders tikt de klok bij
  // ouders/spectators niet live mee.
  useEffect(() => {
    if (!activeClock.running) return;
    const id = setInterval(() => setTimerNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [activeClock.running]);

  // Bevriest de klok op 0 zodra hij afloopt. Alleen de coach (isMyTeam) mag dit daadwerkelijk
  // wegschrijven - anders zou elke open kijker-tab tegelijk dezelfde write proberen te doen
  // zodra de klok voor hen ook op 0 komt (onschadelijk dankzij de Firestore-rules, maar ruis).
  useEffect(() => {
    if (isMyTeam && activeClock.running && timerRemainingMs <= 0) {
      patchMatch({ clocks: { ...(m.clocks || {}), [activeClockKey]: { running: false, endAt: null, remainingMs: 0 } } });
    }
  }, [isMyTeam, activeClock.running, timerRemainingMs, activeClockKey]);

  function timerStart() {
    const slot = (m.clocks || {})[activeClockKey] || DEFAULT_CLOCK;
    if (slot.running) return;
    patchMatch({
      clocks: { ...(m.clocks || {}), [activeClockKey]: { running: true, endAt: Date.now() + (slot.remainingMs > 0 ? slot.remainingMs : TIMER_TOTAL_MS), remainingMs: slot.remainingMs } },
      ...(m.liveMatchStarted ? {} : { liveMatchStarted: true }),
    });
  }
  function timerPause() {
    const slot = (m.clocks || {})[activeClockKey] || DEFAULT_CLOCK;
    if (!slot.running) return;
    patchMatch({ clocks: { ...(m.clocks || {}), [activeClockKey]: { running: false, endAt: null, remainingMs: Math.max(0, (slot.endAt || Date.now()) - Date.now()) } } });
  }
  function timerReset() {
    patchMatch({ clocks: { ...(m.clocks || {}), [activeClockKey]: { running: false, endAt: null, remainingMs: TIMER_TOTAL_MS } } });
    setAlertDismissedByQuarter(a => ({ ...a, [activeClockKey]: false }));
  }
  function timerSetManual(mm, ss) {
    const remainingMs = Math.max(0, (Number(mm) * 60 + Number(ss)) * 1000);
    patchMatch({ clocks: { ...(m.clocks || {}), [activeClockKey]: { running: false, endAt: null, remainingMs } } });
  }
  function timerDismissAlert() {
    setAlertDismissedByQuarter(a => ({ ...a, [activeClockKey]: true }));
  }

  // Score in dezelfde thuis/uit-volgorde als scheduleTitle (consistent met hoe Eindstand/gf/ga
  // elders al wordt gelezen).
  function liveScoreText() {
    const home = !(scoreFxObj && scoreFxObj.home === false);
    const us = m.liveUs || 0;
    const them = m.liveThem || 0;
    return (home ? us : them) + '–' + (home ? them : us);
  }
  // Eén gedeelde bron voor de tussenstand/eindstand-tekst - gebruikt door zowel de header (voor
  // iedereen, op elk tabblad) als de Live-pagina, zodat de logica niet dubbel hoeft te staan.
  function liveStatus() {
    if (!m.liveOpened) return null;
    if (!m.liveMatchStarted) return { label: null, line: 'De wedstrijd zal binnenkort starten.' };
    if (m.liveEnded) return { label: 'Eindstand', line: scheduleTitle + ' · ' + liveScoreText() };
    return { label: 'Tussenstand', line: scheduleTitle + ' · ' + liveScoreText() + ' · Kwart ' + (liveQuarter + 1) + ' · ' + fmtTimer(timerRemainingMs) };
  }
  const vastePlayers = players.filter(p => !p.sub);
  const invallerPlayers = players.filter(p => p.sub);
  const chipFor = id => selectionChips.find(c => c.key === id);
  const matchLocked = !!m.locked;
  const generateWarning = !m.fixtureId ? 'Kies eerst een wedstrijd uit het programma.' : (!m.keeperId ? 'Kies eerst een keeper.' : (nSel < 8 ? 'Selecteer minimaal 8 speelsters.' : ''));
  // Stap 1 (selectie) wijzigt m.selected zonder het schema te legen - zo blijft een al gemaakt
  // schema staan i.p.v. abrupt te verdwijnen. m.scheduleSelected legt vast wie er geselecteerd
  // waren tóén het schema (opnieuw) werd gemaakt; wijkt dat af van de huidige selectie, dan is
  // het schema stale en moet het opnieuw gemaakt worden om de toegevoegde/verwijderde speler(s)
  // mee te nemen.
  const selectionChangedSinceSchedule = !!sched && !!m.scheduleSelected
    && m.scheduleSelected.slice().sort().join(',') !== (m.selected || []).slice().sort().join(',');

  const accessGate = label => (
    <main style={css('padding-top:var(--space-6)')}>
      <div className="card elev-sm" style={css('max-width:520px;display:flex;flex-direction:column;gap:var(--space-2)')}>
        <div className="card-title">{label}</div>
        <p className="card-body" style={css('margin:0')}>
          {user ? 'Dit onderdeel is alleen zichtbaar voor leden van dit team.' : 'Log in om dit onderdeel te bekijken.'}
        </p>
        {!user && <button type="button" className="btn btn-primary" style={css('align-self:flex-start')} onClick={() => setLoginOpen(true)}>Inloggen</button>}
      </div>
    </main>
  );

  // Als losse variabelen opgebouwd (i.p.v. inline in de JSX) zodat dezelfde overlay-dialogen
  // (klikken op een naam om te wisselen/verplaatsen) zowel in de normale Wedstrijdschema-sectie
  // als in de compacte wedstrijdmodus-weergave hergebruikt kunnen worden.
  const positionEditorDialog = editor && (
    <div className="dialog-backdrop" data-noprint="1" style={css('position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:var(--space-4)')}>
      <div className="dialog elev-lg" style={css('max-width:460px;width:100%;max-height:80vh;overflow:hidden;padding:var(--space-4)')}>
        <div className="dialog-title" style={css('font-family:var(--font-heading);font-size:22px')}>{editor.title}</div>
        <div className="dialog-body" style={css('display:flex;flex-direction:column;gap:var(--space-3);overflow-y:auto;min-height:0;flex:1')}>
          <div style={css('display:flex;gap:var(--space-2)')}>
            {editor.halfTabs.map(t => <button key={t.key} type="button" onClick={t.go} style={css(t.style)}>{t.label}</button>)}
          </div>
          <div style={css('font-size:16px')}>Nu op deze plek: <strong>{editor.current}</strong></div>
          <div style={css('display:flex;flex-direction:column;gap:5px')}>
            {editor.options.map(o => (
              <button key={o.key} type="button" onClick={o.apply} style={css(o.style)}>
                <span style={css('font-size:17px;font-weight:500')}>{o.name}</span>
                <span style={css('font-size:14px;color:var(--color-neutral-700)')}>{o.meta}</span>
                <span style={css('font-size:14px;color:var(--color-accent-2-700)')}>{o.effect}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="dialog-actions"><button type="button" className="btn btn-ghost" onClick={editor.close}>Annuleren</button></div>
      </div>
    </div>
  );
  const positionRelocatorDialog = relocator && (
    <div className="dialog-backdrop" data-noprint="1" style={css('position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:var(--space-4)')}>
      <div className="dialog elev-lg" style={css('max-width:460px;width:100%;max-height:80vh;overflow:hidden;padding:var(--space-4)')}>
        <div className="dialog-title" style={css('font-family:var(--font-heading);font-size:22px')}>{relocator.title}</div>
        <div className="dialog-body" style={css('display:flex;flex-direction:column;gap:var(--space-3);overflow-y:auto;min-height:0;flex:1')}>
          <div style={css('font-size:16px;color:var(--color-neutral-700);text-wrap:pretty')}>{relocator.intro}</div>
          <div style={css('display:flex;flex-direction:column;gap:5px')}>
            {relocator.options.map(o => (
              <button key={o.key} type="button" onClick={o.apply} style={css(o.style)}>
                <span style={css('font-size:17px;font-weight:500')}>{o.name}</span>
                <span style={css('font-size:14px;color:var(--color-neutral-700)')}>{o.meta}</span>
                <span style={css('font-size:14px;color:var(--color-accent-2-700)')}>{o.effect}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="dialog-actions"><button type="button" className="btn btn-ghost" onClick={relocator.close}>Op de bank laten</button></div>
      </div>
    </div>
  );
  const noteEditorDialog = noteDialog && (
    <div className="dialog-backdrop" data-noprint="1" style={css('position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:var(--space-4)')}>
      <div className="dialog elev-lg" style={css('max-width:460px;width:100%;max-height:80vh;overflow:hidden;padding:var(--space-4)')}>
        <div className="dialog-title" style={css('font-family:var(--font-heading);font-size:22px')}>{noteDialog.title}</div>
        <div className="dialog-body" style={css('display:flex;flex-direction:column;gap:var(--space-3);overflow-y:auto;min-height:0;flex:1')}>
          {noteDialog.quarterTabs && (
            <div style={css('display:flex;gap:var(--space-2);flex-wrap:wrap')}>
              {noteDialog.quarterTabs.map(t => <button key={t.key} type="button" onClick={t.go} style={css(t.style)}>{t.label}</button>)}
            </div>
          )}
          <div style={css('display:flex;gap:var(--space-2);flex-wrap:wrap')}>
            {noteDialog.groupTabs.map(t => <button key={t.key} type="button" onClick={t.go} style={css(t.style)}>{t.label}</button>)}
          </div>
          <div style={css('display:flex;gap:6px;flex-wrap:wrap')}>
            {noteDialog.categories.map(c => <button key={c.key} type="button" onClick={c.go} style={css(c.style)}>{c.label}</button>)}
          </div>
          <div style={css('display:flex;gap:var(--space-2)')}>
            <button type="button" onClick={() => noteDialog.setValence('-')} style={css('flex:1;cursor:pointer;font-family:var(--font-body);font-size:15px;padding:6px 10px;border-radius:var(--radius-md);'
              + (noteDialog.valence === '-' ? 'background:' + C_OUT + ';color:#fff;border:1px solid ' + C_OUT : 'background:transparent;color:var(--color-text);border:1px solid var(--color-neutral-400)'))}>Werkpunt (–)</button>
            <button type="button" onClick={() => noteDialog.setValence('+')} style={css('flex:1;cursor:pointer;font-family:var(--font-body);font-size:15px;padding:6px 10px;border-radius:var(--radius-md);'
              + (noteDialog.valence === '+' ? 'background:' + C_IN + ';color:#fff;border:1px solid ' + C_IN : 'background:transparent;color:var(--color-text);border:1px solid var(--color-neutral-400)'))}>Ging goed (+)</button>
          </div>
          <div className="field">
            <label htmlFor="note-text">Toelichting (optioneel)</label>
            <input className="input" id="note-text" type="text" maxLength={140} value={noteDialog.text} onChange={e => noteDialog.setText(e.target.value)} />
          </div>
          {noteDialog.existing.length > 0 && (
            <div style={css('display:flex;flex-direction:column;gap:5px')}>
              <div style={css('font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-neutral-700)')}>Eerder genoteerd deze wedstrijd — klik om te wijzigen</div>
              <div style={css('display:flex;gap:6px;flex-wrap:wrap')}>
                {noteDialog.existing.map(e => (
                  <button key={e.key} type="button" className={e.active ? 'tag' : 'tag tag-accent-2'}
                    onClick={e.edit} style={css('cursor:pointer;border:none;' + (e.active ? 'background:var(--color-accent-700);color:#fff' : ''))}>{e.label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="dialog-actions" style={css(noteDialog.remove ? 'justify-content:space-between' : undefined)}>
          {noteDialog.remove && <button type="button" className="btn btn-ghost" style={css('color:' + C_OUT)} onClick={noteDialog.remove}>Verwijderen</button>}
          <span style={css('display:flex;gap:var(--space-2)')}>
            <button type="button" className="btn btn-ghost" onClick={noteDialog.close}>Annuleren</button>
            <button type="button" className="btn btn-primary" disabled={!noteDialog.canSave} onClick={noteDialog.save}>Opslaan</button>
          </span>
        </div>
      </div>
    </div>
  );
  // Zelfde kaart-opmaak als de kwart-kaarten in de normale Wedstrijdschema-sectie (en op de
  // printversie), maar los getrokken zodat de compacte wedstrijdmodus 'm kan hergebruiken zonder
  // de print-specifieke data-noprint/data-pagebreak-opmaak.
  const halfCard = h => (
    <article key={h.key} data-halfcard="1" style={css('display:flex;flex-direction:column;gap:var(--space-2)')}>
      <div style={css('display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-2);border-bottom:2px solid var(--color-text);padding-bottom:4px')}>
        <h3 style={css('font-family:var(--font-heading);font-size:21px;margin:0;font-weight:600;white-space:nowrap')}>{h.title}</h3>
        <span style={css('font-size:13px;color:var(--color-neutral-700);letter-spacing:0.06em')}>{h.time}</span>
      </div>
      <div style={css('display:flex;flex-direction:column;gap:6px;padding-top:2px')}>
        {h.rows.map(row => (
          <div key={row.key} style={css('display:flex;justify-content:center;gap:6px')}>
            {row.cells.map(cell => (
              <div key={cell.key} data-poscell="1" style={css(cell.style + 'position:relative')}>
                <div style={css('font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-neutral-700);display:flex;align-items:center;justify-content:center;gap:4px')}>
                  <span>{cell.pos}</span>
                  {cell.onNote && (
                    <button type="button" data-noprint="1" aria-label={`Notitie — ${cell.nameA}`}
                      onClick={e => { e.stopPropagation(); cell.onNote(); }}
                      style={css(noteDotStyle(cell.noteBadge))}>{cell.noteBadge ? cell.noteBadge.count : '+'}</button>
                  )}
                </div>
                <div style={css(cell.nameAStyle)} onClick={cell.onEdit}>{cell.nameA}</div>
                <div style={css(cell.subStyle)} onClick={cell.onEditB}>{cell.nameB}</div>
                {cell.onNoteB && (
                  <button type="button" data-noprint="1" aria-label={`Notitie — ${cell.nameB}`}
                    onClick={e => { e.stopPropagation(); cell.onNoteB(); }}
                    style={css(noteDotStyle(cell.noteBadgeB) + 'position:absolute;bottom:2px;right:2px')}>{cell.noteBadgeB ? cell.noteBadgeB.count : '+'}</button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={css('display:flex;flex-direction:column;gap:5px;padding-top:8px;font-size:15px')}>
        {h.notes.map(n => (
          <div key={n.key} style={css(n.style)}>
            <div style={css('letter-spacing:0.1em;text-transform:uppercase;font-size:11px;color:var(--color-neutral-700)')}>{n.label}</div>
            <div style={css('line-height:1.35;text-wrap:pretty')}>{n.text}</div>
          </div>
        ))}
      </div>
    </article>
  );
  const scBlockTable = rows => (
    <table className="table" data-keeptogether="1">
      <thead>
        <tr><th style={{ textAlign: 'left' }}>Speelblok</th><th style={{ textAlign: 'left' }}>Verdedigen</th><th style={{ textAlign: 'left' }}>Aanval</th></tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key}>
            <td style={{ textAlign: 'left' }}>{r.label}</td>
            <td style={{ textAlign: 'left' }}>
              {r.verdedigen.map(x => (
                <div key={x.key} style={css('font-size:14px;padding:1px 0')}><span style={css('color:var(--color-neutral-700)')}>{x.role}: </span>{x.name}</div>
              ))}
            </td>
            <td style={{ textAlign: 'left' }}>
              {r.aanval.map(x => (
                <div key={x.key} style={css('font-size:14px;padding:1px 0')}><span style={css('color:var(--color-neutral-700)')}>{x.role}: </span>{x.name}</div>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // Verstreken speeltijd sinds de aftrap (over alle kwarten heen, i.p.v. alleen dit kwart) - voor
  // het loggen van "in de Ne minuut" bij een doelpunt. Minimaal 1, en naar boven afgerond (zoals
  // gebruikelijk bij "doelpunt in de 14e minuut").
  function elapsedMatchMinutes() {
    const elapsedInQuarter = QUARTER_MIN - (timerRemainingMs / 60000);
    return Math.max(1, Math.ceil(liveQuarter * QUARTER_MIN + elapsedInQuarter));
  }
  // Alle drie nemen de minuut als expliciete parameter aan (i.p.v. 'm zelf te berekenen) - de
  // dialogen zetten 'm bij het openen op de huidige verstreken tijd, maar de coach kan 'm
  // aanpassen (bv. een doelpunt dat pas 5 minuten later wordt ingevoerd).
  function logGoalThem(minute) {
    const newThem = (m.liveThem || 0) + 1;
    patchMatch({ liveThem: newThem, goalLog: [...(m.goalLog || []), { team: 'them', minute: Math.max(1, Number(minute) || elapsedMatchMinutes()), atUs: m.liveUs || 0, atThem: newThem }] });
    setThemGoalDialog(false);
  }
  function logGoalUs(player, remark, minute) {
    const newUs = (m.liveUs || 0) + 1;
    const entry = { team: 'us', minute: Math.max(1, Number(minute) || elapsedMatchMinutes()), scorerId: player.id, scorerName: displayFirst(player), atUs: newUs, atThem: m.liveThem || 0 };
    if (remark && remark.trim()) entry.remark = remark.trim();
    patchMatch({ liveUs: newUs, goalLog: [...(m.goalLog || []), entry] });
    setPlayers(ps => ps.map(x => x.id === player.id ? { ...x, dp: (x.dp || 0) + 1 } : x));
    setScorerPicker(false);
    setScorerSelected(null);
    setGoalRemark('');
  }
  function logNote(text, minute) {
    if (!text || !text.trim()) return;
    patchMatch({ goalLog: [...(m.goalLog || []), { team: 'note', minute: Math.max(1, Number(minute) || elapsedMatchMinutes()), text: text.trim() }] });
    setCommentText('');
    setCommentDialog(false);
  }
  // Verwijdert één specifieke logregel (op index, dus altijd de actuele m.goalLog op het moment
  // van klikken) en trekt score/DP weer terug - gebruikt door zowel de snelle "−" (laatste van
  // dit team) als het bewerken/verwijderen van een willekeurige regel in het scoreverloop.
  function removeLogEntry(idx) {
    const log = m.goalLog || [];
    const entry = log[idx];
    if (!entry) return;
    const newLog = log.slice(0, idx).concat(log.slice(idx + 1));
    const patch = { goalLog: newLog };
    if (entry.team === 'us') patch.liveUs = Math.max(0, (m.liveUs || 0) - 1);
    else if (entry.team === 'them') patch.liveThem = Math.max(0, (m.liveThem || 0) - 1);
    patchMatch(patch);
    if (entry.team === 'us' && entry.scorerId) {
      setPlayers(ps => ps.map(x => x.id === entry.scorerId ? { ...x, dp: Math.max(0, (x.dp || 0) - 1) } : x));
    }
  }
  function updateLogEntry(idx, changes) {
    patchMatch({ goalLog: (m.goalLog || []).map((e, i) => i === idx ? { ...e, ...changes } : e) });
  }
  // Eén gedeelde tekst-opmaak voor een logregel (doelpunt of commentaar), zodat zowel de
  // Live-pagina (huidige wedstrijd, via scoreFxObj) als een opgeslagen wedstrijdverslag (oude,
  // afgelopen wedstrijd, via de wedstrijd zelf) dezelfde regel tonen — daarom home/opponentName
  // als losse parameters i.p.v. rechtstreeks scoreFxObj/m te gebruiken.
  function formatMatchLogEntry(g, home, opponentName) {
    if (g.team === 'note') return g.minute + 'e minuut: ' + g.text;
    const first = home ? g.atUs : g.atThem;
    const second = home ? g.atThem : g.atUs;
    if (g.team === 'us') {
      return g.minute + 'e minuut: ' + (g.scorerName || ownTeamName) + ' scoort voor ' + ownTeamName + ' — ' + first + '–' + second + (g.remark ? '. ' + g.remark : '');
    }
    return g.minute + 'e minuut: ' + opponentName + ' scoort — ' + first + '–' + second;
  }
  // "−" corrigeert een misklik: verwijdert de laatste logregel van DIT team (zodat een verkeerd
  // toegekend doelpunt van de tegenstander corrigeren het eigen scoreverloop niet doorelkaar
  // haalt) via removeLogEntry hierboven.
  function undoLastGoal(team) {
    const log = m.goalLog || [];
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].team === team) { removeLogEntry(i); return; }
    }
    patchMatch(team === 'us' ? { liveUs: Math.max(0, (m.liveUs || 0) - 1) } : { liveThem: Math.max(0, (m.liveThem || 0) - 1) });
  }
  function endMatch() {
    patchMatch({ liveEnded: true });
    if (scoreFxObj) {
      // Het wedstrijdverslag wordt op de wedstrijd zelf bewaard (niet op het tijdelijke
      // match-object) zodat het blijft bestaan ook als de coach later een heel andere wedstrijd
      // in wedstrijdmodus opent - Wedstrijdverslagen leest straks rechtstreeks uit fixtures.
      setFixtures(fs => fs.map(f => f.id === scoreFxObj.id
        ? { ...f, gf: String(f.home ? (m.liveUs || 0) : (m.liveThem || 0)), ga: String(f.home ? (m.liveThem || 0) : (m.liveUs || 0)), report: m.goalLog || [] }
        : f));
    }
    setEndMatchConfirm(false);
  }

  // Wedstrijdmodus-inhoud: geen eigen header/toggle meer (die zit nu vast in de app-header, zie
  // hieronder) - dit is puur de sectie die de navigatiebalk + tabinhoud vervangt.
  let matchModeContent = null;
  if (matchMode && isMyTeam) {
    const qHalf = halves[liveQuarter];
    const qScRows = scBlockRows.slice(2 * liveQuarter, 2 * liveQuarter + 2);
    // Zelfde thuis/uit-conventie als scheduleTitle hierboven: zonder gekoppelde wedstrijd staat
    // het eigen team standaard vooraan (thuis).
    const homeIsUs = !(scoreFxObj && scoreFxObj.home === false);
    const opponentName = m.opponent || (scoreFxObj && scoreFxObj.opponent) || 'Tegenstander';
    const liveHomeName = homeIsUs ? ownTeamName : opponentName;
    const liveAwayName = homeIsUs ? opponentName : ownTeamName;
    const liveCounters = [
      { key: 'home', name: liveHomeName, isUs: homeIsUs },
      { key: 'away', name: liveAwayName, isUs: !homeIsUs },
    ];
    const scorerOptions = players.filter(p => (m.selected || []).includes(p.id));
    // Zolang de coach het veld niet zelf heeft aangeraakt, loopt het gewoon live mee met de
    // aftelklok - dat scheelt uitzoeken wat de huidige stand ook alweer was voordat je 'm even
    // bijstelt. Zodra je begint te typen, staat manualClockInput niet meer leeg en wint dat.
    const manualClockValue = manualClockInput || fmtTimerPadded(timerRemainingMs);
    const manualMatch = /^(\d{1,2}):(\d{2})$/.exec(manualClockValue.trim());

    matchModeContent = (
      <main style={css('padding-top:var(--space-6);display:flex;justify-content:center')}>
        <div style={css('display:flex;flex-direction:column;gap:var(--space-3);width:100%;max-width:640px')}>

          <label style={css('display:flex;align-items:center;gap:var(--space-2);font-size:15px;cursor:pointer;white-space:nowrap')}>
            <input type="checkbox" checked={!!m.liveOpened} onChange={e => patchMatch({ liveOpened: e.target.checked })} />
            <span>Start wedstrijd — zichtbaar voor iedereen</span>
            <InfoDot text="Maakt de Live-pagina zichtbaar voor iedereen die dit team heeft geselecteerd." />
          </label>

          {/* Klok, live stand, kwart-keuze en commentaar/beëindigen zijn pas te bedienen zodra
              "Start wedstrijd" is aangevinkt - anders zou de coach kunnen scoren/de klok kunnen
              starten zonder dat dit voor wie dan ook live zichtbaar is. */}
          {!m.liveOpened && (
            <p style={css('margin:0;font-size:13px;color:var(--color-neutral-700)')}>Vink hierboven Start wedstrijd aan om de klok, live stand en commentaar te gebruiken.</p>
          )}
          <div style={css(m.liveOpened ? '' : 'opacity:0.45;pointer-events:none')}>
          <div style={css('display:flex;flex-direction:column;gap:var(--space-3)')}>

          <div className="card elev-md" style={css('padding:6px var(--space-3);display:flex;flex-direction:column;gap:6px')}>
            <div style={css('display:flex;align-items:center;gap:var(--space-3)')}>
              {activeClock.running
                ? <button type="button" className="btn btn-secondary" onClick={timerPause}>Pauze</button>
                : <button type="button" className="btn btn-primary" onClick={timerStart}>Start</button>}
              <span style={css('font-family:var(--font-heading);font-size:32px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1')}>{fmtTimer(timerRemainingMs)}</span>
              <button type="button" className="btn btn-ghost" style={css('margin-left:auto')} onClick={timerReset}>Reset</button>
            </div>
            <div style={css('display:flex;align-items:center;gap:6px')}>
              <span style={css('font-size:13px;color:var(--color-neutral-700)')}>Klok handmatig zetten</span>
              <input className="input" type="time" min="00:00" max="17:30" aria-label="Klok handmatig zetten — linker veld minuten, rechter veld seconden" style={css('padding:2px 4px;width:90px;font-size:13px')} value={manualClockValue} onChange={e => setManualClockInput(e.target.value)} />
              <button type="button" className="btn btn-ghost" disabled={!manualMatch} onClick={() => { timerSetManual(manualMatch[1], manualMatch[2]); setManualClockInput(''); }}>Zet</button>
            </div>
            {timerAlertActive && (
              <div style={css('display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);padding:var(--space-2) var(--space-3);border-radius:var(--radius-md);background:var(--color-accent-2-100);color:var(--color-accent-2-800);font-weight:600;text-wrap:pretty')}>
                <span className="blink-alert">🔔 Bijna halverwege — tijd om te wisselen</span>
                <button type="button" className="btn btn-ghost" onClick={timerDismissAlert}>Zet uit</button>
              </div>
            )}
          </div>

          <div className="card elev-sm" style={css('padding:var(--space-2) var(--space-4);display:flex;flex-direction:column;gap:6px')}>
            <div style={css('display:flex;align-items:baseline;justify-content:space-between')}>
              <span style={css('font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-neutral-700)')}>Live stand{m.liveEnded ? ' (afgesloten)' : ''}</span>
              {!m.liveEnded && (
                <button type="button" className="btn btn-ghost" style={css('padding:2px 4px;font-size:13px')} onClick={() => patchMatch({ liveUs: 0, liveThem: 0, goalLog: [] })}>Reset</button>
              )}
            </div>
            <div style={css('display:flex;align-items:center;justify-content:space-around;gap:var(--space-3)')}>
              {liveCounters.map(c => (
                <div key={c.key} style={css('display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0')}>
                  <span style={css('font-size:13px;font-weight:600;text-align:center;text-wrap:pretty')}>{c.name}</span>
                  <div style={css('display:flex;align-items:center;gap:10px')}>
                    {!m.liveEnded && (
                      <button type="button" className="btn btn-secondary" style={css('width:36px;height:36px;padding:0;font-size:18px;line-height:1')} onClick={() => undoLastGoal(c.isUs ? 'us' : 'them')}>−</button>
                    )}
                    <span style={css('font-family:var(--font-heading);font-size:30px;font-weight:600;font-variant-numeric:tabular-nums;min-width:32px;text-align:center')}>{(c.isUs ? m.liveUs : m.liveThem) || 0}</span>
                    {!m.liveEnded && (
                      <button type="button" className="btn btn-secondary" style={css('width:36px;height:36px;padding:0;font-size:18px;line-height:1')}
                        onClick={() => { setMinuteInput(String(elapsedMatchMinutes())); if (c.isUs) { setGoalRemark(''); setScorerSelected(null); setScorerPicker(true); } else { setThemGoalDialog(true); } }}>+</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {scorerPicker && (
            <div className="dialog-backdrop" data-noprint="1" style={css('position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:var(--space-4)')} onClick={() => { setScorerPicker(false); setScorerSelected(null); setGoalRemark(''); }}>
              <div className="dialog elev-lg" style={css('max-width:360px;width:100%;max-height:80vh;overflow:hidden;padding:var(--space-4)')} onClick={e => e.stopPropagation()}>
                <div className="dialog-title" style={css('font-family:var(--font-heading);font-size:20px')}>Wie scoorde?</div>
                <div className="dialog-body" style={css('display:flex;flex-direction:column;gap:5px;overflow-y:auto;min-height:0;flex:1')}>
                  <label style={css('display:flex;align-items:center;gap:8px;font-size:14px;color:var(--color-neutral-700)')}>
                    Minuut
                    <input className="input" type="number" min="1" style={css('width:60px;padding:4px 6px;text-align:center')} value={minuteInput} onChange={e => setMinuteInput(e.target.value)} />
                  </label>
                  {scorerOptions.map(p => (
                    <button key={p.id} type="button" className={scorerSelected === p.id ? 'btn btn-primary' : 'btn btn-secondary'} style={css('justify-content:flex-start')} onClick={() => setScorerSelected(p.id)}>{displayFirst(p)}</button>
                  ))}
                  {!scorerOptions.length && <p style={css('margin:0;font-size:14px;color:var(--color-neutral-700)')}>Geen speelsters geselecteerd voor deze wedstrijd.</p>}
                  <textarea className="input" placeholder="Opmerking over dit doelpunt (optioneel)" style={css('margin-top:8px;min-height:60px;resize:vertical;font-family:inherit')} value={goalRemark} onChange={e => setGoalRemark(e.target.value)} />
                </div>
                <div className="dialog-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => { setScorerPicker(false); setScorerSelected(null); setGoalRemark(''); }}>Annuleren</button>
                  <button type="button" className="btn btn-primary" disabled={!scorerSelected} onClick={() => logGoalUs(byId(scorerSelected), goalRemark, minuteInput)}>OK</button>
                </div>
              </div>
            </div>
          )}

          {themGoalDialog && (
            <div className="dialog-backdrop" data-noprint="1" style={css('position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:var(--space-4)')} onClick={() => setThemGoalDialog(false)}>
              <div className="dialog elev-lg" style={css('max-width:360px;width:100%;padding:var(--space-4)')} onClick={e => e.stopPropagation()}>
                <div className="dialog-title" style={css('font-family:var(--font-heading);font-size:20px')}>Wanneer scoorde {opponentName}?</div>
                <div className="dialog-body">
                  <label style={css('display:flex;align-items:center;gap:8px;font-size:14px;color:var(--color-neutral-700)')}>
                    Minuut
                    <input className="input" type="number" min="1" style={css('width:60px;padding:4px 6px;text-align:center')} value={minuteInput} onChange={e => setMinuteInput(e.target.value)} autoFocus />
                  </label>
                </div>
                <div className="dialog-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setThemGoalDialog(false)}>Annuleren</button>
                  <button type="button" className="btn btn-primary" onClick={() => logGoalThem(minuteInput)}>Toevoegen</button>
                </div>
              </div>
            </div>
          )}

          {editEntryIdx !== null && (
            <div className="dialog-backdrop" data-noprint="1" style={css('position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:var(--space-4)')} onClick={() => setEditEntryIdx(null)}>
              <div className="dialog elev-lg" style={css('max-width:400px;width:100%;padding:var(--space-4)')} onClick={e => e.stopPropagation()}>
                <div className="dialog-title" style={css('font-family:var(--font-heading);font-size:20px')}>Logregel bewerken</div>
                <div className="dialog-body" style={css('display:flex;flex-direction:column;gap:var(--space-2)')}>
                  <label style={css('display:flex;align-items:center;gap:8px;font-size:14px;color:var(--color-neutral-700)')}>
                    Minuut
                    <input className="input" type="number" min="1" style={css('width:60px;padding:4px 6px;text-align:center')} value={editMinute} onChange={e => setEditMinute(e.target.value)} />
                  </label>
                  {(m.goalLog[editEntryIdx].team === 'note' || m.goalLog[editEntryIdx].team === 'us') && (
                    <textarea className="input" placeholder={m.goalLog[editEntryIdx].team === 'note' ? 'Commentaar' : 'Opmerking over dit doelpunt (optioneel)'} style={css('min-height:70px;resize:vertical;font-family:inherit')} value={editText} onChange={e => setEditText(e.target.value)} />
                  )}
                </div>
                <div className="dialog-actions" style={css('justify-content:space-between')}>
                  <button type="button" className="btn btn-ghost" style={css('color:#c23b3b')} onClick={() => { removeLogEntry(editEntryIdx); setEditEntryIdx(null); }}>Verwijderen</button>
                  <span style={css('display:flex;gap:var(--space-2)')}>
                    <button type="button" className="btn btn-ghost" onClick={() => setEditEntryIdx(null)}>Annuleren</button>
                    <button type="button" className="btn btn-primary" onClick={() => {
                      const entry = m.goalLog[editEntryIdx];
                      const changes = { minute: Math.max(1, Number(editMinute) || entry.minute) };
                      if (entry.team === 'note') changes.text = editText.trim();
                      else if (entry.team === 'us') changes.remark = editText.trim() || undefined;
                      updateLogEntry(editEntryIdx, changes);
                      setEditEntryIdx(null);
                    }}>Opslaan</button>
                  </span>
                </div>
              </div>
            </div>
          )}

          <select className="input" aria-label="Kwart" style={css('font-size:16px;padding:8px 10px')} value={String(liveQuarter)} onChange={e => patchMatch({ liveQuarter: Number(e.target.value) })}>
            <option value="0">Kwart 1</option>
            <option value="1">Kwart 2</option>
            <option value="2">Kwart 3</option>
            <option value="3">Kwart 4</option>
          </select>

          <div style={css('display:flex;gap:var(--space-2);flex-wrap:wrap')}>
            <button type="button" className="btn btn-secondary" style={css('flex:1;min-width:140px')} disabled={readOnly} onClick={() => openTeamNoteEditor(liveQuarter)}>+ Teamnotitie</button>
            {m.liveMatchStarted && !m.liveEnded && (
              <button type="button" className="btn btn-secondary" style={css('flex:1;min-width:140px')} onClick={() => { setMinuteInput(String(elapsedMatchMinutes())); setCommentDialog(true); }}>Extra live commentaar</button>
            )}
            {m.liveMatchStarted && !m.liveEnded && (
              <button type="button" className="btn btn-secondary" style={css('flex:1;min-width:140px')} onClick={() => setEndMatchConfirm(true)}>Wedstrijd beëindigen</button>
            )}
          </div>

          {commentDialog && (
            <div className="dialog-backdrop" data-noprint="1" style={css('position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:var(--space-4)')} onClick={() => { setCommentDialog(false); setCommentText(''); }}>
              <div className="dialog elev-lg" style={css('max-width:400px;width:100%;padding:var(--space-4)')} onClick={e => e.stopPropagation()}>
                <div className="dialog-title" style={css('font-family:var(--font-heading);font-size:20px')}>Extra live commentaar</div>
                <div className="dialog-body" style={css('display:flex;flex-direction:column;gap:var(--space-2)')}>
                  <label style={css('display:flex;align-items:center;gap:8px;font-size:14px;color:var(--color-neutral-700)')}>
                    Minuut
                    <input className="input" type="number" min="1" style={css('width:60px;padding:4px 6px;text-align:center')} value={minuteInput} onChange={e => setMinuteInput(e.target.value)} />
                  </label>
                  <textarea className="input" placeholder="Bv. Speelster van Alphen krijgt rood" style={css('width:100%;min-height:80px;resize:vertical;font-family:inherit')} value={commentText} onChange={e => setCommentText(e.target.value)} autoFocus />
                </div>
                <div className="dialog-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => { setCommentDialog(false); setCommentText(''); }}>Annuleren</button>
                  <button type="button" className="btn btn-primary" disabled={!commentText.trim()} onClick={() => logNote(commentText, minuteInput)}>Toevoegen</button>
                </div>
              </div>
            </div>
          )}

          {endMatchConfirm && (
            <div className="dialog-backdrop" data-noprint="1" style={css('position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:var(--space-4)')} onClick={() => setEndMatchConfirm(false)}>
              <div className="dialog elev-lg" style={css('max-width:400px;width:100%;padding:var(--space-4)')} onClick={e => e.stopPropagation()}>
                <div className="dialog-title" style={css('font-family:var(--font-heading);font-size:20px')}>Wedstrijd beëindigen</div>
                <div className="dialog-body" style={css('display:flex;flex-direction:column;gap:var(--space-2)')}>
                  <p style={css('margin:0;font-size:16px')}>Klopt de eindstand {scheduleTitle} · {liveScoreText()}?</p>
                  <p style={css('margin:0;font-size:14px;color:var(--color-neutral-700)')}>Deze stand wordt dan definitief ingevuld bij Programma.</p>
                </div>
                <div className="dialog-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setEndMatchConfirm(false)}>Annuleren</button>
                  <button type="button" className="btn btn-primary" onClick={endMatch}>Klopt, beëindigen</button>
                </div>
              </div>
            </div>
          )}

          </div>
          </div>

          {!sched && (
            <p style={css('margin:0;font-size:15px;color:var(--color-neutral-700)')}>Nog geen schema opgeslagen voor deze wedstrijd — dat kan buiten wedstrijdmodus onder Wedstrijdschema.</p>
          )}

          {sched && qHalf && (
            <div style={css('display:flex;flex-direction:column;gap:var(--space-2)')}>
              {halfCard(qHalf)}
            </div>
          )}

          {sched && qHalf && (
            <div style={css('display:flex;flex-direction:column;gap:4px')}>
              <h3 style={css('font-family:var(--font-heading);font-size:17px;margin:0;font-weight:600')}>Strafcorner</h3>
              {scBlockTable(qScRows)}
            </div>
          )}

          {(m.goalLog || []).length > 0 && (
            <div className="card elev-sm" style={css('padding:var(--space-2) var(--space-4);display:flex;flex-direction:column;gap:6px')}>
              <span style={css('font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-neutral-700)')}>Scoreverloop</span>
              <ul style={css('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px')}>
                {(m.goalLog || []).map((g, i) => (
                  <li key={i} style={css('display:flex;align-items:center;justify-content:space-between;gap:var(--space-2);font-size:14px;padding:6px 10px;border-radius:var(--radius-md);background:var(--color-neutral-100)')}>
                    <span style={css('text-wrap:pretty')}>{formatMatchLogEntry(g, !(scoreFxObj && scoreFxObj.home === false), opponentName)}</span>
                    {!m.liveEnded && (
                      <button type="button" className="btn btn-ghost" style={css('padding:2px 6px;font-size:13px;flex:0 0 auto')}
                        onClick={() => { setEditEntryIdx(i); setEditMinute(String(g.minute)); setEditText(g.team === 'note' ? g.text : (g.remark || '')); }}>Bewerken</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {positionEditorDialog}
          {positionRelocatorDialog}
          {noteEditorDialog}
        </div>
      </main>
    );
  }

  return (
    <div data-sheet="1" style={css('position:relative;z-index:0;min-height:100vh;background:var(--color-bg);color:var(--color-text);font-family:var(--font-body);padding:var(--space-6) var(--space-8) var(--space-8);max-width:1180px;margin:0 auto')}>

      {/* Watermerk: position:fixed t.o.v. de viewport (niet absolute t.o.v. deze - lange -
          pagina), zodat het op elke pagina in het midden van het scherm blijft staan en niet
          meescrollt. Negatieve z-index plaatst 'm ná de achtergrond maar vóór alle gewone
          (niet-gepositioneerde) inhoud - anders zou hij juist BOVEN de gewone inhoud tekenen,
          ondanks dat hij als eerste in de DOM staat. */}
      <img src="/hcrb.png" alt="" aria-hidden="true" data-noprint="1" style={css('position:fixed;top:220px;right:max(var(--space-8),calc((100vw - 1180px) / 2 + var(--space-8)));width:min(12.5vw,120px);height:auto;opacity:0.06;filter:grayscale(1);pointer-events:none;user-select:none;z-index:-1')} />

      <header data-noprint="1" style={css('display:flex;flex-direction:column;gap:6px')}>
        <div style={css('height:4px;background:var(--color-text)')}></div>
        <div style={css('display:flex;align-items:center;gap:var(--space-3);padding-top:2px')}>
          <img src="/hcrb.png" alt="HCRB" style={css('height:48px;width:auto')} />
          <div style={css('display:flex;flex-direction:column;gap:4px;flex:1;min-width:0')}>
            <h1 style={css('font-family:var(--font-heading);font-weight:600;font-size:28px;line-height:1.15;margin:0;letter-spacing:-0.01em')}>{m.opponent ? scheduleTitle : ownTeamName}</h1>
            <div data-noprint="1" style={css('display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap')}>
              <div style={css('display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap')}>
                <div className="field" style={css('margin:0;min-width:170px')}>
                  <select className="input" aria-label="Team" style={css('padding:4px 6px;font-size:13px')} value={currentTeamId || ''}
                    onChange={e => setCurrentTeamId(e.target.value)}>
                    {!teams.length && <option value="">Nog geen teams</option>}
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                {(liveStatus() || standingsLine || m.opponent) && (
                  <div style={css('display:flex;flex-direction:column;gap:1px')}>
                    {liveStatus() && liveStatus().label && (
                      <span style={css('font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;color:#c23b3b')}>{liveStatus().label}</span>
                    )}
                    <span style={css('font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-neutral-700)')}>
                      {liveStatus() ? liveStatus().line : (standingsLine || dateline)}
                    </span>
                  </div>
                )}
              </div>
              <div style={css('display:flex;align-items:center;gap:8px;margin-left:auto')}>
                {isMyTeam && (
                  <button type="button" className={matchMode ? 'btn btn-secondary' : 'btn btn-primary'} style={css('font-size:13px;padding:5px 10px')}
                    onClick={() => setMatchMode(v => !v)}>{matchMode ? 'Wedstrijdmodus uit' : 'Wedstrijdmodus'}</button>
                )}
                {matchMode && isMyTeam && (
                  <button type="button" className="btn btn-ghost" aria-label={isFullscreen ? 'Volledig scherm uit' : 'Volledig scherm'}
                    title={isFullscreen ? 'Volledig scherm uit' : 'Volledig scherm'} style={css('padding:6px;line-height:0')} onClick={toggleFullscreen}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d={isFullscreen ? ICON_FULLSCREEN_EXIT : ICON_FULLSCREEN} />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div data-noprint="1" style={css('display:flex;justify-content:flex-end')}>
          {user ? (
            <div style={css('display:flex;align-items:center;gap:var(--space-2);font-size:13px')}>
              <span style={css('color:var(--color-neutral-700)')}>{user.email}{isAdmin ? ' · admin' : (myRoleForCurrentTeam ? ` · ${myRoleForCurrentTeam}` : '')}</span>
              <button type="button" className="btn btn-secondary" style={css('font-size:13px;padding:4px 8px')} onClick={logout}>Uitloggen</button>
            </div>
          ) : (
            <button type="button" className="btn btn-primary" style={css('font-size:13px;padding:4px 8px')} onClick={() => setLoginOpen(true)}>Inloggen</button>
          )}
        </div>
        {!(matchMode && isMyTeam) && (
          <>
            <div style={css('height:1px;background:var(--color-text);margin-top:var(--space-1)')}></div>
            {/* Desktop: ongewijzigd t.o.v. voor het "Meer"-menu (platte lijst voor een niet-coach,
                Meer aan het eind voor een coach) - welke van de twee <nav>'s zichtbaar is, bepaalt
                puur de .nav-desktop/.nav-mobile-CSS in index.css, geen React-state. */}
            <nav data-noprint="1" className="nav-desktop" style={css('display:flex;gap:var(--space-4);padding-top:var(--space-1);flex-wrap:wrap;align-items:center')}>
              {desktopPrimaryTabs.map(t => <button key={t.key} type="button" onClick={t.go} style={css(t.style)}>{t.label}</button>)}
              {moreMenuButton(desktopMoreTabs, desktopMoreMenuActive, desktopMoreMenuRef)}
            </nav>
            {/* Mobiel: alleen Programma, Standen en Meer - past altijd op één regel, geen
                swipen/scrollen nodig. */}
            <nav data-noprint="1" className="nav-mobile" style={css('display:flex;align-items:center;gap:var(--space-3);padding-top:var(--space-1);min-width:0')}>
              {mobilePrimaryTabs.map(t => <button key={t.key} type="button" onClick={t.go} style={css(t.style + ';white-space:nowrap;flex:0 0 auto')}>{t.label}</button>)}
              {moreMenuButton(mobileMoreTabs, mobileMoreMenuActive, mobileMoreMenuRef)}
            </nav>
          </>
        )}
      </header>

      {loginOpen && <Login onClose={() => setLoginOpen(false)} />}

      {matchMode && isMyTeam ? matchModeContent : (<>

      {tab === 'wedstrijd' && (isMyTeam ? (
        <main style={css('padding-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-8)')}>

          <section data-noprint="1" style={css('display:flex;flex-direction:column;gap:var(--space-4)')}>
            <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0;font-weight:600')}>De wedstrijd</h2>
            <div className="field" style={css('max-width:500px')}>
              <label htmlFor="fx">Wedstrijd</label>
              <select className="input" id="fx" value={m.fixtureId || ''} onChange={e => {
                const f = fixtures.find(x => x.id === e.target.value);
                if (!f) {
                  patchMatch({
                    fixtureId: '', opponent: '', date: '', selected: [], keeperId: '', keeper2Id: '', keeperSwitches: false, keepersPlayOut: false, schedule: null, injuries: {}, locked: false, notes: [],
                    // Live-velden mee leegmaken - anders zou een uitgelogde bezoeker een verweesd
                    // Live-tabblad kunnen blijven zien voor een wedstrijd die niet meer gekozen is.
                    liveOpened: false, liveMatchStarted: false, liveEnded: false, liveQuarter: 0, clocks: {}, goalLog: [], liveUs: 0, liveThem: 0,
                  });
                  return;
                }
                loadFixture(f);
              }}>
                <option value="">— kies een wedstrijd uit het programma —</option>
                {matchOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          </section>

          {matchLocked && (
            <div className="card elev-md" data-noprint="1" style={css('padding:var(--space-3) var(--space-4);display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap')}>
              <span style={css('font-size:16px')}>Dit schema is opgeslagen en staat op alleen-lezen.</span>
              <button type="button" className="btn btn-secondary" disabled={readOnly} onClick={reopenMatch}>Bewerken heropenen</button>
            </div>
          )}

          <section data-noprint="1" style={css('display:flex;flex-direction:column;gap:var(--space-3)')}>
            <div style={css('display:flex;align-items:baseline;gap:var(--space-3);flex-wrap:wrap')}>
              <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0;font-weight:600')}>Stap 1 — Selectie</h2>
              <span style={css('font-size:15px;color:var(--color-neutral-700)')}>
                {nSel} geselecteerd · {Math.max(0, nSel - 1)} veldspeelsters · {nSel >= 11 ? Math.max(0, nSel - 11) + ' op de bank per helft' : 'te weinig voor een volledig team'}
              </span>
            </div>
            <div>
              <div style={css('font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-neutral-700);padding-bottom:6px')}>Team</div>
              <div style={css('display:flex;flex-wrap:wrap;gap:var(--space-2)')}>
                {vastePlayers.map(p => { const c = chipFor(p.id); return <button key={c.key} type="button" disabled={matchLocked || readOnly} onClick={c.toggle} style={css(c.style)}>{c.label}</button>; })}
              </div>
            </div>
            <div>
              <div style={css('font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-neutral-700);padding-bottom:6px')}>Invallers</div>
              <div style={css('display:flex;flex-wrap:wrap;gap:var(--space-2)')}>
                {invallerPlayers.map(p => { const c = chipFor(p.id); return <button key={c.key} type="button" disabled={matchLocked || readOnly} onClick={c.toggle} style={css(c.style)}>{c.label}</button>; })}
                {!players.some(p => p.sub) && <span style={css('font-size:15px;color:var(--color-neutral-700)')}>Nog geen invallers toegevoegd — dat kan onder Team.</span>}
              </div>
            </div>
            <div style={css('display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap')}>
              <button type="button" className="btn btn-ghost" disabled={matchLocked || readOnly} onClick={() => patchMatch({ selected: vastePlayers.map(p => p.id) })}>Vaste spelers selecteren</button>
              <button type="button" className="btn btn-ghost" disabled={matchLocked || readOnly} onClick={() => patchMatch({ selected: players.map(p => p.id) })}>Ook invallers selecteren</button>
              <button type="button" className="btn btn-ghost" disabled={matchLocked || readOnly} onClick={() => patchMatch({ selected: [], keeperId: '', schedule: null, injuries: {} })}>Selectie wissen</button>
            </div>
          </section>

          <section data-noprint="1" style={css('display:flex;flex-direction:column;gap:var(--space-4)')}>
            <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0;font-weight:600')}>Stap 2 — Keeper</h2>
            <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:var(--space-4);max-width:600px')}>
              <div className="field">
                <label htmlFor="kp">Keeper</label>
                <select className="input" id="kp" disabled={matchLocked || readOnly} value={m.keeperId || ''} onChange={e => patchMatch({ keeperId: e.target.value })}>
                  <option value="">— kies keeper —</option>
                  {keeperOptions.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
              </div>
              {m.keeperSwitches && (
                <div className="field">
                  <label htmlFor="kp2">Keeper 2e helft (na de rust)</label>
                  <select className="input" id="kp2" disabled={matchLocked || readOnly} value={m.keeper2Id || ''} onChange={e => patchMatch({ keeper2Id: e.target.value, schedule: null })}>
                    <option value="">— kies keeper —</option>
                    {keeperOptions.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select>
                </div>
              )}
            </div>
            <label style={css('display:flex;align-items:center;gap:var(--space-2);font-size:16px;cursor:pointer')}>
              <input type="checkbox" checked={!!m.keeperSwitches} disabled={matchLocked || readOnly} onChange={e => patchMatch({ keeperSwitches: e.target.checked, keeper2Id: e.target.checked ? m.keeper2Id : '', keepersPlayOut: e.target.checked ? m.keepersPlayOut : false, schedule: null })} />
              <span>Keeper wisselt na 2 kwarten (na de rust)</span>
            </label>
            {m.keeperSwitches && (
              <label style={css('display:flex;align-items:center;gap:var(--space-2);font-size:16px;cursor:pointer')}>
                <input type="checkbox" checked={!!m.keepersPlayOut} disabled={matchLocked || readOnly} onChange={e => patchMatch({ keepersPlayOut: e.target.checked, schedule: null })} />
                <span>Keepers spelen in de helft dat ze niet keepen mee in het veld</span>
              </label>
            )}
            <div className="card elev-sm" style={css('padding:var(--space-3) var(--space-4)')}>
              <p style={css('margin:0;font-size:16px;max-width:65ch;text-wrap:pretty')}>{keeperHint}</p>
            </div>
            <div>
              <div style={css('font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-neutral-700);padding-bottom:6px')}>Speeltijdverdeling</div>
              <div style={css('display:flex;flex-direction:column;gap:8px')}>
                <label style={css('display:flex;align-items:center;gap:var(--space-2);font-size:16px;cursor:pointer')}>
                  <input type="radio" name="ptmode" checked={m.playTimeMode === 'standaard'} disabled={matchLocked || readOnly}
                    onChange={() => patchMatch({ playTimeMode: 'standaard', schedule: null })} />
                  <span>Standaard tegenstander — op voorkeurspositie, ongeacht sterkte</span>
                </label>
                <label style={css('display:flex;align-items:center;gap:var(--space-2);font-size:16px;cursor:pointer')}>
                  <input type="radio" name="ptmode" checked={(m.playTimeMode || 'sterk') === 'sterk'} disabled={matchLocked || readOnly}
                    onChange={() => patchMatch({ playTimeMode: 'sterk', schedule: null })} />
                  <span>Sterke tegenstander — sterkste speelsters iets meer</span>
                </label>
                <label style={css('display:flex;align-items:center;gap:var(--space-2);font-size:16px;cursor:pointer')}>
                  <input type="radio" name="ptmode" checked={m.playTimeMode === 'zwak'} disabled={matchLocked || readOnly}
                    onChange={() => patchMatch({ playTimeMode: 'zwak', schedule: null })} />
                  <span>Zwakke tegenstander — minder sterke speelsters iets meer</span>
                </label>
              </div>
            </div>
            <div>
              <div style={css('font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-neutral-700);padding-bottom:6px')}>Positietoewijzing</div>
              <div style={css('display:grid;grid-template-columns:max-content 44px 1fr;align-items:center;column-gap:var(--space-3);row-gap:10px;font-size:16px')}>
                <span style={css('display:inline-flex;align-items:center;gap:6px')}>
                  <span>Zone-sterkte</span>
                  <InfoDot text="De posities in het midden (de as) worden bij voorkeur bemand met de sterkste speelsters, gevolgd door rechts, dan links. Uit: positie wordt alleen bepaald door voorkeur en continuïteit, ongeacht sterkte." />
                </span>
                <Switch checked={m.zoneStrength !== false} disabled={matchLocked || readOnly}
                  onChange={v => patchMatch({ zoneStrength: v, schedule: null })} />
                <span style={css('font-size:14px;color:var(--color-neutral-700)')}>
                  {m.zoneStrength !== false ? 'Meer kans op sterkste spelers in de as' : 'Minder kans op sterkste spelers in de as'}
                </span>

                <span style={css('display:inline-flex;align-items:center;gap:6px')}>
                  <span>Continuïteit</span>
                  <InfoDot text="Een lichte voorkeur om een speelster in hetzelfde speelblok op dezelfde positie te laten staan als in het blok ervoor, zodat ze niet steeds van positie hoeft te wisselen. Uit: positie wordt elk blok volledig opnieuw bepaald." />
                </span>
                <Switch checked={m.continuity !== false} disabled={matchLocked || readOnly}
                  onChange={v => patchMatch({ continuity: v, schedule: null })} />
                <span style={css('font-size:14px;color:var(--color-neutral-700)')}>
                  {m.continuity !== false ? 'Meer kans op dezelfde positie als vorig blok' : 'Minder kans op dezelfde positie als vorig blok'}
                </span>

                <span style={css('display:inline-flex;align-items:center;gap:6px')}>
                  <span>Correctieronde op voorkeur</span>
                  <InfoDot text="Na het indelen van een speelblok wordt gecontroleerd of iemand op een positie staat waar ze geen voorkeur voor heeft. Zo ja, dan wordt geprobeerd haar te ruilen met een bankspeelster die daar wél een voorkeur voor heeft — ook als dat voor dat blok ten koste gaat van de eerlijke speeltijdverdeling. Uit: speeltijd-eerlijkheid wijkt nooit voor positievoorkeur." />
                </span>
                <Switch checked={m.prefCorrection !== false} disabled={matchLocked || readOnly}
                  onChange={v => patchMatch({ prefCorrection: v, schedule: null })} />
                <span style={css('font-size:14px;color:var(--color-neutral-700)')}>
                  {m.prefCorrection !== false ? 'Meer kans op ongelijke speeltijd' : 'Minder kans op ongelijke speeltijd'}
                </span>
              </div>
            </div>
          </section>

          <section data-noprint="1" style={css('display:flex;flex-direction:column;gap:var(--space-3)')}>
            <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0;font-weight:600')}>Stap 3 — Schema</h2>
            <div style={css('display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap')}>
              <button type="button" className="btn btn-primary" disabled={matchLocked || readOnly} onClick={generate}>{sched ? 'Schema opnieuw maken' : 'Maak schema'}</button>
              <span style={css('font-size:15px;color:var(--color-accent-2-700)')}>{generateWarning}</span>
            </div>
            {selectionChangedSinceSchedule && (
              <div className="card elev-sm" style={css('padding:var(--space-3) var(--space-4);background:var(--color-accent-2-100);color:var(--color-accent-2-800)')}>
                De selectie is gewijzigd sinds dit schema is gemaakt. Klik op "Schema opnieuw maken" om de toegevoegde of verwijderde speelster(s) mee te nemen — het schema hieronder is nog gebaseerd op de vorige selectie.
              </div>
            )}
          </section>

          {sched && (
            <section style={css('display:flex;flex-direction:column;gap:var(--space-6)')}>

              <div data-noprint="1" style={css('display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-4);flex-wrap:wrap')}>
                <h2 style={css('font-family:var(--font-heading);font-size:30px;margin:0;font-weight:600')}>{scheduleTitle}</h2>
                <div style={css('display:flex;gap:var(--space-2);align-items:center;flex-wrap:wrap')}>
                  <button type="button" className="btn btn-secondary" onClick={() => setPrintDialogOpen(true)}>Printen</button>
                </div>
              </div>

              {printDialogOpen && (
                <div className="dialog-backdrop" data-noprint="1" onClick={() => setPrintDialogOpen(false)}>
                  <div className="dialog" onClick={e => e.stopPropagation()}>
                    <div className="dialog-title">Wat wil je meeprinten?</div>
                    <p className="dialog-body" style={css('margin:0')}>Kies welke onderdelen mee moeten printen.</p>
                    <label style={css('display:flex;align-items:center;gap:var(--space-2);font-size:16px;cursor:pointer')}>
                      <input type="checkbox" checked={printOptions.wedstrijdschema} onChange={e => setPrintOptions(o => ({ ...o, wedstrijdschema: e.target.checked }))} />
                      <span>Wedstrijdschema</span>
                    </label>
                    <label style={css('display:flex;align-items:center;gap:var(--space-2);font-size:16px;cursor:pointer')}>
                      <input type="checkbox" checked={printOptions.strafcorner} onChange={e => setPrintOptions(o => ({ ...o, strafcorner: e.target.checked }))} />
                      <span>Strafcorner</span>
                    </label>
                    <label style={css('display:flex;align-items:center;gap:var(--space-2);font-size:16px;cursor:pointer')}>
                      <input type="checkbox" checked={printOptions.speeltijd} onChange={e => setPrintOptions(o => ({ ...o, speeltijd: e.target.checked }))} />
                      <span>Speeltijd deze wedstrijd</span>
                    </label>
                    <label style={css('display:flex;align-items:center;gap:var(--space-2);font-size:16px;cursor:pointer')}>
                      <input type="checkbox" checked={printOptions.notities} onChange={e => setPrintOptions(o => ({ ...o, notities: e.target.checked }))} />
                      <span>Notities</span>
                    </label>
                    <div className="dialog-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => setPrintDialogOpen(false)}>Annuleren</button>
                      <button type="button" className="btn btn-primary" onClick={() => { setPrintDialogOpen(false); doPrint(); }}>Printen</button>
                    </div>
                  </div>
                </div>
              )}

              <div data-noprint="1" style={css('display:flex;flex-direction:column;gap:var(--space-2);max-width:820px')}>
                <div style={css('font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-neutral-700)')}>Uitvallers — schema opnieuw indelen</div>
                <div style={css('display:flex;gap:var(--space-2);align-items:flex-end;flex-wrap:wrap')}>
                  <select className="input" aria-label="Speelster" style={css('max-width:220px')} value={injPlayer} onChange={e => setInjPlayer(e.target.value)}>
                    <option value="">— speelster —</option>
                    {injOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                  <select className="input" aria-label="Vanaf kwart" style={css('max-width:190px')} value={injFrom} onChange={e => setInjFrom(e.target.value)}>
                    {injFromOptions.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <button type="button" className="btn btn-primary" disabled={readOnly} onClick={applyInjury}>Herindelen</button>
                </div>
                <div style={css('display:flex;gap:var(--space-2);flex-wrap:wrap;padding-top:var(--space-1)')}>
                  {injuryList.map(i => <button key={i.key} type="button" className="tag tag-accent-2" onClick={i.clear} style={{ cursor: 'pointer', border: 'none' }}>{i.label}</button>)}
                </div>
              </div>

              <div data-noprint="1" style={css('display:flex;flex-direction:column;gap:var(--space-2);max-width:820px')}>
                <div style={css('display:flex;align-items:baseline;gap:var(--space-3);flex-wrap:wrap')}>
                  <div style={css('font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-neutral-700)')}>Notities deze wedstrijd — tik op de + bij een speler in het schema</div>
                  <button type="button" className="btn btn-ghost" disabled={readOnly} style={css('padding:2px 8px;font-size:14px')} onClick={() => openTeamNoteEditor(0)}>+ Teamnotitie</button>
                </div>
                {matchNoteChips.length ? (
                  <div style={css('display:flex;gap:var(--space-2);flex-wrap:wrap')}>
                    {matchNoteChips.map(n => (
                      <button key={n.key} type="button" className="tag" onClick={n.edit}
                        style={css('cursor:pointer;border:none;' + (n.valence === '-' ? 'background:#f5dede;color:' + C_OUT : 'background:' + C_IN_BG + ';color:' + C_IN))}>{n.label}</button>
                    ))}
                  </div>
                ) : (
                  <span style={css('font-size:14px;color:var(--color-neutral-700)')}>Nog geen notities voor deze wedstrijd.</span>
                )}
              </div>

              {positionEditorDialog}

              {positionRelocatorDialog}

              {noteEditorDialog}

              <div data-noprint="1" style={css('display:flex;flex-wrap:wrap;gap:var(--space-1) var(--space-4);font-size:15px;color:var(--color-neutral-700);max-width:80ch')}>
                <span>Bovenste naam = 1e helft, onderste naam = na de wissel op 8:00.</span>
                <span style={{ color: '#a32020' }}>◂ gaat eruit</span>
                <span style={{ color: '#1c6b3d' }}>▸ komt erin</span>
                <span style={css('color:var(--color-accent-700)')}>⇄ wisselt van positie</span>
                <span>Gekleurde achtergrond = bij aanvang van dit kwart ingekomen (groen) of verplaatst (blauw).</span>
                <span>Klik op een naam om die plek handmatig te wijzigen — je krijgt dan alternatieven te zien.</span>
              </div>

              {[{ label: 'kwart 1 en 2', items: halves.slice(0, 2), pagebreak: false }, { label: 'kwart 3 en 4', items: halves.slice(2, 4), pagebreak: true }].filter(g => g.items.length).map(g => (
              <div key={g.label} data-noprint={printOptions.wedstrijdschema ? undefined : '1'} data-pagebreak={g.pagebreak ? '1' : undefined} style={css('display:flex;flex-direction:column;gap:var(--space-3)')}>
                <div style={css('display:flex;flex-direction:column;gap:2px')}>
                  <div style={css('display:flex;align-items:center;gap:var(--space-3)')}>
                    <img src="/hcrb.png" alt="HCRB" style={css('height:40px;width:auto')} />
                    <h3 style={css('font-family:var(--font-heading);font-size:24px;margin:0;font-weight:600')}>Wedstrijdschema {g.label}</h3>
                  </div>
                  <span style={css('font-size:13px;color:var(--color-neutral-700)')}>{matchDateTimeLine}</span>
                </div>
                <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:var(--space-6)')}>
                {g.items.map(halfCard)}
                </div>
              </div>
              ))}

              <div data-noprint={printOptions.speeltijd ? undefined : '1'} style={css('display:flex;flex-direction:column;gap:var(--space-2)')}>
                <h3 style={css('font-family:var(--font-heading);font-size:24px;margin:0;font-weight:600')}>Speeltijd deze wedstrijd</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Speelster</th>
                      <th>K1</th><th>K2</th><th>K3</th><th>K4</th>
                      <th>Speelblokken</th><th>Minuten</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeRows.map(r => (
                      <tr key={r.key}>
                        <td style={{ textAlign: 'left' }}>{r.name}</td>
                        <td style={{ textAlign: 'center' }}>{r.q1}</td>
                        <td style={{ textAlign: 'center' }}>{r.q2}</td>
                        <td style={{ textAlign: 'center' }}>{r.q3}</td>
                        <td style={{ textAlign: 'center' }}>{r.q4}</td>
                        <td style={{ textAlign: 'center' }}>{r.halves}</td>
                        <td style={{ textAlign: 'center' }}>{r.minutes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div data-noprint={printOptions.notities ? undefined : '1'} style={css('display:flex;flex-direction:column;gap:var(--space-2)')}>
                <h3 style={css('font-family:var(--font-heading);font-size:24px;margin:0;font-weight:600')}>Notities</h3>
                {matchNoteRowsForPrint.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Speelster</th>
                        <th>Kwart</th>
                        <th>+/–</th>
                        <th style={{ textAlign: 'left' }}>Categorie</th>
                        <th style={{ textAlign: 'left' }}>Toelichting</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchNoteRowsForPrint.map(r => (
                        <tr key={r.key}>
                          <td style={{ textAlign: 'left' }}>{r.player}</td>
                          <td style={{ textAlign: 'center' }}>{r.quarter}</td>
                          <td style={{ textAlign: 'center' }}>{r.valence}</td>
                          <td style={{ textAlign: 'left' }}>{r.category}</td>
                          <td style={{ textAlign: 'left' }}>{r.text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={css('margin:0;font-size:15px;color:var(--color-neutral-700)')}>Geen notities voor deze wedstrijd.</p>
                )}
              </div>

              <div data-noprint="1" style={css('display:flex;flex-direction:column;gap:var(--space-6)')}>
                <div>
                  <div style={css('display:flex;align-items:baseline;gap:var(--space-3);flex-wrap:wrap')}>
                    <h3 style={css('font-family:var(--font-heading);font-size:24px;margin:0 0 var(--space-1);font-weight:600')}>Strafcorner verdedigen</h3>
                    <button type="button" className="btn btn-ghost" disabled={matchLocked || readOnly} style={css('padding:2px 4px;font-size:14px')}
                      onClick={() => patchMatch({ scOverrides: { ...(m.scOverrides || {}), verdedigen: {} } })}>Haal standaard op</button>
                  </div>
                  <p style={css('margin:0 0 var(--space-2);font-size:14px;color:var(--color-neutral-700)')}>Automatisch gevuld op basis van wie er voor deze wedstrijd is geselecteerd — is iemand niet geselecteerd (of valt tijdens de wedstrijd uit), kies dan hieronder een vervangster voor die plek.</p>
                  <table className="table" style={css('max-width:900px')}>
                    <thead><tr><th style={{ textAlign: 'left' }}>Rol</th><th>1e keus</th><th>2e keus</th><th>3e keus</th></tr></thead>
                    <tbody>
                      {scMatchRows('verdedigen').map(r => (
                        <tr key={r.key}>
                          <td style={{ textAlign: 'left' }}><div className="input" style={css('padding:6px 10px;min-width:140px;background:var(--color-neutral-200)')}>{r.role || 'Rol'}</div></td>
                          {r.cells.map(c => (
                            <td key={c.key}>
                              <select className="input" disabled={matchLocked || readOnly} aria-label={`${r.role || 'Rol'} — keuze ${c.key + 1}`} style={css('padding:6px 10px')} value={c.value} onChange={c.onChange}>
                                <option value="">—</option>
                                {c.options.map(p => <option key={p.id} value={p.id}>{displayFirst(p)}</option>)}
                              </select>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <div style={css('display:flex;align-items:baseline;gap:var(--space-3);flex-wrap:wrap')}>
                    <h3 style={css('font-family:var(--font-heading);font-size:24px;margin:0 0 var(--space-1);font-weight:600')}>Strafcorner aanval</h3>
                    <button type="button" className="btn btn-ghost" disabled={matchLocked || readOnly} style={css('padding:2px 4px;font-size:14px')}
                      onClick={() => patchMatch({ scOverrides: { ...(m.scOverrides || {}), aanval: {} } })}>Haal standaard op</button>
                  </div>
                  <table className="table" style={css('max-width:900px')}>
                    <thead><tr><th style={{ textAlign: 'left' }}>Rol</th><th>1e keus</th><th>2e keus</th><th>3e keus</th></tr></thead>
                    <tbody>
                      {scMatchRows('aanval').map(r => (
                        <tr key={r.key}>
                          <td style={{ textAlign: 'left' }}><div className="input" style={css('padding:6px 10px;min-width:140px;background:var(--color-neutral-200)')}>{r.role || 'Rol'}</div></td>
                          {r.cells.map(c => (
                            <td key={c.key}>
                              <select className="input" disabled={matchLocked || readOnly} aria-label={`${r.role || 'Rol'} — keuze ${c.key + 1}`} style={css('padding:6px 10px')} value={c.value} onChange={c.onChange}>
                                <option value="">—</option>
                                {c.options.map(p => <option key={p.id} value={p.id}>{displayFirst(p)}</option>)}
                              </select>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {[{ label: 'kwart 1 en 2', rows: scBlockRows.slice(0, 4), pagebreak: !!printOptions.wedstrijdschema }, { label: 'kwart 3 en 4', rows: scBlockRows.slice(4, 8), pagebreak: true }].map(half => (
                <div key={half.label} data-noprint={printOptions.strafcorner ? undefined : '1'} data-pagebreak={half.pagebreak ? '1' : undefined} style={css('display:flex;flex-direction:column;gap:var(--space-2)')}>
                  <div style={css('display:flex;align-items:center;gap:var(--space-3)')}>
                    <img src="/hcrb.png" alt="HCRB" style={css('height:40px;width:auto')} />
                    <h3 style={css('font-family:var(--font-heading);font-size:24px;margin:0;font-weight:600')}>Strafcornerschema {half.label}</h3>
                  </div>
                  <p style={css('margin:0;font-size:14px;color:var(--color-neutral-700)')}>Per speelblok de hoogste keus per rol die op dat moment ook echt in het veld staat.</p>
                  {scBlockTable(half.rows)}
                </div>
              ))}

              <div className="card elev-md" data-noprint="1" style={css('padding:var(--space-4);display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap')}>
                <span style={css('font-size:16px;max-width:60ch;text-wrap:pretty')}>Klaar met indelen? Sla het schema op — de eindstand vul je straks in bij Programma.</span>
                <button type="button" className="btn btn-primary" disabled={matchLocked || readOnly} onClick={saveMatch}>Schema opslaan</button>
              </div>

            </section>
          )}
        </main>
      ) : accessGate('Wedstrijdschema'))}

      {tab === 'afspraken' && (isMyTeam ? (
        <main style={css('padding-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-6);max-width:760px')}>
          <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0;font-weight:600')}>Afspraken</h2>

          <div>
            <h3 style={css('font-family:var(--font-heading);font-size:20px;margin:0 0 6px;font-weight:600')}>Wedstrijdvorm</h3>
            <ul style={css('margin:0;padding-left:1.2em;font-size:16px;line-height:1.6;text-wrap:pretty')}>
              <li>4 kwarten van 17,5 minuut.</li>
              <li>Elk kwart wordt halverwege (na 8 minuten) gewisseld — dit wordt aangezegd zodat de wissel zo snel mogelijk kan plaatsvinden.</li>
              <li>Iedereen die de 1e helft van een kwart op de bank zit, komt gegarandeerd de 2e helft het veld in.</li>
              <li>We beginnen sterk (kwart 1) en eindigen sterk (kwart 4).</li>
            </ul>
          </div>

          <div>
            <h3 style={css('font-family:var(--font-heading);font-size:20px;margin:0 0 6px;font-weight:600')}>Opstelling</h3>
            <ul style={css('margin:0;padding-left:1.2em;font-size:16px;line-height:1.6;text-wrap:pretty')}>
              <li>Per speelster is per positie een voorkeur vastgelegd (1 = beste positie, 2 = op één na beste, enz.).</li>
              <li>Voorkeurspositie weegt zwaarder dan sterkte — liever de juiste positie dan de sterkste speelster op een verkeerde plek.</li>
              <li>De as (posities in het midden) wordt met de sterkste speelsters bemand, gevolgd door rechts, dan links.</li>
              <li>Niveau (Pril t/m Uitblinkend) bepaalt de sterkte-afweging bij gelijke voorkeur.</li>
              <li>Iedereen krijgt zoveel mogelijk gelijke speeltijd; de sterkste speelsters iets meer, vanwege het beste team-effort.</li>
              <li>Bij een volledige wedstrijd (geen uitvaller) verschilt het aantal speelblokken tussen twee veldspeelsters nooit meer dan 1.</li>
              <li>Handmatige aanpassingen kunnen altijd: klik op een naam in het schema voor alternatieven.</li>
            </ul>
          </div>

          <div>
            <h3 style={css('font-family:var(--font-heading);font-size:20px;margin:0 0 6px;font-weight:600')}>Keeper</h3>
            <ul style={css('margin:0;padding-left:1.2em;font-size:16px;line-height:1.6;text-wrap:pretty')}>
              <li>De keeper rouleert door het team; we houden bij wie wanneer heeft gekeept (zie Historie).</li>
              <li>Standaard 1 keeper de hele wedstrijd; er kan na de rust (kwart 3) een tweede keeper invallen.</li>
              <li>Een keeper kan in de helft dat ze niet keept desgewenst gewoon meespelen in het veld.</li>
            </ul>
          </div>

          <div>
            <h3 style={css('font-family:var(--font-heading);font-size:20px;margin:0 0 6px;font-weight:600')}>Blessures &amp; invallers</h3>
            <ul style={css('margin:0;padding-left:1.2em;font-size:16px;line-height:1.6;text-wrap:pretty')}>
              <li>Bij een blessure geef je aan vanaf welk kwart de speelster uitvalt — het schema voor de resterende kwarten wordt automatisch herberekend.</li>
              <li>Invallers worden bij Team toegevoegd en gemarkeerd als invaller; ze doen mee als vaste speelsters bij het indelen.</li>
            </ul>
          </div>

          <div>
            <h3 style={css('font-family:var(--font-heading);font-size:20px;margin:0 0 6px;font-weight:600')}>Wedstrijdproces</h3>
            <ul style={css('margin:0;padding-left:1.2em;font-size:16px;line-height:1.6;text-wrap:pretty')}>
              <li>Stap 1: selecteer wie meedoet (Team + Invallers).</li>
              <li>Stap 2: kies de keeper(s).</li>
              <li>Stap 3: maak het schema.</li>
              <li>Sla het schema op — daarna staat het op alleen-lezen (heropenen kan altijd).</li>
              <li>Eindstand en punten (winst 3, gelijk 1, verlies 0) vul je in bij Programma.</li>
            </ul>
          </div>
        </main>
      ) : accessGate('Afspraken'))}

      {tab === 'programma' && (
        <main style={css('padding-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-4)')}>
          <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0;font-weight:600')}>Competitieprogramma</h2>
          <p style={css('margin:0;font-size:15px;color:var(--color-neutral-700);max-width:70ch;text-wrap:pretty')}>
            {fixtureRows.length ? '' : 'Nog geen wedstrijden voor ' + ownTeamName + '.'}
          </p>
          <div className="field" style={css('max-width:360px')}>
            <label htmlFor="programma-poule">Competitie</label>
            <select className="input" id="programma-poule" value={effectiveProgrammaFilter} onChange={e => {
              const v = e.target.value;
              setProgrammaCompetitionFilter(v === 'friendly' || v === 'all' ? v : Number(v));
            }}>
              {poules.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="friendly">Oefenwedstrijden</option>
              <option value="all">Alle wedstrijden van seizoen 2026-2027</option>
            </select>
          </div>
          {pastFixtureCount > 0 && (
            <label style={css('display:flex;align-items:center;gap:6px;font-size:15px;cursor:pointer')}>
              <input type="checkbox" checked={showPastFixtures} onChange={e => setShowPastFixtures(e.target.checked)} />
              <span>Ook {pastFixtureCount} gespeelde wedstrijd{pastFixtureCount === 1 ? '' : 'en'} tonen</span>
            </label>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={css('min-width:900px')}>
              <thead><tr>
                <th style={{ textAlign: 'left', width: '122px', padding: '4px 5px' }}>Datum</th>
                <th style={{ textAlign: 'left', width: '200px', padding: '4px 5px' }}>Wedstrijd</th>
                <th style={{ textAlign: 'left', width: '38px', padding: '4px 5px' }}>Dag</th>
                <th style={{ textAlign: 'left', width: '96px', padding: '4px 5px' }}>Verzamel</th>
                <th style={{ textAlign: 'left', width: '96px', padding: '4px 5px' }}>Start</th>
                <th style={{ textAlign: 'left', width: '120px', padding: '4px 5px' }}>Type</th>
                <th style={{ width: '85px', padding: '4px 5px' }}>Eindstand</th>
                <th style={{ width: '54px', padding: '4px 5px' }}>Punten</th>
                {!readOnly && <><th style={{ width: '92px', padding: '4px 5px 4px 12px' }}>Schema</th><th style={{ width: '84px', padding: '4px 5px' }}>Gespeeld</th></>}
              </tr></thead>
              <tbody>
                {visibleFixtureRows.map(f => (
                  <tr key={f.key}>
                    <td style={{ padding: '4px 5px' }}>{readOnly ? nlDate(f.date) : <input className="input" type="date" aria-label={`Datum — wedstrijd tegen ${f.opponent || 'onbekend'}`} style={css('padding:4px 2px;width:100%')} value={f.date} onChange={f.onDate} />}</td>
                    <td style={{ textAlign: 'left', overflowWrap: 'break-word', padding: '4px 5px' }}>
                      <span style={css(f.homeStyle)}>{f.homeName}{f.home ? ' ♥' : ''}</span>
                      <span style={{ color: 'var(--color-neutral-700)' }}> – </span>
                      <span style={css(f.awayStyle)}>{f.awayName}{!f.home ? ' ♥' : ''}</span>
                    </td>
                    <td style={{ textAlign: 'left', color: 'var(--color-neutral-700)', padding: '4px 5px' }}>{f.day}</td>
                    <td style={{ padding: '4px 5px' }}>{readOnly ? (f.verzameltijd || '—') : <input className="input" type="time" aria-label={`Verzameltijd — wedstrijd tegen ${f.opponent || 'onbekend'}`} style={css('padding:4px 2px;width:100%')} value={f.verzameltijd} onChange={f.onVerzameltijd} />}</td>
                    <td style={{ padding: '4px 5px' }}>{readOnly ? (f.time || '—') : <input className="input" type="time" aria-label={`Start — wedstrijd tegen ${f.opponent || 'onbekend'}`} style={css('padding:4px 2px;width:100%')} value={f.time} onChange={f.onTime} />}</td>
                    <td style={{ textAlign: 'left', color: 'var(--color-neutral-700)', overflowWrap: 'break-word', padding: '4px 5px' }}>{f.type}</td>
                    <td style={{ textAlign: 'center', padding: '4px 5px' }}>
                      {f.live ? (
                        <span style={css('display:inline-flex;align-items:center;gap:5px;font-weight:600;color:var(--color-accent-700)')} title="Live stand">
                          <span className="blink-alert" style={css('width:7px;height:7px;border-radius:50%;background:#c23b3b;display:inline-block;flex:0 0 auto')} />
                          {f.live.home}–{f.live.away}
                        </span>
                      ) : readOnly ? (f.gf !== '' && f.ga !== '' ? `${f.gf} – ${f.ga}` : '—') : (
                        <span style={css('display:inline-flex;align-items:center;gap:2px')}>
                          <input className="input" type="number" min="0" aria-label={`Doelpunten voor — wedstrijd tegen ${f.opponent || 'onbekend'}`} style={css('width:30px;text-align:center;padding:4px 2px')} value={f.gf} onChange={f.onGf} />
                          <span>–</span>
                          <input className="input" type="number" min="0" aria-label={`Doelpunten tegen — wedstrijd tegen ${f.opponent || 'onbekend'}`} style={css('width:30px;text-align:center;padding:4px 2px')} value={f.ga} onChange={f.onGa} />
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', padding: '4px 5px' }}>{f.points}</td>
                    {!readOnly && (
                      <>
                        <td style={{ textAlign: 'center', padding: '4px 5px' }}><button type="button" className="btn btn-secondary" style={{ padding: '3px 6px', fontSize: '13px' }} onClick={f.plan}>{f.planLabel}</button></td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap', padding: '4px 5px' }}><input type="checkbox" checked={f.played} disabled aria-label={`Gespeeld — wedstrijd tegen ${f.opponent || 'onbekend'}`} /> <button type="button" className="btn btn-ghost" style={{ padding: '2px 6px' }} onClick={f.remove}>×</button></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={css('display:flex;gap:var(--space-2);flex-wrap:wrap;align-items:center;padding-top:var(--space-2)')}>
            <button type="button" className="btn btn-primary" disabled={readOnly} onClick={openAddFixture}>Wedstrijd toevoegen</button>
            {isMyTeam && lisaConfig && (
              <button type="button" className="btn btn-secondary" disabled={lisaBusy} onClick={importLisaMatches}>{lisaBusy ? 'Bezig…' : 'Importeer wedstrijden'}</button>
            )}
          </div>
          {isMyTeam && lisaConfig && lisaError && <div style={css('font-size:13px;color:var(--color-accent-2-700)')}>{lisaError}</div>}

          {addFixtureOpen && (
            <div className="dialog-backdrop" onClick={() => setAddFixtureOpen(false)}>
              <div className="dialog" onClick={e => e.stopPropagation()}>
                <div className="dialog-title">Wedstrijd toevoegen</div>
                <div className="field"><label htmlFor="afdate">Datum</label><input className="input" id="afdate" type="date" value={addFixtureForm.date} onChange={e => setAddFixtureForm(f => ({ ...f, date: e.target.value }))} /></div>
                <div className="field"><label htmlFor="aftime">Tijd</label><input className="input" id="aftime" type="time" value={addFixtureForm.time} onChange={e => setAddFixtureForm(f => ({ ...f, time: e.target.value }))} /></div>
                <div className="field"><label htmlFor="afopp">Tegenstander</label><input className="input" id="afopp" type="text" value={addFixtureForm.opponent} onChange={e => setAddFixtureForm(f => ({ ...f, opponent: e.target.value }))} /></div>
                <div className="seg">
                  <label className="seg-opt"><input type="radio" name="afhome" checked={addFixtureForm.home} onChange={() => setAddFixtureForm(f => ({ ...f, home: true }))} /><span>Thuis</span></label>
                  <label className="seg-opt"><input type="radio" name="afhome" checked={!addFixtureForm.home} onChange={() => setAddFixtureForm(f => ({ ...f, home: false }))} /><span>Uit</span></label>
                </div>
                <p style={css('margin:0;font-size:13px;color:var(--color-neutral-700)')}>Handmatig toegevoegde wedstrijden zijn altijd oefenwedstrijden — een echte competitiewedstrijd komt binnen via "Importeer wedstrijden".</p>
                {addFixtureError && <div style={css('font-size:13px;color:var(--color-accent-2-700)')}>{addFixtureError}</div>}
                <div className="dialog-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setAddFixtureOpen(false)}>Annuleren</button>
                  <button type="button" className="btn btn-primary" onClick={saveNewFixture}>Opslaan</button>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {tab === 'standen' && (
        <main style={css('padding-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-4)')}>
          <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0;font-weight:600')}>Standen</h2>

          <div style={css('display:flex;flex-direction:column;gap:var(--space-2)')}>
            <div style={css('display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap')}>
              <button type="button" className="btn btn-secondary" disabled={standingsBusy} onClick={refreshStandings}>{standingsBusy ? 'Bezig…' : 'Ververs stand'}</button>
              {standingsUpdatedAt && (
                <span style={css('font-size:13px;color:var(--color-neutral-700)')}>
                  Bijgewerkt op {new Date(standingsUpdatedAt).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              )}
            </div>
            {standingsError && <div style={css('font-size:13px;color:var(--color-accent-2-700)')}>{standingsError}</div>}
          </div>

          {!standings.length ? (
            <p style={css('margin:0;font-size:15px;color:var(--color-neutral-700);max-width:70ch;text-wrap:pretty')}>
              Nog geen stand beschikbaar{isMyTeam ? '' : ' — vraag een teamlid om deze te verversen'}.
            </p>
          ) : (
            <>
              <div className="field" style={css('max-width:360px')}>
                <label htmlFor="standen-poule">Competitie</label>
                <select className="input" id="standen-poule" value={effectivePouleId ?? ''} onChange={e => setSelectedPouleId(Number(e.target.value))}>
                  {poules.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={css('min-width:640px')}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'center' }}>#</th>
                      <th style={{ textAlign: 'left' }}>Team</th>
                      <th style={{ textAlign: 'center' }}>Gespeeld</th>
                      <th style={{ textAlign: 'center' }}>W</th>
                      <th style={{ textAlign: 'center' }}>G</th>
                      <th style={{ textAlign: 'center' }}>V</th>
                      <th style={{ textAlign: 'center' }}>Doelsaldo</th>
                      <th style={{ textAlign: 'center' }}>Punten</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pouleRows.map(r => {
                      const isOwnTeam = r.name === lisaConfig?.teamName || r.name === ownTeamName;
                      return (
                      <tr key={r.name} style={isOwnTeam ? { fontWeight: 600, color: 'var(--color-accent-700)' } : undefined}>
                        <td style={{ textAlign: 'center' }}>{r.position}</td>
                        <td style={{ textAlign: 'left' }}>{r.name}{isOwnTeam ? ' ♥' : ''}</td>
                        <td style={{ textAlign: 'center' }}>{r.number_of_matches}</td>
                        <td style={{ textAlign: 'center' }}>{r.wins}</td>
                        <td style={{ textAlign: 'center' }}>{r.draws}</td>
                        <td style={{ textAlign: 'center' }}>{r.loses}</td>
                        <td style={{ textAlign: 'center' }}>{r.goals_for}–{r.goals_against} ({r.goal_balance > 0 ? '+' : ''}{r.goal_balance})</td>
                        <td style={{ textAlign: 'center' }}>{r.points}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
      )}

      {tab === 'team' && (
        <main style={css('padding-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-4)')}>
          <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0;font-weight:600')}>Team</h2>
          <p style={css('margin:0;font-size:15px;color:var(--color-neutral-700);max-width:70ch;text-wrap:pretty')}>Niveau geeft de sterkte aan. Bij de posities is 1 de beste positie voor deze speelster, 2 de op één na beste, enzovoort. Laat leeg wat zij niet speelt.</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={css('min-width:1080px')}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Speelster</th>
                  <th>Type</th>
                  {/* Niveau is de enige kolom die niet voor iedereen zichtbaar is - alleen coaches
                      (of admin) van dít team zien 'm; coaches van een ander team en bezoekers die
                      niet zijn ingelogd zien de rest van de teampagina wel, maar deze kolom niet. */}
                  {isMyTeam && <th>Niveau</th>}
                  {posCols.map(p => <th key={p.key} style={{ fontSize: '12px' }}>{p.short} ({p.count})</th>)}
                  <th style={{ fontSize: '12px' }}>KP ({kpCount})</th>
                  <th style={{ fontSize: '12px' }}>DP</th>
                  {!readOnly && <th></th>}
                </tr>
              </thead>
              <tbody>
                {teamRows.map(r => (
                  <tr key={r.key}>
                    <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{r.name} ({r.posCount})</td>
                    <td style={{ textAlign: 'center' }}><button type="button" className="tag" disabled={readOnly} style={{ cursor: 'pointer', border: 'none' }} onClick={r.onToggleSub}>{r.subLabel}</button></td>
                    {isMyTeam && (
                      <td style={{ textAlign: 'center' }}>
                        <select className="input" aria-label={`Niveau van ${r.name}`} style={css('padding:6px 8px;min-width:170px;font-size:15px;font-weight:500')} value={r.level} onChange={r.onLevel}>
                          {LEVELS.map(lv => <option key={lv.v} value={lv.v}>{lv.label}</option>)}
                        </select>
                      </td>
                    )}
                    {r.cells.map(c => (
                      <td key={c.key} style={{ textAlign: 'center' }}>
                        {readOnly ? (c.value || '—') : (
                          <input className="input" type="number" min="1" max="9" aria-label={`Voorkeur ${PMAP[c.key].label} voor ${r.name}`} style={css('width:46px;text-align:center;padding:4px')} value={c.value} onChange={c.onChange} />
                        )}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center' }}><input type="checkbox" aria-label={`Vaste keeper: ${r.name}`} checked={r.fixedKeeper} disabled={readOnly} onChange={r.onToggleFixedKeeper} /></td>
                    <td style={{ textAlign: 'center' }}>
                      {readOnly ? (r.dp || '0') : (
                        <input className="input" type="number" min="0" aria-label={`Doelpunten dit seizoen — ${r.name}`} style={css('width:46px;text-align:center;padding:4px')} value={r.dp} onChange={r.onDp} />
                      )}
                    </td>
                    {!readOnly && <td style={{ textAlign: 'center' }}><button type="button" className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={r.remove}>×</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={css('margin:0;font-size:13px;color:var(--color-neutral-700);max-width:70ch;text-wrap:pretty')}>
            <strong>Legenda</strong> — {POS.map(p => p.k + ': ' + p.label).join(' · ')} · KP: Vaste keeper
          </p>
          {!readOnly && (
            <div style={css('display:flex;gap:var(--space-3);align-items:flex-end;flex-wrap:wrap;padding-top:var(--space-2)')}>
              <div className="field"><label htmlFor="nn">Nieuwe speelster</label><input className="input" id="nn" type="text" placeholder="Voornaam Achternaam" value={newName} onChange={e => setNewName(e.target.value)} /></div>
              <label style={css('display:flex;align-items:center;gap:6px;font-size:16px;cursor:pointer;padding-bottom:9px')}>
                <input type="checkbox" checked={newIsSub} onChange={e => setNewIsSub(e.target.checked)} />
                <span>Dit is een invaller</span>
              </label>
              <button type="button" className="btn btn-primary" onClick={addPlayer}>Toevoegen</button>
            </div>
          )}
        </main>
      )}

      {tab === 'verslagen' && (
        <main style={css('padding-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-4)')}>
          <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0;font-weight:600')}>Wedstrijdverslagen</h2>
          <p style={css('margin:0;font-size:15px;color:var(--color-neutral-700);max-width:70ch;text-wrap:pretty')}>Wedstrijden die vanuit wedstrijdmodus zijn beëindigd, staan hier met het scoreverloop van die wedstrijd.</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Datum</th>
                  <th style={{ textAlign: 'left' }}>Wedstrijd</th>
                  <th style={{ textAlign: 'left' }}>Type</th>
                  <th>Eindstand</th>
                  <th style={{ textAlign: 'left' }}>Wedstrijdverslag</th>
                </tr>
              </thead>
              <tbody>
                {fixtureRows.map(f => [
                  <tr key={f.key}>
                    <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{nlDate(f.date)}</td>
                    <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                      <span style={css(f.homeStyle)}>{f.homeName}</span> – <span style={css(f.awayStyle)}>{f.awayName}</span>
                    </td>
                    <td style={{ textAlign: 'left', color: 'var(--color-neutral-700)' }}>{f.type}</td>
                    <td style={{ textAlign: 'center' }}>{f.gf !== '' && f.ga !== '' ? `${f.gf} – ${f.ga}` : '—'}</td>
                    <td style={{ textAlign: 'left' }}>
                      {f.report ? (
                        <button type="button" className="btn btn-ghost" style={css('padding:2px 8px;font-size:14px')} onClick={() => setExpandedReportId(id => id === f.key ? null : f.key)}>
                          {expandedReportId === f.key ? 'Verberg verslag' : 'Bekijk verslag'}
                        </button>
                      ) : '—'}
                    </td>
                  </tr>,
                  expandedReportId === f.key && f.report ? (
                    <tr key={f.key + '-report'}>
                      <td colSpan={5} style={{ textAlign: 'left', padding: '4px 5px 16px' }}>
                        <ul style={css('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;max-width:640px')}>
                          {f.report.map((g, i) => (
                            <li key={i} style={css('font-size:15px;padding:var(--space-2) var(--space-3);border-radius:var(--radius-md);background:var(--color-neutral-100)')}>
                              {formatMatchLogEntry(g, !!f.home, f.opponent || 'Tegenstander')}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ) : null,
                ])}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {tab === 'live' && (
        <main style={css('padding-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-6);max-width:640px')}>
          {m.liveOpened ? (
            <>
              <div className="card elev-md" style={css('padding:var(--space-4);display:flex;flex-direction:column;gap:4px')}>
                {liveStatus() && liveStatus().label && (
                  <span style={css('font-size:12px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;color:#c23b3b')}>{liveStatus().label}</span>
                )}
                <span style={css('font-family:var(--font-heading);font-size:19px;font-weight:600;text-wrap:pretty')}>{liveStatus() ? liveStatus().line : ''}</span>
              </div>
              <div style={css('display:flex;flex-direction:column;gap:var(--space-2)')}>
                <h2 style={css('font-family:var(--font-heading);font-size:22px;margin:0;font-weight:600')}>Scoreverloop</h2>
                {(m.goalLog || []).length ? (
                  <ul style={css('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px')}>
                    {(() => {
                      // Zelfde thuis/uit-volgorde als de tussenstand-regel hierboven (scheduleTitle),
                      // zodat een los logregeltje nooit een ander scoreverloop lijkt te tonen dan de
                      // stand erboven.
                      const home = !(scoreFxObj && scoreFxObj.home === false);
                      const opponentName = m.opponent || (scoreFxObj && scoreFxObj.opponent) || 'Tegenstander';
                      return (m.goalLog || []).map((g, i) => (
                        <li key={i} style={css('font-size:16px;padding:var(--space-2) var(--space-3);border-radius:var(--radius-md);background:var(--color-neutral-100)')}>
                          {formatMatchLogEntry(g, home, opponentName)}
                        </li>
                      ));
                    })()}
                  </ul>
                ) : (
                  <p style={css('margin:0;font-size:15px;color:var(--color-neutral-700)')}>Nog geen doelpunten.</p>
                )}
              </div>
            </>
          ) : (
            <p style={css('margin:0;font-size:15px;color:var(--color-neutral-700)')}>Er is nu geen live wedstrijd.</p>
          )}
        </main>
      )}

      {tab === 'ouders' && (
        <main style={css('padding-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-6)')}>
          <div>
            <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0;font-weight:600')}>Ouders</h2>
            <p style={css('margin:4px 0 0;font-size:15px;color:var(--color-neutral-700);max-width:70ch;text-wrap:pretty')}>Hier staat per wedstrijd wie de pauzehap meeneemt en, bij uitwedstrijden, welke ouders rijden.</p>
          </div>
          {pastOuderCount > 0 && (
            <label style={css('display:flex;align-items:center;gap:6px;font-size:15px;cursor:pointer')}>
              <input type="checkbox" checked={showPastOuders} onChange={e => setShowPastOuders(e.target.checked)} />
              <span>Ook {pastOuderCount} gespeelde wedstrijd{pastOuderCount === 1 ? '' : 'en'} tonen</span>
            </label>
          )}
          {ouderRows.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={css('white-space:nowrap')}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>Waar</th>
                    <th style={{ padding: '4px 6px' }}>Datum</th>
                    <th style={{ padding: '4px 6px' }}>
                      <span style={css('display:inline-flex;align-items:center;gap:4px')}>
                        Verzameltijd
                        <InfoDot text="Verzameltijd kan alleen door de coach worden gewijzigd, onder Programma." />
                      </span>
                    </th>
                    <th style={{ padding: '4px 6px' }}>Starttijd</th>
                    <th style={{ padding: '4px 6px' }}>Pauzehap</th>
                    <th style={{ padding: '4px 6px' }}>Rijder 1</th>
                    <th style={{ padding: '4px 6px' }}>Rijder 2</th>
                    <th style={{ padding: '4px 6px' }}>Rijder 3</th>
                    <th style={{ padding: '4px 6px' }}>Rijder 4</th>
                  </tr>
                </thead>
                <tbody>
                  {ouderRows.map(r => (
                    <tr key={r.key}>
                      <td style={{ textAlign: 'left', padding: '4px 6px' }}>{r.waar}</td>
                      <td style={{ padding: '4px 6px' }}>{r.datum}</td>
                      <td style={{ padding: '4px 6px' }}>{r.verzameltijd || '—'}</td>
                      <td style={{ padding: '4px 6px' }}>{r.startTijd || '—'}</td>
                      <td style={{ padding: '4px 6px' }}>
                        {canManageOuders ? (
                          <select className="input" aria-label={`Pauzehap ${r.waar} ${r.datum}`} style={css('padding:4px 6px')} value={r.pauzehapId} onChange={r.onPauzehap}>
                            <option value="">—</option>
                            {r.pauzehapOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                          </select>
                        ) : (r.pauzehapId ? nameOf(r.pauzehapId) : '—')}
                      </td>
                      {r.rijderSlots.map(s => (
                        <td key={s.key} style={{ padding: '4px 6px' }}>
                          {!s.active ? '—' : canManageOuders ? (
                            <select className="input" aria-label={`Rijder ${s.key + 1} ${r.waar} ${r.datum}`} style={css('padding:4px 6px')} value={s.value} onChange={s.onChange}>
                              <option value="">—</option>
                              {s.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                          ) : (s.value ? nameOf(s.value) : '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="card-body" style={css('margin:0')}>{fixtures.length ? 'Geen aankomende wedstrijden.' : 'Nog geen wedstrijden in het programma.'}</p>
          )}
        </main>
      )}

      {tab === 'sc' && (isMyTeam ? (
        <main style={css('padding-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-6)')}>
          <div>
            <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0 0 var(--space-1);font-weight:600')}>Strafcorner verdedigen</h2>
            <table className="table" style={css('max-width:900px')}>
              <thead><tr><th style={{ textAlign: 'left' }}>Rol</th><th>1e keus</th><th>2e keus</th><th>3e keus</th><th></th></tr></thead>
              <tbody>
                {scRows('verdedigen').map(r => (
                  <tr key={r.key}>
                    <td style={{ textAlign: 'left' }}><input className="input" type="text" disabled={readOnly} style={css('padding:4px 6px;min-width:140px')} value={r.role} onChange={r.onRoleChange} placeholder="Rolnaam" /></td>
                    {r.cells.map(c => (
                      <td key={c.key}>
                        <select className="input" disabled={readOnly} aria-label={`${r.role || 'Rol'} — keuze ${c.key + 1}`} style={css('padding:4px 6px')} value={c.value} onChange={c.onChange}>
                          <option value="">—</option>
                          {c.options.map(p => <option key={p.id} value={p.id}>{displayFirst(p)}</option>)}
                        </select>
                      </td>
                    ))}
                    <td style={{ textAlign: 'center' }}><button type="button" className="btn btn-ghost" disabled={readOnly} style={{ padding: '2px 8px' }} onClick={r.remove}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="btn btn-ghost" disabled={readOnly} style={css('margin-top:var(--space-2)')} onClick={() => addScRole('verdedigen')}>+ Rol toevoegen</button>
          </div>
          <div>
            <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0 0 var(--space-1);font-weight:600')}>Strafcorner aanval</h2>
            <table className="table" style={css('max-width:900px')}>
              <thead><tr><th style={{ textAlign: 'left' }}>Rol</th><th>1e keus</th><th>2e keus</th><th>3e keus</th><th></th></tr></thead>
              <tbody>
                {scRows('aanval').map(r => (
                  <tr key={r.key}>
                    <td style={{ textAlign: 'left' }}><input className="input" type="text" disabled={readOnly} style={css('padding:4px 6px;min-width:140px')} value={r.role} onChange={r.onRoleChange} placeholder="Rolnaam" /></td>
                    {r.cells.map(c => (
                      <td key={c.key}>
                        <select className="input" disabled={readOnly} aria-label={`${r.role || 'Rol'} — keuze ${c.key + 1}`} style={css('padding:4px 6px')} value={c.value} onChange={c.onChange}>
                          <option value="">—</option>
                          {c.options.map(p => <option key={p.id} value={p.id}>{displayFirst(p)}</option>)}
                        </select>
                      </td>
                    ))}
                    <td style={{ textAlign: 'center' }}><button type="button" className="btn btn-ghost" disabled={readOnly} style={{ padding: '2px 8px' }} onClick={r.remove}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="btn btn-ghost" disabled={readOnly} style={css('margin-top:var(--space-2)')} onClick={() => addScRole('aanval')}>+ Rol toevoegen</button>
          </div>
        </main>
      ) : accessGate('Strafcorner'))}

      {tab === 'notities' && (isMyTeam ? (
        <main style={css('padding-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-8)')}>
          <div>
            <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0 0 var(--space-1);font-weight:600')}>Notities — categorieën</h2>
            <p style={css('margin:0 0 var(--space-3);font-size:15px;color:var(--color-neutral-700);max-width:70ch;text-wrap:pretty')}>Deze categorieën verschijnen als tegels in het notitie-dialoogje bij het wedstrijdschema. De 4 groepen liggen vast, de items eronder pas je hier aan.</p>
            <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:var(--space-5)')}>
              {NOTE_GROUPS.map(g => (
                <div key={g.key}>
                  <h3 style={css('font-family:var(--font-heading);font-size:18px;margin:0 0 6px;font-weight:600')}>{g.label}</h3>
                  <div style={css('display:flex;flex-direction:column;gap:6px')}>
                    {noteCategoryRows(g.key).map(c => (
                      <div key={c.key} style={css('display:flex;gap:4px;align-items:center')}>
                        <input className="input" type="text" disabled={readOnly} style={css('padding:4px 6px;flex:1')} value={c.label} onChange={c.onLabelChange} placeholder="Categorienaam" />
                        <button type="button" className="btn btn-ghost" disabled={readOnly || !c.moveUp} style={{ padding: '2px 6px' }} onClick={c.moveUp || undefined}>↑</button>
                        <button type="button" className="btn btn-ghost" disabled={readOnly || !c.moveDown} style={{ padding: '2px 6px' }} onClick={c.moveDown || undefined}>↓</button>
                        <button type="button" className="btn btn-ghost" disabled={readOnly} style={{ padding: '2px 8px' }} onClick={c.remove}>×</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="btn btn-ghost" disabled={readOnly} style={css('margin-top:var(--space-2)')} onClick={() => addNoteCategory(g.key)}>+ Categorie toevoegen</button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0 0 var(--space-1);font-weight:600')}>Notities — overzicht</h2>
            <p style={css('margin:0 0 var(--space-3);font-size:15px;color:var(--color-neutral-700);max-width:70ch;text-wrap:pretty')}>Alle notities uit gespeelde wedstrijden en de lopende wedstrijd, als input voor de eerstvolgende training.</p>
            <div className="field" style={css('max-width:280px;margin-bottom:var(--space-3)')}>
              <label htmlFor="notes-filter">Speelster</label>
              <select className="input" id="notes-filter" value={notesFilterPlayer} onChange={e => setNotesFilterPlayer(e.target.value)}>
                <option value="">— alle speelsters —</option>
                <option value="__team__">Team</option>
                {players.map(p => <option key={p.id} value={p.id}>{displayFirst(p)}</option>)}
              </select>
            </div>
            {noteRows.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Datum</th>
                      <th style={{ textAlign: 'left' }}>Wedstrijd</th>
                      <th style={{ textAlign: 'left' }}>Speelster</th>
                      <th>+/–</th>
                      <th style={{ textAlign: 'left' }}>Categorie</th>
                      <th style={{ textAlign: 'left' }}>Toelichting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noteRows.map(r => (
                      <tr key={r.key}>
                        <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{nlDate(r.date)}</td>
                        <td style={{ textAlign: 'left' }}>{r.opponent}</td>
                        <td style={{ textAlign: 'left' }}>{r.player}</td>
                        <td style={{ textAlign: 'center' }}>{r.valence}</td>
                        <td style={{ textAlign: 'left' }}>{r.category}</td>
                        <td style={{ textAlign: 'left' }}>{r.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={css('margin:0;font-size:15px;color:var(--color-neutral-700)')}>Nog geen notities.</p>
            )}
          </div>
        </main>
      ) : accessGate('Notities'))}

      {tab === 'historie' && (isMyTeam ? (
        <main style={css('padding-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-6)')}>
          <div>
            <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0 0 var(--space-2);font-weight:600')}>Seizoenstotalen</h2>
            <table className="table" style={css('max-width:760px')}>
              <thead><tr><th style={{ textAlign: 'left' }}>Speelster</th><th>Wedstrijden</th><th>Keepbeurten</th><th>Speelblokken</th><th>Minuten</th></tr></thead>
              <tbody>
                {seasonRows.map(r => (
                  <tr key={r.key}>
                    <td style={{ textAlign: 'left' }}>{r.name}</td>
                    <td style={{ textAlign: 'center' }}>{r.matches}</td>
                    <td style={{ textAlign: 'center' }}>{r.keeps}</td>
                    <td style={{ textAlign: 'center' }}>{r.halves}</td>
                    <td style={{ textAlign: 'center' }}>{r.minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0 0 var(--space-2);font-weight:600')}>Wedstrijden</h2>
            <p style={css('margin:0 0 var(--space-2);font-size:15px;color:var(--color-neutral-700)')}>{historyRows.length ? '' : 'Nog geen wedstrijden gespeeld.'}</p>
            <table className="table" style={css('max-width:900px')}>
              <thead><tr><th style={{ textAlign: 'left' }}>Datum</th><th style={{ textAlign: 'left' }}>Wedstrijd</th><th style={{ textAlign: 'left' }}>Uitslag</th><th style={{ textAlign: 'left' }}>Keeper</th><th></th></tr></thead>
              <tbody>
                {historyRows.map(r => (
                  <tr key={r.key}>
                    <td style={{ textAlign: 'left' }}>{r.date}</td>
                    <td style={{ textAlign: 'left' }}>
                      {r.wedstrijd}
                      {r.friendly && <span className="tag tag-outline" style={css('margin-left:8px')}>Oefenwedstrijd</span>}
                    </td>
                    <td style={{ textAlign: 'left' }}>{r.score}</td>
                    <td style={{ textAlign: 'left' }}>{r.keeper}</td>
                    <td style={{ textAlign: 'center' }}><button type="button" className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={r.remove}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0 0 var(--space-2);font-weight:600')}>Keeprotatie</h2>
            <p style={css('margin:0;font-size:16px;max-width:70ch;text-wrap:pretty')}>{keeperRotationText}</p>
          </div>
        </main>
      ) : accessGate('Historie'))}

      {tab === 'teams' && (
        <main style={css('padding-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-6);max-width:640px')}>
          <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0;font-weight:600')}>Teams</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th style={{ textAlign: 'left' }}>Naam</th><th style={{ textAlign: 'left' }}>Team-id</th><th style={{ textAlign: 'center' }}>Standaard</th>{isAdmin && <th></th>}</tr></thead>
              <tbody>
                {visibleTeams.map(t => (
                  <tr key={t.id}>
                    <td style={{ textAlign: 'left' }}>{t.name}</td>
                    <td style={{ textAlign: 'left', color: 'var(--color-neutral-700)', fontFamily: 'monospace' }}>{t.id}</td>
                    <td style={{ textAlign: 'center' }}>
                      {t.id === defaultTeamId ? (
                        <span className="tag tag-accent">Standaard</span>
                      ) : isAdmin ? (
                        <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={async () => {
                          setTeamError('');
                          try { await setDefaultTeam(t.id); }
                          catch (e) { setTeamError(e.message || 'Instellen mislukt.'); }
                        }}>Maak standaard</button>
                      ) : (
                        <span style={{ color: 'var(--color-neutral-700)' }}>—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td style={{ textAlign: 'center' }}>
                        <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={async () => {
                          if (!window.confirm(`Team "${t.name}" en alle bijbehorende data (speelsters, programma, historie) definitief verwijderen?`)) return;
                          setTeamError('');
                          try { await deleteTeam(t.id); }
                          catch (e) { setTeamError(e.message || 'Verwijderen mislukt.'); }
                        }}>Verwijderen</button>
                      </td>
                    )}
                  </tr>
                ))}
                {!visibleTeams.length && (
                  <tr><td colSpan={isAdmin ? 4 : 3} style={{ color: 'var(--color-neutral-700)' }}>
                    {!teams.length ? 'Nog geen teams.' : !user ? 'Log in om je team te zien.' : 'Je bent aan geen enkel team gekoppeld.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p style={css('margin:0;font-size:14px;color:var(--color-neutral-700);max-width:60ch;text-wrap:pretty')}>
            Het standaardteam is wat bezoekers zien bij het openen van de site, zolang ze niet zijn ingelogd bij een ander team.
          </p>
          {isAdmin && (
            <div style={css('display:flex;flex-direction:column;gap:var(--space-4)')}>
              <div>
                <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0 0 4px;font-weight:600')}>Coaches &amp; managers per team</h2>
                <p style={css('margin:0;font-size:14px;color:var(--color-neutral-700);max-width:60ch;text-wrap:pretty')}>
                  Een team mag meerdere coaches en managers hebben. Een coach ziet en bewerkt alles van het team; een manager mag alleen de Ouders-indeling maken en wijzigen. Nieuw e-mailadres → wordt een account aangemaakt en krijgt een mail om een wachtwoord in te stellen; bestaand e-mailadres → wordt alleen aan dit team gekoppeld (met de gekozen rol).
                </p>
              </div>
              {teams.map(t => {
                const coaches = allUsers.filter(u => teamsOf(u)[t.id]).map(u => ({ ...u, teamRole: teamsOf(u)[t.id] }));
                return (
                  <div key={t.id} className="card elev-sm" style={css('display:flex;flex-direction:column;gap:var(--space-2);max-width:520px')}>
                    <div className="card-title">{t.name}</div>
                    {coaches.length ? (
                      <div style={css('display:flex;flex-direction:column;gap:6px')}>
                        {coaches.map(c => (
                          <div key={c.uid} style={css('display:flex;align-items:center;justify-content:space-between;gap:var(--space-2);font-size:15px')}>
                            <span>{c.email} · {c.role === 'admin' ? 'admin' : c.teamRole === 'manager' ? 'manager' : 'coach'}</span>
                            <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => unlinkCoach(c.uid, t.id)}>Loskoppelen</button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="card-body" style={css('margin:0')}>Nog geen coaches/managers gekoppeld.</p>
                    )}
                    <div style={css('display:flex;gap:var(--space-2);align-items:flex-end;flex-wrap:wrap')}>
                      <div className="field" style={css('margin:0;flex:1;min-width:200px')}>
                        <label htmlFor={`coach-contact-${t.id}`}>E-mailadres</label>
                        {/* type="text" + inputMode="email", not type="email": Chrome's address-autofill
                            keys heavily off type="email" (autoComplete="off" alone does NOT suppress it -
                            Chrome deliberately ignores "off" for its own address/contact autofill) and,
                            once one of several identically-labeled fields on the page is filled from a
                            suggestion, fills every other field it also recognizes as "email" with the same
                            value. inputMode keeps the email keyboard on mobile; the name/id deliberately
                            avoid the word "email" too, since that's part of the same heuristic. */}
                        <input className="input" id={`coach-contact-${t.id}`} name={`coach-contact-${t.id}`} type="text" inputMode="email" autoComplete="off" value={coachEmailByTeam[t.id] || ''}
                          onChange={e => setCoachEmailByTeam(m => ({ ...m, [t.id]: e.target.value }))} />
                      </div>
                      <div className="field" style={css('margin:0')}>
                        <label htmlFor={`coach-role-${t.id}`}>Rol</label>
                        <select className="input" id={`coach-role-${t.id}`} value={coachRoleByTeam[t.id] || 'coach'} onChange={e => setCoachRoleByTeam(m => ({ ...m, [t.id]: e.target.value }))}>
                          <option value="coach">Coach</option>
                          <option value="manager">Manager</option>
                        </select>
                      </div>
                      <button type="button" className="btn btn-secondary" disabled={coachBusyByTeam[t.id]} onClick={() => addCoach(t.id)}>
                        {coachBusyByTeam[t.id] ? 'Bezig…' : 'Toevoegen'}
                      </button>
                    </div>
                    {coachErrorByTeam[t.id] && <div style={css('font-size:13px;color:var(--color-accent-2-700)')}>{coachErrorByTeam[t.id]}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {isAdmin && (
            <div className="card elev-sm" style={css('display:flex;flex-direction:column;gap:var(--space-2);max-width:520px')}>
              <div className="card-title">Koppeling met clubwebsite — {ownTeamName}</div>
              {lisaConfig ? (
                <>
                  <p className="card-body" style={css('margin:0')}>Gekoppeld aan clubwebsite-team <strong>{lisaConfig.teamName || lisaConfig.teamId}</strong>.</p>
                  {lisaError && <div style={css('font-size:13px;color:var(--color-accent-2-700)')}>{lisaError}</div>}
                  <div style={css('display:flex;gap:var(--space-2);flex-wrap:wrap')}>
                    <button type="button" className="btn btn-primary" disabled={lisaBusy} onClick={importLisaMatches}>{lisaBusy ? 'Bezig…' : 'Importeer wedstrijden'}</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setLisaEditing(true)}>Koppeling wijzigen</button>
                  </div>
                </>
              ) : null}
              {(!lisaConfig || lisaEditing) && (
                <>
                  <p className="card-body" style={css('margin:0')}>Club-id en de autorisatie-header haal je eenmalig op via de DevTools Network-tab op de wedstrijdpagina van de clubwebsite (filter op "lisahockey") — daarna kies je het team uit een lijst.</p>
                  <div className="field"><label htmlFor="lc1">Club-id</label><input className="input" id="lc1" type="text" value={lisaForm.clubDudaId} onChange={e => { setLisaForm(f => ({ ...f, clubDudaId: e.target.value, teamId: '', teamName: '' })); setLisaTeamOptions(null); }} /></div>
                  <div className="field"><label htmlFor="lc3">Autorisatie-header</label><input className="input" id="lc3" type="text" placeholder="Basic ..." value={lisaForm.authHeader} onChange={e => { setLisaForm(f => ({ ...f, authHeader: e.target.value, teamId: '', teamName: '' })); setLisaTeamOptions(null); }} /></div>
                  {!lisaTeamOptions && (
                    <button type="button" className="btn btn-secondary" style={css('align-self:flex-start')} disabled={lisaTeamsBusy} onClick={fetchLisaTeams}>{lisaTeamsBusy ? 'Bezig…' : 'Teams ophalen'}</button>
                  )}
                  {lisaTeamOptions && (
                    <div className="field">
                      <label htmlFor="lc2">Team</label>
                      <select className="input" id="lc2" value={lisaForm.teamId} onChange={e => {
                        const opt = lisaTeamOptions.find(t => t.id === e.target.value);
                        setLisaForm(f => ({ ...f, teamId: opt ? opt.id : '', teamName: opt ? opt.name : '' }));
                      }}>
                        <option value="">— kies een team —</option>
                        {lisaTeamOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  )}
                  {lisaError && <div style={css('font-size:13px;color:var(--color-accent-2-700)')}>{lisaError}</div>}
                  {lisaTeamOptions && <button type="button" className="btn btn-primary" style={css('align-self:flex-start')} disabled={!lisaForm.teamId} onClick={saveLisaConfig}>Koppeling opslaan</button>}
                </>
              )}
            </div>
          )}

          {isAdmin && (
            <div className="card elev-sm" style={css('display:flex;flex-direction:column;gap:var(--space-2);max-width:420px')}>
              <div className="card-title">Nieuw team</div>
              <div className="field">
                <label htmlFor="newteam">Teamnaam</label>
                <input className="input" id="newteam" type="text" placeholder="bv. HCRB MO16-1"
                  value={newTeamName} onChange={e => setNewTeamName(e.target.value)} />
              </div>
              {teamError && <div style={css('font-size:13px;color:var(--color-accent-2-700)')}>{teamError}</div>}
              <button type="button" className="btn btn-primary" style={css('align-self:flex-start')} onClick={async () => {
                setTeamError('');
                try { await createTeam(newTeamName); setNewTeamName(''); }
                catch (e) { setTeamError(e.message || 'Aanmaken mislukt.'); }
              }}>Team aanmaken</button>
            </div>
          )}
        </main>
      )}

      {tab === 'inlog' && isAdmin && (
        <main style={css('padding-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-4);max-width:640px')}>
          <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0;font-weight:600')}>Inlogpogingen</h2>
          <p style={css('margin:0;font-size:14px;color:var(--color-neutral-700);max-width:60ch;text-wrap:pretty')}>
            Per gebruiker de laatste 50 succesvolle logins. Klik op een gebruiker om die open te klappen.
          </p>
          <div style={css('display:flex;flex-direction:column;gap:var(--space-2)')}>
            {allUsers.map(u => {
              const open = expandedUserUid === u.uid;
              const teamName = u.role === 'admin' ? 'Beheerder' : (Object.keys(teamsOf(u)).map(tid => (teams.find(t => t.id === tid) || {}).name).filter(Boolean).join(', ') || '—');
              const panelId = `logins-${u.uid}`;
              return (
                <div key={u.uid} className="card elev-sm" style={css('padding:0;overflow:hidden')}>
                  <button type="button" aria-expanded={open} aria-controls={panelId}
                    onClick={() => setExpandedUserUid(open ? null : u.uid)}
                    style={css('width:100%;display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);padding:var(--space-3);background:none;border:none;cursor:pointer;text-align:left;font-family:var(--font-body);font-size:15px;color:var(--color-text)')}>
                    <span>{u.email || u.uid}</span>
                    <span style={css('font-size:13px;color:var(--color-neutral-700)')}>{teamName}</span>
                  </button>
                  {open && (
                    <div id={panelId} style={css('padding:0 var(--space-3) var(--space-3);display:flex;flex-direction:column;gap:4px')}>
                      {(u.logins || []).length ? u.logins.map(ts => (
                        <div key={ts} style={css('font-size:14px;color:var(--color-neutral-700)')}>
                          {new Date(ts).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      )) : (
                        <p style={css('margin:0;font-size:14px;color:var(--color-neutral-700)')}>Nog geen logins geregistreerd.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!allUsers.length && <p style={css('margin:0;font-size:14px;color:var(--color-neutral-700)')}>Nog geen gebruikers.</p>}
          </div>
        </main>
      )}

      </>)}
    </div>
  );
}
