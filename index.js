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

function clean(answer) {
  return String(answer)
    .trim()
    .replace(/\s+/g, " ");
}

function submitClean(answer) {
  return String(answer)
    .trim()
    .replace(/^0x/i, "");
}

function reverseBitsToHex(prompt) {
  const match = prompt.match(/0b[01]+/i);
  if (!match) return null;

  const bits = match[0].replace(/0b/i, "");
  const reversed = bits.split("").reverse().join("");
  return parseInt(reversed, 2).toString(16);
}

function ruleSolve(prompt) {
  const p = prompt.toLowerCase();

  if (p.includes("reverse the bits")) {
    return reverseBitsToHex(prompt);
  }

  if (p.includes("shor")) return "rsa";
  if (p.includes("grover")) return "sqrt(n)";
  if (p.includes("zk-snark") || p.includes("zk snark")) return "zero knowledge";
  if (p.includes("hex value of decimal 255")) return "ff";
  if (p.includes("max supply") && p.includes("bitcoin")) return "21000000";
  if (p.includes("bitcoin whitepaper")) return "2008";
  if (p.includes("sha-256") && p.includes("empty string")) return "e3b0c4";
  if (p.includes("post-quantum signature") && p.includes("nist")) return "dilithium";

  return null;
}

async function askAI(prompt) {
  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0,
      max_tokens: 25,
      messages: [
        {
          role: "system",
          content:
            "Solve the puzzle. Reply ONLY the final answer. No explanation. Keep it short.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    return clean(completion.choices[0]?.message?.content || "");
  } catch (e) {
    console.log("AI ERROR:", e.message);
    return null;
  }
}

function fixAIAnswer(prompt, aiAnswer) {
  const p = prompt.toLowerCase();
  const a = clean(aiAnswer || "");
  const al = a.toLowerCase();

  if (p.includes("zk-snark") || p.includes("zk snark")) return "zero knowledge";
  if (p.includes("shor")) return "rsa";
  if (p.includes("grover")) return "sqrt(n)";

  if (al.includes("zero knowledge") || al.includes("zero-knowledge")) {
    return "zero knowledge";
  }

  if (al.includes("rsa")) return "rsa";
  if (al.includes("21 million") || al.includes("21000000")) return "21000000";
  if (al.includes("sqrt")) return "sqrt(n)";
  if (al.includes("dilithium")) return "dilithium";

  return a;
}

async function solvePuzzle(prompt) {
  const rule = ruleSolve(prompt);
  if (rule) return rule;

  const aiAnswer = await askAI(prompt);
  console.log("AI Answer:", aiAnswer);

  return fixAIAnswer(prompt, aiAnswer);
}

async function main() {
  console.log("NOCOIN bot started");
  console.log("Wallet:", WALLET);
  console.log("Agent:", AGENT);

  while (true) {
    try {
      console.log("Fetching puzzle...");

      const res = await axios.get(`${API}?eth=${WALLET}`, { headers });
      const puzzle = res.data?.puzzle;

      if (!puzzle) {
        console.log("No puzzle found");
        await sleep(10000);
        continue;
      }

      console.log("Puzzle ID:", puzzle.id);
      console.log("Category:", puzzle.category);
      console.log("Prompt:", puzzle.prompt);

      const answer = await solvePuzzle(puzzle.prompt);
      const final = submitClean(answer);

      console.log("Submit Answer:", final);

      const submit = await axios.post(
        API,
        {
          eth_address: WALLET,
          agent_name: AGENT,
          puzzle_id: puzzle.id,
          answer: final,
        },
        { headers }
      );

      console.log("Result:", submit.data);

      await sleep(5000);
    } catch (err) {
      console.log("ERROR:", err.response?.data || err.message);
      await sleep(10000);
    }
  }
}

main();
