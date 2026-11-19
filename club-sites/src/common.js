import { auth, db } from '../../src/firebase.js';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export { auth, db };

// Google sign-in only. Rules also reject any other provider.
export function makeAuth(site) {
  let user = null;
  let admin = false;
  const listeners = new Set();
  const emit = () => listeners.forEach((cb) => cb({ user, admin }));
  onAuthStateChanged(auth, async (u) => {
    user = u;
    admin = false;
    if (u) {
      try { admin = (await getDoc(doc(db, 'sites', site, 'admins', u.uid))).exists(); } catch { admin = false; }
    }
    emit();
  });
  return {
    signIn: () => signInWithPopup(auth, new GoogleAuthProvider()),
    signOut: () => signOut(auth),
    onUser(cb) { listeners.add(cb); cb({ user, admin }); return () => listeners.delete(cb); },
    get user() { return user; },
    get admin() { return admin; },
  };
}

export function friendlyError(e) {
  const code = e?.code || '';
  if (code === 'permission-denied') return 'Not allowed.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Sign-in cancelled.';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in popup. Allow popups and try again.';
  if (code === 'unavailable') return 'You look offline. Try again.';
  return 'Something went wrong. Try again.';
}
