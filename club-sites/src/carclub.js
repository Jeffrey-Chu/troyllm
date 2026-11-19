import { db, makeAuth, friendlyError } from './common.js';
import { collection, doc, getCountFromServer, getDoc, query, serverTimestamp, setDoc, where } from 'firebase/firestore';

const A = makeAuth('carclub');
const votes = collection(db, 'sites', 'carclub', 'votes');

window.CAR = {
  ...A,
  signIn: A.signIn,
  onUser: A.onUser,
  friendlyError,
  async totals() {
    const [m4, m5] = await Promise.all(['M4', 'M5'].map((c) => getCountFromServer(query(votes, where('choice', '==', c)))));
    return { M4: m4.data().count, M5: m5.data().count };
  },
  async myVote() {
    const u = A.user;
    if (!u) return null;
    return (await getDoc(doc(votes, u.uid))).data()?.choice ?? null;
  },
  // One vote per account; can be changed every 30 seconds.
  async vote(choice) {
    let u = A.user;
    if (!u) u = (await A.signIn()).user;
    await setDoc(doc(votes, u.uid), { choice, at: serverTimestamp() });
  },
};
