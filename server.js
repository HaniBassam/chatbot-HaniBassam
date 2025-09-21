import express from "express";
import cors from "cors";
import path from "path";
import { readFile, writeFile } from "fs/promises";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { responses } from "./responses.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, "data", "messages.json");

// --- Setup ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.use(cors());

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
  return `Jeg har ikke noget smart svar på det endnu, ${name || "ven"} 🤖`;
}

// --- In-memory history ---
const history = [];

// --- Routes ---
app.get("/", (req, res) => {
  res.render("index", {
    name: "",
    message: "",
    answer: "",
    history,
    error: "",
  });
});
app.get("/chat", (req, res) => res.redirect("/"));

app.post("/chat", async (req, res, next) => {
  try {
    const name = (req.body?.name || "Anonym").trim();
    const message = (req.body?.message || "").trim();

    if (!message) {
      return res.render("index", {
        name,
        message: "",
        answer: "",
        history,
        error: "⚠️ Skriv en besked først.",
      });
    }

    const answer = await getReply(message, name);
    const ts = new Date().toISOString();

    const userEntry = { type: "user", name, text: message, ts };
    const botEntry = { type: "bot", name: "Hanibot", text: answer, ts };

    history.push(userEntry);
    history.push(botEntry);

    try {
      const messages = await readMessages();
      messages.push(
        {
          id: crypto.randomUUID(),
          date: ts,
          text: message,
          sender: name || "Anonym",
        },
        {
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          text: answer,
          sender: "Hanibot",
        }
      );
      await writeMessages(messages);
    } catch (persistErr) {
      console.error("Kunne ikke gemme beskeder", persistErr);
    }

    res.render("index", { name, message: "", answer, history, error: "" });
  } catch (err) {
    next(err);
  }
});

// --- REST API ---
app.get("/messages", async (req, res, next) => {
  try {
    const messages = await readMessages();
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

app.post("/messages", async (req, res, next) => {
  try {
    const { text, sender } = req.body || {};
    if (!text || !sender) {
      return res.status(400).json({ error: "Text and sender required" });
    }

    const newMessage = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      text,
      sender,
    };

    const messages = await readMessages();
    messages.push(newMessage);
    await writeMessages(messages);

    res.status(201).json(newMessage);
  } catch (err) {
    next(err);
  }
});

app.put("/messages/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { text, sender } = req.body || {};

    const messages = await readMessages();
    const message = messages.find((m) => m.id === id);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (typeof text === "string" && text.trim()) {
      message.text = text;
    }
    if (typeof sender === "string" && sender.trim()) {
      message.sender = sender;
    }

    await writeMessages(messages);
    res.json(message);
  } catch (err) {
    next(err);
  }
});

app.delete("/messages/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const messages = await readMessages();
    const message = messages.find((m) => m.id === id);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const updated = messages.filter((m) => m.id !== id);
    await writeMessages(updated);

    res.json({ success: true, deleted: message });
  } catch (err) {
    next(err);
  }
});

// --- Error handler (simple) ---
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500);
  if (req.accepts("json")) {
    res.json({ error: "Server error" });
  } else {
    res.type("text").send("Server error");
  }
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
