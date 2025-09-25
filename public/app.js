const chatList = document.getElementById("chat");
const chatPanel = document.getElementById("chatPanel");
const form = document.getElementById("chat-form");
const typing = document.getElementById("typing");
const errorBox = document.getElementById("error");
const sendButton = document.getElementById("send-btn");
const nameInput = form?.elements.namedItem("name");
const messageInput = form?.elements.namedItem("message");
const SESSION_KEY = "chatSessionActive";

function normalizeMessage(msg) {
  if (!msg) return null;
  const sender = msg.name ?? msg.sender ?? "";
  const type = msg.type || (sender.toLowerCase() === "hanibot" || sender.toLowerCase() === "chatbot" ? "bot" : "user");
  const id = msg.id || msg.ts || msg.date || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    type,
    name: sender || (type === "bot" ? "Hanibot" : "Anonym"),
    text: msg.text || "",
    ts: msg.ts || msg.date || new Date().toISOString(),
  };
}

function renderMessage(message) {
  const normalized = normalizeMessage(message);
  if (!normalized) return;

  const li = document.createElement("li");
  li.className = `chat__item chat__item--${normalized.type}`;
  li.dataset.id = normalized.id;

  const bubble = document.createElement("div");
  bubble.className = `bubble bubble--${normalized.type}`;

  const strong = document.createElement("strong");
  strong.textContent = `${normalized.name}:`;
  bubble.appendChild(strong);

  const span = document.createElement("span");
  span.textContent = normalized.text;
  bubble.appendChild(span);

  li.appendChild(bubble);
  chatList?.appendChild(li);
}

function renderMessages(messages) {
  if (!chatList) return;
  chatList.innerHTML = "";
  messages.forEach((msg) => renderMessage(msg));
  scrollToBottom();
}

function showError(message) {
  if (!errorBox) return;
  if (!message) {
    errorBox.textContent = "";
    errorBox.hidden = true;
    return;
  }
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function setBusy(state) {
  if (typing) typing.style.display = state ? "block" : "none";
  if (sendButton) sendButton.disabled = state;
}

function scrollToBottom() {
  if (chatPanel) {
    chatPanel.scrollTop = chatPanel.scrollHeight;
  }
}

async function loadHistory() {
  try {
    const res = await fetch("/api/messages");
    if (!res.ok) {
      throw new Error("Kunne ikke hente historik");
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      renderMessages(data);
      showError("");
    }
  } catch (err) {
    console.error(err);
    showError("Kunne ikke hente historik lige nu.");
  }
}

async function sendMessage(event) {
  event.preventDefault();
  if (!messageInput) return;

  const rawName = nameInput?.value?.trim();
  const name = rawName || "Anonym";
  const text = messageInput.value.trim();

  if (!text) {
    showError("⚠️ Skriv en besked først.");
    return;
  }

  showError("");
  setBusy(true);

  try {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sender: name, text }),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const errorMessage = payload?.error || "Kunne ikke sende beskeden.";
      throw new Error(errorMessage);
    }

    const userMessage = normalizeMessage(payload?.userMessage);
    const botMessage = normalizeMessage(payload?.botMessage);

    if (userMessage) {
      renderMessage(userMessage);
    }
    if (botMessage) {
      renderMessage(botMessage);
    }

    if (nameInput && userMessage) {
      nameInput.value = userMessage.name;
    }
    messageInput.value = "";
    messageInput.focus();
    scrollToBottom();
  } catch (err) {
    console.error(err);
    showError(err.message || "Noget gik galt. Prøv igen.");
  } finally {
    setBusy(false);
  }
}

async function ensureFreshSession() {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  if (sessionStorage.getItem(SESSION_KEY) === "1") {
    return;
  }
  try {
    const res = await fetch("/api/messages", { method: "DELETE" });
    if (!res.ok) {
      throw new Error("Kunne ikke nulstille historik");
    }
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch (err) {
    console.error(err);
    showError("Kunne ikke nulstille historik.");
  }
}

form?.addEventListener("submit", sendMessage);

ensureFreshSession().finally(loadHistory);
