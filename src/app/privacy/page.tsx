import Link from "next/link";

export const metadata = { title: "Privacy" };

/** What RepWon keeps about players, in plain words for players and parents. */
export default function Privacy() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-8 text-sm leading-relaxed">
      <Link href="/" className="text-muted underline">
        RepWon Install
      </Link>
      <h1 className="text-4xl">Privacy for players and parents</h1>
      <p>RepWon helps a football team learn its playbook. Your coach sets up the team and approves everything you study.</p>
      <h2 className="text-2xl">What RepWon keeps about a player</h2>
      <ul className="list-inside list-disc">
        <li>The name and positions your coach enters (first name and last initial is enough), and a jersey number if your coach adds one.</li>
        <li>Your answers to quiz questions, how long they took, and when each question comes back for review.</li>
        <li>Which lessons you&apos;ve read, questions you ask about the playbook, and questions you flag as wrong.</li>
      </ul>
      <p>
        Players don&apos;t make an account: no email, password, birthday, phone number, address or photo is asked for. You join with your team&apos;s code and pick your
        name.
      </p>
      <h2 className="text-2xl">Who sees it</h2>
      <p>Only your team&apos;s coaches. Other teams never see your name or answers. RepWon doesn&apos;t sell data or show ads.</p>
      <p>
        When you type an answer in your own words or ask the playbook a question, the text is sent to Anthropic&apos;s Claude AI to grade or answer it. Your name isn&apos;t
        sent with it.
      </p>
      <h2 className="text-2xl">Deleting it</h2>
      <p>Your coach can delete a player and everything about them at any time. Ask your coach, or have a parent ask.</p>
    </main>
  );
}
