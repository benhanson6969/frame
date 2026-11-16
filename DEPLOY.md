# Put Frame online (Render) and on Google

## 0. Test on your computer first
1. Open `.env`, fill `AUDD_API_TOKEN=` (leave `MUSIXMATCH_API_KEY=` empty if you have no key).
2. `npm install` then `npm start` → http://localhost:3000
3. Terminal must show `[Music] AudD token found ✓`.

## 1. GitHub (new repo named "frame")
1. github.com → **New repository** → name: `frame` → Public or Private → Create.
2. Upload the code. Easiest, from the project folder in the VS Code terminal:
   ```
   git init
   git add .
   git commit -m "Frame v14"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/frame.git
   git push -u origin main
   ```
   `.env` is ignored automatically, so your token is NOT uploaded.
   ⚠ If you upload by drag-and-drop on the GitHub website instead, do NOT drag the `.env` file.

## 2. Render (new service called "frame")
1. render.com → **New +** → **Blueprint** → connect GitHub → choose the `frame` repo.
   Render reads `render.yaml` and creates a web service named **frame**.
2. When it asks for environment values:
   - `AUDD_API_TOKEN` = your AudD token
   - `SITE_URL` = leave empty for now
   - others: leave empty
3. Click **Apply**. Wait for "Live". Your address will be `https://frame.onrender.com`
   (or `https://frame-xxxx.onrender.com` if that name is taken).
4. Copy that address → Render → frame → **Environment** → set `SITE_URL` to it → Save.

Note: the free plan sleeps after ~15 min without visitors; the first visit after that takes
about 30–60 seconds to wake up.

## 3. Send the old address to the new one
Render → your OLD service (secret-chat-svb0) → **Environment** → add
`REDIRECT_TO` = your new address (e.g. https://frame.onrender.com) → Save.
(The old service must run this v14 code for that to work: point it to the new repo, or
deploy v14 to it too.) Everyone opening the old link — and Google — is sent to Frame.

## 4. Google Search Console (show Frame on Google, with its icon)
1. https://search.google.com/search-console → **Add property** → **URL prefix** →
   paste your new address with a `/` at the end.
2. Verify with **HTML tag**: Google shows `<meta name="google-site-verification" content="ABC...">`.
   Copy only `ABC...` → Render → frame → Environment → `GOOGLE_SITE_VERIFICATION` → Save →
   wait until Live → back in Google click **Verify**.
3. Left menu **Sitemaps** → type `sitemap.xml` → **Submit**.
4. Top bar **URL inspection** → paste your address → **Request indexing**.
5. Usually Frame appears on Google within a few days; the icon can take 1–3 weeks.

## 5. (Recommended) Your own domain
A short domain (for example frame-something.com / .app / .rw) makes Frame easier to find and
trust. Buy it (about $10–15/year), then Render → frame → **Settings → Custom Domains** → add it
and copy the DNS records Render shows into your domain provider. Then set `SITE_URL` to it and
add it as a new property in Search Console.
