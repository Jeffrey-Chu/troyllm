# Troy High LLM points backend

Firebase project: `troy-high-llm`. This repository contains Firebase client helpers, Firestore Security Rules, and emulator tests. It does not contain the website or a Google Classroom connection.

## Membership and points

- Members may use personal Google accounts to sign in. Signing in does **not** grant club membership.
- `registerMember(db, user)` creates only a `pending` profile. A pending user may read their own profile but cannot read activities or points, award points, approve anyone, or assign an officer role.
- An officer can use `listPendingMembers(db)` to review requests and `approveMember(db, officerUid, memberUid)` to change one pending profile to `member`. The profile records `approvedBy` and `approvedAt`. Client rules do not allow approval to be undone or an officer role to be assigned.
- Officers create `meeting` and `assignment` activities and award a verified member **5 points** once per activity. Awards cannot be edited or deleted. An officer can record one reversal with a reason; the original award remains for audit history.
- Members can read their own points; officers can read everyone's. The total is the sum of awards and reversals.

### First officer and later approvals

There is no client-side path to create the first officer. After Firebase Authentication, Firestore, and a sign-in flow are available, the first trusted officer signs in and creates a pending profile. A **Firebase project administrator** checks that person's identity and Auth UID, then changes only `members/{uid}.role` from `pending` to `officer` in the Firebase console. Console administrator writes bypass client Security Rules. The administrator should assign a trusted backup officer the same way; ordinary officers cannot promote anyone to officer.

After that, an officer reviews the pending profile and verifies the person belongs in the club. Calling `approveMember` from an authenticated officer session changes the role to `member` and stores the approving officer's UID and timestamp. The rules reject a second approval, changed approval metadata, or any client attempt to set `officer`. There is no approval screen yet; the future website can call these helpers.

## Local tests

Install Node.js and Java 17 or newer, then run:

```sh
npm ci
npm test
```

The emulator tests cover pending access, officer approval, self-promotion attempts, forged point values, duplicate awards, private reads, and reversals. They test local rules, not the live Firebase project.

## Live project status

Verified on 2026-09-27 UTC:

- Google sign-in is enabled in Firebase Authentication. Only the project's default Firebase domains are currently authorized; add the website's domain when one exists.
- The `(default)` Firestore database is Standard edition, Native mode, in **`us-west2` (Los Angeles)**. Firebase reports it as free-tier eligible with point-in-time recovery disabled. Project billing remains disabled (Spark).
- `firestore.rules` is deployed to the live `cloud.firestore` release. A readback of the published rules matched this file exactly. The emulator suite passed 8 tests before deployment.
- No website or first officer was created. The approval helpers are not wired into a live app, and no live points operation was performed. Google Classroom is not connected.

When a sign-in flow exists, bootstrap the first officer as described above. Officers can then review and approve pending members. Before any future rules deployment, compare the live rules with this file, rerun `npm test`, and deploy only rules with `npx firebase deploy --only firestore:rules --project troy-high-llm`. CLI deployment replaces existing console rules.

Do not commit service-account keys or private credentials. The eventual website will initialize the Firebase web SDK using the registered web app config.

## Data layout

| Collection | ID | Client writes |
| --- | --- | --- |
| `members` | Firebase Auth UID | User creates pending profile and edits display name; officer approves pending profile |
| `activities` | Unique meeting/assignment ID | Officer creates once |
| `awards` | `activityId_memberUid` | Officer creates once, only for approved members |
| `reversals` | Same ID as original award | Officer creates once, with reason |

Activity IDs use letters, digits, underscores, or hyphens, up to 80 characters. Use stable IDs; renaming an activity requires a new one. Google Classroom is not connected.
