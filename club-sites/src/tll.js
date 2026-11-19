import { db, makeAuth, friendlyError } from './common.js';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

const A = makeAuth('tll');
export const TLL = {
  ...A,
  signIn: A.signIn,
  onUser: A.onUser,
  friendlyError,
  // Subscribes the signed-in Google account's own email. One per account.
  async subscribe() {
    let u = A.user;
    if (!u) u = (await A.signIn()).user;
    const ref = doc(db, 'sites', 'tll', 'subscribers', u.uid);
    if ((await getDoc(ref)).exists()) return { email: u.email, already: true };
    await setDoc(ref, { email: u.email, name: (u.displayName || '').slice(0, 100), at: serverTimestamp() });
    return { email: u.email, already: false };
  },
};
