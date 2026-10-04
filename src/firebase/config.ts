import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';

// Read from injected firebase-applet-config.json
let firebaseConfig: any = {
  projectId: "fine-discovery-207pf",
  appId: "1:319489128703:web:05c29729a5f565a06eb4ca",
  apiKey: "AIzaSyDzc26l4X8Q5KSQCuhJBGsUM-ZaCtPTsis",
  authDomain: "fine-discovery-207pf.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-sonichubai-54df4e0b-6e6d-4ab8-97ea-0988451a296e",
  storageBucket: "fine-discovery-207pf.firebasestorage.app",
  messagingSenderId: "319489128703"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Skill requirement: Validate Connection to Firestore on startup
async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Firestore client offline check:', error.message);
    }
  }
}

testFirestoreConnection().catch((e) => {
  console.warn('[Firebase] Startup test note:', e?.message);
});
