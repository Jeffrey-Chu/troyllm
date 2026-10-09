import {
  collection, doc, getDocFromServer, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';

// Pass the initialized Firestore instance and the signed-in Firebase Auth user.
export async function registerMember(db, user) {
  if (!user.email) throw new Error('An email address is required');
  await setDoc(doc(db, 'members', user.uid), {
    role: 'pending', email: user.email, displayName: user.displayName ?? '',
    joinedAt: serverTimestamp(),
  });
}

export async function listPendingMembers(db) {
  const snapshot = await getDocs(query(collection(db, 'members'), where('role', '==', 'pending')));
  return snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }));
}

// Only an existing officer can approve a pending profile; rules enforce this.
export async function approveMember(db, officerUid, memberUid) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(memberUid)) {
    throw new Error('Enter the pending member UID, not an email address. Or select Approve member beside a pending request.');
  }
  const memberRef = doc(db, 'members', memberUid);
  await updateDoc(memberRef, {
    role: 'member', approvedBy: officerUid, approvedAt: serverTimestamp(),
  });
  let profile;
  try {
    profile = (await getDocFromServer(memberRef)).data();
  } catch (error) {
    error.message = `Approval write succeeded, but server confirmation failed: ${error.message}. Refresh pending requests before retrying.`;
    throw error;
  }
  if (profile?.role !== 'member' || profile.approvedBy !== officerUid || !profile.approvedAt) {
    throw new Error('Approval could not be confirmed. Refresh pending requests before retrying.');
  }
  return profile;
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
