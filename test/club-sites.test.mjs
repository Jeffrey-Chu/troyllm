import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  Timestamp, doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';

let env;
const google = (uid) => env.authenticatedContext(uid, {
  email: `${uid}@gmail.com`, email_verified: true, firebase: { sign_in_provider: 'google.com' },
}).firestore();
const anon = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const site = (db, ...p) => doc(db, 'sites', ...p);
const MEETING = '2026-11-18';
const soon = () => Timestamp.fromMillis(Date.now() + 60 * 60e3);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-troy-club-sites',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'sites/vsa/admins/vsaOfficer'), { email: 'vsaOfficer@gmail.com' });
    await setDoc(doc(db, 'sites/superdw/admins/owner'), { email: 'owner@gmail.com' });
    await setDoc(doc(db, 'members/llmOfficer'), { role: 'officer', email: 'llmOfficer@example.com' });
  });
});
after(async () => { await env?.cleanup(); });

async function openMeeting(db = google('vsaOfficer'), word = 'pho', closesAt = soon()) {
  const b = writeBatch(db);
  b.set(site(db, 'vsa', 'meetings', MEETING), { opensAt: serverTimestamp(), closesAt, setBy: 'vsaOfficer' });
  b.set(site(db, 'vsa', 'meetingWords', MEETING), { word });
  return b.commit();
}
const checkin = (uid, word = 'pho', extra = {}) => setDoc(site(google(uid), 'vsa', 'checkins', `${MEETING}_${uid}`), {
  meeting: MEETING, uid, email: `${uid}@gmail.com`, name: 'An', grade: '10', word, at: serverTimestamp(), ...extra,
});

test('nobody can make themselves an admin', async () => {
  await assertFails(setDoc(site(google('alice'), 'vsa', 'admins', 'alice'), { email: 'x' }));
  await assertFails(getDoc(site(google('alice'), 'vsa', 'admins', 'vsaOfficer')));
});

test('only VSA officers open check-in, max 12 hours', async () => {
  await assertFails(openMeeting(google('alice')));
  await assertFails(openMeeting(google('owner'))); // SUPER DW admin is not a VSA admin
  await assertFails(openMeeting(undefined, 'pho', Timestamp.fromMillis(Date.now() + 13 * 3600e3)));
  await assertSucceeds(openMeeting());
  await assertFails(getDoc(site(google('alice'), 'vsa', 'meetingWords', MEETING)));
  await assertSucceeds(getDoc(site(google('alice'), 'vsa', 'meetings', MEETING)));
});

test('check-in needs the right word, an open window, Google, and only once', async () => {
  await assertFails(checkin('alice')); // not open yet
  await openMeeting();
  await assertFails(checkin('alice', 'pizza'));
  await assertFails(checkin('alice', 'pho', { email: 'someone@else.com' }));
  await assertFails(setDoc(site(anon('anon'), 'vsa', 'checkins', `${MEETING}_anon`), {
    meeting: MEETING, uid: 'anon', email: 'a@b.c', name: 'A', grade: '9', word: 'pho', at: serverTimestamp(),
  }));
  await assertSucceeds(checkin('alice'));
  await assertFails(checkin('alice'));
  await assertFails(setDoc(site(google('bob'), 'vsa', 'checkins', `${MEETING}_alice`), {
    meeting: MEETING, uid: 'bob', email: 'bob@gmail.com', name: 'B', grade: '9', word: 'pho', at: serverTimestamp(),
  }));
});

test('check-in closes when the window ends', async () => {
  await openMeeting(undefined, 'pho', Timestamp.fromMillis(Date.now() + 1500));
  await new Promise((r) => setTimeout(r, 2500));
  await assertFails(checkin('alice'));
});

test('members see only their own check-ins; officers see all', async () => {
  await openMeeting();
  await checkin('alice');
  await checkin('bob');
  await assertSucceeds(getDocs(query(collection(google('alice'), 'sites/vsa/checkins'), where('uid', '==', 'alice'))));
  await assertFails(getDocs(query(collection(google('alice'), 'sites/vsa/checkins'), where('meeting', '==', MEETING))));
  await assertSucceeds(getDocs(query(collection(google('vsaOfficer'), 'sites/vsa/checkins'), where('meeting', '==', MEETING))));
  await assertFails(getDocs(collection(google('owner'), 'sites/vsa/checkins')));
});

test('VSA profiles: own only, validated, joinedAt fixed', async () => {
  const prof = (extra = {}) => ({
    email: 'alice@gmail.com', name: 'Alice', grade: '11', ig: '@alice', interests: ['meet', 'lion'],
    joinedAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
  });
  await assertFails(setDoc(site(google('bob'), 'vsa', 'members', 'alice'), prof()));
  await assertFails(setDoc(site(google('alice'), 'vsa', 'members', 'alice'), prof({ interests: ['hack'] })));
  await assertSucceeds(setDoc(site(google('alice'), 'vsa', 'members', 'alice'), prof()));
  await assertFails(setDoc(site(google('alice'), 'vsa', 'members', 'alice'), prof({ joinedAt: Timestamp.fromMillis(0) })));
  await assertFails(getDoc(site(google('bob'), 'vsa', 'members', 'alice')));
  await assertSucceeds(getDoc(site(google('vsaOfficer'), 'vsa', 'members', 'alice')));
});

test('TLL: subscribe only your own Google email, once', async () => {
  const sub = (db, uid, email) => setDoc(site(db, 'tll', 'subscribers', uid), { email, name: '', at: serverTimestamp() });
  await assertFails(sub(google('alice'), 'alice', 'victim@school.org'));
  await assertFails(sub(google('alice'), 'bob', 'bob@gmail.com'));
  await assertSucceeds(sub(google('alice'), 'alice', 'alice@gmail.com'));
  await assertFails(sub(google('alice'), 'alice', 'alice@gmail.com'));
  await assertFails(getDocs(collection(google('vsaOfficer'), 'sites/tll/subscribers')));
});

async function order(db, uid, n, extra = {}) {
  const b = writeBatch(db);
  b.set(site(db, 'superdw', 'orderMeta', uid), { count: n, last: serverTimestamp() });
  b.set(site(db, 'superdw', 'orders', `${uid}_${n}`), {
    uid, email: `${uid}@gmail.com`, name: 'Alice', city: 'Fullerton', intent: '',
    items: [{ name: 'Jade', detail: '', price: 48 }], total: 48, status: 'new', at: serverTimestamp(), ...extra,
  });
  return b.commit();
}

test('SUPER DW: order requests are rate limited and private', async () => {
  const db = google('alice');
  await assertFails(order(db, 'alice', 2));
  await assertFails(order(db, 'alice', 1, { status: 'paid' }));
  await assertFails(order(db, 'alice', 1, { items: [{ name: 'x', detail: '', price: 99999 }] }));
  await assertSucceeds(order(db, 'alice', 1));
  await assertFails(order(db, 'alice', 2)); // within 2 minutes
  await assertFails(getDoc(site(google('bob'), 'superdw', 'orders', 'alice_1')));
  await assertSucceeds(getDoc(site(db, 'superdw', 'orders', 'alice_1')));
  await assertFails(updateDoc(site(db, 'superdw', 'orders', 'alice_1'), { status: 'paid' }));
  await assertSucceeds(updateDoc(site(google('owner'), 'superdw', 'orders', 'alice_1'), { status: 'confirmed' }));
  await assertFails(updateDoc(site(google('owner'), 'superdw', 'orders', 'alice_1'), { total: 1 }));
  await assertFails(getDocs(collection(google('vsaOfficer'), 'sites/superdw/orders')));
});

test('SUPER DW: 50 order cap', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'sites/superdw/orderMeta/alice'),
    { count: 50, last: Timestamp.fromMillis(0) }));
  await assertFails(order(google('alice'), 'alice', 51));
});

test('Car Club: one vote per account, public totals', async () => {
  const vote = (db, uid, choice) => setDoc(site(db, 'carclub', 'votes', uid), { choice, at: serverTimestamp() });
  await assertFails(vote(google('alice'), 'bob', 'M4'));
  await assertFails(vote(google('alice'), 'alice', 'Supra'));
  await assertSucceeds(vote(google('alice'), 'alice', 'M4'));
  await assertFails(vote(google('alice'), 'alice', 'M5')); // within 30 s
  await assertSucceeds(getDocs(query(collection(env.unauthenticatedContext().firestore(), 'sites/carclub/votes'),
    where('choice', '==', 'M4'))));
});

test('club-site users cannot reach LLM club data, and LLM officers cannot reach club data', async () => {
  await assertFails(getDoc(doc(google('vsaOfficer'), 'members/llmOfficer')));
  await assertFails(getDocs(collection(google('llmOfficer'), 'sites/vsa/checkins')));
  await assertFails(setDoc(doc(google('alice'), 'sites/vsa'), { x: 1 }));
});
