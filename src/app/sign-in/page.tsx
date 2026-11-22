import { AuthForm } from "./auth-form";

export const metadata = { title: "Coach sign in" };

export default async function SignIn({ searchParams }: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-12">
      <h1 className="mb-6 text-4xl">Coach sign in</h1>
      <AuthForm mode="sign-in" next={typeof next === "string" ? next : undefined} />
    </main>
  );
}
