import axios from "axios";
import Groq from "groq-sdk";
import { keccak256, toUtf8Bytes } from "ethers";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

axios.defaults.timeout = 120000;

const API =
  "https://bqrapnlqqtjedjyhlfci.supabase.co/functions/v1/submit-solution";

const API_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcmFwbmxxcXRqZWRqeWhsZmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNzUyNjQsImV4cCI6MjA5Mzg1MTI2NH0.mf0fz6kAnK0yeAXrb-XT6yikbdRmeAq5jsikVPPhaFE";

const WALLET = "0xEB9E8A1114a971d452416D799dBa631629E8c85b";
const AGENT = "Pen";

const headers = {
  apikey: API_KEY,
  "Content-Type": "application/json",
};

const solved = new Set();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clean(x) {
  return String(x || "").trim().replace(/\s+/g, " ");
}

function normalize(x) {
  return clean(x)
    .replace(/^0x/i, "")
    .replace(/\s+/g, "")
    .replace(/[.,]$/g, "")
    .trim();
}

function unique(list) {
  return [...new Set(list.filter(Boolean).map(normalize))];
}

function reverseBitsToHex(prompt) {
  const m = prompt.match(/0b[01]+/i);
  if (!m) return null;

  const bits = m[0].replace(/0b/i, "");
  const rev = bits.split("").reverse().join("");
  return parseInt(rev, 2).toString(16);
}

function powerMinusOneHex(prompt) {
  const m = prompt.match(/2\^(\d+)\s*-\s*1/i);
  if (!m) return null;

  return ((1n << BigInt(m[1])) - 1n).toString(16);
}

function decimalToHex(prompt) {
  const m = prompt.match(/decimal\s+(\d+)/i);
  if (!m) return null;

  return BigInt(m[1]).toString(16);
}

function keccakAnswer(prompt) {
  const m = prompt.match(/keccak256\(["'`](.*?)["'`]\)/i);
  if (!m) return [];

  const hash = keccak256(toUtf8Bytes(m[1])).replace(/^0x/i, "");
  return [hash, hash.slice(0, 8)];
}

function ruleAnswers(prompt) {
  const p = prompt.toLowerCase();
  const out = [];

  const merkle = p.match(/merkle proof of depth\s+(\d+)/i);
  if (merkle) out.push(merkle[1]);

  out.push(...keccakAnswer(prompt));

  if (p.includes("reverse the bits")) {
    const h = reverseBitsToHex(prompt);
    if (h) out.push(h, "0x" + h);
  }

  if (p.includes("2^") && p.includes("hex")) {
    const h = powerMinusOneHex(prompt);
    if (h) out.push(h, "0x" + h);
  }

  if (p.includes("decimal") && p.includes("hex")) {
    const h = decimalToHex(prompt);
    if (h) out.push(h, "0x" + h);
  }

  if (p.includes("schnorr")) {
    if (p.includes("aggregate") || p.includes("operation")) {
      out.push("addition", "scalar addition", "add");
    }
    out.push("schnorr");
  }

  if (p.includes("kyber") && p.includes("lattice")) {
    out.push("mlwe", "module-lwe", "module lwe", "module learning with errors");
  }

  if (p.includes("dilithium")) {
    out.push("module-lwe", "module lattice", "mlwe", "lattice");
  }

  if (p.includes("ethereum") && p.includes("genesis") && p.includes("transactions")) {
    out.push("0", "zero");
  }

  if (p.includes("bitcoin") && p.includes("block headers")) {
    out.push("sha256", "sha-256", "double sha256", "double sha-256");
  }

  if (p.includes("zk-snark") || p.includes("zk snark")) {
    out.push("zero knowledge", "zero-knowledge", "zk");
  }

  if (p.includes("shor")) out.push("rsa");
  if (p.includes("grover")) out.push("sqrt(n)", "sqrt n", "square root n");

  if (p.includes("max supply") && p.includes("bitcoin")) {
    out.push("21000000", "21 million");
  }

  if (p.includes("bitcoin whitepaper")) out.push("2008");
  if (p.includes("bitcoin") && p.includes("launch")) out.push("2009");

  if (p.includes("sha-256") && p.includes("empty string")) {
    out.push("e3b0c4", "e3b0c44298fc1c149afbf4c8996fb924");
  }

  if (p.includes("post-quantum signature") && p.includes("nist")) {
    out.push("dilithium", "crystals-dilithium", "ml-dsa");
  }

  if (p.includes("chain id") && p.includes("base")) out.push("8453");
  if (p.includes("smallest unit") && p.includes("eth")) out.push("wei");
  if (p.includes("gas") && p.includes("unit")) out.push("gwei", "wei");

  return unique(out);
}

async function askAI(prompt) {
  if (!process.env.GROQ_API_KEY) return "";

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0,
      max_tokens: 50,
      messages: [
        {
          role: "system",
          content:
            "Solve crypto, blockchain, math puzzles. Reply ONLY final answer. No explanation. No full sentence. Very short.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    return clean(completion.choices?.[0]?.message?.content || "");
  } catch (e) {
    console.log("AI ERROR:", e.message);
    return "";
  }
}

function aiVariants(prompt, ai) {
  const p = prompt.toLowerCase();
  const a = clean(ai);
  const al = a.toLowerCase();
  const out = [];

  if (a) {
    out.push(a, al);
    if (a.includes(":")) out.push(a.split(":").pop().trim());
    if (a.includes("=")) out.push(a.split("=").pop().trim());
  }

  if (al.includes("double sha")) {
    out.push("sha256", "sha-256", "double sha256", "double sha-256");
  }

  if (al.includes("sha-256") || al.includes("sha256")) {
    out.push("sha256", "sha-256");
  }

  if (al.includes("zero knowledge") || al.includes("zero-knowledge")) {
    out.push("zero knowledge", "zero-knowledge", "zk");
  }

  if (al.includes("ring-lwe") && p.includes("kyber")) {
    out.push("mlwe", "module-lwe", "module lwe");
  }

  if (al.includes("ecdsa") && p.includes("schnorr")) {
    out.push("addition", "scalar addition", "add");
  }

  if (al.includes("rsa")) out.push("rsa");
  if (al.includes("sqrt")) out.push("sqrt(n)", "sqrt n");
  if (al.includes("21 million")) out.push("21000000");
  if (al.includes("wei")) out.push("wei");
  if (al.includes("gwei")) out.push("gwei");

  out.push(...ruleAnswers(prompt));

  return unique(out);
}

async function getPuzzle() {
  const r = await axios.get(`${API}?eth=${WALLET}`, { headers });
  return r.data?.puzzle || null;
}

async function submitAnswer(puzzle, answer) {
  const final = normalize(answer);
  console.log("Trying Answer:", final);

  const r = await axios.post(
    API,
    {
      eth_address: WALLET,
      agent_name: AGENT,
      puzzle_id: puzzle.id,
      answer: final,
    },
    { headers }
  );

  console.log("Result:", r.data);
  return r.data;
}

async function tryAnswers(puzzle, answers, label) {
  const candidates = unique(answers);
  if (!candidates.length) return false;

  console.log(`${label} Candidates:`, candidates);

  for (const ans of candidates) {
    try {
      const result = await submitAnswer(puzzle, ans);

      if (result?.correct === true) {
        console.log(`SUCCESS ${label}:`, ans);
        solved.add(puzzle.id);
        return true;
      }

      await sleep(1200);
    } catch (e) {
      const status = e.response?.status;
      console.log(`${label} Submit Error:`, e.response?.data || e.message);
      await sleep(status === 429 ? 12000 : 2500);
    }
  }

  return false;
}

async function solvePuzzle(puzzle) {
  if (!puzzle?.id || solved.has(puzzle.id)) return true;

  const rules = ruleAnswers(puzzle.prompt);
  if (await tryAnswers(puzzle, rules, "RULE")) return true;

  console.log("No rule worked. Asking AI...");

  const ai = await askAI(puzzle.prompt);
  console.log("AI Answer:", ai);

  const candidates = aiVariants(puzzle.prompt, ai);
  if (await tryAnswers(puzzle, candidates, "AI")) return true;

  console.log("All candidates failed.");
  return false;
}

async function main() {
  console.log("NOCOIN bot started");
  console.log("Wallet:", WALLET);
  console.log("Agent:", AGENT);

  while (true) {
    try {
      console.log("\nFetching puzzle...");

      const puzzle = await getPuzzle();

      if (!puzzle) {
        console.log("No puzzle found");
        await sleep(10000);
        continue;
      }

      console.log("Puzzle ID:", puzzle.id);
      console.log("Category:", puzzle.category);
      console.log("Prompt:", puzzle.prompt);

      await solvePuzzle(puzzle);
      await sleep(4000);
    } catch (e) {
      console.log("MAIN ERROR:", e.response?.data || e.message);
      await sleep(10000);
    }
  }
}

main();
