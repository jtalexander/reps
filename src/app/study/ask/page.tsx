import Link from "next/link";
import { requirePlayer } from "@/server/player-session";
import { AskBox } from "./ask-box";

export const metadata = { title: "Ask the playbook" };

export default async function Ask() {
  await requirePlayer();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-5">
      <Link href="/study" className="text-sm text-muted underline">
        Back
      </Link>
      <h1 className="text-4xl">Ask the playbook</h1>
      <p className="text-sm text-muted">Answers come only from what your coach approved, with the page they came from. Your coach can see the questions asked.</p>
      <AskBox />
    </main>
  );
}
