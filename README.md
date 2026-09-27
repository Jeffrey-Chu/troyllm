# Troy High LLM points backend

Firebase project: `troy-high-llm`. This repository contains Firebase client helpers, Firestore Security Rules, emulator tests, and a small hosted operator page. It does not contain the club website or a Google Classroom connection.

## Membership and points

- Members may use personal Google accounts to sign in. Signing in does **not** grant club membership.
- `registerMember(db, user)` creates only a `pending` profile. A pending user may read their own profile but cannot read activities or points, award points, approve anyone, or assign an officer role.
- An officer can use `listPendingMembers(db)` to review requests and `approveMember(db, officerUid, memberUid)` to change one pending profile to `member`. The profile records `approvedBy` and `approvedAt`. Client rules do not allow approval to be undone or an officer role to be assigned.
- Officers create `meeting` and `assignment` activities and award a verified member **5 points** once per activity. Awards cannot be edited or deleted. An officer can record one reversal with a reason; the original award remains for audit history.
- Members can read their own points; officers can read everyone's. The total is the sum of awards and reversals.

### First officer and later approvals

There is no client-side path to create the first officer. The chosen officer must sign in at <https://troy-high-llm.web.app> and click **Request membership**. This creates a pending profile. **Do not choose or promote a UID until the club owner identifies whose account should be the first officer.**

A Firebase project administrator can then use the checked bootstrap command. It requires the exact Google email and Firebase Auth UID. It verifies the Auth account uses Google sign-in, verifies that the matching Firestore profile is pending, and changes only its `role` field with an update-time precondition. It defaults to a read-only dry run; `--execute` performs the promotion and reads it back.

```sh
gcloud auth login
npm run bootstrap:officer -- --uid AUTH_UID --email GOOGLE_EMAIL
npm run bootstrap:officer -- --uid AUTH_UID --email GOOGLE_EMAIL --execute
```

The administrator must visually verify that the email and UID belong to the person identified by the club owner before running `--execute`. The script is fixed to `troy-high-llm`; it uses the administrator's existing `gcloud` login and stores no credentials. A trusted backup officer needs the same explicit administrator step. Ordinary officers cannot promote anyone to officer.

After that, an officer reviews pending profiles on the operator page and verifies the person belongs in the club. **Approve member** changes a pending profile to `member` and stores the approving officer's UID and timestamp. The rules reject a second approval, changed approval metadata, or any client attempt to set `officer`.

## Operator test page

The minimal page at <https://troy-high-llm.web.app> signs in with Google and shows the signed-in email and UID. A new user can request membership. Pending users see their status; approved members can check their points. Officers can list pending requests, approve a member, create meeting or assignment activities, award five points, and reverse an award with a reason. This is a test and operator surface, not the club website. Firestore rules, rather than hidden buttons, enforce access.

To reproduce the live flow after the first officer is identified and bootstrapped:

1. Sign in as a second Google user and click **Request membership**. Confirm the page shows `pending` and does not expose points or officer tools.
2. Sign in as the officer. List pending requests and approve the second user's UID. Confirm the member sees `member` and can read their own points.
3. As the officer, create one meeting and one assignment with distinct stable IDs. Award the approved member once for each. Confirm their total is 10 and duplicate awards are rejected.
4. Reverse each award with a reason. Confirm the member total changes to 5, then 0; the original awards and reversals remain in Firestore. Confirm a second reversal is rejected.

The page uses the existing Firebase web app's public SDK configuration. Hosting deploy builds its JavaScript bundle with `npm run build`. Deploy only this small page with `npx firebase deploy --only hosting --project troy-high-llm`. Firestore rules deploy separately.

## Local tests

Install Node.js and Java 17 or newer, then run:

```sh
npm ci
npm test
```

The emulator tests cover pending access, officer approval, self-promotion attempts, forged point values, duplicate awards, private reads, meeting and assignment awards, and reversals. Troy's emulator uses port 8086 to avoid the separately running Prickle emulator on 8080. These tests exercise local rules, not live Firebase Authentication or Firestore.

## Live project status

Verified on 2026-09-27 UTC:

- Google provider configuration is enabled in Firebase Authentication. The authorized domains are `troy-high-llm.firebaseapp.com` and `troy-high-llm.web.app`; the operator page uses the latter.
- The `(default)` Firestore database is Standard edition, Native mode, in **`us-west2` (Los Angeles)**. Firebase reports it as free-tier eligible with point-in-time recovery disabled. Project billing remains disabled (Spark).
- The live `cloud.firestore` release points to ruleset `9e4eb812-6884-44b5-9159-781fef719bc0`. Its published contents match `firestore.rules` exactly. All **9 emulator tests passed** after this change.
- A live unauthenticated read of an activity document returned HTTP 403 `PERMISSION_DENIED`, as the rules require.
- The live `members` collection was empty when inspected. **No officer UID was selected or promoted.** The administrator bootstrap script rejected a nonexistent Auth UID without writing.
- Firebase Hosting had no releases and returned 404 before deployment. The operator page was deployed as Hosting version `a2e11411ca1c970d`; both `/` and `/app.js` returned HTTP 200 and matched the local build byte for byte.
- An interactive Google popup sign-in could not be verified through the available browser control. Automatic approval review rejected using a `gcloud` administrator token as a substitute user sign-in credential. Therefore **pending registration, officer approval, member access, awards, and reversals have not been tested against the live project**. Run the sequence above with real Google sign-ins after the owner identifies the first officer.
- The OAuth support email could not be verified through available API access. An administrator should check **Google Cloud console → Google Auth Platform → Branding → User support email** for `troy-high-llm`.
- Google Classroom is not connected.

Before any future rules deployment, compare the live rules with this file, rerun `npm test`, and deploy only rules with `npx firebase deploy --only firestore:rules --project troy-high-llm`. CLI deployment replaces existing console rules.

Do not commit service-account keys or private credentials. The eventual website will initialize the Firebase web SDK using the registered web app config.

## Data layout

| Collection | ID | Client writes |
| --- | --- | --- |
| `members` | Firebase Auth UID | User creates pending profile and edits display name; officer approves pending profile |
| `activities` | Unique meeting/assignment ID | Officer creates once |
| `awards` | `activityId_memberUid` | Officer creates once, only for approved members |
| `reversals` | Same ID as original award | Officer creates once, with reason |

Activity IDs use letters, digits, underscores, or hyphens, up to 80 characters. Use stable IDs; renaming an activity requires a new one. Google Classroom is not connected.
