import { execFileSync } from 'node:child_process';

const project = 'troy-high-llm';
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1];
};
const uid = option('--uid');
const email = option('--email');
const execute = args.includes('--execute');
if (!uid || !email || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)
    || args.some((arg) => arg.startsWith('--') && !['--uid', '--email', '--execute'].includes(arg))) {
  console.error('Usage: npm run bootstrap:officer -- --uid AUTH_UID --email GOOGLE_EMAIL [--execute]');
  process.exit(2);
}

// gcloud's logged-in project administrator must have Auth read and Firestore write access.
const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': project,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${body.error?.message ?? 'API error'}`);
  return body;
}

const auth = await request(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`, {
  method: 'POST', body: JSON.stringify({ localId: [uid] }),
});
const authUser = auth.users?.find((candidate) => candidate.localId === uid);
if (!authUser || authUser.email?.toLowerCase() !== email.toLowerCase()
    || !authUser.providerUserInfo?.some((provider) => provider.providerId === 'google.com')) {
  throw new Error('Auth UID, email, and Google provider did not all match; no change made');
}

const documentUrl = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/members/${encodeURIComponent(uid)}`;
const profile = await request(documentUrl);
if (profile.fields?.role?.stringValue !== 'pending'
    || profile.fields?.email?.stringValue?.toLowerCase() !== email.toLowerCase()) {
  throw new Error('Pending profile UID, email, and role did not all match; no change made');
}

console.log(`Verified Google Auth and pending profile: ${email} (${uid})`);
if (!execute) {
  console.log('Dry run only. Re-run with --execute after confirming this is the chosen first officer.');
  process.exit(0);
}

const updateUrl = `${documentUrl}?updateMask.fieldPaths=role&currentDocument.updateTime=${encodeURIComponent(profile.updateTime)}`;
await request(updateUrl, {
  method: 'PATCH', body: JSON.stringify({ fields: { role: { stringValue: 'officer' } } }),
});
const updated = await request(documentUrl);
if (updated.fields?.role?.stringValue !== 'officer') throw new Error('Write returned but officer role could not be verified');
console.log(`Officer role verified for ${email} (${uid}).`);
