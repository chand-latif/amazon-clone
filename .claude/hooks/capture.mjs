#!/usr/bin/env node
// 8x agent-capture hook for Claude Code.
// Wired in .claude/settings.json to SessionStart, PostModelSwitch,
// UserPromptSubmit, Stop and StopFailure. Appends verbatim prompt / final response
// to .agent-logs/YYYY-MM-DD_HH-MM-SS_<session-id>.md
// Never blocks Claude: every error is swallowed and the script exits 0.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const event = process.argv[2]; // session-start | model-switch | prompt | stop

function readStdin() {
  try { return fs.readFileSync(0, "utf8"); } catch { return ""; }
}

function main() {
  const raw = readStdin();
  let input = {};
  try { input = JSON.parse(raw || "{}"); } catch { logError(`${event}: stdin was not valid JSON`); return; }

  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const logDir = path.join(root, ".agent-logs");
  const stateDir = path.join(root, ".claude", "hooks", ".state"); // gitignored
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  const sessionId = input.session_id || "unknown-session";
  const short = sessionId.slice(0, 8);
  const statePath = path.join(stateDir, `${sessionId}.json`);
  const state = loadJson(statePath) || {
    session_id: sessionId, file: null, exchanges: 0, model: null,
    first_prompt_time: null, last_prompt_time: null, last_responded: 0,
  };
  const now = new Date().toISOString();

  if (event === "session-start") {
    if (input.model) state.model = modelName(input.model);
    saveJson(statePath, state);
    return;
  }

  if (event === "model-switch") {
    if (input.to_model) state.model = modelName(input.to_model);
    saveJson(statePath, state);
    return;
  }

  // Best-effort model detection when we haven't been told yet.
  const model = state.model || modelFromTranscript(input.transcript_path) || "unknown";

  if (event === "prompt") {
    const prompt = typeof input.prompt === "string" ? input.prompt : "";
    if (!state.file) {
      const stamp = now.slice(0, 19).replace("T", "_").replace(/:/g, "-");
      state.file = `${stamp}_${sessionId}.md`;
      state.first_prompt_time = now;
    }
    state.exchanges += 1;
    state.last_prompt_time = now;
    state.model = model === "unknown" ? state.model : model;
    const file = path.join(logDir, state.file);
    if (!fs.existsSync(file)) fs.writeFileSync(file, header(state, root, now, short, model));
    fs.appendFileSync(file, entry("PROMPT", state.exchanges, short, now, model, prompt));
    rewriteFrontmatter(file, state, model);
    saveJson(statePath, state);
    return;
  }

  // stop-failure: the turn ended in an API error; Stop does not fire then, and
  // last_assistant_message holds the error text. Logged as the turn's response.
  if (event === "stop" || event === "stop-failure") {
    if (!state.file || state.exchanges === 0) return; // no prompt logged in this session
    if (state.last_responded >= state.exchanges) return; // already logged this turn
    let response = typeof input.last_assistant_message === "string"
      ? input.last_assistant_message
      : finalTextFromTranscript(input.transcript_path);
    if (response == null) response = "";
    const respModel = modelFromTranscript(input.transcript_path) || model;
    state.model = respModel === "unknown" ? state.model : respModel;
    const file = path.join(logDir, state.file);
    fs.appendFileSync(file, entry("RESPONSE", state.exchanges, short, now, respModel, response));
    state.last_responded = state.exchanges;
    rewriteFrontmatter(file, state, respModel);
    saveJson(statePath, state);
    return;
  }
}

function entry(type, num, short, ts, model, body) {
  return `[LOG_ENTRY type=${type} num=${num} session=${short}]\n` +
         `timestamp: ${ts}\nmodel: ${model}\n\n${body}\n\n\n`;
}

function header(state, root, now, short, model) {
  const project = process.env.AGENT_LOG_PROJECT || path.basename(root);
  const author = authorHandle(root);
  return `---\n` +
    `session_id: ${state.session_id}\n` +
    `date: ${now.slice(0, 10)}\n` +
    `author: ${author}\n` +
    `model: ${model}\n` +
    `tool: claude-code\n` +
    `project: ${project}\n` +
    `total_exchanges: ${state.exchanges}\n` +
    `first_prompt_time: ${state.first_prompt_time}\n` +
    `last_prompt_time: ${state.last_prompt_time}\n` +
    `---\n\n` +
    `# Session Log - ${now.slice(0, 10)}\n\n` +
    `Session: \`${short}\` | Project: \`${project}\` | Author: \`${author}\`\n\n---\n\n`;
}

// Only touches the counters/model lines inside the leading frontmatter block.
// Log entries themselves are never edited.
function rewriteFrontmatter(file, state, model) {
  const text = fs.readFileSync(file, "utf8");
  const end = text.indexOf("\n---\n", 4);
  if (!text.startsWith("---\n") || end === -1) return;
  let fm = text.slice(0, end);
  const rest = text.slice(end);
  fm = fm.replace(/^total_exchanges: .*$/m, `total_exchanges: ${state.exchanges}`)
         .replace(/^last_prompt_time: .*$/m, `last_prompt_time: ${state.last_prompt_time}`);
  // If the model changed mid-session, list every model used.
  const m = fm.match(/^model: (.*)$/m);
  if (m && model && model !== "unknown") {
    const models = m[1].split(",").map(s => s.trim()).filter(s => s && s !== "unknown");
    if (!models.includes(model)) models.push(model);
    fm = fm.replace(/^model: .*$/m, `model: ${models.join(", ")}`);
  }
  fs.writeFileSync(file, fm + rest);
}

function authorHandle(root) {
  if (process.env.AGENT_LOG_AUTHOR) return process.env.AGENT_LOG_AUTHOR;
  for (const cmd of ["gh api user -q .login", "git config github.user", "git config user.name"]) {
    try {
      const out = execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "ignore"], timeout: 4000 })
        .toString().trim();
      if (out) return out;
    } catch {}
  }
  return "unknown";
}

function modelName(m) {
  if (!m) return null;
  if (typeof m === "string") return m;
  return m.id || m.name || m.display_name || JSON.stringify(m);
}

function readTranscript(p) {
  if (!p || !fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function modelFromTranscript(p) {
  const lines = readTranscript(p);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i]?.message?.model;
    if (lines[i]?.type === "assistant" && m && m !== "<synthetic>") return m;
  }
  return null;
}

// Fallback only: text of assistant messages after the last tool result / user prompt.
function finalTextFromTranscript(p) {
  const lines = readTranscript(p);
  const parts = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l.type === "user") break;
    if (l.type !== "assistant") continue;
    const c = l.message?.content;
    if (Array.isArray(c)) {
      const t = c.filter(b => b.type === "text").map(b => b.text).join("\n");
      if (t) parts.unshift(t);
      if (c.some(b => b.type === "tool_use") && parts.length) break;
    } else if (typeof c === "string") parts.unshift(c);
  }
  return parts.length ? parts.join("\n\n") : null;
}

function loadJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
function saveJson(p, o) { fs.writeFileSync(p, JSON.stringify(o, null, 2)); }

// Failures never block Claude, but they are recorded so a silent gap is visible.
function logError(msg) {
  try {
    const dir = path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), ".claude", "hooks", ".state");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "errors.log"), `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

try { main(); } catch (e) {
  logError(`${event}: ${e?.stack || e?.message}`);
  try { process.stderr.write(`capture hook error: ${e?.message}\n`); } catch {}
}
process.exit(0);
