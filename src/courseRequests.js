// Kurse aus dem Chessly-Katalog hinzufügen: Die Warteschlange liegt auf dem Server und gilt für alle Konten.
const ENDPOINT = '/api/courseRequests';

export const isOpenRequest = (request) => request?.status === 'queued' || request?.status === 'running';

// Alle Aufträge als { Kurs-ID: { status, message } }
export async function fetchCourseRequests() {
  const response = await fetch(ENDPOINT, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Stand nicht ladbar (${response.status})`);
  const { requests } = await response.json();
  return Object.fromEntries(requests.map(({ id, ...request }) => [id, request]));
}

export async function addCourse(courseId) {
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId }),
    });
  } catch {
    throw new Error('Der Server ist gerade nicht erreichbar. Versuche es gleich noch einmal.');
  }
  const isJson = (response.headers.get('Content-Type') || '').includes('application/json');
  const data = isJson ? await response.json() : null;
  if (!response.ok || !data?.request) throw new Error(data?.error || 'Der Server ist gerade nicht erreichbar. Versuche es gleich noch einmal.');
  return data.request;
}
