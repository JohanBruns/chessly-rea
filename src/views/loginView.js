// Anmeldeseite: Benutzername und Passwort, wahlweise neues Konto anlegen.
import { login, register } from '../account.js';
import { add, fill, h } from '../dom.js';
import { logoMark } from '../ui/icons.js';

const askAdopt = () => confirm('Auf diesem Gerät gibt es schon Lernfortschritt ohne Konto. Soll er in dieses Konto übernommen werden?');

export function renderLogin(root) {
  let creating = false;
  const form = h('form', { class: 'login-form', novalidate: true });

  function render() {
    const username = h('input', { class: 'input', name: 'username', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
    const password = h('input', { class: 'input', name: 'password', type: 'password', autocomplete: creating ? 'new-password' : 'current-password', required: true });
    const repeat = creating ? h('input', { class: 'input', name: 'repeat', type: 'password', autocomplete: 'new-password', required: true }) : null;
    const message = h('p', { class: 'feedback-msg bad login-message', role: 'alert', hidden: true });
    const submit = h('button', { class: 'btn btn-primary login-submit', type: 'submit' }, creating ? 'Konto erstellen' : 'Anmelden');

    const fail = (text) => {
      message.textContent = text;
      message.hidden = false;
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      message.hidden = true;
      if (repeat && repeat.value !== password.value) {
        fail('Die Passwörter stimmen nicht überein.');
        return;
      }
      submit.disabled = true;
      try {
        await (creating ? register : login)(username.value.trim(), password.value, askAdopt);
        location.reload();
      } catch (err) {
        fail(err instanceof TypeError ? 'Keine Verbindung zum Server. Für die Anmeldung braucht die App Internet.' : err.message);
        submit.disabled = false;
      }
    };

    fill(
      form,
      h('label', { class: 'login-field' }, h('span', {}, 'Benutzername'), username),
      h('label', { class: 'login-field' }, h('span', {}, 'Passwort'), password),
      repeat ? h('label', { class: 'login-field' }, h('span', {}, 'Passwort wiederholen'), repeat) : null,
      creating ? h('p', { class: 'muted small' }, 'Merke dir dein Passwort gut: Es lässt sich nicht per E-Mail zurücksetzen.') : null,
      message,
      submit,
      h(
        'button',
        {
          class: 'btn btn-ghost login-switch',
          type: 'button',
          onclick: () => {
            creating = !creating;
            render();
          },
        },
        creating ? 'Ich habe schon ein Konto' : 'Neues Konto erstellen',
      ),
    );
  }

  render();
  add(
    root,
    h(
      'div',
      { class: 'login-page' },
      h('section', { class: 'card login-card' }, h('div', { class: 'login-logo' }, logoMark(48)), h('h1', {}, 'Willkommen'), h('p', { class: 'muted' }, 'Melde dich an, um mit deinem eigenen Fortschritt zu trainieren.'), form),
    ),
  );
}
