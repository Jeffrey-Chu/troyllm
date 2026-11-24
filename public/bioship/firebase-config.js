// Firebase config for online 1v1 duels and the ranked leaderboard.
// Paste the values from Firebase console > Project settings > Your apps > Web app.
// These keys are public by design; the security rules in backend/database.rules.json protect the data.
// Leave apiKey empty to run offline only (single-player still works everywhere).
window.BIOSHIP_FIREBASE = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  appId: ""
};
