# ForgeAI — Quick Start

Get your personal AI assistant running in 30 seconds.

## 1. Clone & Start

```bash
git clone https://github.com/forgeai-dev/ForgeAI.git
cd ForgeAI
docker compose up -d
```

That's it. MySQL + Gateway start automatically. Security secrets are auto-generated on first run.

## 2. Open the Dashboard

Open **http://localhost:18800** in your browser.

## 3. Add an LLM Provider

Go to **Settings** → add your API key for any provider:

| Provider | Get API Key |
|---|---|
| Anthropic (Claude) | https://console.anthropic.com/settings/keys |
| OpenAI (GPT-4o) | https://platform.openai.com/api-keys |
| Google (Gemini) | https://aistudio.google.com/apikey |
| DeepSeek | https://platform.deepseek.com/api_keys |
| Groq (Llama) | https://console.groq.com/keys |

## 4. Start Chatting

Go to **Chat** and send a message. The AI is ready.

---

## Want Telegram/WhatsApp?

### Telegram (2 minutes)

1. Open Telegram → talk to [@BotFather](https://t.me/BotFather)
2. Send `/newbot` → follow the steps → copy the **Bot Token**
3. In ForgeAI Dashboard → **Settings** → paste the Telegram Bot Token
4. Send a message to your bot on Telegram — it works!

### WhatsApp

1. In ForgeAI Dashboard → **Settings** → enable WhatsApp
2. Scan the QR code that appears in the gateway logs
3. Done — your AI responds on WhatsApp

### Discord

1. Create a bot at https://discord.com/developers/applications
2. Copy the Bot Token → paste in Dashboard → **Settings**
3. Invite the bot to your server

---

## Using .env (Optional)

If you prefer to set config via environment variables instead of the Dashboard:

```bash
cp .env.example .env
# Edit .env with your values
docker compose up -d
```

## Useful Commands

```bash
# View logs
docker compose logs -f gateway

# Stop
docker compose down

# Update
git pull && docker compose up -d --build

# Health check
curl http://localhost:18800/health
```

## Running Without Docker

```bash
pnpm install
pnpm -r build
node packages/cli/dist/index.js onboard   # Interactive setup wizard
node packages/cli/dist/index.js start --migrate
```

---

**Full documentation:** https://forgeai-dev.github.io/ForgeAI/docs.html
