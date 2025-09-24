import express from "express";
import cors from "cors";
import { readFile, writeFile } from "fs/promises";
import crypto from "crypto";

const app = express();
const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 4000; // kør API'et på en anden port end din SSR server

const MAX_MESSAGE_LENGTH = Number(process.env.MESSAGE_MAX_LENGTH || 500);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:5173").split(",").map((o) => o.trim()).filter(Boolean);

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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

// Middleware
app.use(express.json()); // forstår JSON-body
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      const err = new HttpError(403, "Ikke tilladt oprindelse");
      callback(err);
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
); // åbner for fetch fra andre domæner

const DATA_FILE = "./data/messages.json";

// Helper: læs beskeder
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

// Helper: skriv beskeder
async function writeMessages(messages) {
  await writeFile(DATA_FILE, JSON.stringify(messages, null, 2), "utf-8");
}

// GET /messages (hent alle)
app.get(
  "/messages",
  asyncHandler(async (req, res) => {
    const messages = await readMessages();
    res.json(messages);
  })
);

// POST /messages (opret ny)
app.post(
  "/messages",
  asyncHandler(async (req, res) => {
    const { text, sender } = validateMessageFields(req.body || {});

    const newMsg = {
      id: crypto.randomUUID(),
      text,
      sender,
      date: new Date().toISOString(),
    };

    const messages = await readMessages();
    messages.push(newMsg);
    await writeMessages(messages);

    res.status(201).json(newMsg);
  })
);

app.put(
  "/messages/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const messages = await readMessages();
    const msg = messages.find((m) => m.id === id);

    if (!msg) {
      throw new HttpError(404, "Message not found");
    }

    if (typeof req.body?.text === "string") {
      const cleanText = sanitizeInput(req.body.text);
      if (!cleanText) {
        throw new HttpError(400, "Text må ikke være tom");
      }
      if (cleanText.length > MAX_MESSAGE_LENGTH) {
        throw new HttpError(413, `Text må højst være ${MAX_MESSAGE_LENGTH} tegn`);
      }
      msg.text = cleanText;
    }

    if (typeof req.body?.sender === "string") {
      const cleanSender = sanitizeInput(req.body.sender);
      if (!cleanSender) {
        throw new HttpError(400, "Sender må ikke være tom");
      }
      if (cleanSender.length > 80) {
        throw new HttpError(413, "Sender må højst være 80 tegn");
      }
      msg.sender = cleanSender;
    }

    await writeMessages(messages);
    res.json(msg);
  })
);

app.delete(
  "/messages/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const messages = await readMessages();
    const exists = messages.find((m) => m.id === id);
    if (!exists) {
      throw new HttpError(404, "Message not found");
    }

    const filtered = messages.filter((m) => m.id !== id);
    await writeMessages(filtered);
    res.json({ success: true });
  })
);

app.use((err, req, res, next) => {
  const status = err instanceof HttpError && err.status ? err.status : 500;
  const payload = {
    error: err.message || "Server error",
  };

  if (err instanceof HttpError && err.details) {
    payload.details = err.details;
  }

  if (status >= 500) {
    console.error("[api error]", err);
  }

  if (res.headersSent) {
    return next(err);
  }

  res.status(status).json(payload);
});

// Start server
app.listen(PORT, () => {
  console.log(`REST API running on http://localhost:${PORT}`);
});
