const MINE_KEY = "tn-sports-my-reviews";

// Ids das avaliações enviadas neste navegador, para marcar "Sua avaliação" ao voltar ao site.
export function readMine(): number[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(MINE_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}
export function rememberMine(id: number) {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify([...new Set([id, ...readMine()])].slice(0, 50)));
  } catch {
    /* ignore */
  }
}
