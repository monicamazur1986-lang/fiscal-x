import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { firebaseConfig, isConfigReady } from './config';

interface FirebaseServices {
  firebaseApp: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
  storage: FirebaseStorage | null;
}

export function initializeFirebase(): FirebaseServices {
  if (!isConfigReady) {
    return { firebaseApp: null, auth: null, db: null, storage: null };
  }

  const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);
  const storage = getStorage(firebaseApp);

  return { firebaseApp, auth, db, storage };
}
