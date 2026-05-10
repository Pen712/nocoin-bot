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
  return String(answer).trim().replace(/\s+/g, " ");
}

function submitClean(answer) {
  return String(answer).trim().replace(/^0x/i, "");
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
    const ans = reverseBitsToHex(prompt);
    return ans ? [ans, "0x" + ans] : [];
  }

  if (p.includes("hash function does bitcoin use")) {
    return ["sha256", "sha-256", "double sha256", "double sha-256"];
  }

  if (p.includes("zk-snark") || p.includes("zk snark")) {
    return ["zero knowledge", "zero-knowledge", "zk"];
  }

  if (p.includes("shor")) return ["rsa"];
  if (p.includes("grover")) return ["sqrt(n)", "sqrt n", "square root n"];
  if (p.includes("hex value of decimal 255")) return ["ff", "0xff"];
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
      max_tokens: 30,
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

function aiVariants(prompt, aiAnswer) {
  const p = prompt.toLowerCase();
  const a = clean(aiAnswer || "");
  const al = a.toLowerCase();

  const list = [];

  if (a) list.push(a);
  if (al) list.push(al);

  if (al.includes("double sha")) list.push("sha256", "sha-256", "double sha256", "double sha-256");
  if (al.includes("sha-256") || al.includes("sha256")) list.push("sha256", "sha-256");
  if (al.includes("zero knowledge") || al.includes("zero-knowledge")) {
    list.push("zero knowledge", "zero-knowledge", "zk");
  }
  if (al.includes("rsa")) list.push("rsa");
  if (al.includes("sqrt")) list.push("sqrt(n)", "sqrt n");
  if (al.includes("21 million")) list.push("21000000");

  if (p.includes("zk-snark")) list.push("zero knowledge", "zero-knowledge", "zk");
  if (p.includes("bitcoin") && p.includes("block headers")) {
    list.push("sha256", "sha-256", "double sha256", "double sha-256");
  }

  return list;
}

function unique(list) {
  return [...new Set(list.filter(Boolean).map(submitClean))];
}

async function getPuzzle() {
  const res = await axios.get(`${API}?eth=${WALLET}`, { headers });
  return res.data?.puzzle || null;
}

async function submitAnswer(puzzle, answer) {
  const final = submitClean(answer);

  console.log("Trying Answer:", final);

  const res = await axios.post(
    API,
    {
      eth_address: WALLET,
      agent_name: AGENT,
      puzzle_id: puzzle.id,
      answer: final,
    },
    { headers }
  );

  console.log("Result:", res.data);
  return res.data;
}

async function solveAndSubmit(puzzle) {
  const ruleList = ruleAnswers(puzzle.prompt);
  const aiAnswer = await askAI(puzzle.prompt);

  console.log("AI Answer:", aiAnswer);

  const answers = unique([
    ...ruleList,
    ...aiVariants(puzzle.prompt, aiAnswer),
  ]);

  console.log("Candidates:", answers);

  for (const ans of answers) {
    try {
      const result = await submitAnswer(puzzle, ans);

      if (result?.correct === true) {
        console.log("SUCCESS:", ans);
        return true;
      }

      await sleep(1500);
    } catch (err) {
      console.log("Submit error:", err.response?.data || err.message);
      await sleep(3000);
    }
  }

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

      await solveAndSubmit(puzzle);

      await sleep(5000);
    } catch (err) {
      console.log("ERROR:", err.response?.data || err.message);
      await sleep(10000);
    }
  }
}

main();
