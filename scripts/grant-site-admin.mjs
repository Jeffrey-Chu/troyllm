import { execFileSync } from 'node:child_process';

// Makes a Google account an admin of ONE club website (vsa, tll, superdw or carclub).
// Run by a troy-high-llm project owner. Clients can never write admin records.
const project = 'troy-high-llm';
const SITES = ['vsa', 'tll', 'superdw', 'carclub'];
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1];
};
const site = option('--site');
const email = option('--email');
const execute = args.includes('--execute');
const remove = args.includes('--remove');
if (!SITES.includes(site) || !email || !/^[^\s@]+@[^\s@]+$/.test(email)
    || args.some((arg) => arg.startsWith('--') && !['--site', '--email', '--execute', '--remove'].includes(arg))) {
  console.error(`Usage: npm run grant:site-admin -- --site ${SITES.join('|')} --email GOOGLE_EMAIL [--remove] [--execute]`);
  process.exit(2);
}

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
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${body.error?.message ?? 'API error'}`);
  return body;
}

// The person must have signed in to the site once so their Google account exists in Firebase Auth.
const lookup = await request(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`, {
  method: 'POST', body: JSON.stringify({ email: [email] }),
});
const users = (lookup.users ?? []).filter((u) => u.email?.toLowerCase() === email.toLowerCase()
  && u.providerUserInfo?.some((p) => p.providerId === 'google.com'));
if (users.length !== 1) throw new Error('No single Google sign-in account with that email. Have them sign in to the site once first.');
const uid = users[0].localId;

const docUrl = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/sites/${site}/admins/${encodeURIComponent(uid)}`;
console.log(`${remove ? 'Remove' : 'Grant'} ${site} admin: ${email} (${uid})`);
if (!execute) {
  console.log('Dry run only. Check the email and UID, then re-run with --execute.');
  process.exit(0);
}

if (remove) {
  await request(docUrl, { method: 'DELETE' });
  console.log('Removed.');
} else {
  await request(docUrl, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { email: { stringValue: email }, grantedAt: { timestampValue: new Date().toISOString() } } }),
  });
  const check = await request(docUrl);
  if (check.fields?.email?.stringValue !== email) throw new Error('Write returned but admin record could not be verified');
  console.log(`Verified: ${email} is now a ${site} admin.`);
}
