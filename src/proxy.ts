import { NextResponse, type NextRequest } from "next/server";

const CSP_SCRIPT_STYLE = [
  "default-src 'self'",
  "script-src 'self' 'nonce-{nonce}' 'strict-dynamic'",
  "style-src 'self' 'nonce-{nonce}'",
  // Keep existing React style attributes working, without allowing inline <style> blocks.
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");

function isNonDocumentRequest(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  const accept = request.headers.get("accept");

  return /(?:^|\/)api(?:\/|$)/.test(pathname)
    || /(?:^|\/)_(?:next)(?:\/|$)/.test(pathname)
    || /(?:^|\/)favicon\.ico$/.test(pathname)
    || /\.(?:avif|css|eot|gif|ico|jpe?g|js|json|map|mp4|otf|pdf|png|svg|ttf|webmanifest|webp|woff2?)$/i.test(pathname)
    || Boolean(accept && !accept.includes("text/html"));
}

export function proxy(request: NextRequest) {
  if (isNonDocumentRequest(request)) {
    return NextResponse.next();
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = CSP_SCRIPT_STYLE.replaceAll("{nonce}", nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  // Nginx micro-cache must not reuse a response containing this request's nonce.
  response.headers.set("X-Accel-Expires", "0");

  return response;
}
