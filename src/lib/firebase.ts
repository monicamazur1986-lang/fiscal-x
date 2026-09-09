// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { firebaseConfig } from "@/firebase/config";

// Reutiliza a mesma configuração (baseada em env vars) do sistema em src/firebase,
// garantindo que todos os módulos do app apontem para o mesmo projeto Firebase.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Única chamada a getFirestore/initializeFirestore do app inteiro — src/firebase/init.ts
// reexporta esta mesma instância em vez de chamar getFirestore por conta própria.
// initializeFirestore com cache persistente só pode ser a PRIMEIRA chamada pro app;
// uma segunda inicialização independente em outro arquivo derrubaria tudo com
// "Firestore has already been initialized".
//
// Sem essa persistência, perder sinal no meio do uso derrubava tanto a leitura
// (onSnapshot parava de entregar dado nenhum) quanto a gravação (setDoc/addDoc
// sem fila própria — a maioria dos hooks do sistema — ficava sem nenhuma garantia
// de reenvio depois). Com persistentLocalCache, o SDK guarda tudo em IndexedDB:
// leitura continua servindo do último dado sincronizado, e gravação feita offline
// fica na fila do próprio SDK e é reenviada sozinha ao reconectar — sem precisar
// de fila caseira em cada hook.
//
// Só roda no navegador: o módulo é avaliado no servidor também (Next.js renderiza
// componentes "use client" no SSR), onde IndexedDB não existe. Envolvido em
// try/catch porque abas privadas ou navegadores sem IndexedDB podem rejeitar a
// persistência — nesses casos cai pro cache em memória de sempre, sem quebrar o app.
//
// Dentro de um iframe (QuickAccessFab abre atalhos como /biblioteca?embed=1
// numa janela sobreposta, um <iframe> de verdade — ver quick-access-fab.tsx),
// NUNCA usa cache persistente: o iframe roda no mesmo domínio, então
// disputaria com a aba principal a mesma base IndexedDB pelo "controle
// primário" da persistência multi-aba — foi exatamente isso que derrubava o
// app inteiro (rejeição não tratada na negociação assíncrona da lease, que
// o try/catch abaixo só protege na chamada síncrona) de volta pro login ao
// abrir a Biblioteca (ou qualquer outro atalho) de dentro de um Roteiro em
// andamento. O iframe usa cache em memória, sem persistência — não precisa
// dela pra uma janela de consulta rápida e sobreposta.
function createFirestore() {
  if (typeof window === "undefined") return getFirestore(app);
  if (window.self !== window.top) return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn("Persistência offline do Firestore indisponível neste navegador, usando cache em memória:", e);
    return getFirestore(app);
  }
}

export const db = createFirestore();
export const auth = getAuth(app);
export const storage = getStorage(app);

export default app;
