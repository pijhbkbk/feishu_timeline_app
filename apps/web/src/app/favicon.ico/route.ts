const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#3f7cf7"/><path d="M15 22 35 12M19 34l26-14M15 46l20-10" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/></svg>`;

export function GET() {
  return new Response(favicon, {
    headers: {
      'Cache-Control': 'public, max-age=86400',
      'Content-Type': 'image/svg+xml',
    },
  });
}
