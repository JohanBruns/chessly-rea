// Die eigentliche App samt Kursinhalten (dist/app/) gibt es nur mit gültiger Anmeldung an einem Konto.
// Die Dateinamen enthalten einen Hash, der Browser darf sie also dauerhaft behalten.
import { sessionUser } from '../_lib/auth.js';

export async function onRequest({ request, env }) {
  if (!(await sessionUser(request, env))) return new Response('Nicht angemeldet', { status: 401, headers: { 'Cache-Control': 'no-store' } });

  const asset = await env.ASSETS.fetch(request);
  const response = new Response(asset.body, asset);
  response.headers.set('Cache-Control', 'private, max-age=31536000, immutable');
  return response;
}
