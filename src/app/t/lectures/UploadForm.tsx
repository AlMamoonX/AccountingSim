"use client";

import { useRef, useState } from "react";
import { DropZone, Toast } from "@/components/ui/client";
import { uploadLectures } from "@/app/actions/teacher";

export function UploadForm() {
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [zoneKey, setZoneKey] = useState(0);

  async function submit(fd: FormData) {
    setBusy(true);
    setError(null);
    const r = await uploadLectures(fd).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setBusy(false);
    if (r.ok) {
      form.current?.reset();
      setCount(0);
      setZoneKey((k) => k + 1);
      setToast(`${r.count} ${r.count === 1 ? "file" : "files"} added`);
      setTimeout(() => setToast(null), 2500);
    } else setError(r.error);
  }

  return (
    <form
      ref={form}
      className="stack-sm rise rise-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(new FormData(e.currentTarget));
      }}
    >
      <DropZone
        key={zoneKey}
        name="files"
        multiple
        accept=".pdf,.pptx,.png,.jpg,.jpeg,.webp"
        title="Drop lecture files here"
        text="PDF, PowerPoint (.pptx) or images · up to 25 MB each"
        onFiles={(f) => setCount(f.length)}
      />
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "1 1 220px" }}>
          <span className="label">Lecture (optional)</span>
          <input className="input" name="lecture" placeholder="e.g. Lecture 5" />
        </label>
        <button className="btn btn-teal" type="submit" disabled={busy || count === 0}>
          {busy ? "Reading files…" : `Upload${count ? ` ${count}` : ""}`}
        </button>
      </div>
      {error && (
        <p className="alert warn" role="alert">
          {error}
        </p>
      )}
      <Toast message={toast} />
    </form>
  );
}
