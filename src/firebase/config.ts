/**
 * @fileOverview Configuração central do Firebase.
 * Usa acesso estático para garantir que o Next.js injete as chaves no navegador.
 */

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

/**
 * Verifica se as chaves mínimas estão presentes e são válidas.
 * Ignora strings de erro comuns vindas do ambiente.
 */
export const isConfigReady = Boolean(
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey.length > 10 && 
  firebaseConfig.apiKey !== "undefined" && 
  firebaseConfig.apiKey !== "null"
);
