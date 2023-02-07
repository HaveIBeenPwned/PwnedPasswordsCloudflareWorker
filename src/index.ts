addEventListener('fetch', event => {
  event.respondWith(processRequest(event.request))
})

async function processRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    let responseHeaders = setCorsHeaders(new Headers());
    return new Response('', { headers: responseHeaders });
  }

  const url = new URL(request.url);
  if (!url.protocol.startsWith("https")) {
    const response = new Response("Request must be HTTPS", { "status": 400, "statusText": "Bad Request" });
    return response;
  }

  if (!url.pathname.startsWith("/range/")) {
    const response = new Response("Invalid API query", { "status": 404, "statusText": "Not Found" });
    return response;
  }

  const prefix = url.pathname.substr(7);
  const newRequest = "https://api.pwnedpasswords.com/range/" + prefix.toUpperCase();

  if (prefix === null || prefix.length !== 5) {
    const response = new Response("The hash prefix was not in a valid format", { "status": 400, "statusText": "Bad Request" });
    return response;
  }

  var re = /[0-9A-Fa-f]{5}/g;

  if (re.test(prefix) === false) {
    const response = new Response("The hash prefix was not valid hexadecimal", { "status": 400, "statusText": "Bad Request" });
    return response;
  }

  const response = await fetch(request, { cf: { cacheKey: newRequest, cacheEverything: true, cacheTtlByStatus: { "300-599": -1 } } });
  const addPaddingHeader = request.headers.get('Add-Padding');
  if (response.status === 200 && addPaddingHeader && (addPaddingHeader.toLowerCase() === "true")) {
    const isNtlm = url.searchParams.get('mode') == 'ntlm';
    const originalBody = await response.text();
    const newBody = padResponse(originalBody, isNtlm);
    let newResponse = new Response(newBody, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Cache-Control', 'public, max-age=2678400');
    return newResponse;
  }
  return response
}

function setCorsHeaders(headers: Headers): Headers {
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET');
  headers.set('Access-Control-Allow-Headers', 'Add-Padding');
  headers.set('Access-Control-Max-Age', '1728000');
  return headers;
}

function padResponse(originalBody: string, isNtlm: boolean): string {
  let body = originalBody;
  const random = (10 + Math.floor(200 * cryptoRandom()));

  for (let i = 0; i < random; i++) {
    body += "\r\n" + generateHex(isNtlm);
  }

  return body;
}

function generateHex(isNtlm: boolean): string {
  let result = '';
  const characters = '0123456789ABCDEF';
  const charactersLength = characters.length;
  for (var i = 0; i < (isNtlm ? 27 : 35); i++) {
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
