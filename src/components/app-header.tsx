"use client"

import {
  LogOut, Home, Users, ShieldCheck,
  UserCircle, Sparkles, Settings, LifeBuoy, Inbox
} from "lucide-react"
import { SentinelaMascot } from "./brand-logo"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/hooks/use-auth"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"
import { useCallback, useState } from "react"
import { cn } from "@/lib/utils"
import { ProfileEditDialog } from "./profile-edit-dialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

/**
 * Dialog para alteração de senha
 */
function PasswordChangeDialog({ isOpen, onOpenChange, userId }: { isOpen: boolean; onOpenChange: (open: boolean) => void; userId: string }) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const handleSubmit = async () => {
    if (newPassword !== confirmPassword) {
      alert("As senhas não coincidem")
      return
    }
    // Opcional: Adicionar um estado de loading aqui para o botão
    try {
      const res = await fetch(`/api/users/${userId}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Opcional: Adicionar um token de autenticação no header (e.g., Authorization: Bearer <idToken>)
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      // Sempre tentar ler a resposta JSON para obter mensagens de erro detalhadas do backend
      const data = await res.json();

      if (res.ok) { // Verifica se a resposta HTTP foi bem-sucedida (status 2xx)
        alert(data.message || "Senha alterada com sucesso!");
        onOpenChange(false);
      } else { // Se a resposta HTTP não foi bem-sucedida
        alert(data.message || "Erro ao alterar senha.");
        // Opcional: Logar o erro completo do backend para depuração
      }
    } catch (error) {
      alert("Falha na requisição")
      console.error("Erro na requisição de alteração de senha:", error);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar Senha</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            type="password"
            placeholder="Senha atual"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Nova senha"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Confirmar nova senha"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <Button onClick={handleSubmit} className="w-full">Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Cabeçalho do sistema com controle de acesso em 3 camadas:
 * - Root (Monica, dona do sistema)
 * - Admin (gestores municipais)
 * - Fiscal (usuários operacionais)
 */
export function AppHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, profile, logout } = useAuth()
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isPasswordOpen, setIsPasswordOpen] = useState(false)

  const handleLogout = useCallback(async () => {
    try {
      await logout()
      router.push("/login")
    } catch (error) {}
  }, [logout, router])

  if (!user || pathname === "/login") return null

  // Definição clara dos papéis
  const role = profile?.role
  const isRoot = role === "root" // exclusivo para o root da plataforma
  const isAdmin = role === "admin"

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="mr-6 flex items-center">
              <SentinelaMascot className="rounded-lg border-none shadow-none" width={36} height={36} simplified />
            </Link>
            <nav className="flex items-center space-x-6 text-sm font-medium">
              <Link href="/dashboard" className={cn("transition-colors hover:text-foreground/80", pathname === "/dashboard" ? "text-foreground" : "text-foreground/60")} title="Início">
                <Home className="h-5 w-5" />
              </Link>
              {(isAdmin || isRoot) && (
                <Link href="/admin/usuarios" className={cn("transition-colors hover:text-foreground/80", pathname === "/admin/usuarios" ? "text-foreground" : "text-foreground/60")} title="Equipe">
                  <Users className="h-5 w-5" />
                </Link>
              )}
              {(isAdmin || isRoot) && (
                <Link href="/admin/configuracoes" className={cn("transition-colors hover:text-foreground/80", pathname === "/admin/configuracoes" ? "text-foreground" : "text-foreground/60")} title="Configurações">
                  <Settings className="h-5 w-5" />
                </Link>
              )}
              {isRoot && (
                <Link href="/admin/solicitacoes" className={cn("transition-colors hover:text-foreground/80", pathname === "/admin/solicitacoes" ? "text-foreground" : "text-foreground/60")} title="Solicitações">
                  <ShieldCheck className="h-5 w-5" />
                </Link>
              )}
              <Link href="/suporte" className={cn("transition-colors hover:text-foreground/80", pathname === "/suporte" ? "text-foreground" : "text-foreground/60")} title="Suporte / Reportar Erro">
                <LifeBuoy className="h-5 w-5" />
              </Link>
              {(isAdmin || isRoot) && (
                <Link href="/admin/suporte" className={cn("transition-colors hover:text-foreground/80", pathname === "/admin/suporte" ? "text-foreground" : "text-foreground/60")} title="Gestão de Suporte">
                  <Inbox className="h-5 w-5" />
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={profile?.photoURL || ""} alt={profile?.displayName || "User"} />
                    <AvatarFallback>{(profile?.displayName || "U")[0]}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{profile?.displayName}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {profile?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsProfileOpen(true)}>
                  <UserCircle className="mr-2 h-4 w-4" />
                  <span>Perfil</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsPasswordOpen(true)}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  <span>Alterar Senha</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <ProfileEditDialog isOpen={isProfileOpen} onOpenChange={setIsProfileOpen} />
      {user?.uid && (
        <PasswordChangeDialog 
          isOpen={isPasswordOpen} 
          onOpenChange={setIsPasswordOpen} 
          userId={user.uid} 
        />
      )}
    </>
  )
}
