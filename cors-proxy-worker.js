// Cloudflare Worker: CORS-Proxy für den Zugriff auf Nextcloud-WebDAV von
// https://tecko1985.github.io/materialliste-test/ aus (z.B. am Handy).
// Nicht Teil der ausgelieferten App – wird separat bei Cloudflare deployed.
// Deployment: dash.cloudflare.com -> Workers & Pages -> Create -> "Hello World" ->
// diesen Code im Editor einfügen -> Deploy. Die resultierende *.workers.dev-URL
// dann im "CORS-Proxy-URL"-Feld des WebDAV-Verbindungsformulars eintragen.

const ALLOWED_ORIGIN = "https://tecko1985.github.io";
const ALLOWED_TARGET_PREFIX = "https://nx88695.your-storageshare.de/";

export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const targetUrl = new URL(request.url).searchParams.get("url");
    if (!targetUrl || !targetUrl.startsWith(ALLOWED_TARGET_PREFIX)) {
      return new Response("Invalid or missing url parameter", { status: 400, headers: corsHeaders });
    }

    const init = { method: request.method, headers: {} };
    const auth = request.headers.get("Authorization");
    if (auth) init.headers["Authorization"] = auth;
    const contentType = request.headers.get("Content-Type");
    if (contentType) init.headers["Content-Type"] = contentType;
    if (request.method === "PUT") {
      init.body = await request.arrayBuffer();
    }

    const upstreamResp = await fetch(targetUrl, init);
    const respBody = await upstreamResp.arrayBuffer();

    return new Response(respBody, {
      status: upstreamResp.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstreamResp.headers.get("Content-Type") || "application/octet-stream"
      }
    });
  }
};
