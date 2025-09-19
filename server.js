import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { responses } from "./responses.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Setup ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

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

    history.push({ type: "user", name, text: message, ts });
    history.push({ type: "bot", name: "Hanibot", text: answer, ts });

    res.render("index", { name, message: "", answer, history, error: "" });
  } catch (err) {
    next(err);
  }
});

// Minimal REST endpoint for tests/tools
app.get("/messages", (req, res) => {
  res.status(200).json(history);
});

// --- Error handler (simple) ---
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).type("text").send("Server error");
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
