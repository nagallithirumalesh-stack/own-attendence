import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCrynItcS-DWKVrXPaIc_-d4pw7fn0Map8",
  authDomain: "own-attendence.firebaseapp.com",
  projectId: "own-attendence",
  storageBucket: "own-attendence.firebasestorage.app",
  messagingSenderId: "798390789464",
  appId: "1:798390789464:web:6b0bd67ec16c8f5935312d",
  measurementId: "G-WFZSD05E4L"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Auth & Firestore db instances
export const auth = getAuth(app);
export const db = getFirestore(app);

// Initialize Analytics conditionally to prevent errors if not supported
export const analyticsPromise = isSupported().then(yes => yes ? getAnalytics(app) : null).catch(() => null);

export default app;
