// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Env {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  // MY_KV_NAMESPACE: KVNamespace;
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  // MY_BUCKET: R2Bucket;
}

export default {
  async fetch(
    request: Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    env: Env,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ctx: ExecutionContext
  ): Promise<Response> {
    return processRequest(request);
  }
}

async function processRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    const responseHeaders = setCorsHeaders(new Headers())
    return new Response('', { headers: responseHeaders })
  }

  const url = new URL(request.url);
  if (!url.protocol.startsWith("https")) {
    const response = new Response("Request must be HTTPS", { "status": 400, "statusText": "Bad Request" });
    return response;
  }

  if (!url.pathname.startsWith("/range/")) {
    const response = new Response("Invalid API query", { "status": 400, "statusText": "Bad Request" });
    return response;
  }

  if (request.method === 'POST') {
    const response = new Response("Only GET requests can be used to query ranges, but this request used the POST verb", { "status": 405, "statusText": "Method Not Allowed" });
    return response;
  }

  const prefix = url.pathname.substring(7);
  const isNtlm = url.searchParams.get('mode') == 'ntlm';
  const newRequest = "https://api.pwnedpasswords.com/range/" + prefix.toUpperCase() + (isNtlm ? "?mode=ntlm" : "");
  if (prefix === null || prefix.length !== 5) {
    const response = new Response("The hash prefix was not in a valid format", { "status": 400, "statusText": "Bad Request" });
    return response;
  }

  const re = /[0-9A-Fa-f]{5}/g;

  if (re.test(prefix) === false) {
    const response = new Response("The hash prefix was not valid hexadecimal", { "status": 400, "statusText": "Bad Request" });
    return response;
  }

  const addPaddingHeader = request.headers.get('Add-Padding');

  // Fetching and generating the padding in parallel
  const [response, padding] = await Promise.all([
	fetch(request, { cf: { cacheKey: newRequest, cacheEverything: true, cacheTtlByStatus: { "300-599": -1 } } }),
	getPadding(addPaddingHeader, isNtlm)
  ]);

  // No magic on non 200
  if (response.status !== 200) {
	return response;
  }

  // No padding so just return
  if (padding === '') {
	return response;
  }

  const originalBody = await response.text();
  const newBody = originalBody + padding;
  const newResponse = new Response(newBody, response);
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Cache-Control', 'public, max-age=2678400');
  return newResponse;
}

function setCorsHeaders(headers: Headers): Headers {
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET')
  headers.set('Access-Control-Allow-Headers', 'Add-Padding')
  headers.set('Access-Control-Max-Age', '1728000')
  return headers
}

async function getPadding(addPaddingHeader: string | null, isNtlm: boolean): Promise<string> {
  if (!addPaddingHeader || (addPaddingHeader.toLowerCase() !== "true")) {
    return '';
  }

  const random = (10 + Math.floor(200 * cryptoRandom()));

  let padding = '';
  for (let i = 0; i < random; i++) {
    padding += "\r\n" + generateHex(isNtlm);
  }

  return padding;
}

function generateHex(isNtlm: boolean): string {
  let result = '';
  const characters = '0123456789ABCDEF';
  const charactersLength = characters.length;
  for (let i = 0; i < (isNtlm ? 27 : 35); i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result + ":0";
}

function cryptoRandom(): number {
  const array = new Uint32Array(1),
    max = Math.pow(2, 32),
    randomValue = crypto.getRandomValues(array)[0] / max;

  return randomValue;
}
