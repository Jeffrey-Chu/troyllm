# Troy club websites on Firebase

Four club sites that share the `troy-high-llm` Firebase project but stay separate from the LLM club and from each other.

| Site | Folder | Planned address | Saves |
|---|---|---|---|
| Troy VSA | `sites/vsa` | troy-vsa.web.app | Check-ins with the word of the day, member profiles |
| Troy Learning League | `sites/tll` | troy-learning-league.web.app | Newsletter subscribers |
| SUPER DW | `sites/superdw` | superdw-crystals.web.app | Order requests (no payment) |
| Troy Car Club | `sites/carclub` | troy-car-club.web.app | M4 vs M5 poll votes |

## How it is protected

- **LLM club untouched.** Club data lives only under `/sites/{site}/...` in Firestore. The LLM rules, data and `troy-high-llm.web.app` page are not changed. Each club gets its own hosting site.
- **Per-site admins.** `/sites/{site}/admins/{uid}`. Only a project owner can add one (`npm run grant:site-admin`). A VSA officer can't see TLL subscribers, SUPER DW orders or LLM points, and LLM officers can't see club data.
- **Google accounts only.** Every write requires Google sign-in with a verified email, and saved emails must match the signed-in account.
- **Every write is checked** for exact fields, lengths, allowed values and server time. Records can't be edited afterward, except your own VSA profile and the SUPER DW owner's order status.
- **Limits:** VSA check-in 1 per meeting, only while open (officer sets the word and window, max 12 h). TLL 1 subscription per account. SUPER DW 1 order per 2 min, 50 per account. Car poll 1 vote per account, changeable every 30 s.
- **Browser:** no third-party scripts (TLL's React/Tailwind/Babel CDNs are replaced by a local build), no inline scripts, strict Content Security Policy (see `firebase.json`).
- **Known gap:** rules can't count wrong guesses, so someone could script guesses at the VSA word while check-in is open. Keep windows short; officers see every check-in with its email.

Rules are in the root `firestore.rules` (one rules file per Firestore database). Tests: `test/club-sites.test.mjs`.

## Go live (project owner, from the repo root)

Needs Node.js 20+ and Java 17+.

```sh
npm ci
npm test                                   # LLM + club rule tests on the emulator. Must pass.
npx firebase login
npx firebase hosting:sites:create troy-vsa --project troy-high-llm
npx firebase hosting:sites:create troy-learning-league --project troy-high-llm
npx firebase hosting:sites:create superdw-crystals --project troy-high-llm
npx firebase hosting:sites:create troy-car-club --project troy-high-llm
npx firebase deploy --only firestore:rules --project troy-high-llm   # deploys LLM + club rules together
npm run deploy:clubs                        # builds and deploys the 4 sites
```

If a site name is taken, pick another and update `club-sites/.firebaserc`.

Then:

1. Firebase console → Authentication → Settings → Authorized domains: add the four `*.web.app` addresses. Sign-in won't work on them until you do. Also make sure the Google sign-in provider is enabled.
2. Each officer / shop owner signs in on their site once. Then:
   ```sh
   gcloud auth login
   npm run grant:site-admin -- --site vsa --email officer@gmail.com            # dry run
   npm run grant:site-admin -- --site vsa --email officer@gmail.com --execute
   ```
   Sites: `vsa`, `tll`, `superdw`, `carclub`. Add `--remove` to take admin away.
3. Recommended: turn on App Check (reCAPTCHA Enterprise) for Firestore to block bots, and set a budget alert under Billing.

## Using it

- **VSA officers:** sign in on the site; an officer box appears under the punch card. Pick the meeting, type the word, choose how long check-in stays open, press **Open check-in**. The list shows who checked in and their email.
- **SUPER DW owner:** orders are in Firestore under `sites/superdw/orders`. Change `status` to `confirmed`, `paid`, `ready`, `done` or `cancelled`.
- **TLL officers:** subscribers are under `sites/tll/subscribers`.

## Editing a site

Edit `sites/<site>/index.html` (and `src/<site>.js` for Firebase code), then `npm run build:clubs`. Output goes to `club-sites/dist/` (not committed).
