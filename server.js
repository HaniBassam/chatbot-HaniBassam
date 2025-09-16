import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Formular data (POST)
app.use(express.urlencoded({ extended: false }));

// Statisk (så /style.css virker)
app.use(express.static(path.join(__dirname, "public")));

// In-memory chat (vi persisterer senere)
const history = [];

// GET /
app.get("/", (req, res) => {
  res.render("index", {
    history, // []
    name: "", // tom som standard
    error: "", // ingen fejl
  });
});

app.get("/chat", (req, res) => {
  res.render("index", { title: "Chatbot", messages: [] });
});

app.listen(PORT, () => {
  console.log(`Chatbot running on http://localhost:${PORT}`);
});
