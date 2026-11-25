// Family sharing backend config.
// 1. Create a free project at https://console.firebase.google.com
// 2. Add a "Web app", copy its config object here.
// 3. Turn on Authentication → Sign-in method → Anonymous, and create a Firestore database.
// 4. Deploy the rules:  npx firebase deploy --only firestore:rules --project <your-project-id>
// Leave as null to ship without family sharing (the app works fully offline either way).
export const firebaseConfig = null;
/* Example:
export const firebaseConfig = {
  apiKey: '…',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  appId: '…',
};
*/

// `npm run dev:family` uses the local Firebase emulator instead (for testing, no account needed).
export const useEmulator = import.meta.env.VITE_FIREBASE_EMULATOR === '1';

export const familyAvailable = () => !!firebaseConfig || useEmulator;
