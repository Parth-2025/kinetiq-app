import { getApp, getApps, initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

import { requireRuntimeConfig } from "@/config/runtime";

const firebaseConfig = {
  apiKey: requireRuntimeConfig("firebaseApiKey"),
  authDomain: requireRuntimeConfig("firebaseAuthDomain"),
  databaseURL: requireRuntimeConfig("firebaseDatabaseUrl"),
  projectId: requireRuntimeConfig("firebaseProjectId"),
  storageBucket: requireRuntimeConfig("firebaseStorageBucket"),
  messagingSenderId: requireRuntimeConfig("firebaseMessagingSenderId"),
  appId: requireRuntimeConfig("firebaseAppId"),
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getDatabase(app);
