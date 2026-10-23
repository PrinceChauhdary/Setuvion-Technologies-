import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { chmod, mkdir, readFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.join(siteRoot, "assets");
const dataRoot = path.resolve(process.env.DATA_DIR || path.join(siteRoot, "runtime-data"));
const port = Number.parseInt(process.env.PORT || "8080", 10);
const host = process.env.HOST || "0.0.0.0";
const siteOrigin = process.env.SITE_ORIGIN ? new URL(process.env.SITE_ORIGIN).origin : null;
const trustProxy = process.env.TRUST_PROXY === "1";
const maxBodyBytes = 16 * 1024;
const rateWindowMs = 15 * 60 * 1000;
const maxInquiriesPerWindow = 5;
const attempts = new Map();

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/script.js", ["script.js", "text/javascript; charset=utf-8"]],
  ["/vehicleconnect.css", ["vehicleconnect.css", "text/css; charset=utf-8"]],
  ["/vehicleconnect-demo.js", ["vehicleconnect-demo.js", "text/javascript; charset=utf-8"]],
  ["/products/vehicleconnect", ["products/vehicleconnect/index.html", "text/html; charset=utf-8"]],
  ["/products/vehicleconnect/", ["products/vehicleconnect/index.html", "text/html; charset=utf-8"]],
  ["/products/vehicleconnect/demo", ["products/vehicleconnect/demo/index.html", "text/html; charset=utf-8"]],
  ["/products/vehicleconnect/demo/", ["products/vehicleconnect/demo/index.html", "text/html; charset=utf-8"]],
  ["/assets/vehicleconnect-banner.png", ["assets/vehicleconnect-banner.png", "image/png"]],
  ["/assets/favicon.svg", ["assets/favicon.svg", "image/svg+xml"]],
  ["/assets/setuvion-technologies-logo.png", ["assets/setuvion-technologies-logo.png", "image/png"]],
  ["/assets/autoverify-studio-logo.png", ["assets/autoverify-studio-logo.png", "image/png"]],
  ["/assets/automotive-engineering-triptych.webp", ["assets/automotive-engineering-triptych.webp", "image/webp"]],
  ["/assets/two-wheeler-engineering.webp", ["assets/two-wheeler-engineering.webp", "image/webp"]],
]);

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'");
  if (siteOrigin && new URL(siteOrigin).protocol === "https:") {
    response.setHeader("Strict-Transport-Security", "max-age=31536000");
  }
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let exceeded = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (exceeded) return;
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBodyBytes) {
        exceeded = true;
        reject(Object.assign(new Error("Inquiry is too large."), { statusCode: 413 }));
        request.resume();
      }
    });
    request.on("end", () => {
      if (exceeded) return;
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Please send a valid inquiry."), { statusCode: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}

function getRateLimitKey(request) {
  // The remote address is used only as an in-memory rate-limit key and is never persisted.
  if (trustProxy) {
    const forwardedFor = request.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.length < 512) {
      const firstAddress = forwardedFor.split(",", 1)[0].trim();
      if (/^[a-fA-F0-9:.]+$/.test(firstAddress)) return firstAddress;
    }
  }
  return request.socket.remoteAddress || "unknown";
}

function isRateLimited(request) {
  const now = Date.now();
  const key = getRateLimitKey(request);
  const recent = (attempts.get(key) || []).filter((time) => now - time < rateWindowMs);
  recent.push(now);
  attempts.set(key, recent);
  if (attempts.size > 2000) {
    for (const [attemptKey, times] of attempts) {
      if (!times.some((time) => now - time < rateWindowMs)) attempts.delete(attemptKey);
    }
  }
  return recent.length > maxInquiriesPerWindow;
}

function originAllowed(request) {
  const origin = request.headers.origin;
  if (!origin) return false;
  try {
    const received = new URL(origin).origin;
    if (siteOrigin) return received === siteOrigin;
    return received === `http://${request.headers.host}` || received === `https://${request.headers.host}`;
  } catch {
    return false;
  }
}

async function serveStatic(request, response, pathname) {
  const direct = staticFiles.get(pathname);
  if (!direct) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  const [relativePath, contentType] = direct;

  const fullPath = path.resolve(siteRoot, relativePath);
  if (!fullPath.startsWith(`${siteRoot}${path.sep}`)) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  try {
    const content = await readFile(fullPath);
    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": content.length,
      "Cache-Control": contentType.startsWith("image/") ? "public, max-age=86400" : "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") response.end();
    else response.end(content);
  } catch {
    sendJson(response, 404, { error: "Not found." });
  }
}

async function submitInquiry(request, response) {
  if (!originAllowed(request)) {
    sendJson(response, 403, { error: "This form request was rejected." });
    return;
  }
  if (!/^application\/json(?:\s*;|$)/i.test(String(request.headers["content-type"] || ""))) {
    sendJson(response, 415, { error: "Unsupported request format." });
    return;
  }
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: error.message || "Invalid request." });
    return;
  }

  // Quietly accept automated honeypot submissions without storing them.
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendJson(response, 400, { error: "Please send a valid inquiry." });
    return;
  }
  if (cleanText(body.website, 160)) {
    sendJson(response, 202, { ok: true });
    return;
  }
  if (isRateLimited(request)) {
    sendJson(response, 429, { error: "Too many inquiries from this connection. Please try again later." }, { "Retry-After": String(rateWindowMs / 1000) });
    return;
  }

  const inquiry = {
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
    name: cleanText(body.name, 100),
    email: cleanText(body.email, 254).toLowerCase(),
    company: cleanText(body.company, 120),
    message: cleanText(body.message, 2000),
    formType: cleanText(body.formType, 40) || "general",
    vehicleType: cleanText(body.vehicleType, 60),
    areaOfInterest: cleanText(body.areaOfInterest, 80),
  };
  const allowedFormTypes = new Set(["general", "vehicleconnect-pilot"]);
  const allowedVehicleTypes = new Set(["", "Motorcycle / scooter", "Passenger car", "Electric vehicle", "Commercial fleet", "Other / not decided"]);
  const allowedInterests = new Set(["", "Prototype collaboration", "Fleet pilot", "Hardware integration", "Automotive software development", "General inquiry"]);
  if (!allowedFormTypes.has(inquiry.formType)
      || (inquiry.formType === "vehicleconnect-pilot" && (!allowedVehicleTypes.has(inquiry.vehicleType) || !allowedInterests.has(inquiry.areaOfInterest) || !inquiry.vehicleType || !inquiry.areaOfInterest))) {
    sendJson(response, 400, { error: "Choose a valid vehicle type and area of interest." });
    return;
  }
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(inquiry.email);
  if (inquiry.name.length < 2 || !validEmail || inquiry.message.length < 20 || body.consent !== true) {
    sendJson(response, 400, { error: "Enter your name, a valid email, a message of at least 20 characters, and consent to store the inquiry." });
    return;
  }

  try {
    await mkdir(dataRoot, { recursive: true, mode: 0o700 });
    await chmod(dataRoot, 0o700);
    const submissionFile = path.join(dataRoot, "inquiries.jsonl");
    await appendFile(submissionFile, `${JSON.stringify(inquiry)}\n`, { encoding: "utf8", mode: 0o600, flag: "a" });
    await chmod(submissionFile, 0o600);
    sendJson(response, 201, { ok: true, id: inquiry.id });
  } catch (error) {
    console.error("Inquiry persistence failed:", error.code || "storage error");
    sendJson(response, 500, { error: "The inquiry could not be saved. Please try again later." });
  }
}

const server = createServer((request, response) => {
  setSecurityHeaders(response);
  let pathname;
  try {
    pathname = new URL(request.url || "/", "http://localhost").pathname;
  } catch {
    sendJson(response, 400, { error: "Invalid request path." });
    return;
  }
  Promise.resolve()
    .then(async () => {
      if (pathname === "/api/health" && request.method === "GET") {
        sendJson(response, 200, { ok: true, service: "setuvion-website" });
        return;
      }
      if (pathname === "/api/inquiries" && request.method === "POST") {
        await submitInquiry(request, response);
        return;
      }
      if ((request.method === "GET" || request.method === "HEAD") && staticFiles.has(pathname)) {
        await serveStatic(request, response, pathname);
        return;
      }
      sendJson(response, 404, { error: "Not found." });
    })
    .catch((error) => {
      console.error("Request handling failed:", error.code || "server error");
      if (response.headersSent) response.destroy();
      else sendJson(response, 500, { error: "The request could not be completed." });
    });
});

server.listen(port, host, () => {
  console.log(`Setuvion website listening on ${host}:${port}`);
  console.log(`Inquiry storage: ${dataRoot}`);
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
