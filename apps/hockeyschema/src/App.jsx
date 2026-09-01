import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { useAuth } from './AuthContext.jsx';
import { useTeam } from './TeamContext.jsx';
import Login from './Login.jsx';

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
const LINES = [['LV', 'SP', 'RV'], ['LH', 'MM', 'RH'], ['VS'], ['LA', 'LM', 'RA']];
const ZONE_W = { as: 1.0, rechts: 0.6, links: 0.3 };
const QUARTER_MIN = 17.5;

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

// Elke rol heeft een stabiel id (voor React-keys en add/verwijder) en 3 keuzeplekken
// die een speelster-id bevatten (of null) — gekoppeld aan de echte teamlijst i.p.v. losse tekst.
const DEFAULT_SC = {
  verdedigen: [
    { id: 'v1', role: '1e uitloop', picks: [null, null, null] },
    { id: 'v2', role: '2e uitloop', picks: [null, null, null] },
    { id: 'v3', role: 'Lijnstop links', picks: [null, null, null] },
    { id: 'v4', role: 'Lijnstop rechts', picks: [null, null, null] }
  ],
  aanval: [
    { id: 'a1', role: 'Aangever', picks: [null, null, null] },
    { id: 'a2', role: 'Stopper', picks: [null, null, null] },
    { id: 'a3', role: 'Afmaker', picks: [null, null, null] },
    { id: 'a4', role: 'Tweede stopper', picks: [null, null, null] },
    { id: 'a5', role: 'Lokaas aanvaller', picks: [null, null, null] }
  ]
};

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

function assign(onPlayers, prevOn, mode) {
  const cost = (p, pos) => {
    const r = p.prefs[pos];
    const base = (r ? r : 9) * 1000;
    const z = mode === 'standaard' ? 0 : ZONE_W[PMAP[pos].zone] * (100 - ratingOf(p));
    const cont = prevOn && prevOn[pos] === p.id ? -800 : 0;
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
    let assignMap = assign(on, prevOn, ptMode);
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
          const cand = assign(newOn, prevOn, ptMode);
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
    on.forEach(p => { played[p.id]++; });
    blocks.push({ on: assignMap, bench: bench.map(p => p.id) });
  }
  return blocks;
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

const BLANK_MATCH = { opponent: '', date: '', keeperId: '', selected: [], injuries: {}, schedule: null };

export default function App() {
  const { user, myTeamId, isAdmin, logout } = useAuth();
  const { teams, teamsLoaded, currentTeamId, setCurrentTeamId, createTeam, deleteTeam } = useTeam();

  const [tab, setTab] = useState('programma');
  const [players, setPlayers] = useState([]);
  const [sc, setSc] = useState({ verdedigen: [], aanval: [] });
  const [newName, setNewName] = useState('');
  const [newIsSub, setNewIsSub] = useState(false);
  const [injPlayer, setInjPlayer] = useState('');
  const [injFrom, setInjFrom] = useState('2');
  const [fixtures, setFixtures] = useState([]);
  const [addFixtureOpen, setAddFixtureOpen] = useState(false);
  const [addFixtureForm, setAddFixtureForm] = useState({ date: '', time: '', opponent: '', home: true, friendly: false });
  const [addFixtureError, setAddFixtureError] = useState('');
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printOptions, setPrintOptions] = useState({ wissels: false, strafcorner: false, speeltijd: false });
  const [history, setHistory] = useState([]);
  const [match, setMatch] = useState(BLANK_MATCH);
  const [editing, setEditing] = useState(null);
  const [relocating, setRelocating] = useState(null);
  const [loadedTeamId, setLoadedTeamId] = useState(null);
  const [historyLoadedTeamId, setHistoryLoadedTeamId] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [teamError, setTeamError] = useState('');
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
  const migratedRef = useRef(false);

  // isMyTeam: ingelogd én (het bekeken team is het eigen team, of gebruiker is admin).
  const isMyTeam = !!user && (myTeamId === currentTeamId || isAdmin);
  const readOnly = !isMyTeam;
  const canSeeHistory = isMyTeam;

  const publicSyncRef = useRef('');
  const historySyncRef = useRef('');

  // Publieke teamdata (speelsters, strafcorner, programma, wedstrijd) — leesbaar voor iedereen,
  // her-abonneert zodra van team gewisseld wordt. `loadedTeamId` (i.p.v. een simpele boolean)
  // onthoudt VOOR WELK team de laatst ontvangen data was, zodat het opslaan-effect hieronder
  // nooit de net-verlaten data van team A per ongeluk naar team B's document schrijft terwijl
  // team B's eigen data nog onderweg is (race condition bij wisselen van team).
  useEffect(() => {
    if (!currentTeamId) { setLoadedTeamId(null); return; }
    publicSyncRef.current = '';
    const unsub = onSnapshot(doc(db, 'teams', currentTeamId, 'state', 'public'), snap => {
      const d = snap.data() || {};
      publicSyncRef.current = JSON.stringify({ players: d.players || [], sc: d.sc, fixtures: d.fixtures, match: d.match, standings: d.standings || [], standingsUpdatedAt: d.standingsUpdatedAt || null });
      setPlayers(d.players || []);
      setSc(d.sc || { verdedigen: [], aanval: [] });
      setFixtures(d.fixtures || []);
      setMatch(d.match || BLANK_MATCH);
      setStandings(d.standings || []);
      setStandingsUpdatedAt(d.standingsUpdatedAt || null);
      setLoadedTeamId(currentTeamId);
    }, () => setLoadedTeamId(currentTeamId));
    return unsub;
  }, [currentTeamId]);

  useEffect(() => {
    if (loadedTeamId !== currentTeamId || readOnly || !currentTeamId) return;
    const blob = { players, sc, fixtures, match, standings, standingsUpdatedAt };
    const json = JSON.stringify(blob);
    if (json === publicSyncRef.current) return;
    publicSyncRef.current = json;
    setDoc(doc(db, 'teams', currentTeamId, 'state', 'public'), blob).catch(() => {});
  }, [loadedTeamId, readOnly, currentTeamId, players, sc, fixtures, match, standings, standingsUpdatedAt]);

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
          };
        });
      if (!rows.length) { setLisaError('Geen wedstrijden gevonden.'); return; }
      setFixtures(fs => {
        const known = new Set(fs.map(f => f.date + '|' + f.opponent));
        return fs.concat(rows.filter(r => !known.has(r.date + '|' + r.opponent)));
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
  async function refreshStandings() {
    if (readOnly || !lisaConfig) return;
    setStandingsBusy(true);
    setStandingsError('');
    try {
      const url = `https://api.lisahockey.nl/v1/duda/${lisaConfig.clubDudaId}/teams/${lisaConfig.teamId}/poules`;
      const res = await fetch(url, { headers: { authorization: lisaConfig.authHeader, accept: '*/*' } });
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      const rows = data.teams || [];
      if (!rows.length) { setStandingsError('Geen stand gevonden.'); return; }
      setStandings(rows);
      setStandingsUpdatedAt(new Date().toISOString());
    } catch (e) {
      setStandingsError('Stand ophalen mislukt — controleer de koppeling (mogelijk verlopen sleutel).');
    } finally {
      setStandingsBusy(false);
    }
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
        let seed = { players: DEFAULT_PLAYERS, sc: DEFAULT_SC, fixtures: DEFAULT_FIXTURES, match: BLANK_MATCH };
        let seedHistory = DEFAULT_HISTORY;
        const raw = window.localStorage.getItem(KEY);
        if (raw) {
          const d = JSON.parse(raw);
          seed = {
            players: d.players || DEFAULT_PLAYERS, sc: d.sc || DEFAULT_SC,
            fixtures: d.fixtures || DEFAULT_FIXTURES, match: d.match || BLANK_MATCH
          };
          seedHistory = d.history || DEFAULT_HISTORY;
        }
        await setDoc(doc(db, 'teams', id), { name: OWN_TEAM, createdAt: new Date().toISOString() });
        await setDoc(doc(db, 'teams', id, 'state', 'public'), seed);
        await setDoc(doc(db, 'teams', id, 'state', 'history'), { entries: seedHistory });
      } catch (e) { /* migratie mislukt — team blijft leeg, kan later opnieuw via Teams-tab */ }
    })();
  }, [isAdmin, teamsLoaded, teams.length]);

  const patchMatch = obj => { if (readOnly) return; setMatch(m => ({ ...m, ...obj })); };
  const byId = id => players.find(p => p.id === id);
  const nameOf = id => { const p = byId(id); return p ? p.first : '—'; };
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
    setMatch(m => ({ ...m, schedule: sched }));
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
      halves: halvesPlayed(match.schedule)
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
        schedule: null, injuries: {}, locked: false
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
    setAddFixtureForm({ date: '', time: '', opponent: '', home: true, friendly: false });
    setAddFixtureError('');
    setAddFixtureOpen(true);
  }

  function saveNewFixture() {
    if (readOnly) return;
    const f = addFixtureForm;
    if (!f.date || !f.opponent.trim()) { setAddFixtureError('Vul in elk geval datum en tegenstander in.'); return; }
    setFixtures(fs => fs.concat([{
      id: 'f' + Date.now(), date: f.date, time: f.time, opponent: f.opponent.trim(), home: f.home, friendly: f.friendly
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
  const tabs = [
    ['programma', 'Programma'], ['standen', 'Standen'], ['wedstrijd', 'Wedstrijdschema'], ['team', 'Team'], ['sc', 'Strafcorner'],
    ['historie', 'Historie'], ['afspraken', 'Afspraken'], ['teams', 'Teams']
  ].map(t => ({
    key: t[0], label: t[1], go: () => setTab(t[0]),
    style: 'background:none;border:none;padding:4px 0 6px;cursor:pointer;font-family:var(--font-heading);font-size:18px;letter-spacing:0.01em;'
      + (tab === t[0]
        ? 'color:var(--color-text);border-bottom:3px solid var(--color-accent);font-weight:600'
        : 'color:var(--color-neutral-700);border-bottom:3px solid transparent;font-weight:400')
  }));
  const activeTabLabel = (tabs.find(t => t.key === tab) || {}).label || 'Wedstrijdschema';

  const sel = m.selected || [];
  const selectionChips = players.map(p => {
    const on = sel.indexOf(p.id) >= 0;
    const isK = m.keeperId === p.id;
    return {
      key: p.id,
      label: isK ? p.first + ' · keep' : p.first,
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
  const never = players.filter(p => !keeps[p.id]).map(p => p.first);
  const keeperHint = history.length
    ? 'Keeprotatie tot nu toe: ' + players.filter(p => keeps[p.id]).map(p => p.first + ' (' + keeps[p.id] + '×)').join(', ')
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

  const switchLog = [];
  if (sched) {
    for (let i = 1; i < sched.length; i++) {
      const prevIds = ids(sched[i - 1]), curIds = ids(sched[i]);
      const out = prevIds.filter(x => curIds.indexOf(x) < 0);
      const inn = curIds.filter(x => prevIds.indexOf(x) < 0);
      if (!out.length && !inn.length) continue;
      const q = Math.floor(i / 2);
      const atStart = i % 2 === 0;
      const t = atStart ? q * QUARTER_MIN : q * QUARTER_MIN + QUARTER_MIN / 2;
      const hh = Math.floor(t), mm = Math.round((t % 1) * 60);
      switchLog.push({
        key: i,
        time: hh + ':' + String(mm).padStart(2, '0'),
        moment: atStart ? 'start ' + (q + 1) + 'e kwart' : 'halverwege ' + (q + 1) + 'e kwart',
        out: out.length ? nm(out) : '—',
        inn: inn.length ? nm(inn) : '—'
      });
    }
  }

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
        return {
          key: k,
          pos: PMAP[k].label,
          nameA: (pa ? nameOf(pa) + supNum(subA) : '—') + (goesOff ? ' ◂' : moves ? ' ⇄' : ''),
          nameB: swap ? (pb ? nameOf(pb) + supNum(subB) : '—') + (arrivesFromBench ? ' ▸' : ' ⇄') : '',
          onEdit: readOnly ? undefined : () => { setEditing({ q, half: 0, pos: k }); setRelocating(null); },
          onEditB: readOnly ? undefined : () => { setEditing({ q, half: 1, pos: k }); setRelocating(null); },
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
      name: p.first + (kHalves === 8 ? ' (keep)' : kHalves ? ' (keep ½)' : ''),
      q1: cell(arr[0], 0), q2: cell(arr[1], 1), q3: cell(arr[2], 2), q4: cell(arr[3], 3),
      halves: String(tot), minutes: String(Math.round(tot * hm)),
      _minutesNum: tot * hm
    };
  }).sort((a, b) => b._minutesNum - a._minutesNum);

  const injOptions = selectedPlayers().filter(p => p.id !== m.keeperId && (m.injuries || {})[p.id] == null).map(p => ({ id: p.id, label: p.first }));
  const injFromOptions = [1, 2, 3, 4].map(q => ({ value: String(q), label: 'vanaf ' + q + 'e kwart' }));
  const injuryList = Object.keys(m.injuries || {}).map(id => ({
    key: id,
    label: nameOf(id) + ' geblesseerd vanaf kwart ' + (Math.floor(m.injuries[id] / 2) + 1) + ' — klik om terug te zetten',
    clear: () => clearInjury(id)
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
          key: ci, name: p ? p.first : '?',
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
      title: (p ? p.first : '') + ' speelt nu niet in kwart ' + (rel.q + 1),
      intro: 'Kies waar zij alsnog speelt. De speelster die daar staat gaat op de bank in die helft.',
      options: slots.slice(0, 8).map((s, si) => ({
        key: si,
        name: PMAP[s.pos].label + ' · ' + (s.h === 0 ? '1e helft' : '2e helft'),
        meta: fitOf(p, s.pos),
        effect: s.occ.first + ' gaat daar weg',
        style: 'display:flex;flex-direction:column;gap:1px;text-align:left;width:100%;cursor:pointer;background:none;font-family:var(--font-body);padding:7px 10px;border-radius:var(--radius-md);border:1px solid var(--color-neutral-300)',
        apply: () => applySwap(s.b, s.pos, rel.id)
      })),
      close: () => setRelocating(null)
    };
  }

  const posCols = POS.map(p => ({ key: p.k, short: p.short, count: players.filter(pl => pl.prefs[p.k]).length }));
  const teamRows = players.map(p => ({
    key: p.id,
    name: p.first + ' ' + p.last,
    posCount: Object.values(p.prefs).filter(Boolean).length,
    level: String(p.level || 3),
    onLevel: e => { if (readOnly) return; const v = Number(e.target.value); setPlayers(ps => ps.map(x => x.id === p.id ? { ...x, level: v } : x)); },
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
    cells: (row.picks || [null, null, null]).map((pid, ci) => ({
      key: ci, value: pid || '',
      onChange: e => {
        if (readOnly) return;
        const val = e.target.value || null;
        setSc(s => ({
          ...s,
          [group]: s[group].map(r => r.id === row.id ? { ...r, picks: r.picks.map((p, j) => j === ci ? val : p) } : r)
        }));
      }
    })),
    remove: () => { if (readOnly) return; setSc(s => ({ ...s, [group]: s[group].filter(r => r.id !== row.id) })); }
  }));
  const addScRole = group => {
    if (readOnly) return;
    setSc(s => ({ ...s, [group]: (s[group] || []).concat([{ id: 'sc' + Date.now() + Math.random().toString(36).slice(2, 6), role: '', picks: [null, null, null] }]) }));
  };
  const scSummary = group => (sc[group] || []).map(r => {
    const selIds = m.selected || [];
    const availId = (r.picks || []).find(pid => pid && selIds.indexOf(pid) >= 0);
    return { key: r.id, role: r.role, names: availId ? nameOf(availId) : '—' };
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
    ? 'Aan de beurt om te keepen: ' + rotationOrder.slice(0, 4).map(p => p.first).join(', ') + '.'
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
    return {
      key: f.id,
      date: f.date, time: f.time, opponent: f.opponent,
      day: d && !isNaN(d) ? DAGEN[d.getDay()] : '—',
      homeName, awayName,
      homeStyle: f.home ? 'color:var(--color-accent-700);font-weight:600' : 'color:var(--color-text)',
      awayStyle: !f.home ? 'color:var(--color-accent-700);font-weight:600' : 'color:var(--color-text)',
      status: (f.gf !== '' && f.gf != null && f.ga !== '' && f.ga != null) ? 'gespeeld' : '—',
      onDate: e => upd({ date: e.target.value }),
      onTime: e => upd({ time: e.target.value }),
      gf: f.gf == null ? '' : String(f.gf),
      ga: f.ga == null ? '' : String(f.ga),
      onGf: e => { if (readOnly) return; const v = e.target.value; upd({ gf: v }); setHistory(hs => hs.map(h => (h.date === f.date && h.opponent === f.opponent) ? { ...h, gf: v } : h)); },
      onGa: e => { if (readOnly) return; const v = e.target.value; upd({ ga: v }); setHistory(hs => hs.map(h => (h.date === f.date && h.opponent === f.opponent) ? { ...h, ga: v } : h)); },
      friendly: !!f.friendly,
      toggleFriendly: () => upd({ friendly: !f.friendly }),
      friendlyStyle: 'cursor:pointer;font-family:var(--font-body);font-size:13px;padding:2px 8px;border-radius:var(--radius-md);border:1px solid var(--color-neutral-400);'
        + (f.friendly ? 'background:var(--color-accent-2-100);color:var(--color-accent-2-800);border-color:var(--color-accent-2-400)' : 'background:transparent;color:var(--color-neutral-700)'),
      points: (() => {
        if (f.friendly || f.gf === '' || f.gf == null || f.ga === '' || f.ga == null) return '—';
        const us = f.home ? Number(f.gf) : Number(f.ga);
        const them = f.home ? Number(f.ga) : Number(f.gf);
        return us > them ? '3' : us === them ? '1' : '0';
      })(),
      planLabel: f.locked ? 'Bekijk schema' : 'Plan',
      plan: () => loadFixture(f),
      remove: () => { if (!readOnly) setFixtures(fs => fs.filter(x => x.id !== f.id)); }
    };
  });

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

  const dateline = (m.opponent ? 'tegen ' + m.opponent : 'geen tegenstander') + ' · 4 × ' + QUARTER_MIN + ' min';
  const scoreFxObj = fixtures.find(x => x.id === m.fixtureId);
  const vastePlayers = players.filter(p => !p.sub);
  const invallerPlayers = players.filter(p => p.sub);
  const chipFor = id => selectionChips.find(c => c.key === id);
  const matchLocked = !!m.locked;
  const generateWarning = !m.fixtureId ? 'Kies eerst een wedstrijd uit het programma.' : (!m.keeperId ? 'Kies eerst een keeper.' : (nSel < 8 ? 'Selecteer minimaal 8 speelsters.' : ''));

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

  return (
    <div data-sheet="1" style={css('position:relative;z-index:0;min-height:100vh;background:var(--color-bg);color:var(--color-text);font-family:var(--font-body);padding:var(--space-6) var(--space-8) var(--space-8);max-width:1180px;margin:0 auto')}>

      {/* Watermerk: negatieve z-index plaatst 'm ná de achtergrond van dit (position:relative)
          element maar vóór alle gewone (niet-gepositioneerde) inhoud erna - anders zou een
          position:absolute element juist BOVEN de gewone inhoud tekenen, ondanks dat het als
          eerste in de DOM staat. */}
      <img src="/hcrb.png" alt="" aria-hidden="true" style={css('position:absolute;top:50%;left:50%;translate:-50% -50%;width:min(50vw,480px);height:auto;opacity:0.06;filter:grayscale(1);pointer-events:none;user-select:none;z-index:-1')} />

      <header style={css('display:flex;flex-direction:column;gap:var(--space-2)')}>
        <div style={css('height:5px;background:var(--color-text)')}></div>
        <div style={css('display:flex;align-items:flex-start;gap:var(--space-3);padding-top:var(--space-1)')}>
          <img src="/hcrb.png" alt="HCRB" style={css('height:76px;width:auto')} />
          <div style={css('display:flex;flex-direction:column;gap:var(--space-2);flex:1;min-width:0')}>
            <div style={css('display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-4);flex-wrap:wrap')}>
              <h1 style={css('font-family:var(--font-heading);font-weight:600;font-size:44px;line-height:1;margin:0;letter-spacing:-0.01em')}>{activeTabLabel} — {ownTeamName}</h1>
              <div style={css('font-size:14px;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-neutral-700)')}>{dateline}</div>
            </div>
            <div data-noprint="1" style={css('display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap')}>
              <div className="field" style={css('margin:0;min-width:200px')}>
                <select className="input" aria-label="Team" style={css('padding:5px 8px;font-size:14px')} value={currentTeamId || ''}
                  onChange={e => setCurrentTeamId(e.target.value)}>
                  {!teams.length && <option value="">Nog geen teams</option>}
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {user ? (
                <div style={css('display:flex;align-items:center;gap:var(--space-2);font-size:14px')}>
                  <span style={css('color:var(--color-neutral-700)')}>{user.email}{isAdmin ? ' · admin' : ''}</span>
                  <button type="button" className="btn btn-secondary" onClick={logout}>Uitloggen</button>
                </div>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => setLoginOpen(true)}>Inloggen</button>
              )}
            </div>
          </div>
        </div>
        <div style={css('height:1px;background:var(--color-text);margin-top:var(--space-1)')}></div>
        <nav data-noprint="1" style={css('display:flex;gap:var(--space-4);padding-top:var(--space-1);flex-wrap:wrap')}>
          {tabs.map(t => <button key={t.key} type="button" onClick={t.go} style={css(t.style)}>{t.label}</button>)}
        </nav>
      </header>

      {loginOpen && <Login onClose={() => setLoginOpen(false)} />}

      {tab === 'wedstrijd' && (
        <main style={css('padding-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-8)')}>

          <section data-noprint="1" style={css('display:flex;flex-direction:column;gap:var(--space-4)')}>
            <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0;font-weight:600')}>De wedstrijd</h2>
            <div className="field" style={css('max-width:500px')}>
              <label htmlFor="fx">Wedstrijd</label>
              <select className="input" id="fx" value={m.fixtureId || ''} onChange={e => {
                const f = fixtures.find(x => x.id === e.target.value);
                if (!f) { patchMatch({ fixtureId: '', opponent: '', date: '', selected: [], keeperId: '', keeper2Id: '', keeperSwitches: false, keepersPlayOut: false, schedule: null, injuries: {}, locked: false }); return; }
                loadFixture(f);
              }}>
                <option value="">— kies een wedstrijd uit het programma —</option>
                {matchOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
          </section>

          {matchLocked && (
            <div className="card elev-md" style={css('padding:var(--space-3) var(--space-4);display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap')}>
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
              <button type="button" className="btn btn-ghost" disabled={matchLocked || readOnly} onClick={() => patchMatch({ selected: players.map(p => p.id) })}>Iedereen selecteren</button>
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
              <input type="checkbox" checked={!!m.keeperSwitches} disabled={matchLocked || readOnly} onChange={e => patchMatch({ keeperSwitches: e.target.checked, keeper2Id: e.target.checked ? m.keeper2Id : '', schedule: null })} />
              <span>Keeper wisselt na 2 kwarten (na de rust)</span>
            </label>
            <label style={css('display:flex;align-items:center;gap:var(--space-2);font-size:16px;cursor:pointer')}>
              <input type="checkbox" checked={!!m.keepersPlayOut} disabled={matchLocked || readOnly} onChange={e => patchMatch({ keepersPlayOut: e.target.checked, schedule: null })} />
              <span>Keepers spelen in de helft dat ze niet keepen mee in het veld</span>
            </label>
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
          </section>

          <section data-noprint="1" style={css('display:flex;flex-direction:column;gap:var(--space-3)')}>
            <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0;font-weight:600')}>Stap 3 — Schema</h2>
            <div style={css('display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap')}>
              <button type="button" className="btn btn-primary" disabled={matchLocked || readOnly} onClick={generate}>{sched ? 'Schema opnieuw maken' : 'Maak schema'}</button>
              <span style={css('font-size:15px;color:var(--color-accent-2-700)')}>{generateWarning}</span>
            </div>
          </section>

          {sched && (
            <section style={css('display:flex;flex-direction:column;gap:var(--space-6)')}>

              <div style={css('display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-4);flex-wrap:wrap')}>
                <h2 style={css('font-family:var(--font-heading);font-size:30px;margin:0;font-weight:600')}>{scheduleTitle}</h2>
                <div data-noprint="1" style={css('display:flex;gap:var(--space-2);align-items:center;flex-wrap:wrap')}>
                  <button type="button" className="btn btn-secondary" onClick={() => setPrintDialogOpen(true)}>Printen</button>
                </div>
              </div>

              {printDialogOpen && (
                <div className="dialog-backdrop" data-noprint="1" onClick={() => setPrintDialogOpen(false)}>
                  <div className="dialog" onClick={e => e.stopPropagation()}>
                    <div className="dialog-title">Wat wil je meeprinten?</div>
                    <p className="dialog-body" style={css('margin:0')}>Het schema zelf wordt altijd geprint. Kies welke onderdelen daarnaast mee moeten.</p>
                    <label style={css('display:flex;align-items:center;gap:var(--space-2);font-size:16px;cursor:pointer')}>
                      <input type="checkbox" checked={printOptions.wissels} onChange={e => setPrintOptions(o => ({ ...o, wissels: e.target.checked }))} />
                      <span>Wisselmomenten</span>
                    </label>
                    <label style={css('display:flex;align-items:center;gap:var(--space-2);font-size:16px;cursor:pointer')}>
                      <input type="checkbox" checked={printOptions.strafcorner} onChange={e => setPrintOptions(o => ({ ...o, strafcorner: e.target.checked }))} />
                      <span>Strafcorner</span>
                    </label>
                    <label style={css('display:flex;align-items:center;gap:var(--space-2);font-size:16px;cursor:pointer')}>
                      <input type="checkbox" checked={printOptions.speeltijd} onChange={e => setPrintOptions(o => ({ ...o, speeltijd: e.target.checked }))} />
                      <span>Speeltijd deze wedstrijd</span>
                    </label>
                    <div className="dialog-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => setPrintDialogOpen(false)}>Annuleren</button>
                      <button type="button" className="btn btn-primary" onClick={() => { setPrintDialogOpen(false); doPrint(); }}>Printen</button>
                    </div>
                  </div>
                </div>
              )}

              <div data-noprint="1" style={css('display:flex;flex-direction:column;gap:var(--space-2);max-width:820px')}>
                <div style={css('font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-neutral-700)')}>Blessure — schema opnieuw indelen</div>
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

              {editor && (
                <div className="dialog-backdrop" data-noprint="1" style={css('position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:var(--space-4)')}>
                  <div className="dialog elev-lg" style={css('max-width:460px;width:100%;max-height:80vh;overflow-y:auto;padding:var(--space-4)')}>
                    <div className="dialog-title" style={css('font-family:var(--font-heading);font-size:22px')}>{editor.title}</div>
                    <div className="dialog-body" style={css('display:flex;flex-direction:column;gap:var(--space-3)')}>
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
              )}

              {relocator && (
                <div className="dialog-backdrop" data-noprint="1" style={css('position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:var(--space-4)')}>
                  <div className="dialog elev-lg" style={css('max-width:460px;width:100%;max-height:80vh;overflow-y:auto;padding:var(--space-4)')}>
                    <div className="dialog-title" style={css('font-family:var(--font-heading);font-size:22px')}>{relocator.title}</div>
                    <div className="dialog-body" style={css('display:flex;flex-direction:column;gap:var(--space-3)')}>
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
              )}

              <div data-noprint="1" style={css('display:flex;flex-wrap:wrap;gap:var(--space-1) var(--space-4);font-size:15px;color:var(--color-neutral-700);max-width:80ch')}>
                <span>Bovenste naam = 1e helft, onderste naam = na de wissel op 8:00.</span>
                <span style={{ color: '#a32020' }}>◂ gaat eruit</span>
                <span style={{ color: '#1c6b3d' }}>▸ komt erin</span>
                <span style={css('color:var(--color-accent-700)')}>⇄ wisselt van positie</span>
                <span>Gekleurde achtergrond = bij aanvang van dit kwart ingekomen (groen) of verplaatst (blauw).</span>
                <span>Klik op een naam om die plek handmatig te wijzigen — je krijgt dan alternatieven te zien.</span>
              </div>

              <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:var(--space-6)')}>
                {halves.map(h => (
                  <article key={h.key} data-halfcard="1" style={css('display:flex;flex-direction:column;gap:var(--space-2)')}>
                    <div style={css('display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-2);border-bottom:2px solid var(--color-text);padding-bottom:4px')}>
                      <h3 style={css('font-family:var(--font-heading);font-size:21px;margin:0;font-weight:600;white-space:nowrap')}>{h.title}</h3>
                      <span style={css('font-size:13px;color:var(--color-neutral-700);letter-spacing:0.06em')}>{h.time}</span>
                    </div>
                    <div style={css('display:flex;flex-direction:column;gap:6px;padding-top:2px')}>
                      {h.rows.map(row => (
                        <div key={row.key} style={css('display:flex;justify-content:center;gap:6px')}>
                          {row.cells.map(cell => (
                            <div key={cell.key} style={css(cell.style)}>
                              <div style={css('font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-neutral-700)')}>{cell.pos}</div>
                              <div style={css(cell.nameAStyle)} onClick={cell.onEdit}>{cell.nameA}</div>
                              <div style={css(cell.subStyle)} onClick={cell.onEditB}>{cell.nameB}</div>
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
                ))}
              </div>

              <div data-noprint={printOptions.wissels ? undefined : '1'} style={css('display:flex;flex-direction:column;gap:var(--space-2)')}>
                <h3 style={css('font-family:var(--font-heading);font-size:22px;margin:0;font-weight:600')}>Wisselmomenten — in één oogopslag</h3>
                <table className="table">
                  <thead><tr><th style={{ textAlign: 'left' }}>Tijd</th><th style={{ textAlign: 'left' }}>Moment</th><th style={{ textAlign: 'left' }}>Eruit</th><th style={{ textAlign: 'left' }}>Erin</th></tr></thead>
                  <tbody>
                    {switchLog.map(sw => (
                      <tr key={sw.key}>
                        <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{sw.time}</td>
                        <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{sw.moment}</td>
                        <td style={{ textAlign: 'left', color: '#a32020' }}>{sw.out}</td>
                        <td style={{ textAlign: 'left', color: '#1c6b3d' }}>{sw.inn}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div data-noprint={printOptions.strafcorner ? undefined : '1'} style={css('display:flex;flex-direction:column;gap:var(--space-3)')}>
                <h3 style={css('font-family:var(--font-heading);font-size:24px;margin:0;font-weight:600')}>Strafcorner</h3>
                <p style={css('margin:0;font-size:14px;color:var(--color-neutral-700)')}>Op basis van wie er voor deze wedstrijd is geselecteerd.</p>
                <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:var(--space-6)')}>
                  <div>
                    <div style={css('font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-accent-700);padding-bottom:4px')}>Verdedigen</div>
                    {scSummary('verdedigen').map(s => (
                      <div key={s.key} style={css('display:flex;justify-content:space-between;gap:var(--space-3);padding:3px 0;font-size:16px')}><span style={css('color:var(--color-neutral-700)')}>{s.role}</span><span>{s.names}</span></div>
                    ))}
                  </div>
                  <div>
                    <div style={css('font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-accent-700);padding-bottom:4px')}>Aanval</div>
                    {scSummary('aanval').map(s => (
                      <div key={s.key} style={css('display:flex;justify-content:space-between;gap:var(--space-3);padding:3px 0;font-size:16px')}><span style={css('color:var(--color-neutral-700)')}>{s.role}</span><span>{s.names}</span></div>
                    ))}
                  </div>
                </div>
              </div>

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

              <div className="card elev-md" data-noprint="1" style={css('padding:var(--space-4);display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap')}>
                <span style={css('font-size:16px;max-width:60ch;text-wrap:pretty')}>Klaar met indelen? Sla het schema op — de eindstand vul je straks in bij Programma.</span>
                <button type="button" className="btn btn-primary" disabled={matchLocked || readOnly} onClick={saveMatch}>Schema opslaan</button>
              </div>

            </section>
          )}
        </main>
      )}

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
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={css('min-width:980px')}>
              <thead><tr><th style={{ textAlign: 'left' }}>Datum</th><th style={{ textAlign: 'left' }}>Dag</th><th style={{ textAlign: 'left' }}>Tijd</th><th style={{ textAlign: 'left' }}>Wedstrijd</th><th>Eindstand</th><th>Punten</th><th></th><th></th></tr></thead>
              <tbody>
                {fixtureRows.map(f => (
                  <tr key={f.key}>
                    <td><input className="input" type="date" aria-label={`Datum — wedstrijd tegen ${f.opponent || 'onbekend'}`} disabled={readOnly} style={css('padding:4px 6px')} value={f.date} onChange={f.onDate} /></td>
                    <td style={{ textAlign: 'left', color: 'var(--color-neutral-700)' }}>{f.day}</td>
                    <td><input className="input" type="time" aria-label={`Tijd — wedstrijd tegen ${f.opponent || 'onbekend'}`} disabled={readOnly} style={css('padding:4px 6px;width:110px')} value={f.time} onChange={f.onTime} /></td>
                    <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                      <span style={css(f.homeStyle)}>{f.homeName}</span>
                      <span style={{ color: 'var(--color-neutral-700)' }}> – </span>
                      <span style={css(f.awayStyle)}>{f.awayName}</span>
                      <div style={css('padding-top:3px')}><button type="button" disabled={readOnly} onClick={f.toggleFriendly} style={css(f.friendlyStyle)}>Oefenwedstrijd</button></div>
                    </td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <input className="input" type="number" min="0" aria-label={`Doelpunten voor — wedstrijd tegen ${f.opponent || 'onbekend'}`} disabled={readOnly} style={css('width:44px;text-align:center;padding:4px')} value={f.gf} onChange={f.onGf} />
                      <span style={{ padding: '0 3px' }}>–</span>
                      <input className="input" type="number" min="0" aria-label={`Doelpunten tegen — wedstrijd tegen ${f.opponent || 'onbekend'}`} disabled={readOnly} style={css('width:44px;text-align:center;padding:4px')} value={f.ga} onChange={f.onGa} />
                    </td>
                    <td style={{ textAlign: 'center' }}>{f.points}</td>
                    <td style={{ textAlign: 'center' }}><button type="button" className="btn btn-secondary" disabled={readOnly} style={{ padding: '3px 10px' }} onClick={f.plan}>{f.planLabel}</button></td>
                    <td style={{ textAlign: 'center', color: 'var(--color-neutral-700)', whiteSpace: 'nowrap' }}>{f.status} <button type="button" className="btn btn-ghost" disabled={readOnly} style={{ padding: '2px 8px' }} onClick={f.remove}>×</button></td>
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
                <label className="radio"><input type="checkbox" checked={addFixtureForm.friendly} onChange={e => setAddFixtureForm(f => ({ ...f, friendly: e.target.checked }))} /><span>Oefenwedstrijd</span></label>
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

          {isMyTeam && (
            <div style={css('display:flex;flex-direction:column;gap:var(--space-2)')}>
              {lisaConfig ? (
                <div style={css('display:flex;gap:var(--space-3);align-items:center;flex-wrap:wrap')}>
                  <button type="button" className="btn btn-secondary" disabled={standingsBusy} onClick={refreshStandings}>{standingsBusy ? 'Bezig…' : 'Ververs stand'}</button>
                  {standingsUpdatedAt && (
                    <span style={css('font-size:13px;color:var(--color-neutral-700)')}>
                      Bijgewerkt op {new Date(standingsUpdatedAt).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  )}
                </div>
              ) : (
                <p style={css('margin:0;font-size:15px;color:var(--color-neutral-700);max-width:70ch;text-wrap:pretty')}>
                  Koppel eerst de clubwebsite (bij Teams) om de stand te kunnen ophalen.
                </p>
              )}
              {standingsError && <div style={css('font-size:13px;color:var(--color-accent-2-700)')}>{standingsError}</div>}
            </div>
          )}

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
                    {pouleRows.map(r => (
                      <tr key={r.name} style={r.name === lisaConfig?.teamName ? { fontWeight: 600 } : undefined}>
                        <td style={{ textAlign: 'center' }}>{r.position}</td>
                        <td style={{ textAlign: 'left' }}>{r.name}</td>
                        <td style={{ textAlign: 'center' }}>{r.number_of_matches}</td>
                        <td style={{ textAlign: 'center' }}>{r.wins}</td>
                        <td style={{ textAlign: 'center' }}>{r.draws}</td>
                        <td style={{ textAlign: 'center' }}>{r.loses}</td>
                        <td style={{ textAlign: 'center' }}>{r.goals_for}–{r.goals_against} ({r.goal_balance > 0 ? '+' : ''}{r.goal_balance})</td>
                        <td style={{ textAlign: 'center' }}>{r.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
      )}

      {tab === 'team' && (isMyTeam ? (
        <main style={css('padding-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-4)')}>
          <h2 style={css('font-family:var(--font-heading);font-size:26px;margin:0;font-weight:600')}>Team</h2>
          <p style={css('margin:0;font-size:15px;color:var(--color-neutral-700);max-width:70ch;text-wrap:pretty')}>Niveau geeft de sterkte aan. Bij de posities is 1 de beste positie voor deze speelster, 2 de op één na beste, enzovoort. Laat leeg wat zij niet speelt.</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={css('min-width:1080px')}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Speelster</th>
                  <th>Type</th>
                  <th>Niveau</th>
                  {posCols.map(p => <th key={p.key} style={{ fontSize: '12px' }}>{p.short} ({p.count})</th>)}
                  <th style={{ fontSize: '12px' }}>KP</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map(r => (
                  <tr key={r.key}>
                    <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{r.name} ({r.posCount})</td>
                    <td style={{ textAlign: 'center' }}><button type="button" className="tag" style={{ cursor: 'pointer', border: 'none' }} onClick={r.onToggleSub}>{r.subLabel}</button></td>
                    <td style={{ textAlign: 'center' }}>
                      <select className="input" aria-label={`Niveau van ${r.name}`} style={css('padding:6px 8px;min-width:170px;font-size:15px;font-weight:500')} value={r.level} onChange={r.onLevel}>
                        {LEVELS.map(lv => <option key={lv.v} value={lv.v}>{lv.label}</option>)}
                      </select>
                    </td>
                    {r.cells.map(c => (
                      <td key={c.key} style={{ textAlign: 'center' }}><input className="input" type="number" min="1" max="9" style={css('width:46px;text-align:center;padding:4px')} value={c.value} onChange={c.onChange} /></td>
                    ))}
                    <td style={{ textAlign: 'center' }}><input type="checkbox" checked={r.fixedKeeper} disabled={readOnly} onChange={r.onToggleFixedKeeper} /></td>
                    <td style={{ textAlign: 'center' }}><button type="button" className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={r.remove}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={css('margin:0;font-size:13px;color:var(--color-neutral-700);max-width:70ch;text-wrap:pretty')}>
            <strong>Legenda</strong> — {POS.map(p => p.k + ': ' + p.label).join(' · ')} · KP: Vaste keeper
          </p>
          <div style={css('display:flex;gap:var(--space-3);align-items:flex-end;flex-wrap:wrap;padding-top:var(--space-2)')}>
            <div className="field"><label htmlFor="nn">Nieuwe speelster</label><input className="input" id="nn" type="text" placeholder="Voornaam Achternaam" value={newName} onChange={e => setNewName(e.target.value)} /></div>
            <label style={css('display:flex;align-items:center;gap:6px;font-size:16px;cursor:pointer;padding-bottom:9px')}>
              <input type="checkbox" checked={newIsSub} onChange={e => setNewIsSub(e.target.checked)} />
              <span>Dit is een invaller</span>
            </label>
            <button type="button" className="btn btn-primary" disabled={readOnly} onClick={addPlayer}>Toevoegen</button>
          </div>
        </main>
      ) : accessGate('Team'))}

      {tab === 'sc' && (
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
                          {players.map(p => <option key={p.id} value={p.id}>{p.first}</option>)}
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
                          {players.map(p => <option key={p.id} value={p.id}>{p.first}</option>)}
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
      )}

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
              <thead><tr><th style={{ textAlign: 'left' }}>Naam</th><th style={{ textAlign: 'left' }}>Team-id</th>{isAdmin && <th></th>}</tr></thead>
              <tbody>
                {teams.map(t => (
                  <tr key={t.id}>
                    <td style={{ textAlign: 'left' }}>{t.name}</td>
                    <td style={{ textAlign: 'left', color: 'var(--color-neutral-700)', fontFamily: 'monospace' }}>{t.id}</td>
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
                {!teams.length && <tr><td colSpan={isAdmin ? 3 : 2} style={{ color: 'var(--color-neutral-700)' }}>Nog geen teams.</td></tr>}
              </tbody>
            </table>
          </div>
          <p style={css('margin:0;font-size:14px;color:var(--color-neutral-700);max-width:60ch;text-wrap:pretty')}>
            Het team-id heb je nodig om een nieuwe gebruiker aan dit team te koppelen (in de Firestore-console, onder <code>users/&#123;uid&#125;</code>).
          </p>

          {isMyTeam && (
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

          {isAdmin ? (
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
          ) : (
            <p style={css('margin:0;font-size:14px;color:var(--color-neutral-700)')}>
              {user ? 'Alleen beheerders kunnen nieuwe teams aanmaken.' : 'Log in als beheerder om een nieuw team aan te maken.'}
            </p>
          )}
        </main>
      )}
    </div>
  );
}
