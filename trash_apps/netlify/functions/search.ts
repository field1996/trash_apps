import type { Handler, HandlerEvent } from "@netlify/functions";

const SERPER_API_KEY = process.env.SERPER_API_KEY!;
const GITHUB_PAT     = process.env.GITHUB_PAT!;
const GITHUB_OWNER   = process.env.GITHUB_OWNER!;
const GITHUB_REPO    = process.env.GITHUB_REPO!;
const DATA_BRANCH    = "data";
const HISTORY_PATH   = "data/search_history.json";
const BLACKLIST_PATH = "data/blacklist.json";
const DOMAINS_PATH   = "data/domains.json";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

type DateRestrict = "d3" | "w1" | "w2" | "m1";

const TBS_MAP: Record<DateRestrict, string> = {
  d3: "qdr:d3",
  w1: "qdr:w",
  w2: "qdr:w2",
  m1: "qdr:m",
};

interface SearchResult {
  url: string; title: string; description: string; fetchedAt: string;
}
interface AnnotatedResult extends SearchResult {
  status: "new" | "duplicate" | "blacklisted";
}
interface HistoryEntry extends SearchResult { query: string; }

// ---- GitHub API ----

async function ghGet(path: string): Promise<{ content: string; sha: string } | null> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${DATA_BRANCH}`,
    { headers: { Authorization: `Bearer ${GITHUB_PAT}`, Accept: "application/vnd.github+json" } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status}`);
  return res.json();
}

async function ghPut(path: string, content: string, sha: string | undefined, message: string) {
  const body: Record<string, unknown> = {
    message, branch: DATA_BRANCH,
    content: Buffer.from(content).toString("base64"),
  };
  if (sha) body.sha = sha;
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`GitHub PUT failed: ${res.status}`);
}

async function readJson<T>(path: string): Promise<{ data: T; sha: string | undefined }> {
  const file = await ghGet(path);
  if (!file) return { data: [] as unknown as T, sha: undefined };
  const decoded = Buffer.from(file.content, "base64").toString("utf-8");
  return { data: JSON.parse(decoded), sha: file.sha };
}

function isBlacklisted(url: string, blacklist: string[]): boolean {
  return blacklist.some((prefix) => {
    const n = prefix.startsWith("http") ? prefix : `https://${prefix}`;
    return url.startsWith(n) || url.startsWith(`http://${prefix}`);
  });
}

// ---- Serper: 1クエリ・1ページ分取得 ----
async function fetchOnePage(q: string, tbs: string, page: number): Promise<{ items: SearchResult[]; hasMore: boolean }> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q, tbs, num: 10, page, gl: "jp", hl: "ja" }),
  });
  if (!res.ok) throw new Error(`Serper API error: ${res.status}`);
  const data = await res.json();
  const raw: { link: string; title: string; snippet: string }[] = data.organic ?? [];
  return {
    items: raw.map((item) => ({
      url: item.link,
      title: item.title,
      description: item.snippet?.replace(/\n/g, " ") ?? "",
      fetchedAt: new Date().toISOString(),
    })),
    hasMore: raw.length > 0,
  };
}

// ---- Handler ----

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  const method = event.httpMethod;
  const action = event.queryStringParameters?.action;

  try {
    // GET系
    if (method === "GET") {
      if (action === "blacklist") {
        const { data } = await readJson<string[]>(BLACKLIST_PATH);
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ blacklist: data }) };
      }
      if (action === "domains") {
        const { data } = await readJson<string[]>(DOMAINS_PATH);
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ domains: data }) };
      }
      if (action === "history") {
        const { data } = await readJson<HistoryEntry[]>(HISTORY_PATH);
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ history: (data as HistoryEntry[]).slice(-500).reverse() }) };
      }
    }

    // DELETE系
    if (method === "DELETE") {
      if (action === "history") {
        const { sha } = await readJson<HistoryEntry[]>(HISTORY_PATH);
        await ghPut(HISTORY_PATH, "[]", sha, "data: 履歴を全件削除");
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
      }
      if (action === "blacklist") {
        const prefix = event.queryStringParameters?.prefix;
        if (!prefix) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "prefix required" }) };
        const { data, sha } = await readJson<string[]>(BLACKLIST_PATH);
        await ghPut(BLACKLIST_PATH, JSON.stringify((data as string[]).filter((p) => p !== prefix)), sha, `data: BLから削除 - ${prefix}`);
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
      }
      if (action === "domains") {
        const domain = event.queryStringParameters?.domain;
        if (!domain) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "domain required" }) };
        const { data, sha } = await readJson<string[]>(DOMAINS_PATH);
        await ghPut(DOMAINS_PATH, JSON.stringify((data as string[]).filter((d) => d !== domain)), sha, `data: 対象ドメインから削除 - ${domain}`);
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
      }
    }

    // PUT系（ブラックリスト・ドメイン追加）
    if (method === "PUT") {
      const body = JSON.parse(event.body ?? "{}");

      if (action === "domains") {
        // ドメイン追加（単体 or 一括）
        const { data, sha } = await readJson<string[]>(DOMAINS_PATH);
        const list = data as string[];
        if (body.domains && Array.isArray(body.domains)) {
          const incoming: string[] = body.domains.map((d: string) => d.trim()).filter(Boolean);
          const merged = Array.from(new Set([...list, ...incoming]));
          await ghPut(DOMAINS_PATH, JSON.stringify(merged), sha, `data: 対象ドメインに一括追加 - ${incoming.length}件`);
        } else {
          const domain: string = body.domain?.trim();
          if (!domain) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "domain required" }) };
          if (!list.includes(domain)) {
            list.push(domain);
            await ghPut(DOMAINS_PATH, JSON.stringify(list), sha, `data: 対象ドメインに追加 - ${domain}`);
          }
        }
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
      }

      // ブラックリスト追加（デフォルト）
      const { data, sha } = await readJson<string[]>(BLACKLIST_PATH);
      const list = data as string[];
      if (body.prefixes && Array.isArray(body.prefixes)) {
        const incoming: string[] = body.prefixes.map((p: string) => p.trim()).filter(Boolean);
        const merged = Array.from(new Set([...list, ...incoming]));
        await ghPut(BLACKLIST_PATH, JSON.stringify(merged), sha, `data: BLに一括追加 - ${incoming.length}件`);
      } else {
        const prefix: string = body.prefix?.trim();
        if (!prefix) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "prefix required" }) };
        if (!list.includes(prefix)) {
          list.push(prefix);
          await ghPut(BLACKLIST_PATH, JSON.stringify(list), sha, `data: BLに追加 - ${prefix}`);
        }
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    // POST: 1ページ分の検索（フロントがループして呼ぶ）
    // body: { query, dateRestrict, page, searchQuery（実際に使うクエリ文字列）, deduplication, isLast（最終リクエストか） }
    if (method === "POST") {
      const body = JSON.parse(event.body ?? "{}");
      const query: string = body.query?.trim();           // キーワード（履歴保存用ラベル）
      const searchQuery: string = body.searchQuery?.trim(); // 実際に検索するクエリ（site:xxx付き等）
      const dateRestrict: DateRestrict = body.dateRestrict ?? "w1";
      const page: number = Number(body.page) || 1;
      const deduplication: boolean = body.deduplication !== false;
      const isLast: boolean = body.isLast === true; // このリクエストが最後の検索かどうか

      if (!query || !searchQuery) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "query required" }) };

      const { items, hasMore } = await fetchOnePage(searchQuery, TBS_MAP[dateRestrict], page);

      // 履歴・BL読み込み（最終リクエスト時のみ履歴保存も行う）
      const [{ data: historyRaw, sha: historySha }, { data: blacklistRaw }] = await Promise.all([
        readJson<HistoryEntry[]>(HISTORY_PATH),
        readJson<string[]>(BLACKLIST_PATH),
      ]);

      const history = historyRaw as HistoryEntry[];
      const blacklist = blacklistRaw as string[];
      const historyUrls = new Set(history.map((h) => h.url));

      const annotated: AnnotatedResult[] = items.map((r) => ({
        ...r,
        status: isBlacklisted(r.url, blacklist) ? "blacklisted"
               : deduplication && historyUrls.has(r.url) ? "duplicate"
               : "new",
      }));

      // 最終リクエスト時のみ新規を履歴保存（フロントでマージ・重複削除後に呼ばれる）
      // ※フロントから isLast=true で渡されたページのみ保存
      if (isLast) {
        const newItems = annotated.filter((r) => r.status === "new");
        if (newItems.length > 0) {
          await ghPut(
            HISTORY_PATH,
            JSON.stringify([...history, ...newItems.map((r) => ({ ...r, query }))]),
            historySha,
            `data: 検索履歴を追加 - "${query}" (${newItems.length}件)`
          );
        }
      }

      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({ results: annotated, hasMore }),
      };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }) };
  }
};