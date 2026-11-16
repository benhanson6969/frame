# v14: named "Frame" everywhere, ready to go online

- **The name is now "Frame" everywhere:** browser tab, Google title, share preview, call screen, structured data. The old Secret Chat / Frame Chat logo page and logo file are removed.
- **New Google title and description:** *"Frame — Private Chat That Disappears & Song Finder"* / *"Chat 1-on-1 with a one-time link, then erase everything for both of you. Tap Frame to name any song in seconds — with charts, lyrics and similar songs. Free, no sign-up."*
- **New `REDIRECT_TO` setting.** Set it on the old Render service, and every visit to the old address (and Google) is sent permanently (301) to the new Frame address. Invite links keep working.
- `render.yaml` creates a service named **frame**.
- **DEPLOY.md** rewritten with every step: GitHub → Render → redirect → Google Search Console → custom domain.

---

# v13: lyrics, .env file, ready for Render and Google

- **Trending now on the home page:** the rank numbers are removed from the covers.
- **Lyrics on song pages:**
  - Lyrics come from **Musixmatch's official API**, which is licensed to show lyrics. Add `MUSIXMATCH_API_KEY` (free at developer.musixmatch.com).
  - The free plan shows a **preview (about 30%)**, with Musixmatch's copyright line and the "Open full lyrics" links. A paid Musixmatch plan shows the full lyrics automatically.
  - Without a key, the page shows the Musixmatch / Genius / Google links as before.
  - On phones, the **LYRICS** tab jumps straight to them.
- **`.env` is now included.** Open it and paste your keys: `AUDD_API_TOKEN`, `MUSIXMATCH_API_KEY`, and optionally `SITE_URL`, `GOOGLE_SITE_VERIFICATION`, `ANALYTICS_KEY`.
- **Ready for Google:**
  - A new Frame icon set (favicon.ico, 48/32/192/512 px PNGs, apple-touch-icon, maskable icon), plus `site.webmanifest`. Google uses the favicon in search results.
  - New title, description and share image (`og-image.png`) for Frame, and structured data with your name and logo.
  - `robots.txt` and `sitemap.xml` are generated automatically with your real address.
  - `GOOGLE_SITE_VERIFICATION` lets you verify in Search Console without editing code.
- **Ready for Render:** `render.yaml` (Blueprint), a `/healthz` check, and Node ≥ 20. See **DEPLOY.md** for the step-by-step guide.

---

# v12.1: the AudD token is saved in a .env file

- You no longer need to type the token in the terminal every time. Create a file named **`.env`** in the project folder (next to `server.js`) containing:
  ```
  AUDD_API_TOKEN=your_token_here
  ```
  The server reads it automatically when it starts.
- When the server starts, the terminal shows `[Music] AudD token found ✓`, or a warning if the token is missing.
- `.env.example` is included as a template.
- `.env` is listed in `.gitignore`, so your token is never uploaded to GitHub. On Render, keep using Environment → `AUDD_API_TOKEN`.

---

# v12: home page "Orb" design (option C)

The home page now uses the design you chose (EN/RW/FR, phones and computers):
- **Top:** a greeting that follows the time of day ("GOOD AFTERNOON, INNOCENT" / "MWIRIWE, INNOCENT"), then a big two-colour headline: **Talk privately. Find any song.**
- **Big green Fm button in the middle** with pulsing rings. Tapping it opens Frame Music and starts listening right away ("Tap to Frame a song").
- **Two cards below it:**
  - **Private Chat**: if a chat is already open, it shows a "Waiting for guest" or "Chatting with …" badge and "Your chat is open — tap to continue".
  - **Frame Music**: charts · library · song pages.
- "Have a code from someone? **Join with code**".
- **Trending now:** the top 10 songs, numbered, with covers (tap one to open its song page), plus "Charts ›".
- **One line of highlights:** No accounts · Nothing stored · One-time invite link · Songs in seconds.
- The rotating message at the bottom is now in all 3 languages.

---

# v11: brand-new home page

The hub was redesigned as a modern home page that brings Chat and Music together (EN/RW/FR, works on phones and computers):
- **Top:** the Frame logo, plus ?, language and your name.
- **Greeting that follows the time of day:** "Good afternoon, Innocent" / "Mwiriwe, Innocent". Below it, a big headline: *Talk privately. Find any song.*
- **Private Chat card:**
  - A small phone preview where demo messages appear by themselves (a question, a reply, a view-once photo, "I tap END 🔥", a typing indicator).
  - Three highlights: one-time link · locked to two · END erases for both.
  - **START A CHAT** button. If you already have a chat open, it becomes **RESUME CHAT** and shows a badge ("Waiting for guest" or "Chatting with Kalisa").
  - A "Join with code" link.
- **Frame Music card:**
  - A green stage with moving equalizer bars and a pulsing **Fm** button ("Tap to Frame"). Tapping it opens Frame Music and starts listening.
  - **Trending now:** the top 3 songs with their covers (tap one to open it), plus "Charts ›".
  - **IDENTIFY A SONG** button, and your last find.
- **Three feature tiles:** No accounts · Nothing stored · Songs in seconds.

---

# v10: Chat opens directly, and new clean icons

- **The "Private chats" list page is gone.** Tapping **Chat** on the hub goes straight to the chat page:
  - if you already have an open chat, it reopens;
  - otherwise a new chat starts right away, with its code and an INVITE button.
- **Ways out of a chat:**
  - ← goes back to the hub (the chat stays open, so you can come back to it).
  - END erases the chat for both people and returns both of them to the hub.
- **Join with a code:** there's a small "Join with code" link on the Chat card in the hub, and inside the chat while you're waiting.
- **All emoji in the interface are replaced by clean line icons in Frame's green.** They look the same on every phone and computer: key, link, phone, video, trash, image, mic, smile, send, users, pencil, help, music, chat, lock, flame, headphones, search, settings, play/pause, and so on. Emoji that people type in messages, and the emoji picker, stay as they are.
- The left side menu inside chat was removed. Everything is in the top bar now.

---

# v9: Frame Music looks like a phone app on mobile

On phones (screens under 700px), Frame Music now works like a music app, with Frame's own logo, colours and wording (EN/RW/FR):
- **Home:** "🎙 Tap to Frame" above a big green **Fm** button. Below it, a **My Music · N songs** card opens your Library, and ⚙ opens Settings. Charts are further down the page.
- **Bottom menu:** Home · Library · Charts, plus a round 🔍 search button.
- **Library:**
  - A big **Last find** card with ▶.
  - Filters: All / Artists.
  - **PLAY ALL**, which plays the previews one after another.
  - Songs grouped by **Today / Yesterday / This week / month**. Each song shows its cover with ▶, the date and time, which platform it's on, and a ⋯ menu (Open, Share, Remove).
  - It now keeps up to 150 finds (was 12).
- **Settings:**
  - **Open songs in** Spotify / Apple Music / Deezer / YouTube (this decides the main button on song pages).
  - **Frame on app start** (start listening as soon as Frame Music opens).
  - **Haptic feedback** (the phone vibrates when a song is found).
  - Language, and Clear my finds.
- **Song page on mobile:**
  - A full-screen photo of the artist (or the cover).
  - Tabs at the top: ✕ · **SONG · LYRICS · VIDEO · ARTIST** · share.
  - A big green ▶, the title, the artist, and "Found with Frame".
  - A pill bar **▶ Spotify | OPEN | SHARE**, plus ⋮ for the other platforms.
- On computers, the "My Finds" menu link is now **Library**, and the page shows a "Recently framed" row.

---

# v8: full song page after a match

After Frame recognises a song (or you open one from the charts or search), a full song page opens, in EN/RW/FR:
- **Top part:**
  - On the left: ✓ IDENTIFIED, a big title, the artist (links to the artist), and genre · year · album (E for explicit songs). Below that, **Open in Spotify** (or Apple Music/Deezer/YouTube), a ⋯ menu with every platform plus Share, and ▶ preview.
  - In the middle: a big cover with a share button.
  - On the right, a panel with two tabs:
    - **Matched moment:** where in the song Frame recognised it, e.g. "Matched at 1:12 of 3:41" with a marker on the song bar.
    - **Song details:** album, release date, label, genre, length, BPM, ISRC.
- **Music video:** a card that opens the official video on YouTube.
- **Lyrics:** links to Musixmatch, Genius and Google. Full lyrics are protected by copyright, so Frame does not copy them into the page.
- **Further down:**
  - From the album (numbered track list),
  - Featured in (playlists),
  - Top songs by the artist,
  - Similar songs (with ‹ › arrows),
  - Artist card (fans, albums),
  - Credits (main and featured artists, label).
- A **FRAME ANOTHER SONG** button.
- New server route: `/api/music/track` (Deezer, free, cached 1 hour). AudD's match time (`timecode`) is now kept.

Not included (they need paid APIs): concerts, full lyrics, and real "most popular part of the song" data.

---

# v7.1: full-screen "searching" screen

When someone taps to find a song, a full-screen green Frame view opens:
- **Layout:** the Frame Music logo top-left, the big round **Fm** button in the middle with soft circles around it, a white **CANCEL** button at the bottom, and ✕ to close.
- **Three stages, with live text in EN/RW/FR:**
  1. **Tap to Frame**: "Play a song near your device, then tap the button" (the button breathes).
  2. **Listening…**: "Hold your device close to the music · 8s". The circles pulse and a sound bar moves.
  3. **Searching for a match**: "Please wait".
- When a song is found, the result opens with its details, similar songs, and a **FRAME ANOTHER SONG** button.
- No match or an error: the screen stays open and explains what to do (in yellow).
- **CANCEL** stops listening or searching at any moment, and a late answer is ignored.

---

# v7: new Frame Music home page (charts)

Frame Music now opens on a full music home page with Frame's own logo and wording, in EN/RW/FR:
- **Top menu:** the Frame Music logo, then Identify · Charts · Afro Heat · My Finds, plus 🔍 search, language, 💬 Chat and ← back to the hub.
- **Hero:**
  - On the left, a big headline ("What the world is listening to right now") and a green **TAP TO FRAME A SONG** button.
  - On the right, a **3D carousel** of the 7 top trending songs. It swipes, turns by itself every 6.5 seconds, has dots below, and each card has a ▶ preview.
  - The page background takes its colour from the cover of the song in front.
- **Below the hero:** Top 10 today (numbered list), Afro Heat (African chart), Artists on the rise, and My Finds.
- **Round Frame button (bottom right):** opens the listening screen and starts listening right away.
- **Song details:** tapping any song opens its details and similar songs.
- **🔍 Search:** find any song or artist by name.
- Charts come from Deezer's free API (no key needed) and the server keeps them for 30 minutes. New server routes: `/api/music/charts`, `/api/music/search`.

---

# v6.2: Frame Music is more reliable

- If AudD (the recognition service) is slow or the connection drops, the server now **tries again automatically** (2 tries, 20 seconds each).
- **Clearer error messages** instead of "Could not reach the recognition service":
  - no internet (or a firewall/VPN is blocking),
  - the service took too long,
  - the audio file is too big,
  - the service is not responding right now.
- The terminal logs each failed try, e.g. `[Music] AudD attempt 1 failed: timeout (20s)`.

---

# What changed in this update (v6): splash screen + choose your name

- **Splash screen on every visit:**
  - The Frame logo glows in.
  - "FRAME" decodes Matrix-style.
  - Welcome words type themselves: "Welcome to Frame. Talk in private. Erase everything. Discover the music around you." (in EN/RW/FR).
  - Three tags appear: 🔒 PRIVATE · 🔥 NO TRACES · 🎵 MUSIC.
  - After about 4 seconds (or one tap) it goes to the hub, where the visitor picks **PRIVATE CHAT** or **FRAME MUSIC**.
- **The name is only chosen when entering Chat:**
  - No name is given automatically any more. The hub says "WELCOME TO FRAME".
  - Tapping PRIVATE CHAT the first time opens "CHOOSE YOUR NAME", with a suggestion and a 🎲 random-name link. ENTER CHAT › takes you in.
  - Frame Music needs no name.
  - Next visits show "WELCOME BACK, NAME" on the hub.
- **Guests who open an invite link:** splash → choose name → straight into the chat.

---

# What changed in this update (v5): no login, no accounts

- **Login, sign-up and Google sign-in are removed completely.** Firebase is gone from the browser and from the server (`firebase-admin` was removed from `package.json`). The profile page is gone too.
- Opening the site goes **straight to the hub**. Each visitor gets a random name like `agent584`, which they can change with ✎.
- **How people are told apart without accounts:** each browser creates a random secret key (stored only in that browser). The server turns it into an anonymous ID (a SHA-256 hash). Knowing someone's ID doesn't let you act as them.
- **Invite links work instantly:** the guest opens the link and lands in the chat. No sign-up step.
- "What is Frame?", the FAQ, Terms and Privacy were updated to say "no accounts".
- **On Render you can now delete** `FIREBASE_SERVICE_ACCOUNT` and `FIREBASE_DATABASE_URL`. They are no longer used. You can also delete the Firebase project if nothing else uses it.
- **Note:** if someone clears their browser data or switches device or browser, they lose access to their open chats (by design, since there is no account to recover).

---

# What changed in this update (v4): new chat page

- **New chat page:**
  - The top bar has chips: status (● WAIT / ● LIVE), 🎵 FRAME MUSIC, ? (what is Frame), language, ✎ your name, and 👥 1/2.
  - Below it is a card with a spinning status ring, the guest's name, a scrolling LED-style display ("WAITING FOR YOUR GUEST..." / "CONNECTED · NOTHING IS SAVED..."), and the buttons ＋ INVITE, 🔑 code, 🎙️/📹 calls and 🗑 END.
- **One-time invite link (＋ INVITE):**
  - Creates a link like `https://your-site/?inv=...` with a 10-minute countdown.
  - The first person who opens it is locked into the chat, and the link dies.
  - Tapping INVITE again makes a new link, and the old one stops working.
  - Opening your own link does **not** burn it.
  - If the guest isn't logged in, they see an "You've been invited" banner, and the chat opens automatically right after they log in.
  - The secret code still works too.
- **Languages:** English, Kinyarwanda and Français (saved per device). The choice is on the login screen, the hub and the chat.
- **Change your name (✎):** pick the name shown in the chat. It updates live for the other person ("X is now Y").
- **"What is Frame?" (?):** features, a FAQ, and links to Terms and Privacy, in all 3 languages.
- **View-once photos:** the receiver taps once to view. When they close it, the photo is destroyed, and photos are never kept in the chat history.
- **Anti-copy:** copying, cutting and the right-click menu are blocked on chat messages. Phone screenshots are still possible.
- **Emoji picker** in the message bar.
- **New pages:** `/terms.html` and `/privacy.html`. These are TEMPLATES: add your contact email and have them reviewed.
- New optional env: `INVITE_TTL_MS` (default `600000` = 10 minutes).

---

# What changed in this update (v3)

## 1. CHAT is now a private 1-on-1 chat that erases itself

The old group channels (admin, kick, announcements, stats) are gone. Chat now works like this:

1. Tap **+ NEW CHAT**. The app generates a random 8-character secret code.
2. Give the code to **one** person (COPY or SHARE buttons). The first account that enters it is **locked in**. Anyone else who tries the code gets "This chat is private and already has two people."
3. The two of you chat: text, photos, voice notes, and voice/video calls.
4. When you're done, **either person taps 🗑 END**. Every message, photo, voice note and the code are wiped **for both people, immediately**. Both screens show a "CHAT ERASED" notice and the chat disappears from both lists, as if it never existed.

Everything also ends automatically:
- A chat with nobody in it for **10 minutes** deletes itself (`ROOM_IDLE_MS`, default `600000`).
- Every chat dies after **24 hours** at most (`CHANNEL_TTL_MS`).

**Nothing about chats is saved anywhere.** No Firestore, no disk, no localStorage. Chats live only in the server's memory. A server restart (for example a Render redeploy) wipes every open chat too. Only user profiles are still stored in Firebase.

Each account can have up to 3 active chats at a time.

**Security fix:** the server now checks each person's Firebase login token before letting them into a chat. Before, someone could pretend to be another user (including the admin). The old `/api/channels/...` address that leaked user IDs is removed.

> If your Firebase project still has an old `channels` collection from the previous version, you can delete it in the Firebase console. The app no longer uses it.

## 2. Music Tracker is now "Frame Music"

The music screen is renamed **Frame Music** and has a big Shazam-style **TAP TO FRAME IT** button. It works the same way: listen, then show the song, the artist, and similar songs. It still needs `AUDD_API_TOKEN` (see below).

---

# What changed in this update

## NEW: Home hub — choose CHAT or MUSIC TRACKER

After logging in, users now land on a hub screen (same Matrix look) with two big options:

- 💬 **CHAT**: goes to the chat app exactly as before.
- 🎵 **MUSIC TRACKER**: the new song finder.

The bottom of the hub shows rotating, typewriter-style messages that invite people to try the app. The sidebar inside Chat also has two new buttons, ⌂ (back to the hub) and 🎵 (Music Tracker).

## NEW: Music Tracker — "what song is this?"

1. Play a song near the phone or computer and tap **TAP TO LISTEN**. The app listens for about 10 seconds and shows a live green sound visualizer while it does.
2. It shows the **song title, artist, album, year, cover art** and a 30-second preview, plus buttons to open the song on Spotify, Apple Music, Deezer or YouTube.
3. Below that it lists **more songs by the same artist** and **"You might also like"**: songs from related artists, each with a ▶ preview button.
4. Users can also **upload an audio clip** instead of using the mic.
5. The last 12 songs found are saved under **RECENT FINDS** on that device.

### What you need to do (one-time)

Song recognition uses **AudD** (https://audd.io). Create an account there, copy your API token, and add it on Render:

- `AUDD_API_TOKEN`: your AudD token (required for real use)
- `MUSIC_LIMIT_PER_HOUR`: optional, the maximum number of searches per visitor per hour (default `30`). This protects your AudD quota.

"Similar songs" come from Deezer's free public API and need no key.

---

# Previous update


## 1. Chats now close themselves after 24 hours

Before: once someone created a secret chat room, it stayed open forever unless an admin closed it by hand.

Now: every room automatically closes exactly 24 hours after it was created. Everyone still inside gets a message saying the room expired, they're kicked back to the home screen, and the secret code is freed up so it can be used again for a brand-new room. You don't have to do anything for this to work — it checks every minute in the background on its own.

If you ever want the 24 hours to be a different length (say, 12 hours, or 48 hours), you can set this on your hosting (Render, etc.) without touching the code:

- `CHANNEL_TTL_MS` — how long a room lives, in milliseconds. 24 hours = `86400000` (this is already the default if you don't set anything).

## 2. The visitor-log page is now locked behind a password-like key

Before: anyone who knew (or guessed) the `/api/visitors` web address could see your visitor log — no login needed. That was the security gap.

Now: that address (and the "clear visitors" one) requires a secret key. Without the key, it's blocked. This means **you need to set one key for yourself**, otherwise even you will be blocked from it.

### What you need to do

On Render (or wherever this app is hosted), add a new environment variable:

- Name: `ANALYTICS_KEY`
- Value: any password you make up (e.g. `myFrameChat2026Key!`) — just don't reuse a real account password

Then, to check the visitor log yourself, just open this in your browser (replace both parts with your real site address and the key you picked):

`https://your-site.onrender.com/api/visitors?key=YOUR_KEY_HERE`

That's it — no extra tools needed, it works like a normal web link.

**Important:** until you set `ANALYTICS_KEY` on Render, the visitor log endpoints will return "forbidden" for everyone, including you. This is intentional (fail-safe), not a bug.

## 3. Voice messages — record and send a quick audio clip

There's now a 🎤 button next to the photo button in the chat. Tap it once to start recording (it turns red and pulses while recording), tap it again to stop and send. It auto-stops and sends after 60 seconds so clips can't grow huge. The person on the other end sees a small audio player right in the chat, with the clip's length next to it, and can tap play — just like a photo message, but for sound.

This needs microphone permission the first time it's used, same as voice/video calls already do.

## 4. Channel stats for admins

In the admin bar at the top of a chat (only visible to the person who created the channel), there's now a 📊 STATS button. Tapping it opens a small panel showing two numbers:

- how many messages have been sent in that channel in total (text, photos, and voice clips all count)
- how many people are currently active in the channel right now

This is read on demand — tap the button any time to get the current numbers, nothing is pushed to you automatically.

## Nothing else changed

Regular chat, photo sharing, voice/video calls, admin kick, manual "close channel" button, and everything else works exactly like before — this was tested side-by-side with the old behavior to make sure nothing broke.
