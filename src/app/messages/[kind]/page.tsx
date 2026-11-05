import { MessageCard } from "@/components/ui/MessageCard";

const MESSAGES: Record<string, { title: string; text: string; sticker: string; action: { href: string; label: string } }> = {
  "no-access": { title: "You don't have access to this page.", text: "This page is for another kind of account.", sticker: "Hmm", action: { href: "/", label: "Go to my home" } },
  "not-found": { title: "This page doesn't exist.", text: "The link may be old or mistyped.", sticker: "404", action: { href: "/", label: "Go to my home" } },
  deadline: { title: "The deadline has passed.", text: "This assignment can't be handed in any more.", sticker: "Closed", action: { href: "/s", label: "Back to my assignments" } },
  "signed-out": { title: "You've been signed out, please sign in again.", text: "For safety, sessions end after a while.", sticker: "Bye", action: { href: "/login", label: "Sign in" } },
};

export default async function MessagePage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const m = MESSAGES[kind] ?? MESSAGES["not-found"];
  return <MessageCard {...m} />;
}
