// firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
// Importe outros serviços do Firebase que você usa (ex: Auth, Storage, etc.)

// Substitua com as suas próprias credenciais do Firebase
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Inicializa o Firebase apenas uma vez
const app = initializeApp(firebaseConfig);

// Obtém a instância do Firestore
export const db = getFirestore(app);

// Exporte também o app se precisar em outros lugares
export default app;
