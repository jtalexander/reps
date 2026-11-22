"use client";
import { useState } from "react";
import { PageView } from "@/components/page-view";
import { safeCall } from "@/lib/safe-call";
import type { PageRef } from "@/teach/page-images";
import { AUDIENCES, AUDIENCE_LABEL, type QuestionData, type QuestionImage } from "@/teach/types";
import { reviewLessonAction, reviewQuestionAction } from "../actions";

export type CardMode = "draft" | "live" | "flag";

export type LessonItem = { type: "lesson"; id: string; topicId: string; lesson: { title: string; body: string; audience: string; sourcePages: number[] } };
export type QuestionItem = {
  type: "question";
  id: string;
  topicId: string;
  question: { prompt: string; format: string; data: QuestionData; explanation: string; audience: string[]; sourcePages: number[]; image: QuestionImage | null };
};
type Item = LessonItem | QuestionItem;

export const FORMAT_LABEL: Record<string, string> = { choice: "Multiple choice", tap: "Tap the diagram", order: "Put in order", open: "Own words" };

export function ReviewQueue({ teamId, items, topics, pages, live }: { teamId: string; items: Item[]; topics: Record<string, string>; pages: Record<number, PageRef>; live: boolean }) {
  const [gone, setGone] = useState<Record<string, string>>({});
  const remaining = items.filter((i) => !gone[i.id]);
  if (items.length === 0) return <p className="card p-6 text-center text-muted">{live ? "Nothing live yet." : "Nothing waiting for review."}</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {live ? `${remaining.length} live` : `${remaining.length} waiting · ${Object.values(gone).filter((g) => g === "approved").length} approved this visit`}
      </p>
      {items.map((it) =>
        gone[it.id] ? (
          <div key={it.id} className="flex items-center justify-between rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted">
            <span>{gone[it.id] === "approved" ? "Approved" : gone[it.id] === "rejected" ? "Rejected" : "Moved back to drafts"}</span>
            <button
              className="underline"
              onClick={async () => {
                const prev = live ? "approved" : "draft";
                const r =
                  it.type === "lesson"
                    ? await safeCall(() => reviewLessonAction(teamId, it.id, { status: prev }), "Undo")
                    : await safeCall(() => reviewQuestionAction(teamId, it.id, { status: prev }), "Undo");
                if (r.ok)
                  setGone((g) => {
                    const rest = { ...g };
                    delete rest[it.id];
                    return rest;
                  });
              }}
            >
              Undo
            </button>
          </div>
        ) : it.type === "lesson" ? (
          <LessonCard key={it.id} teamId={teamId} item={it} topic={topics[it.topicId] ?? ""} mode={live ? "live" : "draft"} onDone={(s) => setGone((g) => ({ ...g, [it.id]: s }))} />
        ) : (
          <QuestionCard key={it.id} teamId={teamId} item={it} topic={topics[it.topicId] ?? ""} pages={pages} mode={live ? "live" : "draft"} onDone={(s) => setGone((g) => ({ ...g, [it.id]: s }))} />
        ),
      )}
    </div>
  );
}

function Actions({
  mode,
  busy,
  onApprove,
  onEdit,
  onReject,
  onFine,
  editing,
}: {
  mode: CardMode;
  busy: boolean;
  onApprove: () => void;
  onEdit: () => void;
  onReject: () => void;
  onFine?: () => void;
  editing: boolean;
}) {
  if (mode === "live")
    return (
      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1" disabled={busy} onClick={onReject}>
          Take off (back to drafts)
        </button>
      </div>
    );
  if (mode === "flag")
    return (
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <button className="btn btn-primary flex-1" disabled={busy} onClick={onApprove}>
            Save fix
          </button>
        ) : (
          <>
            <button className="btn btn-primary flex-1" disabled={busy} onClick={onFine}>
              It&apos;s fine
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={onEdit}>
              Fix it
            </button>
          </>
        )}
        <button className="btn btn-ghost text-bad" disabled={busy} onClick={onReject}>
          Take it off
        </button>
      </div>
    );
  return (
    <div className="flex gap-2">
      <button className="btn btn-primary flex-1" disabled={busy} onClick={onApprove}>
        {editing ? "Save & approve" : "Approve"}
      </button>
      {!editing && (
        <button className="btn btn-ghost" disabled={busy} onClick={onEdit}>
          Edit
        </button>
      )}
      <button className="btn btn-ghost text-bad" disabled={busy} onClick={onReject}>
        Reject
      </button>
    </div>
  );
}

function Head({ kind, topic, audience, pagesText }: { kind: string; topic: string; audience: string; pagesText: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded bg-brand px-1.5 py-0.5 font-semibold text-brand-ink">{kind}</span>
      <span className="font-semibold">{topic}</span>
      <span className="text-muted">for {audience}</span>
      <span className="ml-auto text-muted">{pagesText}</span>
    </div>
  );
}

export function LessonCard({
  teamId,
  item,
  topic,
  mode,
  onDone,
  startEditing = false,
}: {
  teamId: string;
  item: LessonItem;
  topic: string;
  mode: CardMode;
  onDone: (s: string) => void;
  startEditing?: boolean;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [title, setTitle] = useState(item.lesson.title);
  const [body, setBody] = useState(item.lesson.body);
  const [audience, setAudience] = useState(item.lesson.audience);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(status: "approved" | "rejected" | "draft") {
    setBusy(true);
    const r = await safeCall(() => reviewLessonAction(teamId, item.id, { status, ...(editing ? { title, body, audience } : {}) }), "Saving");
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onDone(status);
  }
  return (
    <div className="card flex flex-col gap-3 p-4">
      <Head kind="Lesson" topic={topic} audience={AUDIENCE_LABEL[audience as keyof typeof AUDIENCE_LABEL] ?? audience} pagesText={`p${item.lesson.sourcePages.join(", ")}`} />
      {editing ? (
        <>
          <input className="input font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className="input" value={audience} onChange={(e) => setAudience(e.target.value)}>
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {AUDIENCE_LABEL[a]}
              </option>
            ))}
          </select>
          <textarea className="input py-2 text-sm" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
        </>
      ) : (
        <>
          <h3 className="font-semibold">{item.lesson.title}</h3>
          <LessonBody text={item.lesson.body} />
        </>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
      <Actions mode={mode} busy={busy} editing={editing} onApprove={() => save("approved")} onEdit={() => setEditing(true)} onReject={() => save(mode === "draft" ? "rejected" : "draft")} />
    </div>
  );
}

export function LessonBody({ text }: { text: string }) {
  // Lines starting with "- " become bullets; runs of other lines become paragraphs.
  const blocks: Array<{ kind: "p" | "ul"; lines: string[] }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      blocks.push({ kind: "p", lines: [] });
      continue;
    }
    const bullet = /^[-•*]\s+/.test(line);
    const last = blocks[blocks.length - 1];
    const kind = bullet ? "ul" : "p";
    const content = bullet ? line.replace(/^[-•*]\s+/, "") : line;
    if (last && last.kind === kind && last.lines.length) last.lines.push(content);
    else blocks.push({ kind, lines: [content] });
  }
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed">
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.kind === "ul" ? (
            <ul key={i} className="list-disc pl-5">
              {b.lines.map((l, j) => (
                <li key={j}>{l}</li>
              ))}
            </ul>
          ) : (
            <p key={i}>{b.lines.join(" ")}</p>
          ),
        )}
    </div>
  );
}

export function QuestionCard({
  teamId,
  item,
  topic,
  pages,
  mode,
  onDone,
  startEditing = false,
}: {
  teamId: string;
  item: QuestionItem;
  topic: string;
  pages: Record<number, PageRef>;
  mode: CardMode;
  onDone: (s: string) => void;
  startEditing?: boolean;
}) {
  const q = item.question;
  const [editing, setEditing] = useState(startEditing);
  const [prompt, setPrompt] = useState(q.prompt);
  const [explanation, setExplanation] = useState(q.explanation);
  const [data, setData] = useState<QuestionData>(q.data);
  const [audience, setAudience] = useState<string[]>(q.audience);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const page = q.image ? pages[q.image.pageNo] : null;

  async function save(status: "approved" | "rejected" | "draft") {
    setBusy(true);
    const r = await safeCall(() => reviewQuestionAction(teamId, item.id, { status, ...(editing ? { prompt, explanation, data, audience } : {}) }), "Saving");
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onDone(status);
  }

  return (
    <div className="card flex flex-col gap-3 p-4">
      <Head
        kind={FORMAT_LABEL[q.format] ?? q.format}
        topic={topic}
        audience={audience.map((a) => AUDIENCE_LABEL[a as keyof typeof AUDIENCE_LABEL] ?? a).join(", ")}
        pagesText={`p${q.sourcePages.join(", ")}`}
      />
      {editing ? <textarea className="input py-2 font-semibold" rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} /> : <h3 className="font-semibold">{q.prompt}</h3>}

      {page && (
        <PageView
          url={page.url}
          width={page.width}
          height={page.height}
          crop={q.image?.box ?? null}
          marks={data.kind === "tap" ? [{ box: data.target, tone: "ok" }] : []}
          onTap={
            editing && data.kind === "tap"
              ? (p) => setData({ ...data, target: { x: p.x - data.target.w / 2, y: p.y - data.target.h / 2, w: data.target.w, h: data.target.h } })
              : undefined
          }
          className="max-h-[45vh] w-full rounded border border-line"
        />
      )}

      {data.kind === "choice" && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {data.choices.map((c, i) => (
            <li key={c.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${c.id === data.answer ? "border-ok bg-ok-bg" : "border-line"}`}>
              {editing ? (
                <>
                  <input type="radio" checked={c.id === data.answer} onChange={() => setData({ ...data, answer: c.id })} aria-label="Correct answer" />
                  <input
                    className="flex-1 bg-transparent"
                    value={c.text}
                    onChange={(e) => setData({ ...data, choices: data.choices.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                  />
                </>
              ) : (
                <>
                  <span className="w-4 text-ok">{c.id === data.answer ? "✓" : ""}</span>
                  {c.text}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {data.kind === "order" && (
        <ol className="flex flex-col gap-1.5 text-sm">
          {data.items.map((t, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
              <span className="font-bold">{i + 1}.</span>
              {editing ? (
                <>
                  <input className="flex-1 bg-transparent" value={t} onChange={(e) => setData({ ...data, items: data.items.map((x, j) => (j === i ? e.target.value : x)) })} />
                  <button
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => {
                      const items = [...data.items];
                      [items[i - 1], items[i]] = [items[i]!, items[i - 1]!];
                      setData({ ...data, items });
                    }}
                  >
                    ↑
                  </button>
                </>
              ) : (
                t
              )}
            </li>
          ))}
        </ol>
      )}
      {data.kind === "tap" && (
        <p className="text-sm">
          Right spot: <strong>{data.targetLabel}</strong> (green box){editing ? " — tap the image to move it" : ""}.
        </p>
      )}
      {data.kind === "open" && (
        <div className="flex flex-col gap-2 text-sm">
          <div>
            <div className="label">Model answer</div>
            {editing ? <textarea className="input py-2" rows={3} value={data.modelAnswer} onChange={(e) => setData({ ...data, modelAnswer: e.target.value })} /> : <p>{data.modelAnswer}</p>}
          </div>
          <div>
            <div className="label">A right answer must include</div>
            {editing ? (
              <textarea
                className="input py-2"
                rows={3}
                value={data.keyPoints.join("\n")}
                onChange={(e) => setData({ ...data, keyPoints: e.target.value.split("\n").filter((x, i, a) => x.trim() || i === a.length - 1) })}
              />
            ) : (
              <ul className="list-disc pl-5">
                {data.keyPoints.map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="text-sm">
        <div className="label">Explanation players see</div>
        {editing ? <textarea className="input py-2" rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} /> : <p className="text-muted">{q.explanation}</p>}
      </div>
      {editing && (
        <div className="flex flex-wrap gap-3 text-sm">
          {AUDIENCES.map((a) => (
            <label key={a} className="flex items-center gap-1">
              <input type="checkbox" checked={audience.includes(a)} onChange={(e) => setAudience((x) => (e.target.checked ? [...x, a] : x.filter((y) => y !== a)))} />
              {AUDIENCE_LABEL[a]}
            </label>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
      <Actions
        mode={mode}
        busy={busy}
        editing={editing}
        onApprove={() => save("approved")}
        onEdit={() => setEditing(true)}
        onReject={() => save(mode === "draft" ? "rejected" : "draft")}
        onFine={() => onDone("fine")}
      />
    </div>
  );
}
