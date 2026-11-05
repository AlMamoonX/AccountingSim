"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AiWorking, ChoiceGroup } from "@/components/ui/client";
import { PageTitle } from "@/components/ui/bits";
import { generateSimAction } from "@/app/actions/sim";

export default function NewSimPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(fd: FormData) {
    setBusy(true);
    setError(null);
    const r = await generateSimAction(fd).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (r.ok) router.push(`/t/sims/${r.id}`);
    else {
      setBusy(false);
      setError(r.error);
    }
  }

  return (
    <div className="stack">
      <PageTitle title="Create a simulation" sticker="AI" sub="Describe the company and what students should practise. The AI designs the decisions, the events and the monthly books." />
      {busy ? (
        <AiWorking steps={["Reading your slides…", "Designing the company…", "Writing the monthly books…", "Playing it 20 times to check…"]} />
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(new FormData(e.currentTarget));
          }}
        >
          <section className="card hero">
            <label className="field">
              <span className="card-title">Describe the simulation you want</span>
              <textarea
                className="textarea"
                name="prompt"
                rows={5}
                placeholder="e.g. A bakery in Nizwa over 4 months. Students choose prices, how much flour to buy and whether to hire a second baker. Practise inventory, a bank loan and depreciation."
              />
            </label>
          </section>
          <section className="card stack">
            <h2>Helpers (optional)</h2>
            <div className="grid-2">
              <label className="field">
                <span className="label">Business idea</span>
                <input className="input" name="business" placeholder="Leave empty: the AI invents an Omani business" />
              </label>
              <label className="field">
                <span className="label">Number of months</span>
                <input className="input num" name="months" type="number" min={2} max={12} defaultValue={4} />
              </label>
              <label className="field">
                <span className="label">Topics to practise</span>
                <input className="input" name="topics" placeholder="inventory, depreciation, loans, credit sales" />
              </label>
              <label className="field">
                <span className="label">Decisions you'd like</span>
                <input className="input" name="decisionIdeas" placeholder="price, stock to buy, marketing, hire staff" />
              </label>
            </div>
            <label className="field">
              <span className="label">Event ideas</span>
              <input className="input" name="eventIdeas" placeholder="supplier price rise, Ramadan rush, customer doesn't pay" />
            </label>
            <ChoiceGroup
              name="difficulty"
              label="Difficulty"
              defaultValue="medium"
              options={[
                { value: "easy", title: "Easy", text: "Few decisions, simple books" },
                { value: "medium", title: "Medium", text: "Some trade-offs and traps" },
                { value: "hard", title: "Hard", text: "More accounts, tricky months" },
              ]}
            />
            <label className="check-row">
              <input type="checkbox" name="useLibrary" defaultChecked /> Use my lecture slides as the reference
            </label>
          </section>
          {error && (
            <p className="alert warn" role="alert">
              {error}
            </p>
          )}
          <div>
            <button className="btn btn-special" type="submit">
              ✦ Generate simulation
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
