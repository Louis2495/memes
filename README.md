# Meme Room

A web-only meme feed. The feed is reserved for captioned pictures. Visitors can browse the feed. Signed-in users can like or dislike a meme, and Good shows the current user's likes. A dislike from the verified Google account `louisanderson477@gmail.com` deletes the meme, its image, and related votes from the shared SQLite database.

| Key | Action |
| --- | --- |
| Up | Previous meme |
| Down | Next meme |
| Right | Like and advance |
| Left | Dislike and advance |

The controls also work by click or tap.

## Image source

The initial picture batch is seven historical political cartoons by Joseph Keppler. The original artwork was collected in the 1893 book *Cartoons from Puck* and is in the U.S. public domain. The JPEGs are unmodified scans. The original titles appear beneath the images in the feed. [Project Gutenberg, eBook 59604](https://www.gutenberg.org/ebooks/59604)

## Run locally

Requires Node.js 24 or later.

```sh
npm ci
npm start
npm test
```

Open `http://localhost:3000`. Run tests in a separate terminal while the server is running, or independently. Tests use an in-memory database.

## Enable Google sign-in

Create a Google OAuth **Web application** client. Add `http://localhost:3000/auth/google/callback` as an authorized redirect URI for local development. For a deployed website, add its HTTPS origin followed by `/auth/google/callback`.

Copy `.env.example` to `.env` and fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Set `BASE_URL` to the origin users will visit, then restart the server. If the OAuth app is in testing mode, add the accounts that need access as test users in Google Cloud.

## GitHub Pages

In the repository’s Pages settings, select **Deploy from a branch**, then **main** and **/ (root)**. The Pages URL opens the dark feed from `index.html`.

Pages serves a browsable snapshot from `public/memes/catalog.json`. Deploy the Node app for sign-in, voting, and moderation. Startup imports each catalog entry into SQLite once, so an admin-deleted meme stays deleted after a restart. Removing a meme from the separate Pages snapshot requires removing its catalog entry and image from the published branch.

## Deployment

Run one application instance with a persistent writable volume for `data/memes.sqlite`, or set `DB_PATH` to a path on that volume. Set `BASE_URL` to the site's external HTTPS origin so session cookies are secure and sign-in redirects to the right host. Keep credentials and the database out of Git.
