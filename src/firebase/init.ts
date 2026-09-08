import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import { isConfigReady } from './config';
import app, { auth, db, storage } from '@/lib/firebase';

interface FirebaseServices {
  firebaseApp: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
  storage: FirebaseStorage | null;
}

// Reexporta as MESMAS instâncias de src/lib/firebase.ts em vez de chamar
// getFirestore/getAuth/getStorage de novo — chegou a existir uma segunda
// inicialização independente aqui, e como initializeFirestore (usado em
// src/lib/firebase.ts pra ligar a persistência offline) só pode ser a
// primeira chamada de Firestore pro app, uma segunda chamada solta em
// qualquer lugar (mesmo só um getFirestore simples) quebraria tudo com
// "Firestore has already been initialized" dependendo da ordem de import.
export function initializeFirebase(): FirebaseServices {
  if (!isConfigReady) {
    return { firebaseApp: null, auth: null, db: null, storage: null };
  }

  return { firebaseApp: app, auth, db, storage };
}
