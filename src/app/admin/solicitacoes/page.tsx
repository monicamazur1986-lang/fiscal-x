
"use client"

import { useAuth } from "@/hooks/use-auth"
import { useFirestore } from "@/firebase"
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore"
import { useEffect, useState, useMemo, useCallback } from "react"
import { 
  ShieldCheck, 
  CheckCircle2, 
  Loader2, 
  MapPin, 
  X, 
  UserCheck, 
  Ban, 
  Trash2, 
  Search, 
  FileSpreadsheet, 
  ChevronDown, 
  Inbox,
  Mail,
  Crown,
  Users,
  IdCard,
  Hash
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import municipiosPR from "@/lib/municipios-pr.json"
import { cn } from "@/lib/utils"
import Papa from "papaparse"

export default function AuditoriaMasterPage() {
  const { profile, loading: authLoading } = useAuth()
  const db = useFirestore()
  const router = useRouter()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<'pending' | 'management'>('pending')
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  const [selectedUser, setSelectedUser] = useState<any | null>(null)
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'delete' | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState("")
  
  const [openCity, setOpenCity] = useState(false)
  const [selectedCity, setSelectedCity] = useState("")
  const [citySearchTerm, setCitySearchTerm] = useState("")

  const MASTER_DB_KEY = 'FISCALX_MASTER_STORAGE_V6';

  useEffect(() => {
    if (!authLoading && profile?.role !== 'root') {
      router.replace("/dashboard")
    }
  }, [profile, authLoading, router])

  const loadLocalMasterList = useCallback(() => {
    try {
      return JSON.parse(localStorage.getItem(MASTER_DB_KEY) || '[]');
    } catch (e) { return []; }
  }, []);

  const refreshUI = useCallback((snapshotDocs: any[] = []) => {
    const fbList = snapshotDocs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    const locals = loadLocalMasterList();

    const combined = [...fbList, ...locals].reduce((acc, current) => {
      const x = acc.find((item: any) => item.email.toLowerCase() === current.email.toLowerCase());
      if (!x) return acc.concat([current]);
      else return acc;
    }, []);

    setAllUsers(combined);
    setLoading(false);
  }, [loadLocalMasterList]);

  useEffect(() => {
    if (authLoading || profile?.role !== 'root') return;
    setLoading(true);
    
    if (!db) {
      refreshUI();
      return;
    }

    const qAll = query(collection(db, "users"))
    const unsub = onSnapshot(qAll, (snap) => refreshUI(snap.docs));
    return () => unsub();
  }, [db, authLoading, profile, refreshUI]);

  const calculateNextFiscalCode = (municipioId: string) => {
    const muniUsers = allUsers.filter(u => u.municipioId === municipioId);
    let max = 0;
    muniUsers.forEach(u => {
      const code = parseInt(u.fiscalCode || "0", 10);
      if (code > max) max = code;
    });
    return (max + 1).toString().padStart(3, '0');
  }

  const handleUserAction = async () => {
    if (!selectedUser || !actionType) return;

    if (actionType === 'delete') {
        const localList = loadLocalMasterList();
        const updated = localList.filter((u: any) => u.email.toLowerCase() !== selectedUser.email.toLowerCase());
        localStorage.setItem(MASTER_DB_KEY, JSON.stringify(updated));
        
        if (db && !selectedUser.isLocal) {
            try { await deleteDoc(doc(db, "users", selectedUser.id || selectedUser.uid)); } catch (e) {}
        }
        refreshUI();
        toast({ title: "Registro Removido" });
        setActionType(null);
        setSelectedUser(null);
        return;
    }

    let autoFiscalCode = selectedUser.fiscalCode;
    if (actionType === 'approve' && (!selectedUser.fiscalCode || selectedUser.fiscalCode === "")) {
        autoFiscalCode = calculateNextFiscalCode(selectedUser.municipioId);
    }

    const updateData: any = {
      status: actionType === 'approve' ? 'approved' : 'rejected',
      isAuthorized: actionType === 'approve',
      fiscalCode: autoFiscalCode,
      adminFeedback: feedbackMsg.toUpperCase(),
      updatedAt: new Date().toISOString()
    };

    const localList = loadLocalMasterList();
    const updatedLocal = localList.map((u: any) => 
      u.email.toLowerCase() === selectedUser.email.toLowerCase() ? { ...u, ...updateData } : u
    );
    localStorage.setItem(MASTER_DB_KEY, JSON.stringify(updatedLocal));

    if (db && !selectedUser.isLocal) {
      try {
        await updateDoc(doc(db, "users", selectedUser.id || selectedUser.uid), updateData);
        toast({ title: "Status Atualizado" });
      } catch (e) {
        toast({ variant: "destructive", title: "Erro na sincronização" });
      }
    }
    
    refreshUI();
    setActionType(null);
    setSelectedUser(null);
    setFeedbackMsg("");
  }

  const exportGeneralReport = () => {
    const dataToExport = allUsers.map(u => ({
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
    link.setAttribute("download", `AUDITORIA_MASTER_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Relatório Gerado" });
  }

  const normalize = (str: string) => (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const filteredMunicipiosList = useMemo(() => {
    const term = normalize(citySearchTerm);
    if (!term) return municipiosPR;
    return municipiosPR.filter(m => normalize(m).includes(term));
  }, [citySearchTerm]);

  const matchesFilter = (u: any) => {
    if (!selectedCity) return true;
    const cityA = normalize(u.municipioNome || "");
    const cityB = normalize(u.municipioId || "");
    const target = normalize(selectedCity);
    return cityA.includes(target) || cityB.includes(target);
  };

  const pendingUsers = useMemo(() => 
    allUsers.filter(u => !u.isAuthorized && (u.status === 'pending' || !u.status)).filter(matchesFilter), 
    [allUsers, selectedCity]
  );

  const citySummary = useMemo(() => {
    if (!selectedCity) return null;
    const cityUsers = allUsers.filter(u => normalize(u.municipioNome || u.municipioId) === normalize(selectedCity));
    const gestores = cityUsers.filter(u => u.role === 'admin' && u.isAuthorized);
    const fiscais = cityUsers.filter(u => u.role === 'fiscal' && u.isAuthorized);
    return { gestores, fiscais, total: cityUsers.length };
  }, [selectedCity, allUsers]);

  const groupedByCity = useMemo(() => {
    const audited = allUsers.filter(u => u.isAuthorized).filter(matchesFilter);
    const grouped: Record<string, any[]> = {};
    audited.forEach(u => {
      const city = (u.municipioNome || u.municipioId || "INDETERMINADO").toUpperCase();
      if (!grouped[city]) grouped[city] = [];
      grouped[city].push(u);
    });
    return grouped;
  }, [allUsers, selectedCity]);

  if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>

  return (
    <div className="max-w-6xl mx-auto w-full p-4 sm:p-8 space-y-8 font-sans pb-32">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-lg">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
                <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter">Auditoria Master</h1>
                <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Supervisão Técnica Central</p>
            </div>
        </div>
        
        <Button onClick={exportGeneralReport} variant="outline" className="h-11 px-6 rounded-xl border-zinc-200 text-zinc-600 font-black uppercase text-[9px] tracking-widest gap-2 hover:bg-zinc-50 shadow-sm transition-all">
            <FileSpreadsheet className="h-4 w-4" /> Exportar Base
        </Button>
      </header>

      <div className="bg-white border border-slate-200 rounded-2xl p-2.5 flex items-center gap-3 shadow-sm">
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <MapPin className="h-4 w-4 text-slate-400" />
          <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Localidade:</span>
        </div>
        <div className="flex-1">
            <Popover open={openCity} onOpenChange={setOpenCity}>
                <PopoverTrigger asChild>
                    <Button variant="ghost" className="w-full h-11 rounded-xl text-slate-900 font-black uppercase justify-between hover:bg-slate-50 px-4 text-xs tracking-tight">
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
        </div>
      </div>

      {/* RAIO-X DA UNIDADE - MINIMALISTA E COMPLETO */}
      {citySummary && (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] p-6 sm:p-10 shadow-sm animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between mb-8 border-b border-slate-50 pb-6">
                <div>
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900 italic">{selectedCity.toUpperCase()}</h2>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Quadro de Pessoal Ativo</p>
                </div>
                <Badge className="bg-slate-900 text-white font-black text-[9px] px-4 py-1.5 rounded-full">
                    {citySummary.total} SERVIDOR(ES)
                </Badge>
            </div>

            <div className="grid grid-cols-1 gap-10">
                {/* GESTORES */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Crown className="h-3.5 w-3.5 text-blue-500" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-600/70">Gestão Local</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {citySummary.gestores.map((g: any) => (
                            <div key={g.uid || g.id} className="flex items-center gap-5 p-5 rounded-2xl border border-slate-100 bg-slate-50/50">
                                <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                                    <AvatarImage src={g.photoURL} />
                                    <AvatarFallback className="bg-blue-100 text-blue-600 font-black text-xs uppercase">{g.displayName?.[0] || 'G'}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <h4 className="text-[13px] font-black uppercase truncate text-slate-900 leading-none">{g.displayName}</h4>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1.5"><Mail className="h-2.5 w-2.5 opacity-50" /> {g.email}</span>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1.5"><IdCard className="h-2.5 w-2.5 opacity-50" /> CPF: {g.cpf || "N/I"}</span>
                                        <span className="text-[9px] font-black text-blue-600 uppercase tracking-tight"><Hash className="inline h-2.5 w-2.5 mr-1" />{g.fiscalCode || "---"}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* FISCAIS */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Users className="h-3.5 w-3.5 text-emerald-500" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-600/70">Equipe Técnica</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {citySummary.fiscais.map((f: any) => (
                            <div key={f.uid || f.id} className="p-5 rounded-2xl border border-slate-100 hover:bg-slate-50 transition-all space-y-3">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-9 w-9 border border-slate-100">
                                        <AvatarImage src={f.photoURL} />
                                        <AvatarFallback className="bg-slate-100 text-slate-400 font-black text-[10px]">{f.displayName?.[0] || 'F'}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <h4 className="text-[11px] font-black uppercase truncate text-slate-800 leading-none">{f.displayName}</h4>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase truncate mt-1">{f.email}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-50">
                                    <div className="space-y-0.5">
                                        <p className="text-[7px] font-black text-slate-300 uppercase tracking-tight">CPF</p>
                                        <p className="text-[9px] font-black text-slate-600 truncate">{f.cpf || "N/I"}</p>
                                    </div>
                                    <div className="space-y-0.5">
                                        <p className="text-[7px] font-black text-slate-300 uppercase tracking-tight">ID FISCAL</p>
                                        <p className="text-[9px] font-black text-emerald-600">{f.fiscalCode || "---"}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-100 p-1 rounded-2xl h-14">
            <TabsTrigger value="pending" className="rounded-xl text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-primary shadow-none">
                Novos Pedidos ({pendingUsers.length})
            </TabsTrigger>
            <TabsTrigger value="management" className="rounded-xl text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-slate-900 data-[state=active]:text-white shadow-none">
                Municípios Auditados
            </TabsTrigger>
        </TabsList>

        <div className={cn("pt-8 space-y-6", activeTab !== 'pending' && "hidden")}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 space-y-4">
                    {pendingUsers.map((u) => (
                        <div key={u.uid || u.id || u.email} className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-6 transition-all hover:shadow-md">
                            <div className="flex items-center gap-5 w-full min-w-0">
                                <Avatar className="h-14 w-14 border border-slate-100">
                                    <AvatarImage src={u.photoURL} />
                                    <AvatarFallback className="bg-slate-50 text-slate-400 font-black text-lg">{(u.displayName || "U")[0]}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <h3 className="text-lg font-black text-slate-900 uppercase italic tracking-tighter truncate">{u.displayName}</h3>
                                      <Badge className={cn("text-[7px] font-black uppercase border-none", u.role === 'admin' ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700")}>
                                        {u.role === 'admin' ? 'GESTOR' : 'FISCAL'}
                                      </Badge>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className="text-slate-500 text-[8px] font-black uppercase">{(u.municipioNome || u.municipioId || "---").toUpperCase()}</Badge>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase truncate">{u.email}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 w-full sm:w-auto shrink-0">
                                <Button onClick={() => { setSelectedUser(u); setActionType('approve'); }} className="flex-1 sm:w-40 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">
                                    <UserCheck className="mr-2 h-4 w-4" /> Aprovar
                                </Button>
                                <Button onClick={() => { setSelectedUser(u); setActionType('reject'); }} variant="ghost" className="h-12 w-12 rounded-xl text-rose-500 hover:bg-rose-50">
                                    <Ban className="h-5 w-5" />
                                </Button>
                            </div>
                        </div>
                    ))}
                    {pendingUsers.length === 0 && (
                        <div className="py-32 text-center border-2 border-dashed border-slate-100 rounded-[2.5rem]">
                            <Inbox className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                            <p className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Nenhum pedido pendente</p>
                        </div>
                    )}
                </div>

                <div className="lg:col-span-4 space-y-4">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">Atividade Recente</h2>
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto custom-scrollbar">
                            {allUsers.filter(u => u.isAuthorized).slice(0, 10).map((u) => (
                                <div key={u.uid || u.id || u.email} className="p-4 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center font-black text-[10px] text-slate-300">{(u.displayName || "U")[0]}</div>
                                        <div className="min-w-0">
                                            <h4 className="text-[10px] font-black text-slate-800 truncate uppercase">{u.displayName}</h4>
                                            <p className="text-[8px] font-bold text-slate-400 uppercase truncate">{(u.municipioNome || u.municipioId || "---").toUpperCase()}</p>
                                        </div>
                                    </div>
                                    <Badge className="bg-emerald-50 text-emerald-600 border-none text-[7px] font-black px-2">ATIVO</Badge>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className={cn("pt-8", activeTab !== 'management' && "hidden")}>
            <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                <Table>
                    <TableHeader className="bg-slate-900 text-white border-none">
                        <TableRow className="hover:bg-slate-900 border-none h-14">
                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-white px-8">Localidade</TableHead>
                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-white text-center">Gestores</TableHead>
                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-white text-center">Fiscais</TableHead>
                            <TableHead className="text-[9px] font-black uppercase tracking-widest text-white text-right px-8">Ação</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {Object.entries(groupedByCity).map(([city, users]: [string, any]) => {
                            const gestoresCount = users.filter((u: any) => u.role === 'admin' && u.isAuthorized).length;
                            const fiscaisCount = users.filter((u: any) => u.role === 'fiscal' && u.isAuthorized).length;
                            return (
                                <TableRow key={city} className="hover:bg-slate-50 transition-colors border-slate-100">
                                    <TableCell className="px-8 py-6">
                                        <span className="font-black text-xs uppercase italic text-slate-900">{city}</span>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge className="bg-blue-50 text-blue-600 border-none text-[9px] font-black px-3 h-5">
                                            {gestoresCount}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge className="bg-emerald-50 text-emerald-600 border-none text-[9px] font-black px-3 h-5">
                                            {fiscaisCount}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right px-8">
                                        <Button onClick={() => { setSelectedCity(city); window.scrollTo({ top: 0, behavior: 'smooth' }); }} variant="ghost" className="h-9 rounded-xl font-black text-[9px] uppercase tracking-widest text-primary hover:bg-primary/5">
                                            Ver Unidade
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
      </Tabs>

      <Dialog open={!!actionType && actionType !== 'delete'} onOpenChange={(o) => !o && setActionType(null)}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Conferência Técnica</DialogTitle>
            <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Parecer oficial para o servidor</DialogDescription>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <Textarea 
              placeholder="Digite o motivo da aprovação ou recusa..."
              value={feedbackMsg}
              onChange={(e) => setFeedbackMsg(e.target.value)}
              className="min-h-[120px] rounded-2xl bg-slate-50 border-none font-bold text-xs uppercase"
            />
          </div>
          <DialogFooter>
            <Button onClick={handleUserAction} className={cn("w-full h-14 rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-xl", actionType === 'reject' ? "bg-rose-600 hover:bg-rose-700" : "bg-primary hover:bg-primary/90")}>
              Confirmar Decisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
