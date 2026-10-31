/**
 * Abre a aba do pagamento já no clique (depois de um await o navegador bloquearia) e devolve uma
 * função para levá-la ao link do Mercado Pago. Assim a aba do site fica na página do pedido,
 * acompanhando o pagamento e abrindo o WhatsApp quando ele for confirmado.
 */
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
        tab.opener = null;
        tab.location.href = url;
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
