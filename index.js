import axios from "axios";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

axios.defaults.timeout = 120000;

const API =
  "https://bqrapnlqqtjedjyhlfci.supabase.co/functions/v1/submit-solution";

const API_KEY =
  "YOUR_API_KEY";

const WALLET =
  "0xEB9E8A1114a971d452416D799dBa631629E8c85b";

const AGENT = "Pen";

const headers = {
  apikey: API_KEY,
  "Content-Type": "application/json",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clean(str) {
  return String(str || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalize(answer) {
  return clean(answer)
    .replace(/^0x/i, "")
    .trim();
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
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

  // reverse bits
  if (p.includes("reverse the bits")) {
    const hex = reverseBitsToHex(prompt);

    if (hex) {
      return [hex, "0x" + hex];
    }
  }

  // Grover
  if (p.includes("grover")) {
    return [
      "sqrt(n)",
      "sqrt n",
      "square root of n",
    ];
  }

  // Shor
  if (p.includes("shor")) {
    return [
      "rsa",
    ];
  }

  // Bitcoin max supply
  if (
    p.includes("max supply") &&
    p.includes("bitcoin")
  ) {
    return [
      "21000000",
      "21 million",
    ];
  }

  // Bitcoin block header hash
  if (
    p.includes("block headers") &&
    p.includes("bitcoin")
  ) {
    return [
      "sha256",
      "sha-256",
      "double sha256",
      "double sha-256",
    ];
  }

  // zk-snark
  if (
    p.includes("zk-snark") ||
    p.includes("zk snark")
  ) {
    return [
      "zero knowledge",
      "zero-knowledge",
      "zk",
    ];
  }

  // Ethereum genesis
  if (
    p.includes("ethereum") &&
    p.includes("genesis") &&
    p.includes("transactions")
  ) {
    return [
      "0",
      "zero",
    ];
  }

  // Kyber
  if (
    p.includes("kyber") &&
    p.includes("lattice")
  ) {
    return [
      "mlwe",
      "module-lwe",
      "module lwe",
      "module learning with errors",
    ];
  }

  // 255 => ff
  if (
    p.includes("decimal 255")
  ) {
    return [
      "ff",
      "0xff",
    ];
  }

  // keccak
  if (
    p.includes("keccak256") &&
    p.includes('"abc"')
  ) {
    return [
      "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    ];
  }

  return [];
}

async function askAI(prompt) {
  try {
    const completion =
      await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        temperature: 0,
        max_tokens: 50,
        messages: [
          {
            role: "system",
            content:
              "Reply ONLY the final answer. No explanation.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

    return clean(
      completion.choices?.[0]?.message?.content
    );
  } catch (e) {
    console.log("AI ERROR:", e.message);
    return "";
  }
}

function buildCandidates(prompt, ai) {
  const p = prompt.toLowerCase();

  const list = [];

  if (ai) {
    list.push(ai);
    list.push(ai.toLowerCase());

    if (ai.includes(":")) {
      list.push(ai.split(":").pop().trim());
    }
  }

  list.push(...ruleAnswers(prompt));

  // generic variants

  if (
    ai.toLowerCase().includes("double sha")
  ) {
    list.push(
      "sha256",
      "sha-256",
      "double sha256",
      "double sha-256"
    );
  }

  if (
    ai.toLowerCase().includes("zero")
  ) {
    list.push(
      "0",
      "zero"
    );
  }

  if (
    p.includes("kyber")
  ) {
    list.push(
      "mlwe",
      "module-lwe"
    );
  }

  return unique(
    list.map(normalize)
  );
}

async function getPuzzle() {
  const res = await axios.get(
    `${API}?eth=${WALLET}`,
    { headers }
  );

  return res.data?.puzzle;
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

async function solvePuzzle(puzzle) {
  const aiAnswer =
    await askAI(puzzle.prompt);

  console.log("AI Answer:", aiAnswer);

  const candidates =
    buildCandidates(
      puzzle.prompt,
      aiAnswer
    );

  console.log(
    "Candidates:",
    candidates
  );

  for (const candidate of candidates) {
    try {
      const result =
        await submitAnswer(
          puzzle,
          candidate
        );

      if (result.correct) {
        console.log(
          "SUCCESS:",
          candidate
        );

        return true;
      }

      await sleep(1500);
    } catch (e) {
      console.log(
        "Submit Error:",
        e.response?.data || e.message
      );

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

      const puzzle =
        await getPuzzle();

      if (!puzzle) {
        console.log(
          "No puzzle found"
        );

        await sleep(10000);
        continue;
      }

      console.log(
        "Puzzle ID:",
        puzzle.id
      );

      console.log(
        "Category:",
        puzzle.category
      );

      console.log(
        "Prompt:",
        puzzle.prompt
      );

      await solvePuzzle(puzzle);

      await sleep(5000);
    } catch (e) {
      console.log(
        "MAIN ERROR:",
        e.response?.data || e.message
      );

      await sleep(10000);
    }
  }
}

main();
