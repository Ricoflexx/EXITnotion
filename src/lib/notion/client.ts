/**
 * Minimale client voor de officiële Notion-API (versie 2022-06-28), alleen lezen.
 * Houdt zich aan de limiet van gemiddeld 3 verzoeken per seconde en probeert opnieuw bij 429/5xx.
 */
export type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface NotionClientOptions {
  token: string;
  fetchImpl?: typeof fetch;
  /** Wachttijd tussen verzoeken in ms (standaard 340: net onder 3 per seconde). */
  minIntervalMs?: number;
  baseUrl?: string;
}

export class NotionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class NotionClient {
  private last = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly minInterval: number;
  private readonly base: string;
  requests = 0;

  constructor(private readonly opts: NotionClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.minInterval = opts.minIntervalMs ?? 340;
    // NOTION_API_URL alleen voor lokale tests tegen een nagebootste API.
    this.base = opts.baseUrl ?? process.env.NOTION_API_URL ?? "https://api.notion.com/v1";
  }

  private async request(method: "GET" | "POST", path: string, body?: Json): Promise<Json> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.last + this.minInterval - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      this.requests++;
      const res = await this.fetchImpl(this.base + path, {
        method,
        headers: {
          Authorization: `Bearer ${this.opts.token}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) return (await res.json()) as Json;
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < 5) {
        const after = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      let info: Json = {};
      try {
        info = (await res.json()) as Json;
      } catch {
        /* geen JSON */
      }
      throw new NotionError(explain(res.status, info.code), res.status, info.code);
    }
  }

  retrievePage(id: string) {
    return this.request("GET", `/pages/${id}`);
  }

  retrieveDatabase(id: string) {
    return this.request("GET", `/databases/${id}`);
  }

  async queryDatabase(id: string): Promise<Json[]> {
    const out: Json[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.request("POST", `/databases/${id}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
      out.push(...res.results);
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    return out;
  }

  async blockChildren(id: string): Promise<Json[]> {
    const out: Json[] = [];
    let cursor: string | undefined;
    do {
      const q = `?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
      const res = await this.request("GET", `/blocks/${id}/children${q}`);
      out.push(...res.results);
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    return out;
  }

  /** Bestand downloaden (afbeeldingen en bijlagen die bij Notion zelf staan; de link verloopt na een uur). */
  async download(url: string): Promise<{ data: Buffer; contentType: string }> {
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new NotionError(`Bestand downloaden lukte niet (${res.status}).`, res.status);
    return { data: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
  }
}

function explain(status: number, code?: string): string {
  if (status === 401) return "Notion accepteert dit token niet. Controleer of je het volledige integratietoken hebt geplakt.";
  if (status === 404 || code === "object_not_found")
    return "Notion vindt deze pagina niet. Deel de pagina met de integratie (in Notion: ••• → Connections → je integratie).";
  if (status === 403) return "De integratie mag deze pagina niet lezen. Geef haar leesrechten op de pagina.";
  if (status === 429) return "Notion geeft aan dat we te veel verzoeken doen. Probeer het over een paar minuten opnieuw.";
  return `Notion gaf een fout (${status}${code ? `, ${code}` : ""}).`;
}

/** Haalt het pagina-id uit een Notion-link of los id, met streepjes (8-4-4-4-12). */
export function parseNotionId(input: string): string | null {
  const m = input.replace(/-/g, "").match(/([0-9a-f]{32})(?![0-9a-f])/i);
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
