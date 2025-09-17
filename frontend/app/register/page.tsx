"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API /* ou apiFetch */ } from "@/lib/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password1, setPassword1] = useState("");
  const [password2, setPassword2] = useState("");
  const [username, setUsername] = useState(""); 

  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const response = await fetch(`${API}/registration/` , {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({username, email, password1, password2 }),
      });
      if (!response.ok) {
        throw new Error("Erro ao registar");
      }

      const data = await response.json();
      localStorage.setItem("access_token", data.access);
      router.push("/new_profile");
    } catch (error) {
      alert(
        "Erro ao registar: Verifique os dados ou tente novamente mais tarde"
      );
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-700">Criar Conta</h1>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-gray-500"
              placeholder="exemplo@email.com"
              value={email} // Bind the email state to the input
              onChange={(e) => {
                setEmail(e.target.value);
                setUsername(e.target.value);
              }} // Update both email and username when email changes
              required

            />
          </div>

          <div>
            <label
              htmlFor="password1"
              className="block text-sm font-medium text-gray-700"
            >
              Palavra-passe
            </label>
            <input
              type="password"
              id="password1"
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-gray-500"
              placeholder="********"
              value={password1} // Bind the password state to the inputs
              onChange={(e) => setPassword1(e.target.value)} // Update the password state on input change
              required
            />
          </div>

          <div>
            <label
              htmlFor="password2"
              className="block text-sm font-medium text-gray-700"
            >
              Repita a palavra-passe
            </label>
            <input
              type="password"
              id="password2"
              className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-gray-500"
              placeholder="********"
              value={password2} // Bind the password state to the inputs
              onChange={(e) => setPassword2(e.target.value)} // Update the password state on input change
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-zinc-900 text-white p-2 rounded-md hover:bg-zinc-600 transition text-gray-700"
          >
            Criar Conta
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-700">
          Já tens conta?{" "}
          <a href="/login" className="text-blue-600 hover:underline">
            Entra aqui
          </a>
        </p>
      </div>
    </main>
  );
}
