import { getApp, getApps, initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Find these values in the Firebase console:
// Project Settings → General → Your apps → SDK setup and configuration
const firebaseConfig = {
  apiKey: "AIzaSyAJc_YjquNvpE9KRkL2nPFQRBiK5ZFv7tg",
  authDomain: "rim-ready.firebaseapp.com",
  databaseURL: "https://rim-ready-default-rtdb.firebaseio.com",
  projectId: "rim-ready",
  storageBucket: "rim-ready.appspot.com",
  messagingSenderId: "596668964342",
  appId: "1:596668964342:ios:9e36e5e10e3997e95d3bd7",
};

// Prevent re-initializing on hot reload
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getDatabase(app);
