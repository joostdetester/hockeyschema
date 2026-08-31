import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase.js';

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
    await signInWithEmailAndPassword(auth, email, password);
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
