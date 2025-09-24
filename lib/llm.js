import path from "path";
import { appendFile } from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.join(__dirname, "..", "data", "unanswered.log");

function buildSystemPrompt() {
  const basePrompt = process.env.OPENAI_SYSTEM_PROMPT ||
    "Du er en hjælpsom dansk chatbot der svarer venligt, kort og præcist.";
  return `${basePrompt}`;
}

export async function logUnansweredQuestion(question, name) {
  const entry = {
    ts: new Date().toISOString(),
    name: name || "",
    question: question || "",
  };

  try {
    await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf-8");
  } catch (err) {
    console.error("[log:error] Kunne ikke skrive til unanswered.log", err);
  }
}

export async function fetchLlmReply(question, name) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const messages = [
    { role: "system", content: buildSystemPrompt() },
    {
      role: "user",
      content: `Bruger: ${name || "ukendt"}\nSpørgsmål: ${question}`,
    },
  ];

  const payload = {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: Number(process.env.OPENAI_TEMPERATURE ?? 0.3),
    max_tokens: Number(process.env.OPENAI_MAX_TOKENS ?? 200),
    messages,
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[llm:error] ${response.status} ${response.statusText}`, errorText);
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" ? content.trim() : null;
  } catch (err) {
    console.error("[llm:error] Kunne ikke hente svar", err);
    return null;
  }
}
