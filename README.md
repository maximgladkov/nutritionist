# nutritionist

This is an [eve](https://eve.dev) agent bootstrapped with [`eve init`](https://eve.dev/docs/reference/cli#eve-init).

## Telegram web sign-in

The login page shows a Telegram Login Widget below the magic-link form when `TELEGRAM_BOT_USERNAME` is set.

1. In [@BotFather](https://t.me/BotFather), run `/setdomain` and register the hostname from `AUTH_URL` (for example `app.example.com`). Telegram does not accept `localhost`; use a public tunnel with that same domain while developing.
2. Set these environment variables:
   - `TELEGRAM_BOT_TOKEN` — already used by the Telegram bot channel
   - `TELEGRAM_BOT_USERNAME` — bot username without `@`
   - `AUTH_SECRET` and `AUTH_URL`

## Getting started

First, run the development server:

```bash
eve dev
```

The development TUI opens an interactive session where you can send messages to your agent.

Start by editing `agent/instructions.md` to define the agent's identity, purpose, tone, and response guidelines. Configure its model and runtime behavior in `agent/agent.ts`.

Add capabilities under `agent/`, including tools, connections, channels, skills, subagents, and schedules. eve reloads your changes as you work.

## Learn more

To learn more about eve, explore these resources:

- [eve documentation](https://eve.dev/docs) — learn about eve's features and authoring APIs.
- [Build an Agent tutorial](https://eve.dev/docs/tutorial/first-agent) — build and deploy an agent step by step.
- [eve on GitHub](https://github.com/vercel/eve) — view the source and contribute.

## Deploy on Vercel

Deploy your agent to [Vercel](https://vercel.com) from the project root:

```bash
eve deploy
```

`eve deploy` links a Vercel project if needed and deploys the agent to production. See the [eve deployment documentation](https://eve.dev/docs/guides/deployment/vercel) for authentication, environment variables, and deployment options.
