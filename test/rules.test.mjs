import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import {
  approveMember, awardPoints, createActivity, getMemberPoints,
  listPendingMembers, registerMember, reverseAward,
} from '../src/points.js';

let env;
const auth = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.com` }).firestore();
const award = (uid = 'student') => ({
  activityId: 'meeting1', memberUid: uid, kind: 'meeting', points: 5,
  awardedBy: 'officer', awardedAt: serverTimestamp(),
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-troy-high-llm',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'members', 'officer'), { role: 'officer', email: 'officer@example.com' }),
      setDoc(doc(db, 'members', 'student'), { role: 'member', email: 'student@example.com' }),
      setDoc(doc(db, 'members', 'other'), { role: 'member', email: 'other@example.com' }),
      setDoc(doc(db, 'activities', 'meeting1'), { kind: 'meeting', title: 'Meeting 1' }),
    ]);
  });
});

after(async () => { await env?.cleanup(); });

test('members cannot promote themselves or award points', async () => {
  const db = auth('student');
  await assertFails(setDoc(doc(db, 'members', 'student'), { role: 'officer' }, { merge: true }));
  await assertFails(setDoc(doc(db, 'awards', 'meeting1_student'), award()));
  await assertFails(setDoc(doc(db, 'activities', 'assignment1'), {
    kind: 'assignment', title: 'Homework', createdBy: 'student', createdAt: serverTimestamp(),
  }));
});

test('officers can award exactly five points once per activity and member', async () => {
  const db = auth('officer');
  await assertSucceeds(setDoc(doc(db, 'awards', 'meeting1_student'), award()));
  await assertFails(setDoc(doc(db, 'awards', 'meeting1_student'), award()));
  await assertFails(setDoc(doc(db, 'awards', 'meeting1_other'), { ...award('other'), points: 50 }));
  await assertFails(setDoc(doc(db, 'awards', 'arbitrary'), award('other')));
  await assertFails(setDoc(doc(db, 'awards', 'meeting1_missing'), award('missing')));
  await assertFails(setDoc(doc(db, 'awards', 'meeting1_other'), { ...award('other'), awardedBy: 'student' }));
});

test('members can read only their own award and cannot reverse it', async () => {
  await assertSucceeds(setDoc(doc(auth('officer'), 'awards', 'meeting1_student'), award()));
  await assertSucceeds(getDoc(doc(auth('student'), 'awards', 'meeting1_student')));
  await assertFails(getDoc(doc(auth('other'), 'awards', 'meeting1_student')));
  await assertFails(setDoc(doc(auth('student'), 'reversals', 'meeting1_student'), {
    memberUid: 'student', points: -5, reason: 'Mistake',
    reversedBy: 'student', reversedAt: serverTimestamp(),
  }));
});

test('an officer can reverse an award once with an audit reason', async () => {
  const db = auth('officer');
  await assertSucceeds(setDoc(doc(db, 'awards', 'meeting1_student'), award()));
  const reversal = {
    memberUid: 'student', points: -5, reason: 'Attendance entered incorrectly',
    reversedBy: 'officer', reversedAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(doc(db, 'reversals', 'meeting1_student'), reversal));
  await assertFails(setDoc(doc(db, 'reversals', 'meeting1_student'), reversal));
  await assertFails(setDoc(doc(db, 'reversals', 'meeting1_other'), reversal));
  assert.equal((await getDoc(doc(db, 'awards', 'meeting1_student'))).data().points, 5);
  assert.equal(await getMemberPoints(auth('student'), 'student'), 0);
  await assertFails(getMemberPoints(auth('other'), 'student'));
});

test('new sign-ins can create only their own pending profile', async () => {
  const db = auth('newstudent');
  const profile = {
    role: 'pending', email: 'newstudent@example.com', displayName: 'New Student',
    joinedAt: serverTimestamp(),
  };
  await assertFails(setDoc(doc(db, 'members', 'anotherperson'), profile));
  await assertFails(setDoc(doc(db, 'members', 'newstudent'), { ...profile, role: 'officer' }));
  await assertFails(setDoc(doc(db, 'members', 'newstudent'), { ...profile, role: 'member' }));
  await assertSucceeds(registerMember(db, {
    uid: 'newstudent', email: 'newstudent@example.com', displayName: 'New Student',
  }));
  assert.equal((await getDoc(doc(db, 'members', 'newstudent'))).data().role, 'pending');
});

test('pending users cannot read club data, approve themselves, or become officers', async () => {
  const db = auth('pending');
  await assertSucceeds(registerMember(db, { uid: 'pending', email: 'pending@example.com' }));
  await assertSucceeds(getDoc(doc(db, 'members', 'pending')));
  await assertFails(getDocs(collection(db, 'members')));
  await assertFails(listPendingMembers(db));
  await assertFails(getDoc(doc(db, 'activities', 'meeting1')));
  await assertFails(getDocs(collection(db, 'activities')));
  await assertFails(getMemberPoints(db, 'pending'));
  await assertFails(getDoc(doc(db, 'awards', 'meeting1_student')));
  await assertFails(getDoc(doc(db, 'reversals', 'meeting1_student')));
  await assertFails(approveMember(db, 'pending', 'pending'));
  await assertFails(setDoc(doc(db, 'members', 'pending'), { role: 'member' }, { merge: true }));
  await assertFails(setDoc(doc(db, 'members', 'pending'), { role: 'officer' }, { merge: true }));
  await assertFails(setDoc(doc(db, 'activities', 'pending-meeting'), {
    kind: 'meeting', title: 'Unapproved', createdBy: 'pending', createdAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(db, 'awards', 'meeting1_pending'), award('pending')));
});

test('officers can approve pending members once with an audit trail', async () => {
  const pendingDb = auth('pending');
  const officerDb = auth('officer');
  await assertSucceeds(registerMember(pendingDb, { uid: 'pending', email: 'pending@example.com' }));
  assert.deepEqual((await listPendingMembers(officerDb)).map((member) => member.uid), ['pending']);
  await assertFails(setDoc(doc(officerDb, 'awards', 'meeting1_pending'), award('pending')));
  await assertFails(setDoc(doc(officerDb, 'members', 'pending'), {
    role: 'officer', approvedBy: 'officer', approvedAt: serverTimestamp(),
  }, { merge: true }));
  await assertFails(setDoc(doc(officerDb, 'members', 'pending'), {
    role: 'member', approvedBy: 'pending', approvedAt: serverTimestamp(),
  }, { merge: true }));
  await assertFails(setDoc(doc(officerDb, 'members', 'pending'), {
    role: 'member', approvedBy: 'officer', approvedAt: serverTimestamp(), email: 'changed@example.com',
  }, { merge: true }));
  await assertSucceeds(approveMember(officerDb, 'officer', 'pending'));
  const approved = (await getDoc(doc(pendingDb, 'members', 'pending'))).data();
  assert.equal(approved.role, 'member');
  assert.equal(approved.approvedBy, 'officer');
  assert.ok(approved.approvedAt);
  assert.deepEqual(await listPendingMembers(officerDb), []);
  await assertSucceeds(getDoc(doc(pendingDb, 'activities', 'meeting1')));
  assert.equal(await getMemberPoints(pendingDb, 'pending'), 0);
  await assertFails(approveMember(officerDb, 'officer', 'pending'));
  await assertFails(setDoc(doc(pendingDb, 'members', 'pending'), { role: 'officer' }, { merge: true }));
  await assertSucceeds(setDoc(doc(officerDb, 'awards', 'meeting1_pending'), award('pending')));
  assert.equal(await getMemberPoints(pendingDb, 'pending'), 5);
});

test('a signed-in account without a profile cannot read club data', async () => {
  const db = auth('unregistered');
  await assertFails(getDoc(doc(db, 'activities', 'meeting1')));
  await assertFails(getMemberPoints(db, 'unregistered'));
});

test('meeting and assignment helpers award five each; reversals preserve audit records', async () => {
  const officerDb = auth('officer');
  const memberDb = auth('student');
  await assertSucceeds(createActivity(officerDb, 'officer', 'meeting2', 'meeting', 'Club meeting'));
  await assertSucceeds(createActivity(officerDb, 'officer', 'assignment2', 'assignment', 'Club assignment'));
  await assertFails(createActivity(memberDb, 'student', 'meeting3', 'meeting', 'Forged meeting'));
  await assertSucceeds(awardPoints(officerDb, 'officer', 'student', 'meeting2', 'meeting'));
  await assertSucceeds(awardPoints(officerDb, 'officer', 'student', 'assignment2', 'assignment'));
  assert.equal(await getMemberPoints(memberDb, 'student'), 10);
  await assertFails(awardPoints(officerDb, 'officer', 'student', 'assignment2', 'meeting'));
  await assertSucceeds(reverseAward(officerDb, 'officer', 'student', 'meeting2_student', 'Attendance correction'));
  assert.equal(await getMemberPoints(memberDb, 'student'), 5);
  await assertFails(reverseAward(officerDb, 'officer', 'student', 'meeting2_student', 'Duplicate correction'));
  await assertSucceeds(reverseAward(officerDb, 'officer', 'student', 'assignment2_student', 'Submission correction'));
  assert.equal(await getMemberPoints(memberDb, 'student'), 0);
  assert.equal((await getDoc(doc(memberDb, 'awards', 'assignment2_student'))).data().points, 5);
  assert.equal((await getDoc(doc(memberDb, 'reversals', 'assignment2_student'))).data().points, -5);
});
