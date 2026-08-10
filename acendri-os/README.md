# Acendri OS

A mobile-first app that also works properly on a desktop, with real accounts:
sign up, sign in, and **it saves your log in** — close the tab, close the
browser, restart the machine, and you come back signed in.

### Just open it

Open **`dist-standalone/AcendriOS.html`** in any browser. One self-contained
file: no install, no terminal, no server. Everything saves to your browser.

### Run from source

```
npm install
npm run acendri              # http://localhost:5174
npm run acendri:test         # accounts, sessions and crypto
npm run acendri:build        # production bundle in acendri-os/dist
npm run acendri:standalone   # regenerate dist-standalone/AcendriOS.html
```

`npm run typecheck` at the repo root covers this package too.

## What works

Every button on every screen does something. That is checked, not asserted —
see [Testing](#testing).

**Accounts**

- **Sign up** with a name, email and password. Each field is validated as you
  go: real email shape, minimum length, a strength meter that scores length and
  variety rather than counting symbols, and a live "that email is already
  taken" as you type it.
- **Sign in** with the same details, case-insensitive on the email.
- **Stay signed in.** On by default. A remembered session lives for 30 days and
  is renewed every time you open the app, so weekly use never signs you out and
  a device left alone for a month does. Turn it off and the session lasts until
  the tab closes — a reload still keeps you in.
- **Several accounts on one device.** The welcome screen lists them, most
  recent first, and you can switch between them.
- **Password recovery** without a server: set a question under Security, answer
  it to choose a new password. An account with no question set says so plainly
  rather than pretending to send an email.
- **Change your password**, which reissues the session token so the old one
  stops working.
- **Delete your account**, password-confirmed and type-to-confirm, which takes
  its notes, tasks and settings with it.

**The app**

- **Home** — greeting, three counts that are really counted, and today's list:
  add, tick, rename, delete, clear finished.
- **Notes** — create, write, search, pin, delete. The editor saves as you type,
  saves again on the way out, and saves when the phone backgrounds the tab. A
  note left completely blank is discarded rather than left as clutter.
- **You** — rename yourself, pick an avatar, see when the account was made and
  when it last signed in, sign out, switch account.
- **Settings** — dark / light / follow-the-system, six accents, reduce motion,
  interface sounds, and an erase-everything button behind a typed confirmation.
- **Security** — password, recovery question, delete account.

**The shape of it**

One set of markup, two layouts. Under 900px it is a phone: title bar, scrolling
body, tab bar sitting clear of the notch and the home indicator. Above 900px the
tab bar becomes a rail down the left and the content takes a readable column, so
a desktop window is not a stretched phone.

Every navigation is a real history entry, so the Android back gesture, the
browser back button and the in-app back arrow are the same thing.

## How the sign-in is stored

Passwords are never stored. What lands on disk is a per-account salt, an
iteration count and a derived key:

```
PBKDF2-HMAC-SHA-256, 16-byte random salt, 32-byte key
```

WebCrypto does the work at **210,000 iterations** wherever it is available.
It is only available in a secure context, and a `file://` document is not a
secure context in every browser — so the single-file build carries its own
SHA-256 and PBKDF2 and runs **25,000 iterations** instead. The iteration count
is stored *with each record*, so an account created against one backend still
opens against the other. Both are held against the reference implementations in
the test suite.

The session itself is an opaque random token with an absolute expiry, checked
against the account list on every read — a token pointing at a deleted account
is not a session. "Keep me signed in" chooses which store it lives in:

| Setting | Store | Survives a reload | Survives a restart |
| --- | --- | --- | --- |
| On (default) | `localStorage`, 30 days | yes | yes |
| Off | `sessionStorage` | yes | no |

Five wrong passwords pause that address for 30 seconds, counted down in the
button rather than left as a dead form. An unknown address does the same work
and returns the same message as a wrong password, so the form cannot be used to
find out which addresses have accounts.

Nothing here talks to a server. There are no network requests at all — no
analytics, no sync, no account service. The shapes are the ones a server would
use later, so adding one is additive rather than a rewrite.

## Storage

Everything is namespaced under `acendri.os.v1.*`, so the app can share an origin
with something else without either side standing on the other.

Storage that is missing is handled rather than fatal: Safari private browsing
and some embedded webviews either hide `localStorage` or throw on first write,
and there the app runs for the session on an in-memory store and Settings says
so. A record that will not parse costs you that record, not the device — one
mangled account does not lock out the others.

## Testing

```
npm run acendri:test
```

38 tests over the parts that would be quiet if they broke:

- SHA-256 against the published FIPS-180-4 vectors, plus the input lengths that
  straddle a block boundary, where padding bugs hide.
- The hand-written PBKDF2 against Node's native one, byte for byte, including
  a key longer than the HMAC block size and a unicode password.
- A record hashed on the fallback backend verifying against the native one.
- Sign up, sign in, wrong password, duplicate email, case handling.
- Reload, tab close and restart, for both remember-me settings.
- Expired sessions, sessions pointing at deleted accounts, the lockout.
- Password change, recovery, deletion, preferences.
- A corrupted account list and a single unreadable account.

The browser flows are driven end to end with Playwright — 41 checks covering
every screen, including that each button on each screen has a handler bound,
that a deep link to a private route while signed out lands on Welcome, and that
the single file works from `file://` both with WebCrypto and with it removed.
