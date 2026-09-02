import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const MAX_LOGINS_KEPT = 50;

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // myTeams: { [teamId]: 'coach' | 'manager' } - a coach/manager can belong to several teams
  // at once, each with its own role. `role` stays a separate, global field - it's only ever
  // 'admin' (an admin isn't tied to any one team, so it doesn't belong in this per-team map).
  const [myTeams, setMyTeams] = useState({});
  const [role, setRole] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u);
      setAuthLoading(false);
      if (!u) { setMyTeams({}); setRole(null); }
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid), snap => {
      const d = snap.data() || {};
      // Backward compat: a doc not yet touched by the current addCoachToTeam still has the
      // old single teamId/role pair instead of the teams map - treat that as a one-entry map.
      // It self-heals to the map shape the next time this account is (re)linked to a team.
      let teams = d.teams || {};
      if (!Object.keys(teams).length && d.teamId && d.role && d.role !== 'admin') {
        teams = { [d.teamId]: d.role };
      }
      setMyTeams(teams);
      setRole(d.role === 'admin' ? 'admin' : null);
    });
  }, [user]);

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // Best-effort: record this successful sign-in for the admin's inlogpogingen overview.
    // Never let a hiccup here fail the login itself - the user is already authenticated.
    try {
      const ref = doc(db, 'users', cred.user.uid);
      const snap = await getDoc(ref);
      const previous = (snap.data() || {}).logins || [];
      const logins = [new Date().toISOString(), ...previous].slice(0, MAX_LOGINS_KEPT);
      await setDoc(ref, { logins }, { merge: true });
    } catch (e) { /* recording the login is not essential */ }
  }
  function logout() {
    return signOut(auth);
  }

  const isAdmin = role === 'admin';

  return (
    <AuthCtx.Provider value={{ user, myTeams, role, isAdmin, authLoading, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
