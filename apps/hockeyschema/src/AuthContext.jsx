import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const MAX_LOGINS_KEPT = 50;

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [myTeamId, setMyTeamId] = useState(null);
  const [role, setRole] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u);
      setAuthLoading(false);
      if (!u) { setMyTeamId(null); setRole(null); }
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid), snap => {
      const d = snap.data();
      setMyTeamId(d?.teamId || null);
      setRole(d?.role || null);
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
    <AuthCtx.Provider value={{ user, myTeamId, role, isAdmin, authLoading, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
