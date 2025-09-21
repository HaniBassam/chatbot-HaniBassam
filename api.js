import express from "express";
import cors from "cors";
import { readFile, writeFile } from "fs/promises";
import crypto from "crypto";

const app = express();
const PORT = 4000; // kør API’et på en anden port end din SSR server

// Middleware
app.use(express.json()); // forstår JSON-body
app.use(cors());         // åbner for fetch fra andre domæner

const DATA_FILE = "./data/messages.json";

// Helper: læs beskeder
async function readMessages() {
  try {
    const data = await readFile(DATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return []; // hvis filen er tom eller ikke findes
  }
}

// Helper: skriv beskeder
async function writeMessages(messages) {
  await writeFile(DATA_FILE, JSON.stringify(messages, null, 2));
}

// GET /messages (hent alle)
app.get("/messages", async (req, res) => {
  const messages = await readMessages();
  res.json(messages);
});

// POST /messages (opret ny)
app.post("/messages", async (req, res) => {
  const { text, sender } = req.body;

  if (!text || !sender) {
    return res.status(400).json({ error: "Text and sender are required" });
  }

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
});

// Start server
app.listen(PORT, () => {
  console.log(`REST API running on http://localhost:${PORT}`);
});