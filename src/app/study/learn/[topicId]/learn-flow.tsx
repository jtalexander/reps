"use client";
import Link from "next/link";
import { useState } from "react";
import { PageView } from "@/components/page-view";
import { QuestionRunner } from "@/components/question-runner";
import type { PageRef } from "@/teach/page-images";
import type { PublicQuestion } from "@/teach/service";
import { AUDIENCE_LABEL } from "@/teach/types";
import { LessonBody } from "@/app/t/[teamId]/teach/review/review-queue";
import { completeLessonsAction } from "../../teach-actions";

interface Lesson {
  id: string;
  title: string;
  body: string;
  audience: string;
  sourcePages: number[];
}

/** Learn, then check: read the lessons, then answer a few questions on them. */
export function LearnFlow({ lessons, check, pages }: { lessons: Lesson[]; check: PublicQuestion[]; pages: Record<number, PageRef> }) {
  const [step, setStep] = useState<"read" | "check" | "done">(lessons.length ? "read" : "check");
  const [openPage, setOpenPage] = useState<number | null>(null);

  if (lessons.length === 0 && check.length === 0) return <p className="card p-4 text-sm text-muted">Nothing approved for your position here yet.</p>;

  if (step === "read")
    return (
      <div className="flex flex-col gap-4">
        {lessons.map((l) => (
          <article key={l.id} className="card flex flex-col gap-2 p-4">
            <div className="text-xs text-muted">{AUDIENCE_LABEL[l.audience as keyof typeof AUDIENCE_LABEL] ?? l.audience}</div>
            <h2 className="text-lg font-semibold">{l.title}</h2>
            <LessonBody text={l.body} />
            {l.sourcePages.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                {l.sourcePages.map((p) =>
                  pages[p] ? (
                    <button key={p} className="underline" onClick={() => setOpenPage(openPage === p ? null : p)}>
                      {openPage === p ? "Hide" : "See"} playbook page {p}
                    </button>
                  ) : null,
                )}
              </div>
            )}
            {openPage && l.sourcePages.includes(openPage) && pages[openPage] && (
              <PageView url={pages[openPage].url} width={pages[openPage].width} height={pages[openPage].height} className="w-full rounded border border-line" />
            )}
          </article>
        ))}
        <button
          className="btn btn-primary min-h-12"
          onClick={() => {
            void completeLessonsAction(lessons.map((l) => l.id));
            setStep(check.length ? "check" : "done");
          }}
        >
          {check.length ? `Got it — check me (${check.length} questions)` : "Got it"}
        </button>
        {check.length > 0 && (
          <button className="btn btn-ghost min-h-11" onClick={() => setStep("check")}>
            Already know it? Skip to the questions
          </button>
        )}
      </div>
    );

  if (step === "check")
    return <QuestionRunner questions={check} pages={pages} mode="learn" onFinish={() => setStep("done")} />;

  return (
    <div className="card flex flex-col items-center gap-3 p-6 text-center">
      <p className="font-semibold">Topic done.</p>
      <p className="text-sm text-muted">It&apos;ll come back in practice so it sticks.</p>
      <Link href="/study" className="btn btn-primary w-full">
        Next topic
      </Link>
    </div>
  );
}
