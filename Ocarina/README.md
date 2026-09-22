# Ocarina

Ocarina is the frontend for the shared music room experience. It supports three entry paths:

- Spotify login: opens the bandwagon dashboard. Users can see active friends, enter their rooms, send recommendations, and review sent songs. This path does not create a room automatically.
- Start a listening room: creates the authenticated user's `rooms` row and then joins the playback room.
- Guest join: uses Supabase anonymous auth, then joins an existing room by code.

## Local setup

Copy `.env.example` to `.env.local` and fill in the browser-safe Supabase URL and publishable/anon key. Never put the Supabase service-role key or Spotify client secret in Ocarina.

Run the frontend from this folder:

```bash
npm install
npm run dev
```

Run the backend separately from `../Ocean`:

```bash
npm install
node server.js
```

Ocean continues to own Spotify OAuth token exchange, token refresh, search, and playback queueing. Supabase owns profiles, friendships, active room rows, track drops, and Realtime subscriptions. The SQL files in `../SQL` are the database contract.
# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
