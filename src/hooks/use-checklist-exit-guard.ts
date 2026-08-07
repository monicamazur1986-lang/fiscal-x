"use client"

// Ponte simples entre o AppHeader (global, fora da página) e a página de
// preenchimento de roteiro: permite que o roteiro "segure" a navegação pro
// Início (link do cabeçalho ou logo) enquanto há uma vistoria em andamento,
// pra perguntar antes se o fiscal quer salvar como rascunho ou excluir. Um
// singleton de módulo é suficiente aqui — não precisa de Context/re-render,
// já que o AppHeader só consulta isso no instante do clique.
type ExitGuardHandler = (targetHref: string) => void;

let currentHandler: ExitGuardHandler | null = null;

export function setChecklistExitGuard(handler: ExitGuardHandler | null) {
  currentHandler = handler;
}

// Retorna true se alguém assumiu o controle da navegação (o chamador deve
// cancelar a navegação padrão); false = pode navegar normalmente.
export function requestChecklistExit(targetHref: string): boolean {
  if (currentHandler) {
    currentHandler(targetHref);
    return true;
  }
  return false;
}
