# 🤖 Nuh AI — WhatsApp Bot Platform

**Nuh 1.0** — Intelligent WhatsApp bot powered by Groq API, built with Spring Boot, Node.js, and Python. Deployed on AWS EC2.

**Owner:** Sameer Shaik | **Company:** N.S (Nadeem Shaik) | **Region:** AWS Sydney ap-southeast-2

## Architecture
- Node.js + Baileys — WhatsApp message handler
- Spring Boot AI Gateway — REST API (:8080)
- Python FastAPI — block/mute/memory (:8000)
- Groq API — llama-3.3-70b-versatile (free, fast 1-2s)
- Docker Compose — one command to run everything
- AWS EC2 — m7i-flex.large, Ubuntu 26.04

## Quick Start
```bash
docker compose up -d
docker compose logs -f whatsapp-bot
```

## Docs
See the [docs/](docs/) folder for full guides.
