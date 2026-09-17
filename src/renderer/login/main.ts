import { t, type Locale } from '@shared/i18n';

const emailPrompt = document.getElementById('email-prompt') as HTMLParagraphElement;
const emailForm = document.getElementById('email-form') as HTMLFormElement;
const emailInput = document.getElementById('email') as HTMLInputElement;
const emailError = document.getElementById('email-error') as HTMLParagraphElement;
const emailContinueButton = document.getElementById('email-continue') as HTMLButtonElement;
const emailCancelButton = document.getElementById('email-cancel') as HTMLButtonElement;

const codePrompt = document.getElementById('code-prompt') as HTMLParagraphElement;
const codeForm = document.getElementById('code-form') as HTMLFormElement;
const codeInput = document.getElementById('code') as HTMLInputElement;
const codeError = document.getElementById('code-error') as HTMLParagraphElement;
const codeSigninButton = document.getElementById('code-signin') as HTMLButtonElement;
const codeCancelButton = document.getElementById('code-cancel') as HTMLButtonElement;

const nicknamePrompt = document.getElementById('nickname-prompt') as HTMLParagraphElement;
const nicknameForm = document.getElementById('nickname-form') as HTMLFormElement;
const nicknameInput = document.getElementById('nickname') as HTMLInputElement;
const nicknameError = document.getElementById('nickname-error') as HTMLParagraphElement;
const nicknameFinishButton = document.getElementById('nickname-finish') as HTMLButtonElement;
const nicknameCancelButton = document.getElementById('nickname-cancel') as HTMLButtonElement;

let email = '';
let locale: Locale = 'en';

void window.pulsar.getLocale().then((detected) => {
  locale = detected;
  emailPrompt.textContent = t('loginEmailPrompt', locale);
  emailInput.placeholder = t('loginEmailPlaceholder', locale);
  emailCancelButton.textContent = t('loginCancel', locale);
  emailContinueButton.textContent = t('loginContinue', locale);
  codePrompt.textContent = t('loginCodePrompt', locale);
  codeInput.placeholder = t('loginCodePlaceholder', locale);
  codeCancelButton.textContent = t('loginCancel', locale);
  codeSigninButton.textContent = t('loginSignIn', locale);
  nicknamePrompt.textContent = t('loginNicknamePrompt', locale);
  nicknameInput.placeholder = t('loginNicknamePlaceholder', locale);
  nicknameCancelButton.textContent = t('loginCancel', locale);
  nicknameFinishButton.textContent = t('loginFinish', locale);
});

emailForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = emailInput.value.trim();
  if (!value) return;

  emailError.textContent = '';
  emailContinueButton.disabled = true;
  window.pulsar
    .sendLoginCode(value)
    .then((result) => {
      emailContinueButton.disabled = false;
      if (!result.ok) {
        emailError.textContent = result.error;
        return;
      }
      email = value;
      emailForm.hidden = true;
      codeForm.hidden = false;
      codeInput.focus();
    })
    .catch(() => {
      emailContinueButton.disabled = false;
      emailError.textContent = t('errorSomethingWrong', locale);
    });
});

codeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = codeInput.value.trim();
  if (!value) return;

  codeError.textContent = '';
  codeSigninButton.disabled = true;
  window.pulsar
    .verifyLoginCode(email, value)
    .then((result) => {
      codeSigninButton.disabled = false;
      if (!result.ok) {
        codeError.textContent = result.error;
        return;
      }
      codeForm.hidden = true;
      nicknameForm.hidden = false;
      nicknameInput.focus();
    })
    .catch(() => {
      codeSigninButton.disabled = false;
      codeError.textContent = t('errorSomethingWrong', locale);
    });
});

nicknameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = nicknameInput.value.trim();
  if (!value) return;

  nicknameError.textContent = '';
  nicknameFinishButton.disabled = true;
  window.pulsar
    .resolveCosmoNickname(email, value)
    .then((result) => {
      nicknameFinishButton.disabled = false;
      if (!result.ok) {
        nicknameError.textContent = result.error;
        return;
      }
      // Success closes the window from the main process (see login-window.ts).
    })
    .catch(() => {
      nicknameFinishButton.disabled = false;
      nicknameError.textContent = t('errorSomethingWrong', locale);
    });
});

emailCancelButton.addEventListener('click', () => {
  window.pulsar.cancelLogin();
});

codeCancelButton.addEventListener('click', () => {
  window.pulsar.cancelLogin();
});

nicknameCancelButton.addEventListener('click', () => {
  window.pulsar.cancelLogin();
});
