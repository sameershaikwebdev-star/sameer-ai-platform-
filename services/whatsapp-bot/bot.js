// SameerBot — WhatsApp AI Bot
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, isJidBroadcast } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const pino   = require("pino");
const fs     = require("fs");
const axios  = require("axios");

const CONFIG = {
    authDir: "./auth", botName: "SameerBot", aiName: "Nuh", ownerName: "Sameer",
    prefix: "!", reconnectDelay: 5000, maxReconnectAttempts: 10,
    springApiUrl:  process.env.SPRING_API_URL  || "http://localhost:8080/api/ai/chat",
    pythonService: process.env.PYTHON_API_URL  || "http://python-service:8000",
    aiModel: "Nuh",
};

const humanModeUsers = new Set();
const logger = pino({ level: "silent" });

function getText(msg) {
    return msg.message?.conversation ||
           msg.message?.extendedTextMessage?.text ||
           msg.message?.imageMessage?.caption ||
           msg.message?.videoMessage?.caption || "";
}

function log(type, text) {
    const icons = { info:"ℹ️", success:"✅", error:"❌", warn:"⚠️", msg:"💬", ai:"🤖", block:"🚫" };
    console.log(`[${new Date().toLocaleTimeString()}] ${icons[type]??'•'} ${text}`);
}

// ── Ask Python: should bot respond to this JID? ───────────────────────────────
async function isBlocked(jid) {
    try {
        const { data } = await axios.get(
            `${CONFIG.pythonService}/should-respond`,
            { params: { jid }, timeout: 3000 }
        );
        return !data.respond;
    } catch {
        return false; // if Python is down, allow message
    }
}

function wantsHumanChat(text) {
    const t = text.toLowerCase();
    return t.includes("chat with sameer") || t.includes("talk to sameer") ||
           t.includes("speak to sameer")  || t.includes("chat with your boss") ||
           t.includes("talk to your boss")|| t.includes("connect me to sameer") ||
           t.includes("i want sameer")    || t.includes("i need sameer") ||
           /^sameer\s*$/i.test(t);
}

function isWakingAI(text) {
    const t = text.toLowerCase().trim();
    return t.startsWith("hey nuh") || t.startsWith("nuh,") ||
           t.startsWith("nuh ")    || t === "nuh" ||
           t.startsWith("ok nuh")  || t.startsWith("hi nuh");
}

async function askAI(userText) {
    try {
        log("ai", `Asking: ${userText}`);
        const { data } = await axios.get(CONFIG.springApiUrl, {
            params: { message: userText }, timeout: 120000,
        });
        return data || "No response.";
    } catch (err) {
        return "❌ AI server offline.";
    }
}

// ─── COMMANDS ─────────────────────────────────────────────────────────────────
const commands = new Map();
function registerCommand(name, description, handler) {
    commands.set(name.toLowerCase(), { description, handler });
}

registerCommand("ping", "Check bot speed", async (sock, msg) => {
    const start = Date.now();
    await sock.sendMessage(msg.key.remoteJid, { text: "🏓 Pong!" });
    await sock.sendMessage(msg.key.remoteJid, { text: `⚡ ${Date.now()-start}ms` });
});

registerCommand("help", "Show all commands", async (sock, msg) => {
    const list = [...commands.entries()]
        .map(([cmd,{description}]) => `  ${CONFIG.prefix}${cmd} — ${description}`)
        .join("\n");
    await sock.sendMessage(msg.key.remoteJid, {
        text: `📋 Commands\n\n${list}\n\n💡 Ask me anything or say "I want to chat with ${CONFIG.ownerName}"`
    });
});

registerCommand("info", "Bot information", async (sock, msg) => {
    const { data } = await axios.get(`${CONFIG.pythonService}/blocked`).catch(() => ({ data: {} }));
    await sock.sendMessage(msg.key.remoteJid, {
        text:
            `🤖 Nuh 1.0\n` +
            `✅ Online\n` +
            `🏢 Company: N.S\n` +
            `👨‍💻 Created by: Sameer Shaik\n` +
            `🔇 Muted: ${data.muted?.length ?? 0} | 📦 Archived: ${data.archived?.length ?? 0}`
    });
});

registerCommand("ask", "Ask AI directly", async (sock, msg, args) => {
    if (!args.length) return sock.sendMessage(msg.key.remoteJid, { text: `Usage: ${CONFIG.prefix}ask <question>` });
    const jid = msg.key.remoteJid;
    await sock.sendMessage(jid, { text: `🤖 ${CONFIG.aiName} is thinking...` });
    await sock.sendPresenceUpdate("composing", jid);
    const reply = await askAI(args.join(" "));
    await sock.sendPresenceUpdate("paused", jid);
    await sock.sendMessage(jid, { text: reply });
});

registerCommand("time", "Show current time", async (sock, msg) => {
    const now = new Date();
    await sock.sendMessage(msg.key.remoteJid, {
        text: `🕒 Current Time\n\n📅 ${now.toLocaleDateString()}\n⏰ ${now.toLocaleTimeString()}`
    });
});

registerCommand("mute", "Mute a user — !mute <jid>", async (sock, msg, args) => {
    const jid = args[0] || msg.key.remoteJid;
    await axios.post(`${CONFIG.pythonService}/mute`, { jid });
    log("block", `Muted: ${jid}`);
    await sock.sendMessage(msg.key.remoteJid, { text: `🔇 Muted: ${jid}\nBot will not reply to this user.` });
});

registerCommand("unmute", "Unmute a user — !unmute <jid>", async (sock, msg, args) => {
    const jid = args[0] || msg.key.remoteJid;
    await axios.delete(`${CONFIG.pythonService}/mute`, { data: { jid } });
    log("info", `Unmuted: ${jid}`);
    await sock.sendMessage(msg.key.remoteJid, { text: `🔊 Unmuted: ${jid}\nBot will now reply.` });
});

registerCommand("archive", "Archive a user — !archive <jid>", async (sock, msg, args) => {
    const jid = args[0] || msg.key.remoteJid;
    await axios.post(`${CONFIG.pythonService}/archive`, { jid });
    log("block", `Archived: ${jid}`);
    await sock.sendMessage(msg.key.remoteJid, { text: `📦 Archived: ${jid}\nBot will not reply to this user.` });
});

registerCommand("unarchive", "Unarchive a user — !unarchive <jid>", async (sock, msg, args) => {
    const jid = args[0] || msg.key.remoteJid;
    await axios.delete(`${CONFIG.pythonService}/archive`, { data: { jid } });
    log("info", `Unarchived: ${jid}`);
    await sock.sendMessage(msg.key.remoteJid, { text: `📂 Unarchived: ${jid}\nBot will now reply.` });
});

registerCommand("blocked", "Show all muted and archived users", async (sock, msg) => {
    const { data } = await axios.get(`${CONFIG.pythonService}/blocked`).catch(() => ({ data: { muted:[], archived:[] } }));
    const muted    = data.muted?.join("\n  ")    || "none";
    const archived = data.archived?.join("\n  ") || "none";
    await sock.sendMessage(msg.key.remoteJid, {
        text: `🔇 Muted:\n  ${muted}\n\n📦 Archived:\n  ${archived}`
    });
});

// ─── BOT ──────────────────────────────────────────────────────────────────────
let reconnectAttempts = 0;

async function startBot() {
    try {
        if (!fs.existsSync(CONFIG.authDir)) fs.mkdirSync(CONFIG.authDir, { recursive: true });
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(CONFIG.authDir);

        const sock = makeWASocket({
            version, logger, printQRInTerminal: false,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            generateHighQualityLinkPreview: true,
            syncFullHistory: false, markOnlineOnConnect: true,
            getMessage: async () => ({ conversation: "" }),
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) { console.clear(); console.log("\n📱 Scan QR Code:\n"); qrcode.generate(qr, { small: true }); }
            if (connection === "open") {
                reconnectAttempts = 0;
                log("success", `${CONFIG.botName} connected — ${sock.user?.id}`);
                log("info", `AI: ${CONFIG.aiName} | Groups: IGNORED | Python block service: ${CONFIG.pythonService}`);
            }
            if (connection === "close") {
                const code = lastDisconnect?.error?.output?.statusCode;
                log("error", `Connection closed (code: ${code})`);
                if (code === DisconnectReason.loggedOut) {
                    fs.rmSync(CONFIG.authDir, { recursive: true, force: true });
                    reconnectAttempts = 0;
                    return startBot();
                }
                if (reconnectAttempts < CONFIG.maxReconnectAttempts) {
                    reconnectAttempts++;
                    setTimeout(startBot, CONFIG.reconnectDelay);
                } else { process.exit(1); }
            }
        });

        sock.ev.on("messages.upsert", async ({ messages, type }) => {
            if (type !== "notify") return;
            for (const msg of messages) {
                try {
                    if (!msg.message || msg.key.fromMe) continue;

                    const jid     = msg.key.remoteJid;
                    const isGroup = jid.endsWith("@g.us");

                    // 1. Block groups
                    if (isGroup) { log("block", `[GROUP IGNORED] ${jid}`); continue; }
                    if (isJidBroadcast(jid)) continue;

                    // 2. Block muted/archived via Python
                    if (await isBlocked(jid)) {
                        log("block", `[BLOCKED] ${jid} — bot silent`);
                        continue;
                    }

                    const text   = getText(msg).trim();
                    const sender = msg.pushName || "User";
                    log("msg", `[DM] ${sender}: ${text || "(media)"}`);
                    if (!text) continue;

                    // 3. Greeting
                    if (/^(hi|hello|hey|hii|hlo)$/i.test(text)) {
                        await sock.sendMessage(jid, {
                            text:
                                `👋 Hello ${sender}!\n` +
                                `I'm ${CONFIG.aiName}, ${CONFIG.ownerName}'s AI assistant.\n\n` +
                                `Type ${CONFIG.prefix}help for commands or ask me anything 💬\n` +
                                `Want to talk to ${CONFIG.ownerName}? Say "I want to chat with ${CONFIG.ownerName}"`
                        });
                        continue;
                    }

                    // 4. Time/date
                    const lower = text.toLowerCase();
                    if (lower.includes("what time") || lower.includes("what date") || lower.includes("current time")) {
                        const now = new Date();
                        await sock.sendMessage(jid, {
                            text: `🕒 Current Time\n\n📅 ${now.toLocaleDateString()}\n⏰ ${now.toLocaleTimeString()}`
                        });
                        continue;
                    }

                    // 5. User wants Sameer
                    if (wantsHumanChat(text)) {
                        humanModeUsers.add(jid);
                        log("warn", `Human mode ON for ${sender}`);
                        await sock.sendMessage(jid, {
                            text:
                                `Got it! I'll let ${CONFIG.ownerName} know 🙋\n\n` +
                                `Please wait — ${CONFIG.ownerName} will reply soon.\n\n` +
                                `💡 Need help while waiting? Say:\n"Hey ${CONFIG.aiName}, <your question>"`
                        });
                        continue;
                    }

                    // 6. Human mode
                    if (humanModeUsers.has(jid)) {
                        if (isWakingAI(text)) {
                            humanModeUsers.delete(jid);
                            log("info", `AI mode restored for ${sender}`);
                            const question = text.replace(/^(hey nuh|ok nuh|hi nuh|nuh[, ]*)/i, "").trim();
                            if (question) {
                                await sock.sendMessage(jid, { text: `🤖 ${CONFIG.aiName} here! Let me help...` });
                                await sock.sendPresenceUpdate("composing", jid);
                                const reply = await askAI(question);
                                await sock.sendPresenceUpdate("paused", jid);
                                await sock.sendMessage(jid, { text: reply });
                            } else {
                                await sock.sendMessage(jid, { text: `🤖 ${CONFIG.aiName} is back! What can I help you with?` });
                            }
                        } else {
                            log("info", `[HUMAN MODE] ${sender}: ${text} — waiting for ${CONFIG.ownerName}`);
                        }
                        continue;
                    }

                    // 7. Commands
                    if (text.startsWith(CONFIG.prefix)) {
                        const parts = text.slice(1).trim().split(/\s+/);
                        const cmd   = parts.shift().toLowerCase();
                        const args  = parts;
                        if (commands.has(cmd)) await commands.get(cmd).handler(sock, msg, args);
                        else await sock.sendMessage(jid, { text: `❓ Unknown: ${CONFIG.prefix}${cmd}\nType ${CONFIG.prefix}help` });
                        continue;
                    }

                    // 8. AI fallback
                    if (text) {
                        await sock.sendMessage(jid, { text: `🤖 ${CONFIG.aiName} is thinking...` });
                        await sock.sendPresenceUpdate("composing", jid);
                        const aiReply = await askAI(text);
                        await sock.sendPresenceUpdate("paused", jid);
                        await sock.sendMessage(jid, { text: aiReply || "❌ No response" });
                    }

                } catch (err) { log("error", err.message); }
            }
        });

        return sock;
    } catch (err) {
        log("error", `Fatal: ${err.message}`);
        setTimeout(startBot, CONFIG.reconnectDelay);
    }
}

process.on("uncaughtException",  (err) => log("error", `Uncaught: ${err.message}`));
process.on("unhandledRejection", (err) => log("error", `Unhandled: ${err}`));
process.on("SIGINT", () => { log("warn", "Shutting down..."); process.exit(0); });
startBot();
