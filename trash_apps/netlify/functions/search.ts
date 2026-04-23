import type { Handler, HandlerEvent } from "@netlify/functions";

const SERPER_API_KEY = process.env.SERPER_API_KEY!;
const GITHUB_PAT     = process.env.GITHUB_PAT!;
const GITHUB_OWNER   = process.env.GITHUB_OWNER!;
const GITHUB_REPO    = process.env.GITHUB_REPO!;
const DATA_BRANCH    = "data";
const HISTORY_PATH   = "data/search_history.json";
const BLACKLIST_PATH = "data/blacklist.json";

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

// ---- Serper API ----
// maxResults=0 は無制限（最大5ページ×10件=50件）

async function serperSearch(
  query: string,
  dateRestrict: DateRestrict,
  maxResults: number
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const unlimited = maxResults === 0;
  // num=100 で1リクエストあたりの取得件数を最大化
  const num = unlimited ? 100 : Math.min(maxResults, 100);
  const maxPages = unlimited ? 10 : Math.ceil(maxResults / num);

  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        tbs: TBS_MAP[dateRestrict],
        num,
        page,
        gl: "jp",
        hl: "ja",
      }),
    });

    if (!res.ok) throw new Error(`Serper API error: ${res.status}`);
    const data = await res.json();
    const items: { link: string; title: string; snippet: string }[] = data.organic ?? [];

    for (const item of items) {
      results.push({
        url: item.link,
        title: item.title,
        description: item.snippet?.replace(/\n/g, " ") ?? "",
        fetchedAt: new Date().toISOString(),
      });
      if (!unlimited && results.length >= maxResults) break;
    }

    // 結果が0件 or 指定件数に達したら終了
    if (items.length === 0) break;
    if (!unlimited && results.length >= maxResults) break;

    await new Promise((r) => setTimeout(r, 200));
  }

  return results;
}

function isBlacklisted(url: string, blacklist: string[]): boolean {
  return blacklist.some((prefix) => {
    const n = prefix.startsWith("http") ? prefix : `https://${prefix}`;
    return url.startsWith(n) || url.startsWith(`http://${prefix}`);
  });
}

// ---- Handler ----

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  const method = event.httpMethod;
  const action = event.queryStringParameters?.action;

  try {
    if (method === "GET" && action === "blacklist") {
      const { data } = await readJson<string[]>(BLACKLIST_PATH);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ blacklist: data }) };
    }

    if (method === "GET" && action === "history") {
      const { data } = await readJson<HistoryEntry[]>(HISTORY_PATH);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ history: (data as HistoryEntry[]).slice(-500).reverse() }) };
    }

    if (method === "DELETE" && action === "history") {
      const { sha } = await readJson<HistoryEntry[]>(HISTORY_PATH);
      await ghPut(HISTORY_PATH, "[]", sha, "data: 履歴を全件削除");
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    if (method === "DELETE" && action === "blacklist") {
      const prefix = event.queryStringParameters?.prefix;
      if (!prefix) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "prefix required" }) };
      const { data, sha } = await readJson<string[]>(BLACKLIST_PATH);
      await ghPut(BLACKLIST_PATH, JSON.stringify((data as string[]).filter((p) => p !== prefix)), sha, `data: BLから削除 - ${prefix}`);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    // PUT: ブラックリスト追加（単体 or CSV一括）
    if (method === "PUT") {
      const body = JSON.parse(event.body ?? "{}");
      const { data, sha } = await readJson<string[]>(BLACKLIST_PATH);
      const list = data as string[];

      if (body.prefixes && Array.isArray(body.prefixes)) {
        // CSV一括インポート
        const incoming: string[] = body.prefixes.map((p: string) => p.trim()).filter(Boolean);
        const merged = Array.from(new Set([...list, ...incoming]));
        await ghPut(BLACKLIST_PATH, JSON.stringify(merged), sha, `data: BLに一括追加 - ${incoming.length}件`);
      } else {
        // 単体追加
        const prefix: string = body.prefix?.trim();
        if (!prefix) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "prefix required" }) };
        if (!list.includes(prefix)) {
          list.push(prefix);
          await ghPut(BLACKLIST_PATH, JSON.stringify(list), sha, `data: BLに追加 - ${prefix}`);
        }
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    if (method === "POST") {
      const body = JSON.parse(event.body ?? "{}");
      const query: string = body.query?.trim();
      const dateRestrict: DateRestrict = body.dateRestrict ?? "w1";
      // maxResults=0 を無制限として扱う
      const maxResults = Number(body.maxResults) === 0 ? 0 : Math.min(Number(body.maxResults) || 10, 50);
      const deduplication: boolean = body.deduplication !== false;

      if (!query) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "query required" }) };

      const [{ data: historyRaw, sha: historySha }, { data: blacklistRaw }, rawResults] = await Promise.all([
        readJson<HistoryEntry[]>(HISTORY_PATH),
        readJson<string[]>(BLACKLIST_PATH),
        serperSearch(query, dateRestrict, maxResults),
      ]);

      const history = historyRaw as HistoryEntry[];
      const blacklist = blacklistRaw as string[];
      const historyUrls = new Set(history.map((h) => h.url));

      const annotated: AnnotatedResult[] = rawResults.map((r) => ({
        ...r,
        status: isBlacklisted(r.url, blacklist) ? "blacklisted"
               : deduplication && historyUrls.has(r.url) ? "duplicate"
               : "new",
      }));

      const newItems = annotated.filter((r) => r.status === "new");
      if (newItems.length > 0) {
        await ghPut(
          HISTORY_PATH,
          JSON.stringify([...history, ...newItems.map((r) => ({ ...r, query }))]),
          historySha,
          `data: 検索履歴を追加 - "${query}" (${newItems.length}件)`
        );
      }

      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({
          results: annotated,
          stats: {
            total: annotated.length,
            new: newItems.length,
            duplicate: annotated.filter((r) => r.status === "duplicate").length,
            blacklisted: annotated.filter((r) => r.status === "blacklisted").length,
          },
        }),
      };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }) };
  }
};