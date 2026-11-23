import { redirect } from "next/navigation";

/** The old box-checking step is gone: a playbook upload is read on Teach. */
export default async function UploadPage({ params }: PageProps<"/t/[teamId]/uploads/[uploadId]">) {
  const { teamId, uploadId } = await params;
  redirect(`/t/${teamId}/teach?upload=${encodeURIComponent(uploadId)}`);
}
