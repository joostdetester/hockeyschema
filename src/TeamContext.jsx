import { createContext, useContext, useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';
import { useAuth } from './AuthContext.jsx';

const TeamCtx = createContext(null);

const BLANK_PUBLIC_STATE = {
  players: [],
  sc: { verdedigen: [], aanval: [] },
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
  const { myTeamId } = useAuth();
  const [teams, setTeams] = useState([]);
  const [teamsLoaded, setTeamsLoaded] = useState(false);
  const [currentTeamId, setCurrentTeamId] = useState(null);

  useEffect(() => {
    return onSnapshot(collection(db, 'teams'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
      setTeams(list);
      setTeamsLoaded(true);
      setCurrentTeamId(cur => cur && list.some(t => t.id === cur) ? cur : (list[0]?.id || null));
    });
  }, []);

  // Bij inloggen automatisch naar het eigen team wisselen.
  useEffect(() => {
    if (myTeamId) setCurrentTeamId(myTeamId);
  }, [myTeamId]);

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
    <TeamCtx.Provider value={{ teams, teamsLoaded, currentTeamId, setCurrentTeamId, createTeam, deleteTeam }}>
      {children}
    </TeamCtx.Provider>
  );
}

export function useTeam() {
  return useContext(TeamCtx);
}
