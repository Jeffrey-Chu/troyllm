# Troy High LLM member points backend

Firebase project: `troy-high-llm`. This repository contains **backend code only**; it does not contain a website or a Google Classroom connection.

## What it does

- Members sign in using Firebase Authentication and create a profile. Only a Firebase project administrator can promote a profile to `officer`.
- Officers create `meeting` and `assignment` activities. An officer records a verified attendance or completed assignment for a member; each award is **5 points**.
- A member receives at most one award per activity. Awards cannot be changed or deleted. An officer can add one recorded reversal with a reason if an award was mistaken.
- Members can read their own points; officers can read everyone’s. `src/points.js` provides the Firestore calls for a future website. A member’s total is the sum of awards and reversals.
- This uses Firestore security rules and no Cloud Functions, so the points backend can run on Spark. Firebase usage limits still apply.

## Local test

Install Node.js and Java 17 or newer (Java 21 is recommended for newer Firebase CLI releases), then run:

```sh
npm ci
npm test
```

The tests exercise officer permissions, forged values, duplicate awards, private reads, and reversals. They run against the **local emulator**, not Ryan’s live Firebase project.

## Set up the real Firebase project

1. The Firebase owner creates the Cloud Firestore database in project `troy-high-llm` and selects its data location. This location cannot be changed later.
2. In Firebase Console → Authentication → Sign-in method, enable the chosen sign-in provider (Google if the school allows it). Confirm which accounts the club is allowed to use. The existing web app registration alone does not turn on sign-in.
3. Sign in to Firebase CLI with an account that has deployment access: `npx firebase login`. Review the rules, then deploy **only** the Firestore rules with `npx firebase deploy --only firestore:rules --project troy-high-llm`. This overwrites the database’s current console rules.
4. A member signs in through the eventual website and calls `registerMember(db, auth.currentUser)` once. The Firebase owner finds that member’s UID in Authentication and changes their `members/{uid}` Firestore document’s `role` from `member` to `officer` **in the Firebase Console**. Client code cannot promote users. Choose Ryan and at least one trusted backup officer.
5. The eventual website initializes the Firebase web SDK using the web app config from Project settings and uses the functions in `src/points.js`. Do not commit service-account keys or private credentials. The web config is not a secret, but access is protected by Authentication and Firestore rules.

**Deployment status:** Code prepared; no Firebase deployment has been performed here. No Authentication provider, Firestore database, officer account, or real member data has been verified. Do not claim the backend is live until the steps above succeed.

## Data layout

| Collection | ID | Who writes |
| --- | --- | --- |
| `members` | Firebase Auth UID | Member creates own profile; project owner sets officer role in console |
| `activities` | Unique meeting/assignment ID | Officer |
| `awards` | `activityId_memberUid` | Officer, once |
| `reversals` | Same ID as original award | Officer, once, with reason |

The signed-in user ID comes from Firebase Auth. The future website should call `getMemberPoints(db, uid)` only for the signed-in member or an officer; Firestore rules enforce that access. IDs for activities must use letters, digits, underscores, or hyphens, up to 80 characters. Use stable IDs; renaming an activity requires a new one.

## Google Classroom: pending access and policy decision

Ryan asked if Classroom “marked done” can drive points. The Classroom API can list student submissions, but access depends on the school’s Google Workspace policy, OAuth consent, and whether the authorized account is a teacher or student in the class. Confirm the actual course, teacher/admin permission, student identity mapping, and allowed OAuth scopes before building a sync. A student marking work done is a submission state, not proof it meets the club’s completion standard. Decide with Ryan whether that state grants points automatically or creates an item for officer approval; this starter uses officer verification. There is currently **no** Classroom sync or stored Classroom OAuth credential.

## GitHub handoff

Put these files in a club-owned GitHub repository and grant Ryan access. The linked GitHub account currently exposes no repositories to this workspace, so no remote repository was updated. Once Ryan creates or grants access to the club repository, this directory is ready to commit. Do not mix it into PrickleMind.
