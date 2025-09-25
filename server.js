import express from "express";
import cors from "cors";
import path from "path";
import { readFile, writeFile } from "fs/promises";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { responses } from "./responses.js";
import { fetchLlmReply, logUnansweredQuestion } from "./lib/llm.js";
import dotenv from "dotenv";
dotenv.config({ path: "./OPEN-AI-KEY/.env" });

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "data", "messages.json");

const MAX_MESSAGE_LENGTH = Number(process.env.MESSAGE_MAX_LENGTH || 500);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173").split(",").map((o) => o.trim()).filter(Boolean);

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function sanitizeInput(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*?>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

function validateMessageFields({ text, sender }) {
  const sanitizedText = sanitizeInput(text);
  const sanitizedSender = sanitizeInput(sender);

  if (!sanitizedText) {
    throw new HttpError(400, "Text is required");
  }

  if (sanitizedText.length > MAX_MESSAGE_LENGTH) {
    throw new HttpError(413, `Text må højst være ${MAX_MESSAGE_LENGTH} tegn`);
  }

  if (!sanitizedSender) {
    throw new HttpError(400, "Sender is required");
  }

  if (sanitizedSender.length > 80) {
    throw new HttpError(413, "Sender må højst være 80 tegn");
  }

  return { text: sanitizedText, sender: sanitizedSender };
}

// --- Setup ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json());
app.use(express.static("public"));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      callback(new HttpError(403, "Ikke tilladt oprindelse"));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

// --- Persistence helpers ---
async function readMessages() {
  try {
    const data = await readFile(DATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      await writeMessages([]);
      return [];
    }
    throw err;
  }
}

async function writeMessages(messages) {
  await writeFile(DATA_FILE, JSON.stringify(messages, null, 2), "utf-8");
}

function mapStoredToHistory(entry) {
  const sender = entry.sender || "";
  const type = sender.toLowerCase() === "hanibot" || sender.toLowerCase() === "chatbot" ? "bot" : "user";
  return {
    id: entry.id,
    type,
    name: sender,
    text: entry.text,
    ts: entry.date,
  };
}

let history = [];

async function hydrateHistory() {
  try {
    const stored = await readMessages();
    history = stored.map(mapStoredToHistory);
  } catch (err) {
    console.error("[history:error] Kunne ikke hente tidligere beskeder", err);
    history = [];
  }
}

// --- Helpers (kept here to avoid extra files) ---
function timeGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "oppe sent? 🌙";
  if (h < 11) return "godmorgen ☀️";
  if (h < 17) return "god eftermiddag 🌤️";
  return "god aften 🌙";
}

/**
 * Gets a reply to a message based on the responses.js file.
 * @param {string} message - The message to reply to.
 * @param {string} name - The name of the user asking the question.
 * @returns {string} The reply to the user.
 */
async function getReply(message, name) {
  const lower = (message || "").toLowerCase();
  for (const r of responses) {
    if (r.keywords.some((k) => lower.includes(k))) {
      const greet = timeGreeting();
      const a = r.answers[Math.floor(Math.random() * r.answers.length)];
      return a
        .replace(/{{\s*name\s*}}/g, name || "ven")
        .replace(/{{\s*greet\s*}}/g, greet);
    }
  }
  await logUnansweredQuestion(message, name);

  const llmAnswer = await fetchLlmReply(message, name);
  if (llmAnswer) {
    return llmAnswer;
  }

  return `Jeg har ikke noget smart svar på det endnu, ${name || "ven"} 🤖`;
}

// --- Routes ---
app.get("/", (req, res) => {
  res.render("index");
});
app.get("/chat", (req, res) => res.redirect("/"));

// --- REST API ---
async function getHistory(req, res, next) {
  try {
    res.json(history);
  } catch (err) {
    next(err);
  }
}

app.get("/api/messages", getHistory);
app.get("/messages", getHistory);

app.post(["/api/messages", "/messages"], async (req, res, next) => {
  try {
    const { text, sender } = validateMessageFields(req.body || {});

    const userMessage = {
      id: crypto.randomUUID(),
      type: "user",
      name: sender,
      text,
      ts: new Date().toISOString(),
    };

    const messages = await readMessages();
    messages.push({
      id: userMessage.id,
      date: userMessage.ts,
      text: userMessage.text,
      sender: userMessage.name,
    });

    const answer = await getReply(text, sender);
    const botMessage = {
      id: crypto.randomUUID(),
      type: "bot",
      name: "Hanibot",
      text: answer,
      ts: new Date().toISOString(),
    };

    messages.push({
      id: botMessage.id,
      date: botMessage.ts,
      text: botMessage.text,
      sender: botMessage.name,
    });

    history.push(userMessage, botMessage);
    await writeMessages(messages);

    res.status(201).json({ userMessage, botMessage });
  } catch (err) {
    next(err);
  }
});

app.put(["/api/messages/:id", "/messages/:id"], async (req, res, next) => {
  try {
    const { id } = req.params;
    const { text, sender } = req.body || {};

    const messages = await readMessages();
    const message = messages.find((m) => m.id === id);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (typeof text === "string") {
      const cleanText = sanitizeInput(text);
      if (!cleanText) {
        throw new HttpError(400, "Text må ikke være tom");
      }
      if (cleanText.length > MAX_MESSAGE_LENGTH) {
        throw new HttpError(413, `Text må højst være ${MAX_MESSAGE_LENGTH} tegn`);
      }
      message.text = cleanText;
      const historyEntry = history.find((entry) => entry.id === id);
      if (historyEntry) {
        historyEntry.text = cleanText;
      }
    }

    if (typeof sender === "string") {
      const cleanSender = sanitizeInput(sender);
      if (!cleanSender) {
        throw new HttpError(400, "Sender må ikke være tom");
      }
      if (cleanSender.length > 80) {
        throw new HttpError(413, "Sender må højst være 80 tegn");
      }
      message.sender = cleanSender;
      const historyEntry = history.find((entry) => entry.id === id);
      if (historyEntry) {
        historyEntry.name = cleanSender;
        historyEntry.type = cleanSender.toLowerCase() === "hanibot" || cleanSender.toLowerCase() === "chatbot" ? "bot" : "user";
      }
    }

    await writeMessages(messages);
    res.json(message);
  } catch (err) {
    next(err);
  }
});

app.delete(["/api/messages/:id", "/messages/:id"], async (req, res, next) => {
  try {
    const { id } = req.params;
    const messages = await readMessages();
    const message = messages.find((m) => m.id === id);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const updated = messages.filter((m) => m.id !== id);
    history = history.filter((entry) => entry.id !== id);
    await writeMessages(updated);

    res.json({ success: true, deleted: message });
  } catch (err) {
    next(err);
  }
});

// --- Error handler (simple) ---
app.use((err, req, res, next) => {
  const status = err instanceof HttpError && err.status ? err.status : 500;
  const payload = {
    error: err.message || "Server error",
  };

  if (err instanceof HttpError && err.details) {
    payload.details = err.details;
  }

  if (status >= 500) {
    console.error("[server error]", err);
  }

  if (res.headersSent) {
    return next(err);
  }

  res.status(status);
  if (req.accepts("json")) {
    res.json(payload);
  } else {
    res.type("text").send(payload.error);
  }
});

// --- Start ---
async function start() {
  await hydrateHistory();
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Kunne ikke starte serveren", err);
  process.exit(1);
});
