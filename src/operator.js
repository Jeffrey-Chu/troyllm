import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import {
  approveMember, awardPoints, createActivity, getMemberPoints,
  listPendingMembers, registerMember, reverseAward,
} from './points.js';

// Firebase web app config is public; authorization is enforced by Firestore rules.
const app = initializeApp({
  apiKey: 'AIzaSyCAbI-nR9_iunSLisL-s-8AjOcXwpwXgqM',
  authDomain: 'troy-high-llm.firebaseapp.com',
  projectId: 'troy-high-llm',
  appId: '1:781446041006:web:b32556ddda0c6fec500c3f',
});
const auth = getAuth(app);
const db = getFirestore(app);
const el = (id) => document.getElementById(id);
let user = null;

function report(message) { el('result').textContent = message; }
function formatError(error) { return `${error.code ?? 'error'}: ${error.message}`; }
async function run(action) {
  try { report('Working…'); await action(); }
  catch (error) { report(formatError(error)); }
}
function formValue(form, name) { return new FormData(form).get(name).trim(); }
function requireUser() { if (!user) throw new Error('Sign in first'); return user; }

async function refreshProfile() {
  const current = requireUser();
  const snapshot = await getDoc(doc(db, 'members', current.uid));
  const profile = snapshot.exists() ? snapshot.data() : null;
  el('profile').textContent = profile
    ? `Role: ${profile.role}\nEmail: ${profile.email}\nUID: ${current.uid}`
    : 'No membership request yet.';
  el('register').hidden = Boolean(profile);
  el('member-section').hidden = !['member', 'officer'].includes(profile?.role);
  el('officer-section').hidden = profile?.role !== 'officer';
}

onAuthStateChanged(auth, async (nextUser) => {
  user = nextUser;
  el('sign-in').hidden = Boolean(user);
  el('sign-out').hidden = !user;
  el('profile-section').hidden = !user;
  el('member-section').hidden = true;
  el('officer-section').hidden = true;
  el('identity').textContent = user
    ? `Signed in: ${user.email ?? '(no email)'}\nUID: ${user.uid}` : 'Signed out';
  if (user) await run(async () => { await refreshProfile(); report('Signed in.'); });
  else report('Signed out.');
});

el('sign-in').onclick = () => run(async () => {
  await signInWithPopup(auth, new GoogleAuthProvider());
});
el('sign-out').onclick = () => run(() => signOut(auth));
el('register').onclick = () => run(async () => {
  await registerMember(db, requireUser());
  await refreshProfile();
  report('Membership request created. An officer must approve it.');
});
el('my-points').onclick = () => run(async () => {
  el('points').textContent = String(await getMemberPoints(db, requireUser().uid));
  report('Points refreshed.');
});
el('pending-list').onclick = () => run(async () => {
  const pending = await listPendingMembers(db);
  el('pending').textContent = pending.length
    ? pending.map(({ uid, email, displayName }) => `${uid} | ${email} | ${displayName}`).join('\n')
    : 'No pending requests.';
  report('Pending requests refreshed.');
});
el('approve-form').onsubmit = (event) => {
  event.preventDefault();
  run(async () => {
    await approveMember(db, requireUser().uid, formValue(event.target, 'memberUid'));
    report('Member approved.');
  });
};
el('activity-form').onsubmit = (event) => {
  event.preventDefault();
  run(async () => {
    const form = event.target;
    await createActivity(db, requireUser().uid, formValue(form, 'activityId'),
      formValue(form, 'kind'), formValue(form, 'title'));
    report('Activity created.');
  });
};
el('award-form').onsubmit = (event) => {
  event.preventDefault();
  run(async () => {
    const form = event.target;
    const id = await awardPoints(db, requireUser().uid, formValue(form, 'memberUid'),
      formValue(form, 'activityId'), formValue(form, 'kind'));
    report(`Award created: ${id}`);
  });
};
el('reverse-form').onsubmit = (event) => {
  event.preventDefault();
  run(async () => {
    const form = event.target;
    await reverseAward(db, requireUser().uid, formValue(form, 'memberUid'),
      formValue(form, 'awardId'), formValue(form, 'reason'));
    report('Award reversed.');
  });
};
