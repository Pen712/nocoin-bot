import Groq from "groq-sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { keccak256, toUtf8Bytes } from "ethers";
import readline from "readline";

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const openrouter = process.env.OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    })
  : null;

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

function clean(x) {
  return String(x || "").trim().replace(/\s+/g, " ");
}

function normalize(x) {
  return clean(x)
    .toLowerCase()
    .replace(/^0x/i, "")
    .replace(/[.,!?]/g, "")
    .replace(/bip[\s-]?(\d+)/gi, "bip$1")
    .replace(/eip[\s-]?(\d+)/gi, "eip$1")
    .replace(/sha[\s-]?256/gi, "sha256")
    .replace(/zero[\s-]?knowledge/gi, "zeroknowledge")
    .replace(/module[\s-]?lwe/gi, "modulelwe")
    .replace(/\s+/g, "");
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean).map((x) => clean(x)))];
}

function reverseBitsToHex(prompt) {
  const m = prompt.match(/0b[01]+/i);
  if (!m) return null;

  const bits = m[0].replace(/0b/i, "");
  return parseInt(bits.split("").reverse().join(""), 2).toString(16);
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

  const rev = reverseBitsToHex(prompt);
  if (p.includes("reverse the bits") && rev) out.push(rev, "0x" + rev);

  const powHex = powerMinusOneHex(prompt);
  if (p.includes("2^") && p.includes("hex") && powHex) out.push(powHex, "0x" + powHex);

  const decHex = decimalToHex(prompt);
  if (p.includes("decimal") && p.includes("hex") && decHex) out.push(decHex, "0x" + decHex);

  if (p.includes("hierarchical deterministic wallets")) out.push("bip32", "bip-32", "bip 32");
  if (p.includes("mnemonic")) out.push("bip39", "bip-39", "bip 39");
  if (p.includes("schnorr") && p.includes("aggregate")) out.push("addition", "scalar addition", "add");
  if (p.includes("kyber") && p.includes("lattice")) out.push("mlwe", "module-lwe", "module lwe");
  if (p.includes("ethereum") && p.includes("genesis") && p.includes("transactions")) out.push("0", "zero");
  if (p.includes("bitcoin") && p.includes("block headers")) out.push("sha256", "double sha256");
  if (p.includes("zk-snark") || p.includes("zk snark")) out.push("zero knowledge", "zero-knowledge", "zk");
  if (p.includes("shor")) out.push("rsa");
  if (p.includes("grover")) out.push("sqrt(n)", "sqrt n");
  if (p.includes("smallest unit") && p.includes("eth")) out.push("wei");
  if (p.includes("chain id") && p.includes("base")) out.push("8453");
  if (p.includes("max supply") && p.includes("bitcoin")) out.push("21000000");
  if (p.includes("bitcoin whitepaper")) out.push("2008");

  return unique(out);
}

function makePrompt(prompt) {
  return `Answer ONLY the final short answer. No explanation. Lowercase if possible.\n\n${prompt}`;
}

async function askGemini(prompt) {
  if (!gemini) return "";
  try {
    const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(makePrompt(prompt));
    return clean(result.response.text());
  } catch (e) {
    console.log("Gemini error:", e.message);
    return "";
  }
}

async function askOpenRouter(prompt) {
  if (!openrouter) return "";
  try {
    const res = await openrouter.chat.completions.create({
      model: "deepseek/deepseek-r1:free",
      temperature: 0,
      max_tokens: 60,
      messages: [{ role: "user", content: makePrompt(prompt) }],
    });
    return clean(res.choices?.[0]?.message?.content || "");
  } catch (e) {
    console.log("OpenRouter error:", e.message);
    return "";
  }
}

async function askGroq(prompt) {
  if (!groq) return "";
  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0,
      max_tokens: 60,
      messages: [{ role: "user", content: makePrompt(prompt) }],
    });
    return clean(res.choices?.[0]?.message?.content || "");
  } catch (e) {
    console.log("Groq error:", e.message);
    return "";
  }
}

function aiVariants(prompt, ai) {
  const p = prompt.toLowerCase();
  const a = clean(ai);
  const al = a.toLowerCase();
  const out = [];

  if (a) out.push(a, al);
  if (a.includes(":")) out.push(a.split(":").pop().trim());
  if (a.includes("=")) out.push(a.split("=").pop().trim());

  if (al.includes("double sha")) out.push("sha256", "double sha256");
  if (al.includes("zero knowledge") || al.includes("zero-knowledge")) out.push("zero knowledge", "zk");
  if (al.includes("ring-lwe") && p.includes("kyber")) out.push("mlwe", "module-lwe");
  if (al.includes("ecdsa") && p.includes("schnorr")) out.push("addition");
  if (al.includes("rsa")) out.push("rsa");
  if (al.includes("sqrt")) out.push("sqrt(n)");
  if (al.includes("wei")) out.push("wei");
  if (al.includes("bip 32") || al.includes("bip-32")) out.push("bip32");
  if (al.includes("bip 39") || al.includes("bip-39")) out.push("bip39");

  out.push(...ruleAnswers(prompt));
  return unique(out);
}

async function solve(prompt) {
  const rules = ruleAnswers(prompt);
  if (rules.length) return rules;

  const g = await askGemini(prompt);
  if (g) return aiVariants(prompt, g);

  const o = await askOpenRouter(prompt);
  if (o) return aiVariants(prompt, o);

  const gr = await askGroq(prompt);
  if (gr) return aiVariants(prompt, gr);

  return [];
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("Crypto quiz solver started.");
console.log("Nhập câu hỏi, Enter để giải:");

rl.on("line", async (line) => {
  const answers = await solve(line);
  console.log("Answers:", answers);
  console.log("Normalized:", answers.map(normalize));
});
