# Meme Room

A web-only meme feed. The feed is reserved for captioned pictures. Visitors can browse the feed. Signed-in users can like or dislike a meme, and Good shows the current user's likes. A dislike from the verified Google account `louisanderson477@gmail.com` deletes the meme, its image, and related votes from the shared SQLite database.

| Key | Action |
| --- | --- |
| Up | Previous meme |
| Down | Next meme |
| Right | Like and advance |
| Left | Remove in GitHub Pages, or dislike in the Node app, then advance |

The controls also work by click or tap. The feed shuffles unseen memes, remembers which ones it has shown in the current browser, and stops when it runs out. Up revisits earlier cards in the current page.

## Catalog sources

The current catalog includes a hand-reviewed selection of finished memes from [Dank Meme Paradise](https://github.com/Silent-dawn/Dank_Meme_Paradise), [SeansLifeArchive Images Memes](https://github.com/seanpm2001/SeansLifeArchive_Images_Memes), and [programming-memes](https://github.com/dpnkrpl/programming-memes).

Some entries restore captions from published posts in the [ImgFlip575K archive](https://github.com/schesa/ImgFlip575K_Dataset) on their corresponding templates. Each restored entry keeps the original post URL. The catalog combines individually reviewed screenshots and finished memes with larger, vote-ranked batches screened by template, caption, and duplicate filters and spot-checked visually.

## Run locally

Requires Node.js 24 or later.

```sh
npm ci
npm start
npm test
```

Open `http://localhost:3000`. Run tests in a separate terminal while the server is running, or independently. Tests use an in-memory database.

## Enable email sign-in on GitHub Pages

1. In the Supabase dashboard, keep the Email provider enabled and allow new users to sign up so a first sign-in creates their account.
2. Set the Site URL and allowed redirect URL to `https://louis2495.github.io/memes/` in Authentication → URL Configuration. Keep the default Magic Link email template, which uses the confirmation URL.
3. Run [supabase/setup.sql](supabase/setup.sql) in the project’s SQL Editor.
4. Fill in the Project URL and Publishable key in [public/supabase-config.js](public/supabase-config.js) and publish the site. Use the publishable key only.
5. Send a sign-in link from the website and open it in the same browser. The backend grants shared feed deletion only to the confirmed email `louisanderson477@gmail.com`.

The project’s default email service may restrict recipients to project team members. Configure custom SMTP in Supabase if you need to send links to other addresses. Shared removals hide images from Feed and Good on the next load. The image files are still hosted by GitHub Pages. Likes remain local to the browser.

## Enable Google sign-in on the Node app

Create a Google OAuth **Web application** client. Add `http://localhost:3000/auth/google/callback` as an authorized redirect URI for local development. For a deployed website, add its HTTPS origin followed by `/auth/google/callback`.

Copy `.env.example` to `.env` and fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Set `BASE_URL` to the origin users will visit, then restart the server. If the OAuth app is in testing mode, add the accounts that need access as test users in Google Cloud.

## GitHub Pages

In the repository’s Pages settings, select **Deploy from a branch**, then **main** and **/ (root)**. The Pages URL opens the dark feed from `index.html`.

Pages serves a browsable snapshot from `public/memes/catalog.json`. Pages saves likes and removals in the current browser. Left arrow removes the current image from Feed and Good across reloads. Deploy the Node app for Google sign-in, account-based voting, and shared moderation. Startup imports each catalog entry into SQLite once, so an admin-deleted meme stays deleted after a restart. Removing a meme from the separate Pages snapshot requires removing its catalog entry and image from the published branch.

## Deployment

Run one application instance with a persistent writable volume for `data/memes.sqlite`, or set `DB_PATH` to a path on that volume. Set `BASE_URL` to the site's external HTTPS origin so session cookies are secure and sign-in redirects to the right host. Keep credentials and the database out of Git.
