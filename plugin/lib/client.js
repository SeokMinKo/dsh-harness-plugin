window.__ModuleLoader__.load({ id: "dsh-team-chat", factory: (require) => { const module = { exports: {} }; const exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.jsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react4 = __toESM(require("react"), 1);

// src/protocol.js
var import_zod2 = require("zod");

// src/workflow-model.js
var import_zod = require("zod");
var key = import_zod.z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
var title = import_zod.z.string().trim().min(1).max(100);
var note = import_zod.z.string().trim().max(1200);
var path = import_zod.z.string().trim().min(1).max(240);
var userText = import_zod.z.string().trim().min(1).max(6e3);
var revision = import_zod.z.number().int().nonnegative();
var runKey = import_zod.z.uuid();
var edge = import_zod.z.strictObject({ from: key, when: import_zod.z.enum(["success", "failure", "settled"]) });
var workflowDraft = import_zod.z.strictObject({
  title,
  layout: import_zod.z.enum(["sequence", "hierarchy", "parallel", "mixed", "blank"]),
  groups: import_zod.z.array(import_zod.z.strictObject({ id: key, title, parent: key.nullable(), agent: import_zod.z.string().min(1).max(128).nullable().optional() })).max(12),
  nodes: import_zod.z.array(import_zod.z.strictObject({
    id: key,
    title,
    agent: import_zod.z.string().min(1).max(128).nullable(),
    group: key.nullable(),
    instruction: note,
    completion: note,
    needsDevice: import_zod.z.boolean(),
    tools: import_zod.z.boolean(),
    outputs: import_zod.z.array(path).max(8),
    after: import_zod.z.array(edge).max(15)
  })).max(16)
});
var folderRule = import_zod.z.strictObject({
  directory: path,
  suffix: import_zod.z.string().trim().min(2).max(32).regex(/^\.[a-zA-Z0-9._-]+$/),
  device: import_zod.z.string().trim().max(96),
  enabled: import_zod.z.boolean()
});
var allocationProposal = import_zod.z.strictObject({
  title,
  nodes: import_zod.z.array(import_zod.z.strictObject({
    id: key,
    title,
    agent: import_zod.z.string().min(1).max(128),
    instruction: note,
    completion: note.optional(),
    after: import_zod.z.array(key).max(15),
    tools: import_zod.z.boolean().optional(),
    needsDevice: import_zod.z.boolean().optional(),
    outputs: import_zod.z.array(path).max(8).optional()
  })).min(1).max(16)
});
var stepOutput = import_zod.z.discriminatedUnion("status", [
  import_zod.z.strictObject({ status: import_zod.z.literal("complete"), summary: userText, artifacts: import_zod.z.array(path).max(8) }),
  import_zod.z.strictObject({ status: import_zod.z.literal("question"), question: userText }),
  import_zod.z.strictObject({ status: import_zod.z.literal("failed"), summary: userText }),
  import_zod.z.strictObject({ status: import_zod.z.literal("checkpoint"), state: userText, files: import_zod.z.array(path).max(8).optional() }),
  import_zod.z.strictObject({ status: import_zod.z.literal("handoff"), summary: userText, target: key, instruction: note })
]);
var workflowRequest = import_zod.z.discriminatedUnion("action", [
  import_zod.z.strictObject({ action: import_zod.z.literal("view") }),
  import_zod.z.strictObject({
    action: import_zod.z.literal("approveAllocation"),
    id: runKey,
    revision,
    assignments: import_zod.z.array(import_zod.z.strictObject({ nodeId: key, agent: import_zod.z.string().min(1).max(128) })).min(1).max(16),
    input: import_zod.z.string().trim().max(240),
    device: import_zod.z.string().trim().max(96)
  }),
  import_zod.z.strictObject({ action: import_zod.z.literal("stopTask"), id: runKey, nodeId: key, token: revision }),
  import_zod.z.strictObject({
    action: import_zod.z.literal("recoverTask"),
    id: runKey,
    nodeId: key,
    token: revision,
    decision: import_zod.z.enum(["resume", "restart", "cancel"]),
    file: import_zod.z.string().trim().max(240).optional(),
    text: import_zod.z.string().trim().max(6e3).optional(),
    tools: import_zod.z.boolean()
  }),
  import_zod.z.strictObject({ action: import_zod.z.literal("suggest"), revision, text: userText, nodeId: key.optional() }),
  import_zod.z.strictObject({ action: import_zod.z.literal("draft"), revision, draft: workflowDraft }),
  import_zod.z.strictObject({ action: import_zod.z.literal("publish"), revision }),
  import_zod.z.strictObject({ action: import_zod.z.literal("folder"), revision, folder: folderRule }),
  import_zod.z.strictObject({
    action: import_zod.z.literal("start"),
    id: runKey,
    version: revision,
    input: import_zod.z.string().trim().max(240),
    device: import_zod.z.string().trim().max(96),
    tools: import_zod.z.boolean()
  }),
  import_zod.z.strictObject({ action: import_zod.z.literal("answer"), id: runKey, nodeId: key, questionId: runKey, text: userText }),
  import_zod.z.strictObject({
    action: import_zod.z.literal("retry"),
    id: runKey,
    nodeId: key,
    attempt: revision,
    decision: import_zod.z.enum(["retry", "failed"]),
    tools: import_zod.z.boolean()
  }),
  import_zod.z.strictObject({ action: import_zod.z.literal("authorize"), id: runKey, nodeId: key, attempt: revision }),
  import_zod.z.strictObject({ action: import_zod.z.literal("repair"), id: runKey, runRevision: revision }),
  import_zod.z.strictObject({ action: import_zod.z.literal("apply"), id: runKey, revision, runRevision: revision })
]);
var initialDraft = () => ({ title: "\uC6CC\uD06C\uD50C\uB85C\uC6B0", layout: "blank", groups: [], nodes: [] });
var initialNode = (id2, name = "\uC0C8 \uC791\uC5C5") => ({
  id: id2,
  title: name,
  agent: null,
  group: null,
  instruction: "",
  completion: "",
  needsDevice: false,
  tools: false,
  outputs: [],
  after: []
});
function ordered(records, dependencies) {
  const entries = new Map(records.map((item) => [item.id, item]));
  if (entries.size !== records.length) throw new Error("\uC911\uBCF5\uB41C \uC791\uC5C5 \uB610\uB294 \uADF8\uB8F9 ID\uAC00 \uC788\uC2B5\uB2C8\uB2E4.");
  const visiting = /* @__PURE__ */ new Set();
  const done = /* @__PURE__ */ new Set();
  const order = [];
  function visit(id2) {
    if (visiting.has(id2)) throw new Error("\uC21C\uD658 \uC5F0\uACB0 \xB7 " + [...visiting, id2].map((key2) => entries.get(key2)?.title ?? key2).join(" \u2192 "));
    if (done.has(id2)) return;
    const record = entries.get(id2);
    if (!record) throw new Error("\uC5F0\uACB0\uB41C \uC791\uC5C5 \uB610\uB294 \uADF8\uB8F9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. " + id2);
    visiting.add(id2);
    const parents = dependencies(record);
    if (new Set(parents).size !== parents.length) throw new Error("\uAC19\uC740 \uC120\uD589 \uC791\uC5C5\uC774 \uB450 \uBC88 \uC5F0\uACB0\uB410\uC2B5\uB2C8\uB2E4. " + record.title);
    for (const parent of parents) visit(parent);
    visiting.delete(id2);
    done.add(id2);
    order.push(record);
  }
  for (const item of records) visit(item.id);
  return order;
}
function orderNodes(draft) {
  return ordered(draft.nodes, (node) => node.after.map((edge2) => edge2.from));
}
function checkDraft(draft, members, runnable = false) {
  workflowDraft.parse(draft);
  const groups = new Set(ordered(draft.groups, (group) => group.parent ? [group.parent] : []).map((group) => group.id));
  const agents = new Set(members.map((item) => item.id));
  if (draft.groups.some((group) => group.agent && !agents.has(group.agent))) throw new Error("\uACC4\uCE35 \uADF8\uB8F9\uC758 \uB2F4\uB2F9 Agent\uAC00 \uD604\uC7AC \uD300\uC5D0 \uC5C6\uC2B5\uB2C8\uB2E4.");
  if (runnable && !draft.nodes.length) throw new Error("\uC791\uC5C5\uC744 \uD558\uB098 \uC774\uC0C1 \uCD94\uAC00\uD558\uC138\uC694.");
  for (const node of orderNodes(draft)) {
    if (node.group && !groups.has(node.group)) throw new Error("\uC791\uC5C5\uC758 \uADF8\uB8F9\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. " + node.title);
    if (node.agent && !agents.has(node.agent)) throw new Error("\uD604\uC7AC \uD300\uC5D0 \uC5C6\uB294 Agent\uC785\uB2C8\uB2E4. " + node.title);
    if (runnable && !node.agent) throw new Error("\uB2F4\uB2F9 Agent\uB97C \uC120\uD0DD\uD558\uC138\uC694. " + node.title);
  }
  return draft;
}
function changedDraft(before, after, members = []) {
  const previous = new Map(before.nodes.map((node) => [node.id, node]));
  const current = new Map(after.nodes.map((node) => [node.id, node]));
  const changes = [];
  if (before.title !== after.title) changes.push("\uC774\uB984 \xB7 " + after.title);
  if (before.layout !== after.layout) changes.push("\uBCF4\uAE30 \xB7 " + after.layout);
  if (JSON.stringify(before.groups) !== JSON.stringify(after.groups)) changes.push("\uACC4\uCE35 \uADF8\uB8F9 \uBCC0\uACBD");
  const agent = (id2) => members.find((item) => item.id === id2)?.name ?? (id2 ? id2.slice(0, 8) : "\uBBF8\uBC30\uC815");
  const condition = { success: "\uC131\uACF5 \uD6C4", failure: "\uC2E4\uD328 \uC2DC", settled: "\uC885\uB8CC \uD6C4" };
  const connections = (node) => node.after.map((edge2) => (current.get(edge2.from)?.title ?? edge2.from) + " " + condition[edge2.when]).join(", ") || "\uC5C6\uC74C";
  for (const node of after.nodes) {
    const old = previous.get(node.id);
    if (!old) {
      changes.push("\uCD94\uAC00 \xB7 " + node.title + " \xB7 " + agent(node.agent) + (node.after.length ? " \xB7 " + connections(node) : "") + (node.tools ? " \xB7 DSH \uB3C4\uAD6C \uD544\uC694" : "") + (node.needsDevice ? " \xB7 \uB300\uC0C1 \uC7A5\uBE44 \uC810\uC720" : ""));
    } else if (JSON.stringify(old) !== JSON.stringify(node)) {
      const detail = [];
      if (old.agent !== node.agent) detail.push("\uB2F4\uB2F9 " + agent(old.agent) + " \u2192 " + agent(node.agent));
      if (JSON.stringify(old.after) !== JSON.stringify(node.after)) detail.push("\uC120\uD589 \xB7 " + connections(node));
      if (old.tools !== node.tools) detail.push(node.tools ? "DSH \uB3C4\uAD6C \uD544\uC694" : "\uD14D\uC2A4\uD2B8 \uC804\uC6A9");
      if (old.needsDevice !== node.needsDevice) detail.push(node.needsDevice ? "\uB300\uC0C1 \uC7A5\uBE44 \uC810\uC720" : "\uC7A5\uBE44 \uC810\uC720 \uD574\uC81C");
      changes.push("\uC218\uC815 \xB7 " + node.title + (detail.length ? " \xB7 " + detail.join(" \xB7 ") : ""));
    }
  }
  for (const node of before.nodes) if (!current.has(node.id)) changes.push("\uC0AD\uC81C \xB7 " + node.title);
  return changes;
}

// src/protocol.js
var packageName = "dsh-team-chat";
var namespace = "teamChat";
var roomId = import_zod2.z.string().min(1).max(128);
var member = import_zod2.z.object({
  id: roomId,
  name: import_zod2.z.string().min(1).max(64),
  role: import_zod2.z.enum(["lead", "teammate"]),
  description: import_zod2.z.string().max(500)
});
var id = import_zod2.z.uuid();
var text = import_zod2.z.string().max(12e3);
var mode = import_zod2.z.number().int().min(1).max(3);
var roomSettings = {
  teamId: roomId,
  title: import_zod2.z.string().trim().min(1).max(100),
  members: import_zod2.z.array(roomId).min(2).max(6),
  rounds: mode
};
var requestSchema = import_zod2.z.discriminatedUnion("op", [
  import_zod2.z.strictObject({ op: import_zod2.z.literal("list") }),
  import_zod2.z.strictObject({ op: import_zod2.z.literal("view"), teamId: roomId, before: id.optional() }),
  import_zod2.z.strictObject({ op: import_zod2.z.literal("save"), ...roomSettings }),
  import_zod2.z.strictObject({
    op: import_zod2.z.literal("send"),
    teamId: roomId,
    id,
    text: text.trim().min(1),
    replyTo: id.optional(),
    tools: import_zod2.z.boolean(),
    allocation: import_zod2.z.boolean().optional()
  }),
  import_zod2.z.strictObject({ op: import_zod2.z.literal("resume"), teamId: roomId, questionId: id }),
  import_zod2.z.strictObject({ op: import_zod2.z.literal("workflow"), teamId: roomId, input: workflowRequest }),
  import_zod2.z.strictObject({
    op: import_zod2.z.literal("stop"),
    teamId: roomId,
    mode: import_zod2.z.enum(["current", "all"]).optional(),
    activeId: id.optional(),
    runId: id.optional()
  })
]);
var baseMessage = {
  id,
  author: import_zod2.z.string().max(64),
  text,
  time: import_zod2.z.number(),
  replyTo: id.optional()
};
var user = import_zod2.z.object({
  ...baseMessage,
  kind: import_zod2.z.literal("user"),
  tools: import_zod2.z.boolean(),
  allocation: import_zod2.z.literal(true).optional(),
  recipients: import_zod2.z.array(roomId),
  status: import_zod2.z.enum(["queued", "running", "waiting", "complete", "partial", "stopped", "interrupted", "failed"])
});
var bot = import_zod2.z.object({
  ...baseMessage,
  kind: import_zod2.z.literal("bot"),
  memberId: roomId,
  status: import_zod2.z.enum(["running", "complete", "stopped", "interrupted", "failed"]),
  workflowRunId: id.optional(),
  workflowNodeId: import_zod2.z.string().max(64).optional(),
  error: import_zod2.z.string().max(800).optional(),
  asksUser: import_zod2.z.boolean().optional(),
  truncated: import_zod2.z.boolean().optional(),
  handoffWarnings: import_zod2.z.array(import_zod2.z.object({
    name: import_zod2.z.string().max(64),
    reason: import_zod2.z.enum(["unknown", "self", "broadcast", "round-limit", "budget"])
  })).max(8).optional(),
  handoffWarningCount: import_zod2.z.number().int().positive().optional()
});
var messageSchema = import_zod2.z.discriminatedUnion("kind", [user, bot]);
var archiveSchema = import_zod2.z.array(messageSchema).length(64);
var step = import_zod2.z.object({
  id: roomId,
  round: mode,
  replyTo: id,
  messageId: id.optional(),
  handoffFrom: id.optional(),
  handoffIds: import_zod2.z.array(id).max(12).optional()
});
var continuation = import_zod2.z.object({
  rootId: id,
  steps: import_zod2.z.array(step).min(1).max(12),
  cursor: import_zod2.z.number().int().min(1).max(12),
  passed: import_zod2.z.number().int().min(0).max(12),
  failed: import_zod2.z.number().int().min(0).max(12),
  skipped: import_zod2.z.number().int().nonnegative().optional(),
  question: import_zod2.z.object({ messageId: id, memberId: roomId, step: import_zod2.z.number().int().min(0).max(11) }),
  answerId: id.optional()
});
var roomSchema = import_zod2.z.object({
  teamId: roomId,
  title: roomSettings.title,
  members: import_zod2.z.array(member).min(2).max(6),
  rounds: mode,
  continuation: continuation.optional(),
  awaiting: import_zod2.z.object({ messageId: id, memberId: roomId }).optional(),
  priorityId: id.optional(),
  base: import_zod2.z.number().int().nonnegative().multipleOf(64).optional(),
  messages: import_zod2.z.array(messageSchema)
});
function codec(name, schema) {
  return { mode: "strict", typeSymbol: packageName + "#" + name, create: () => schema };
}
var jsonCodec = codec("Json", import_zod2.z.json());
var descriptors = [{
  id: packageName + "#teamChat/request",
  service: namespace,
  namespace,
  method: "request",
  invocation: { kind: "direct" },
  parameters: [{ name: "input", wire: "input", source: "json", codec: codec("Request", requestSchema) }],
  result: jsonCodec
}, {
  id: packageName + "#teamChat/watch",
  service: namespace,
  namespace,
  method: "watch",
  mode: "stream",
  invocation: { kind: "direct" },
  parameters: [{ name: "teamId", wire: "teamId", source: "json", codec: codec("TeamId", roomId) }],
  cancellation: { parameter: "signal" },
  result: jsonCodec
}];

// src/routing.js
var mentionPattern = /(?<![\p{L}\p{N}_@])@([a-z0-9][a-z0-9-]{0,63})(?![a-z0-9_-])/giu;
function outsideCode(text2) {
  let fence;
  return text2.split("\n").map((line) => {
    const marker = /^ {0,3}([`~])\1{2,}/.exec(line);
    if (fence) {
      if (marker?.[1] === fence.char && marker[0].trim().length >= fence.length && /^\s*$/.test(line.slice(marker[0].length))) fence = void 0;
      return "";
    }
    if (marker) {
      fence = { char: marker[1], length: marker[0].trim().length };
      return "";
    }
    if (/^ {0,3}>|^ {4}|^\t/.test(line)) return "";
    return line.replace(/(`+).*?\1/g, (match) => " ".repeat(match.length));
  });
}
function mentions(text2) {
  return [...new Set([...text2.matchAll(mentionPattern)].map((match) => match[1].toLowerCase()))];
}
function routeUser(text2, members, replyTo, requireExplicit = false) {
  const names = mentions(outsideCode(text2).join("\n"));
  const byName = new Map(members.map((member2) => [member2.name.toLowerCase(), member2.id]));
  const broadcast = names.some((name) => name === "all" || name === "everyone");
  const invalid = names.filter((name) => !["all", "everyone", "user"].includes(name) && !byName.has(name));
  if (invalid.length) throw new Error("\uB300\uD654\uBC29\uC5D0 \uC5C6\uB294 \uD300\uC6D0 \xB7 " + invalid.map((name) => "@" + name).join(", "));
  const ids = names.flatMap((name) => byName.has(name) ? [byName.get(name)] : []);
  const replyIsMember = replyTo && members.some((member2) => member2.id === replyTo);
  if (requireExplicit && (broadcast || ids.length > 1 || !ids.length && !replyIsMember)) {
    throw new Error("DSH \uB3C4\uAD6C\uB97C \uD5C8\uC6A9\uD558\uB824\uBA74 \uD300\uC6D0 \uD55C \uBA85\uC744 \uBA58\uC158\uD558\uAC70\uB098 \uADF8 \uD300\uC6D0\uC758 \uBA54\uC2DC\uC9C0\uC5D0 \uB2F5\uC7A5\uD558\uC138\uC694.");
  }
  if (broadcast) return members.map((member2) => member2.id);
  if (ids.length) return ids;
  if (replyTo && !replyIsMember) throw new Error("\uC774 \uD300\uC6D0\uC740 \uD604\uC7AC \uB300\uD654\uBC29 \uCC38\uAC00\uC790\uAC00 \uC544\uB2D9\uB2C8\uB2E4.");
  if (replyIsMember) return [replyTo];
  return [members.find((member2) => member2.role === "lead")?.id ?? members[0].id];
}

// src/composer.js
function mentionAt(text2, caret) {
  const line = outsideCode(text2.slice(0, caret)).at(-1);
  const match = /(?<![\p{L}\p{N}_@])@([a-z0-9-]*)$/iu.exec(line);
  if (!match) return void 0;
  const suffix = /^[a-z0-9-]*/i.exec(text2.slice(caret))[0];
  return { start: caret - match[0].length, end: caret + suffix.length, query: match[1].toLowerCase() };
}
function insertMention(text2, name, range) {
  const before = text2.slice(0, range.start);
  const after = text2.slice(range.end);
  const gap = before && /[\p{L}\p{N}_@]$/u.test(before) ? " " : "";
  const following = /^\s|^[,.;:!?)]/.test(after) ? "" : " ";
  const head = before + gap + "@" + name + following;
  return { text: head + after, caret: head.length + Number(after.startsWith(" ")) };
}
function requestIdentity(previous, { text: text2, tools, replyTo, allocation }, createId) {
  const signature = JSON.stringify([text2, tools, replyTo ?? null, Boolean(allocation)]);
  return previous?.signature === signature ? previous : { text: text2, signature, id: createId() };
}
function matchesMessage(message, query) {
  const value = query.trim().toLowerCase();
  return !value || message.text.toLowerCase().includes(value) || ("@" + message.author.toLowerCase()).includes(value);
}
function retryDraft(message, members) {
  if (message.allocation) return message.text;
  const recipients = message.recipients.map((id2) => members.find((member2) => member2.id === id2));
  if (!recipients.length || recipients.some((member2) => !member2)) return void 0;
  const original = routeUser(message.text, members);
  if (original.join(" ") === message.recipients.join(" ")) return message.text;
  return recipients.map((member2) => "@" + member2.name).join(" ") + " " + message.text;
}

// src/allocation-routing.js
function requestsAllocation(text2, replyTo) {
  if (replyTo) return false;
  const command = outsideCode(text2).join(" ");
  const targets = [...command.matchAll(/(?<![\p{L}\p{N}_@])@([a-z0-9-]+)/giu)].map((match) => match[1].toLowerCase());
  if (targets.some((name) => name !== "lead")) return false;
  return /나눠|나누어|(?:분담|분배|배분|분업)\s*(?:을\s*)?(?:해|하|시켜)|\b(?:delegate|split|divide|distribute)\b/i.test(command);
}

// src/allocation-ui.jsx
var import_react2 = __toESM(require("react"), 1);

// src/task-controls.jsx
var import_react = __toESM(require("react"), 1);
var taskStates = {
  pending: "\uB300\uAE30",
  running: "\uC2E4\uD589 \uC911",
  finishing: "\uACB0\uACFC \uBC18\uC601 \uC911",
  question: "\uB2F5\uBCC0 \uB300\uAE30",
  approval: "\uC2B9\uC778 \uB300\uAE30",
  complete: "\uC644\uB8CC",
  failed: "\uC2E4\uD328",
  skipped: "\uAC74\uB108\uB700",
  interrupted: "\uD655\uC778 \uD544\uC694",
  stopping: "\uC911\uC9C0 \uC694\uCCAD\uB428",
  suspended: "\uC911\uC9C0\uB428",
  cancelled: "\uCDE8\uC18C\uB428",
  blocked: "\uD6C4\uC18D \uC791\uC5C5 \uBCF4\uB958"
};
function TaskControls({ run, node, step: step2, command }) {
  const [working, setWorking] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)("");
  const [expanded, setExpanded] = (0, import_react.useState)(false);
  const [text2, setText] = (0, import_react.useState)(step2.inputText ?? "");
  const [file, setFile] = (0, import_react.useState)(void 0);
  const [tools, setTools] = (0, import_react.useState)(false);
  const ready = ["pending", "running", "question", "approval"].includes(step2.status);
  const recoverable = ["suspended", "interrupted", "failed"].includes(step2.status);
  async function submit(input) {
    setError("");
    setWorking(true);
    try {
      const result = await command({ id: run.id, nodeId: node.id, ...input });
      if (result) setExpanded(false);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setWorking(false);
    }
  }
  function recover(decision) {
    return submit({
      action: "recoverTask",
      token: step2.token ?? 0,
      decision,
      tools,
      ...file !== void 0 ? { file } : {},
      ...text2 !== (step2.inputText ?? "") ? { text: text2 } : {}
    });
  }
  if (!ready && !recoverable && step2.status !== "stopping") return null;
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "tc-task-actions" }, step2.hasCheckpoint && /* @__PURE__ */ import_react.default.createElement("small", { className: "tc-wf-muted" }, "\uCCB4\uD06C\uD3EC\uC778\uD2B8 \uC800\uC7A5\uB428"), ready && /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      className: "tc-wf-danger",
      disabled: working,
      type: "button",
      onClick: () => submit({ action: "stopTask", token: step2.token ?? 0 })
    },
    "\uC774 \uC791\uC5C5\uB9CC \uC911\uC9C0"
  ), step2.status === "stopping" && /* @__PURE__ */ import_react.default.createElement("small", { role: "status" }, "Agent\uAC00 \uC911\uC9C0\uB97C \uCC98\uB9AC \uC911\uC785\uB2C8\uB2E4."), step2.status === "approval" && /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      type: "button",
      disabled: working,
      onClick: () => submit({ action: "authorize", attempt: step2.attempt })
    },
    "\uC774 \uC791\uC5C5\uC758 DSH \uB3C4\uAD6C \uD5C8\uC6A9"
  ), recoverable && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", "aria-expanded": expanded, onClick: () => setExpanded(!expanded) }, "\uBCF5\uAD6C \uC120\uD0DD"), expanded && /* @__PURE__ */ import_react.default.createElement("div", { className: "tc-task-recover" }, node.needsDevice && step2.status === "interrupted" && /* @__PURE__ */ import_react.default.createElement("p", null, "\uC7A5\uBE44 \uC0C1\uD0DC\uB97C \uD655\uC778\uD55C \uB4A4 \uC870\uCE58\uB97C \uC120\uD0DD\uD558\uC138\uC694."), !step2.hasCheckpoint && /* @__PURE__ */ import_react.default.createElement("small", null, "\uC800\uC7A5\uB41C \uCCB4\uD06C\uD3EC\uC778\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."), !step2.finishPending && /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("label", null, "\uAD50\uC815\uD55C \uC785\uB825", /* @__PURE__ */ import_react.default.createElement("textarea", { maxLength: 6e3, value: text2, onChange: (event) => setText(event.target.value) })), /* @__PURE__ */ import_react.default.createElement("label", null, "\uAD50\uCCB4 \uD30C\uC77C", /* @__PURE__ */ import_react.default.createElement(
    "input",
    {
      value: file ?? step2.inputFile?.path ?? run.input ?? "",
      onChange: (event) => setFile(event.target.value),
      placeholder: "\uC791\uC5C5 \uACF5\uAC04 \uC0C1\uB300 \uACBD\uB85C"
    }
  )), node.tools && /* @__PURE__ */ import_react.default.createElement("label", { className: "tc-wf-check" }, /* @__PURE__ */ import_react.default.createElement(
    "input",
    {
      type: "checkbox",
      checked: tools,
      onChange: (event) => setTools(event.target.checked)
    }
  ), " \uC774 \uC2DC\uB3C4\uC5D0 DSH \uB3C4\uAD6C \uD5C8\uC6A9")), /* @__PURE__ */ import_react.default.createElement("div", { className: "tc-wf-row" }, step2.finishPending ? /* @__PURE__ */ import_react.default.createElement(
    "button",
    {
      type: "button",
      disabled: working,
      onClick: () => submit({ action: "retry", attempt: step2.attempt, decision: "retry", tools: false })
    },
    "\uACB0\uACFC \uBC18\uC601 \uB2E4\uC2DC \uC2DC\uB3C4"
  ) : /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("button", { type: "button", disabled: working || !step2.hasCheckpoint, onClick: () => recover("resume") }, "\uC911\uB2E8 \uC9C0\uC810\uBD80\uD130 \uC7AC\uAC1C"), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", disabled: working, onClick: () => recover("restart") }, "\uCC98\uC74C\uBD80\uD130 \uC7AC\uC2E4\uD589")), /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "tc-wf-danger", disabled: working, onClick: () => recover("cancel") }, "\uC774 \uC791\uC5C5 \uCDE8\uC18C")))), error && /* @__PURE__ */ import_react.default.createElement("p", { className: "tc-error", role: "alert" }, error));
}

// src/allocation-ui.jsx
function AllocationCard({ id: id2, assignment, members, command, openAgent, ask }) {
  const [chosen, setChosen] = (0, import_react2.useState)({});
  const [file, setFile] = (0, import_react2.useState)("");
  const [device, setDevice] = (0, import_react2.useState)("");
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [error, setError] = (0, import_react2.useState)("");
  const plan = assignment?.draft;
  const run = assignment?.run;
  const agentName = (agent) => members.find((member2) => member2.id === agent)?.name ?? "\uD300\uC6D0";
  const taskName = (id3) => plan.nodes.find((node) => node.id === id3)?.title ?? id3;
  async function approve(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await command({
        action: "approveAllocation",
        id: id2,
        revision: assignment.revision,
        input: file,
        device,
        assignments: plan.nodes.map((node) => ({ nodeId: node.id, agent: chosen[node.id] ?? node.agent }))
      });
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  if (!assignment || assignment.status === "planning") return /* @__PURE__ */ import_react2.default.createElement("p", { className: "tc-allocation-note", role: "status" }, "\uB9AC\uB4DC\uAC00 \uBC30\uBD84\uC548\uC744 \uC791\uC131\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.");
  if (assignment.status === "failed" || assignment.status === "stopped") {
    return /* @__PURE__ */ import_react2.default.createElement("p", { className: "tc-allocation-note", role: "status" }, assignment.detail);
  }
  if (run) return /* @__PURE__ */ import_react2.default.createElement("section", { className: "tc-allocation", "aria-label": "Agent\uBCC4 \uC2E4\uD589 \uACB0\uACFC" }, /* @__PURE__ */ import_react2.default.createElement("header", null, /* @__PURE__ */ import_react2.default.createElement("strong", null, "Agent\uBCC4 \uACB0\uACFC"), /* @__PURE__ */ import_react2.default.createElement("span", { className: "tc-wf-status", "data-state": run.status }, taskStates[run.status])), /* @__PURE__ */ import_react2.default.createElement("ul", { className: "tc-allocation-tasks" }, run.draft.nodes.map((node) => {
    const step2 = run.steps[node.id];
    return /* @__PURE__ */ import_react2.default.createElement("li", { key: node.id, "aria-label": node.title + " \uACB0\uACFC" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "tc-allocation-task" }, /* @__PURE__ */ import_react2.default.createElement("strong", null, node.title), /* @__PURE__ */ import_react2.default.createElement("small", null, "@", agentName(node.agent)), /* @__PURE__ */ import_react2.default.createElement("span", { className: "tc-wf-status", "data-state": step2.status }, step2.attention?.kind === "approval" ? "DSH \uC2B9\uC778 \uB300\uAE30" : step2.attention?.kind === "question" ? "DSH \uC9C8\uBB38 \uB300\uAE30" : taskStates[step2.status])), (step2.summary || step2.waiting || step2.detail) && /* @__PURE__ */ import_react2.default.createElement("p", null, step2.summary || step2.waiting || step2.detail), step2.artifacts?.length > 0 && /* @__PURE__ */ import_react2.default.createElement("ul", { className: "tc-wf-artifacts" }, step2.artifacts.map((file2) => /* @__PURE__ */ import_react2.default.createElement("li", { key: file2.path }, /* @__PURE__ */ import_react2.default.createElement("code", null, file2.path), " ", /* @__PURE__ */ import_react2.default.createElement("small", { title: file2.sha256 }, "SHA-256 ", file2.sha256.slice(0, 10), "\u2026")))), step2.question && step2.status === "question" && /* @__PURE__ */ import_react2.default.createElement("div", { className: "tc-wf-notice" }, /* @__PURE__ */ import_react2.default.createElement("p", null, step2.question.text), /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", onClick: () => ask({ run, node, question: step2.question }) }, "\uCC44\uD305\uC5D0\uC11C \uB2F5\uBCC0")), step2.messageId && /* @__PURE__ */ import_react2.default.createElement("button", { className: "tc-allocation-session", type: "button", onClick: () => openAgent(node.agent) }, "@", agentName(node.agent), " \uC6D0\uBCF8 \uC138\uC158"), /* @__PURE__ */ import_react2.default.createElement(TaskControls, { key: step2.token ?? 0, run, node, step: step2, command }));
  })));
  if (assignment.status !== "review" || !plan) return null;
  const valid = plan.nodes.every((node) => members.some((member2) => member2.id === (chosen[node.id] ?? node.agent)));
  const needsDevice = plan.nodes.some((node) => node.needsDevice);
  return /* @__PURE__ */ import_react2.default.createElement("form", { className: "tc-allocation", "aria-label": "\uB9AC\uB4DC \uBC30\uBD84\uC548", onSubmit: approve }, /* @__PURE__ */ import_react2.default.createElement("header", null, /* @__PURE__ */ import_react2.default.createElement("strong", null, plan.title), /* @__PURE__ */ import_react2.default.createElement("span", { className: "tc-wf-status" }, "\uC2B9\uC778 \uB300\uAE30")), /* @__PURE__ */ import_react2.default.createElement("ul", { className: "tc-allocation-tasks" }, plan.nodes.map((node) => {
    const selected = chosen[node.id] ?? node.agent;
    return /* @__PURE__ */ import_react2.default.createElement("li", { key: node.id }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "tc-allocation-task" }, /* @__PURE__ */ import_react2.default.createElement("strong", null, node.title), /* @__PURE__ */ import_react2.default.createElement("select", { "aria-label": node.title + " \uB2F4\uB2F9 Agent", value: selected, onChange: (event) => setChosen({ ...chosen, [node.id]: event.target.value }) }, !members.some((member2) => member2.id === selected) && /* @__PURE__ */ import_react2.default.createElement("option", { value: selected }, "\uB2F4\uB2F9 Agent \uC120\uD0DD"), members.map((member2) => /* @__PURE__ */ import_react2.default.createElement("option", { key: member2.id, value: member2.id }, "@", member2.name)))), /* @__PURE__ */ import_react2.default.createElement("p", null, node.instruction), node.completion && /* @__PURE__ */ import_react2.default.createElement("small", null, "\uC644\uB8CC \uC870\uAC74 \xB7 ", node.completion), node.after.length > 0 && /* @__PURE__ */ import_react2.default.createElement("small", null, "\uC120\uD589 \xB7 ", node.after.map((edge2) => taskName(edge2.from)).join(", ")), node.tools && /* @__PURE__ */ import_react2.default.createElement("small", null, "DSH \uB3C4\uAD6C \uD544\uC694 \xB7 \uC2E4\uD589 \uB2E8\uACC4\uC5D0\uC11C \uD5C8\uC6A9"));
  })), /* @__PURE__ */ import_react2.default.createElement("details", null, /* @__PURE__ */ import_react2.default.createElement("summary", null, "\uC785\uB825 \uD30C\uC77C", needsDevice ? " \xB7 \uB300\uC0C1 \uC7A5\uBE44 \uD544\uC218" : ""), /* @__PURE__ */ import_react2.default.createElement("label", null, "\uC785\uB825 \uD30C\uC77C", /* @__PURE__ */ import_react2.default.createElement("input", { maxLength: 240, value: file, onChange: (event) => setFile(event.target.value) })), needsDevice && /* @__PURE__ */ import_react2.default.createElement("label", null, "\uB300\uC0C1 \uC7A5\uBE44 ID", /* @__PURE__ */ import_react2.default.createElement("input", { maxLength: 96, value: device, onChange: (event) => setDevice(event.target.value) }))), /* @__PURE__ */ import_react2.default.createElement("button", { className: "tc-wf-primary", type: "submit", disabled: busy || !valid || needsDevice && !device.trim() }, "\uBC30\uBD84\uC548 \uC804\uCCB4 \uC2B9\uC778"), error && /* @__PURE__ */ import_react2.default.createElement("p", { className: "tc-error", role: "alert" }, error));
}

// src/style.css
var style_default = ".tc-app {\n  --tc-panel: #f5f7f6;\n  --tc-surface: #fff;\n  --tc-text: #1c2525;\n  --tc-muted: #536566;\n  --tc-line: #dbe4e1;\n  --tc-accent: #156b58;\n  --tc-accent-soft: #dff2ea;\n  --tc-accent-text: #114e41;\n  --tc-danger: #9e292f;\n  display: grid; grid-template-columns: clamp(175px, 22%, 248px) minmax(0, 1fr);\n  width: 100%; height: 100%; min-height: 0; overflow: hidden; color: var(--tc-text);\n  background: var(--tc-surface); font: 14px/1.5 Inter, system-ui, sans-serif;\n}\n:is(.dark, [data-theme=dark], [data-color-scheme=dark]) .tc-app {\n  --tc-panel: #1b2424; --tc-surface: #202a2a; --tc-text: #eef7f4; --tc-muted: #b3c6c1;\n  --tc-line: #364844; --tc-accent: #a1ecd3; --tc-accent-soft: #29483f; --tc-accent-text: #c0f7e5; --tc-danger: #ffb7b8;\n}\n.tc-app *, .tc-app *::before, .tc-app *::after { box-sizing: border-box; }\n.tc-app button, .tc-native-button {\n  display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 28px;\n  min-height: 28px; padding: 4px 8px; border: 1px solid transparent; border-radius: 7px;\n  background: transparent; color: inherit; font: inherit; cursor: pointer;\n}\n.tc-app button:hover { background: var(--tc-accent-soft); color: var(--tc-accent-text); }\n.tc-app button:disabled { opacity: .42; cursor: default; }\n.tc-app :is(button, input, textarea, select):focus-visible, .tc-native-button:focus-visible { outline: 2px solid var(--tc-accent, #156b58); outline-offset: 2px; }\n.tc-rooms { min-width: 0; background: var(--tc-panel); border-right: 1px solid var(--tc-line); overflow-y: auto; padding: 13px 10px; }\n.tc-list-head { display: flex; align-items: center; gap: 9px; padding: 3px 4px 13px; color: var(--tc-accent); }\n.tc-list-head strong { flex: 1; font-size: 15px; }\n.tc-app .tc-room-link { width: 100%; justify-content: flex-start; padding: 9px; margin-bottom: 3px; text-align: left; min-width: 0; }\n.tc-room-link strong { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }\n.tc-room-link small { flex: none; margin-left: auto; color: var(--tc-muted); }\n.tc-app .tc-room-link[data-current=true] { background: var(--tc-accent-soft); color: var(--tc-accent-text); }\n.tc-list-note { padding: 6px 7px; font-size: 12px; color: var(--tc-muted); }\n.tc-room { display: flex; flex-direction: column; min-width: 0; min-height: 0; }\n.tc-room-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 69px; padding: 10px 19px; border-bottom: 1px solid var(--tc-line); }\n.tc-room-head h1 { margin: 0; font-size: 18px; font-weight: 680; overflow-wrap: anywhere; }\n.tc-members { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }\n.tc-app .tc-members button { color: var(--tc-muted); min-height: 22px; padding: 0 4px; font-size: 12px; }\n.tc-app .tc-members button[data-speaking=true] { color: var(--tc-accent-text); background: var(--tc-accent-soft); }\n.tc-actions { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }\n.tc-room-head .tc-actions { flex-shrink: 0; justify-content: flex-end; }\n.tc-app .tc-actions button { border-color: var(--tc-line); font-size: 12px; }\n.tc-log { flex: 1; min-height: 0; overflow: auto; padding: 17px clamp(13px, 3.2vw, 38px) 24px; }\n.tc-empty { display: grid; place-content: center; justify-items: center; flex: 1; text-align: center; height: 100%; min-height: 120px; padding: 18px; color: var(--tc-muted); }\n.tc-empty svg { color: var(--tc-accent); }\n.tc-empty h2 { font-size: 18px; color: var(--tc-text); margin: 11px 0 4px; }\n.tc-empty p { max-width: 340px; margin: 0; }\n.tc-message { display: flex; gap: 9px; align-items: flex-start; margin: 0 auto 16px; max-width: 840px; }\n.tc-message.tc-user { flex-direction: row-reverse; }\n.tc-avatar { display: grid; place-items: center; border-radius: 10px; font-size: 13px; font-weight: 700; width: 30px; height: 30px; flex: 0 0 30px; color: #233230; }\n.tc-mint { background: #c7ece0; } .tc-blue { background: #d2e5fb; } .tc-rose { background: #f5d9e2; }\n.tc-amber { background: #f4e3bc; } .tc-lilac { background: #e7ddf5; } .tc-stone { background: #e3e7e8; }\n.tc-avatar.tc-human { color: var(--tc-accent-text); background: var(--tc-accent-soft); }\n.tc-bubble { min-width: 0; max-width: min(90%, 690px); }\n.tc-byline { display: flex; align-items: center; gap: 8px; min-height: 24px; color: var(--tc-muted); font-size: 12px; }\n.tc-byline strong { color: var(--tc-text); font-weight: 660; }\n.tc-origin { color: var(--tc-muted); font-size: 11px; padding-bottom: 3px; }\n.tc-user .tc-byline { justify-content: flex-end; }\n.tc-app .tc-byline button { min-height: 21px; min-width: 21px; padding: 0 3px; font-size: 11px; }\n.tc-body { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--tc-panel); border-radius: 3px 13px 13px 13px; padding: 9px 13px; line-height: 1.6; }\n.tc-user .tc-body { background: var(--tc-accent-soft); color: var(--tc-accent-text); border-radius: 13px 3px 13px 13px; }\n.tc-status { display: inline-block; color: var(--tc-muted); font-size: 12px; margin-top: 3px; }\n.tc-ask { color: var(--tc-accent); }\n.tc-error { color: var(--tc-danger); font-size: 12px; margin: 6px 0; overflow-wrap: anywhere; }\n.tc-banner { padding: 0 17px; }\n.tc-app .tc-earlier { display: flex; margin: 0 auto 16px; color: var(--tc-accent); }\n.tc-compose { flex: none; margin: 0 clamp(12px, 3vw, 33px) 16px; border: 1px solid var(--tc-line); border-radius: 12px; padding: 7px; position: relative; }\n.tc-compose:focus-within { border-color: var(--tc-accent); }\n.tc-compose textarea { resize: vertical; display: block; width: 100%; min-height: 50px; max-height: 170px; border: 0; padding: 6px; color: inherit; background: transparent; font: inherit; }\n.tc-compose textarea:focus-visible { outline: 0; }\n.tc-compose-foot, .tc-replying { display: flex; gap: 7px; align-items: center; }\n.tc-spacer { flex: 1; }\n.tc-tool-toggle, .tc-replying { font-size: 12px; color: var(--tc-muted); }\n.tc-tool-toggle { display: flex; gap: 4px; align-items: center; }\n.tc-replying { justify-content: space-between; padding: 0 6px; }\n.tc-replying span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.tc-app .tc-primary { color: var(--tc-accent-text); background: var(--tc-accent-soft); border-color: var(--tc-accent); font-weight: 650; }\n.tc-app .tc-send { width: 31px; height: 31px; }\n.tc-mentions { display: flex; flex-wrap: wrap; gap: 4px; margin: 3px 6px; }\n.tc-app .tc-mentions button { background: var(--tc-panel); color: var(--tc-accent); font-size: 12px; }\n.tc-config { max-width: 480px; width: 100%; padding: 18px 22px; overflow: auto; }\n.tc-config h2 { font-size: 17px; margin: 0 0 14px; }\n.tc-config > label { display: grid; gap: 4px; margin: 0 0 12px; color: var(--tc-muted); }\n.tc-config :is(input:not([type=checkbox]), select) { width: 100%; padding: 7px 8px; background: var(--tc-panel); border: 1px solid var(--tc-line); border-radius: 7px; color: var(--tc-text); font: inherit; }\n.tc-config fieldset { border: 1px solid var(--tc-line); border-radius: 8px; margin: 0 0 12px; padding: 7px 10px; }\n.tc-check { display: flex; align-items: flex-start; gap: 6px; padding: 4px 0; }\n.tc-check small { display: block; color: var(--tc-muted); }\n.tc-config .tc-actions { justify-content: flex-end; }\n.tc-app .tc-back { display: none; }\n@media (max-width: 760px) {\n  .tc-app { grid-template-columns: minmax(0, 1fr); }\n  .tc-app:not(.tc-show-list) .tc-rooms, .tc-app.tc-show-list .tc-room { display: none; }\n  .tc-app .tc-back { display: inline-flex; }\n  .tc-room-head { padding: 8px; gap: 6px; }\n  .tc-room-head .tc-actions { flex-shrink: 1; }\n}\n\n.tc-log-wrap { position: relative; display: flex; flex: 1; min-height: 0; }\n.tc-app .tc-jump { position: absolute; right: 22px; bottom: 12px; color: var(--tc-accent-text); background: var(--tc-accent-soft); border: 1px solid var(--tc-line); box-shadow: 0 2px 10px #0002; font-size: 12px; }\n.tc-activity { padding: 6px 18px; border-bottom: 1px solid var(--tc-line); background: var(--tc-panel); color: var(--tc-muted); font-size: 12px; }\n.tc-activity-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 25px; }\n.tc-activity-row span { overflow-wrap: anywhere; }\n.tc-activity-row strong { color: var(--tc-text); }\n.tc-activity-row.tc-attention strong { color: var(--tc-accent); }\n.tc-activity-row button { border-color: var(--tc-line); min-height: 23px; padding: 2px 7px; }\n.tc-queue summary { cursor: pointer; padding: 3px 0; }\n.tc-queue ol { margin: 2px 0 6px; padding-left: 22px; overflow-wrap: anywhere; }\n.tc-search { padding: 7px 18px; border-bottom: 1px solid var(--tc-line); }\n.tc-search input { display: block; width: min(100%, 360px); border: 1px solid var(--tc-line); border-radius: 7px; padding: 6px 9px; background: var(--tc-panel); color: var(--tc-text); font: inherit; }\n.tc-search-count { text-align: center; color: var(--tc-muted); margin: 0 0 11px; font-size: 12px; }\n.tc-app .tc-mentions button[aria-selected=true] { color: var(--tc-accent-text); background: var(--tc-accent-soft); border-color: var(--tc-accent); }\n@media (max-width: 760px) {\n  .tc-compose-foot { flex-wrap: wrap; }\n  .tc-activity, .tc-search { padding-inline: 9px; }\n}\n\n.tc-handoff-warnings { color: var(--tc-danger); font-size: 12px; margin: 6px 0 0; padding-inline-start: 18px; overflow-wrap: anywhere; }\n";

// src/workflow.css
var workflow_default = "\n.tc-app.tc-with-workflow {\n  position: relative;\n  grid-template-columns: clamp(152px, 17%, 218px) minmax(0, 1fr) clamp(325px, 35%, 460px);\n}\n.tc-wf-panel {\n  min-width: 0; min-height: 0; display: flex; flex-direction: column;\n  border-inline-start: 1px solid var(--tc-line); background: var(--tc-panel);\n}\n.tc-wf-panel-head { padding: 14px 16px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }\n.tc-wf-panel-head h2 { margin: 0; font-size: 18px; }\n.tc-wf-panel-head small, .tc-wf-muted { color: var(--tc-muted); }\n.tc-wf-tabs { display: flex; flex-wrap: wrap; gap: 5px; padding: 0 12px 10px; border-bottom: 1px solid var(--tc-line); }\n.tc-app .tc-wf-tabs button[aria-pressed=true], .tc-app .tc-wf-primary {\n  color: var(--tc-accent-text); background: var(--tc-accent-soft); border-color: var(--tc-line); font-weight: 650;\n}\n.tc-wf-panel-scroll { overflow-y: auto; min-height: 0; padding: 10px 13px 16px; overflow-wrap: anywhere; }\n.tc-wf-fieldset {\n  border: 1px solid var(--tc-line); border-radius: 10px; min-width: 0;\n  padding: 9px 10px; margin: 0 0 9px; background: var(--tc-surface);\n}\n.tc-wf-fieldset :is(legend, summary) { font-weight: 650; }\n.tc-wf-fieldset summary { cursor: pointer; }\n.tc-wf-fieldset :is(ul, ol) { margin: 6px 0; padding-inline-start: 20px; }\n.tc-wf-fieldset p, .tc-wf-notice p, .tc-wf-proposal p { margin: 3px 0; white-space: pre-wrap; }\n.tc-wf-panel label { display: grid; gap: 3px; font-size: 13px; margin: 4px 0 7px; }\n.tc-wf-panel label.tc-wf-check { display: flex; align-items: center; }\n.tc-wf-panel :is(input:not([type=checkbox]), select, textarea), .tc-wf-chat textarea {\n  background: var(--tc-surface); color: var(--tc-text); border: 1px solid var(--tc-line);\n  padding: 5px 7px; border-radius: 6px; min-width: 0; max-width: 100%; font: inherit;\n}\n.tc-wf-chat textarea { flex: 1; resize: vertical; }\n.tc-wf-panel label :is(input:not([type=checkbox]), select, textarea) { width: 100%; }\n.tc-wf-panel input[type=checkbox] { accent-color: var(--tc-accent); }\n.tc-wf-row { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }\n.tc-wf-row > span { min-width: 0; flex: 1; }\n.tc-wf-row > button { flex: 0 0 auto; }\n.tc-wf-view { align-items: center; grid-template-columns: max-content minmax(0, 1fr); }\n.tc-wf-edit-actions, .tc-wf-save { margin-bottom: 8px; }\n.tc-wf-graph { display: grid; gap: 6px; margin: 7px 0; }\n.tc-wf-lane { position: relative; display: grid; gap: 4px; padding: 2px 0 4px; }\n.tc-wf-lane-head { display: flex; justify-content: space-between; gap: 6px; color: var(--tc-muted); font-size: 12px; }\n.tc-wf-lane-head span { color: var(--tc-accent-text); }\n.tc-wf-lane-branches { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; }\n.tc-wf-node {\n  min-width: 0; display: grid; justify-items: start; gap: 3px; margin-bottom: 3px; padding: 6px 8px;\n  background: var(--tc-surface); border: 1px solid var(--tc-line); border-radius: 8px;\n}\n.tc-wf-node[data-selected=true] { border-color: var(--tc-accent); box-shadow: inset 2px 0 var(--tc-accent); }\n.tc-app .tc-wf-node-title { font-weight: 650; min-width: 0; padding: 1px 3px; text-align: start; overflow-wrap: anywhere; }\n.tc-wf-node select { width: 100%; }\n.tc-wf-edges { display: flex; flex-wrap: wrap; gap: 3px; }\n.tc-app .tc-wf-edges button { color: var(--tc-muted); background: var(--tc-panel); font-size: 11px; min-height: 21px; padding: 0 4px; }\n.tc-wf-status { border: 1px solid var(--tc-line); border-radius: 10px; font-size: 11px; padding: 0 6px; color: var(--tc-muted); }\n.tc-wf-status:is([data-state=complete], [data-state=running]) { color: var(--tc-accent-text); background: var(--tc-accent-soft); }\n.tc-wf-status:is([data-state=failed], [data-state=interrupted]), .tc-app .tc-wf-danger { color: var(--tc-danger); }\n.tc-wf-group > div { border-inline-start: 1px solid var(--tc-line); margin-inline-start: 7px; padding-inline-start: 8px; }\n.tc-wf-group-edit, .tc-wf-deps { border-top: 1px solid var(--tc-line); padding-top: 6px; margin-top: 6px; }\n.tc-wf-notice { padding: 7px 8px; background: var(--tc-accent-soft); border: 1px solid var(--tc-line); border-radius: 7px; margin: 6px 0; }\n.tc-wf-chat { flex: 0 0 auto; padding: 8px 12px; border-top: 1px solid var(--tc-line); min-width: 0; }\n.tc-wf-chat-head strong { flex: 1; }\n.tc-wf-chat-head small { color: var(--tc-muted); }\n.tc-wf-proposals { max-height: 30vh; overflow: auto; }\n.tc-wf-proposal { padding: 7px 9px; margin-bottom: 5px; border: 1px solid var(--tc-line); border-radius: 8px; }\n.tc-wf-proposal ul { margin: 4px 0; padding-inline-start: 20px; }\n.tc-wf-artifacts code { font-size: 12px; }\n@media (max-width: 970px) {\n  .tc-app.tc-with-workflow { grid-template-columns: clamp(142px, 20%, 190px) minmax(0, 1fr); }\n  .tc-wf-panel { position: absolute; z-index: 2; inset-block: 0; inset-inline-end: 0; width: min(430px, 100%); box-shadow: -8px 0 22px #0002; }\n  .tc-app.tc-workflow-compose .tc-wf-panel { display: none; }\n}\n@media (max-width: 760px) {\n  .tc-app.tc-with-workflow { grid-template-columns: minmax(0, 1fr); }\n}\n.tc-wf-preview { border-color: var(--tc-accent); }\n.tc-wf-node[data-changed=true] { border-color: var(--tc-accent); border-style: dashed; }\n\n.tc-allocation {\n  display: grid; gap: 7px; margin: 7px 0 3px; padding: 8px;\n  border: 1px solid var(--tc-line); border-radius: 9px; background: var(--tc-surface);\n}\n.tc-allocation header, .tc-allocation-task { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }\n.tc-allocation header { justify-content: space-between; }\n.tc-allocation-note, .tc-allocation p { margin: 2px 0; white-space: pre-wrap; }\n.tc-allocation-tasks { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; }\n.tc-allocation-tasks > li { border-top: 1px solid var(--tc-line); padding: 5px 0 3px; }\n.tc-allocation-tasks > li > small { display: block; color: var(--tc-muted); }\n.tc-allocation-task > strong { flex: 1; }\n.tc-allocation-task > small { color: var(--tc-muted); }\n.tc-allocation label, .tc-task-recover label { display: grid; gap: 2px; margin: 3px 0; font-size: 12px; }\n.tc-allocation select, .tc-allocation input, .tc-task-recover :is(input, textarea) {\n  min-width: 0; max-width: 100%; padding: 3px 5px; background: var(--tc-surface); color: var(--tc-text);\n  border: 1px solid var(--tc-line); border-radius: 5px; font: inherit;\n}\n.tc-task-recover { padding: 5px; margin-top: 3px; border: 1px solid var(--tc-line); border-radius: 6px; }\n.tc-app .tc-allocation-session { color: var(--tc-muted); font-size: 12px; }\n.tc-app .tc-compose button[aria-pressed=true] { background: var(--tc-accent-soft); color: var(--tc-accent-text); }\n.tc-wf-status:is([data-state=stopping],[data-state=suspended],[data-state=cancelled],[data-state=blocked]) { color: var(--tc-danger); }\n";

// src/workflow-ui.jsx
var import_react3 = __toESM(require("react"), 1);

// src/workflow-draft.js
var layoutLabels = { blank: "\uBE48 \uC6CC\uD06C\uD50C\uB85C\uC6B0", sequence: "\uC2DC\uD000\uC2A4", hierarchy: "\uACC4\uCE35", parallel: "\uBCD1\uB82C", mixed: "\uD63C\uD569" };
var edgeLabels = { success: "\uC131\uACF5 \uD6C4", failure: "\uC2E4\uD328 \uC2DC", settled: "\uC885\uB8CC \uD6C4" };
var fieldLabels = {
  title: "\uC774\uB984",
  layout: "\uBCF4\uAE30",
  agent: "\uB2F4\uB2F9 Agent",
  parent: "\uC0C1\uC704 \uADF8\uB8F9",
  group: "\uADF8\uB8F9",
  after: "\uC120\uD589 \uC791\uC5C5",
  outputs: "\uD544\uC218 \uACB0\uACFC \uD30C\uC77C",
  instruction: "\uC791\uC5C5 \uC9C0\uC2DC",
  completion: "\uC644\uB8CC \uC870\uAC74",
  needsDevice: "\uC7A5\uBE44 \uC810\uC720",
  tools: "DSH \uB3C4\uAD6C \uD544\uC694"
};
var newKey = (prefix) => prefix + "-" + crypto.randomUUID().slice(0, 12);
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function draftFromLayout(layout) {
  const draft = { ...initialDraft(), layout };
  if (layout === "blank") return draft;
  const prepare = initialNode(newKey("step"), "\uC900\uBE44");
  const work = initialNode(newKey("step"), "\uC2E4\uD589");
  const report = initialNode(newKey("step"), "\uBCF4\uACE0");
  if (layout === "hierarchy") {
    const top = { id: newKey("group"), title: "\uC900\uBE44\xB7\uC2E4\uD589", parent: null };
    const nested = { id: newKey("group"), title: "\uAC80\uC99D\xB7\uBCF4\uACE0", parent: top.id };
    draft.groups = [top, nested];
    prepare.group = work.group = top.id;
    report.group = nested.id;
  }
  if (layout !== "parallel") work.after = [{ from: prepare.id, when: "success" }];
  report.after = [{ from: work.id, when: "success" }];
  draft.nodes = [prepare, work, report];
  if (layout === "parallel") report.after.unshift({ from: prepare.id, when: "success" });
  if (layout === "mixed") {
    const verify = { ...initialNode(newKey("step"), "\uAC80\uC99D"), after: [{ from: prepare.id, when: "success" }] };
    draft.nodes.splice(2, 0, verify);
    report.after.push({ from: verify.id, when: "success" });
  }
  return draft;
}
function lanes(draft) {
  const depth = /* @__PURE__ */ new Map();
  const layers = [];
  for (const node of orderNodes(draft)) {
    const layer = Math.max(-1, ...node.after.map((edge2) => depth.get(edge2.from))) + 1;
    depth.set(node.id, layer);
    (layers[layer] ??= []).push(node);
  }
  return layers;
}
function mergeEdits(base, local, remote, choices = {}) {
  const conflicts = [];
  function field(key2, label, old, mine, latest) {
    if (same(mine, latest) || same(old, latest)) return mine;
    if (same(old, mine)) return latest;
    if (choices[key2]) return choices[key2] === "local" ? mine : latest;
    conflicts.push({ key: key2, label, local: mine, remote: latest });
    return latest;
  }
  function records(kind) {
    const indexed = [base, local, remote].map((draft2) => new Map(draft2[kind].map((item) => [item.id, item])));
    const identifiers = [.../* @__PURE__ */ new Set([...indexed[1].keys(), ...indexed[2].keys(), ...indexed[0].keys()])];
    const entries = /* @__PURE__ */ new Map();
    for (const id2 of identifiers) {
      const [old, mine, latest] = indexed.map((map) => map.get(id2));
      const title2 = mine?.title ?? latest?.title ?? old?.title;
      const entry = !old || !mine || !latest ? field(kind + "/" + id2, title2, old, mine, latest) : Object.fromEntries(Object.keys(mine).map((key2) => [key2, field(
        kind + "/" + id2 + "/" + key2,
        title2 + " \xB7 " + (fieldLabels[key2] ?? key2),
        old[key2],
        mine[key2],
        latest[key2]
      )]));
      if (entry) entries.set(id2, entry);
    }
    const common = identifiers.filter((id2) => indexed.every((map) => map.has(id2)) && entries.has(id2));
    const orders = indexed.map((map) => [...map.keys()].filter((id2) => common.includes(id2)));
    const order = field(kind + "/order", kind === "nodes" ? "\uC791\uC5C5 \uD45C\uC2DC \uC21C\uC11C" : "\uADF8\uB8F9 \uD45C\uC2DC \uC21C\uC11C", ...orders);
    let cursor = 0;
    const ids = identifiers.filter((id2) => entries.has(id2)).map((id2) => common.includes(id2) ? order[cursor++] : id2);
    return ids.map((id2) => entries.get(id2));
  }
  const draft = {
    title: field("title", "\uC6CC\uD06C\uD50C\uB85C\uC6B0 \uC774\uB984", base.title, local.title, remote.title),
    layout: field("layout", "\uBCF4\uAE30", base.layout, local.layout, remote.layout),
    groups: records("groups"),
    nodes: records("nodes")
  };
  return { draft, conflicts };
}

// src/workflow-ui.jsx
var states = { ...taskStates, created: "\uC0DD\uC131", ready: "\uC2E4\uD589 \uC900\uBE44", edited: "\uBCC0\uACBD \uC801\uC6A9" };
function useWorkflow(rpc, teamId, enabled, revision2) {
  const [server, setServer] = (0, import_react3.useState)(null);
  const [local, setLocal] = (0, import_react3.useState)(null);
  const [undo, setUndo] = (0, import_react3.useState)([]);
  const [error, setError] = (0, import_react3.useState)("");
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [designs, setDesigns] = (0, import_react3.useState)([]);
  const generation = (0, import_react3.useRef)(0);
  const current = server?.teamId === teamId ? server : null;
  const editing = local?.teamId === teamId ? local : null;
  const draft = editing?.draft ?? current?.draft ?? initialDraft();
  const call = (input) => rpc({ op: "workflow", teamId, input });
  async function refresh() {
    const id2 = ++generation.current;
    const value = await call({ action: "view" });
    if (id2 === generation.current) setServer({ ...value, teamId });
    return value;
  }
  (0, import_react3.useEffect)(() => {
    if (!enabled) return;
    void refresh().catch((cause) => setError(cause.message));
    return () => {
      generation.current++;
    };
  }, [enabled, teamId, revision2]);
  (0, import_react3.useEffect)(() => {
    setUndo([]);
    setDesigns([]);
    setError("");
    setLocal(null);
  }, [teamId]);
  const conflict = editing && current && editing.base !== current.revision;
  function edit(next, keepUndo = true) {
    if (!current) return;
    if (keepUndo) setUndo((values) => [...values.slice(-29), draft]);
    setLocal({ teamId, base: editing?.base ?? current.revision, original: editing?.original ?? current.draft, draft: next });
  }
  function revert() {
    if (!undo.length) return;
    edit(undo.at(-1), false);
    setUndo((values) => values.slice(0, -1));
  }
  function rebase(next) {
    setLocal({ teamId, base: current.revision, original: current.draft, draft: next });
    setUndo([]);
  }
  async function persist() {
    if (!current) throw new Error("\uC6CC\uD06C\uD50C\uB85C\uC6B0\uB97C \uBA3C\uC800 \uBD88\uB7EC\uC624\uC138\uC694.");
    if (!editing) return current.revision;
    const result = await call({ action: "draft", revision: editing.base, draft: editing.draft });
    setServer((previous) => previous?.teamId === teamId && previous.revision <= result.revision ? { ...previous, revision: result.revision, draft: editing.draft } : previous);
    setLocal((previous) => previous === editing ? null : previous);
    return result.revision;
  }
  async function perform(operation) {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      return await operation();
    } catch (cause) {
      setError(cause.message);
      return void 0;
    } finally {
      setBusy(false);
    }
  }
  function command(input) {
    return perform(async () => {
      const result = await call(input);
      await refresh();
      return result;
    });
  }
  function propose(text2, nodeId) {
    return perform(async () => {
      const expected = await persist();
      const context = designs.slice(-4).map((turn) => [turn.text, turn.result.question ?? turn.result.note ?? ""]);
      const request = context.length ? JSON.stringify({ previous: context, request: text2 }).slice(-6e3) : text2;
      const result = await call({ action: "suggest", revision: expected, text: request, ...nodeId ? { nodeId } : {} });
      setDesigns((list) => [...list.map((turn) => ({ ...turn, superseded: true })), { text: text2, result }]);
      return result;
    });
  }
  function apply2(turn) {
    return perform(async () => {
      if (editing || turn.result.revision !== current.revision) throw new Error("\uCD08\uC548\uC774 \uBC14\uB00C\uC5C8\uC2B5\uB2C8\uB2E4. \uC124\uACC4 \uC694\uCCAD\uC744 \uB2E4\uC2DC \uBCF4\uB0B4\uC138\uC694.");
      const result = await call({ action: "draft", revision: turn.result.revision, draft: turn.result.draft });
      setUndo((list) => [...list.slice(-29), draft]);
      setDesigns((list) => list.map((item) => item === turn ? { ...item, applied: true } : item));
      await refresh();
      return result;
    });
  }
  return {
    server: current,
    draft,
    local: editing,
    conflict,
    busy,
    error,
    designs,
    edit,
    revert,
    rebase,
    canUndo: !!undo.length,
    command,
    propose,
    apply: apply2,
    preview: designs.findLast((turn) => !turn.superseded && !turn.applied && turn.result.draft),
    dismiss: (turn) => setDesigns((list) => list.map((item) => item === turn ? { ...item, superseded: true } : item)),
    persist: () => perform(persist),
    publish: () => perform(async () => {
      const revision3 = await persist();
      const result = await call({ action: "publish", revision: revision3 });
      await refresh();
      return result;
    }),
    folder: (folder) => perform(async () => {
      const revision3 = await persist();
      const result = await call({ action: "folder", revision: revision3, folder });
      await refresh();
      return result;
    }),
    reviseRun: (run) => perform(async () => {
      const revision3 = await persist();
      const result = await call({ action: "apply", id: run.id, revision: revision3, runRevision: run.revision });
      await refresh();
      return result;
    })
  };
}
function WorkflowChat({ workflow, selected, answer, onClose, onAnswer }) {
  const [text2, setText] = (0, import_react3.useState)("");
  const [showTurns, setShowTurns] = (0, import_react3.useState)(true);
  const label = answer ? "\uC791\uC5C5 \uC9C8\uBB38\uC5D0 \uB2F5\uBCC0" : "\uCC44\uD305\uC73C\uB85C \uC6CC\uD06C\uD50C\uB85C\uC6B0 \uC124\uACC4";
  async function submit(event) {
    event.preventDefault();
    if (!text2.trim()) return;
    const result = answer ? await workflow.command({ action: "answer", id: answer.run.id, nodeId: answer.node.id, questionId: answer.question.id, text: text2 }) : await workflow.propose(text2, selected?.id);
    if (result) {
      setText("");
      if (answer) onAnswer();
    }
  }
  return /* @__PURE__ */ import_react3.default.createElement("section", { className: "tc-wf-chat", "aria-label": label }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-row tc-wf-chat-head" }, /* @__PURE__ */ import_react3.default.createElement("strong", null, label), selected && !answer && /* @__PURE__ */ import_react3.default.createElement("small", null, "\uC120\uD0DD \xB7 ", selected.title), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", onClick: onClose }, "\uC77C\uBC18 \uCC44\uD305")), answer ? /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-notice" }, /* @__PURE__ */ import_react3.default.createElement("strong", null, answer.node.title), /* @__PURE__ */ import_react3.default.createElement("p", null, answer.question.text)) : workflow.designs.length > 0 && /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-proposals" }, /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", "aria-expanded": showTurns, onClick: () => setShowTurns(!showTurns) }, "\uC124\uACC4 \uB300\uD654 ", workflow.designs.length, "\uAC74"), showTurns && workflow.designs.slice(-4).map((turn, index) => /* @__PURE__ */ import_react3.default.createElement("article", { className: "tc-wf-proposal", key: index }, /* @__PURE__ */ import_react3.default.createElement("p", null, /* @__PURE__ */ import_react3.default.createElement("strong", null, "\uB098"), " ", turn.text), turn.result.question ? /* @__PURE__ */ import_react3.default.createElement("p", null, /* @__PURE__ */ import_react3.default.createElement("strong", null, "\uC124\uACC4 \uC9C8\uBB38"), " ", turn.result.question) : /* @__PURE__ */ import_react3.default.createElement(import_react3.default.Fragment, null, /* @__PURE__ */ import_react3.default.createElement("strong", null, "\uCD08\uC548 \uBCC0\uACBD \uC81C\uC548"), turn.result.note && /* @__PURE__ */ import_react3.default.createElement("p", null, turn.result.note), turn.result.changes?.length > 0 && /* @__PURE__ */ import_react3.default.createElement("ul", null, turn.result.changes.map((change, i) => /* @__PURE__ */ import_react3.default.createElement("li", { key: i }, change))), !turn.superseded && !turn.applied && /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-row" }, /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", className: "tc-wf-primary", disabled: workflow.busy, onClick: () => workflow.apply(turn) }, "\uCD08\uC548\uC5D0 \uBC18\uC601"), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", onClick: () => setText("\uC774 \uC81C\uC548\uC5D0\uC11C ") }, "\uC81C\uC548 \uC218\uC815 \uC694\uCCAD"), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", onClick: () => workflow.dismiss(turn) }, "\uC81C\uC548 \uCDE8\uC18C")), turn.applied && /* @__PURE__ */ import_react3.default.createElement("small", null, "\uCD08\uC548\uC5D0 \uBC18\uC601\uB428"))))), /* @__PURE__ */ import_react3.default.createElement("form", { className: "tc-wf-row", onSubmit: submit }, /* @__PURE__ */ import_react3.default.createElement(
    "textarea",
    {
      autoFocus: true,
      "aria-label": label,
      placeholder: answer ? "\uC774 \uC791\uC5C5\uC758 \uC9C8\uBB38\uC5D0 \uB2F5\uD558\uC138\uC694" : "@watch\uAC00 \uD655\uC778\uD558\uBA74 @test\uC640 @report\uB97C \uB3D9\uC2DC\uC5D0 \uC2E4\uD589\uD574",
      value: text2,
      maxLength: 6e3,
      rows: 2,
      onChange: (event) => setText(event.target.value)
    }
  ), /* @__PURE__ */ import_react3.default.createElement("button", { className: "tc-wf-primary", type: "submit", disabled: workflow.busy || !text2.trim() }, workflow.busy ? "\uCC98\uB9AC \uC911" : answer ? "\uB2F5\uBCC0 \uBCF4\uB0B4\uAE30" : "\uC124\uACC4 \uC81C\uC548 \uBC1B\uAE30")), workflow.error && /* @__PURE__ */ import_react3.default.createElement("p", { className: "tc-error", role: "alert" }, workflow.error));
}
function AgentSelect({ node, members, onChange }) {
  return /* @__PURE__ */ import_react3.default.createElement("select", { "aria-label": node.title + " \uB2F4\uB2F9 Agent", value: node.agent ?? "", onChange: (event) => onChange(event.target.value || null) }, /* @__PURE__ */ import_react3.default.createElement("option", { value: "" }, "\uBBF8\uBC30\uC815"), node.agent && !members.some((member2) => member2.id === node.agent) && /* @__PURE__ */ import_react3.default.createElement("option", { value: node.agent }, "\uD300\uC5D0\uC11C \uC0AC\uB77C\uC9C4 Agent"), members.map((member2) => /* @__PURE__ */ import_react3.default.createElement("option", { value: member2.id, key: member2.id }, "@", member2.name)));
}
function Graph({ draft, members, layout, onChange, onSelect, selected, run, previous }) {
  const [folded, setFolded] = (0, import_react3.useState)([]);
  const nodeById = new Map(draft.nodes.map((node) => [node.id, node]));
  const agents = new Map(members.map((member2) => [member2.id, member2.name]));
  function card(node) {
    const step2 = run?.steps[node.id];
    const label = step2?.attention?.kind === "approval" ? "DSH \uC2B9\uC778 \uB300\uAE30" : step2?.attention?.kind === "question" ? "DSH \uC9C8\uBB38 \uB300\uAE30" : states[step2?.status];
    const changed = previous && JSON.stringify(previous.nodes.find((item) => item.id === node.id)) !== JSON.stringify(node);
    return /* @__PURE__ */ import_react3.default.createElement("article", { className: "tc-wf-node", "data-selected": selected === node.id, "data-changed": changed, key: node.id }, /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", "aria-pressed": selected === node.id, className: "tc-wf-node-title", onClick: () => onSelect(node.id) }, node.title), onChange ? /* @__PURE__ */ import_react3.default.createElement(AgentSelect, { node, members, onChange: (agent) => onChange(node.id, { agent }) }) : /* @__PURE__ */ import_react3.default.createElement("small", null, "@", agents.get(node.agent) ?? "\uBBF8\uBC30\uC815"), label && /* @__PURE__ */ import_react3.default.createElement("span", { className: "tc-wf-status", "data-state": step2.status }, label), step2?.waiting && /* @__PURE__ */ import_react3.default.createElement("small", { className: "tc-wf-muted" }, step2.waiting), node.after.length > 0 && /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-edges", "aria-label": "\uC120\uD589 \uC791\uC5C5" }, node.after.map((edge2) => /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", key: edge2.from, onClick: () => onSelect(edge2.from) }, "\u2196 ", nodeById.get(edge2.from)?.title ?? edge2.from, " \xB7 ", edgeLabels[edge2.when]))));
  }
  function group(parent) {
    return draft.groups.filter((item) => item.parent === parent).map((item) => /* @__PURE__ */ import_react3.default.createElement("section", { className: "tc-wf-group", key: item.id }, /* @__PURE__ */ import_react3.default.createElement("button", { "aria-expanded": !folded.includes(item.id), onClick: () => setFolded(folded.includes(item.id) ? folded.filter((id2) => id2 !== item.id) : [...folded, item.id]), type: "button" }, item.title), item.agent && /* @__PURE__ */ import_react3.default.createElement("small", null, " \xB7 @", agents.get(item.agent) ?? "\uBBF8\uBC30\uC815"), !folded.includes(item.id) && /* @__PURE__ */ import_react3.default.createElement("div", null, draft.nodes.filter((node) => node.group === item.id).map(card), group(item.id))));
  }
  if (layout === "hierarchy") return /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-graph" }, group(null), draft.nodes.filter((node) => !node.group).map(card));
  let graph;
  try {
    graph = layout === "parallel" || layout === "mixed" ? lanes(draft) : orderNodes(draft).map((node) => [node]);
  } catch {
    graph = draft.nodes.map((node) => [node]);
  }
  return /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-graph" }, graph.map((nodes, index) => /* @__PURE__ */ import_react3.default.createElement("section", { className: "tc-wf-lane", key: index }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-lane-head" }, "\uB2E8\uACC4 ", index + 1, nodes.length > 1 && /* @__PURE__ */ import_react3.default.createElement("span", null, "\uBCD1\uB82C ", nodes.length, "\uAC1C")), /* @__PURE__ */ import_react3.default.createElement("div", { className: nodes.length > 1 ? "tc-wf-lane-branches" : "" }, nodes.map(card)))));
}
function NodeEditor({ draft, node, patch, onRemove }) {
  const [dependency, setDependency] = (0, import_react3.useState)("");
  const options = draft.nodes.filter((item) => item.id !== node.id && !node.after.some((edge2) => edge2.from === item.id));
  return /* @__PURE__ */ import_react3.default.createElement("fieldset", { className: "tc-wf-fieldset" }, /* @__PURE__ */ import_react3.default.createElement("legend", null, "\uC791\uC5C5 \uC138\uBD80 \uC124\uC815"), /* @__PURE__ */ import_react3.default.createElement("label", null, "\uC791\uC5C5 \uC774\uB984", /* @__PURE__ */ import_react3.default.createElement("input", { value: node.title, maxLength: 100, onChange: (event) => patch({ title: event.target.value }) })), /* @__PURE__ */ import_react3.default.createElement("label", null, "\uC18C\uC18D \uADF8\uB8F9", /* @__PURE__ */ import_react3.default.createElement("select", { "aria-label": "\uC18C\uC18D \uADF8\uB8F9", value: node.group ?? "", onChange: (event) => patch({ group: event.target.value || null }) }, /* @__PURE__ */ import_react3.default.createElement("option", { value: "" }, "\uADF8\uB8F9 \uC5C6\uC74C"), draft.groups.map((item) => /* @__PURE__ */ import_react3.default.createElement("option", { key: item.id, value: item.id }, item.title)))), /* @__PURE__ */ import_react3.default.createElement("label", null, "\uC791\uC5C5 \uC9C0\uC2DC", /* @__PURE__ */ import_react3.default.createElement("textarea", { value: node.instruction, maxLength: 1200, onChange: (event) => patch({ instruction: event.target.value }) })), /* @__PURE__ */ import_react3.default.createElement("label", null, "\uC644\uB8CC \uC870\uAC74", /* @__PURE__ */ import_react3.default.createElement("input", { value: node.completion, maxLength: 1200, onChange: (event) => patch({ completion: event.target.value }) })), /* @__PURE__ */ import_react3.default.createElement("label", null, "\uD544\uC218 \uACB0\uACFC \uD30C\uC77C", /* @__PURE__ */ import_react3.default.createElement("input", { defaultValue: node.outputs.join(", "), placeholder: "\uACB0\uACFC \uD30C\uC77C \uC0C1\uB300 \uACBD\uB85C, \uC27C\uD45C\uB85C \uAD6C\uBD84", onBlur: (event) => patch({
    outputs: event.target.value.split(",").map((item) => item.trim()).filter(Boolean)
  }) })), /* @__PURE__ */ import_react3.default.createElement("label", { className: "tc-wf-check" }, /* @__PURE__ */ import_react3.default.createElement("input", { type: "checkbox", checked: node.needsDevice, onChange: (event) => patch({ needsDevice: event.target.checked }) }), " \uB300\uC0C1 \uC7A5\uBE44 \uC810\uC720"), /* @__PURE__ */ import_react3.default.createElement("label", { className: "tc-wf-check" }, /* @__PURE__ */ import_react3.default.createElement("input", { type: "checkbox", checked: node.tools, onChange: (event) => patch({ tools: event.target.checked }) }), " DSH \uB3C4\uAD6C \uD544\uC694"), /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-deps" }, /* @__PURE__ */ import_react3.default.createElement("strong", null, "\uC120\uD589 \uC791\uC5C5"), node.after.map((edge2) => /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-row", key: edge2.from }, /* @__PURE__ */ import_react3.default.createElement("span", null, draft.nodes.find((item) => item.id === edge2.from)?.title), /* @__PURE__ */ import_react3.default.createElement("select", { "aria-label": "\uC5F0\uACB0 \uC2E4\uD589 \uC870\uAC74", value: edge2.when, onChange: (event) => patch({ after: node.after.map((item) => item.from === edge2.from ? { ...item, when: event.target.value } : item) }) }, Object.entries(edgeLabels).map(([key2, label]) => /* @__PURE__ */ import_react3.default.createElement("option", { key: key2, value: key2 }, label))), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", onClick: () => patch({ after: node.after.filter((item) => item.from !== edge2.from) }) }, "\uC5F0\uACB0 \uC0AD\uC81C"))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-row" }, /* @__PURE__ */ import_react3.default.createElement("select", { "aria-label": "\uCD94\uAC00\uD560 \uC120\uD589 \uC791\uC5C5", value: dependency, onChange: (event) => setDependency(event.target.value) }, /* @__PURE__ */ import_react3.default.createElement("option", { value: "" }, "\uC120\uD589 \uC791\uC5C5 \uC120\uD0DD"), options.map((item) => /* @__PURE__ */ import_react3.default.createElement("option", { key: item.id, value: item.id }, item.title))), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", disabled: !options.some((item) => item.id === dependency), onClick: () => {
    patch({ after: [...node.after, { from: dependency, when: "success" }] });
    setDependency("");
  } }, "\uC5F0\uACB0 \uCD94\uAC00"))), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", className: "tc-wf-danger", onClick: onRemove }, "\uC791\uC5C5 \uC0AD\uC81C"));
}
function GroupEditor({ draft, edit, members }) {
  return /* @__PURE__ */ import_react3.default.createElement("details", { className: "tc-wf-fieldset" }, /* @__PURE__ */ import_react3.default.createElement("summary", null, "\uACC4\uCE35 \uADF8\uB8F9 \uD3B8\uC9D1"), draft.groups.map((group) => /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-group-edit", key: group.id }, /* @__PURE__ */ import_react3.default.createElement("label", null, "\uADF8\uB8F9 \uC774\uB984", /* @__PURE__ */ import_react3.default.createElement("input", { value: group.title, onChange: (event) => edit({ ...draft, groups: draft.groups.map((item) => item.id === group.id ? { ...item, title: event.target.value } : item) }) })), /* @__PURE__ */ import_react3.default.createElement("label", null, "\uADF8\uB8F9 \uB2F4\uB2F9 Agent", /* @__PURE__ */ import_react3.default.createElement("select", { "aria-label": "\uADF8\uB8F9 \uB2F4\uB2F9 Agent", value: group.agent ?? "", onChange: (event) => edit({ ...draft, groups: draft.groups.map((item) => item.id === group.id ? { ...item, agent: event.target.value || null } : item) }) }, /* @__PURE__ */ import_react3.default.createElement("option", { value: "" }, "\uBBF8\uBC30\uC815"), members.map((item) => /* @__PURE__ */ import_react3.default.createElement("option", { key: item.id, value: item.id }, "@", item.name)))), /* @__PURE__ */ import_react3.default.createElement("label", null, "\uC0C1\uC704 \uADF8\uB8F9", /* @__PURE__ */ import_react3.default.createElement("select", { "aria-label": "\uC0C1\uC704 \uADF8\uB8F9", value: group.parent ?? "", onChange: (event) => edit({ ...draft, groups: draft.groups.map((item) => item.id === group.id ? { ...item, parent: event.target.value || null } : item) }) }, /* @__PURE__ */ import_react3.default.createElement("option", { value: "" }, "\uCD5C\uC0C1\uC704"), draft.groups.filter((item) => item.id !== group.id).map((item) => /* @__PURE__ */ import_react3.default.createElement("option", { key: item.id, value: item.id }, item.title)))), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", onClick: () => edit({
    ...draft,
    groups: draft.groups.filter((item) => item.id !== group.id).map((item) => item.parent === group.id ? { ...item, parent: group.parent } : item),
    nodes: draft.nodes.map((node) => node.group === group.id ? { ...node, group: group.parent } : node)
  }) }, "\uADF8\uB8F9 \uC0AD\uC81C"))), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", disabled: draft.groups.length >= 12, onClick: () => edit({
    ...draft,
    groups: [...draft.groups, { id: newKey("group"), title: "\uC0C8 \uADF8\uB8F9", parent: null }]
  }) }, "\uADF8\uB8F9 \uCD94\uAC00"));
}
function Conflict({ workflow }) {
  const [choices, setChoices] = (0, import_react3.useState)({});
  const merge = mergeEdits(workflow.local.original, workflow.draft, workflow.server.draft, choices);
  const pending = mergeEdits(workflow.local.original, workflow.draft, workflow.server.draft).conflicts;
  return /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-notice" }, /* @__PURE__ */ import_react3.default.createElement("strong", null, "\uB2E4\uB978 \uCC3D\uC5D0\uC11C \uCD08\uC548\uC744 \uBCC0\uACBD\uD588\uC2B5\uB2C8\uB2E4"), pending.map((item) => /* @__PURE__ */ import_react3.default.createElement("label", { key: item.key }, item.label, /* @__PURE__ */ import_react3.default.createElement("select", { value: choices[item.key] ?? "", onChange: (event) => setChoices({ ...choices, [item.key]: event.target.value }) }, /* @__PURE__ */ import_react3.default.createElement("option", { value: "" }, "\uC720\uC9C0\uD560 \uAC12 \uC120\uD0DD"), /* @__PURE__ */ import_react3.default.createElement("option", { value: "local" }, "\uC774 \uCC3D \xB7 ", JSON.stringify(item.local)?.slice(0, 100) ?? "\uC0AD\uC81C"), /* @__PURE__ */ import_react3.default.createElement("option", { value: "remote" }, "\uCD5C\uC2E0 \xB7 ", JSON.stringify(item.remote)?.slice(0, 100) ?? "\uC0AD\uC81C")))), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", disabled: !!merge.conflicts.length, onClick: () => workflow.rebase(merge.draft) }, "\uBCC0\uACBD \uD569\uCE58\uAE30"), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", onClick: () => workflow.rebase(workflow.server.draft) }, "\uCD5C\uC2E0 \uCD08\uC548 \uBD88\uB7EC\uC624\uAE30"));
}
function FolderForm({ folder, versions, save }) {
  const [value, setValue] = (0, import_react3.useState)(folder ?? { directory: ".", suffix: ".bin", device: "", enabled: false });
  const patch = (fields) => setValue((previous) => ({ ...previous, ...fields }));
  return /* @__PURE__ */ import_react3.default.createElement("details", { className: "tc-wf-fieldset" }, /* @__PURE__ */ import_react3.default.createElement("summary", null, "\uD3F4\uB354 \uD2B8\uB9AC\uAC70", folder?.enabled ? " \xB7 \uC0AC\uC6A9 \uC911" : ""), folder?.version && /* @__PURE__ */ import_react3.default.createElement("small", null, "\uC9C0\uC815 \uBC84\uC804 v", folder.version), /* @__PURE__ */ import_react3.default.createElement("label", null, "\uAC10\uC2DC \uD3F4\uB354", /* @__PURE__ */ import_react3.default.createElement("input", { value: value.directory, onChange: (event) => patch({ directory: event.target.value }) })), /* @__PURE__ */ import_react3.default.createElement("label", null, "\uD30C\uC77C \uD655\uC7A5\uC790", /* @__PURE__ */ import_react3.default.createElement("input", { value: value.suffix, onChange: (event) => patch({ suffix: event.target.value }) })), /* @__PURE__ */ import_react3.default.createElement("label", null, "\uD2B8\uB9AC\uAC70 \uB300\uC0C1 \uC7A5\uBE44", /* @__PURE__ */ import_react3.default.createElement("input", { value: value.device, onChange: (event) => patch({ device: event.target.value }) })), /* @__PURE__ */ import_react3.default.createElement("label", { className: "tc-wf-check" }, /* @__PURE__ */ import_react3.default.createElement("input", { type: "checkbox", checked: value.enabled, onChange: (event) => patch({ enabled: event.target.checked }) }), " \uD3F4\uB354 \uAC10\uC2DC \uCF1C\uAE30"), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", disabled: !versions.length, onClick: () => save({
    directory: value.directory,
    suffix: value.suffix,
    device: value.device,
    enabled: value.enabled
  }) }, "\uCD5C\uC2E0 \uC800\uC7A5 \uBC84\uC804\uC73C\uB85C \uC801\uC6A9"));
}
function RunDetails({ run, node, workflow, openAgent, openMessage, ask }) {
  const step2 = node && run.steps[node.id];
  if (!step2) return null;
  return /* @__PURE__ */ import_react3.default.createElement("section", { className: "tc-wf-fieldset" }, /* @__PURE__ */ import_react3.default.createElement("strong", null, node.title, " \xB7 ", states[step2.status]), step2.detail && /* @__PURE__ */ import_react3.default.createElement("p", null, step2.detail), step2.native && /* @__PURE__ */ import_react3.default.createElement("p", null, /* @__PURE__ */ import_react3.default.createElement("small", null, "DSH ", step2.native, " \xB7 \uC2DC\uB3C4 ", step2.attempt, "\uD68C")), step2.summary && /* @__PURE__ */ import_react3.default.createElement("p", null, step2.summary), step2.artifacts?.length > 0 && /* @__PURE__ */ import_react3.default.createElement("ul", { className: "tc-wf-artifacts" }, step2.artifacts.map((item) => /* @__PURE__ */ import_react3.default.createElement("li", { key: item.path }, /* @__PURE__ */ import_react3.default.createElement("code", null, item.path), " ", /* @__PURE__ */ import_react3.default.createElement("small", { title: item.sha256 }, item.bytes, " B \xB7 SHA-256 ", item.sha256.slice(0, 10), "\u2026")))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-row" }, step2.messageId && /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", onClick: () => openMessage(step2.messageId) }, "\uCC44\uD305 \uAE30\uB85D \uBCF4\uAE30"), node.agent && /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", onClick: () => openAgent(node.agent) }, "DSH \uC6D0\uBCF8 \uC138\uC158")), step2.question && step2.status === "question" && /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-notice" }, /* @__PURE__ */ import_react3.default.createElement("p", null, step2.question.text), /* @__PURE__ */ import_react3.default.createElement("button", { className: "tc-wf-primary", type: "button", onClick: () => ask({ run, node, question: step2.question }) }, "\uCC44\uD305\uC5D0\uC11C \uB2F5\uBCC0")), /* @__PURE__ */ import_react3.default.createElement(TaskControls, { key: step2.token ?? 0, run, node, step: step2, command: workflow.command }));
}
function WorkflowPanel({ workflow, selected, onSelect, runId, onRun, tab, setTab, onDesign, ask, onClose, openAgent, openMessage }) {
  const [view, setView] = (0, import_react3.useState)("");
  const [version, setVersion] = (0, import_react3.useState)("");
  const [input, setInput] = (0, import_react3.useState)("");
  const [device, setDevice] = (0, import_react3.useState)("");
  const [tools, setTools] = (0, import_react3.useState)(false);
  const [applying, setApplying] = (0, import_react3.useState)(false);
  const [publishNote, setPublishNote] = (0, import_react3.useState)("");
  const { server, draft, edit } = workflow;
  const members = server?.members ?? [];
  const run = server?.runs.find((item) => item.id === runId) ?? server?.runs[0];
  const graph = tab === "run" && run ? run.draft : draft;
  const node = graph.nodes.find((node2) => node2.id === selected);
  let validation;
  try {
    checkDraft(draft, members);
  } catch (cause) {
    validation = cause.message;
  }
  const patch = (id2, fields) => edit({ ...draft, nodes: draft.nodes.map((item) => item.id === id2 ? { ...item, ...fields } : item) });
  const move = (offset) => {
    const index = draft.nodes.findIndex((item) => item.id === selected);
    const destination = index + offset;
    if (destination < 0 || destination >= draft.nodes.length) return;
    const nodes = [...draft.nodes];
    nodes.splice(destination, 0, ...nodes.splice(index, 1));
    edit({ ...draft, nodes });
  };
  return /* @__PURE__ */ import_react3.default.createElement("aside", { className: "tc-wf-panel", "aria-label": "\uC6CC\uD06C\uD50C\uB85C\uC6B0 \uD328\uB110" }, /* @__PURE__ */ import_react3.default.createElement("header", { className: "tc-wf-panel-head" }, /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("h2", null, "\uC6CC\uD06C\uD50C\uB85C\uC6B0"), /* @__PURE__ */ import_react3.default.createElement("small", null, server?.versions.at(-1) ? "\uC800\uC7A5 v" + server.versions.at(-1).version : "\uC800\uC7A5\uB41C \uBC84\uC804 \uC5C6\uC74C")), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", onClick: onClose, "aria-label": "\uC6CC\uD06C\uD50C\uB85C\uC6B0 \uB2EB\uAE30" }, "\uB2EB\uAE30")), /* @__PURE__ */ import_react3.default.createElement("nav", { className: "tc-wf-tabs", "aria-label": "\uC6CC\uD06C\uD50C\uB85C\uC6B0 \uBA54\uB274" }, /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", "aria-pressed": tab === "edit", onClick: () => setTab("edit") }, "\uD3B8\uC9D1"), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", "aria-pressed": tab === "run", onClick: () => setTab("run") }, "\uC2E4\uD589 \uC0C1\uD0DC"), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", onClick: onDesign }, "\uCC44\uD305\uC73C\uB85C \uC124\uACC4")), /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-panel-scroll" }, workflow.error && /* @__PURE__ */ import_react3.default.createElement("p", { className: "tc-error", role: "alert" }, workflow.error), !server ? /* @__PURE__ */ import_react3.default.createElement("p", null, "\uC6CC\uD06C\uD50C\uB85C\uC6B0 \uBD88\uB7EC\uC624\uB294 \uC911") : /* @__PURE__ */ import_react3.default.createElement(import_react3.default.Fragment, null, server.unavailable && /* @__PURE__ */ import_react3.default.createElement("p", { className: "tc-error" }, server.unavailable), tab === "edit" ? /* @__PURE__ */ import_react3.default.createElement(import_react3.default.Fragment, null, workflow.preview && /* @__PURE__ */ import_react3.default.createElement("details", { className: "tc-wf-fieldset tc-wf-preview", open: true }, /* @__PURE__ */ import_react3.default.createElement("summary", null, "\uC81C\uC548 \uADF8\uB798\uD504 \uBBF8\uB9AC \uBCF4\uAE30"), /* @__PURE__ */ import_react3.default.createElement(
    Graph,
    {
      draft: workflow.preview.result.draft,
      members,
      layout: workflow.preview.result.draft.layout,
      selected,
      onSelect,
      previous: draft
    }
  )), /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-fieldset" }, /* @__PURE__ */ import_react3.default.createElement("label", null, "\uC6CC\uD06C\uD50C\uB85C\uC6B0 \uC774\uB984", /* @__PURE__ */ import_react3.default.createElement("input", { value: draft.title, maxLength: 100, onChange: (event) => edit({ ...draft, title: event.target.value }) })), /* @__PURE__ */ import_react3.default.createElement("label", null, draft.nodes.length ? "\uCD08\uC548\uC758 \uAE30\uBCF8 \uBCF4\uAE30" : "\uC2DC\uC791 \uD615\uD0DC", /* @__PURE__ */ import_react3.default.createElement("select", { "aria-label": draft.nodes.length ? "\uCD08\uC548\uC758 \uAE30\uBCF8 \uBCF4\uAE30" : "\uC2DC\uC791 \uD615\uD0DC", value: draft.layout, onChange: (event) => {
    const layout = event.target.value;
    edit(draft.nodes.length ? { ...draft, layout } : { ...draftFromLayout(layout), title: draft.title });
    setView("");
  } }, Object.entries(layoutLabels).map(([key2, label]) => /* @__PURE__ */ import_react3.default.createElement("option", { key: key2, value: key2 }, label))))), /* @__PURE__ */ import_react3.default.createElement(GroupEditor, { draft, edit, members }), /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-row tc-wf-edit-actions" }, /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", disabled: draft.nodes.length >= 16, onClick: () => {
    const node2 = initialNode(newKey("step"));
    edit({ ...draft, nodes: [...draft.nodes, node2] });
    onSelect(node2.id);
  } }, "\uC791\uC5C5 \uCD94\uAC00"), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", disabled: !workflow.canUndo, onClick: workflow.revert }, "\uB418\uB3CC\uB9AC\uAE30"))) : /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-fieldset" }, /* @__PURE__ */ import_react3.default.createElement("form", { onSubmit: async (event) => {
    event.preventDefault();
    const chosen = Number(version || server.versions.at(-1)?.version);
    const result = await workflow.command({ action: "start", version: chosen, id: crypto.randomUUID(), input, device, tools });
    if (result) {
      onRun(result.id);
      onSelect("");
    }
  } }, /* @__PURE__ */ import_react3.default.createElement("label", null, "\uC2E4\uD589\uD560 \uBC84\uC804", /* @__PURE__ */ import_react3.default.createElement("select", { "aria-label": "\uC2E4\uD589\uD560 \uBC84\uC804", value: version || server.versions.at(-1)?.version || "", onChange: (event) => setVersion(event.target.value) }, /* @__PURE__ */ import_react3.default.createElement("option", { value: "", disabled: true }, "\uBC84\uC804 \uC120\uD0DD"), server.versions.map((item) => /* @__PURE__ */ import_react3.default.createElement("option", { key: item.version, value: item.version }, "v", item.version, " \xB7 ", item.title)))), /* @__PURE__ */ import_react3.default.createElement("label", null, "\uC785\uB825 \uD30C\uC77C", /* @__PURE__ */ import_react3.default.createElement("input", { value: input, onChange: (event) => setInput(event.target.value), placeholder: "\uC791\uC5C5 \uACF5\uAC04 \uC0C1\uB300 \uACBD\uB85C" })), /* @__PURE__ */ import_react3.default.createElement("label", null, "\uB300\uC0C1 \uC7A5\uBE44 ID", /* @__PURE__ */ import_react3.default.createElement("input", { value: device, onChange: (event) => setDevice(event.target.value) })), /* @__PURE__ */ import_react3.default.createElement("label", { className: "tc-wf-check" }, /* @__PURE__ */ import_react3.default.createElement("input", { type: "checkbox", checked: tools, onChange: (event) => setTools(event.target.checked) }), " \uC774 \uC2E4\uD589\uC758 DSH \uB3C4\uAD6C \uD5C8\uC6A9"), /* @__PURE__ */ import_react3.default.createElement("button", { type: "submit", className: "tc-wf-primary", disabled: !server.versions.length || workflow.busy }, "\uC6CC\uD06C\uD50C\uB85C\uC6B0 \uC2E4\uD589")), run && /* @__PURE__ */ import_react3.default.createElement("label", null, "\uC2E4\uD589 \uC774\uB825", /* @__PURE__ */ import_react3.default.createElement("select", { "aria-label": "\uC2E4\uD589 \uC774\uB825", value: run.id, onChange: (event) => {
    onRun(event.target.value);
    onSelect("");
  } }, server.runs.map((item) => /* @__PURE__ */ import_react3.default.createElement("option", { key: item.id, value: item.id }, item.draft.title, " \xB7 ", states[item.status], " \xB7 ", new Date(item.created).toLocaleTimeString())))), run?.setupError && /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("p", { className: "tc-error" }, run.setupError), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", disabled: workflow.busy, onClick: () => workflow.command({
    action: "repair",
    id: run.id,
    runRevision: run.revision
  }) }, "DSH \uC791\uC5C5 \uBCF4\uB4DC \uB2E4\uC2DC \uC5F0\uACB0"))), /* @__PURE__ */ import_react3.default.createElement("label", { className: "tc-wf-view" }, "\uAD00\uACC4 \uBCF4\uAE30", /* @__PURE__ */ import_react3.default.createElement("select", { "aria-label": "\uAD00\uACC4 \uBCF4\uAE30", value: view || graph.layout, onChange: (event) => setView(event.target.value) }, Object.entries(layoutLabels).filter(([key2]) => key2 !== "blank" || graph.layout === "blank").map(([key2, label]) => /* @__PURE__ */ import_react3.default.createElement("option", { key: key2, value: key2 }, label)))), /* @__PURE__ */ import_react3.default.createElement(
    Graph,
    {
      draft: graph,
      members,
      layout: view || graph.layout,
      selected,
      onSelect,
      onChange: tab === "edit" ? patch : null,
      run: tab === "run" ? run : null
    }
  ), tab === "edit" ? /* @__PURE__ */ import_react3.default.createElement(import_react3.default.Fragment, null, node && /* @__PURE__ */ import_react3.default.createElement(import_react3.default.Fragment, null, /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-row" }, /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", onClick: () => move(-1) }, "\uD45C\uC2DC \uC21C\uC11C \uC704\uB85C"), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", onClick: () => move(1) }, "\uD45C\uC2DC \uC21C\uC11C \uC544\uB798\uB85C"), /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", onClick: onDesign }, "\uC774 \uC791\uC5C5\uC744 \uCC44\uD305\uC73C\uB85C \uD3B8\uC9D1")), /* @__PURE__ */ import_react3.default.createElement(NodeEditor, { key: node.id, draft, node, patch: (fields) => patch(node.id, fields), onRemove: () => {
    edit({ ...draft, nodes: draft.nodes.filter((item) => item.id !== node.id).map((item) => ({
      ...item,
      after: item.after.filter((edge2) => edge2.from !== node.id)
    })) });
    onSelect("");
  } })), validation && /* @__PURE__ */ import_react3.default.createElement("p", { className: "tc-error" }, validation), workflow.conflict && /* @__PURE__ */ import_react3.default.createElement(Conflict, { key: server.revision, workflow }), /* @__PURE__ */ import_react3.default.createElement("div", { className: "tc-wf-row tc-wf-save" }, /* @__PURE__ */ import_react3.default.createElement(
    "button",
    {
      type: "button",
      disabled: !!validation || workflow.busy || !workflow.local || workflow.conflict,
      onClick: workflow.persist
    },
    "\uCD08\uC548 \uC800\uC7A5"
  ), /* @__PURE__ */ import_react3.default.createElement(
    "button",
    {
      type: "button",
      className: "tc-wf-primary",
      disabled: !!validation || workflow.busy || workflow.conflict || !draft.nodes.length,
      onClick: async () => {
        const result = await workflow.publish();
        if (result) setPublishNote("v" + result.version + " \uC800\uC7A5\uB428");
      }
    },
    "\uBC84\uC804 \uC800\uC7A5"
  ), publishNote && /* @__PURE__ */ import_react3.default.createElement("small", { role: "status" }, publishNote)), /* @__PURE__ */ import_react3.default.createElement(FolderForm, { key: server.folder?.since ?? "new", folder: server.folder, versions: server.versions, save: workflow.folder }), /* @__PURE__ */ import_react3.default.createElement("details", { className: "tc-wf-fieldset" }, /* @__PURE__ */ import_react3.default.createElement("summary", null, "DSH \uC6D0\uBCF8 \uC791\uC5C5 ", server.native.length, "\uAC74"), /* @__PURE__ */ import_react3.default.createElement("ul", null, server.native.map((item) => /* @__PURE__ */ import_react3.default.createElement("li", { key: item.id }, item.subject, " \xB7 ", item.id, " \xB7 ", item.ownerName ?? "\uBBF8\uBC30\uC815", " \xB7 ", item.status))))) : run && /* @__PURE__ */ import_react3.default.createElement(import_react3.default.Fragment, null, /* @__PURE__ */ import_react3.default.createElement(RunDetails, { key: run.id + "/" + (node?.id ?? ""), run, node, workflow, openAgent, openMessage, ask }), /* @__PURE__ */ import_react3.default.createElement("details", { className: "tc-wf-fieldset" }, /* @__PURE__ */ import_react3.default.createElement("summary", null, "\uC2E4\uD589 \uD0C0\uC784\uB77C\uC778 ", run.events.length, "\uAC74"), /* @__PURE__ */ import_react3.default.createElement("ol", null, run.events.map((event) => /* @__PURE__ */ import_react3.default.createElement("li", { key: event.seq }, new Date(event.time).toLocaleTimeString(), " \xB7 ", run.draft.nodes.find((node2) => node2.id === event.nodeId)?.title ?? run.draft.title, " \xB7 ", states[event.status] ?? event.status, event.detail ? " \xB7 " + event.detail : "")))), run.status !== "complete" && run.status !== "failed" && /* @__PURE__ */ import_react3.default.createElement("section", { className: "tc-wf-fieldset" }, /* @__PURE__ */ import_react3.default.createElement("button", { type: "button", onClick: () => setApplying(!applying) }, "\uD604\uC7AC \uC2E4\uD589\uC5D0 \uCD08\uC548 \uBCC0\uACBD \uBBF8\uB9AC \uBCF4\uAE30"), applying && /* @__PURE__ */ import_react3.default.createElement(import_react3.default.Fragment, null, /* @__PURE__ */ import_react3.default.createElement("ul", null, changedDraft(run.draft, draft, members).map((item, index) => /* @__PURE__ */ import_react3.default.createElement("li", { key: index }, item))), /* @__PURE__ */ import_react3.default.createElement(
    "button",
    {
      type: "button",
      disabled: workflow.busy || !!validation || !changedDraft(run.draft, draft, members).length,
      onClick: async () => {
        if (await workflow.reviseRun(run)) setApplying(false);
      }
    },
    "\uBBF8\uC2E4\uD589 \uC791\uC5C5\uC5D0 \uC801\uC6A9"
  )))))));
}

// src/client.jsx
var PANEL = "team-chat";
var empty = { teams: [], rooms: [], available: true };
var clock = new Intl.DateTimeFormat(void 0, { hour: "2-digit", minute: "2-digit" });
var handoffWarning = {
  unknown: "\uBC29\uC5D0 \uC5C6\uB294 \uD300\uC6D0",
  self: "\uC790\uAE30 \uC790\uC2E0\uC5D0\uAC8C \uC778\uACC4",
  broadcast: "\uD300\uC6D0 \uC778\uACC4\uC5D0\uB294 \uAC1C\uBCC4 \uBA58\uC158 \uD544\uC694",
  "round-limit": "\uC124\uC815\uB41C \uB77C\uC6B4\uB4DC \uD55C\uB3C4 \uB3C4\uB2EC",
  budget: "\uC694\uCCAD\uB2F9 \uBC1C\uC5B8 \uD55C\uB3C4 \uB3C4\uB2EC"
};
var inject = ["remote", "slots", "layout", "uiWorkspace"];
function Icon({ kind = "chat", size = 19 }) {
  const paths = {
    chat: "M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 2v-5a7.5 7.5 0 0 1 6.5-12h2a7.5 7.5 0 0 1 7.5 7.5Z M8 11h8 M8 14h5",
    send: "M5 12h14m-6-6 6 6-6 6",
    plus: "M12 5v14M5 12h14",
    stop: "M7 7h10v10H7z",
    open: "M13 5h6v6m0-6-9 9m7-1v6H5V7h6"
  };
  return /* @__PURE__ */ import_react4.default.createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.7",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true"
    },
    /* @__PURE__ */ import_react4.default.createElement("path", { d: paths[kind] })
  );
}
function avatarStyle(message, members) {
  const colors = ["mint", "blue", "rose", "amber", "lilac", "stone"];
  return message.kind === "user" ? "human" : colors[Math.max(0, members.findIndex((item) => item.id === message.memberId))];
}
function mergeMessages(older, newer) {
  const byPosition = new Map(older.map((message) => [message.position, message]));
  for (const message of newer) byPosition.set(message.position, message);
  return [...byPosition.values()].sort((left, right) => left.position - right.position);
}
function reconcileSnapshot(previous, snapshot) {
  if (previous?.teamId !== snapshot.teamId) return snapshot;
  const start = snapshot.messages[0]?.position;
  const first = previous.messages[0]?.position;
  const last = previous.messages.at(-1)?.position;
  if (start === void 0 || first === void 0 || start < first || start > last + 1) return snapshot;
  return { ...snapshot, messages: mergeMessages(previous.messages, snapshot.messages), earlier: previous.earlier };
}
function RoomSettings({ source, current, onSubmit, onCancel }) {
  const [title2, setTitle] = (0, import_react4.useState)(current?.title ?? source.title);
  const [members, setMembers] = (0, import_react4.useState)(current?.members.map((item) => item.id) ?? source.members.slice(0, 6).map((item) => item.id));
  const [rounds, setRounds] = (0, import_react4.useState)(current?.rounds ?? 3);
  const [busy, setBusy] = (0, import_react4.useState)(false);
  const [error, setError] = (0, import_react4.useState)("");
  const chosen = members.filter((id2) => source.members.some((item) => item.id === id2));
  return /* @__PURE__ */ import_react4.default.createElement("form", { className: "tc-config", onSubmit: async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit({ op: "save", teamId: source.teamId, title: title2, members: chosen, rounds });
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  } }, /* @__PURE__ */ import_react4.default.createElement("h2", null, current ? "\uB300\uD654\uBC29 \uC124\uC815" : "\uD300 \uB300\uD654\uBC29 \uB9CC\uB4E4\uAE30"), /* @__PURE__ */ import_react4.default.createElement("label", null, "\uBC29 \uC774\uB984", /* @__PURE__ */ import_react4.default.createElement("input", { value: title2, maxLength: 100, required: true, onChange: (event) => setTitle(event.target.value) })), /* @__PURE__ */ import_react4.default.createElement("fieldset", null, /* @__PURE__ */ import_react4.default.createElement("legend", null, "\uD300\uC6D0 \xB7 ", chosen.length, "/6"), source.members.map((item) => /* @__PURE__ */ import_react4.default.createElement("label", { className: "tc-check", key: item.id }, /* @__PURE__ */ import_react4.default.createElement(
    "input",
    {
      type: "checkbox",
      checked: chosen.includes(item.id),
      disabled: !chosen.includes(item.id) && chosen.length >= 6,
      onChange: (event) => setMembers(event.target.checked ? [...chosen, item.id] : chosen.filter((id2) => id2 !== item.id))
    }
  ), /* @__PURE__ */ import_react4.default.createElement("span", null, /* @__PURE__ */ import_react4.default.createElement("strong", null, "@", item.name), item.description && /* @__PURE__ */ import_react4.default.createElement("small", null, item.description))))), /* @__PURE__ */ import_react4.default.createElement("label", null, "\uCD5C\uB300 \uBC1C\uC5B8 \uB77C\uC6B4\uB4DC", /* @__PURE__ */ import_react4.default.createElement("select", { value: rounds, onChange: (event) => setRounds(Number(event.target.value)) }, /* @__PURE__ */ import_react4.default.createElement("option", { value: "1" }, "1 \xB7 \uC9C1\uC811 \uBD80\uB978 \uD300\uC6D0\uB9CC"), /* @__PURE__ */ import_react4.default.createElement("option", { value: "2" }, "2"), /* @__PURE__ */ import_react4.default.createElement("option", { value: "3" }, "3"))), error && /* @__PURE__ */ import_react4.default.createElement("p", { role: "alert", className: "tc-error" }, error), /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-actions" }, /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", onClick: onCancel }, "\uCDE8\uC18C"), /* @__PURE__ */ import_react4.default.createElement("button", { className: "tc-primary", disabled: busy || chosen.length < 2 || !title2.trim() }, busy ? "\uC800\uC7A5 \uC911" : "\uC800\uC7A5")));
}
function Composer({ room, draftStore, reply, onClearReply, onSend, onStop }) {
  const teamId = room.teamId;
  const [draft, setDraft] = (0, import_react4.useState)(() => draftStore.get(teamId)?.text ?? "");
  const [tools, setTools] = (0, import_react4.useState)(false);
  const [busy, setBusy] = (0, import_react4.useState)(false);
  const [mentionMode, setMentionMode] = (0, import_react4.useState)("");
  const [planMode, setPlanMode] = (0, import_react4.useState)(Boolean(draftStore.get(teamId)?.allocation));
  const [caret, setCaret] = (0, import_react4.useState)(draft.length);
  const [selected, setSelected] = (0, import_react4.useState)(0);
  const [error, setError] = (0, import_react4.useState)("");
  const sending = (0, import_react4.useRef)(false);
  const field = (0, import_react4.useRef)(null);
  const listId = "tc-mentions-" + import_react4.default.useId();
  (0, import_react4.useEffect)(() => {
    if (reply) field.current?.focus();
  }, [reply]);
  const range = mentionAt(draft, caret);
  const candidates = ["all", ...room.members.map((item) => item.name)].filter((name) => mentionMode === "menu" || name.toLowerCase().startsWith(range?.query ?? ""));
  const listOpen = Boolean((mentionMode === "menu" || mentionMode === "typed" && range) && candidates.length);
  const chosen = Math.min(selected, candidates.length - 1);
  const allocation = !reply && (planMode || requestsAllocation(draft));
  let toolError = "";
  if (tools && !allocation && draft.trim()) {
    try {
      routeUser(draft, room.members, reply?.memberId, true);
    } catch (cause) {
      toolError = cause.message;
    }
  }
  function edit(text2, position) {
    setDraft(text2);
    setCaret(position);
    if (draftStore.get(teamId)?.text !== text2) draftStore.set(teamId, { text: text2, allocation: planMode });
  }
  async function send(event) {
    event?.preventDefault();
    if (!draft.trim() || sending.current || toolError) return;
    sending.current = true;
    setBusy(true);
    setError("");
    const body = {
      text: draft,
      tools: tools && !allocation,
      ...reply ? { replyTo: reply.id } : {},
      ...allocation ? { allocation: true } : {}
    };
    const identity = requestIdentity(draftStore.get(teamId), body, () => crypto.randomUUID());
    draftStore.set(teamId, { ...identity, allocation: planMode });
    try {
      await onSend({ op: "send", teamId, id: identity.id, ...body });
      if (draftStore.get(teamId)?.id === identity.id) draftStore.delete(teamId);
      setDraft("");
      setTools(false);
      setPlanMode(false);
      setMentionMode("");
      onClearReply();
      requestAnimationFrame(() => field.current?.focus());
    } catch (cause) {
      setError(cause.message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function mention(name) {
    const at = field.current?.selectionStart ?? caret;
    const match = mentionAt(draft, at) ?? { start: at, end: field.current?.selectionEnd ?? at };
    const result = insertMention(draft, name, match);
    edit(result.text, result.caret);
    setMentionMode("");
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(result.caret, result.caret);
    });
  }
  return /* @__PURE__ */ import_react4.default.createElement("form", { className: "tc-compose", onSubmit: send }, reply && /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-replying" }, /* @__PURE__ */ import_react4.default.createElement("span", null, "@", reply.author, "\uC5D0\uAC8C \uB2F5\uC7A5 \xB7 ", reply.text.slice(0, 80)), /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", onClick: onClearReply, "aria-label": "\uB2F5\uC7A5 \uCDE8\uC18C" }, "\xD7")), (error || toolError) && /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-error", role: "alert" }, error || toolError), /* @__PURE__ */ import_react4.default.createElement(
    "textarea",
    {
      ref: field,
      "aria-label": "\uBA54\uC2DC\uC9C0",
      rows: 3,
      maxLength: 12e3,
      disabled: busy,
      value: draft,
      "aria-autocomplete": "list",
      "aria-controls": listOpen ? listId : void 0,
      "aria-activedescendant": listOpen ? listId + "-" + chosen : void 0,
      placeholder: "\uD300\uC5D0 \uBA54\uC2DC\uC9C0 \uBCF4\uB0B4\uAE30",
      onSelect: (event) => {
        const position = event.currentTarget.selectionStart;
        if (position !== caret && mentionMode !== "menu") setMentionMode(mentionAt(draft, position) ? "typed" : "");
        setCaret(position);
        setSelected(0);
      },
      onChange: (event) => {
        const { value, selectionStart } = event.currentTarget;
        edit(value, selectionStart);
        setMentionMode(mentionAt(value, selectionStart) ? "typed" : "");
        setSelected(0);
        setError("");
      },
      onKeyDown: (event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === "Escape" && listOpen) {
          event.preventDefault();
          setMentionMode("");
          return;
        }
        if (listOpen && ["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          setSelected((chosen + (event.key === "ArrowDown" ? 1 : candidates.length - 1)) % candidates.length);
          return;
        }
        if (listOpen && (event.key === "Tab" || event.key === "Enter" && !event.shiftKey)) {
          event.preventDefault();
          mention(candidates[chosen]);
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) void send(event);
      }
    }
  ), listOpen && /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-mentions", id: listId, role: "listbox", "aria-label": "\uD300\uC6D0 \uBA58\uC158" }, candidates.map((name, i) => /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      key: name,
      id: listId + "-" + i,
      type: "button",
      role: "option",
      "aria-selected": i === chosen,
      tabIndex: -1,
      onMouseDown: (event) => event.preventDefault(),
      onClick: () => mention(name)
    },
    "@",
    name
  ))), /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-compose-foot" }, /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", "aria-label": "\uD300\uC6D0 \uBA58\uC158", title: "\uD300\uC6D0 \uBA58\uC158", onClick: () => {
    setMentionMode(mentionMode === "menu" ? "" : "menu");
    setSelected(0);
    field.current?.focus();
  } }, "\uFF20"), !reply && /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", "aria-pressed": planMode, onClick: () => {
    setPlanMode(!planMode);
    if (!planMode) setTools(false);
    draftStore.set(teamId, { text: draft, allocation: !planMode });
    field.current?.focus();
  } }, "\uC5C5\uBB34 \uB098\uB204\uAE30"), allocation && /* @__PURE__ */ import_react4.default.createElement("small", null, "\uB9AC\uB4DC \uBC30\uBD84\uC548 \xB7 \uC2B9\uC778 \uD6C4 \uC2E4\uD589"), /* @__PURE__ */ import_react4.default.createElement("label", { className: "tc-tool-toggle", title: "\uD55C \uD300\uC6D0\uC744 \uC9C1\uC811 \uD638\uCD9C\uD560 \uB54C DSH \uAD8C\uD55C\uC73C\uB85C \uB3C4\uAD6C \uC0AC\uC6A9" }, /* @__PURE__ */ import_react4.default.createElement("input", { type: "checkbox", checked: tools && !allocation, disabled: allocation, onChange: (event) => setTools(event.target.checked) }), " \uC774\uBC88 \uBA54\uC2DC\uC9C0\uC5D0 DSH \uB3C4\uAD6C \uD5C8\uC6A9"), /* @__PURE__ */ import_react4.default.createElement("span", { className: "tc-spacer" }), room.activeId && /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", "aria-label": "\uD604\uC7AC \uC751\uB2F5\uB9CC \uC911\uC9C0", title: "\uD604\uC7AC \uC751\uB2F5\uB9CC \uC911\uC9C0", onClick: () => onStop("current") }, /* @__PURE__ */ import_react4.default.createElement(Icon, { kind: "stop", size: 16 })), /* @__PURE__ */ import_react4.default.createElement("button", { className: "tc-primary tc-send", "aria-label": "\uBCF4\uB0B4\uAE30", disabled: !draft.trim() || busy || Boolean(toolError) }, /* @__PURE__ */ import_react4.default.createElement(Icon, { kind: "send", size: 18 }))));
}
function RoomActivity({ room, open, onAnswer, onResume }) {
  const activity = room.activity;
  const attention = room.awaiting;
  const name = (id2) => room.members.find((member2) => member2.id === id2)?.name ?? "\uD300\uC6D0";
  const status = { approval: "DSH \uC2B9\uC778 \uB300\uAE30", question: "DSH \uC9C8\uBB38 \uB300\uAE30", "native-queue": "\uC6D0\uBCF8 \uC138\uC158 \uB300\uAE30\uC5F4", running: "\uC751\uB2F5 \uC911", stopping: "\uC911\uC9C0 \uC911" };
  if (!activity && !attention && !room.queued) return null;
  return /* @__PURE__ */ import_react4.default.createElement("section", { className: "tc-activity", "aria-label": "\uB300\uD654\uBC29 \uD65C\uB3D9" }, attention && /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-activity-row tc-attention" }, /* @__PURE__ */ import_react4.default.createElement("span", { role: "status" }, /* @__PURE__ */ import_react4.default.createElement("strong", null, "\uC0AC\uC6A9\uC790 \uB2F5\uBCC0 \uB300\uAE30"), " \xB7 @", name(attention.memberId), attention.remaining > 0 ? " \xB7 \uB0A8\uC740 \uD300\uC6D0 \uC791\uC5C5 " + attention.remaining + "\uAC74" : ""), /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", onClick: onAnswer }, "\uB2F5\uBCC0\uD558\uAE30"), /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", onClick: onResume }, "\uB300\uAE30\uC5F4 \uC7AC\uAC1C")), activity && /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-activity-row" }, /* @__PURE__ */ import_react4.default.createElement("span", { role: "status" }, /* @__PURE__ */ import_react4.default.createElement("strong", null, "@", name(activity.memberId)), " \xB7 ", status[activity.kind], activity.toolName ? " \xB7 " + activity.toolName : ""), ["approval", "question", "native-queue"].includes(activity.kind) && /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", onClick: () => open(room.teamId, activity.memberId) }, /* @__PURE__ */ import_react4.default.createElement(Icon, { kind: "open", size: 13 }), " \uC6D0\uBCF8 \uC138\uC158 \uC5F4\uAE30")), room.queued > 0 && /* @__PURE__ */ import_react4.default.createElement("details", { className: "tc-queue" }, /* @__PURE__ */ import_react4.default.createElement("summary", null, "\uB300\uAE30\uC5F4 ", room.queued, "\uAC74"), /* @__PURE__ */ import_react4.default.createElement("ol", null, room.queuedPreview?.map((item) => /* @__PURE__ */ import_react4.default.createElement("li", { key: item.id }, item.text)))));
}
function Timeline({ room, onEarlier, messages, onReply, onRetry, onWorkflow, open, query, command, ask }) {
  const log = (0, import_react4.useRef)(null);
  const follow = (0, import_react4.useRef)(true);
  const [jump, setJump] = (0, import_react4.useState)(false);
  const statuses = { queued: "\uB300\uAE30 \uC911", running: "\uC751\uB2F5 \uC911", waiting: "\uC0AC\uC6A9\uC790 \uB2F5\uBCC0 \uB300\uAE30 \uC911", partial: "\uC77C\uBD80 \uC2E4\uD328", stopped: "\uC911\uC9C0\uB428", interrupted: "\uC7AC\uC2DC\uC791\uC73C\uB85C \uC911\uB2E8\uB428", failed: "\uC2E4\uD328" };
  const authors = new Map(messages.map((message) => [message.id, message]));
  const visible = query.trim() ? messages.filter((message) => matchesMessage(message, query)) : messages;
  (0, import_react4.useEffect)(() => {
    if (log.current && follow.current && !query.trim()) log.current.scrollTop = log.current.scrollHeight;
  }, [messages.at(-1)?.id, messages.at(-1)?.text, messages.at(-1)?.status]);
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-log-wrap" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-log", ref: log, "aria-label": "\uACF5\uC720 \uB300\uD654 \uAE30\uB85D", onScroll: () => {
    const node = log.current;
    if (node) {
      follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 70;
      setJump(!follow.current);
    }
  } }, room.earlier && /* @__PURE__ */ import_react4.default.createElement("button", { className: "tc-earlier", type: "button", onClick: async () => {
    follow.current = false;
    const node = log.current;
    const previous = node?.scrollHeight;
    await onEarlier();
    requestAnimationFrame(() => {
      if (node && previous != null) node.scrollTop += node.scrollHeight - previous;
    });
  } }, "\uC774\uC804 \uBA54\uC2DC\uC9C0 \uBCF4\uAE30"), !messages.length && /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-empty" }, /* @__PURE__ */ import_react4.default.createElement(Icon, { size: 30 }), /* @__PURE__ */ import_react4.default.createElement("h2", null, "\uCCAB \uBA54\uC2DC\uC9C0\uB97C \uBCF4\uB0B4\uC138\uC694"), /* @__PURE__ */ import_react4.default.createElement("p", null, "@", room.members.find((item) => item.role === "lead")?.name ?? room.members[0].name, "\uB85C \uD300\uC6D0 \uD55C \uBA85\uC744 \uBD80\uB974\uAC70\uB098 @all\uB85C \uBAA8\uB450\uC5D0\uAC8C \uBB3C\uC5B4\uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4.")), query.trim() && /* @__PURE__ */ import_react4.default.createElement("p", { className: "tc-search-count", role: "status" }, "\uBD88\uB7EC\uC628 \uBA54\uC2DC\uC9C0 \uC911 ", visible.length, "\uAC74"), visible.map((message) => /* @__PURE__ */ import_react4.default.createElement("article", { key: message.id, "data-message-id": message.id, className: "tc-message tc-" + message.kind }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-avatar tc-" + avatarStyle(message, room.members) }, message.author.slice(0, 1).toUpperCase()), /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-bubble" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-byline" }, /* @__PURE__ */ import_react4.default.createElement("strong", null, message.kind === "bot" ? "@" : "", message.author), /* @__PURE__ */ import_react4.default.createElement("time", { dateTime: new Date(message.time).toISOString() }, clock.format(message.time)), message.kind === "bot" && !message.workflowRunId && message.text && message.status !== "running" && /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", onClick: () => onReply(message) }, "\uB2F5\uC7A5"), message.workflowRunId && /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", onClick: () => onWorkflow(message) }, "\uC6CC\uD06C\uD50C\uB85C\uC6B0 \uC791\uC5C5 \uBCF4\uAE30"), message.kind === "user" && ["failed", "stopped", "interrupted"].includes(message.status) && /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", onClick: () => onRetry(message) }, "\uB2E4\uC2DC \uC791\uC131"), message.kind === "bot" && /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      title: "DSH \uC6D0\uBCF8 \uC138\uC158 \uC5F4\uAE30",
      "aria-label": message.author + " \uC6D0\uBCF8 \uC138\uC158 \uC5F4\uAE30",
      onClick: () => open(room.teamId, message.memberId)
    },
    /* @__PURE__ */ import_react4.default.createElement(Icon, { kind: "open", size: 13 })
  )), authors.get(message.replyTo)?.kind === "bot" && /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-origin" }, "\u21B3 @", authors.get(message.replyTo).author), message.text && /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-body" }, message.text), message.allocation && (message.assignment || !["failed", "stopped", "interrupted"].includes(message.status)) && /* @__PURE__ */ import_react4.default.createElement(
    AllocationCard,
    {
      id: message.id,
      assignment: message.assignment,
      members: room.members,
      command,
      openAgent: (agent) => open(room.teamId, agent),
      ask
    }
  ), message.error && /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-error" }, message.error), message.truncated && /* @__PURE__ */ import_react4.default.createElement("span", { className: "tc-status" }, "\uAE34 \uC751\uB2F5 \uC77C\uBD80 \uC0DD\uB7B5 \xB7 \uC804\uCCB4\uB294 \uC6D0\uBCF8 \uC138\uC158"), !!message.handoffWarnings?.length && /* @__PURE__ */ import_react4.default.createElement("ul", { className: "tc-handoff-warnings", "aria-label": "\uC778\uACC4 \uBBF8\uC2E4\uD589" }, message.handoffWarnings.map((item) => /* @__PURE__ */ import_react4.default.createElement("li", { key: item.name }, "@", item.name, " \xB7 ", handoffWarning[item.reason])), message.handoffWarningCount > message.handoffWarnings.length && /* @__PURE__ */ import_react4.default.createElement("li", null, "\uC678 ", message.handoffWarningCount - message.handoffWarnings.length, "\uAC74")), message.asksUser && /* @__PURE__ */ import_react4.default.createElement("span", { className: "tc-status tc-ask" }, "\uC0AC\uC6A9\uC790\uC5D0\uAC8C \uC9C8\uBB38"), statuses[message.status] && /* @__PURE__ */ import_react4.default.createElement("span", { className: "tc-status" }, statuses[message.status]))))), jump && !query.trim() && /* @__PURE__ */ import_react4.default.createElement("button", { className: "tc-jump", type: "button", onClick: () => {
    follow.current = true;
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  } }, "\uCD5C\uC2E0 \uBA54\uC2DC\uC9C0 \u2193"));
}
function TeamChat({ rpc, watch, nav, open, draftStore, replyStore }) {
  const hint = (0, import_react4.useSyncExternalStore)(nav.subscribe, nav.snapshot);
  const [selection, setSelection] = (0, import_react4.useState)("");
  const [directory, setDirectory] = (0, import_react4.useState)(empty);
  const [room, setRoom] = (0, import_react4.useState)(null);
  const [editing, setEditing] = (0, import_react4.useState)(false);
  const [refresh, setRefresh] = (0, import_react4.useState)(0);
  const [, renderReply] = (0, import_react4.useState)(0);
  const [draftRevision, setDraftRevision] = (0, import_react4.useState)(0);
  const [query, setQuery] = (0, import_react4.useState)("");
  const [searchOpen, setSearchOpen] = (0, import_react4.useState)(false);
  const [error, setError] = (0, import_react4.useState)("");
  const [roomError, setRoomError] = (0, import_react4.useState)("");
  const [loaded, setLoaded] = (0, import_react4.useState)(false);
  const [mobileList, setMobileList] = (0, import_react4.useState)(true);
  const [workflowOpen, setWorkflowOpen] = (0, import_react4.useState)(false);
  const [design, setDesign] = (0, import_react4.useState)(false);
  const [answer, setAnswer] = (0, import_react4.useState)(null);
  const [workflowNode, setWorkflowNode] = (0, import_react4.useState)("");
  const [workflowRun, setWorkflowRun] = (0, import_react4.useState)("");
  const [workflowTab, setWorkflowTab] = (0, import_react4.useState)("edit");
  const teamId = selection || hint || directory.rooms[0]?.teamId || "";
  const current = directory.rooms.find((item) => item.teamId === teamId);
  const source = directory.teams.find((item) => item.teamId === teamId);
  const focusRoom = room?.teamId === teamId ? room : null;
  const reply = replyStore.get(teamId);
  const workflow = useWorkflow(rpc, teamId, Boolean(focusRoom) && workflowOpen, focusRoom?.workflowVersion);
  const selectedDesign = workflow.draft.nodes.find((node) => node.id === workflowNode);
  (0, import_react4.useEffect)(() => {
    setDesign(false);
    setAnswer(null);
    setWorkflowNode("");
    setWorkflowRun("");
    setWorkflowTab("edit");
  }, [teamId]);
  function openWorkflowMessage(message) {
    setMobileList(false);
    setWorkflowOpen(true);
    setWorkflowTab("run");
    setWorkflowRun(message.workflowRunId);
    setWorkflowNode(message.workflowNodeId);
  }
  function focusMessage(id2) {
    const element = document.querySelector('[data-message-id="' + CSS.escape(id2) + '"]');
    if (!element) {
      setError("\uC774 \uBA54\uC2DC\uC9C0\uB97C \uBCF4\uB824\uBA74 \uC774\uC804 \uBA54\uC2DC\uC9C0\uB97C \uB354 \uBD88\uB7EC\uC624\uC138\uC694.");
      return;
    }
    element.scrollIntoView({ block: "center" });
    element.animate([{ backgroundColor: "var(--tc-accent-soft)" }, { backgroundColor: "transparent" }], { duration: 1600 });
  }
  function leaveDesign() {
    setDesign(false);
    setAnswer(null);
  }
  function setReply(message) {
    if (message) replyStore.set(teamId, message);
    else replyStore.delete(teamId);
    renderReply((value) => value + 1);
  }
  (0, import_react4.useEffect)(() => {
    setSelection(hint);
    setEditing(false);
    if (hint) setMobileList(false);
  }, [hint]);
  (0, import_react4.useEffect)(() => {
    let disposed = false;
    let timer;
    async function load() {
      try {
        const result = await rpc({ op: "list" });
        if (!disposed) {
          setDirectory(result);
          setLoaded(true);
          setError("");
        }
      } catch (cause) {
        if (!disposed) setError(cause.message);
      }
      if (!disposed) timer = setTimeout(load, 12e3);
    }
    void load();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [rpc, refresh, hint]);
  (0, import_react4.useEffect)(() => {
    setQuery("");
    setSearchOpen(false);
  }, [teamId]);
  (0, import_react4.useEffect)(() => {
    if (!current) return;
    const controller = new AbortController();
    const signal = controller.signal;
    let wake;
    let timer;
    async function follow() {
      let backoff = 750;
      while (!signal.aborted) {
        try {
          for await (const frame of watch(teamId, signal)) {
            if (signal.aborted) return;
            setRoomError("");
            backoff = 750;
            if (frame.type === "snapshot") setRoom((previous) => reconcileSnapshot(previous, frame.room));
            else setRoom((previous) => previous?.teamId === teamId ? { ...previous, ...frame.room, messages: mergeMessages(previous.messages, frame.room.messages) } : previous);
          }
        } catch {
          if (signal.aborted) return;
        }
        if (signal.aborted) return;
        try {
          const result = await rpc({ op: "view", teamId });
          if (signal.aborted) return;
          setRoom((previous) => reconcileSnapshot(previous, result));
          setRoomError("");
        } catch (cause) {
          if (!signal.aborted) setRoomError(cause.message);
        }
        if (signal.aborted) return;
        await new Promise((resolve) => {
          wake = resolve;
          timer = setTimeout(resolve, backoff);
        });
        backoff = Math.min(backoff * 2, 8e3);
      }
    }
    setRoomError("");
    void follow();
    return () => {
      controller.abort();
      clearTimeout(timer);
      wake?.();
    };
  }, [rpc, watch, Boolean(current), teamId]);
  async function mutate(input) {
    const result = await rpc(input);
    if (input.op === "save") setRefresh((value) => value + 1);
    return result;
  }
  async function earlier() {
    try {
      const before = focusRoom?.earlier;
      if (!before) return;
      const page = await rpc({ op: "view", teamId, before });
      setRoom((existing) => existing?.teamId === teamId && existing.earlier === before ? { ...existing, messages: mergeMessages(page.messages, existing.messages), earlier: page.earlier } : existing);
    } catch (cause) {
      setError(cause.message);
    }
  }
  function select(id2, edit = false) {
    setSelection(id2);
    setEditing(edit);
    setMobileList(false);
  }
  function action(input) {
    setError("");
    void mutate(input).catch((cause) => setError(cause.message));
  }
  function retry(message) {
    if (draftStore.get(teamId)?.text.trim()) {
      setError("\uC791\uC131 \uC911\uC778 \uCD08\uC548\uC744 \uC9C0\uC6B0\uAC70\uB098 \uBCF4\uB0B8 \uB4A4 \uC774\uC804 \uBA54\uC2DC\uC9C0\uB97C \uB2E4\uC2DC \uC791\uC131\uD558\uC138\uC694.");
      return;
    }
    let text2;
    try {
      text2 = retryDraft(message, focusRoom.members);
    } catch (cause) {
      setError(cause.message);
      return;
    }
    if (!text2) {
      setError("\uC774 \uBA54\uC2DC\uC9C0\uC758 \uAE30\uC874 \uCC38\uAC00\uC790\uB97C \uD604\uC7AC \uBC29\uC5D0\uC11C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
      return;
    }
    if (text2.length > 12e3) {
      setError("\uC774 \uBA54\uC2DC\uC9C0\uB294 \uD604\uC7AC \uC785\uB825 \uAE38\uC774 \uD55C\uB3C4\uB97C \uB118\uC2B5\uB2C8\uB2E4.");
      return;
    }
    setError("");
    setReply(null);
    draftStore.set(teamId, { text: text2, allocation: Boolean(message.allocation) });
    setDraftRevision((value) => value + 1);
  }
  const canConfigure = source && (!current || editing);
  return /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-app" + (mobileList ? " tc-show-list" : "") + (focusRoom && workflowOpen ? " tc-with-workflow" : "") + (design || answer ? " tc-workflow-compose" : "") }, /* @__PURE__ */ import_react4.default.createElement("aside", { className: "tc-rooms", "aria-label": "\uB300\uD654\uBC29 \uBAA9\uB85D" }, /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-list-head" }, /* @__PURE__ */ import_react4.default.createElement(Icon, null), /* @__PURE__ */ import_react4.default.createElement("strong", null, "Team Chat"), /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", title: "\uBAA9\uB85D \uC0C8\uB85C\uACE0\uCE68", "aria-label": "\uBAA9\uB85D \uC0C8\uB85C\uACE0\uCE68", onClick: () => setRefresh((value) => value + 1) }, "\u21BB")), directory.rooms.map((item) => /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      className: "tc-room-link",
      "data-current": teamId === item.teamId,
      key: item.teamId,
      onClick: () => select(item.teamId)
    },
    /* @__PURE__ */ import_react4.default.createElement("strong", null, item.title),
    /* @__PURE__ */ import_react4.default.createElement("small", null, item.members.length, "\uBA85")
  )), directory.teams.filter((item) => !directory.rooms.some((saved) => saved.teamId === item.teamId)).map((item) => /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      className: "tc-room-link",
      "data-current": teamId === item.teamId,
      key: item.teamId,
      onClick: () => select(item.teamId, true)
    },
    /* @__PURE__ */ import_react4.default.createElement(Icon, { kind: "plus", size: 15 }),
    /* @__PURE__ */ import_react4.default.createElement("strong", null, item.title)
  )), loaded && !directory.rooms.length && !directory.teams.length && /* @__PURE__ */ import_react4.default.createElement("p", { className: "tc-list-note" }, "DSH\uC5D0\uC11C \uD300 \uB9AC\uB4DC \uC138\uC158\uC744 \uC5F4\uBA74 \uC5EC\uAE30\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4.")), /* @__PURE__ */ import_react4.default.createElement("main", { className: "tc-room" }, /* @__PURE__ */ import_react4.default.createElement("header", { className: "tc-room-head" }, /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", className: "tc-back", onClick: () => setMobileList(true) }, "\uB300\uD654\uBC29"), /* @__PURE__ */ import_react4.default.createElement("div", null, /* @__PURE__ */ import_react4.default.createElement("h1", null, focusRoom?.title ?? current?.title ?? source?.title ?? "Team Chat"), current && /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-members" }, (focusRoom ?? current).members.map((item) => /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      key: item.id,
      title: item.description || "DSH \uC138\uC158 \uC5F4\uAE30",
      "data-speaking": focusRoom?.currentMember === item.id,
      onClick: () => open(teamId, item.id)
    },
    "@",
    item.name
  )))), current && /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-actions" }, focusRoom && /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", "aria-expanded": workflowOpen, onClick: () => {
    if (workflowOpen) leaveDesign();
    else setMobileList(false);
    setWorkflowOpen(!workflowOpen);
  } }, "\uC6CC\uD06C\uD50C\uB85C\uC6B0"), focusRoom && /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", "aria-expanded": searchOpen, onClick: () => {
    setSearchOpen((value) => !value);
    setQuery("");
  } }, "\uAE30\uB85D \uAC80\uC0C9"), focusRoom && (focusRoom.active || focusRoom.queued || focusRoom.awaiting || focusRoom.workflowCanStop || focusRoom.stoppingRoom) ? /* @__PURE__ */ import_react4.default.createElement(
    "button",
    {
      type: "button",
      className: "tc-wf-danger",
      disabled: focusRoom.stoppingRoom,
      onClick: () => action({ op: "stop", teamId, mode: "all" })
    },
    "\uBC29 \uC804\uCCB4 \uC911\uC9C0"
  ) : null, source && /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", disabled: focusRoom?.active, onClick: () => setEditing((value) => !value) }, "\uBC29 \uC124\uC815"), /* @__PURE__ */ import_react4.default.createElement("button", { type: "button", onClick: () => open(teamId, teamId), title: "DSH \uD300 \uB9AC\uB4DC \uC138\uC158 \uC5F4\uAE30" }, /* @__PURE__ */ import_react4.default.createElement(Icon, { kind: "open", size: 16 }), " \uD300 \uC138\uC158"))), (roomError || error) && /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-error tc-banner", role: "alert" }, roomError || error), canConfigure ? /* @__PURE__ */ import_react4.default.createElement(
    RoomSettings,
    {
      key: teamId,
      source,
      current: focusRoom ?? current,
      onCancel: () => {
        setEditing(false);
        setMobileList(true);
      },
      onSubmit: async (input) => {
        const saved = await mutate(input);
        setDirectory((value) => ({ ...value, rooms: [saved, ...value.rooms.filter((item) => item.teamId !== saved.teamId)] }));
        select(saved.teamId);
      }
    }
  ) : focusRoom ? /* @__PURE__ */ import_react4.default.createElement(import_react4.default.Fragment, null, /* @__PURE__ */ import_react4.default.createElement(
    RoomActivity,
    {
      room: focusRoom,
      open,
      onAnswer: () => {
        const { messageId, memberId } = focusRoom.awaiting;
        const message = focusRoom.messages.find((item) => item.id === messageId);
        setReply(message ?? { id: messageId, memberId, text: "", author: focusRoom.members.find((item) => item.id === memberId)?.name ?? "\uD300\uC6D0" });
      },
      onResume: () => action({ op: "resume", teamId, questionId: focusRoom.awaiting.messageId })
    }
  ), searchOpen && /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-search" }, /* @__PURE__ */ import_react4.default.createElement(
    "input",
    {
      type: "search",
      "aria-label": "\uBD88\uB7EC\uC628 \uAE30\uB85D \uAC80\uC0C9",
      autoFocus: true,
      value: query,
      placeholder: "\uD300\uC6D0 \uC774\uB984 \uB610\uB294 \uBA54\uC2DC\uC9C0",
      onChange: (event) => setQuery(event.target.value)
    }
  )), /* @__PURE__ */ import_react4.default.createElement(
    Timeline,
    {
      key: teamId,
      room: focusRoom,
      messages: focusRoom.messages,
      query,
      open,
      onReply: setReply,
      onRetry: retry,
      onEarlier: earlier,
      onWorkflow: openWorkflowMessage,
      command: (input) => rpc({ op: "workflow", teamId, input }),
      ask: (value) => {
        setDesign(false);
        setAnswer(value);
      }
    }
  ), design || answer ? /* @__PURE__ */ import_react4.default.createElement(
    WorkflowChat,
    {
      key: answer?.question.id ?? "design",
      workflow,
      selected: selectedDesign,
      answer,
      onClose: leaveDesign,
      onAnswer: leaveDesign
    }
  ) : /* @__PURE__ */ import_react4.default.createElement(
    Composer,
    {
      key: teamId + ":" + draftRevision,
      room: focusRoom,
      draftStore,
      reply,
      onClearReply: () => setReply(null),
      onSend: mutate,
      onStop: (mode2) => action({
        op: "stop",
        teamId,
        mode: mode2,
        ...focusRoom.activeId ? { activeId: focusRoom.activeId, runId: focusRoom.activeRunId } : {}
      })
    }
  )) : /* @__PURE__ */ import_react4.default.createElement("div", { className: "tc-empty" }, /* @__PURE__ */ import_react4.default.createElement(Icon, { size: 30 }), /* @__PURE__ */ import_react4.default.createElement("h2", null, loaded ? "\uD300 \uB300\uD654\uBC29\uC744 \uC120\uD0DD\uD558\uC138\uC694" : "\uBD88\uB7EC\uC624\uB294 \uC911"), loaded && /* @__PURE__ */ import_react4.default.createElement("p", null, directory.available ? "\uAE30\uC874 \uD300\uC758 \uB9AC\uB4DC \uC138\uC158\uC744 \uC5F0 \uB4A4 \uBAA9\uB85D\uC5D0\uC11C \uB300\uD654\uBC29\uC744 \uB9CC\uB4E4 \uC218 \uC788\uC2B5\uB2C8\uB2E4." : "\uD50C\uB7EC\uADF8\uC778\uC5D0\uC11C Agent Teams\uB97C \uD65C\uC131\uD654\uD558\uC138\uC694."))), focusRoom && workflowOpen && /* @__PURE__ */ import_react4.default.createElement(
    WorkflowPanel,
    {
      key: teamId,
      workflow,
      selected: workflowNode,
      onSelect: setWorkflowNode,
      runId: workflowRun,
      onRun: setWorkflowRun,
      tab: workflowTab,
      setTab: setWorkflowTab,
      onDesign: () => {
        setAnswer(null);
        setDesign(true);
        setWorkflowTab("edit");
      },
      ask: (value) => {
        setDesign(false);
        setAnswer(value);
      },
      onClose: () => {
        setWorkflowOpen(false);
        leaveDesign();
      },
      openAgent: (agent) => open(teamId, agent),
      openMessage: focusMessage
    }
  ));
}
async function apply(ctx) {
  const dispose = await ctx.remote.$mount({ package: packageName, descriptors });
  ctx.effect(() => dispose, "team-chat Remote contribution");
  ctx.inject(["remote.teamChat"], register);
}
function register(ctx) {
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.teamChat = "";
    style.textContent = style_default + workflow_default;
    document.head.appendChild(style);
    return () => style.remove();
  }, "team-chat CSS");
  const draftStore = /* @__PURE__ */ new Map();
  const replyStore = /* @__PURE__ */ new Map();
  let requested = "";
  const subscribers = /* @__PURE__ */ new Set();
  const nav = {
    snapshot: () => requested,
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    select(id2) {
      requested = id2;
      for (const notify of subscribers) notify();
      ctx.layout.selectPanel(PANEL);
    }
  };
  const rpc = async (input) => {
    const result = await ctx.remote.teamChat.request(input);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };
  const watch = (teamId, signal) => ctx.remote.teamChat.watch(teamId, signal);
  const open = (parentSessionId, childSessionId) => {
    ctx.uiWorkspace.openSession(parentSessionId === childSessionId ? parentSessionId : { parentSessionId, childSessionId, mode: "continuable" });
  };
  ctx.slots.inject("main", () => ctx.slots.register(
    { name: "main", key: PANEL },
    () => /* @__PURE__ */ import_react4.default.createElement(TeamChat, { rpc, watch, nav, open, draftStore, replyStore })
  ));
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register(
    { name: "sidebar.panellist", id: PANEL, order: 12, label: "Team Chat" },
    () => /* @__PURE__ */ import_react4.default.createElement(Icon, null)
  ));
  ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
    name: "conversation.session.header.actions",
    id: PANEL,
    order: 10
  }, ({ sessionId, useSession, useSessions }) => {
    const lead = useSession((snapshot) => snapshot.subagent?.address.parentSessionId) ?? sessionId;
    const team = useSessions((state) => state.projectionsBySession[lead]?.values.agentTeam);
    if (!lead || !team?.members?.some((member2) => member2.role === "teammate" && member2.phase === "active")) return null;
    return /* @__PURE__ */ import_react4.default.createElement(
      "button",
      {
        className: "tc-native-button",
        type: "button",
        title: "\uC774 \uD300\uC758 \uB300\uD654\uBC29 \uC5F4\uAE30",
        "aria-label": "\uC774 \uD300\uC758 \uB300\uD654\uBC29 \uC5F4\uAE30",
        onClick: () => nav.select(lead)
      },
      /* @__PURE__ */ import_react4.default.createElement(Icon, { size: 17 })
    );
  }));
}
return module.exports; } });
