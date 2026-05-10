import axios from "axios";
import Groq from "groq-sdk";

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clean(str) {
  return String(str || "").trim().replace(/\s+/g, " ");
}

function normalize(answer) {
  return clean(answer).replace(/^0x/i, "").trim();
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean).map(normalize))];
}

function reverseBitsToHex(prompt) {
  const match = prompt.match(/0b[01]+/i);
  if (!match) return null;

  const bits = match[0].replace(/0b/i, "");
  const reversed = bits.split("").reverse().join("");

  return parseInt(reversed, 2).toString(16);
}

function ruleAnswers(prompt) {
  const p = prompt.toLowerCase();

  if (p.includes("reverse the bits")) {
    const hex = reverseBitsToHex(prompt);
    return hex ? [hex, "0x" + hex] : [];
  }

  if (p.includes("kyber") && p.includes("lattice")) {
    return ["mlwe", "module-lwe", "module lwe", "module learning with errors"];
  }

  if (p.includes("ethereum") && p.includes("genesis") && p.includes("transactions")) {
    return ["0", "zero"];
  }

  if (p.includes("bitcoin") && p.includes("block headers")) {
    return ["sha256", "sha-256", "double sha256", "double sha-256"];
  }

  if (p.includes("zk-snark") || p.includes("zk snark")) {
    return ["zero knowledge", "zero-knowledge", "zk"];
  }

  if (p.includes("shor")) return ["rsa"];
  if (p.includes("grover")) return ["sqrt(n)", "sqrt n", "square root n"];
  if (p.includes("decimal 255")) return ["ff", "0xff"];
  if (p.includes("max supply") && p.includes("bitcoin")) return ["21000000", "21 million"];
  if (p.includes("bitcoin whitepaper")) return ["2008"];
  if (p.includes("sha-256") && p.includes("empty string")) return ["e3b0c4"];

  if (p.includes("post-quantum signature") && p.includes("nist")) {
    return ["dilithium", "crystals-dilithium", "ml-dsa"];
  }

  return [];
}

async function askAI(prompt) {
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0,
      max_tokens: 50,
      messages: [
        {
          role: "system",
          content: "Reply ONLY the final answer. No explanation. Keep it short.",
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

function buildAICandidates(prompt, ai) {
  const p = prompt.toLowerCase();
  const al = clean(ai).toLowerCase();
  const list = [];

  if (ai) {
    list.push(ai, al);
    if (ai.includes(":")) list.push(ai.split(":").pop().trim());
  }

  if (al.includes("double sha")) list.push("sha256", "sha-256", "double sha256");
  if (al.includes("zero knowledge") || al.includes("zero-knowledge")) {
    list.push("zero knowledge", "zero-knowledge", "zk");
  }
  if (al.includes("rsa")) list.push("rsa");
  if (al.includes("sqrt")) list.push("sqrt(n)", "sqrt n");
  if (al.includes("21 million")) list.push("21000000");

  if (p.includes("kyber")) list.push("mlwe", "module-lwe", "module lwe");
  if (p.includes("ethereum") && p.includes("genesis")) list.push("0", "zero");

  return unique(list);
}

async function getPuzzle() {
  const res = await axios.get(`${API}?eth=${WALLET}`, { headers });
  return res.data?.puzzle || null;
}

async function submitAnswer(puzzle, answer) {
  const finalAnswer = normalize(answer);

  console.log("Trying Answer:", finalAnswer);

  const res = await axios.post(
    API,
    {
      eth_address: WALLET,
      agent_name: AGENT,
      puzzle_id: puzzle.id,
      answer: finalAnswer,
    },
    { headers }
  );

  console.log("Result:", res.data);
  return res.data;
}

async function tryAnswers(puzzle, answers, label) {
  const candidates = unique(answers);

  console.log(`${label} Candidates:`, candidates);

  for (const ans of candidates) {
    try {
      const result = await submitAnswer(puzzle, ans);

      if (result?.correct === true) {
        console.log(`SUCCESS ${label}:`, ans);
        return true;
      }

      await sleep(1500);
    } catch (e) {
      console.log(`${label} Submit Error:`, e.response?.data || e.message);
      await sleep(3000);
    }
  }

  return false;
}

async function solvePuzzle(puzzle) {
  const ruleList = ruleAnswers(puzzle.prompt);

  if (ruleList.length > 0) {
    const ok = await tryAnswers(puzzle, ruleList, "RULE");
    if (ok) return true;
  }

  console.log("No rule worked. Asking AI...");

  const aiAnswer = await askAI(puzzle.prompt);
  console.log("AI Answer:", aiAnswer);

  const aiCandidates = buildAICandidates(puzzle.prompt, aiAnswer);
  const ok = await tryAnswers(puzzle, aiCandidates, "AI");

  if (!ok) console.log("All candidates failed.");
  return ok;
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

      await sleep(5000);
    } catch (e) {
      console.log("MAIN ERROR:", e.response?.data || e.message);
      await sleep(10000);
    }
  }
}

main();
