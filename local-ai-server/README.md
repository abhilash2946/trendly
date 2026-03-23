# Trendly Local AI Server

This server provides local endpoints for Trendly frontend.

## 1) Prerequisites

- Node.js 18+
- Ollama installed and running
- Optional: pull a model (example):

```powershell
ollama pull llama3.2:3b
```

## 2) Setup

```powershell
cd local-ai-server
npm install
copy .env.example .env
```

## 3) Run

```powershell
npm run dev
```

Server runs at `http://localhost:5000`.

## Endpoints

- `GET /health`
- `POST /ai-stylist`
- `POST /classify-wardrobe`
- `POST /extract-text`
- `POST /event-parse`
- `POST /event-outfit-ideas`
- `POST /hairstyle-suggestions`
- `POST /local-events`

## Notes

- `POST /ai-stylist` returns structured JSON:

```json
{
  "suggestion": "Minimalist black streetwear outfit",
  "items": ["black jacket", "white sneakers", "slim jeans"],
  "summary": "Modern street fashion look"
}
```
