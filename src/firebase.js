import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase web app config is public; authorization is enforced by Firestore rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyCAbI-nR9_iunSLisL-s-8AjOcXwpwXgqM',
  authDomain: 'troy-high-llm.firebaseapp.com',
  projectId: 'troy-high-llm',
  appId: '1:781446041006:web:b32556ddda0c6fec500c3f',
};

// Reuse the default app when this module is loaded again (for example, during HMR).
export const app = getApps().find((existing) => existing.name === '[DEFAULT]')
  ?? initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
