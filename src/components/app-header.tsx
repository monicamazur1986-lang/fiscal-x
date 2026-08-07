"use client"

import {
  LogOut, Users,
  UserCircle, Sparkles, Settings, Inbox, ArrowLeft, Image as ImageIcon, MessageSquare, Loader2
} from "lucide-react"
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
import { usePendingAlerts } from "@/hooks/use-pending-alerts"
import { useMunicipioTemGestor } from "@/hooks/use-municipio-tem-gestor"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"
import { useCallback, useState } from "react"
import { ProfileEditDialog } from "./profile-edit-dialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { requestChecklistExit } from "@/hooks/use-checklist-exit-guard"
import { auth } from "@/lib/firebase"
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth"
import { useToast } from "@/hooks/use-toast"

function mapPasswordChangeError(code: string | undefined): string {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return "Senha atual incorreta.";
    case 'auth/weak-password':
      return "A nova senha precisa ter pelo menos 6 caracteres.";
    case 'auth/too-many-requests':
      return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    case 'auth/requires-recent-login':
      return "Sessão expirada. Saia e entre novamente antes de trocar a senha.";
    default:
      return "Não foi possível alterar a senha. Tente novamente.";
  }
}

/**
 * Dialog para alteração de senha — reautentica e troca direto pelo SDK do
 * Firebase Auth no cliente (nunca passa pelo nosso servidor), já que
 * updatePassword/reauthenticateWithCredential resolvem isso sem precisar de
 * uma rota própria com Admin SDK.
 */
function PasswordChangeDialog({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      toast({ variant: "destructive", title: "As senhas não coincidem" });
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser?.email) {
      toast({ variant: "destructive", title: "Sessão expirada", description: "Saia e entre novamente." });
      return;
    }

    setSaving(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      toast({ title: "Senha alterada com sucesso" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro ao alterar senha", description: mapPasswordChangeError(error?.code) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar Senha</DialogTitle>
          <DialogDescription>Confirme sua senha atual para definir uma nova.</DialogDescription>
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
          <Button onClick={handleSubmit} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
          </Button>
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
  const { pendingUsersCount, pendingChamadosCount } = usePendingAlerts()
  // Libera "Configurações" pro fiscal também quando o município dele não tem
  // gestor cadastrado — ver src/hooks/use-municipio-tem-gestor.ts.
  const { temGestor } = useMunicipioTemGestor()
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isPasswordOpen, setIsPasswordOpen] = useState(false)

  const handleLogout = useCallback(async () => {
    try {
      await logout()
      router.push("/login")
    } catch (error) {}
  }, [logout, router])

  if (!user || pathname === "/login") return null

  // O link de volta pro Início pode ser "segurado" por uma vistoria em
  // andamento (ver src/hooks/use-checklist-exit-guard.ts) — se houver um
  // guard registrado, ele assume a navegação (abre o diálogo de
  // salvar/excluir) e este clique não navega direto.
  const handleInicioClick = (e: React.MouseEvent) => {
    if (requestChecklistExit("/dashboard")) {
      e.preventDefault();
    }
  };

  // Definição clara dos papéis
  const role = profile?.role
  const isRoot = role === "root" // exclusivo para o root da plataforma
  const isAdmin = role === "admin"
  const podeConfigurar = isAdmin || isRoot || (role === "fiscal" && !temGestor)

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-1">
            {pathname !== "/dashboard" && (
              <Link
                href="/dashboard"
                onClick={handleInicioClick}
                aria-label="Voltar ao início"
                title="Voltar ao início"
                className="flex items-center justify-center h-10 w-10 rounded-full text-[#6B6659] hover:bg-[#F1EEE4] hover:text-[#0E4A44] active:bg-[#E4EEEC] transition-colors shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <Link
              href="/recados"
              aria-label="Mural de Avisos"
              title="Mural de Avisos"
              className="flex items-center justify-center h-10 w-10 rounded-full text-[#6B6659] hover:bg-[#F1EEE4] hover:text-[#0E4A44] active:bg-[#E4EEEC] transition-colors shrink-0"
            >
              <MessageSquare className="h-5 w-5" />
            </Link>
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
                {(isAdmin || isRoot) && (
                  <DropdownMenuItem onClick={() => router.push("/admin/usuarios")}>
                    <Users className="mr-2 h-4 w-4" />
                    <span className="flex-1">Equipe</span>
                    {pendingUsersCount > 0 && (
                      <span className="ml-2 rounded-full bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 leading-none">{pendingUsersCount}</span>
                    )}
                  </DropdownMenuItem>
                )}
                {podeConfigurar && (
                  <DropdownMenuItem onClick={() => router.push("/admin/configuracoes")}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Configurações</span>
                  </DropdownMenuItem>
                )}
                {isRoot && (
                  <DropdownMenuItem onClick={() => router.push("/admin/configuracoes/sistema")}>
                    <ImageIcon className="mr-2 h-4 w-4" />
                    <span>Marca do Sistema</span>
                  </DropdownMenuItem>
                )}
                {(isAdmin || isRoot) && (
                  <DropdownMenuItem onClick={() => router.push("/admin/suporte")}>
                    <Inbox className="mr-2 h-4 w-4" />
                    <span className="flex-1">Gestão de Suporte</span>
                    {pendingChamadosCount > 0 && (
                      <span className="ml-2 rounded-full bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 leading-none">{pendingChamadosCount}</span>
                    )}
                  </DropdownMenuItem>
                )}
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
        />
      )}
    </>
  )
}
