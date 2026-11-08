// src/host.ts
import { promises as fsp } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

// src/shared.ts
var VAR_PATTERN = /\$\{([^{}\n]+)\}|\{\{([^{}\n]+)\}\}/g;
function canonicalTemplate(value) {
  return String(value ?? "").replace(/\{\{([^{}\n]+)\}\}/g, (_match, name) => "${" + name.trim() + "}");
}
function templateVariables(template) {
  const names = [];
  const seen = /* @__PURE__ */ new Set();
  for (const match of String(template ?? "").matchAll(VAR_PATTERN)) {
    const name = String(match[1] ?? match[2] ?? "").trim();
    if (name === "" || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}
function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, max);
}

// src/host.ts
var API_BASE = "/api/dsh-skillcard";
var STORE_VERSION = 1;
var MAX_BODY_BYTES = 512 * 1024;
var MAX_CARDS = 500;
var MAX_TITLE = 120;
var MAX_TEMPLATE = 8e3;
var MAX_DESCRIPTION = 2e3;
var MAX_SHORT = 40;
var MAX_SKILL = 80;
function dshHome() {
  const fromEnv = process.env.DSH_HOME;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") return fromEnv.trim();
  return join(homedir(), ".dsh");
}
function storePath(name) {
  return join(dshHome(), "skillcard", name);
}
function storeFile() {
  return storePath("cards.json");
}
function newId() {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return "sc_" + stamp + random;
}
function normalizeCard(input, previous) {
  const source = input && typeof input === "object" ? input : {};
  const title = cleanText(source.title, MAX_TITLE);
  const template = canonicalTemplate(cleanText(source.template, MAX_TEMPLATE));
  if (title === "") throw new Error("card title is required");
  if (template === "") throw new Error("card template is required");
  const provided = /* @__PURE__ */ new Map();
  if (Array.isArray(source.variables)) {
    for (const entry of source.variables) {
      if (entry === null || typeof entry !== "object") continue;
      const name = cleanText(entry.name, MAX_SHORT);
      if (name !== "") provided.set(name, entry);
    }
  }
  const carried = /* @__PURE__ */ new Map();
  if (previous !== void 0 && Array.isArray(previous.variables)) {
    for (const entry of previous.variables) {
      if (entry !== null && typeof entry === "object" && typeof entry.name === "string") carried.set(entry.name, entry);
    }
  }
  const variables = templateVariables(template).map((name) => {
    const meta = provided.get(name) ?? carried.get(name) ?? {};
    const label = cleanText(meta.label, MAX_SHORT);
    return {
      name,
      label: label === "" ? name : label,
      example: cleanText(meta.example, 200)
    };
  });
  const now = Date.now();
  return {
    id: previous !== void 0 && previous.id !== void 0 ? previous.id : newId(),
    title,
    description: cleanText(source.description, MAX_DESCRIPTION),
    template,
    variables,
    category: cleanText(source.category, MAX_SHORT),
    skill: cleanText(source.skill, MAX_SKILL),
    uses: previous !== void 0 && Number.isFinite(previous.uses) ? previous.uses : 0,
    createdAt: previous !== void 0 && Number.isFinite(previous.createdAt) ? previous.createdAt : now,
    updatedAt: now
  };
}
function readConfig(config) {
  const source = config !== null && typeof config === "object" ? config : {};
  return {
    defaultExpanded: source.defaultExpanded !== false,
    showSidebarEntry: source.showSidebarEntry !== false
  };
}
function createLibrary(deps = {}) {
  const resolveSkills = typeof deps?.skills === "function" ? deps.skills : async () => [];
  let queue = Promise.resolve();
  function serialize(task) {
    const next = queue.then(task, task);
    queue = next.then(
      () => void 0,
      () => void 0
    );
    return next;
  }
  async function load() {
    const file = storeFile();
    let raw;
    try {
      raw = await fsp.readFile(file, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return { cards: [] };
      throw new Error(`could not read ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const backup = `${file}.corrupt-${Date.now()}`;
      await fsp.rename(file, backup).catch(() => void 0);
      throw new Error(`cards.json was not valid JSON; it was moved to ${backup}`);
    }
    const rawCards = Array.isArray(parsed?.cards) ? parsed.cards : [];
    const cards = [];
    for (const entry of rawCards) {
      try {
        cards.push(normalizeCard(entry, isCard(entry) ? entry : void 0));
      } catch {
      }
    }
    return { cards };
  }
  async function save(cards) {
    const file = storeFile();
    await fsp.mkdir(dirname(file), { recursive: true });
    const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
    const body = JSON.stringify({ version: STORE_VERSION, cards }, null, 2);
    await fsp.writeFile(temp, body, "utf8");
    await fsp.rename(temp, file);
    return cards;
  }
  function isCard(value) {
    if (value === null || typeof value !== "object") return false;
    const id = value.id;
    return typeof id === "string" && id !== "";
  }
  return {
    async list() {
      const state = await load();
      return [...state.cards].sort(compareCards);
    },
    async get(id) {
      const state = await load();
      return state.cards.find((card) => card.id === id);
    },
    upsert(input) {
      const id = cleanText(input?.id, MAX_SHORT);
      return serialize(async () => {
        const state = await load();
        const index = id === "" ? -1 : state.cards.findIndex((card2) => card2.id === id);
        if (id !== "" && index === -1) throw new Error(`no skill card with id "${id}"`);
        const card = normalizeCard(input, index === -1 ? void 0 : state.cards[index]);
        const cards = [...state.cards];
        if (index === -1) {
          if (cards.length >= MAX_CARDS) throw new Error(`the library is limited to ${MAX_CARDS} cards`);
          cards.push(card);
        } else {
          cards[index] = card;
        }
        await save(cards);
        return card;
      });
    },
    remove(id) {
      return serialize(async () => {
        const state = await load();
        const key = cleanText(id, MAX_SHORT);
        const cards = state.cards.filter((card) => card.id !== key);
        if (cards.length === state.cards.length) throw new Error(`no skill card with id "${key}"`);
        await save(cards);
        if (typeof deps?.onCardRemoved === "function") await deps.onCardRemoved(key);
        return cards.length;
      });
    },
    markUsed(id) {
      return serialize(async () => {
        const state = await load();
        const key = cleanText(id, MAX_SHORT);
        const index = state.cards.findIndex((card2) => card2.id === key);
        if (index === -1) return void 0;
        const card = { ...state.cards[index], uses: (state.cards[index].uses ?? 0) + 1 };
        const cards = [...state.cards];
        cards[index] = card;
        await save(cards);
        return card;
      });
    },
    skills: resolveSkills
  };
}
var RUNS_FILE = "runs.json";
var MAX_RUNS = 300;
var MAX_ANSWER = 2e4;
var RUN_STATUSES = /* @__PURE__ */ new Set(["running", "done", "error", "input", "timeout", "stopped", "interrupted"]);
var RUN_STALE_MS = 15 * 60 * 1e3;
function normalizeRun(input) {
  const source = input !== null && typeof input === "object" ? input : {};
  const prompt = cleanText(source.prompt, MAX_TEMPLATE * 2);
  if (prompt === "") throw new Error("run prompt is required");
  const now = Date.now();
  return {
    id: cleanText(source.id, 64) || "run_" + now.toString(36) + Math.random().toString(36).slice(2, 7),
    cardId: cleanText(source.cardId, MAX_SHORT),
    cardTitle: cleanText(source.cardTitle, MAX_TITLE),
    skill: cleanText(source.skill, MAX_SKILL),
    prompt,
    answer: cleanText(source.answer, MAX_ANSWER),
    status: RUN_STATUSES.has(String(source.status)) ? String(source.status) : "done",
    error: cleanText(source.error, 500),
    sessionId: cleanText(source.sessionId, 80),
    startedAt: Number.isFinite(source.startedAt) ? Number(source.startedAt) : now,
    finishedAt: Number.isFinite(source.finishedAt) ? Number(source.finishedAt) : now
  };
}
function createRunLog() {
  let queue = Promise.resolve();
  function serialize(task) {
    const next = queue.then(task, task);
    queue = next.then(
      () => void 0,
      () => void 0
    );
    return next;
  }
  async function load() {
    const file = storePath(RUNS_FILE);
    let raw;
    try {
      raw = await fsp.readFile(file, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return { runs: [] };
      throw new Error(`could not read ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const backup = `${file}.corrupt-${Date.now()}`;
      await fsp.rename(file, backup).catch(() => void 0);
      throw new Error(`runs.json was not valid JSON; it was moved to ${backup}`);
    }
    const runs = Array.isArray(parsed?.runs) ? parsed.runs : [];
    const records = runs.filter(
      (run) => run !== null && typeof run === "object" && typeof run.id === "string"
    );
    return { runs: records };
  }
  async function save(runs) {
    const file = storePath(RUNS_FILE);
    await fsp.mkdir(dirname(file), { recursive: true });
    const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
    await fsp.writeFile(temp, JSON.stringify({ version: 1, runs }, null, 2), "utf8");
    await fsp.rename(temp, file);
    return runs;
  }
  return {
    async list(options = {}) {
      const { runs } = await load();
      const cardId = typeof options.cardId === "string" ? options.cardId : "";
      const filtered = cardId === "" ? runs : runs.filter((run) => run.cardId === cardId);
      const now = Date.now();
      return filtered.slice().sort((left, right) => (right.finishedAt ?? 0) - (left.finishedAt ?? 0)).slice(0, 100).map(
        (run) => run.status === "running" && now - (run.startedAt ?? 0) > RUN_STALE_MS ? { ...run, status: "interrupted" } : run
      );
    },
    record(input) {
      return serialize(async () => {
        const run = normalizeRun(input);
        const { runs } = await load();
        const existing = runs.find((entry) => entry.id === run.id);
        const next = existing === void 0 ? [run, ...runs].slice(0, MAX_RUNS) : runs.map(
          (entry) => entry.id === run.id ? { ...run, startedAt: existing.startedAt ?? run.startedAt } : entry
        );
        await save(next);
        return run;
      });
    },
    remove(ids) {
      return serialize(async () => {
        const wanted = new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string"));
        if (wanted.size === 0) return 0;
        const { runs } = await load();
        const kept = runs.filter((run) => !wanted.has(run.id));
        if (kept.length !== runs.length) await save(kept);
        return runs.length - kept.length;
      });
    },
    removeByCard(cardId) {
      return serialize(async () => {
        const key = cleanText(cardId, MAX_SHORT);
        const { runs } = await load();
        const kept = runs.filter((run) => run.cardId !== key);
        if (kept.length === runs.length) return 0;
        await save(kept);
        return runs.length - kept.length;
      });
    }
  };
}
function compareCards(left, right) {
  return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
}
function describeCards(cards) {
  if (cards.length === 0) return "The skill card library is empty.";
  const lines = cards.map((card) => {
    const variables = card.variables.map((variable) => "${" + variable.name + "}").join(" ");
    const marks = [card.category === "" ? "" : `category=${card.category}`].filter((part) => part !== "").join(", ");
    return `- ${card.id} | ${card.title}${marks === "" ? "" : ` (${marks})`} | template: ${card.template}${variables === "" ? "" : ` | variables: ${variables}`}`;
  });
  return `Skill cards (${cards.length}):
${lines.join("\n")}`;
}
function describeCard(card) {
  const variables = card.variables.map((variable) => `${variable.name}${variable.label === variable.name ? "" : ` (${variable.label})`}${variable.example === "" ? "" : ` e.g. ${variable.example}`}`).join("; ");
  return [
    `id: ${card.id}`,
    `title: ${card.title}`,
    card.description === "" ? void 0 : `description: ${card.description}`,
    `template: ${card.template}`,
    variables === "" ? "variables: none" : `variables: ${variables}`,
    card.category === "" ? void 0 : `category: ${card.category}`,
    card.skill === "" ? void 0 : `skill: ${card.skill}`,
    `uses: ${card.uses}`
  ].filter((line) => line !== void 0).join("\n");
}
var TOOL_DESCRIPTION = [
  `Read and write the user's SkillCard library: parameterized prompt templates ("skill cards") that the user fills in and sends from the Web UI.`,
  'A card is a prompt whose per-use values are `${placeholders}`, for example "\u4F7F\u7528\u5929\u6C14\u6280\u80FD\u5E2E\u6211\u67E5\u770B${\u5730\u70B9}\u5728${\u65E5\u671F}\u7684\u5929\u6C14". The user fills \u5730\u70B9/\u65E5\u671F and sends the rendered prompt, so the wording stays stable.',
  "Actions: list (all cards), get (one card by id), create (new card), update (change a card by id), delete (remove a card by id).",
  "When the user asks to turn a sentence, or a task they repeat, into a skill card: keep the phrasing that should stay the same verbatim, replace only the parts that change each time with ${name} placeholders, give every placeholder a short label, pick a short title, and save it with create. Prefer one card per recurring task and do not invent extra cards."
].join("\n");
function toolDefinition(library) {
  return {
    name: "skillcard",
    description: TOOL_DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: ["list", "get", "create", "update", "delete"],
          description: "Operation to perform."
        },
        id: {
          type: "string",
          description: "Card id. Required for get, update and delete."
        },
        title: {
          type: "string",
          description: "Short card title shown in the sidebar and under the composer."
        },
        template: {
          type: "string",
          description: "The prompt template. Per-use values are written as ${name}."
        },
        description: {
          type: "string",
          description: "One sentence about when to use this card."
        },
        category: {
          type: "string",
          description: "Optional group name, for example \u5929\u6C14 or \u5199\u4F5C."
        },
        skill: {
          type: "string",
          description: "Optional skill name this card drives, for example weather."
        },
        variables: {
          type: "array",
          description: "Optional labels and examples for the placeholders; names must match the template.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name"],
            properties: {
              name: { type: "string", description: "Placeholder name without the ${ } wrapper." },
              label: { type: "string", description: "Field label shown in the fill-in form." },
              example: { type: "string", description: "Example value used as the input placeholder." }
            }
          }
        }
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: { text: { type: "string" } }
      },
      render(_args, value) {
        const text = value !== null && typeof value === "object" && !Array.isArray(value) ? String(value.text ?? "") : "";
        return [{ type: "text", text }];
      }
    },
    async execute(args) {
      const input = args !== null && typeof args === "object" ? args : {};
      const action = typeof input.action === "string" ? input.action : "";
      if (action === "list") return { text: describeCards(await library.list()) };
      if (action === "get") {
        const card = await library.get(cleanText(input.id, MAX_SHORT));
        if (card === void 0) throw new Error(`no skill card with id "${cleanText(input.id, MAX_SHORT)}"`);
        return { text: describeCard(card) };
      }
      if (action === "create" || action === "update") {
        const card = await library.upsert({
          id: action === "update" ? input.id : void 0,
          title: input.title,
          template: input.template,
          description: input.description,
          category: input.category,
          skill: input.skill,
          variables: input.variables
        });
        const verb = action === "create" ? "Created" : "Updated";
        return { text: `${verb} skill card "${card.title}" (id ${card.id}).
${describeCard(card)}` };
      }
      if (action === "delete") {
        await library.remove(String(input.id ?? ""));
        return { text: `Deleted skill card ${cleanText(input.id, MAX_SHORT)}.` };
      }
      throw new Error(`unknown skillcard action "${action}": expected list, get, create, update or delete`);
    }
  };
}
function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer"
  });
  res.end(payload);
}
async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return void 0;
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return void 0;
  }
}
function sameOriginAllowed(req) {
  const host = req.headers.host;
  if (typeof host !== "string" || host === "") return false;
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers.origin;
  if (origin !== void 0) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}
function buildRoutes(library, config, runLog) {
  const route = (path, method, handler) => ({
    kind: "exact",
    path: `${API_BASE}${path}`,
    async handler(req, res) {
      if (!sameOriginAllowed(req)) {
        writeJson(res, 403, { ok: false, code: "forbidden", message: "request must come from the web app origin" });
        return;
      }
      const allowed = method === "GET" ? ["GET", "HEAD"] : ["POST"];
      if (!allowed.includes(req.method ?? "")) {
        writeJson(res, 405, { ok: false, code: "method", message: `${method} only` });
        return;
      }
      try {
        writeJson(res, 200, { ok: true, value: await handler(req) });
      } catch (error) {
        writeJson(res, 200, {
          ok: false,
          code: "failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  });
  return [
    route("/cards", "GET", async () => ({ cards: await library.list(), config })),
    route("/save", "POST", async (req) => {
      const body = await readJsonBody(req);
      if (body === void 0) throw new Error("request body must be JSON");
      const payload = body;
      const card = await library.upsert(payload.card ?? payload);
      return { card, cards: await library.list() };
    }),
    route("/delete", "POST", async (req) => {
      const body = await readJsonBody(req);
      if (body === void 0) throw new Error("request body must be JSON");
      await library.remove(String(body.id ?? ""));
      return { cards: await library.list() };
    }),
    route("/use", "POST", async (req) => {
      const body = await readJsonBody(req);
      if (body === void 0) throw new Error("request body must be JSON");
      return { card: await library.markUsed(String(body.id ?? "")) };
    }),
    route("/skills", "GET", async () => ({ skills: await library.skills() })),
    route("/runs", "GET", async (req) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const cardId = url.searchParams.get("cardId") ?? "";
      return { runs: await runLog.list(cardId === "" ? {} : { cardId }) };
    }),
    route("/runs/record", "POST", async (req) => {
      const body = await readJsonBody(req);
      if (body === void 0) throw new Error("request body must be JSON");
      const payload = body;
      return { run: await runLog.record(payload.run ?? payload) };
    }),
    route("/runs/delete", "POST", async (req) => {
      const body = await readJsonBody(req);
      if (body === void 0) throw new Error("request body must be JSON");
      const payload = body;
      const ids = Array.isArray(payload.ids) ? payload.ids : [payload.id];
      return { deleted: await runLog.remove(ids) };
    })
  ];
}
function apply(ctx, config) {
  const resolved = readConfig(config);
  const runLog = createRunLog();
  const library = createLibrary({
    onCardRemoved: (cardId) => runLog.removeByCard(cardId),
    skills: async () => {
      const skills = ctx.get("skills");
      if (skills === void 0 || typeof skills.list !== "function") return [];
      const workingDirectory = ctx.get("workingDirectory");
      const cwd = typeof workingDirectory?.defaultDirectory === "string" ? workingDirectory.defaultDirectory : void 0;
      const lookup = cwd === void 0 ? {} : { cwd };
      const agents = ctx.get("agents");
      let agent;
      if (typeof agents?.roots === "function") agent = agents.roots()[0];
      let list;
      if (agent !== void 0) {
        try {
          list = await skills.list({ ...lookup, scope: agent });
        } catch {
          list = void 0;
        }
      }
      if (list === void 0) list = await skills.list(lookup);
      return list.map((skill) => ({
        name: skill.name,
        description: skill.description,
        whenToUse: skill.whenToUse ?? "",
        source: skill.source ?? ""
      }));
    }
  });
  ctx.inject(["webServer"], (sctx) => {
    sctx.effect(() => {
      const webServer = sctx.get("webServer");
      if (webServer === void 0) return;
      const disposers = buildRoutes(library, resolved, runLog).map((route) => webServer.register(route));
      return () => {
        for (const dispose of disposers) dispose();
      };
    }, "dsh-skillcard: web bridge");
  });
  ctx.inject(["tools"], (sctx) => {
    sctx.effect(() => {
      const tools = sctx.get("tools");
      return tools === void 0 ? void 0 : tools.register(toolDefinition(library));
    }, "dsh-skillcard: skillcard tool");
  });
}
export {
  apply
};
