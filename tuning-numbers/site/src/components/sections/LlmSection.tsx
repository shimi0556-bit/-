import { useEffect, useRef, useState } from "react";
import { Zap, RotateCcw, FlaskConical } from "lucide-react";
import { softmax, crossEntropy, softmaxCrossEntropyGrad } from "../../lib/ml";
import { usePrefersReducedMotion, useInView } from "../../lib/hooks";
import { Eyebrow, EqnRow, Reveal, TeachList } from "../ui";

/* Illustrative logits for the headline demo (softmax computed live in JS). */
const HEADLINE = [
  { token: "mat", logit: 3.05 },
  { token: "floor", logit: 1.32 },
  { token: "rug", logit: 0.86 },
  { token: "roof", logit: 0.31 },
  { token: "grass", logit: -0.1 },
  { token: "table", logit: -0.45 },
];

const START_Z = [2.0, 3.0, 1.0, 0.0];
const NUDGE_TOKENS = ["mat", "floor", "roof", "wall"];
const TRUE_IDX = 0;

/* Clearly-labeled hardcoded toy table (no live model). */
const TOY: Record<string, { token: string; p: number }[]> = {
  "the cat sat on the": [
    { token: "mat", p: 0.62 },
    { token: "rug", p: 0.14 },
    { token: "floor", p: 0.1 },
    { token: "sofa", p: 0.08 },
    { token: "roof", p: 0.06 },
  ],
  "i drink my coffee with": [
    { token: "milk", p: 0.41 },
    { token: "sugar", p: 0.33 },
    { token: "friends", p: 0.14 },
    { token: "cream", p: 0.12 },
  ],
  "the sky is": [
    { token: "blue", p: 0.58 },
    { token: "clear", p: 0.16 },
    { token: "grey", p: 0.14 },
    { token: "falling", p: 0.12 },
  ],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.?!,]/g, "")
    .replace(/_+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function Bar({
  token,
  prob,
  max,
  hot,
  shown,
  index,
}: {
  token: string;
  prob: number;
  max: number;
  hot?: boolean;
  shown: boolean;
  index: number;
}) {
  const pct = shown ? (prob / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span
        className={hot ? "token-hot rounded-md px-2 py-0.5 font-mono text-sm" : "font-mono text-sm text-cream-2"}
        style={{ minWidth: 64 }}
      >
        {token}
      </span>
      <div className="relative h-7 flex-1 overflow-hidden rounded-md" style={{ background: "rgba(238,241,255,0.05)" }}>
        <div
          className="h-full rounded-md transition-[width] duration-700 ease-out-expo"
          style={{
            width: `${pct}%`,
            transitionDelay: `${index * 70}ms`,
            background: hot
              ? "linear-gradient(90deg, rgba(255,45,155,0.5), var(--pink))"
              : "linear-gradient(90deg, rgba(0,229,255,0.35), var(--cyan))",
            boxShadow: hot ? "0 0 18px rgba(255,45,155,0.6)" : "0 0 14px rgba(0,229,255,0.4)",
          }}
        />
      </div>
      <span className="w-12 text-right font-mono text-sm tabular-nums text-cream">{prob.toFixed(2)}</span>
    </div>
  );
}

function HeadlineChart() {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>("0px");
  const shown = reduced || inView;
  const probs = softmax(HEADLINE.map((h) => h.logit));
  const rows = HEADLINE.map((h, i) => ({ token: h.token, prob: probs[i] }));
  const max = Math.max(...rows.map((r) => r.prob));
  const sum = rows.reduce((a, r) => a + r.prob, 0);
  return (
    <div ref={ref} className="glass p-5 sm:p-6">
      <div className="mb-4 font-display text-xl text-cream">
        “The cat sat on the <span className="neon-cyan">___</span>”
      </div>
      <div className="grid gap-2.5">
        {rows.map((r, i) => (
          <Bar
            key={r.token}
            token={r.token}
            prob={r.prob}
            max={max}
            hot={i === 0}
            shown={shown}
            index={i}
          />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-cream-3">
        <span>Next-token probabilities, after softmax</span>
        <span className="font-mono">Σ = {sum.toFixed(2)}</span>
      </div>
      <p className="illustrative mt-2">
        Illustrative values — hand-picked to teach the shape, not a real model's output. The bars are
        the real <span className="text-cream-2">softmax()</span> of those logits, computed live.
      </p>
    </div>
  );
}

function ScaleCounter() {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>("0px");
  const [val, setVal] = useState(2);
  const started = useRef(false);
  const TARGET = 175_000_000_000;

  useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;
    if (reduced) {
      setVal(TARGET);
      return;
    }
    const dur = 2600;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      // interpolate on a log scale so the small checkpoints are legible
      const lo = Math.log10(2);
      const hi = Math.log10(TARGET);
      setVal(Math.round(Math.pow(10, lo + (hi - lo) * e)));
      if (t < 1) requestAnimationFrame(tick);
      else setVal(TARGET);
    };
    requestAnimationFrame(tick);
  }, [inView, reduced]);

  const milestones = [
    { at: 2, label: "a line — 2 numbers" },
    { at: 50, label: "a small net — dozens" },
    { at: TARGET, label: "an LLM — hundreds of billions" },
  ];

  return (
    <div ref={ref} className="glass p-6 text-center">
      <div className="text-xs uppercase tracking-[0.16em] text-cream-3">parameters being trained</div>
      <div
        className="my-2 font-display text-[clamp(2rem,6vw,3.6rem)] tabular-nums neon-cyan"
        aria-live="polite"
      >
        {val.toLocaleString("en-US")}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {milestones.map((m) => (
          <span
            key={m.at}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-300"
            style={
              val >= m.at
                ? { color: "var(--cream)", background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.5)" }
                : { color: "var(--cream-3)", background: "rgba(238,241,255,0.04)", border: "1px solid rgba(238,241,255,0.12)" }
            }
          >
            {m.label}
          </span>
        ))}
      </div>
      <p className="mb-0 mt-4 text-cream-2">
        Same update rule at every scale. Only the count of numbers changed.
      </p>
    </div>
  );
}

function NudgeDemo() {
  const [z, setZ] = useState<number[]>([...START_Z]);
  const [steps, setSteps] = useState(0);
  const probs = softmax(z);
  const grad = softmaxCrossEntropyGrad(probs, TRUE_IDX);
  const loss = crossEntropy(probs, TRUE_IDX);
  const max = Math.max(...probs);

  const step = () => {
    const g = softmaxCrossEntropyGrad(softmax(z), TRUE_IDX);
    setZ((cur) => cur.map((zi, k) => zi - 0.5 * g[k]));
    setSteps((s) => s + 1);
  };
  const reset = () => {
    setZ([...START_Z]);
    setSteps(0);
  };

  return (
    <div className="glass p-5 sm:p-6">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="m-0 text-lg text-cream">One real gradient step</h3>
        <span className="text-right" aria-live="polite">
          <span className="block text-xs uppercase tracking-[0.12em] text-cream-3">loss (cross-entropy)</span>
          <span className="font-display text-xl tabular-nums neon-pink">{loss.toFixed(4)}</span>
        </span>
      </div>
      <p className="text-sm text-cream-3">
        Truth is <b className="text-cream">mat</b>, but the model favors <b>floor</b>. Press the
        button: <span className="font-mono">grad = p − onehot</span>, then <span className="font-mono">z −= η·grad</span> (η=0.5).
      </p>
      <div className="my-4 grid gap-2.5">
        {NUDGE_TOKENS.map((tk, i) => (
          <Bar key={tk} token={tk} prob={probs[i]} max={max} hot={i === TRUE_IDX} shown index={i} />
        ))}
      </div>
      <div
        className="mb-4 rounded-lg p-3 font-mono text-xs text-cream-2"
        style={{ background: "rgba(5,0,8,0.5)", border: "1px solid rgba(238,241,255,0.1)" }}
      >
        gradient ∂L/∂z ={" "}
        {grad.map((g, i) => (
          <span key={i} style={{ color: g < 0 ? "var(--cyan)" : "var(--pink)" }}>
            {g >= 0 ? "+" : ""}
            {g.toFixed(3)}
            {i < grad.length - 1 ? ", " : ""}
          </span>
        ))}
        <span className="text-cream-3"> — negative pushes that token up, positive pushes it down</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-sm text-cream-3">
          steps <span className="tabular-nums text-cream">{steps}</span>
        </span>
        <div className="flex gap-2">
          <button type="button" className="cta-primary px-5 py-2.5 text-sm" onClick={step}>
            <Zap size={15} /> Take one step
          </button>
          <button type="button" className="cta-ghost px-4 py-2.5 text-sm" onClick={reset}>
            <RotateCcw size={15} /> Reset
          </button>
        </div>
      </div>
      <p className="illustrative mt-3">
        Here the logits ARE the parameters, to keep it on one screen. In a real LLM
        these come out of billions of parameters; backprop carries this same{" "}
        <span className="text-cream-2">p − onehot</span> gradient all the way back. Logits illustrative.
      </p>
    </div>
  );
}

function ToyInput() {
  const [text, setText] = useState("The cat sat on the");
  const key = normalize(text);
  const hit = TOY[key];
  const max = hit ? Math.max(...hit.map((r) => r.p)) : 1;
  return (
    <div className="glass p-5 sm:p-6">
      <div className="mb-2 flex items-center gap-2">
        <FlaskConical size={16} className="text-cream-3" />
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-cream-3">
          Toy — hardcoded examples, not a live model
        </span>
      </div>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="type a demo sentence"
        className="w-full rounded-xl px-4 py-3 font-mono text-sm text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
        style={{ background: "rgba(5,0,8,0.55)", border: "1px solid rgba(0,229,255,0.25)" }}
        placeholder="The cat sat on the"
      />
      <div className="mt-2 text-xs text-cream-3">
        try: “The cat sat on the” · “I drink my coffee with” · “The sky is”
      </div>
      <div className="mt-4">
        {hit ? (
          <div className="grid gap-2.5">
            {hit.map((r, i) => (
              <Bar key={r.token} token={r.token} prob={r.p} max={max} hot={i === 0} shown index={i} />
            ))}
          </div>
        ) : (
          <p className="m-0 text-cream-2">
            No demo data for that sentence — this toy only knows a few hand-written examples.
          </p>
        )}
      </div>
    </div>
  );
}

export function LlmSection() {
  const teach = [
    {
      heading: "Text is just “what comes next?”",
      body: (
        <>
          An LLM reads a stretch of text and answers one question: what's the next chunk? That chunk
          is a <b>token</b> (a word or piece of a word). It scores every token it knows, then turns
          the scores into probabilities. Predicting the next token, over and over, is the whole job.
        </>
      ),
    },
    {
      heading: "Scores → probabilities: softmax.",
      body: (
        <>
          The last layer emits one raw number per token — a <b>logit</b>. Softmax exponentiates each
          and divides by the total, giving a probability for every token, all positive and summing to
          1. Bigger logit → bigger share.
        </>
      ),
    },
    {
      heading: "The loss is surprise: cross-entropy.",
      body: (
        <>
          Level 1 used squared error. For next-token prediction we measure how <i>surprised</i> the
          model was by the word that actually came next: <b>L = −log(p_true)</b>. Gave the truth
          probability 1 → zero surprise. Gave it a tiny chance → huge surprise. Same spirit as MSE,
          different formula.
        </>
      ),
    },
    {
      heading: "The gradient: predicted minus truth.",
      body: (
        <>
          Cross-entropy through softmax has a beautifully clean gradient on each logit:{" "}
          <b>∂L/∂z = p − onehot</b> — where the <i>one-hot</i> is just 1 at the true token and 0
          everywhere else. So for the true token the gradient is negative (push it up); for every
          other token it's positive (push it down). That's the entire correction signal.
        </>
      ),
    },
    {
      heading: "The only thing that changed is scale.",
      body: (
        <>
          Line: 2 numbers. Small net: dozens. LLM: hundreds of billions. The prediction got richer and
          the loss swapped to cross-entropy — but the update is byte-for-byte identical:{" "}
          <b>θ := θ − η·∂L/∂θ</b>. The Level-1 nudge, composed billions of times.
        </>
      ),
    },
  ];

  return (
    <section id="llm" className="sec sec-llm">
      <div className="blob blob-cyan" style={{ bottom: "-10%", left: "-8%" }} aria-hidden="true" />
      <div className="blob blob-pink" style={{ top: "-8%", right: "-6%" }} aria-hidden="true" />
      <div className="container">
        <Reveal>
          <Eyebrow>billions of the same nudge</Eyebrow>
          <h2 className="neon">
            <span className="block">Same Nudge.</span>
            <span className="block">Billions Of</span>
            <span className="block neon-cyan">Numbers.</span>
          </h2>
          <p className="max-w-2xl text-cream-2">
            An LLM never sees “words.” It sees numbers, and it does one thing: guess the next chunk of
            text. It learns that guess with the exact gradient descent you just ran by hand — only now
            there are hundreds of billions of numbers to nudge instead of two.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <Reveal>
            <HeadlineChart />
          </Reveal>
          <div>
            <TeachList beats={teach.slice(0, 3)} hue="cyan" />
          </div>
        </div>

        <Reveal className="mt-8">
          <ScaleCounter />
        </Reveal>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <Reveal>
            <NudgeDemo />
          </Reveal>
          <div>
            <TeachList beats={teach.slice(3)} hue="cyan" />
            <Reveal className="mt-6">
              <EqnRow
                label="softmax — scores to probabilities"
                tex="p_k = \dfrac{e^{z_k}}{\sum_{j} e^{z_j}}"
                plain="each token's probability is its exponentiated logit over the sum of all — positive, summing to 1."
              />
              <EqnRow
                label="in real code — subtract the max first"
                tex="p_k = \dfrac{e^{z_k - m}}{\sum_{j} e^{z_j - m}}, \quad m = \max_j z_j"
                plain="identical result, but never overflows. (Our softmax() does exactly this.)"
              />
              <EqnRow
                label="loss — cross-entropy (surprise)"
                tex="L = -\log p_t"
                plain="minus the log of the probability given to the true token t; tiny p_t → big loss."
              />
              <EqnRow
                label="the clean gradient"
                tex="\dfrac{\partial L}{\partial z_k} = p_k - \mathbb{1}[k = t]"
                plain="predicted probability minus the truth indicator 𝟙 (1 at the true token t, 0 elsewhere) — push the true token up, the rest down."
              />
            </Reveal>
          </div>
        </div>

        <Reveal className="mt-8">
          <ToyInput />
        </Reveal>

        <Reveal className="mt-10">
          <p className="max-w-3xl text-lg text-cream">
            Two numbers or two hundred billion, the move never changed: measure how wrong, then nudge.{" "}
            <b className="neon-cyan">That single line is what “training” means — at every scale.</b>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
