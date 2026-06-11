from fastapi import FastAPI
from pydantic import BaseModel
import json, os

app = FastAPI()

# ── Storage file (persists across restarts) ──────────────────────────────────
DATA_FILE = "blocked.json"

def load():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE) as f:
            data = json.load(f)
            return set(data.get("muted", [])), set(data.get("archived", []))
    return set(), set()

def save():
    with open(DATA_FILE, "w") as f:
        json.dump({"muted": list(muted), "archived": list(archived)}, f)

muted, archived = load()

# ── Models ────────────────────────────────────────────────────────────────────
class JidRequest(BaseModel):
    jid: str

# ── Core endpoint — Node.js calls this before every message ──────────────────
@app.get("/should-respond")
def should_respond(jid: str):
    blocked = jid in muted or jid in archived
    reason  = "muted" if jid in muted else ("archived" if jid in archived else None)
    return {"respond": not blocked, "reason": reason}

# ── Mute ─────────────────────────────────────────────────────────────────────
@app.post("/mute")
def mute_user(req: JidRequest):
    muted.add(req.jid)
    save()
    return {"status": "muted", "jid": req.jid}

@app.delete("/mute")
def unmute_user(req: JidRequest):
    muted.discard(req.jid)
    save()
    return {"status": "unmuted", "jid": req.jid}

# ── Archive ───────────────────────────────────────────────────────────────────
@app.post("/archive")
def archive_user(req: JidRequest):
    archived.add(req.jid)
    save()
    return {"status": "archived", "jid": req.jid}

@app.delete("/archive")
def unarchive_user(req: JidRequest):
    archived.discard(req.jid)
    save()
    return {"status": "unarchived", "jid": req.jid}

# ── List all blocked ──────────────────────────────────────────────────────────
@app.get("/blocked")
def list_blocked():
    return {
        "muted":    list(muted),
        "archived": list(archived),
        "total":    len(muted) + len(archived)
    }

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}
