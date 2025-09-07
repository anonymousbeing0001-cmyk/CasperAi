// === AI Core Memory ===
let AI_coreMemory = {
  contextMemory: [],
  longTerm: {},
};

// === AI Helpers (can evolve) ===
let AI_helpers = {};

// === Control Flags ===
window.showAutonomousIdeas = false;
let patchModeActive = false;

// === Add message to chat ===
function addMessage(sender, text) {
  const chat = document.getElementById("chat");
  const div = document.createElement("div");
  div.className = sender;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// === Override addMessage to hide autonomous ideas ===
const _originalAddMessage = addMessage;
addMessage = function(sender, text) {
  if (!window.showAutonomousIdeas && typeof text === "string" && text.startsWith("🤖 Autonomous idea:")) {
    console.log("🤖 Autonomous idea hidden:", text); // keep for debugging
    return;
  }
  _originalAddMessage(sender, text);
};

// === Learn new info (categorize automatically) ===
function learn(info) {
  const words = info.split(" ");
  const category = words[0].toLowerCase() || "misc";
  if (!AI_coreMemory.longTerm[category]) AI_coreMemory.longTerm[category] = [];
  AI_coreMemory.longTerm[category].push(info);
  exportMemoryAsCode();
}

// === Generate Response ===
function generateResponse(input) {
  const lower = input.toLowerCase();

  // Greetings
  if (["hello","hi","hey"].some(g => lower.includes(g))) {
    return "🤖 Hello! How are you today?";
  }

  // Math evaluation (improved)
  try {
    const mathInput = input.replace(/[^-()\d/*+.]/g, "");
    if (mathInput) {
      const mathResult = Function('"use strict";return (' + mathInput + ')')();
      if (!isNaN(mathResult)) return `🤖 The result is: ${mathResult}`;
    }
  } catch(e) {}

  // Recall memory
  for (const category in AI_coreMemory.longTerm) {
    const match = AI_coreMemory.longTerm[category].find(f => f.toLowerCase().includes(lower));
    if (match) return `🤖 I remember from "${category}" memory: "${match}"`;
  }

  // Use helpers if any
  const helperKeys = Object.keys(AI_helpers);
  if (helperKeys.length > 0) {
    for (let key of helperKeys) {
      try {
        const result = AI_helpers[key](input);
        if (result) return result;
      } catch(e) {}
    }
  }

  // Fallback
  return `🤖 I heard you say: "${input}". Tell me more!`;
}

// === Export Memory as Code ===
function exportMemoryAsCode() {
  const memoryCode = `
const AI_knowledge = ${JSON.stringify(AI_coreMemory.longTerm, null, 2)};
function recallFact(query){
  for(const category in AI_knowledge){
    const match = AI_knowledge[category].find(f=>f.toLowerCase().includes(query.toLowerCase()));
    if(match) return match;
  }
  return null;
}
`;
  localStorage.setItem("AI_memoryCode", memoryCode);
  console.log("🤖 Memory exported as code.");
}

// === Restore Memory on Load ===
(function restoreMemory() {
  const savedMemoryCode = localStorage.getItem("AI_memoryCode");
  if(savedMemoryCode) {
    try { eval(savedMemoryCode); console.log("🤖 Memory code loaded."); } 
    catch(e) { console.warn("⚠️ Failed to load memory code:", e); }
  }
})();

// === Handle Send with Patch Mode ===
handleSend = function() {
  const inputBox = document.getElementById("userInput");
  const input = inputBox.value.trim();
  if (!input) return;
  addMessage("user", input);
  inputBox.value = "";

  // === Patch trigger ===
  if(input === "88888888") {
    patchModeActive = true;
    addMessage("bot", "🤖 Patch mode activated. Please enter the code patch next.");
    return;
  }

  // === Apply patch if patch mode active ===
  if(patchModeActive) {
    try {
      new Function(input)(); // safely evaluate patch code
      addMessage("bot", "🤖 Patch applied successfully.");
    } catch(err) {
      addMessage("bot", `🤖 Error applying patch: ${err.message}`);
    }
    patchModeActive = false;
    return;
  }

  // === Normal AI processing ===
  learn(input);
  const response = generateResponse(input);
  addMessage("bot", response);

  // Autonomous ideas (hidden by addMessage override)
  if (window.showAutonomousIdeas) {
    const idea = `🤖 Autonomous idea: ${input.split(" ")[0]}`;
    addMessage("bot", idea);
  }
};

// === Hook up Send Button and Enter Key ===
const sendBtn = document.getElementById("sendBtn");
const inputEl = document.getElementById("userInput");
sendBtn.addEventListener("click", handleSend);
inputEl.addEventListener("keypress", e => { if (e.key === "Enter") handleSend(); });

console.log("🤖 Full AI script loaded: Patch mode, memory, math, learning active.");