import { AuthForm } from "../sign-in/auth-form";

export const metadata = { title: "Create coach account" };

export default async function SignUp({ searchParams }: PageProps<"/sign-up">) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-12">
      <h1 className="mb-6 text-4xl">Create a coach account</h1>
      <AuthForm mode="sign-up" next={typeof next === "string" ? next : undefined} />
    </main>
  );
}
