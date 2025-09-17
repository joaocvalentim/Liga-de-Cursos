// src/app/login/page.tsx
'use client' // This is a client component  - necessary for interactivity   
import { useState } from 'react' // Import React hooks if needed - gerir estado 
import { useRouter } from 'next/navigation' // Import Next.js router for navigation - direcionar paginas
import { API /* ou apiFetch */ } from "@/lib/api";

export default function LoginPage() {
    //inputs user
    const [email, setEmail] = useState(''); // State for email  - set email é a função para atualizar o estado e email é o valor atual do estado    
    const [password, setPassword] = useState(''); // State for password

    const router = useRouter(); // Hook to programmatically navigate

    // Function to handle form submission   
    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault(); // Prevent the default form submission behavior
        try {
            const response = await fetch(`${API}/login/`,{
                method: 'POST', // Define the method as <POST>
                headers: { 
                  'Content-Type': 'application/json',
                },// Set the content type to JSON
                body: JSON.stringify({ email, password }), // Convert the data to JSON format
            });
            // Check if the response is ok (status in the range 200-299)
            if(!response.ok) {
                throw new Error('Erro ao fazer login'); // Throw an error if the response is not ok
            }  
            const data = await response.json(); // Parse the JSON response - guardar access token
            localStorage.setItem('access_token', data.access); // Store the access token in local localStorage - usar noutras paginas
            localStorage.setItem("refresh_token", data.refresh);
            window.dispatchEvent(new Event("auth-changed"));
            router.push('/'); // Redirect to the home page after successful login  
        } catch (error) {
            alert('Erro ao fazer login: Credenciais erradas ou erro no servidor'); // Show an error message if the login fails 
        }
    }
        



  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-700">Iniciar Sessão</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input type="email" 
                id="email" 
                className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-gray-500" 
                placeholder="exemplo@email.com"
                value={email} // Bind the email state to the input
                onChange={(e) => setEmail(e.target.value)} // Update the email state on input change 
                required 
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Palavra-passe
            </label>
            <input type="password" 
                id="password" 
                className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-gray-500" 
                placeholder="********"  
                value={password} // Bind the password state to the inputs
                onChange={(e) => setPassword(e.target.value)} // Update the password state on input change  
                required 
            />
          </div>

          <button type="submit" className="w-full bg-zinc-900 text-white p-2 rounded-md hover:bg-zinc-600 transition">
            Entrar
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-700">
          Ainda não tens conta?{' '} 
          <a href="/register" className="text-blue-600 hover:underline">
            Regista-te aqui
          </a>
        </p>
      </div>
    </main>
  );
}
