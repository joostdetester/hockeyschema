import { createContext, useContext, useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';
import { useAuth } from './AuthContext.jsx';
import { DEFAULT_SC } from './scDefaults.js';

const TeamCtx = createContext(null);

const BLANK_PUBLIC_STATE = {
  players: [],
  sc: DEFAULT_SC,
  fixtures: [],
  match: { opponent: '', date: '', keeperId: '', selected: [], injuries: {}, schedule: null },
};

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function TeamProvider({ children }) {
  const { myTeams } = useAuth();
  const [teams, setTeams] = useState([]);
  const [teamsLoaded, setTeamsLoaded] = useState(false);
  const [currentTeamId, setCurrentTeamId] = useState(null);
  const [defaultTeamId, setDefaultTeamIdState] = useState(null);
  const [defaultTeamLoaded, setDefaultTeamLoaded] = useState(false);

  useEffect(() => {
    return onSnapshot(collection(db, 'teams'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
      setTeams(list);
      setTeamsLoaded(true);
      // Alleen resetten als de huidige keuze niet meer bestaat (bijv. verwijderd team) - de
      // eerste keuze zelf gebeurt hieronder, pas als ook bekend is of er een standaardteam is.
      setCurrentTeamId(cur => cur && list.some(t => t.id === cur) ? cur : null);
    });
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'app'), snap => {
      setDefaultTeamIdState((snap.data() || {}).defaultTeamId || null);
      setDefaultTeamLoaded(true);
    }, () => setDefaultTeamLoaded(true));
  }, []);

  // Kiest het standaardteam (via Teams ingesteld) zodra zowel de teamlijst als het
  // standaardteam geladen zijn, en er nog geen (geldige) keuze is - wachten op allebei
  // voorkomt dat dit alvast op het eerste team alfabetisch uitkomt terwijl het
  // standaardteam nog onderweg is (wat daarna niet meer gecorrigeerd zou worden, want
  // currentTeamId is dan al geldig).
  useEffect(() => {
    if (!teamsLoaded || !defaultTeamLoaded || currentTeamId) return;
    const fallback = (defaultTeamId && teams.some(t => t.id === defaultTeamId)) ? defaultTeamId : (teams[0]?.id || null);
    if (fallback) setCurrentTeamId(fallback);
  }, [teamsLoaded, defaultTeamLoaded, defaultTeamId, teams, currentTeamId]);

  // Iemand kan aan meerdere teams gekoppeld zijn - bij inloggen kiezen we er hier één als
  // startpunt: bij voorkeur het ingestelde standaardteam, als dat er één van is, anders de
  // eerste koppeling. Wisselen naar een ander eigen team kan daarna gewoon via het
  // team-dropdown. Vastgelegd als losse string i.p.v. rechtstreeks op het myTeams-object te
  // depend'en, want dat is een nieuw object bij elke snapshot (ook wanneer de inhoud niet
  // wijzigt) en zou dit effect dan onnodig vaak laten terugspringen.
  const myTeamIds = myTeams ? Object.keys(myTeams) : [];
  const preferredMyTeamId = !myTeamIds.length ? null
    : (defaultTeamId && myTeams[defaultTeamId]) ? defaultTeamId : myTeamIds[0];

  // Bij inloggen automatisch naar het eigen team wisselen.
  useEffect(() => {
    if (preferredMyTeamId) setCurrentTeamId(preferredMyTeamId);
  }, [preferredMyTeamId]);

  async function setDefaultTeam(teamId) {
    await setDoc(doc(db, 'settings', 'app'), { defaultTeamId: teamId });
  }

  async function createTeam(name) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Naam is verplicht.');
    let id = slugify(trimmed);
    if (!id) throw new Error('Kies een naam met letters of cijfers.');
    if ((await getDoc(doc(db, 'teams', id))).exists()) {
      let n = 2;
      while ((await getDoc(doc(db, 'teams', `${id}-${n}`))).exists()) n++;
      id = `${id}-${n}`;
    }
    await setDoc(doc(db, 'teams', id), { name: trimmed, createdAt: serverTimestamp() });
    await setDoc(doc(db, 'teams', id, 'state', 'public'), BLANK_PUBLIC_STATE);
    await setDoc(doc(db, 'teams', id, 'state', 'history'), { entries: [] });
    setCurrentTeamId(id);
    return id;
  }

  async function deleteTeam(teamId) {
    await deleteDoc(doc(db, 'teams', teamId, 'state', 'public'));
    await deleteDoc(doc(db, 'teams', teamId, 'state', 'history'));
    await deleteDoc(doc(db, 'teams', teamId));
  }

  return (
    <TeamCtx.Provider value={{ teams, teamsLoaded, currentTeamId, setCurrentTeamId, createTeam, deleteTeam, defaultTeamId, setDefaultTeam }}>
      {children}
    </TeamCtx.Provider>
  );
}

export function useTeam() {
  return useContext(TeamCtx);
}
