'use client';

import { useMemo, ReactNode } from 'react';
import { initializeFirebase } from './init';
import { FirebaseProvider } from './provider';

/**
 * Provedor que garante a inicialização única e imediata do Firebase.
 * Inclui suporte a Storage para armazenamento em nuvem.
 */
export function FirebaseClientProvider({ children }: { children: ReactNode }) {
  const firebase = useMemo(() => initializeFirebase(), []);

  return (
    <FirebaseProvider
      firebaseApp={firebase.firebaseApp}
      auth={firebase.auth}
      db={firebase.db}
      storage={firebase.storage}
    >
      {children}
    </FirebaseProvider>
  );
}
