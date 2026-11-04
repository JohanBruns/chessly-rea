// Gilt die Anmeldung noch? Die App fragt das, wenn sie ihren geschützten Teil nicht laden konnte.
import { json, sessionUser } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const user = await sessionUser(request, env);
  return user ? json({ user }) : json({ error: 'Nicht angemeldet' }, 401);
}
