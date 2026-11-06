// Anmeldeseite: anmelden, neues Konto mit Einladungscode anlegen, Passwort-Link anfordern oder über den Link ein neues Passwort setzen.
import { login, register, requestPasswordReset, resetPassword } from '../account.js';
import { add, fill, h } from '../dom.js';
import { logoMark } from '../ui/icons.js';

const askAdopt = () => confirm('Auf diesem Gerät gibt es schon Lernfortschritt ohne Konto. Soll er in dieses Konto übernommen werden?');

const WELCOME = 'Melde dich an, um mit deinem eigenen Fortschritt zu trainieren.';
const MODES = {
  login: { title: 'Willkommen', intro: WELCOME, submit: 'Anmelden' },
  create: { title: 'Willkommen', intro: WELCOME, submit: 'Konto erstellen' },
  forgot: { title: 'Passwort vergessen', intro: 'Der Link zum Zurücksetzen geht per E-Mail an den Admin dieser App und gilt 24 Stunden.', submit: 'Link anfordern' },
  reset: { title: 'Neues Passwort', intro: 'Danach bist du hier angemeldet und auf allen anderen Geräten abgemeldet.', submit: 'Passwort speichern' },
};

// Der Link aus der Mail: Der Wert steht hinter dem #, geht also nicht an den Server und in keine Logs
export function resetTokenFromHash(hash = location.hash) {
  return /^#\/passwort-neu\?token=([0-9a-f]+)$/.exec(hash)?.[1] ?? null;
}

// Den Link aus Adresszeile und Verlauf entfernen
const clearResetLink = () => history.replaceState(null, '', location.pathname);

export function renderLogin(root, resetToken = null) {
  let mode = resetToken ? 'reset' : 'login';
  const title = h('h1');
  const intro = h('p', { class: 'muted' });
  const form = h('form', { class: 'login-form', novalidate: true });

  const switchTo = (next) => {
    mode = next;
    render();
  };

  function render() {
    const { title: titleText, intro: introText, submit: submitText } = MODES[mode];
    title.textContent = titleText;
    intro.textContent = introText;

    const newPassword = mode === 'create' || mode === 'reset';
    const inviteCode = mode === 'create' ? h('input', { class: 'input', name: 'inviteCode', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', required: true }) : null;
    const username = mode === 'reset' ? null : h('input', { class: 'input', name: 'username', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
    const password = mode === 'forgot' ? null : h('input', { class: 'input', name: 'password', type: 'password', autocomplete: newPassword ? 'new-password' : 'current-password', required: true });
    const repeat = newPassword ? h('input', { class: 'input', name: 'repeat', type: 'password', autocomplete: 'new-password', required: true }) : null;
    const message = h('p', { class: 'feedback-msg bad login-message', role: 'alert', hidden: true });
    const sent = h('p', { class: 'feedback-msg good login-message', role: 'status', hidden: true });
    const submit = h('button', { class: 'btn btn-primary login-submit', type: 'submit' }, submitText);

    const fail = (text) => {
      message.textContent = text;
      message.hidden = false;
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      message.hidden = true;
      sent.hidden = true;
      if (repeat && repeat.value !== password.value) {
        fail('Die Passwörter stimmen nicht überein.');
        return;
      }
      if (mode === 'forgot' && !username.value.trim()) {
        fail('Gib deinen Benutzernamen ein.');
        return;
      }
      submit.disabled = true;
      try {
        if (mode === 'forgot') {
          await requestPasswordReset(username.value.trim());
          // Gleiche Antwort für jeden Namen: Die Seite verrät nicht, ob es das Konto gibt
          sent.textContent = 'Wenn es dieses Konto gibt, ist der Link jetzt per E-Mail zum Admin unterwegs. Pro Stunde geht höchstens eine Mail raus.';
          sent.hidden = false;
          submit.disabled = false;
          return;
        }
        if (mode === 'create') await register(username.value.trim(), password.value, inviteCode.value, askAdopt);
        else if (mode === 'login') await login(username.value.trim(), password.value, askAdopt);
        else {
          await resetPassword(resetToken, password.value, askAdopt);
          clearResetLink();
        }
        location.reload();
      } catch (err) {
        fail(err instanceof TypeError ? 'Keine Verbindung zum Server. Für die Anmeldung braucht die App Internet.' : err.message);
        submit.disabled = false;
      }
    };

    const switchButton = (label, onclick) => h('button', { class: 'btn btn-ghost login-switch', type: 'button', onclick }, label);

    fill(
      form,
      inviteCode ? h('label', { class: 'login-field' }, h('span', {}, 'Einladungscode'), inviteCode) : null,
      username ? h('label', { class: 'login-field' }, h('span', {}, 'Benutzername'), username) : null,
      password ? h('label', { class: 'login-field' }, h('span', {}, mode === 'reset' ? 'Neues Passwort' : 'Passwort'), password) : null,
      repeat ? h('label', { class: 'login-field' }, h('span', {}, 'Passwort wiederholen'), repeat) : null,
      message,
      sent,
      submit,
      mode === 'login' ? switchButton('Passwort vergessen?', () => switchTo('forgot')) : null,
      mode === 'login' ? switchButton('Neues Konto erstellen', () => switchTo('create')) : null,
      mode === 'create' ? switchButton('Ich habe schon ein Konto', () => switchTo('login')) : null,
      mode === 'forgot' ? switchButton('Zurück zur Anmeldung', () => switchTo('login')) : null,
      mode === 'reset'
        ? switchButton('Zur Anmeldung', () => {
            clearResetLink();
            switchTo('login');
          })
        : null,
    );
  }

  render();
  add(root, h('div', { class: 'login-page' }, h('section', { class: 'card login-card' }, h('div', { class: 'login-logo' }, logoMark(48)), title, intro, form)));
}
