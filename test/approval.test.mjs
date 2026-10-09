import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { approveMember, registerMember } from '../src/points.js';

test('approval validates UID, requires officer, and confirms server audit fields', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-troy-high-llm',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), 'members', 'ryan'), {
      role: 'officer', email: 'ryan@example.com',
    }));
    const officerDb = env.authenticatedContext('ryan', { email: 'ryan@example.com' }).firestore();
    const memberDb = env.authenticatedContext('jeffrey', { email: 'jeffrey@example.com' }).firestore();
    await registerMember(memberDb, { uid: 'jeffrey', email: 'jeffrey@example.com' });
    await assert.rejects(approveMember(officerDb, 'ryan', 'jeffrey@example.com'), /UID, not an email/);
    await assertFails(approveMember(memberDb, 'jeffrey', 'jeffrey'));
    assert.equal((await getDoc(doc(memberDb, 'members', 'jeffrey'))).data().role, 'pending');
    const profile = await approveMember(officerDb, 'ryan', 'jeffrey');
    assert.equal(profile.role, 'member');
    assert.equal(profile.approvedBy, 'ryan');
    assert.ok(profile.approvedAt.toDate() instanceof Date);
    assert.deepEqual((await getDoc(doc(memberDb, 'members', 'jeffrey'))).data(), profile);
    await assertFails(approveMember(officerDb, 'ryan', 'jeffrey'));
  } finally {
    await env.cleanup();
  }
});
