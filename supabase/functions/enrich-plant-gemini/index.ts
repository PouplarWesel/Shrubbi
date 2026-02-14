import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

const ALLOWED_TYPES = new Set([
  "tree",
  "shrub",
  "vine",
  "herb",
  "flower",
  "vegetable",
  "house_plant",
  "succulent",
  "grass",
  "fern",
  "nonvascular",
  "lichen",
  "other",
]);

const TYPE_BASELINE_CO2: Record<string, number> = {
  tree: 21.77,
  shrub: 4.6,
  vine: 3.2,
  herb: 1.15,
  flower: 1.1,
  vegetable: 1.25,
  house_plant: 1.3,
  succulent: 0.85,
  grass: 0.95,
  fern: 0.9,
  nonvascular: 0.12,
  lichen: 0.08,
  other: 1.3,
};

type GeminiPlantPayload = {
  common_name?: string;
  scientific_name?: string | null;
  type?: string;
  is_native?: boolean;
  is_endangered?: boolean;
  is_invasive?: boolean;
  default_co2_kg_per_year?: number;
  aliases?: string[];
};

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeType = (raw: string | undefined): string => {
  if (!raw) return "other";
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (ALLOWED_TYPES.has(normalized)) return normalized;

  if (normalized.includes("tree")) return "tree";
  if (normalized.includes("shrub")) return "shrub";
  if (normalized.includes("vine")) return "vine";
  if (normalized.includes("herb")) return "herb";
  if (normalized.includes("flower")) return "flower";
  if (normalized.includes("vegetable")) return "vegetable";
  if (normalized.includes("house")) return "house_plant";
  if (normalized.includes("succulent")) return "succulent";
  if (normalized.includes("grass")) return "grass";
  if (normalized.includes("fern")) return "fern";
  if (normalized.includes("moss") || normalized.includes("bryophyte")) {
    return "nonvascular";
  }
  if (normalized.includes("lichen")) return "lichen";

  return "other";
};

const parseGeminiJson = (rawText: string): GeminiPlantPayload | null => {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  const requestTag = `[enrich-plant-gemini ${new Date().toISOString()}]`;
  console.log(`${requestTag} ${req.method} ${new URL(req.url).pathname}`);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !GEMINI_API_KEY
  ) {
    console.error(`${requestTag} missing required env vars`);
    return jsonResponse(500, {
      error:
        "Missing required env vars (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY).",
    });
  }

  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  console.log(
    `${requestTag} auth header present=${authHeader ? "yes" : "no"}`,
  );
  let authenticatedUserId: string | null = null;

  if (authHeader) {
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (!userError && user?.id) {
      authenticatedUserId = user.id;
      console.log(`${requestTag} authenticated via Authorization header`);
    }
  }

  // Fallback for environments where JWT is validated at the gateway but
  // Authorization is not forwarded to the function runtime.
  if (!authenticatedUserId) {
    authenticatedUserId =
      req.headers.get("x-supabase-auth-user") ??
      req.headers.get("x_sb_auth_user");
    if (authenticatedUserId) {
      console.log(`${requestTag} authenticated via gateway auth_user header`);
    }
  }

  let body: { plantName?: string; accessToken?: string };
  try {
    body = await req.json();
  } catch {
    console.error(`${requestTag} invalid JSON body`);
    return jsonResponse(400, { error: "Invalid JSON body." });
  }
  console.log(
    `${requestTag} body accessToken present=${body.accessToken ? "yes" : "no"}`,
  );

  if (!authenticatedUserId && body.accessToken) {
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const {
      data: { user },
      error: tokenError,
    } = await authClient.auth.getUser(body.accessToken);

    if (!tokenError && user?.id) {
      authenticatedUserId = user.id;
      console.log(`${requestTag} authenticated via body accessToken`);
    }
  }

  if (!authenticatedUserId) {
    console.error(`${requestTag} unauthorized (no auth context found)`);
    return jsonResponse(401, { error: "Unauthorized." });
  }

  const plantName = body.plantName?.trim();
  if (!plantName) {
    console.error(`${requestTag} missing plantName`);
    return jsonResponse(400, { error: "plantName is required." });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: existingSearch } = await admin.rpc("search_plants", {
    search_text: plantName,
    max_results: 1,
  });

  const existing = (existingSearch ?? [])[0] as
    | {
        plant_id: string;
        common_name: string;
        scientific_name: string | null;
      }
    | undefined;

  if (existing?.plant_id) {
    console.log(`${requestTag} existing plant matched: ${existing.plant_id}`);
    return jsonResponse(200, {
      source: "existing",
      plant_id: existing.plant_id,
      common_name: existing.common_name,
      scientific_name: existing.scientific_name,
    });
  }

  const prompt = `
You are a botanist assistant returning strict JSON only.
Given a plant name, infer likely structured fields.

Allowed type values:
tree, shrub, vine, herb, flower, vegetable, house_plant, succulent, grass, fern, nonvascular, lichen, other

Return JSON object with keys:
- common_name: string
- scientific_name: string or null
- type: one allowed type value
- is_native: boolean
- is_endangered: boolean
- is_invasive: boolean
- default_co2_kg_per_year: number (estimated annual CO2 absorption in kg per plant, non-negative)
- aliases: string[] (optional alternate common names)

Plant name input: "${plantName}"
`;

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(
      GEMINI_API_KEY,
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!geminiResponse.ok) {
    const details = await geminiResponse.text();
    console.error(`${requestTag} Gemini request failed`, details);
    return jsonResponse(502, {
      error: "Gemini request failed.",
      details,
    });
  }

  const geminiBody = await geminiResponse.json();
  const rawText =
    geminiBody?.candidates?.[0]?.content?.parts?.[0]?.text?.toString() ?? "";
  const parsed = parseGeminiJson(rawText);
  if (!parsed) {
    console.error(`${requestTag} Gemini JSON parse failed`, rawText);
    return jsonResponse(502, {
      error: "Could not parse Gemini response.",
      raw: rawText,
    });
  }

  const commonName = (parsed.common_name ?? plantName).trim();
  if (!commonName) {
    console.error(`${requestTag} missing common_name from Gemini payload`);
    return jsonResponse(422, { error: "Gemini response missing common_name." });
  }

  const scientificName =
    typeof parsed.scientific_name === "string" &&
    parsed.scientific_name.trim().length > 0
      ? parsed.scientific_name.trim()
      : null;
  let typeCode = normalizeType(parsed.type);
  const co2ValueRaw = Number(parsed.default_co2_kg_per_year);
  const co2Value =
    Number.isFinite(co2ValueRaw) && co2ValueRaw >= 0
      ? co2ValueRaw
      : (TYPE_BASELINE_CO2[typeCode] ?? 1.3);

  const { data: typeExists } = await admin
    .from("plant_types")
    .select("code")
    .eq("code", typeCode)
    .maybeSingle();
  if (!typeExists) {
    typeCode = "other";
  }

  const { data: inserted, error: insertError } = await admin
    .from("plants")
    .insert({
      common_name: commonName,
      scientific_name: scientificName,
      type: typeCode,
      is_native: !!parsed.is_native,
      is_endangered: !!parsed.is_endangered,
      is_invasive: !!parsed.is_invasive,
      default_co2_kg_per_year: co2Value,
    })
    .select("id, common_name, scientific_name, type, default_co2_kg_per_year")
    .maybeSingle();

  let plantId = inserted?.id ?? null;
  let insertedPlant = inserted ?? null;

  if (insertError) {
    console.error(
      `${requestTag} insert failed, attempting retry lookup`,
      insertError.message,
    );
    const retry = await admin
      .from("plants")
      .select("id, common_name, scientific_name, type, default_co2_kg_per_year")
      .ilike("common_name", commonName)
      .limit(1)
      .maybeSingle();

    if (retry.error || !retry.data) {
      console.error(
        `${requestTag} retry lookup failed`,
        retry.error?.message ?? "no data",
      );
      return jsonResponse(500, {
        error: insertError.message,
      });
    }

    plantId = retry.data.id;
    insertedPlant = retry.data;
  }

  if (plantId && Array.isArray(parsed.aliases) && parsed.aliases.length > 0) {
    const aliases = Array.from(
      new Set(
        parsed.aliases
          .map((value) => value.trim())
          .filter(
            (value) =>
              value.length > 0 &&
              value.toLowerCase() !== commonName.toLowerCase() &&
              value.toLowerCase() !== (scientificName ?? "").toLowerCase(),
          ),
      ),
    );

    if (aliases.length > 0) {
      await admin.from("plant_aliases").insert(
        aliases.map((alias) => ({
          plant_id: plantId as string,
          alias_name: alias,
        })),
      );
    }
  }

  return jsonResponse(200, {
    source: "gemini",
    plant_id: plantId,
    ...insertedPlant,
  });
});
