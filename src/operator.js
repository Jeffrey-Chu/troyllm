import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
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
let unsubscribeProfile = null;
let approvalBusy = false;

function report(message) { el('result').textContent = message; }
function formatError(error) { return `${error.code ?? 'error'}: ${error.message}`; }
async function run(action) {
  try { report('Working…'); await action(); }
  catch (error) { report(formatError(error)); }
}
function formValue(form, name) { return new FormData(form).get(name).trim(); }
function requireUser() { if (!user) throw new Error('Sign in first'); return user; }

function renderProfile(snapshot, current) {
  const profile = snapshot.exists() ? snapshot.data() : null;
  el('profile').textContent = profile
    ? `Role: ${profile.role}\nEmail: ${profile.email}\nUID: ${current.uid}`
      + `\nApproved by: ${profile.approvedBy ?? '(not approved)'}`
      + `\nApproved at: ${profile.approvedAt?.toDate().toISOString() ?? '(not approved)'}`
    : 'No membership request yet.';
  el('register').hidden = Boolean(profile);
  el('member-section').hidden = !['member', 'officer'].includes(profile?.role);
  el('officer-section').hidden = profile?.role !== 'officer';
}

async function refreshProfile() {
  const current = requireUser();
  const snapshot = await getDocFromServer(doc(db, 'members', current.uid));
  if (user?.uid === current.uid) renderProfile(snapshot, current);
}

onAuthStateChanged(auth, async (nextUser) => {
  unsubscribeProfile?.();
  unsubscribeProfile = null;
  user = nextUser;
  el('pending').replaceChildren();
  el('approval-result').textContent = 'List pending requests and approve the matching member, or enter their UID above.';
  el('sign-in').hidden = Boolean(user);
  el('sign-out').hidden = !user;
  el('profile-section').hidden = !user;
  el('member-section').hidden = true;
  el('officer-section').hidden = true;
  el('identity').textContent = user
    ? `Signed in: ${user.email ?? '(no email)'}\nUID: ${user.uid}` : 'Signed out';
  if (user) {
    const current = user;
    unsubscribeProfile = onSnapshot(doc(db, 'members', current.uid), (snapshot) => {
      if (user?.uid === current.uid) renderProfile(snapshot, current);
    }, (error) => {
      if (user?.uid === current.uid) report(`Membership refresh failed: ${formatError(error)}`);
    });
    await run(async () => { await refreshProfile(); report('Signed in.'); });
  }
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
el('refresh-profile').onclick = () => run(async () => {
  await refreshProfile();
  report('Membership refreshed from server.');
});
el('my-points').onclick = () => run(async () => {
  el('points').textContent = String(await getMemberPoints(db, requireUser().uid));
  report('Points refreshed.');
});
async function refreshPendingMembers() {
  const pending = await listPendingMembers(db);
  el('pending').replaceChildren();
  if (!pending.length) el('pending').textContent = 'No pending requests.';
  for (const { uid, email, displayName } of pending) {
    const row = document.createElement('div');
    const identity = document.createElement('pre');
    identity.textContent = `${displayName} | ${email}\nUID: ${uid}`;
    const button = document.createElement('button');
    button.textContent = `Approve member: ${email}`;
    button.disabled = approvalBusy;
    button.onclick = () => submitApproval(uid);
    row.append(identity, button);
    el('pending').append(row);
  }
}
el('pending-list').onclick = async () => {
  try {
    await refreshPendingMembers();
    report('Pending requests refreshed.');
  } catch (error) {
    el('approval-result').textContent = `Pending requests failed: ${formatError(error)}`;
    report(el('approval-result').textContent);
  }
};

async function submitApproval(memberUid) {
  if (approvalBusy) return;
  approvalBusy = true;
  const controls = [...document.querySelectorAll('#pending button, #approve-form button, #pending-list')];
  controls.forEach((control) => { control.disabled = true; });
  el('approve-form').setAttribute('aria-busy', 'true');
  el('approval-result').textContent = `Approving ${memberUid || '(missing UID)'}…`;
  const input = el('approve-form').elements.namedItem('memberUid');
  input.removeAttribute('aria-invalid');
  try {
    const profile = await approveMember(db, requireUser().uid, memberUid);
    el('approval-result').textContent = `Member approved: ${profile.email}\nUID: ${memberUid}\nRole: ${profile.role}\nApproved by: ${profile.approvedBy}\nApproved at: ${profile.approvedAt.toDate().toISOString()}`;
    report('Member approval confirmed by server.');
    try { await refreshPendingMembers(); }
    catch (error) { el('approval-result').textContent += `\nApproval succeeded, but pending-list refresh failed: ${formatError(error)}`; }
  } catch (error) {
    const hint = error.code === 'permission-denied'
      ? '\nSign in with the officer account, refresh pending requests, and select the matching member.'
      : error.code === 'not-found' ? '\nThis UID has no membership request. Select a member from pending requests.' : '';
    el('approval-result').textContent = `Approval error for ${memberUid || '(missing UID)'}: ${formatError(error)}${hint}`;
    input.setAttribute('aria-invalid', 'true');
    report(el('approval-result').textContent);
  } finally {
    approvalBusy = false;
    controls.forEach((control) => { control.disabled = false; });
    document.querySelectorAll('#pending button').forEach((control) => { control.disabled = false; });
    el('approve-form').removeAttribute('aria-busy');
    el('approval-result').focus();
  }
}
el('approve-form').onsubmit = (event) => {
  event.preventDefault();
  submitApproval(formValue(event.currentTarget, 'memberUid'));
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
