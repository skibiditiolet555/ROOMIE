const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";

function secretKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return keys.default ?? Object.values(keys)[0] ?? "";
  } catch {
    return "";
  }
}

const dbKey = secretKey();

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: cors });
}

function fail(status: number, detail: string): never {
  throw new ApiError(status, detail);
}

async function db(table: string, method = "GET", params: Record<string, string> = {}, body?: unknown) {
  if (!supabaseUrl || !dbKey) fail(503, "Supabase database secrets are not configured.");
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    method,
    headers: {
      apikey: dbKey,
      Authorization: `Bearer ${dbKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    if (response.status === 409 || response.status === 23505) fail(409, "An account with this email already exists.");
    console.error("Supabase REST error", response.status, text.slice(0, 500));
    fail(response.status === 404 ? 503 : 502, "Supabase request failed. Check the database schema and function secrets.");
  }
  return text ? JSON.parse(text) : [];
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array {
  return new Uint8Array(value.match(/.{1,2}/g)?.map((part) => parseInt(part, 16)) ?? []);
}

async function passwordHash(password: string, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 200_000 }, material, 256);
  return `${hex(salt)}$${hex(new Uint8Array(bits))}`;
}

async function passwordMatches(password: string, stored: string) {
  const [saltHex, digestHex] = stored.split("$");
  if (!saltHex || !digestHex) return false;
  const candidate = await passwordHash(password, fromHex(saltHex));
  const left = new TextEncoder().encode(candidate.split("$")[1]);
  const right = new TextEncoder().encode(digestHex);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

function publicUser(row: Record<string, unknown>) {
  return { id: row.id, email: row.email, name: row.name };
}

async function createSession(userId: string) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...tokenBytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db("roomie_sessions", "POST", {}, { token, user_id: userId, expires_at: expires });
  return token;
}

function bearer(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  if (!value.toLowerCase().startsWith("bearer ")) fail(401, "Not authenticated.");
  return value.slice(7).trim();
}

async function currentUser(request: Request) {
  const token = bearer(request);
  const sessions = await db("roomie_sessions", "GET", {
    token: `eq.${token}`,
    expires_at: `gt.${new Date().toISOString()}`,
    select: "user_id",
    limit: "1",
  });
  if (!sessions.length) fail(401, "Session expired or invalid.");
  const users = await db("roomie_users", "GET", { id: `eq.${sessions[0].user_id}`, select: "*", limit: "1" });
  if (!users.length) fail(401, "Session expired or invalid.");
  return publicUser(users[0]);
}

async function auth(path: string, request: Request, body: Record<string, any>) {
  if (path === "/api/auth/register" && request.method === "POST") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email.includes("@")) fail(400, "Enter a valid email address.");
    if (password.length < 6) fail(400, "Password must be at least 6 characters.");
    const rows = await db("roomie_users", "POST", {}, {
      id: crypto.randomUUID(), email, name: String(body.name ?? "").trim() || email.split("@")[0],
      password_hash: await passwordHash(password),
    });
    const user = publicUser(rows[0]);
    return { token: await createSession(String(user.id)), user };
  }
  if (path === "/api/auth/login" && request.method === "POST") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const rows = await db("roomie_users", "GET", { email: `eq.${email}`, select: "*", limit: "1" });
    if (!rows.length || !(await passwordMatches(String(body.password ?? ""), rows[0].password_hash))) {
      fail(401, "Incorrect email or password.");
    }
    const user = publicUser(rows[0]);
    return { token: await createSession(String(user.id)), user };
  }
  if (path === "/api/auth/logout" && request.method === "POST") {
    await db("roomie_sessions", "DELETE", { token: `eq.${bearer(request)}` });
    return { ok: true };
  }
  if (path === "/api/auth/me" && request.method === "GET") return await currentUser(request);
  if (path === "/api/auth/verify-email" && request.method === "POST") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const rows = await db("roomie_users", "GET", { email: `eq.${email}`, select: "id", limit: "1" });
    return { exists: rows.length > 0 };
  }
  if (path === "/api/auth/set-password" && request.method === "POST") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.new_password ?? "");
    if (password.length < 6) fail(400, "Password must be at least 6 characters.");
    const rows = await db("roomie_users", "GET", { email: `eq.${email}`, select: "id", limit: "1" });
    if (!rows.length) fail(404, "No account found with that email.");
    const updated = await db("roomie_users", "PATCH", { id: `eq.${rows[0].id}` }, { password_hash: await passwordHash(password) });
    return { token: await createSession(String(updated[0].id)), user: publicUser(updated[0]) };
  }
  fail(404, "Route not found.");
}

async function openAiChat(messages: unknown[], schema?: Record<string, unknown>, model = "gpt-4.1") {
  if (!openAiKey) fail(503, "OPENAI_API_KEY is not configured in Supabase Edge Function secrets.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, ...(schema ? { response_format: { type: "json_schema", json_schema: schema } } : {}) }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = await response.json();
  if (!response.ok) fail(502, data.error?.message ?? "OpenAI request failed.");
  const content = data.choices?.[0]?.message?.content;
  if (!content) fail(502, "Model returned an empty response.");
  try { return JSON.parse(content); } catch { fail(502, "Model returned malformed JSON."); }
}

function dataUrlToBlob(input: string): Blob {
  const match = input.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return new Blob([Uint8Array.from(atob(input), (char) => char.charCodeAt(0))], { type: "image/jpeg" });
  const mime = match[1] || "image/jpeg";
  const bytes = match[2] ? Uint8Array.from(atob(match[3]), (char) => char.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(match[3]));
  return new Blob([bytes], { type: mime });
}

async function editImage(image: string, prompt: string) {
  if (!openAiKey) fail(503, "OPENAI_API_KEY is not configured in Supabase Edge Function secrets.");
  const form = new FormData();
  form.set("model", "gpt-image-1");
  form.set("prompt", prompt);
  form.set("size", "1024x1024");
  form.set("quality", "high");
  form.set("input_fidelity", "high");
  form.set("image", dataUrlToBlob(image), "room.png");
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST", headers: { Authorization: `Bearer ${openAiKey}` }, body: form,
    signal: AbortSignal.timeout(140_000),
  });
  const data = await response.json();
  if (!response.ok) fail(502, data.error?.message ?? "Image generation failed.");
  if (!data.data?.[0]?.b64_json) fail(502, "Image model returned no image.");
  return `data:image/png;base64,${data.data[0].b64_json}`;
}

const lockFrame = "Use the supplied photo as the same existing room: preserve its camera angle, architecture, windows, doors, walls, floor, ceiling, and framing. Return a photorealistic interior photograph with no text or watermark.";
const keepExisting = "Keep every existing object in the photo in place and unchanged. Add only the requested new furnishings to available floor and wall space.";
function generationPrompt(style: string, brief: string, budget: number | null, categories: string[]) {
  return `${lockFrame}\n${keepExisting}\nDesign this room in ${style} style. ${brief ? `Client brief: ${brief}.` : ""} ${budget ? `Total budget approximately ${budget.toLocaleString()} THB.` : ""} Add only these categories: ${categories.join(", ")}. ${lockFrame}`;
}

const itemProps = {
  name: { type: "string" }, category: { type: "string", enum: ["furniture", "flooring", "curtains", "lighting", "decor"] },
  description: { type: "string" }, source: { type: "string", enum: ["IKEA", "HomePro", "Shopee", "TikTok Shop", "Lazada", "Other"] },
  price_estimate: { type: "number" }, search_query: { type: "string" },
};
const itemsSchema = { name: "room_items", strict: true, schema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: itemProps, required: Object.keys(itemProps), additionalProperties: false } } }, required: ["items"], additionalProperties: false } };
const pointSchema = { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"], additionalProperties: false };
const bboxSchema = { anyOf: [{ type: "object", properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } }, required: ["x", "y", "w", "h"], additionalProperties: false }, { type: "null" }] };
const outlineSchema = { anyOf: [{ type: "array", items: pointSchema }, { type: "null" }] };
const visionItemsSchema = { name: "room_analysis", strict: true, schema: { type: "object", properties: {
  room_condition: { type: "string", enum: ["empty", "furnished"] }, renovation_plan: { type: "string" },
  items: { type: "array", items: { type: "object", properties: { ...itemProps, bbox: bboxSchema, outline: outlineSchema }, required: [...Object.keys(itemProps), "bbox", "outline"], additionalProperties: false } },
}, required: ["room_condition", "renovation_plan", "items"], additionalProperties: false } };

function toItem(row: Record<string, any>, currency = "THB") {
  return { id: `item-${crypto.randomUUID().slice(0, 10)}`, name: row.name, category: row.category, description: row.description ?? "", source: row.source ?? "Other", price_estimate: Number(row.price_estimate ?? 0), currency, search_query: row.search_query ?? row.name, bbox: row.bbox ?? null, outline: row.outline ?? null };
}

async function ikeaProducts(category?: string | null, query?: string | null, limit = 12) {
  const categoryQuery: Record<string, string> = { sofa: "sofa", chair: "armchair", "coffee-table": "coffee table", "side-table": "side table", "dining-table": "dining table", desk: "desk", cabinet: "storage cabinet", shelf: "bookcase", television: "tv unit", bed: "bed frame", nightstand: "bedside table", rug: "rug", lamp: "floor lamp", plant: "artificial plant", curtain: "curtain", mirror: "mirror", "wall-art": "picture frame", ottoman: "footstool", bench: "bench" };
  if (!category && !query) {
    const entries = Object.entries(categoryQuery);
    const items: unknown[] = [];
    for (let i = 0; i < entries.length; i += 5) {
      const rows = await Promise.all(entries.slice(i, i + 5).map(([id]) => ikeaProducts(id, null, limit)));
      for (const row of rows) items.push(...row.items);
    }
    return { store: "IKEA Thailand", items };
  }
  const phrase = query || (category ? categoryQuery[category] : "sofa");
  if (!phrase) fail(404, `Unknown category: ${category}`);
  const url = "https://sik.search.blue.cdtapps.com/th/th/search?c=listaf&v=20240110";
  const response = await fetch(url, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ searchParameters: { input: phrase, type: "QUERY" }, zip: "10110", store: "", isUserLoggedIn: false, optimizely: {}, components: [{ component: "PRIMARY_AREA", columns: 4, types: { main: "PRODUCT", breakouts: [] }, filterConfig: { "max-num-filters": 0 }, window: { size: limit, offset: 0 }, forceFilterCalculation: true }] }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) fail(502, "IKEA Thailand lookup failed.");
  const results = (await response.json()).results?.[0]?.items ?? [];
  const items = results.flatMap((row: any) => {
    const p = row.product ?? {}; const price = p.salesPrice?.numeral; const productUrl = p.pipUrl; const image = p.mainImageUrl;
    if (!price || !productUrl || !image || p.onlineSellable === false) return [];
    return [{ id: `ikea-${p.itemNoGlobal ?? p.id}`, category: category ?? "furniture", name: `${p.name ?? ""} ${p.typeName ?? ""}`.trim(), en: productUrl.split("/p/")[1]?.replace(/\//g, "").replace(/-\d{6,}$/, "").replace(/-/g, " ") ?? "", description: [p.typeName, p.validDesignText].filter(Boolean).join(", "), price: Math.round(price), store: "IKEA", size: p.itemMeasureReferenceText ?? p.validDesignText ?? "", image_url: image, url: productUrl, swatch: p.colors?.[0]?.hex ? `#${p.colors[0].hex}` : null, rating: p.ratingValue, in_stock: true }];
  });
  return { store: "IKEA Thailand", items };
}

async function routeApi(path: string, request: Request, body: Record<string, any>, url: URL) {
  if (path === "/health" && request.method === "GET") return { status: "ok", openai_key_configured: Boolean(openAiKey), supabase_key_configured: Boolean(dbKey) };
  if (path.startsWith("/api/auth/")) return await auth(path, request, body);

  if (path === "/api/rooms" && request.method === "GET") {
    const user = await currentUser(request);
    return await db("rooms", "GET", { user_id: `eq.${user.id}`, order: "created_at.desc" });
  }
  if (path === "/api/rooms" && request.method === "POST") {
    const user = await currentUser(request);
    const row = { ...body, user_id: user.id };
    const rows = await db("rooms", "POST", {}, row);
    return rows[0];
  }
  const roomMatch = path.match(/^\/api\/rooms\/([^/]+)$/);
  if (roomMatch && request.method === "PATCH") {
    const user = await currentUser(request); const updates = { ...body }; delete updates.user_id; delete updates.id;
    const rows = await db("rooms", "PATCH", { id: `eq.${roomMatch[1]}`, user_id: `eq.${user.id}` }, updates);
    if (rows.length) return rows[0];
    const unchanged = await db("rooms", "GET", { id: `eq.${roomMatch[1]}`, user_id: `eq.${user.id}` });
    if (!unchanged.length) fail(404, "Room not found.");
    return unchanged[0];
  }
  if (roomMatch && request.method === "DELETE") {
    const user = await currentUser(request);
    await db("rooms", "DELETE", { id: `eq.${roomMatch[1]}`, user_id: `eq.${user.id}` });
    return { ok: true };
  }

  if (path === "/api/products" && request.method === "GET") {
    return await ikeaProducts(url.searchParams.get("category"), url.searchParams.get("q"), Math.min(60, Math.max(1, Number(url.searchParams.get("limit") || 24))));
  }

  if (path === "/api/design/generate" && request.method === "POST") {
    const prompt = generationPrompt(String(body.style ?? "Modern"), String(body.prompt ?? ""), body.budget ?? null, body.categories ?? ["furniture", "flooring", "curtains", "lighting", "decor"]);
    return { image: await editImage(body.image, prompt) };
  }
  if (path === "/api/design/refine" && request.method === "POST") {
    return { image: await editImage(body.image, `${lockFrame}\nEdit this ${body.style ?? "Modern"} interior photo: ${body.instruction}. Change nothing else. ${lockFrame}`) };
  }

  if (path === "/api/items/detect" && request.method === "POST") {
    const images: string[] = body.images ?? []; const currency = body.currency ?? "THB";
    const userText = `You are an expert interior designer for a Thai client. Analyze ${images.length} photo(s) of the same ${body.room_category ?? "Room"}, style ${body.style ?? "Modern"}. Brief: ${body.prompt ?? ""}. Budget: ${body.budget ?? "not specified"} ${currency}. If empty, propose a complete furnishing list; if furnished, propose only useful changes and write a short plan. Prices are estimates. Include tight bounding boxes and 12-24 point outlines as 0-100 percentages for items in the first photo. Return 5-10 useful items.`;
    let data: any; let source = "ai_vision";
    if (images.length && openAiKey) {
      const content: any[] = [{ type: "text", text: userText }, ...images.slice(0, 5).map((image) => ({ type: "image_url", image_url: { url: image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}` } }))];
      data = await openAiChat([{ role: "user", content }], visionItemsSchema);
    } else {
      source = "demo";
      if (!groqKey) fail(503, "GROQ_API_KEY is not configured for text-only item suggestions.");
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: [{ role: "user", content: `Suggest a plausible 5-10 item ${body.style ?? "Modern"} ${body.room_category ?? "room"} shopping list for Thailand. Brief: ${body.prompt ?? ""}; budget: ${body.budget ?? "unspecified"} ${currency}. Give price estimates, categories, retailer and search terms. Do not claim to see a photo.` }], response_format: { type: "json_schema", json_schema: itemsSchema } }), signal: AbortSignal.timeout(60_000) });
      const result = await response.json();
      if (!response.ok) fail(502, result.error?.message ?? "Groq request failed.");
      data = JSON.parse(result.choices?.[0]?.message?.content ?? "{}");
    }
    const items = (data.items ?? []).map((item: any) => toItem(item, currency));
    return { items, total_estimate: items.reduce((sum: number, item: any) => sum + item.price_estimate, 0), currency, source, room_condition: data.room_condition ?? "unknown", renovation_plan: data.renovation_plan ?? "" };
  }

  if (path === "/api/items/locate" && request.method === "POST") {
    const schema = { name: "visible_items", strict: true, schema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { id: { type: "string" }, visible: { type: "boolean" }, point: { anyOf: [pointSchema, { type: "null" }] }, bbox: bboxSchema, outline: outlineSchema }, required: ["id", "visible", "point", "bbox", "outline"], additionalProperties: false } } }, required: ["items"], additionalProperties: false } };
    return await openAiChat([{ role: "user", content: [{ type: "text", text: `Locate these listed items in the image. Do not invent absent objects. Coordinates are 0-100 percentages. Return a tight box, an interior point and a careful silhouette outline. Items: ${JSON.stringify(body.items ?? [])}` }, { type: "image_url", image_url: { url: body.image } }] }], schema);
  }
  if (path === "/api/items/regenerate" && request.method === "POST") {
    const item = body.item ?? {};
    const alternatives = await openAiChat([{ role: "user", content: [{ type: "text", text: `Suggest one alternative ${item.category ?? "furniture"} for a Thai room in ${body.style ?? "Modern"} style. Existing item: ${item.name}. Budget remaining: ${body.budget_remaining ?? "unspecified"} THB. Avoid: ${(body.exclude ?? []).join(", ")}. Return product name, category (${item.category ?? "furniture"}), short description, retailer, estimated THB price and search_query.` }, { type: "image_url", image_url: { url: body.image } }] }], { name: "alternative", strict: true, schema: { type: "object", properties: itemProps, required: Object.keys(itemProps), additionalProperties: false } });
    const replacement = toItem(alternatives, item.currency ?? "THB");
    replacement.id = item.id;
    return { item: replacement, image: body.rerender ? await editImage(body.image, `${lockFrame}\nReplace the ${item.name} with ${replacement.name} in the same location and approximate scale. Change nothing else.`) : null };
  }
  if (path === "/api/items/delete" && request.method === "POST") {
    const item = body.item ?? {};
    const image = body.rerender ? await editImage(body.image, `${lockFrame}\nRemove the ${item.name} (${item.category}) completely from the room and fill its place naturally. Change nothing else.`) : null;
    return { removed_id: item.id, image };
  }

  if (path === "/api/decisions/segment" && request.method === "POST") {
    // Supabase Edge Functions are not suitable for hosting YOLOE/PyTorch inference.
    // The frontend already includes SlimSAM/MediaPipe and traces objects locally.
    return { objects: (body.items ?? []).map((item: any) => ({ id: item.id, matched: false, outline: null, score: null, box: null })), extras: [] };
  }
  if (path === "/api/decisions/detect" && request.method === "POST") {
    const content: any[] = [{ type: "text", text: `Compare before and after room photos and list only furniture/decor newly added by the redesign. Give short Thai names, category, realistic Thai Baht estimate and rough center x/y percentages in the new photo. Style: ${body.style ?? ""}; total budget: ${body.budget ?? "unspecified"} THB.` }];
    if (body.original_image_url) content.push({ type: "image_url", image_url: { url: body.original_image_url } });
    content.push({ type: "image_url", image_url: { url: body.image_url } });
    const cats = ["sofa", "armchair", "coffee table", "side table", "dining table", "desk", "bed", "nightstand", "shelf", "cabinet", "tv stand", "rug", "lamp", "plant", "curtain", "mirror", "wall art", "ottoman", "bench", "other"];
    const schema = { name: "added_furniture", strict: true, schema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, category: { type: "string", enum: cats }, price_estimate: { type: "number" }, x: { type: "number" }, y: { type: "number" } }, required: ["name", "category", "price_estimate", "x", "y"], additionalProperties: false } } }, required: ["items"], additionalProperties: false } };
    const result = await openAiChat([{ role: "user", content }], schema, "gpt-4o");
    return { objects: (result.items ?? []).map((row: any) => ({ id: `obj-${crypto.randomUUID().slice(0, 8)}`, name: row.name, category: row.category, price: Math.round(row.price_estimate), x: row.x, y: row.y, matched: false, outline: null, score: null })), source: "gpt" };
  }
  if (path === "/api/decisions/suggest" && request.method === "POST") {
    const weights = [30, 25, 20, 15, 10]; const total = (body.detected_objects ?? []).reduce((s: number, o: any) => s + Number(o.price || 0), 0); const count = body.detected_objects?.length ?? 0;
    const values = (body.detected_objects ?? []).map((o: any) => {
      const category = String(o.category ?? "").toLowerCase();
      const functionScore = ["bed", "sofa", "desk", "dining table"].includes(category) ? 0.9 : ["decor", "plant"].includes(category) ? 0.4 : 0.7;
      const space = Number(o.price) < 3000 ? 0.9 : Number(o.price) < 15000 ? 0.8 : 0.7;
      const fair = count && body.budget ? Number(body.budget) / count : 0;
      let fit = fair ? Math.max(0, Math.min(1, 1 - Math.max(0, Number(o.price) / fair - 1) * 0.45)) : 0.75;
      if (body.budget && total > body.budget) fit = Math.max(0, fit - 0.15);
      const scores = [Math.round(functionScore * weights[0]), Math.round(space * weights[1]), Math.round(fit * weights[2]), 11, 9]; const score = scores.reduce((a: number, b: number) => a + b, 0);
      return { id: o.id, score, scores, reason: "เหมาะกับห้องและงบประมาณโดยรวม", decision: score >= 72 ? "keep" : score >= 55 ? "replace" : "remove" };
    });
    if (values.length && values.every((row: any) => row.decision === "remove")) values.reduce((a: any, b: any) => a.score > b.score ? a : b).decision = "keep";
    return { objects: values, source: "rules" };
  }
  if (path === "/api/decisions/regenerate" && request.method === "POST") {
    const instruction = body.action === "remove" ? `Remove ${body.object_name} (${body.category ?? "item"}) from the room.` : `Replace ${body.object_name} with ${body.instruction || `a different ${body.category ?? "item"}`} in the same place.`;
    return { image_url: await editImage(body.image_url, `${lockFrame}\n${instruction} Change nothing else.`) };
  }

  fail(404, "Route not found.");
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(request.url);
    const marker = "/functions/v1/roomie-api";
    const path = url.pathname.includes(marker) ? url.pathname.slice(url.pathname.indexOf(marker) + marker.length) || "/" : url.pathname;
    const body = request.method === "GET" || request.method === "DELETE" ? {} : await request.json().catch(() => ({}));
    return json(await routeApi(path, request, body, url));
  } catch (error) {
    if (error instanceof ApiError) return json({ detail: error.message }, error.status);
    console.error("Roomie API error", error);
    return json({ detail: "Internal server error." }, 500);
  }
});
