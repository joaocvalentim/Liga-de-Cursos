"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppWindowIcon, CodeIcon, ShuffleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronRightIcon } from "lucide-react"
import { ChevronLeftIcon } from "lucide-react"
import { useEffect } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";



const RANDOM_USERNAMES = [
  "cacaca loiras ",
  "pastrano merdoso ",
  "bebado de merda ",
  "caro feio ",
  "dignissimo burro ",
  "excelentissimo cabrão ",
  "veteraneco ",
  "carissimo otário ",
  "putinha ",
  "caro conas ",
];
type Option = { value: string; label: string };

const HIERARQUIA_OPTIONS: Option[] = [
  { value: "Excelentissimo Pastrano", label: "Excelentissimo Pastrano" },
  { value: "Excelentissimo Doutor", label: "Excelentissimo Doutor" },
  { value: "Excelentissimo Veterano", label: "Excelentissimo Veterano" },
];

const CURSO_OPTIONS: Option[] = [
{ value: "ant", label: "Antropologia" },
{ value: "arq", label: "Arquitetura" },
{ value: "lcd", label: "Ciência de Dados" },
{ value: "cpo", label: "Ciências Politicas" },
{ value: "eco", label: "Economia" },
{ value: "eti", label: "Engenharia de Telecomunicações e Informática" },
{ value: "lei", label: "Engenharia Informática" },
{ value: "fin", label: "Finanças e Contabilidade" },
{ value: "ges", label: "Gestão" },
{ value: "grh", label: "Gestão de Recursos Humanos" },
{ value: "gil", label: "Gestão Industrial e Logística" },
{ value: "gmk", label: "Gestão de Marketing" },
{ value: "hmc", label: "História Moderna e Contemporânea" },
{ value: "ige", label: "Informática e Gestão de Empresas" },
{ value: "psi", label: "Psicologia" },
{ value: "soc", label: "Sociologia" },
{ value: "ss", label: "Serviço Social" },
{ value: "sintra", label: "Sintra" },
  // adiciona aqui os restantes cursos...
];


export default function EditProfilePage() {
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [hierarquia, setHierarquia] = useState(""); 
  const [curso, setCurso] = useState("");

  const router = useRouter();


  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/401");
      return;
    }

    const fetchUser = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/user/", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUsername(data.username || "");
          setHierarquia(data.hierarquia || "");
          setCurso(data.curso || "");   
        } else {
          console.error("Erro ao buscar dados do utilizador.");
        }
      } catch (error) {
        console.error("Erro na requisição:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [router]);

  

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        alert("Token de autenticação não encontrado. Por favor, faça login novamente.");
        router.push("/401");
        return;
      }

      const payload = {
        username,
        hierarquia,
        curso, // tem de respeitar os values do modelo: 'ige' | 'soc' | 'nenhum'
        }; 
      
      const response = await fetch("http://localhost:8000/api/user/edit/", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",

        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Erro ao editar perfil:", errorData);
        throw new Error("Erro ao editar perfil");
      }

      const data = await response.json();
      if (data.access) {
      localStorage.setItem("access_token", data.access);
      localStorage.setItem("refresh_token", data.refresh);
      window.dispatchEvent(new Event("auth-changed"));
    }

      router.push("/");
    } catch (error) {
      alert("Erro ao editar: Verifique os dados ou tente novamente mais tarde");
    }
  };


  const generateRandomUsername = () => {
    const randomIndex = Math.floor(Math.random() * RANDOM_USERNAMES.length);
    let newUsername = RANDOM_USERNAMES[randomIndex];
    
    // Adiciona um número aleatório se o nome já estiver em uso
    newUsername = `${newUsername}${Math.floor(Math.random() * 100)}`;
    
    setUsername(newUsername);
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen">
        <span>A carregar...</span>
      </div>
    );

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs defaultValue="account">
            <TabsList className="grid w-full grid-cols-1">
              <TabsTrigger value="account">Criar Conta</TabsTrigger>
            </TabsList>
            <TabsContent value="account">
              <Card>
                <CardHeader>
                  <CardTitle>Configuração de Perfil</CardTitle>
                </CardHeader>
                

                <CardContent className="grid gap-6">
                  <div className="grid gap-3">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="username">Username</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={generateRandomUsername}
                        className="flex items-center gap-1 text-sm"
                      >
                      <ShuffleIcon className="h-4 w-4" />
                        Aleatório
                      </Button>
                    </div>
                    <Input
                      type="text"
                      id="username"
                      placeholder={username || "Digite seu username"}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>  
                  <div className="grid gap-3">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="curso">Curso</Label>
                    </div>
                    <Select
                        value={curso || undefined}
                        onValueChange={(val) => setCurso(val)}
                        >
                        <SelectTrigger id="curso">
                            <SelectValue placeholder="Escolhe o curso" />
                        </SelectTrigger>
                        <SelectContent>
                            {CURSO_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-3">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="hierarquia">Hierarquia</Label>
                    </div>
                    <Select
                        value={hierarquia || undefined}
                        onValueChange={(val) => setHierarquia(val)}
                        >
                        <SelectTrigger id="hierarquia">
                            <SelectValue placeholder="Escolhe a hierarquia" />
                        </SelectTrigger>
                        <SelectContent>
                            {HIERARQUIA_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                  </div>   
                </CardContent>
                
                <CardFooter>
                  <Button
                    type="submit"
                    className="w-full bg-zinc-900 text-white p-2 rounded-md hover:bg-zinc-600 transition"
                  >
                    Continuar
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        </form>
      </div>
    </main>
  );
}
