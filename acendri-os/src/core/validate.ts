/**
 * Field rules, kept away from the screens that draw them.
 *
 * Each check returns either null (fine) or the sentence to show under the
 * field. Sentences, not codes: the form has nothing to translate and nothing to
 * decide, so sign-up and settings cannot drift into saying different things
 * about the same rule.
 */

export type FieldError = string | null;

/**
 * Deliberately not RFC 5322. That grammar accepts addresses no mail server will
 * take and rejecting a real address is far worse than accepting a typo, so this
 * checks the shape a person would recognise and leaves the rest to delivery.
 */
const EMAIL = /^[^\s@,;:<>()[\]\\"]+@[^\s@.]+(\.[^\s@.]+)+$/;

export const NAME_MAX = 32;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Lower-cased and trimmed. Two people cannot hold the same address. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function checkName(raw: string): FieldError {
  const name = raw.trim();
  if (!name) return 'Tell us what to call you.';
  if (name.length < 2) return 'That is a little short — two characters or more.';
  if (name.length > NAME_MAX) return `Keep it to ${NAME_MAX} characters or fewer.`;
  return null;
}

export function checkEmail(raw: string): FieldError {
  const email = raw.trim();
  if (!email) return 'Enter your email address.';
  if (email.length > 254) return 'That address is too long.';
  if (!EMAIL.test(email)) return 'That does not look like an email address.';
  return null;
}

export function checkPassword(password: string): FieldError {
  if (!password) return 'Choose a password.';
  if (password.length < PASSWORD_MIN) return `At least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `At most ${PASSWORD_MAX} characters.`;
  if (/^\s|\s$/.test(password)) return 'No spaces at the start or end.';
  return null;
}

export function checkConfirm(password: string, confirm: string): FieldError {
  if (!confirm) return 'Type your password again.';
  if (password !== confirm) return 'Those two do not match.';
  return null;
}

/** The handful of passwords that turn up in every leaked-credential list. */
const OBVIOUS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  'qwertyui',
  'qwerty123',
  'letmein1',
  'iloveyou',
  'welcome1',
  'admin123',
  'abc12345',
  'football',
  'baseball',
  'sunshine',
  'princess',
]);

export type Strength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  /** Advice for the one change that would help most, or null when it is strong. */
  hint: string | null;
};

/**
 * Scores variety and length rather than counting character classes, because a
 * long passphrase beats `P@ss1!` and a class-counting meter says the opposite.
 */
export function passwordStrength(password: string): Strength {
  if (!password) return { score: 0, label: 'Empty', hint: null };

  const lower = password.toLowerCase();
  if (OBVIOUS.has(lower)) {
    return { score: 0, label: 'Too common', hint: 'That one is on every guessing list.' };
  }

  const classes =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));
  const unique = new Set(password).size;

  let points = 0;
  if (password.length >= 8) points += 1;
  if (password.length >= 12) points += 1;
  if (password.length >= 16) points += 1;
  if (classes >= 2) points += 1;
  if (classes >= 3) points += 1;
  if (unique >= 8) points += 1;

  // A single repeated character or a straight run is length without entropy.
  if (/^(.)\1+$/.test(password)) points = 0;
  if (/^(?:0123456789|abcdefghij|qwertyuiop)/.test(lower)) points = Math.min(points, 1);

  const score = Math.max(0, Math.min(4, points - 1)) as Strength['score'];
  const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'] as const;

  let hint: string | null = null;
  if (password.length < 12) hint = 'Longer is the easiest win — try a short phrase.';
  else if (classes < 2) hint = 'Mix in a capital or a number.';
  else if (unique < 8) hint = 'Too much repetition.';

  return { score, label: labels[score], hint: score >= 3 ? null : hint };
}
