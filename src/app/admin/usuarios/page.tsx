"use client"

import { useAuth } from "@/hooks/use-auth"
import { db } from "@/lib/firebase"
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, where } from "firebase/firestore"
import { useEffect, useState, useCallback, useMemo } from "react"
import {
  ShieldCheck,
  Trash2,
  Users,
  Loader2,
  Mail,
  CheckCircle2,
  IdCard,
  Inbox,
  Database,
  Hash,
  UserX,
  UserCheck,
  Search,
  Building2,
  MapPin,
  Settings2,
  Lock,
  History,
  Activity,
  PenTool,
  ChevronDown,
  FileSpreadsheet,
  Crown
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { normalizeId } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import municipiosPR from "@/lib/municipios-pr.json"
import Papa from "papaparse"

export default function GestaoEquipePage() {
  const { profile, loading: authLoading } = useAuth()
  const isRoot = profile?.role === 'root'
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [localLoading, setLocalLoading] = useState(true)
  const { toast } = useToast()

  // FILTRO POR MUNICÍPIO (só pro root, que vê todas as cidades)
  const [openCity, setOpenCity] = useState(false)
  const [selectedCity, setSelectedCity] = useState("")
  const [citySearchTerm, setCitySearchTerm] = useState("")

  // SEGURANÇA: APENAS ADMIN OU ROOT ACESSAM
  useEffect(() => {
    if (!authLoading) {
      if (!profile) {
        router.replace("/login")
      } else if (profile.role !== 'admin' && profile.role !== 'root') {
        router.replace("/dashboard")
      }
    }
  }, [profile, authLoading, router])

  const calculateNextFiscalCode = useCallback(() => {
    let max = 0;
    users.forEach(u => {
      const code = parseInt(u.fiscalCode || "0", 10);
      if (code > max) max = code;
    });
    return (max + 1).toString().padStart(3, '0');
  }, [users]);

  useEffect(() => {
    if (authLoading || !profile) return;

    setLocalLoading(true);

    const processSnapshot = (snapshotDocs: any[]) => {
      const fbList = snapshotDocs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

      const sorted = fbList.sort((a: any, b: any) => {
        if (a.isAuthorized !== b.isAuthorized) return a.isAuthorized ? 1 : -1;
        return (a.displayName || "").localeCompare(b.displayName || "");
      });

      setUsers(sorted);
      setLocalLoading(false);
    };

    if (!db) {
      processSnapshot([]);
      return;
    }

    // FILTRO DE JURISDIÇÃO NO FIRESTORE
    let q;
    if (profile.role === 'admin') {
        const mid = normalizeId(profile.municipioId);
        q = query(collection(db, "users"), where("municipioId", "==", mid));
    } else {
        q = collection(db, "users");
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      processSnapshot(snapshot.docs);
    }, (err) => {
      console.error("Erro ao carregar equipe:", err);
      setLocalLoading(false);
    });

    return () => unsubscribe();
  }, [db, authLoading, profile])

  const handleUpdateFiscalCode = async (userId: string, email: string, code: string) => {
    const cleanCode = code.toUpperCase().substring(0, 5);
    if (!db) return;
    await updateDoc(doc(db, "users", userId), { fiscalCode: cleanCode });
    toast({ title: "ID Atualizado", description: `Novo identificador: ${cleanCode}` });
  }

  const toggleAuth = async (userId: string, currentStatus: boolean, userEmail: string) => {
    const isApproving = !currentStatus;

    // SE ESTÁ APROVANDO, GARANTE QUE TEM UM CÓDIGO ÚNICO
    let nextCode = "";
    const targetUser = users.find(u => u.email.toLowerCase() === userEmail.toLowerCase());
    if (isApproving && (!targetUser?.fiscalCode || targetUser.fiscalCode === "")) {
        nextCode = calculateNextFiscalCode();
    }

    // "Revogar Acesso" (isApproving=false) nunca marca como 'pending' — esse
    // status é reservado pra cadastro novo, nunca revisado. Um fiscal que já
    // foi autorizado e teve o acesso revogado vira 'revoked', pra não
    // reaparecer nas "Solicitações Aguardando" nem na notificação de novo
    // cadastro do Dashboard como se fosse um pedido inédito.
    const newData: any = {
        isAuthorized: isApproving,
        status: isApproving ? 'approved' : 'revoked',
        updatedAt: new Date().toISOString()
    };

    if (nextCode) newData.fiscalCode = nextCode;

    if (!db) return;
    await updateDoc(doc(db, "users", userId), newData);
    toast({
        title: isApproving ? "Acesso Liberado" : "Acesso Revogado",
        description: nextCode ? `ID ${nextCode} atribuído automaticamente.` : ""
    });
  }

  // Recusa uma solicitação nova sem conceder acesso — sem isso, uma
  // solicitação indesejada não tinha como sair de "Solicitações Aguardando"
  // (só existia o botão de autorizar), ficando pendente pra sempre.
  const handleRejeitar = async (userId: string) => {
    if (!db) return;
    await updateDoc(doc(db, "users", userId), {
      isAuthorized: false,
      status: 'rejected',
      updatedAt: new Date().toISOString()
    });
    toast({ title: "Solicitação recusada", description: "Removida da lista de pendentes." });
  }

  const normalize = (str: string) => (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const filteredMunicipiosList = useMemo(() => {
    const term = normalize(citySearchTerm);
    if (!term) return municipiosPR;
    return municipiosPR.filter(m => normalize(m).includes(term));
  }, [citySearchTerm]);

  const groupedByCity = useMemo(() => {
    const audited = users.filter(u => u.isAuthorized && u.role !== 'root');
    const grouped: Record<string, any[]> = {};
    audited.forEach(u => {
      const city = (u.municipioNome || u.municipioId || "INDETERMINADO").toUpperCase();
      if (!grouped[city]) grouped[city] = [];
      grouped[city].push(u);
    });
    return grouped;
  }, [users]);

  const exportGeneralReport = () => {
    const dataToExport = users.map(u => ({
      NOME: u.displayName,
      EMAIL: u.email,
      CIDADE: u.municipioNome || u.municipioId,
      ROLE: u.role === 'admin' ? 'GESTOR' : 'FISCAL',
      STATUS: u.isAuthorized ? 'ATIVO' : 'PENDENTE',
      CPF: u.cpf || 'N/I',
      CODIGO: u.fiscalCode || '---'
    }));

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `EQUIPE_GERAL_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Relatório Gerado" });
  }

  if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>

  const displayCity = isRoot ? (selectedCity || "TODOS OS MUNICÍPIOS") : (profile?.municipioNome || profile?.municipioId?.toUpperCase() || "SISTEMA");
  const filteredUsers = users.filter(u => {
    const matchesSearch = (u.displayName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (isRoot && selectedCity) {
      const cityA = normalize(u.municipioNome || "");
      const cityB = normalize(u.municipioId || "");
      const target = normalize(selectedCity);
      return cityA.includes(target) || cityB.includes(target);
    }
    return true;
  });

  const pendingUsers = filteredUsers.filter(u => !u.isAuthorized && u.role !== 'root' && u.status !== 'revoked' && u.status !== 'rejected');
  const revokedUsers = filteredUsers.filter(u => !u.isAuthorized && u.role !== 'root' && (u.status === 'revoked' || u.status === 'rejected'));
  const authorizedUsers = filteredUsers.filter(u => u.isAuthorized && u.role !== 'root');

  return (
    <div className="max-w-6xl mx-auto w-full p-4 sm:p-8 space-y-10 font-sans pb-32">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl menu-metallic-dark text-white shadow-xl">
                <Users className="h-6 w-6" />
            </div>
            <div>
                <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic leading-none">Equipe Municipal</h1>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] mt-1 flex items-center gap-2">
                    <MapPin className="h-3 w-3" /> Jurisdição: {displayCity}
                </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {isRoot && (
            <Button onClick={exportGeneralReport} variant="outline" className="h-11 px-6 rounded-xl border-zinc-200 text-zinc-600 font-black uppercase text-[9px] tracking-widest gap-2 hover:bg-zinc-50 shadow-sm transition-all">
                <FileSpreadsheet className="h-4 w-4" /> Exportar Base
            </Button>
          )}
          <div className="bg-white border-2 border-slate-200 px-6 py-4 rounded-[2rem] flex items-center gap-4 shadow-sm">
              <div className="h-10 w-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                  <span className="text-2xl font-black text-slate-900 leading-none">{authorizedUsers.length}</span>
                  <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">Fiscais Ativos</span>
              </div>
          </div>
        </div>
      </header>

      <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] p-4 flex flex-col sm:flex-row items-center gap-3 shadow-xl">
        <div className="relative flex-grow w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar fiscal por nome ou e-mail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-11 h-14 rounded-2xl border-none bg-slate-50 text-slate-900 placeholder:text-slate-400 font-bold text-sm focus-visible:ring-primary/20 shadow-inner"
          />
        </div>
        {isRoot && (
          <Popover open={openCity} onOpenChange={setOpenCity}>
              <PopoverTrigger asChild>
                  <Button variant="ghost" className="w-full sm:w-64 h-14 rounded-2xl text-slate-900 font-black uppercase justify-between hover:bg-slate-50 px-4 text-xs tracking-tight shrink-0">
                      {selectedCity ? selectedCity.toUpperCase() : "TODOS OS MUNICÍPIOS"}
                      <ChevronDown className="ml-2 h-4 w-4 opacity-30" />
                  </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border-slate-200 rounded-xl shadow-2xl">
                  <Command className="bg-transparent" shouldFilter={false}>
                      <CommandInput placeholder="Digite a cidade..." value={citySearchTerm} onValueChange={setCitySearchTerm} className="h-11 border-none focus:ring-0" />
                      <CommandList className="max-h-[300px] overflow-y-auto custom-scrollbar">
                          <CommandGroup>
                              <div onClick={() => { setSelectedCity(""); setOpenCity(false); }} className="hover:bg-slate-50 cursor-pointer py-3 px-4 font-black uppercase text-[9px] text-primary border-b border-slate-100">REMOVER FILTRO</div>
                              {filteredMunicipiosList.map((m) => (
                                  <div key={m} onClick={() => { setSelectedCity(m); setOpenCity(false); setCitySearchTerm(""); }} className="hover:bg-blue-50 cursor-pointer py-3 px-4 font-bold uppercase text-[11px] border-b border-slate-50 last:border-0">
                                      {m}
                                  </div>
                              ))}
                          </CommandGroup>
                      </CommandList>
                  </Command>
              </PopoverContent>
          </Popover>
        )}
      </div>

      {isRoot && !selectedCity && Object.keys(groupedByCity).length > 0 && (
        <section className="space-y-4">
            <div className="flex items-center gap-2 px-2">
                <Crown className="h-3.5 w-3.5 text-blue-500" />
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Resumo por Município</h2>
            </div>
            <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm divide-y divide-slate-50">
                {Object.entries(groupedByCity).map(([city, cityUsers]: [string, any]) => {
                    const gestoresCount = cityUsers.filter((u: any) => u.role === 'admin').length;
                    const fiscaisCount = cityUsers.filter((u: any) => u.role === 'fiscal').length;
                    return (
                        <button key={city} onClick={() => setSelectedCity(city)} className="w-full flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50 transition-colors text-left">
                            <span className="font-black text-xs uppercase italic text-slate-900">{city}</span>
                            <div className="flex items-center gap-2 shrink-0">
                                <Badge className="bg-blue-50 text-blue-600 border-none text-[9px] font-black px-3 h-5">{gestoresCount} GESTOR(ES)</Badge>
                                <Badge className="bg-emerald-50 text-emerald-600 border-none text-[9px] font-black px-3 h-5">{fiscaisCount} FISCAL(IS)</Badge>
                            </div>
                        </button>
                    )
                })}
            </div>
        </section>
      )}

      <div className="space-y-12">
        {/* SOLICITAÇÕES PENDENTES DA CIDADE */}
        {pendingUsers.length > 0 && (
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-2">
                    <Badge className="bg-amber-100 text-amber-700 text-[10px] font-black uppercase rounded-lg px-3">Ação Necessária</Badge>
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Solicitações Aguardando</h2>
                </div>
                <div className="grid gap-4">
                    {pendingUsers.map((u) => (
                    <div key={u.uid || u.id} className="bg-white border-2 border-amber-100 p-6 rounded-[2.5rem] flex flex-col sm:flex-row items-center justify-between gap-6 hover:shadow-xl transition-all animate-in fade-in zoom-in">
                        <div className="flex items-center gap-5 w-full">
                            <Avatar className="h-16 w-16 border-2 border-amber-50">
                                <AvatarFallback className="bg-amber-50 text-amber-500 font-black text-xl">{(u.displayName || "F")[0]}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                                <h3 className="text-xl font-black text-slate-900 truncate italic tracking-tighter uppercase">{u.displayName}</h3>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{u.email}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                            <Button onClick={() => toggleAuth(u.id || u.uid, false, u.email)} className="flex-1 sm:flex-none h-12 px-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[10px] shadow-lg transition-all active:scale-95">
                                <UserCheck className="mr-2 h-4 w-4" /> Autorizar Fiscal
                            </Button>
                            <Button onClick={() => handleRejeitar(u.id || u.uid)} variant="ghost" className="h-12 px-6 rounded-xl text-rose-500 hover:bg-rose-50 font-black uppercase text-[10px] tracking-widest gap-2 transition-all">
                                <UserX className="h-4 w-4" /> Recusar
                            </Button>
                        </div>
                    </div>
                    ))}
                </div>
            </section>
        )}

        {/* ACESSO REVOGADO - separado das solicitações novas pra não ser
            contado como pedido inédito (nem aqui, nem na notificação do
            Dashboard) — ainda dá pra reautorizar direto daqui. */}
        {revokedUsers.length > 0 && (
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-2">
                    <Badge className="bg-zinc-100 text-zinc-500 text-[10px] font-black uppercase rounded-lg px-3">Inativo</Badge>
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Acesso Revogado</h2>
                </div>
                <div className="grid gap-4">
                    {revokedUsers.map((u) => (
                    <div key={u.uid || u.id} className="bg-white border-2 border-zinc-100 p-6 rounded-[2.5rem] flex flex-col sm:flex-row items-center justify-between gap-6 hover:shadow-xl transition-all animate-in fade-in zoom-in">
                        <div className="flex items-center gap-5 w-full">
                            <Avatar className="h-16 w-16 border-2 border-zinc-50">
                                <AvatarFallback className="bg-zinc-100 text-zinc-400 font-black text-xl">{(u.displayName || "F")[0]}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                                <h3 className="text-xl font-black text-slate-900 truncate italic tracking-tighter uppercase">{u.displayName}</h3>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{u.email}</p>
                            </div>
                        </div>
                        <Button onClick={() => toggleAuth(u.id || u.uid, false, u.email)} variant="outline" className="w-full sm:w-auto h-12 px-8 rounded-xl border-zinc-200 text-zinc-600 font-black uppercase text-[10px] shadow-sm transition-all active:scale-95">
                            <UserCheck className="mr-2 h-4 w-4" /> Reautorizar
                        </Button>
                    </div>
                    ))}
                </div>
            </section>
        )}

        {/* LISTA DE ATIVOS - CARD DESIGN REFORÇADO */}
        <section className="space-y-8">
            <div className="flex items-center justify-between px-2">
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Corpo de Fiscalização Municipal</h2>
                <div className="flex items-center gap-2">
                    <History className="h-3 w-3 text-zinc-300" />
                    <span className="text-[8px] font-black text-zinc-300 uppercase tracking-widest">Sincronizado em tempo real</span>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {authorizedUsers.map((u) => (
                    <Card key={u.uid || u.id} className="rounded-[3rem] border-slate-100 shadow-sm hover:shadow-2xl transition-all overflow-hidden group border-2">
                        <div className="bg-slate-900 p-8 flex flex-col items-center text-center gap-4 relative overflow-hidden">
                            {/* Reflexo metálico no topo do card */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                            
                            <Avatar className="h-24 w-24 border-4 border-white/10 shadow-2xl ring-2 ring-slate-800">
                                <AvatarImage src={u.photoURL} />
                                <AvatarFallback className="bg-slate-800 text-white font-black text-2xl uppercase">{(u.displayName || "F")[0]}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 z-10">
                                <h3 className="text-lg font-black text-white truncate italic tracking-tighter uppercase leading-none">{u.displayName}</h3>
                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2 truncate">{u.email}</p>
                            </div>
                            <Badge className={cn("z-10 text-[7px] font-black uppercase border-none px-3", u.role === 'admin' ? "bg-blue-600 text-white" : "bg-emerald-600 text-white")}>
                                {u.role === 'admin' ? 'GESTOR' : 'FISCAL SANITÁRIO'}
                            </Badge>
                        </div>
                        <CardContent className="p-8 space-y-8 bg-white">
                            <div className="grid grid-cols-1 gap-6">
                                <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                    <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><Hash className="h-3 w-3 text-primary" /> Identificador Fiscal (ID Processo)</span>
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 relative">
                                            <Input 
                                                defaultValue={u.fiscalCode || ""} 
                                                placeholder="---"
                                                className="h-12 w-full pl-4 pr-10 rounded-xl bg-white border-2 border-slate-100 font-black text-sm text-primary uppercase focus-visible:ring-primary/10"
                                                onBlur={(e) => handleUpdateFiscalCode(u.id || u.uid, u.email, e.target.value)}
                                            />
                                            <PenTool className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-300 pointer-events-none" />
                                        </div>
                                        <Badge className="bg-primary/5 text-primary text-[7px] font-black border-none uppercase px-2 h-6">Único</Badge>
                                    </div>
                                    <p className="text-[7px] font-bold text-zinc-400 uppercase mt-1 ml-1 leading-tight">Este código prefixa todos os processos gerados por este usuário.</p>
                                </div>

                                <div className="space-y-1 px-1">
                                    <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><IdCard className="h-2.5 w-2.5" /> Lotação Oficial</span>
                                    <p className="text-[10px] font-black text-slate-700 uppercase truncate">{u.cargo || "FISCAL SANITÁRIO"}</p>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[8px] font-black uppercase text-emerald-600 tracking-widest">Conta Ativa</span>
                                </div>
                                <Button 
                                    onClick={() => toggleAuth(u.id || u.uid, true, u.email)}
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-9 px-4 rounded-xl text-rose-500 hover:bg-rose-50 font-black uppercase text-[8px] tracking-widest gap-2 transition-all"
                                >
                                    <UserX className="h-3.5 w-3.5" /> Revogar Acesso
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {authorizedUsers.length === 0 && !localLoading && (
                    <div className="col-span-full py-40 flex flex-col items-center justify-center gap-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[4rem]">
                        <div className="p-6 rounded-full bg-white shadow-xl mb-2">
                            <Inbox className="h-16 w-16 text-slate-200" />
                        </div>
                        <p className="text-[11px] font-black text-zinc-300 uppercase tracking-[0.4em]">Nenhum fiscal autorizado para {displayCity}</p>
                        <Button variant="outline" className="mt-4 rounded-xl font-black text-[9px] uppercase tracking-widest border-zinc-200 text-zinc-400">Verificar Novos Pedidos</Button>
                    </div>
                )}
            </div>
        </section>
      </div>

      <footer className="bg-slate-950 text-white p-10 rounded-[4rem] shadow-2xl border border-white/5 flex flex-col sm:flex-row items-center gap-10">
          <div className="p-5 rounded-[2rem] bg-white/5 shadow-inner">
            <ShieldCheck className="h-12 w-12 text-primary" />
          </div>
          <div className="flex-1 space-y-2">
              <p className="text-[14px] font-black uppercase tracking-widest text-primary italic">Segurança de Identidade Fiscal</p>
              <p className="text-[10px] font-medium text-slate-400 uppercase leading-relaxed text-justify max-w-3xl">
                  O sistema gerencia automaticamente a exclusividade dos códigos de processo. Cada membro da equipe (incluindo o gestor) deve possuir um identificador numérico único. 
                  Isso evita a duplicidade na geração de documentos oficiais e garante a rastreabilidade jurídica de cada autuação.
              </p>
          </div>
      </footer>
    </div>
  )
}
