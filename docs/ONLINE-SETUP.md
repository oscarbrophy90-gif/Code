# Making it online

Online play needs **one server both players can reach**. That is the whole
problem — a file on your computer cannot find a file on your friend's computer,
so something in the middle has to introduce them.

Everything below is about getting that one server somewhere reachable and
pointing both copies of the game at it.

---

## Fastest: two windows on your own machine

Not really online, but it proves the whole thing works before you host anything.

```bash
npm install
npm run server
```

Open `dist-standalone/HoopsElite.html` in two windows. Make a player in each,
go to **Parks → Downtown**, and click **King of the Court** in both. They will
find each other.

This works with no configuration because a build with no server address baked in
falls back to `ws://localhost:8787`.

---

## Someone else on your wifi

Run the server as above, find your machine's address on the network
(`ipconfig` on Windows, `ifconfig` or `ip addr` on Mac/Linux — the one that looks
like `192.168.x.x`), then build a copy for them:

```bash
npm run build:online 192.168.1.20:8787
```

Send them `dist-standalone/HoopsElite.html`. It already knows where to look.

Your machine has to stay on and awake, and its firewall has to allow port 8787.

---

## Anyone, anywhere

This needs the server hosted somewhere with a public address. There is a
`Dockerfile` in the repo and configs for three hosts; any of them works.

### Fly.io

```bash
fly launch --copy-config --no-deploy   # pick a name — it must be unique on Fly
fly deploy
```

Fly gives you `https://your-name.fly.dev`. The game wants the websocket form:

```bash
npm run build:online wss://your-name.fly.dev
```

`fly.toml` keeps one machine running rather than scaling to zero. A game server
that sleeps drops everyone mid-match and makes the next player wait for a cold
start.

### Render

Point Render at the repo; it reads `render.yaml`. You get
`https://your-name.onrender.com`, so:

```bash
npm run build:online wss://your-name.onrender.com
```

Render's free tier sleeps when idle. Fine for playing friends when you have
arranged it; not fine for a server that is meant to be there all the time.

### Railway

Point Railway at the repo; it reads `railway.json`. Same pattern for the URL.

---

## Handing the game to someone else

```bash
npm run build:online wss://your-server.fly.dev
```

That bakes the address into `dist-standalone/HoopsElite.html`. Send that one file
and they can play you without being told to configure anything.

The script checks the address answers before it builds, and says so loudly if it
does not — a typo'd address and a server nobody is on look identical from inside
the game, and you would rather find out at build time.

If you skip the bake, each player has to set it themselves in
**Settings → Online play → Server address**. **Test connection** there tells
them whether nothing is listening, the server is down, or the versions disagree.

---

## Checking it is actually up

```bash
curl https://your-server.fly.dev/health
```

```json
{"ok":true,"version":2,"sessions":2,"queued":1,"rooms":1,"courts":{"downtown:kotc":1}}
```

`courts` is who is waiting where, keyed by park and court. If your friend says
they are searching and that object is empty, they are not reaching this server.

| Field | Means |
| --- | --- |
| `sessions` | connected players |
| `queued` | waiting for a game |
| `rooms` | matches being played right now |
| `courts` | who is waiting on which court |

---

## When it does not work

| What you see | Usually |
| --- | --- |
| "Nothing is listening on ws://…" | Server not running, or wrong port |
| "No answer from …" | Address reachable but nothing answered — firewall, or wrong host |
| "Server speaks v1, this build speaks v2" | One side is an old build; rebuild both |
| Both searching forever, `courts` shows one of you | You are on different courts or different parks — the match is by both |
| Searching forever, `sessions` is 0 | Neither of you is reaching the server at all |
| Both searching, each screen says "1 connected" | **The usual one.** You are on two different servers. `localhost` means *your own machine* on each laptop, so two people who both leave it at the default are each alone on their own server. One of you runs the server; both of you point at that one machine's address. |

The waiting screen shows the address it is using and how many players are on it,
for exactly this reason. If your friend is definitely searching and your screen
still says one connected, the address is the thing to check — not the court.

A page served over **https** can only open a **wss://** socket, never `ws://`.
The standalone file has no such restriction because it is not on a web page.

---

## What it costs

The server holds one websocket per player and runs the match simulation, which
is small — 256 MB is plenty for a handful of concurrent games. Fly's smallest
shared machine and Render's free tier both handle it. The traffic is a few
kilobytes per second per match.

## Keeping ranks between restarts

Results are written to `db.json` in the server's data directory. Set where that
is with `HOOPS_DATA_DIR`; it defaults to `server/data`, which is fine when you
run the server yourself and wrong inside a container, whose own filesystem is
replaced on every deploy.

```bash
HOOPS_DATA_DIR=/data npm run server
```

`fly.toml` mounts a volume at `/data` and sets the variable. Create it once:

```bash
fly volumes create hoops_data --size 1
```

Render's free tier has no persistent disk at all, so records reset there on
every redeploy; `render.yaml` has the disk block commented out for when you move
to a paid instance.

The file is written by rename, so a crash mid-write cannot leave a half-written
database, and the previous version is kept as `db.json.bak`. If the live file is
ever unreadable the server falls back to that backup, keeps the damaged file
next to it, and says so in the log rather than starting from an empty ladder.

Backing up is copying one file:

```bash
fly ssh console -C "cat /data/db.json" > backup.json
```

This is a JSON file, not a database, and it is loaded into memory whole. That is
the right shape for a few thousand accounts and the wrong one for a few hundred
thousand — `docs/DATABASE.md` has the Postgres schema for when it matters.
