import { db, makeAuth, friendlyError } from './common.js';
import {
  collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, Timestamp, where, writeBatch,
} from 'firebase/firestore';

const SITE = 'vsa';
const base = (...p) => doc(db, 'sites', SITE, ...p);
const col = (name) => collection(db, 'sites', SITE, name);
const A = makeAuth(SITE);

window.VSA = {
  ...A,
  friendlyError,
  signIn: A.signIn,
  signOut: A.signOut,
  onUser: A.onUser,
  // Public: whether check-in is open for a meeting.
  watchMeeting(meeting, cb) {
    return onSnapshot(base('meetings', meeting), (s) => {
      if (!s.exists()) return cb(null);
      const m = s.data();
      cb({ opensAt: m.opensAt?.toDate(), closesAt: m.closesAt?.toDate() });
    }, () => cb(null));
  },
  // Rules check the word, the window, the account, and one check-in per meeting.
  async checkIn({ meeting, name, grade, word }) {
    const u = A.user;
    if (!u) throw Object.assign(new Error('signin'), { code: 'signin' });
    const ref = base('checkins', `${meeting}_${u.uid}`);
    if ((await getDoc(ref).catch(() => null))?.exists()) throw Object.assign(new Error('dup'), { code: 'already' });
    await setDoc(ref, {
      meeting, uid: u.uid, email: u.email, name, grade, word: word.trim().toLowerCase(), at: serverTimestamp(),
    });
  },
  watchMine(cb) {
    const u = A.user;
    if (!u) { cb([]); return () => {}; }
    return onSnapshot(query(col('checkins'), where('uid', '==', u.uid)),
      (s) => cb(s.docs.map((d) => d.data())), () => cb([]));
  },
  // Officers only.
  watchRoster(meeting, cb) {
    return onSnapshot(query(col('checkins'), where('meeting', '==', meeting)),
      (s) => cb(s.docs.map((d) => d.data()).sort((a, b) => (a.at?.toMillis() ?? 0) - (b.at?.toMillis() ?? 0))),
      () => cb(null));
  },
  async openMeeting(meeting, word, minutes) {
    const u = A.user;
    const mins = Math.max(5, Math.min(720, Math.round(minutes)));
    const w = word.trim().toLowerCase();
    if (!/^[a-z0-9 ]{2,30}$/.test(w)) throw Object.assign(new Error('word'), { code: 'word' });
    const batch = writeBatch(db);
    // closesAt is computed from the client clock; rules cap it at 12 hours after server time.
    batch.set(base('meetings', meeting), {
      opensAt: serverTimestamp(),
      closesAt: Timestamp.fromMillis(Date.now() + mins * 60e3 - 60e3),
      setBy: u.uid,
    });
    batch.set(base('meetingWords', meeting), { word: w });
    await batch.commit();
  },
  async closeMeeting(meeting) {
    const ref = base('meetingWords', meeting);
    const w = (await getDoc(ref)).data()?.word;
    const batch = writeBatch(db);
    batch.set(base('meetings', meeting), {
      opensAt: serverTimestamp(), closesAt: Timestamp.fromMillis(Date.now() + 5000), setBy: A.user.uid,
    });
    batch.set(ref, { word: w });
    await batch.commit();
  },
  async getWord(meeting) {
    return (await getDoc(base('meetingWords', meeting))).data()?.word ?? null;
  },
  async saveProfile({ name, grade, ig, interests }) {
    const u = A.user;
    if (!u) throw Object.assign(new Error('signin'), { code: 'signin' });
    const ref = base('members', u.uid);
    const old = await getDoc(ref);
    await setDoc(ref, {
      email: u.email, name, grade, ig, interests,
      joinedAt: old.exists() ? old.data().joinedAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return !old.exists();
  },
};
