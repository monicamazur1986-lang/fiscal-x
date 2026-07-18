
'use client';

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, 
  onSnapshot, 
  doc, 
  addDoc, 
  setDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  Timestamp,
  orderBy,
  query
} from 'firebase/firestore';
import { useAuth } from './use-auth';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';
import { normalizeId } from '@/lib/utils';

export interface Message {
  id: string;
  title?: string;
  text: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  imageUrl?: string;
  type: 'message' | 'os';
  likes: string[];
  createdAt: Date | null;
  deleted?: boolean;
}

export interface Comment {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  createdAt: Date | null;
}

const LOCAL_STORAGE_KEY = 'fiscal_x_messages_geral_v3';
const LOCAL_STORAGE_COMMENTS_PREFIX = 'fiscal_x_comments_';

export function useMessages() {
  const { profile, configError } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);

  const topicId = "geral"; 

  useEffect(() => {
    if (!profile?.municipioId) {
      setLoadingMessages(false);
      return;
    }

    const mid = normalizeId(profile.municipioId);

    if (db && !configError) {
      const messagesCol = collection(db, "municipios", mid, "topics", topicId, "messages");
      
      const unsub = onSnapshot(messagesCol, (snap) => {
        const items = snap.docs
          .map(d => {
            const data = d.data();
            let createdAt: Date | null = null;
            
            if (data.createdAt instanceof Timestamp) {
              createdAt = data.createdAt.toDate();
            } else if (data.createdAt) {
              createdAt = new Date(data.createdAt);
            }

            return { 
              id: d.id, 
              ...data,
              createdAt
            } as Message;
          })
          .filter(m => m.deleted !== true);
        
        items.sort((a, b) => {
          const timeA = a.createdAt?.getTime() || 0;
          const timeB = b.createdAt?.getTime() || 0;
          return timeB - timeA;
        });
        
        setMessages(items);
        setLoadingMessages(false);
      }, async (serverError) => {
          const permissionError = new FirestorePermissionError({
            path: messagesCol.path,
            operation: 'list',
          } satisfies SecurityRuleContext);
          errorEmitter.emit('permission-error', permissionError);
          setLoadingMessages(false);
      });

      return unsub;
    } else {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved)
          .map((m: any) => ({
            ...m,
            createdAt: m.createdAt ? new Date(m.createdAt) : null
          }))
          .filter((m: any) => m.deleted !== true);
        setMessages(parsed);
      }
      setLoadingMessages(false);
    }
  }, [db, profile?.municipioId, configError]);

  const sendMessage = useCallback(async (data: { 
    title?: string, 
    text: string, 
    imageUrl?: string | null, 
    type: 'message' | 'os'
  }) => {
    if (!profile?.municipioId || !profile?.uid || !data.text.trim()) return;

    const mid = normalizeId(profile.municipioId);
    const messageData = {
      title: data.title || "",
      text: data.text,
      imageUrl: data.imageUrl || null,
      type: data.type,
      senderId: profile.uid,
      senderName: profile.displayName || "Fiscal",
      senderPhoto: profile.photoURL || "",
      likes: [],
      deleted: false,
    };

    if (db && !configError) {
      const topicRef = doc(db, "municipios", mid, "topics", topicId);
      const messagesCol = collection(topicRef, "messages");

      setDoc(topicRef, {
        name: "MURAL DE AVISOS",
        type: "public",
        lastMessageAt: serverTimestamp(),
        lastMessageSender: profile.displayName || "Fiscal",
        lastMessageText: data.text.substring(0, 50) + (data.text.length > 50 ? "..." : "")
      }, { merge: true }).catch(() => {});

      addDoc(messagesCol, {
        ...messageData,
        createdAt: serverTimestamp()
      }).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: messagesCol.path,
          operation: 'create',
          requestResourceData: messageData,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
    } else {
      const targetId = Math.random().toString(36).substr(2, 9);
      const newMessage = { ...messageData, id: targetId, createdAt: new Date() } as Message;
      const updated = [newMessage, ...messages];
      setMessages(updated);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    }
  }, [db, profile, configError, messages]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!profile?.municipioId) return;
    const mid = normalizeId(profile.municipioId);

    setMessages((prev) => prev.filter((m) => m.id !== messageId));

    if (db && !configError) {
      const msgRef = doc(db, "municipios", mid, "topics", topicId, "messages", messageId);
      updateDoc(msgRef, { deleted: true }).catch(async (err) => {
        const permissionError = new FirestorePermissionError({
          path: msgRef.path,
          operation: 'update',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
    } else {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        const updated = data.map((m: any) => 
          m.id === messageId ? { ...m, deleted: true } : m
        );
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      }
    }
  }, [db, profile?.municipioId, configError]);

  const toggleLike = useCallback(async (messageId: string, currentlyLiked: boolean) => {
    if (!profile?.municipioId || !profile?.uid) return;
    const mid = normalizeId(profile.municipioId);

    if (db && !configError) {
      const msgRef = doc(db, "municipios", mid, "topics", topicId, "messages", messageId);
      updateDoc(msgRef, {
        likes: currentlyLiked ? arrayRemove(profile.uid) : arrayUnion(profile.uid)
      }).catch(() => {});
    } else {
      const updated = messages.map(m => {
        if (m.id === messageId) {
          const newLikes = currentlyLiked 
            ? m.likes.filter(id => id !== profile.uid)
            : [...m.likes, profile.uid];
          return { ...m, likes: newLikes };
        }
        return m;
      });
      setMessages(updated);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    }
  }, [db, profile, configError, messages]);

  return { 
    messages, 
    loadingMessages, 
    sendMessage,
    deleteMessage,
    toggleLike
  };
}

export function useComments(messageId: string | null) {
  const { profile, configError } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  useEffect(() => {
    if (!messageId || !profile?.municipioId) {
      setComments([]);
      setLoadingComments(false);
      return;
    }

    setLoadingComments(true);
    const mid = normalizeId(profile.municipioId);
    const topicId = "geral";

    if (db && !configError) {
      const commentsCol = collection(db, "municipios", mid, "topics", topicId, "messages", messageId, "comments");
      const q = query(commentsCol, orderBy("createdAt", "asc"));

      const unsub = onSnapshot(q, (snap) => {
        const items = snap.docs.map(d => {
          const data = d.data();
          let createdAt: Date | null = null;
          if (data.createdAt instanceof Timestamp) {
            createdAt = data.createdAt.toDate();
          } else if (data.createdAt) {
            createdAt = new Date(data.createdAt);
          }
          return { id: d.id, ...data, createdAt } as Comment;
        });
        setComments(items);
        setLoadingComments(false);
      }, async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: commentsCol.path,
          operation: 'list',
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
        setLoadingComments(false);
      });

      return unsub;
    } else {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_COMMENTS_PREFIX}${messageId}`);
      if (saved) {
        setComments(JSON.parse(saved).map((c: any) => ({
          ...c,
          createdAt: c.createdAt ? new Date(c.createdAt) : null
        })));
      } else {
        setComments([]);
      }
      setLoadingComments(false);
    }
  }, [db, profile?.municipioId, messageId, configError]);

  const addComment = useCallback(async (text: string) => {
    if (!messageId || !profile?.uid || !profile?.municipioId || !text.trim()) return;

    const mid = normalizeId(profile.municipioId);
    const commentData = {
      text,
      senderId: profile.uid,
      senderName: profile.displayName || "Fiscal",
      createdAt: null as any
    };

    if (db && !configError) {
      const topicId = "geral";
      const commentsCol = collection(db, "municipios", mid, "topics", topicId, "messages", messageId, "comments");
      
      addDoc(commentsCol, {
        ...commentData,
        createdAt: serverTimestamp()
      }).catch(async (err) => {
        const permissionError = new FirestorePermissionError({
          path: commentsCol.path,
          operation: 'create',
          requestResourceData: commentData,
        } satisfies SecurityRuleContext);
        errorEmitter.emit('permission-error', permissionError);
      });
    } else {
      const targetId = Math.random().toString(36).substr(2, 9);
      const newComment = { ...commentData, id: targetId, createdAt: new Date() } as Comment;
      const updated = [...comments, newComment];
      setComments(updated);
      localStorage.setItem(`${LOCAL_STORAGE_COMMENTS_PREFIX}${messageId}`, JSON.stringify(updated));
    }
  }, [db, profile, messageId, configError, comments]);

  return { comments, loadingComments, addComment };
}
