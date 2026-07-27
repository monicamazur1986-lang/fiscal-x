'use client';

import DOMPurify from 'dompurify';

/**
 * Sanitiza HTML antes de qualquer dangerouslySetInnerHTML que venha de
 * conteúdo gravado por usuários (ex.: Docfacil) — sem isso, qualquer
 * fiscal autenticado podia gravar HTML/JS malicioso direto no Firestore
 * (contornando o editor visual) e ele executava no navegador de quem
 * abrisse o documento depois, inclusive um admin.
 */
export function sanitizeHtml(html: string | undefined | null): string {
  if (!html) return '';
  return DOMPurify.sanitize(html);
}
