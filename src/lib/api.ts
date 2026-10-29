export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** fetch JSON com tratamento padronizado de erros (mensagem amigável vinda do servidor). */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      ...rest,
      headers: { Accept: "application/json", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError("Não foi possível conectar ao servidor. Verifique sua conexão.", 0, "network");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* sem corpo JSON */
  }
  if (!res.ok) {
    const d = data as { message?: string; error?: string } | null;
    throw new ApiError(d?.message || "Algo deu errado. Tente novamente.", res.status, d?.error);
  }
  return data as T;
}
