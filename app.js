const API_URL = "/api/chat";

const BOARD_MODELS = {
  ESP32: [
    "ESP32 DevKit (30/38 pin)",
    "ESP32-S2",
    "ESP32-S3",
    "ESP32-C3",
    "ESP32-C6",
    "ESP32-H2",
    "ESP32-CAM (AI-Thinker)",
    "ESP32-WROOM-32 / WROVER",
    "ESP32 อื่นๆ",
  ],
  ESP8266: [
    "ESP8266 NodeMCU v1.0 (ESP-12E)",
    "ESP8266 NodeMCU v2 / v3",
    "Wemos D1 Mini (ESP8266)",
    "ESP-01 / ESP-01S",
    "ESP-12F / ESP-12S",
    "ESP8266 อื่นๆ",
  ],
  Arduino: [
    "Arduino Uno R3",
    "Arduino Uno R4 Minima",
    "Arduino Uno R4 WiFi",
    "Arduino Nano (ATmega328P)",
    "Arduino Nano Every",
    "Arduino Nano 33 IoT",
    "Arduino Nano 33 BLE / Sense",
    "Arduino Nano RP2040 Connect",
    "Arduino Mega 2560",
    "Arduino Micro / Leonardo",
    "Arduino Due",
    "Arduino MKR series",
    "Arduino รุ่นอื่นๆ",
  ],
};

// เก็บ API Key เฉพาะในหน่วยความจำชั่วคราวของเซสชันนี้ ไม่บันทึกลง localStorage หรือดิสก์
let sessionApiKey = "";
let sessionImageDataUrl = null;
let isSending = false;

function safeLoadArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

const state = {
  boardFamily: localStorage.getItem("mcu_family") || "ESP32",
  boardModel: localStorage.getItem("mcu_model") || "ESP32 DevKit (30/38 pin)",
  reasoningEffort: localStorage.getItem("mcu_reasoning") || "low",
  projectNote: localStorage.getItem("mcu_note") || "",
  pins: safeLoadArray("mcu_pins"),
  snippets: safeLoadArray("mcu_snippets"),
  wirings: safeLoadArray("mcu_wirings"),
  sessions: safeLoadArray("mcu_sessions"),
  currentSessionId: null,
};

const els = {
  menuBtn: document.getElementById("menuBtn"),
  closeDrawerBtn: document.getElementById("closeDrawerBtn"),
  drawer: document.getElementById("drawer"),
  drawerBackdrop: document.getElementById("drawerBackdrop"),
  drawerNewChatBtn: document.getElementById("drawerNewChatBtn"),
  drawerRecentList: document.getElementById("drawerRecentList"),
  quickBoardBtn: document.getElementById("quickBoardBtn"),
  currentBoardLabel: document.getElementById("currentBoardLabel"),
  keyDot: document.getElementById("keyDot"),
  openKeySheetBtn: document.getElementById("openKeySheetBtn"),
  closeKeySheetBtn: document.getElementById("closeKeySheetBtn"),
  keySheet: document.getElementById("keySheet"),
  keySheetBackdrop: document.getElementById("keySheetBackdrop"),
  newChatBtn: document.getElementById("newChatBtn"),
  providerSelect: document.getElementById("providerSelect"),
  modelInput: document.getElementById("modelInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  toggleKeyVisBtn: document.getElementById("toggleKeyVisBtn"),
  clearKeyBtn: document.getElementById("clearKeyBtn"),
  customUrlRow: document.getElementById("customUrlRow"),
  customBaseUrlInput: document.getElementById("customBaseUrlInput"),
  messages: document.getElementById("messages"),
  cameraInput: document.getElementById("cameraInput"),
  imagePreviewBar: document.getElementById("imagePreviewBar"),
  imagePreview: document.getElementById("imagePreview"),
  removeImageBtn: document.getElementById("removeImageBtn"),
  promptInput: document.getElementById("promptInput"),
  sendBtn: document.getElementById("sendBtn"),
  chatForm: document.getElementById("chatForm"),
  boardFamilySelect: document.getElementById("boardFamilySelect"),
  boardModelSelect: document.getElementById("boardModelSelect"),
  reasoningSelect: document.getElementById("reasoningSelect"),
  projectNoteInput: document.getElementById("projectNoteInput"),
  pinNameInput: document.getElementById("pinNameInput"),
  pinUsageInput: document.getElementById("pinUsageInput"),
  addPinBtn: document.getElementById("addPinBtn"),
  pinList: document.getElementById("pinList"),
  savedWiringList: document.getElementById("savedWiringList"),
  snippetSearchInput: document.getElementById("snippetSearchInput"),
  snippetList: document.getElementById("snippetList"),
  historyList: document.getElementById("historyList"),
};

function scrollMessagesToBottom() {
  requestAnimationFrame(() => {
    els.messages.scrollTop = els.messages.scrollHeight;
  });
}

function syncKeyboardOffset() {
  const vv = window.visualViewport;
  if (!vv) {
    document.documentElement.style.setProperty("--kb-offset", "0px");
    return;
  }
  const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  document.documentElement.style.setProperty("--kb-offset", `${kb}px`);
  scrollMessagesToBottom();
}

function iconSvg(symbolId, cls = "ico-xs") {
  return `<svg class="${cls}" aria-hidden="true"><use href="#${symbolId}" /></svg>`;
}

function savePersistentData() {
  try {
    localStorage.setItem("mcu_family", state.boardFamily);
    localStorage.setItem("mcu_model", state.boardModel);
    localStorage.setItem("mcu_reasoning", state.reasoningEffort);
    localStorage.setItem("mcu_note", state.projectNote);
    localStorage.setItem("mcu_pins", JSON.stringify(state.pins));
    localStorage.setItem("mcu_snippets", JSON.stringify(state.snippets));
    localStorage.setItem("mcu_wirings", JSON.stringify(state.wirings));
    localStorage.setItem("mcu_sessions", JSON.stringify(state.sessions));
  } catch (_) {}
}

function syncKeyBadge() {
  sessionApiKey = els.apiKeyInput.value.trim();
  if (sessionApiKey) {
    els.keyDot.textContent = "Key Ready";
    els.keyDot.className = "key-pill ready";
  } else {
    els.keyDot.textContent = "No Key";
    els.keyDot.className = "key-pill missing";
  }
}

function populateBoardModels(family, selectedModel) {
  const list = BOARD_MODELS[family] || BOARD_MODELS.ESP32;
  els.boardModelSelect.innerHTML = "";
  list.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    els.boardModelSelect.appendChild(opt);
  });
  state.boardModel = list.includes(selectedModel) ? selectedModel : list[0];
  els.boardModelSelect.value = state.boardModel;
  els.currentBoardLabel.textContent = state.boardModel;
}

function setDrawerOpen(open) {
  els.drawer.classList.toggle("open", open);
  els.drawerBackdrop.classList.toggle("hidden", !open);
  if (open) renderDrawerRecents();
}

function setKeySheetOpen(open) {
  els.keySheet.classList.toggle("hidden", !open);
  els.keySheetBackdrop.classList.toggle("hidden", !open);
}

function switchView(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  const target = document.getElementById(viewId);
  if (target) target.classList.add("active");
  document.querySelectorAll(".nav-link").forEach((n) => n.classList.toggle("active", n.dataset.view === viewId));
  setDrawerOpen(false);
  setKeySheetOpen(false);

  if (viewId === "chatView") renderCurrentSession();
  if (viewId === "pinsView") renderPinsAndWiring();
  if (viewId === "snippetsView") renderSnippets();
  if (viewId === "historyView") renderHistory();
}

function createSessionObject() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: "แชทใหม่",
    board: state.boardModel,
    messages: [],
  };
}

function startNewSession() {
  const session = createSessionObject();
  state.sessions.unshift(session);
  state.currentSessionId = session.id;
  savePersistentData();
  renderCurrentSession();
  renderDrawerRecents();
  switchView("chatView");
}

function deleteSession(sessionId) {
  const idx = state.sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) return;

  const wasCurrent = state.currentSessionId === sessionId;
  state.sessions.splice(idx, 1);

  if (state.sessions.length === 0) {
    const fresh = createSessionObject();
    state.sessions.unshift(fresh);
    state.currentSessionId = fresh.id;
  } else if (wasCurrent) {
    state.currentSessionId = state.sessions[0].id;
  }

  savePersistentData();
  renderCurrentSession();
  renderDrawerRecents();
  if (document.getElementById("historyView").classList.contains("active")) {
    renderHistory();
  }
}

function getCurrentSession() {
  let session = state.sessions.find((s) => s.id === state.currentSessionId);
  if (!session) {
    if (state.sessions.length > 0) {
      session = state.sessions[0];
      state.currentSessionId = session.id;
    } else {
      session = createSessionObject();
      state.sessions.unshift(session);
      state.currentSessionId = session.id;
      savePersistentData();
    }
  }
  return session;
}

function buildEmptyStateElement() {
  const div = document.createElement("div");
  div.className = "empty-state";
  div.innerHTML = `
    <div class="gemini-sparkle">${iconSvg("ic-spark", "ico-lg")}</div>
    <h1 class="greeting">พร้อมลุยบอร์ดหรือยัง</h1>
    <p class="greeting-sub">ถ่ายรูป Error / สายไฟ / โค้ด หรือพิมพ์ถาม ESP32, ESP8266 และ Arduino ได้เลย</p>
  `;
  return div;
}

function detectCodeExtension(lang, code) {
  const normalized = String(lang || "").trim().toLowerCase();
  const sample = String(code || "");

  if (["py", "python", "micropython", "circuitpython"].includes(normalized)) {
    return "py";
  }
  if (["ino", "cpp", "c++", "c", "arduino"].includes(normalized)) {
    return "ino";
  }
  if (/\b(def |import |from |machine\.|pin\(|time\.sleep)/i.test(sample) && !/\bvoid\s+(setup|loop)\s*\(/i.test(sample)) {
    return "py";
  }
  return "ino";
}

function formatCppOrArduinoCode(rawCode) {
  const lines = String(rawCode || "").replace(/\r\n/g, "\n").split("\n");
  let indent = 0;
  const tab = "  ";
  const out = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (out.length > 0 && out[out.length - 1] !== "") {
        out.push("");
      }
      continue;
    }

    if (trimmed.startsWith("}")) {
      indent = Math.max(0, indent - 1);
    }

    out.push(`${tab.repeat(indent)}${trimmed}`);

    const withoutStrings = trimmed.replace(/"(?:\\.|[^"\\])*"/g, "");
    const opens = (withoutStrings.match(/\{/g) || []).length;
    const closes = (withoutStrings.match(/\}/g) || []).length;
    indent = Math.max(0, indent + opens - closes);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function formatPythonCode(rawCode) {
  const lines = String(rawCode || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];

  for (const line of lines) {
    const normalizedIndent = line.replace(/\t/g, "    ");
    const match = normalizedIndent.match(/^(\s*)(.*)$/);
    const spaces = match ? match[1].length : 0;
    const body = match ? match[2].trimEnd() : normalizedIndent.trim();

    if (!body) {
      if (out.length > 0 && out[out.length - 1] !== "") {
        out.push("");
      }
      continue;
    }

    const level = Math.round(spaces / 4);
    out.push(`${"    ".repeat(Math.max(0, level))}${body}`);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function formatSnippetCode(code, ext) {
  if (ext === "py") {
    return formatPythonCode(code);
  }
  return formatCppOrArduinoCode(code);
}

function buildDownloadFilename(ext) {
  const safeBoard = String(state.boardModel || "sketch")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (ext === "py") {
    return `${safeBoard || "mcu"}_main.py`;
  }
  return `${safeBoard || "mcu_sketch"}.ino`;
}

function downloadCodeFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeStructuredReply(rawText) {
  const text = String(rawText ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  const codeBlocks = [];
  const protectedText = text.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const token = `@@CODE_BLOCK_${codeBlocks.length}@@`;
    codeBlocks.push({ lang: (lang || "").trim(), code: String(code || "").replace(/^\n+|\n+$/g, "") });
    return `\n\n${token}\n\n`;
  });

  const rawLines = protectedText.split("\n");
  const cleanedLines = [];
  let prevComparable = "";
  let blankStreak = 0;

  for (const rawLine of rawLines) {
    let line = rawLine.trim();
    line = line.replace(/^#{1,6}\s*/, "").replace(/^\*\*(.+?)\*\*:?\s*$/, "$1:");

    if (/^([*•])\s+/.test(line)) {
      line = line.replace(/^([*•])\s+/, "- ");
    }

    if (!line) {
      blankStreak += 1;
      if (blankStreak <= 1 && cleanedLines.length > 0) {
        cleanedLines.push("");
      }
      continue;
    }

    blankStreak = 0;

    const comparable = line
      .replace(/^[-•\d.)]+\s*/, "")
      .replace(/[：:。.!?\s]+/g, "")
      .toLowerCase();

    if (comparable && comparable === prevComparable) {
      continue;
    }

    prevComparable = comparable;
    cleanedLines.push(line);
  }

  const joinedProse = cleanedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return joinedProse.replace(/@@CODE_BLOCK_(\d+)@@/g, (_, idxStr) => {
    const idx = Number(idxStr);
    const blk = codeBlocks[idx];
    if (!blk) return "";
    return `\`\`\`${blk.lang}\n${blk.code}\n\`\`\``;
  });
}

function renderAiContent(container, text) {
  const formattedText = normalizeStructuredReply(text);
  const parts = formattedText.split(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g);

  if (parts.length === 1) {
    const p = document.createElement("div");
    p.className = "ai-prose";
    p.textContent = formattedText;
    container.appendChild(p);
    return;
  }

  for (let i = 0; i < parts.length; i += 3) {
    const proseText = parts[i];
    if (proseText && proseText.trim()) {
      const p = document.createElement("div");
      p.className = "ai-prose";
      p.textContent = proseText.trim();
      container.appendChild(p);
    }

    const lang = parts[i + 1];
    const code = parts[i + 2];
    if (typeof code === "string") {
      let currentCode = code.replace(/^\n+|\n+$/g, "");
      const ext = detectCodeExtension(lang, currentCode);

      const card = document.createElement("div");
      card.className = "code-card";

      const head = document.createElement("div");
      head.className = "code-card-head";

      const meta = document.createElement("div");
      meta.className = "code-card-meta";

      const langLabel = document.createElement("span");
      langLabel.textContent = lang || (ext === "py" ? "python" : "arduino");

      const extBadge = document.createElement("span");
      extBadge.className = "code-ext-badge";
      extBadge.textContent = `.${ext}`;

      meta.append(langLabel, extBadge);

      const actions = document.createElement("div");
      actions.className = "code-card-actions";

      const codeEl = document.createElement("code");
      codeEl.textContent = currentCode;

      const formatBtn = document.createElement("button");
      formatBtn.type = "button";
      formatBtn.className = "chip-action";
      formatBtn.innerHTML = `${iconSvg("ic-code")}<span>จัดรูปแบบ</span>`;
      formatBtn.onclick = () => {
        currentCode = formatSnippetCode(currentCode, ext);
        codeEl.textContent = currentCode;
        formatBtn.innerHTML = `${iconSvg("ic-check")}<span>จัดแล้ว</span>`;
        setTimeout(() => {
          formatBtn.innerHTML = `${iconSvg("ic-code")}<span>จัดรูปแบบ</span>`;
        }, 1200);
      };

      const downloadBtn = document.createElement("button");
      downloadBtn.type = "button";
      downloadBtn.className = "chip-action";
      downloadBtn.innerHTML = `${iconSvg("ic-bookmark")}<span>.${ext}</span>`;
      downloadBtn.onclick = () => {
        downloadCodeFile(buildDownloadFilename(ext), currentCode);
        downloadBtn.innerHTML = `${iconSvg("ic-check")}<span>โหลดแล้ว</span>`;
        setTimeout(() => {
          downloadBtn.innerHTML = `${iconSvg("ic-bookmark")}<span>.${ext}</span>`;
        }, 1200);
      };

      const copyCodeBtn = document.createElement("button");
      copyCodeBtn.type = "button";
      copyCodeBtn.className = "chip-action";
      copyCodeBtn.innerHTML = `${iconSvg("ic-copy")}<span>Copy</span>`;
      copyCodeBtn.onclick = () => {
        navigator.clipboard?.writeText(currentCode);
        copyCodeBtn.innerHTML = `${iconSvg("ic-check")}<span>Copied</span>`;
        setTimeout(() => {
          copyCodeBtn.innerHTML = `${iconSvg("ic-copy")}<span>Copy</span>`;
        }, 1200);
      };

      actions.append(formatBtn, downloadBtn, copyCodeBtn);
      head.append(meta, actions);

      const pre = document.createElement("pre");
      pre.appendChild(codeEl);

      card.append(head, pre);
      container.appendChild(card);
    }
  }
}

function buildMessageRow(role, text, imageUrl = null, showToolbar = true) {
  const row = document.createElement("div");
  row.className = `msg-row ${role}`;

  if (role === "user") {
    const bubble = document.createElement("div");
    bubble.className = "user-bubble";
    if (imageUrl) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = "รูปที่แนบ";
      bubble.appendChild(img);
    }
    const label = document.createElement("div");
    label.textContent = String(text ?? "");
    bubble.appendChild(label);
    row.appendChild(bubble);
  } else {
    const turn = document.createElement("div");
    turn.className = "ai-turn";

    const avatar = document.createElement("div");
    avatar.className = "ai-avatar";
    avatar.innerHTML = iconSvg("ic-spark", "ico-sm");

    const body = document.createElement("div");
    body.className = "ai-body";
    renderAiContent(body, text);

    if (showToolbar) {
      const toolbar = document.createElement("div");
      toolbar.className = "ai-toolbar";

      const copyAllBtn = document.createElement("button");
      copyAllBtn.type = "button";
      copyAllBtn.className = "chip-action";
      copyAllBtn.innerHTML = `${iconSvg("ic-copy")}<span>Copy</span>`;
      copyAllBtn.onclick = () => {
        navigator.clipboard?.writeText(String(text ?? ""));
        copyAllBtn.innerHTML = `${iconSvg("ic-check")}<span>Copied</span>`;
        setTimeout(() => {
          copyAllBtn.innerHTML = `${iconSvg("ic-copy")}<span>Copy</span>`;
        }, 1200);
      };

      const saveSnippetBtn = document.createElement("button");
      saveSnippetBtn.type = "button";
      saveSnippetBtn.className = "chip-action";
      saveSnippetBtn.innerHTML = `${iconSvg("ic-bookmark")}<span>Snippet</span>`;
      saveSnippetBtn.onclick = () => {
        state.snippets.unshift({ id: Date.now().toString(), board: state.boardModel, content: String(text ?? "") });
        savePersistentData();
        saveSnippetBtn.innerHTML = `${iconSvg("ic-check")}<span>Saved</span>`;
      };

      const saveWiringBtn = document.createElement("button");
      saveWiringBtn.type = "button";
      saveWiringBtn.className = "chip-action";
      saveWiringBtn.innerHTML = `${iconSvg("ic-cable")}<span>Wiring</span>`;
      saveWiringBtn.onclick = () => {
        state.wirings.unshift({ id: Date.now().toString(), board: state.boardModel, content: String(text ?? "") });
        savePersistentData();
        saveWiringBtn.innerHTML = `${iconSvg("ic-check")}<span>Saved</span>`;
      };

      toolbar.append(copyAllBtn, saveSnippetBtn, saveWiringBtn);
      body.appendChild(toolbar);
    }

    turn.append(avatar, body);
    row.appendChild(turn);
  }

  return row;
}

function renderCurrentSession(extraPendingText = "") {
  const session = getCurrentSession();
  els.messages.innerHTML = "";

  const msgs = Array.isArray(session.messages) ? session.messages : [];
  if (msgs.length === 0 && !extraPendingText) {
    els.messages.appendChild(buildEmptyStateElement());
    return;
  }

  msgs.forEach((m) => {
    els.messages.appendChild(buildMessageRow(m.role, m.text, m.imageUrl, true));
  });

  if (extraPendingText) {
    els.messages.appendChild(buildMessageRow("ai", extraPendingText, null, false));
  }

  scrollMessagesToBottom();
}

function renderDrawerRecents() {
  els.drawerRecentList.innerHTML = "";
  if (state.sessions.length === 0) {
    els.drawerRecentList.innerHTML = `<p class="empty-note">ยังไม่มีแชท</p>`;
    return;
  }

  state.sessions.slice(0, 15).forEach((s) => {
    const row = document.createElement("div");
    row.className = "recent-row";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "recent-item";
    openBtn.textContent = s.title || "แชทใหม่";
    openBtn.onclick = () => {
      state.currentSessionId = s.id;
      renderCurrentSession();
      switchView("chatView");
    };

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "mini-del-btn";
    delBtn.setAttribute("aria-label", "ลบแชท");
    delBtn.innerHTML = iconSvg("ic-trash");
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteSession(s.id);
    };

    row.append(openBtn, delBtn);
    els.drawerRecentList.appendChild(row);
  });
}

function renderPinsAndWiring() {
  els.pinList.innerHTML = "";
  if (state.pins.length === 0) {
    els.pinList.innerHTML = `<p class="empty-note">ยังไม่มีรายการขาที่บันทึกไว้</p>`;
  } else {
    state.pins.forEach((pin, idx) => {
      const li = document.createElement("li");
      li.className = "list-item";

      const info = document.createElement("div");
      info.className = "list-item-main";
      info.innerHTML = `<span class="list-item-title">${pin.pin}</span><span class="list-item-meta">${pin.usage}</span>`;

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "chip-action danger";
      delBtn.innerHTML = `${iconSvg("ic-trash")}<span>ลบ</span>`;
      delBtn.onclick = () => {
        state.pins.splice(idx, 1);
        savePersistentData();
        renderPinsAndWiring();
      };

      li.append(info, delBtn);
      els.pinList.appendChild(li);
    });
  }

  els.savedWiringList.innerHTML = "";
  if (state.wirings.length === 0) {
    els.savedWiringList.innerHTML = `<p class="empty-note">กดปุ่ม Wiring บนคำตอบ AI เพื่อเก็บคำแนะนำการต่อสาย</p>`;
  } else {
    state.wirings.forEach((w, idx) => {
      const card = document.createElement("div");
      card.className = "list-item";
      card.style.alignItems = "flex-start";

      const main = document.createElement("div");
      main.className = "list-item-main";
      main.style.whiteSpace = "pre-wrap";
      main.innerHTML = `<span class="list-item-meta">${w.board}</span><span>${w.content}</span>`;

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "chip-action danger";
      delBtn.innerHTML = `${iconSvg("ic-trash")}`;
      delBtn.onclick = () => {
        state.wirings.splice(idx, 1);
        savePersistentData();
        renderPinsAndWiring();
      };

      card.append(main, delBtn);
      els.savedWiringList.appendChild(card);
    });
  }
}

function renderSnippets() {
  const q = (els.snippetSearchInput.value || "").trim().toLowerCase();
  els.snippetList.innerHTML = "";

  const filtered = state.snippets.filter(
    (s) => !q || s.content.toLowerCase().includes(q) || s.board.toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    els.snippetList.innerHTML = `<p class="empty-note">ไม่พบ Snippet ที่บันทึกไว้</p>`;
    return;
  }

  filtered.forEach((item) => {
    const idx = state.snippets.findIndex((x) => x.id === item.id);
    const card = document.createElement("div");
    card.className = "surface-card";

    const head = document.createElement("div");
    head.className = "list-item";
    head.style.padding = "0 0 8px";
    head.style.background = "transparent";
    head.style.border = "none";

    const boardTag = document.createElement("span");
    boardTag.className = "list-item-meta";
    boardTag.textContent = item.board;

    const btns = document.createElement("div");
    btns.className = "row-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "chip-action";
    copyBtn.innerHTML = `${iconSvg("ic-copy")}<span>Copy</span>`;
    copyBtn.onclick = () => navigator.clipboard?.writeText(item.content);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "chip-action danger";
    delBtn.innerHTML = `${iconSvg("ic-trash")}`;
    delBtn.onclick = () => {
      if (idx > -1) {
        state.snippets.splice(idx, 1);
        savePersistentData();
        renderSnippets();
      }
    };

    btns.append(copyBtn, delBtn);
    head.append(boardTag, btns);

    const body = document.createElement("div");
    body.className = "ai-prose";
    body.textContent = item.content;

    card.append(head, body);
    els.snippetList.appendChild(card);
  });
}

function renderHistory() {
  els.historyList.innerHTML = "";
  if (state.sessions.length === 0) {
    els.historyList.innerHTML = `<p class="empty-note">ยังไม่มีประวัติแชท</p>`;
    return;
  }

  state.sessions.forEach((s) => {
    const row = document.createElement("div");
    row.className = "list-item";

    const info = document.createElement("div");
    info.className = "list-item-main";
    info.innerHTML = `<span class="list-item-title">${s.title || "แชทใหม่"}</span><span class="list-item-meta">${s.board} • ${s.messages.length} ข้อความ</span>`;

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "chip-action";
    openBtn.textContent = "เปิด";
    openBtn.onclick = () => {
      state.currentSessionId = s.id;
      renderCurrentSession();
      switchView("chatView");
    };

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "chip-action danger";
    delBtn.innerHTML = `${iconSvg("ic-trash")}<span>ลบ</span>`;
    delBtn.onclick = () => deleteSession(s.id);

    actions.append(openBtn, delBtn);
    row.append(info, actions);
    els.historyList.appendChild(row);
  });
}

// Viewport listeners for mobile keyboard tracking
syncKeyboardOffset();
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncKeyboardOffset);
  window.visualViewport.addEventListener("scroll", syncKeyboardOffset);
}

// Event Listeners
els.menuBtn.onclick = () => setDrawerOpen(true);
els.closeDrawerBtn.onclick = () => setDrawerOpen(false);
els.drawerBackdrop.onclick = () => setDrawerOpen(false);
els.drawerNewChatBtn.onclick = startNewSession;
els.newChatBtn.onclick = startNewSession;

els.quickBoardBtn.onclick = () => {
  setDrawerOpen(true);
  setTimeout(() => els.boardModelSelect.focus(), 100);
};

els.openKeySheetBtn.onclick = () => setKeySheetOpen(true);
els.closeKeySheetBtn.onclick = () => setKeySheetOpen(false);
els.keySheetBackdrop.onclick = () => setKeySheetOpen(false);

document.querySelectorAll(".nav-link").forEach((btn) => {
  btn.onclick = () => switchView(btn.dataset.view);
});

document.querySelectorAll(".back-btn").forEach((btn) => {
  btn.onclick = () => switchView("chatView");
});

els.apiKeyInput.addEventListener("input", syncKeyBadge);
els.toggleKeyVisBtn.onclick = () => {
  els.apiKeyInput.type = els.apiKeyInput.type === "password" ? "text" : "password";
};
els.clearKeyBtn.onclick = () => {
  els.apiKeyInput.value = "";
  sessionApiKey = "";
  syncKeyBadge();
};

els.providerSelect.onchange = (e) => {
  const val = e.target.value;
  els.customUrlRow.classList.toggle("hidden", val !== "custom");
  if (val === "groq" && !els.modelInput.value.trim()) {
    els.modelInput.value = "qwen/qwen3.8-27b";
  }
};

els.boardFamilySelect.value = state.boardFamily;
populateBoardModels(state.boardFamily, state.boardModel);

els.boardFamilySelect.onchange = (e) => {
  state.boardFamily = e.target.value;
  populateBoardModels(state.boardFamily, "");
  savePersistentData();
};

els.boardModelSelect.onchange = (e) => {
  state.boardModel = e.target.value;
  els.currentBoardLabel.textContent = state.boardModel;
  savePersistentData();
};

els.reasoningSelect.value = state.reasoningEffort;
els.reasoningSelect.onchange = (e) => {
  state.reasoningEffort = e.target.value;
  savePersistentData();
};

els.projectNoteInput.value = state.projectNote;
els.projectNoteInput.oninput = (e) => {
  state.projectNote = e.target.value;
  savePersistentData();
};

els.cameraInput.onchange = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    sessionImageDataUrl = reader.result;
    els.imagePreview.src = sessionImageDataUrl;
    els.imagePreviewBar.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
};

els.removeImageBtn.onclick = () => {
  sessionImageDataUrl = null;
  els.cameraInput.value = "";
  els.imagePreviewBar.classList.add("hidden");
};

els.addPinBtn.onclick = () => {
  const pin = els.pinNameInput.value.trim();
  const usage = els.pinUsageInput.value.trim();
  if (!pin || !usage) return;
  state.pins.unshift({ pin, usage });
  els.pinNameInput.value = "";
  els.pinUsageInput.value = "";
  savePersistentData();
  renderPinsAndWiring();
};

els.snippetSearchInput.oninput = renderSnippets;

els.promptInput.addEventListener("input", () => {
  els.promptInput.style.height = "auto";
  els.promptInput.style.height = `${Math.min(els.promptInput.scrollHeight, 132)}px`;
  scrollMessagesToBottom();
});

els.promptInput.addEventListener("focus", () => {
  setTimeout(syncKeyboardOffset, 100);
});

els.promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && window.innerWidth >= 768) {
    e.preventDefault();
    els.chatForm.requestSubmit();
  }
});

els.chatForm.onsubmit = async (e) => {
  e.preventDefault();
  if (isSending) return;

  syncKeyBadge();
  if (!sessionApiKey) {
    setKeySheetOpen(true);
    return;
  }

  const prompt = els.promptInput.value.trim();
  const imageUrl = sessionImageDataUrl;
  if (!prompt && !imageUrl) return;

  const session = getCurrentSession();
  if (session.messages.length === 0) {
    session.title = (prompt || "ตรวจสอบรูปภาพบอร์ด/โค้ด").slice(0, 32);
  }

  const historyPayload = session.messages.map((m) => ({
    role: m.role === "ai" ? "assistant" : "user",
    text: m.text,
  }));

  const userDisplay = prompt || "(แนบรูปภาพ)";
  session.messages.push({ role: "user", text: userDisplay, imageUrl });

  els.promptInput.value = "";
  els.promptInput.style.height = "auto";
  sessionImageDataUrl = null;
  els.cameraInput.value = "";
  els.imagePreviewBar.classList.add("hidden");
  savePersistentData();
  renderDrawerRecents();

  isSending = true;
  els.sendBtn.disabled = true;
  renderCurrentSession("กำลังประมวลผลและเตรียมคำตอบ/โค้ด...");

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": sessionApiKey,
      },
      body: JSON.stringify({
        provider: els.providerSelect.value,
        custom_base_url: els.customBaseUrlInput.value.trim(),
        model: els.modelInput.value.trim() || "qwen/qwen3.8-27b",
        board_family: state.boardFamily,
        board: state.boardModel,
        reasoning_effort: state.reasoningEffort,
        project_note: state.projectNote,
        pins: state.pins,
        history: historyPayload,
        prompt: prompt || "ช่วยตรวจสอบรูปภาพนี้และให้คำแนะนำที่จำเป็น",
        image_data_url: imageUrl,
      }),
    });

    const rawText = await res.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (_) {
      data = { detail: rawText || `HTTP ${res.status}` };
    }

    if (!res.ok) {
      throw new Error(data.detail || `HTTP ${res.status}`);
    }

    const replyText =
      typeof data.reply === "string" && data.reply.trim()
        ? data.reply.trim()
        : "ไม่ได้รับข้อความตอบกลับจากโมเดล";

    session.messages.push({ role: "ai", text: replyText });
    savePersistentData();
  } catch (err) {
    const errText = `เกิดข้อผิดพลาด: ${err && err.message ? err.message : "ไม่สามารถรับคำตอบได้"}`;
    session.messages.push({ role: "ai", text: errText });
    savePersistentData();
  } finally {
    isSending = false;
    els.sendBtn.disabled = false;
    renderCurrentSession();
  }
};

// บังคับล้างค่า API Key ในช่องกรอกทุกครั้งที่โหลดหน้าใหม่
els.apiKeyInput.value = "";
syncKeyBadge();
renderCurrentSession();
renderDrawerRecents();

