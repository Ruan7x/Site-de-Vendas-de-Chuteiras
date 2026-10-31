/**
 * Abre a aba do pagamento já no clique (depois de um await o navegador bloquearia) e devolve uma
 * função para levá-la ao link do Mercado Pago. Assim a aba do site fica na página do pedido,
 * acompanhando o pagamento e abrindo o WhatsApp quando ele for confirmado.
 */
// Aba do Mercado Pago aberta nesta visita ao site (some ao recarregar a página, e tudo bem).
let activeTab: Window | null = null;

/** Fecha a aba do Mercado Pago aberta pelo site, se ainda existir. Retorna true se fechou. */
export function closePayTab() {
  const tab = activeTab;
  activeTab = null;
  if (!tab || tab.closed) return false;
  try {
    tab.close();
    window.focus();
    return true;
  } catch {
    return false;
  }
}

export function openPayTab() {
  let tab: Window | null = null;
  try {
    tab = window.open("", "_blank");
    if (tab) {
      tab.document.title = "Abrindo o Mercado Pago…";
      tab.document.body.style.cssText = "font-family:sans-serif;background:#111;color:#eee;padding:2rem";
      tab.document.body.textContent = "Abrindo o pagamento seguro do Mercado Pago…";
    }
  } catch {
    tab = null;
  }
  return {
    /** Leva a aba ao pagamento. Retorna false se a aba foi bloqueada ou fechada. */
    go(url: string) {
      if (!tab || tab.closed) return false;
      try {
        // A ligação com a aba (opener) é mantida de propósito: sem ela o navegador não deixa o site
        // fechar a aba do Mercado Pago quando o pagamento for aprovado. A aba só abre o link oficial.
        tab.location.href = url;
        activeTab = tab;
        return true;
      } catch {
        return false;
      }
    },
    close() {
      try {
        tab?.close();
      } catch {
        /* ignore */
      }
    },
  };
}
