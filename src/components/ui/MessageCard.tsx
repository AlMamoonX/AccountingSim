import Link from "next/link";

export function MessageCard({ title, text, sticker, action }: { title: string; text: string; sticker: string; action: { href: string; label: string } }) {
  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <div className="card hero rise" style={{ marginTop: "18vh" }}>
        <div className="stack-sm">
          <span className="sticker" style={{ alignSelf: "flex-start" }}>{sticker}</span>
          <h2 style={{ fontSize: 40 }}>{title}</h2>
          <p className="lead muted">{text}</p>
          <div><Link className="btn btn-primary" href={action.href}>{action.label}</Link></div>
        </div>
      </div>
    </main>
  );
}
