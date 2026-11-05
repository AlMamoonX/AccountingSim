import { PageTitle } from "@/components/ui/bits";
import { env } from "@/lib/env";
import { CreateForm } from "./CreateForm";

export default function NewExercisePage() {
  return (
    <div className="stack">
      <PageTitle title="Create an exercise" sticker="AI" sub="Describe what you want students to practise. Everything below the box is optional." />
      {!env.aiKey && (
        <p className="alert warn rise rise-2">
          The AI isn&apos;t set up yet (DEEPSEEK_API_KEY is missing on the server). You can still try the app with the Karak sample on the Exercises page.
        </p>
      )}
      <CreateForm vision={env.aiVision} />
    </div>
  );
}
