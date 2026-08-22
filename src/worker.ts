import type { Env, R2ObjectBody } from "./types.ts";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,HEAD,OPTIONS",
  "access-control-allow-headers": "content-type,range",
  "cache-control": "public, max-age=300, s-maxage=3600",
};

function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function objectHeaders(object: R2ObjectBody, key: string): Headers {
  const headers = new Headers({
    "access-control-allow-origin": "*",
    "cache-control": object.httpMetadata?.cacheControl ?? "public, max-age=300, s-maxage=3600",
    "content-type": object.httpMetadata?.contentType ?? contentTypeForKey(key),
  });
  if (object.httpEtag) headers.set("etag", object.httpEtag);
  if (object.size != null) headers.set("content-length", String(object.size));
  if (object.httpMetadata?.contentDisposition) {
    headers.set("content-disposition", object.httpMetadata.contentDisposition);
  }
  return headers;
}

function contentTypeForKey(key: string): string {
  if (key.endsWith(".json")) return "application/json; charset=utf-8";
  if (key.endsWith(".jsonl")) return "application/x-ndjson; charset=utf-8";
  if (key.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (key.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (key.endsWith(".pdf")) return "application/pdf";
  if (key.endsWith(".xlsx"))
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/octet-stream";
}

async function getObject(env: Env, key: string): Promise<R2ObjectBody | null> {
  return env.DATA.get(key);
}

async function getJson<T = unknown>(env: Env, key: string): Promise<T | null> {
  const object = await getObject(env, key);
  if (!object) return null;
  return JSON.parse(await new Response(object.body).text()) as T;
}

async function serveObject(env: Env, key: string, method: string): Promise<Response> {
  const object = await getObject(env, key);
  if (!object) return json({ error: "not_found", key }, 404);
  const headers = objectHeaders(object, key);
  return new Response(method === "HEAD" ? null : object.body, { status: 200, headers });
}

function safeDataKey(pathname: string): string | null {
  const decoded = decodeURIComponent(pathname.replace(/^\/data\//, ""));
  if (!decoded || decoded.includes("..") || decoded.startsWith("/")) return null;
  return `data/${decoded}`;
}

async function route(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method_not_allowed" }, 405, { allow: "GET, HEAD, OPTIONS" });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path === "/") {
    return json({
      name: "Tokyo Budget Execution Data API",
      fiscalYears: [2025, 2026],
      storage: "Cloudflare R2",
      endpoints: {
        manifest: "/manifest",
        coverage: "/coverage",
        budgetIndex: "/budget",
        budgetSeries: "/budget/:key?year=2025|2026",
        settlementIndex: "/settlement",
        settlementSeries: "/settlement/:key",
        expenditureIndex: "/expenditure",
        expenditureSummary:
          "/expenditure/summary?year=2025|2026&dimension=total|month|bureau|account|chapter",
        subsidySummary: "/subsidies/summary?year=2025|2026",
        closingEstimate: "/closing-estimate/2025",
        catalog: "/catalog",
        objectProxy: "/data/*",
      },
      cautions: [
        "予算と公金支出は分類粒度が異なるため、未検証の直接結合で執行率を算出しないこと。",
        "令和8年度は年度途中であり、公開済み月までのデータに限定される。",
      ],
    });
  }

  if (path === "/manifest") return serveObject(env, "data/manifest.json", request.method);
  if (path === "/coverage")
    return serveObject(env, "data/normalized/coverage.json", request.method);
  if (path === "/catalog") {
    return serveObject(env, "data/normalized/catalog/relevant-api-catalog.json", request.method);
  }

  if (path === "/budget") {
    return serveObject(env, "data/normalized/budget/index.json", request.method);
  }
  if (path.startsWith("/budget/")) {
    const key = path.slice("/budget/".length);
    if (!/^[a-z0-9_]+$/u.test(key)) return json({ error: "invalid_budget_key" }, 400);
    const objectKey = `data/normalized/budget/${key}.json`;
    const yearText = url.searchParams.get("year");
    if (!yearText || request.method === "HEAD") return serveObject(env, objectKey, request.method);
    const year = Number(yearText);
    if (year !== 2025 && year !== 2026) return json({ error: "year_must_be_2025_or_2026" }, 400);
    const table = await getJson<Record<string, unknown> & { records?: Record<string, unknown>[] }>(
      env,
      objectKey,
    );
    if (!table) return json({ error: "not_found", key: objectKey }, 404);
    const records = (table.records ?? []).filter((record) => Number(record["年度"]) === year);
    return json({ ...table, fiscalYears: [year], recordCount: records.length, records });
  }

  if (path === "/settlement") {
    return serveObject(env, "data/normalized/settlement/index.json", request.method);
  }
  if (path.startsWith("/settlement/")) {
    const key = path.slice("/settlement/".length);
    if (!/^[a-z0-9_]+$/u.test(key)) return json({ error: "invalid_settlement_key" }, 400);
    return serveObject(env, `data/normalized/settlement/${key}.json`, request.method);
  }

  if (path === "/expenditure") {
    return serveObject(env, "data/normalized/public-expenditure/index.json", request.method);
  }
  if (path === "/expenditure/summary") {
    const year = Number(url.searchParams.get("year") ?? "2026");
    if (year !== 2025 && year !== 2026) return json({ error: "year_must_be_2025_or_2026" }, 400);
    const dimension = url.searchParams.get("dimension") ?? "total";
    const files: Record<string, string> = {
      total: "summary.json",
      month: "by-month.json",
      bureau: "by-bureau.json",
      account: "by-account.json",
      chapter: "by-chapter.json",
    };
    const file = files[dimension];
    if (!file) return json({ error: "invalid_dimension", allowed: Object.keys(files) }, 400);
    return serveObject(env, `data/normalized/public-expenditure/fy${year}/${file}`, request.method);
  }

  if (path === "/subsidies/summary") {
    const year = Number(url.searchParams.get("year") ?? "2026");
    if (year !== 2025 && year !== 2026) return json({ error: "year_must_be_2025_or_2026" }, 400);
    return serveObject(env, `data/normalized/subsidies/${year}-summary.json`, request.method);
  }

  if (path === "/closing-estimate/2025") {
    return serveObject(env, "data/normalized/closing-estimate/fy2025.json", request.method);
  }

  if (path.startsWith("/data/")) {
    const key = safeDataKey(path);
    if (!key) return json({ error: "invalid_data_key" }, 400);
    return serveObject(env, key, request.method);
  }

  return json({ error: "not_found", path }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      console.error(error);
      return json(
        {
          error: "internal_error",
          message: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  },
};
