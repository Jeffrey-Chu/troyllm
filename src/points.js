import {
  collection, doc, getDocs, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore';

// Pass the initialized Firestore instance and the signed-in Firebase Auth user.
export async function registerMember(db, user) {
  if (!user.email) throw new Error('An email address is required');
  await setDoc(doc(db, 'members', user.uid), {
    role: 'member', email: user.email, displayName: user.displayName ?? '',
    joinedAt: serverTimestamp(),
  });
}

export async function createActivity(db, officerUid, activityId, kind, title) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(activityId)) throw new Error('Invalid activity ID');
  await setDoc(doc(db, 'activities', activityId), {
    kind, title, createdBy: officerUid, createdAt: serverTimestamp(),
  });
}

export async function awardPoints(db, officerUid, memberUid, activityId, kind) {
  const awardId = `${activityId}_${memberUid}`;
  await setDoc(doc(db, 'awards', awardId), {
    activityId, memberUid, kind, points: 5,
    awardedBy: officerUid, awardedAt: serverTimestamp(),
  });
  return awardId;
}

export async function reverseAward(db, officerUid, memberUid, awardId, reason) {
  await setDoc(doc(db, 'reversals', awardId), {
    memberUid, points: -5, reason, reversedBy: officerUid,
    reversedAt: serverTimestamp(),
  });
}

export async function getMemberPoints(db, memberUid) {
  const [awards, reversals] = await Promise.all([
    getDocs(query(collection(db, 'awards'), where('memberUid', '==', memberUid))),
    getDocs(query(collection(db, 'reversals'), where('memberUid', '==', memberUid))),
  ]);
  return awards.docs.reduce((sum, item) => sum + item.data().points, 0)
    + reversals.docs.reduce((sum, item) => sum + item.data().points, 0);
}
