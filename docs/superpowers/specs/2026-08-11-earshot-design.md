# Earshot — Design

*Live audio rooms, running as an embedded app inside MeWe.*

**Date:** 2026-08-11
**Status:** Approved design, pre-implementation
**Scope:** A Twitter/X Spaces clone running as an embedded app inside MeWe.

---

## 1. Purpose and scale

A live audio room product: one host, a handful of speakers, listeners who can request the
microphone. Modeled on X Spaces.

**This is a prototype at ~10 participants per room.** It is not intended for public production
traffic. That single fact removes bandwidth engineering, self-hosted media servers, redundancy,
and paid infrastructure from the design. Every service used has a free tier that comfortably
covers this scale.

Security and authorization are *not* scaled down. They are cheap to write correctly now and
expensive to retrofit, and they are the part of a Spaces clone that is actually judged.

### Success criteria

1. A host can start a room from inside MeWe and be heard.
2. A listener can join, request the microphone, be promoted, and speak.
3. A host can mute and remove a disruptive user; a removed user cannot rejoin.
4. Roles survive a page refresh.
5. Audio keeps playing when the app is minimized inside MeWe.

---

## 2. Platform context

The app runs **in an iframe inside MeWe**, communicating with the host page over `postMessage`.

### Message protocol (from MeWe docs)

| Message | Direction | Payload |
|---|---|---|
| `CLIENT_HANDSHAKE_REQUEST` | app → MeWe | — |
| `HOST_HANDSHAKE_RESPONSE` | MeWe → app | `loginRequestToken`, `meweHost` |
| `CLIENT_DISPLAY_REQUEST` | app → MeWe | — |
| `HOST_DISPLAY_RESPONSE` | MeWe → app | `width`, `height`, `availableWidth`, `viewportHeight`, `isMinimized`, `isPaused` |
| `CLIENT_DISPLAY_UPDATE` | app → MeWe | `width?`, `height?` |
| `HOST_APP_PAUSED` / `HOST_APP_RESUMED` | MeWe → app | — |
| `HOST_APP_MINIMIZED` / `HOST_APP_MAXIMIZED` | MeWe → app | — |
| `HOST_APP_CLOSED` | MeWe → app | — |

### Lifecycle semantics that matter

- **`HOST_APP_PAUSED` does not suspend the app.** It fires when a close-confirmation dialog is
  shown. The iframe stays loaded and resumes. Audio must **not** be stopped on this message.
- **`HOST_APP_MINIMIZED` is the background-listening feature.** MeWe supports a
  minimized-but-running state. On minimize the app renders a compact now-playing view and
  **keeps audio running**. This is the X Spaces minimized bar, provided by the platform.
- **`HOST_APP_CLOSED` means teardown.** Disconnect from the media server and release the
  microphone here.

### Assumption: MeWe grants microphone access to the iframe

`microphone`, `camera`, and `geolocation` share a default Permissions-Policy allowlist of
`self`, so a cross-origin iframe cannot use them unless the parent sets an `allow` attribute.
MeWe's documentation does not state whether `allow="microphone"` is set.

**Decision (2026-08-11): build as though MeWe grants it.** This is a deliberate assumption, not
a verified fact. It removes the blocking gate and lets implementation start immediately.

Two consequences worth stating precisely:

1. **The standalone-window fallback is out of v1 scope.** The `mewe/` module implements only the
   embedded `postMessage` handshake; the standalone redirect flow is not built. If the
   assumption turns out wrong, that flow is the contingency — see §12 for what it would involve.
2. **Per-user microphone denial is a separate matter and is still handled.** MeWe granting the
   iframe permission only makes the microphone *available*; each user still faces the browser's
   own permission prompt and may deny it, or have no input device at all. That path is common,
   not exceptional, and the `mic-blocked` state in §14 exists for it regardless of this
   assumption.

---

## 3. Step 1 — handshake and microphone smoke test

Formerly a blocking spike. Following the decision in §2, this is now simply the **first
implementation step** rather than a gate: it is the thinnest useful slice, and it happens to
confirm the assumption as a side effect.

A minimal page, embedded in MeWe, that:

1. Performs the `postMessage` handshake and exchanges `loginRequestToken` for an `apiToken`.
2. Calls `navigator.mediaDevices.getUserMedia({ audio: true })` and reports the exact error name
   on failure — `NotAllowedError` (policy or user denial) versus `NotFoundError` (no device).
3. Logs which lifecycle messages arrive and in what order.
4. Confirms audio continues across `HOST_APP_MINIMIZED`.

Build it first because everything downstream depends on the handshake working. If (2) fails with
a policy block rather than a user denial, the §2 assumption was wrong and the contingency in §12
applies — but work is not held up waiting for that answer.

---

## 4. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript | One language across client and server; the media SDK's primary target |
| Framework | Next.js (App Router) | Route handlers serve as the backend; no separate API service |
| Media | LiveKit Cloud (free tier) | SFU with TURN included; self-hostable later via a URL change |
| Live UI | `@livekit/components-react` | Speaker grid, speaking indicators, and audio element lifecycle are prebuilt and vendor-maintained |
| Database | Neon Postgres (free tier) | Plain Postgres; the schema is four small tables |
| Schema/migrations | Drizzle | Typed schema with migrations, minimal runtime |
| Session | `iron-session` | Encrypted httpOnly cookie |
| Styling | Tailwind | Ships with Next.js |
| Hosting | Vercel (free) | Non-commercial prototype; within Hobby plan terms |

**Captions** use the browser's Web Speech API on each speaker's own device, publishing
transcript text over the LiveKit data channel. This costs nothing, preserves per-speaker
attribution, and eliminates a server-side transcription worker entirely. It is Chrome/Edge
only; unsupported browsers simply show no captions. Chrome routes this audio through Google's
servers, which requires a visible disclosure in the UI.

---

## 5. Authentication

MeWe is the sole identity provider. There are no local accounts and no passwords.

```
iframe loads
  → CLIENT_HANDSHAKE_REQUEST
  → HOST_HANDSHAKE_RESPONSE { loginRequestToken, meweHost }
  → POST /api/session  { loginRequestToken }
      server: GET {meweHost}/api/dev/token?loginRequestToken=...
              headers: X-App-Id, X-Api-Key
           → { apiToken, expiresAt }
      server: fetch profile, upsert users row
      server: set encrypted httpOnly session cookie
```

**Constraints this design respects:**

- MeWe requires all API calls to originate from the backend. `X-App-Id` and `X-Api-Key` are
  server-only environment variables and never reach the browser.
- The `apiToken` is stored in the encrypted session cookie, never exposed to client JavaScript.
- **MeWe issues no refresh tokens.** On expiry the entire flow must be repeated.

**Consequence — token lifetimes are deliberately decoupled.** The MeWe token is consumed only
at session establishment and room join. The LiveKit token, whose lifetime we control, governs
room membership. A MeWe token expiring mid-room therefore cannot eject a live participant.

`postMessage` handlers must verify `event.origin` against the expected MeWe origin. Unverified
origins are ignored.

---

## 6. Roles and authorization

Four roles, ranked:

| Role | Rank | Notes |
|---|---|---|
| `host` | 3 | |
| `cohost` | 2 | |
| `speaker` | 1 | |
| `invited` | 0 | A listener holding a standing invitation to the stage. Same privileges as a listener — it exists so `speaker_policy = invited` has a list to check. Does **not** grant `publishAudio`. |
| `listener` | 0 | Default. No database row. |

### Capability matrix

Defined as a typed constant in code, **not** as database rows. There are five fixed roles and
about ten fixed actions, none of which change at runtime; a database-backed permission system
would add a join to every authorization check in exchange for flexibility that will never be
used.

```ts
const RANK = {
  host: 3, cohost: 2, speaker: 1, invited: 0, listener: 0,
} as const;

const CAN = {
  endRoom:        ['host'],
  editSettings:   ['host'],
  promote:        ['host', 'cohost'],
  demote:         ['host', 'cohost'],
  mute:           ['host', 'cohost'],
  removeOrBan:    ['host', 'cohost'],
  inviteSpeaker:  ['host', 'cohost'],
  publishAudio:   ['host', 'cohost', 'speaker'],
  chatAndReact:   ['host', 'cohost', 'speaker', 'invited', 'listener'],
  requestToSpeak: ['speaker', 'invited', 'listener'],   // gated by speaker_policy
} as const;
```

`requestToSpeak` is additionally filtered by the room's `speaker_policy`: under `everyone`,
any listener may request; under `invited`, only roles present in `room_members` may.

Because `invited` and `listener` share rank 0, the rank rule also prevents an invited user from
moderating a plain listener — neither outranks the other.

### Rank rule

Capability alone is insufficient. A co-host has `removeOrBan`, and without a further constraint
could ban the host and seize the room. Every action targeting another user additionally requires:

```
RANK[actor.role] > RANK[target.role]
```

Co-hosts may therefore moderate speakers and listeners, but never the host and never each other.

### Single source of truth for media permissions

The same role derives the LiveKit grant:

```ts
canPublish = RANK[role] >= RANK.speaker
```

Database authorization and media-server permissions are computed from one value and cannot drift.

### Global invariant — remote unmute is impossible

**No role, including host, may unmute another user.** A host may mute a speaker; only that
speaker may unmute themselves. Newly promoted speakers arrive muted.

This is deliberately absent from the capability matrix so that it cannot be granted by adding a
role or editing a table. It is enforced by unconditional rejection in the route handler. The
media server's API is capable of remote unmute; this application must never call it.

---

## 7. Data model

Four tables. All ephemeral state — presence, hand-raises, chat, reactions, speaking indicators,
mute state — lives in LiveKit and is never persisted.

```
users
  id             text primary key        -- MeWe user id
  display_name   text not null
  avatar_url     text
  last_seen_at   timestamptz

rooms
  id             uuid primary key
  title          text not null
  topics         text[]                  -- max 3
  status         enum(scheduled|live|ended)
  speaker_policy enum(everyone|invited)
  scheduled_for  timestamptz
  started_at     timestamptz
  ended_at       timestamptz
  peak_listeners integer default 0
  livekit_room   text not null unique

room_members
  room_id        uuid references rooms(id) on delete cascade
  user_id        text references users(id)
  role           enum(host|cohost|speaker|invited)
  granted_by     text references users(id)
  created_at     timestamptz
  unique (room_id, user_id)
  -- exactly one host per room:
  -- create unique index on room_members (room_id) where role = 'host'

room_bans
  room_id        uuid references rooms(id) on delete cascade
  user_id        text references users(id)
  banned_by      text references users(id)
  created_at     timestamptz
  unique (room_id, user_id)
```

### Why `room_members` must exist

Media permissions come from the token. `updateParticipant` alters a *live* session only; once
that session ends the grant is gone. Without a durable role row, a promoted speaker who
refreshes the page would be issued a fresh listener token and **silently demoted mid-conversation**,
with no error surfaced. The table exists to survive reconnect — not for presence or analytics.

### Why `room_bans` is separate

It is the security check. A single-purpose table keeps that query unambiguous, rather than
depending on an enum filter where one typo would silently grant access.

### Why listeners are not stored

At any scale, listener rows churn constantly and buy nothing. `peak_listeners`, maintained from
signed webhooks, covers the only value they offered.

---

## 8. Modules

Deliberately isolated, each independently understandable:

| Module | Responsibility | Depends on |
|---|---|---|
| `mewe/` | The only code aware MeWe exists: origin-checked postMessage handshake, token exchange, session cookie, lifecycle events. Exposes `getCurrentUser()`. | MeWe API |
| `auth/` | Role resolution, capability matrix, rank comparison. Pure functions. | database |
| `rooms/` | Room lifecycle in Postgres: create, schedule, start, end, membership, bans. | database, `auth/` |
| `livekit/` | Token minting, permission updates, signed webhook receiver. | `rooms/`, `auth/` |
| `web/` | Next.js UI. Directory, room view, moderation controls. See §14. | all |

`auth/` being pure functions over a role is what makes the invariants directly testable without
a database or a media server.

Confining MeWe knowledge to one module is also what makes the standalone-window fallback cheap
if the microphone spike fails.

---

## 9. Key flows

### Join

```
client → POST /api/rooms/:id/join
  server: verify session
  server: reject if banned                      (403)
  server: reject if room status = ended         (410)
  server: role = room_members lookup ?? 'listener'
  server: mint LiveKit token
            identity  = MeWe user id
            canPublish = RANK[role] >= RANK.speaker
            canSubscribe = true
  → client connects with that token
```

Using the MeWe user id as the LiveKit identity means a second tab displaces the first,
preventing ghost participants.

### Raise hand → promote

```
listener: set participant metadata { handRaised: true }   -- ephemeral, no server call
host UI:  renders request queue from participant metadata
host:     POST /api/rooms/:id/promote { userId }
  server: verify CAN.promote[actor.role] && RANK[actor] > RANK[target]
  server: reject if speaker count >= 10          (409)
  server: upsert room_members role='speaker'     -- database FIRST
  server: livekit.updateParticipant(canPublish: true)
  → that client's microphone unlocks, still muted
```

The database write precedes the media-server call deliberately. A crash between the two leaves
a speaker whose role is recorded and who reconnects correctly — the recoverable failure. The
reverse order would produce a speaker no record knows about.

### Mute (and the absence of unmute)

```
host: POST /api/rooms/:id/mute { userId }
  server: verify capability + rank
  server: livekit.mutePublishedTrack(muted: true)
```

There is no unmute endpoint. Speakers unmute themselves client-side.

### Remove / ban

```
host: POST /api/rooms/:id/ban { userId }
  server: verify capability + rank
  server: insert room_bans
  server: delete room_members row
  server: livekit.removeParticipant()
```

Rejoin is blocked at token mint, not in the UI.

### Host disconnect

Driven by the signed `participant_left` webhook:

```
if leaver.role == 'host':
    start 60s grace timer
    on expiry, if host still absent:
        if a cohost exists: promote highest-ranked cohost to host   (single UPDATE)
        else:               set room status = ended
```

The grace period exists so a brief network drop does not end everyone's room.

### Minimize

```
on HOST_APP_MINIMIZED  → compact now-playing view; audio continues
on HOST_APP_PAUSED     → pause animations/timers only; audio continues
on HOST_APP_CLOSED     → disconnect room, release microphone
```

---

## 10. Error handling and edge cases

| Case | Handling |
|---|---|
| Banned user attempts join | 403 at token mint |
| Room already ended | 410 at token mint |
| Promote beyond 10 speakers | 409 with explicit message |
| Non-host attempts moderation | 403; never enforced in UI alone |
| Co-host targets host | 403 via rank rule |
| Same user, two tabs | Second connection displaces the first (shared identity) |
| Microphone permission denied | Distinct UI state, not a silently dead microphone |
| Forged webhook | Signature verified; unsigned requests rejected |
| MeWe token expires mid-room | No effect; LiveKit token governs the session |
| Unsupported browser for captions | Captions hidden; audio unaffected |
| `postMessage` from unknown origin | Ignored |

---

## 11. Testing

Not a comprehensive suite. One runnable check per invariant that is expensive to get wrong.

**Pure unit tests over `auth/`** (no database, no media server):

1. Listener cannot promote, mute, or ban.
2. Co-host cannot ban the host.
3. Co-host cannot ban another co-host.
4. Host can ban a co-host.
5. `canPublish` is true for host, cohost, speaker; false for listener **and for `invited`** —
   an invitation is not a grant.
6. No exported function unmutes another user.

**Integration** (one script, two identities):

7. Join → raise hand → promote → publish permission actually changed.
8. Promote → disconnect → re-mint yields a **speaker** token, not a listener token.
9. Ban → attempt rejoin → token mint refused.

Test 8 covers the reconnect-demotion bug that motivated `room_members`; it is the regression
most likely to reappear.

---

## 12. Explicitly out of scope

Recording and replay, clips, host analytics, follow graph, push notifications, private rooms,
multi-region, and horizontal scaling.

**Invite links** were considered and cut (2026-08-11). Rooms are found through the public
directory. Note for any future revisit: an invite link is a top-level URL, so it lands
*outside* MeWe's iframe and cannot use the `postMessage` handshake — it would require the
standalone redirect flow, plus a token table with expiry and revocation.

**The standalone-window flow** is also out of v1 (2026-08-11), following the §2 decision to
assume microphone access. It remains the documented contingency if that assumption fails:
listeners stay embedded, speakers open a window on our own origin and join the same LiveKit
room. Confining all MeWe knowledge to the `mewe/` module (§8) is what keeps this cheap to add —
it is a second entry path into the same session logic, not a second application.

Recording is worth noting: it was cut, but captions require no server-side audio tap under the
browser-based approach, so recording is *not* partially built. Adding it later means adding
egress from scratch.

---

## 13. Accepted risks

1. **Microphone in the MeWe iframe is assumed, not verified** (§2, decided 2026-08-11). If the
   assumption is wrong, embedded speakers do not work and the standalone-window contingency in
   §12 is required. Confirmed as a side effect of Step 1 rather than blocking on it.
2. **Captions are Chrome/Edge only** and route audio through Google. Requires UI disclosure.
3. **Free tiers have no SLA.** Acceptable for a prototype; explicitly not a production posture.
4. **MeWe's API reference did not render during research.** Scopes, rate limits, and the exact
   profile endpoint remain undocumented and must be confirmed against the live API during
   Step 1 (§3).

---

## 14. UI / UX

### The governing constraint: this is a panel, not a page

Earshot renders inside MeWe's iframe at dimensions MeWe controls. `HOST_DISPLAY_RESPONSE`
supplies `width`, `height`, `availableWidth`, `viewportHeight`, and `isMinimized`; the app may
only *request* a size via `CLIENT_DISPLAY_UPDATE`.

Therefore:

- **No viewport units.** `100vh` refers to the parent's viewport, not our panel. Size from the
  values MeWe sends.
- **Container queries, not media queries.** The panel's width has no relationship to the
  device's, so device breakpoints are meaningless here.
- **Narrow-first.** Assume a column. Treat extra width as a bonus, never a requirement.
- **Re-layout on `HOST_DISPLAY_RESPONSE`.** Dimensions change at runtime, not just on resize.

### Responsive behavior

**Requirement: the application is responsive at every size, small and large.**

The subtlety is that there are two different environments with different governing dimensions:

| Environment | Governing size | Mechanism |
|---|---|---|
| Embedded in MeWe | The **panel**, set by MeWe | `HOST_DISPLAY_RESPONSE` → CSS custom properties |
| Standalone window (§2 fallback) | The **viewport** | Normal viewport units are valid here |

Because the panel size is unrelated to the device screen, **device media queries are meaningless
in the embedded case**. Layout responds to the container, not the screen.

#### Mechanism

The app root is a query container, and its size comes from MeWe rather than the viewport:

```css
#app { container-type: size; block-size: var(--app-h, 100dvh); }
```

`--app-h` and `--app-w` are written from `HOST_DISPLAY_RESPONSE` on every update. The `100dvh`
fallback applies only in the standalone window, where the viewport is genuinely ours. **`vh` and
`vw` are never used in the embedded path** — they resolve against MeWe's viewport, not our panel,
which silently produces a layout taller than its own container.

#### Width tiers (container queries)

| Tier | Width | Behavior |
|---|---|---|
| `xs` | < 360px | Single column. Avatars at minimum size. Control bar shows icons only, labels move to `aria-label`. Captions clamp to one line, tap to expand. |
| `sm` | 360–599px | The reference layout. Speakers wrap 3-up, listeners as a wrapping dot row. |
| `md` | 600–899px | Speakers wrap 4–5 up. Chat and the hand-raise queue become a **docked side column** instead of sheets. Directory goes 2-up. |
| `lg` | ≥ 900px | Stage and side column at a fixed comfortable measure, centered, with margins — the stage **stops growing**. Directory 3-up. |

At `lg` the content is deliberately capped rather than stretched. A row of ten avatars spread
across 1400px reads as an empty room; keeping the stage at a comfortable measure keeps the group
feeling like a group.

#### Height is a first-class axis

Panels can be short as well as narrow, and this is the case most often forgotten:

- Header and control bar are **fixed**; only the participant/caption region scrolls.
- Below ~480px of height, captions collapse to a single line and the listener row collapses to a
  count with a tap-to-expand sheet.
- The control bar is never scrolled out of reach — leaving a room must always be one tap away.

#### Fluid sizing

- Avatar diameters and type sizes use `clamp()`, so there are no hard jumps between tiers.
- The speaking ring and ripple are sized in `em`, so they scale with the avatar rather than being
  redrawn per tier.
- **Touch targets stay ≥ 44px at every tier**, including `xs`. Shrinking the panel never shrinks
  a hit area below that floor.
- Listener dots wrap freely and cap at 20 with `+N`.

#### Verification

Layout is checked at the extremes, not just the reference size: 320×480, 360×640, 600×800,
900×600, and 1400×900, plus a short-and-wide case (900×420) which is where fixed headers and
control bars most often collide.

### Routes

Two. Everything else is a state or an overlay.

| Route | Purpose |
|---|---|
| `/` | Directory — live now, scheduled next |
| `/room/[id]` | The room |

Creating or scheduling a room is a **modal on `/`**, not a route: it is a four-field form, and
a route change inside a narrow panel reads as the whole app navigating away.

### Non-route states

| State | Behavior |
|---|---|
| `handshaking` | Spinner while awaiting `HOST_HANDSHAKE_RESPONSE` |
| `auth-failed` | Explicit retry; never a blank panel |
| `minimized` | Compact now-playing line, **audio still running** |
| `mic-blocked` | The user denied the browser prompt or has no input device. Explain, and make clear they can still listen. Common, not exceptional. |

### Libraries

| Concern | Choice | Rationale |
|---|---|---|
| Components | **shadcn/ui**, ~6 only | `dialog`, `dropdown-menu`, `sheet`, `toast`, `avatar`, `tooltip`. Copy-in, not a dependency |
| Icons | `lucide-react` | shadcn convention |
| Audio UI | `@livekit/components-react` | speaker tiles, speaking state, audio element lifecycle |
| Animation | **CSS keyframes only** | No animation library until something demonstrably needs one |

A full design system is not adopted. Lists, cards, and buttons are trivial in Tailwind. What is
*not* trivial is accessible dialogs, menus, and toasts — focus traps, escape handling, ARIA
wiring, scroll locking. Radix (under shadcn) earns its place for exactly those.

**Additional components from `@livekit/components-react`** (already a dependency, no new install):

| Export | Use |
|---|---|
| `useParticipantTile()` | Emits `data-lk-speaking` / `data-lk-audio-muted`; drives the ring and mute badge in CSS |
| `useIsSpeaking()` | Debounced speaking state where a boolean is needed in JS |
| `BarVisualizer` | Local mic level on the mic button — answers "is my microphone actually working?" |
| `RoomAudioRenderer` | Audio element lifecycle for all remote participants |

**21st.dev was surveyed (2026-08-11) and nothing was adopted.** Recorded so it is not
re-surveyed:

- *Voice Powered Orb* — WebGL shader reacting to one microphone. Built for a single voice
  assistant; wrong shape for a roster of ten avatars, and heavy.
- *AI Voice Input* — a voice-memo record button with timer and bars. `BarVisualizer` covers the
  same need from a dependency already present.
- *Avatar group* — is literally `flex -space-x-3` with `ring-2 ring-background`. One line of
  Tailwind, not a component.

One technique *was* worth taking: **`ring-2 ring-background` on overlapping avatars.** A ring in
the background color is what keeps stacked avatars legible against each other. Used on the
directory room cards.

### Visual direction — "proximity"

A first pass specified neutral dark surfaces (zinc) with an amber accent. That was rejected as
generic: near-black plus a single bright accent is a default, not a decision, and it would have
arrived at the same place for any product. The direction below is derived from this subject.

**The premise.** Earshot has no video. The interface's entire job is to make something invisible
visible. And the name states the concept: *within earshot* is a **distance**.

**Structure encodes role.** The vertical axis is distance from the conversation. Speakers sit
high and close together. Listeners sit as small marks along the bottom edge — at the edge of
earshot. Promotion animates a listener travelling **upward** into the group; demotion travels
back down. Role is a position, not a badge to be read.

This is the structural device, and it is load-bearing: it encodes something true about the
content rather than decorating it.

**Signature — the ripple.** Speech onset emits one soft ring expanding outward from the avatar
and fading: sound propagating. One ripple per onset, plus a quiet persistent ring while talking.
This is the single bold element in the product; everything around it stays disciplined.

#### Palette

Warm text on a cold ground. The identity is that tension, not the accent.

```css
--ink:    #0D1719;  /* ground — deep petrol-black, not neutral */
--panel:  #15252A;  /* raised surfaces, cards */
--rule:   #24424B;  /* hairlines, dividers */
--bone:   #ECE6D9;  /* primary text — warm */
--dim:    #7E9298;  /* secondary text */
--onair:  #E8442E;  /* live and speaking ONLY */
```

`--onair` is a broadcast tally lamp. Red conventionally signals *error* in interfaces; here it
correctly signals *you are being heard*. Discipline required for that to hold:

- `--onair` appears only as tally dots and the speaking ring. Never a button fill, never
  decoration, never a hover state.
- **Errors and warnings never use red.** They use `--bone` on `--panel`. This keeps the single
  meaning of `--onair` intact.

Single theme. The system light/dark preference is deliberately not followed — a theme switch
inside MeWe's own chrome fights the surrounding page.

#### Typography

Two variable families from Google Fonts, three voices. Both axis ranges verified against the
Google Fonts CSS2 API (2026-08-11); the API returns 400 for axes a family does not have.

| Family | Axes | Verified range |
|---|---|---|
| **Archivo** | `wdth`, `wght` | 62–125, 100–900 |
| **Martian Mono** | `wdth`, `wght` | 75–112.5, 100–800 |

| Role | Setting | Use |
|---|---|---|
| Display | Archivo · `wdth 80` · `wght 600` · caps · `+0.02em` | Wordmark, room titles, participant names |
| Body | Archivo · `wdth 100` · `wght 400/500` | Chat, captions, prose |
| Data | Martian Mono · `wght 500` · caps · `+0.08em` | `LIVE`, `00:23:41`, `7 LISTENING` |

**Why these.** Archivo descends from 19th-century American grotesques — signage and labeling —
which is the vernacular of broadcast equipment. Its width axis means one family covers both the
condensed display voice and the normal body voice, so the "condensed" cut is a variation setting
rather than a second font file. Martian Mono is a semi-condensed technical mono designed for
interface readouts; it carries the console character on the counters and timers, and it is far
less worn than the usual mono choices.

Deliberately **not** Inter, Geist, Space Grotesk, or DM Sans — the faces that make an interface
read as generated. IBM Plex was specified in an earlier pass and replaced: it needed three
separate files to do what Archivo does with one, and its mono is comparatively common.

**Loading.** `next/font/google` with `axes: ['wdth']`, which self-hosts and subsets at build
time. No request to Google's CDN at runtime — faster inside an iframe, and no third-party
request from within MeWe's page.

**Fluid sizing** uses `cqi` (container inline size) rather than `vw`, consistent with the
container-query model above:

```css
--t-title:  clamp(1.25rem, 4cqi, 1.75rem);
--t-body:   clamp(0.875rem, 2.6cqi, 0.9375rem);
--t-name:   clamp(0.625rem, 2cqi, 0.6875rem);
--t-data:   clamp(0.625rem, 1.8cqi, 0.6875rem);
```

#### Voice and copy

Words are named for what people control, not how the system is built.

| Instead of | Write |
|---|---|
| Request speaker permission | **Ask to speak** |
| Promote participant | **Let Sara speak** |
| Submit | **Start a room** |
| Error: permission denied | **MeWe hasn't granted microphone access. You can listen, but not speak.** |

An action keeps its name through the whole flow: **Start a room** produces the toast **Room
started**. Failure states say what happened and what is still possible; they do not apologize
and are never vague. Empty states are an invitation to act, not a mood.

### Directory page (`/`)

The entry point after handshake, and the most-viewed screen in the product.

```
┌────────────────────────────────────┐
│ Earshot                    ◉ Sara  │  identity, top right
├────────────────────────────────────┤
│ ⚠ Microphone blocked — listen only │  only when actually blocked
├────────────────────────────────────┤
│      [ +  Start a room ]           │  primary action
├────────────────────────────────────┤
│ LIVE NOW                           │
│ ┌────────────────────────────────┐ │
│ │ ● Design critique              │ │
│ │   ◉◉◉ +2  ·  7 listening       │ │
│ │   Alex  ·  23 min              │ │
│ │                      [ Join ]  │ │
│ └────────────────────────────────┘ │
│                                    │
│ SCHEDULED                          │
│ ┌────────────────────────────────┐ │
│ │ Weekly sync                    │ │
│ │ in 2h  ·  Sara                 │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

**Identity (top right)** — avatar and display name from MeWe. No dropdown until there is a
second thing to put in it: there is no sign-out (MeWe owns the session) and no profile to edit.

**Room card** carries exactly enough to decide whether to join: title, host, stacked speaker
avatars, listener count, elapsed time, live dot. Topics shown only if present.

**Sorting** — live rooms by listener count descending (busiest first, matching X Spaces);
scheduled by soonest. Ended rooms are not listed.

**Joining** is tapping the card. With a public directory there is no join-by-code: every
joinable room is already listed. (If unlisted rooms are ever wanted, that reopens the invite-link
design cut in §12.)

**Freshness** — the list polls every 10s via `router.refresh()` against a Server Component. No
realtime library: the directory is not a live surface, and rooms start and end on human
timescales.

**Rejoin affordance** — if the viewer is host or speaker of a currently-live room, that room
pins to the top with `Rejoin` instead of `Join`. Returning to a room you were thrown out of by a
refresh is otherwise a hunt.

**Microphone banner** — queried with `navigator.permissions.query({name:'microphone'})`, which
does *not* prompt. Rendered only when blocked, so the user learns before joining rather than
after failing to speak. Directly serves the §2 risk.

#### Empty state

At prototype scale this is the **default** view, not an edge case:

```
        No rooms are live right now

     Start one and it shows up here.

          [ +  Start a room ]
```

An empty directory with no call to action reads as a broken product. This state gets the same
attention as the populated one.

#### Create-room modal

Four fields, nothing more:

| Field | Notes |
|---|---|
| Title | Required, max ~80 chars |
| Topics | Up to 3, optional |
| Who can request the mic | `everyone` \| `invited` — writes `speaker_policy` |
| Start | Now, or schedule (date + time) |

"Start now" creates the room, sets `status = live`, writes the creator as `host` in
`room_members`, and navigates straight into it. Scheduling writes `status = scheduled` and
returns to the directory.

### Room layout (narrow)

**Every participant is shown as an avatar** — speakers and listeners alike. At this scale
nobody is hidden behind a count.

```
┌────────────────────────────────┐
│ EARSHOT                ◉ Sara  │  condensed caps · identity
├────────────────────────────────┤
│ ● LIVE   00:23:41              │  mono · --onair tally dot
│ Design critique                │  condensed, large
│────────────────────────────────│  hairline, --rule
│                                │
│    ◉̲        ◉        ◉         │  near — speakers, ◉̲ = ring
│   ALEX     SARA      JO        │  condensed caps
│    ◉        ◉                  │  ♛ host  ✦ cohost  🔇 muted
│   RAVI     MIA                 │
│                                │
│  ·  ·  ·  ·  ·  ·  ·           │  far — listeners, at the edge
│  7 LISTENING                   │  mono, ✋ mark if hand raised
├────────────────────────────────┤
│ "…that's the part I meant"     │  captions, speaker-attributed
├────────────────────────────────┤
│  MIC     ASK     ♥     CHAT    │  condensed caps
└────────────────────────────────┘
```

Vertical position is the role indication — no "SPEAKERS" / "LISTENERS" headings are needed
visually. They remain in the accessibility tree as group labels, since position conveys nothing
to a screen reader.

**Two tiers, one grid language.** Speakers render larger with names; listeners render smaller,
name on tap. The size difference *is* the role indication — it needs no label to be legible.

Only speakers can be highlighted, because only speakers publish audio. A listener's avatar never
rings.

**Overflow guard:** listeners cap at 20 avatars, then `+N`. Not needed at prototype scale, but it
is two lines and prevents an unbounded grid if a room ever gets busy.

Chat and the host's hand-raise queue open as **sheets**, never side columns — the panel is too
narrow to afford one.

Minimized collapses to a single line: `● Room title — 3 speaking · [leave]`.

### Interaction rules that carry the product

1. **The speaking ring is driven by audio level, never by mute state.** With no video, it is the
   only signal about who is talking. Getting this wrong makes the room feel dead.

   Implementation constraints, both easy to get wrong:

   - **Use LiveKit's `isSpeaking` / `useIsSpeaking()`, not raw `audioLevel`.** The SDK applies a
     threshold and a hold time. Thresholding the raw level yourself produces rings that strobe
     on every syllable and pause.
   - **Prefer `useParticipantTile()`, which emits `data-lk-speaking` and `data-lk-audio-muted`
     as DOM data attributes.** The ring and the muted badge then become pure CSS
     (`[data-lk-speaking="true"] { … }`) with no React state and no re-render per audio frame,
     while still using the SDK's debounced speaking detection.
   - **Render the ring with `box-shadow` / `outline` / Tailwind `ring-*` — never an animated
     `border-width`.** A border participates in layout, so toggling it nudges every avatar in
     the grid. With several people talking, the whole roster jitters.
   - Ring is `--onair`, paired with a subtle scale so it is never color-alone.
   - The **ripple** fires once per speech onset, not continuously. With five people talking, a
     continuous ripple is noise; an onset ripple stays legible.
   - Under `prefers-reduced-motion`, both ripple and pulse are dropped and the ring becomes a
     static outline — state preserved, animation removed.
2. **Muted renders as a badge on the avatar, not a greyed-out tile.** Greying reads as
   "disconnected," which is a different and more alarming thing.
3. **Reactions float and vanish (~2s).** No counts, no history — ephemerality is the feature.
4. **Hand-raised is visible to the host without opening a sheet** — a count badge on the queue
   button. A request nobody sees is a broken promise.
5. **The mic button shows state, not intent.** Label it by what *is*, not what tapping does.

### Accessibility

Not optional, and cheap at this size:

- **Captions already exist** for the audio itself (§4) — the single largest accessibility win an
  audio product can offer.
- **Never color alone.** Speaking is ring + motion; muted is an icon, not a hue. `--onair` is
  always paired with a shape or glyph.
- **`prefers-reduced-motion`** disables the speaking-ring pulse and reaction float; the ring
  becomes a static outline that still conveys state.
- **Full keyboard access** to mic, raise hand, and every moderation control. Radix handles focus
  traps in sheets and dialogs.
- **ARIA live region** announcing role changes ("You are now a speaker") — otherwise a promoted
  screen-reader user has no idea their microphone became available.
- Touch targets ≥ 44px **at every size tier**, including the narrowest. See the responsive
  section — shrinking the panel never shrinks a hit area below that floor.

### Deliberately skipped

Framer Motion, a theme switcher, skeleton loaders (the panel is small and fast), virtualized
lists (10 participants), and a component showcase. Add any of them when something concrete
demands it.
