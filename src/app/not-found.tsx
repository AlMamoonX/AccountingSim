import { MessageCard } from "@/components/ui/MessageCard";

export default function NotFound() {
  return <MessageCard title="This page doesn't exist." text="The link may be old or mistyped." sticker="404" action={{ href: "/", label: "Go to my home" }} />;
}
