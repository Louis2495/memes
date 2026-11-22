# Meme Room

A web-only meme feed. The site starts with an empty library. Visitors can browse the feed. Signed-in users can like or dislike a meme, and Good shows the current user's likes. A dislike from the verified Google account `louisanderson477@gmail.com` deletes the meme, its image, and related votes from the shared SQLite database.

| Key | Action |
| --- | --- |
| Up | Previous meme |
| Down | Next meme |
| Right | Like and advance |
| Left | Dislike and advance |

The controls also work by click or tap.

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

The Pages site shows the empty feed until a full deployment is available. To use the shared meme library, sign in, vote, or moderate, deploy the Node app using the settings below and open its URL.

## Deployment

Run one application instance with a persistent writable volume for `data/memes.sqlite`, or set `DB_PATH` to a path on that volume. Set `BASE_URL` to the site's external HTTPS origin so session cookies are secure and sign-in redirects to the right host. Keep credentials and the database out of Git.
