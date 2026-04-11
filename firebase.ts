// Firebase initialization
// Replace the placeholder values with your Firebase project config.
// Install the SDK with: `npm install firebase`
import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAJc_YjquNvpE9KRkL2nPFQRBiK5ZFv7tg",
  authDomain: "rim-ready.firebaseapp.com",
  projectId: "rim-ready",
  storageBucket: "rim-ready.appspot.com",
  messagingSenderId: "596668964342",
  appId: "1:596668964342:ios:9e36e5e10e3997e95d3bd7",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);

export default app;
