
"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useMessages, useComments } from "@/hooks/use-messages"
import { useStorage } from "@/firebase"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { 
  Plus, 
  MessageSquare, 
  Loader2, 
  Inbox, 
  ImageIcon, 
  ThumbsUp, 
  CheckCircle2,
  Send,
  ChevronLeft,
  User,
  Trash2,
  MapPin
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

export default function RecadosPage() {
  const { profile } = useAuth()
  const storage = useStorage()
  const { toast } = useToast()
  
  const { messages, loadingMessages, sendMessage, deleteMessage, toggleLike } = useMessages()
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false)
  
  const [newMessage, setNewMessage] = useState("")
  const [newTitle, setNewTitle] = useState("")
  const [msgType, setMsgType] = useState<'message' | 'os'>('message')
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [attachedImage, setAttachedImage] = useState<string | null>(null)
  const [isComposeOpen, setIsComposeOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedMessageId && scrollRef.current) {
        scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedMessageId])

  const handleSelectMessage = (id: string) => {
    setSelectedMessageId(id)
    setIsMobileDetailOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deseja realmente remover este comunicado?")) return;
    try {
      await deleteMessage(id);
      if (selectedMessageId === id) setSelectedMessageId(null);
      toast({ title: "Removido" });
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao excluir" });
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !storage || !profile?.uid) return
    
    setUploadStatus('uploading')
    try {
      const storageRef = ref(storage, `recados/${profile.uid}_${Date.now()}`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      setAttachedImage(url)
      setUploadStatus('success')
    } catch (e) {
      setUploadStatus('error')
    }
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim()) return;

    setIsSending(true)
    try {
        await sendMessage({
          title: newTitle,
          text: newMessage,
          imageUrl: attachedImage,
          type: msgType
        })
        setNewMessage("")
        setNewTitle("")
        setAttachedImage(null)
        setUploadStatus('idle')
        setIsComposeOpen(false)
    } finally {
      setIsSending(false)
    }
  }

  const selectedMessage = messages.find(m => m.id === selectedMessageId)

  return (
    <div className="flex h-[calc(100vh-80px)] bg-background font-sans overflow-hidden rounded-3xl border border-border shadow-sm">
      <main className={cn("w-full sm:w-80 md:w-96 border-r border-border bg-card flex flex-col shrink-0", isMobileDetailOpen ? "hidden sm:flex" : "flex")}>
        <header className="h-16 border-b border-border flex items-center justify-between px-4 shrink-0 bg-slate-50/50">
           <div className="flex flex-col">
             <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground">Mural de Recados</h2>
             <div className="flex items-center gap-1 opacity-50">
                <MapPin className="h-2 w-2" />
                <span className="text-[8px] font-bold uppercase">{profile?.municipioId || "Geral"}</span>
             </div>
           </div>
           <Button onClick={() => setIsComposeOpen(true)} size="icon" className="h-9 w-9 rounded-xl shadow-lg shadow-primary/20"><Plus className="h-4 w-4" /></Button>
        </header>

        <ScrollArea className="flex-1">
          <div className="divide-y divide-border/40">
            {loadingMessages ? (
              <div className="p-12 flex flex-col items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-primary/40" /></div>
            ) : messages.map(msg => (
              <button key={msg.id} onClick={() => handleSelectMessage(msg.id)} className={cn("w-full p-5 text-left transition-all hover:bg-muted/30 relative", selectedMessageId === msg.id ? "bg-muted/50 border-l-[3px] border-primary" : "border-l-[3px] border-transparent")}>
                <div className="flex items-center justify-between mb-1.5">
                   <span className="text-[9px] font-black uppercase text-primary">{msg.senderName}</span>
                   <span className="text-[8px] font-bold text-muted-foreground uppercase">{msg.createdAt ? format(msg.createdAt, "HH:mm") : "..."}</span>
                </div>
                <h4 className={cn("text-[11px] font-black uppercase tracking-tight mb-1 truncate", msg.type === 'os' ? "text-amber-600" : "text-slate-900")}>{msg.title || "Comunicado"}</h4>
                <p className="text-[10px] text-muted-foreground line-clamp-1 opacity-70">{msg.text}</p>
              </button>
            ))}
          </div>
        </ScrollArea>
      </main>

      <section className={cn("flex-1 bg-slate-50/30 flex flex-col overflow-hidden", isMobileDetailOpen ? "flex" : "hidden sm:flex")}>
        {!selectedMessage ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center opacity-30"><MessageSquare className="h-16 w-16 mb-4" /><h3 className="text-[10px] font-black uppercase tracking-[0.4em]">Selecione um aviso</h3></div>
        ) : (
          <div className="flex flex-col h-full">
            <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
               <div className="flex items-center gap-4 overflow-hidden">
                  <Button variant="ghost" size="icon" onClick={() => setIsMobileDetailOpen(false)} className="sm:hidden rounded-lg"><ChevronLeft className="h-4 w-4" /></Button>
                  <div className="overflow-hidden">
                     <h2 className="text-[11px] font-black uppercase italic text-slate-900">{selectedMessage.senderName}</h2>
                     <p className="text-[8px] font-bold text-muted-foreground uppercase">{selectedMessage.createdAt ? format(selectedMessage.createdAt, "dd/MM/yyyy HH:mm") : "..."}</p>
                  </div>
               </div>
               {(profile?.uid === selectedMessage.senderId || profile?.role === 'admin') && (
                 <Button variant="ghost" size="icon" onClick={() => handleDelete(selectedMessage.id)} className="text-zinc-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></Button>
               )}
            </header>
            <ScrollArea className="flex-1">
              <div ref={scrollRef} className="max-w-4xl mx-auto p-6 sm:p-10 space-y-8">
                <h1 className="text-2xl sm:text-4xl font-black uppercase italic tracking-tighter text-slate-900 leading-[0.95]">{selectedMessage.title}</h1>
                <div className="bg-white p-6 sm:p-10 rounded-[2.5rem] border border-slate-100 text-sm sm:text-base leading-relaxed text-slate-700 whitespace-pre-wrap font-medium shadow-sm">{selectedMessage.text}</div>
                {selectedMessage.imageUrl && <img src={selectedMessage.imageUrl} className="rounded-[2.5rem] border border-slate-200 shadow-xl w-full h-auto max-h-[500px] object-cover" />}
                <div className="pt-6 flex items-center justify-between border-t border-slate-100">
                  <Button onClick={() => toggleLike(selectedMessage.id, selectedMessage.likes.includes(profile?.uid || ""))} variant="ghost" size="sm" className={cn("rounded-full gap-2 font-black uppercase text-[10px] tracking-widest px-6 h-11 transition-all", selectedMessage.likes.includes(profile?.uid || "") ? "bg-primary/10 text-primary" : "bg-white border border-slate-200")}>
                    <ThumbsUp className={cn("h-4 w-4", selectedMessage.likes.includes(profile?.uid || "") && "fill-primary")} /> {selectedMessage.likes.length} Cientes
                  </Button>
                </div>
                <CommentsSection messageId={selectedMessageId} />
              </div>
            </ScrollArea>
          </div>
        )}
      </section>

      <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
        <DialogContent className="sm:max-w-xl p-0 rounded-[2.5rem] overflow-hidden border-none shadow-2xl bg-white">
          <DialogHeader className="p-8 bg-zinc-900 text-white border-b border-white/5"><DialogTitle className="font-black uppercase italic tracking-tighter text-xl">Novo Recado</DialogTitle></DialogHeader>
          <form onSubmit={handleSend} className="p-8 space-y-6">
            <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl">
              <button type="button" onClick={() => setMsgType('message')} className={cn("flex-1 h-10 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all", msgType === 'message' ? "bg-white text-primary shadow-sm" : "text-muted-foreground")}>COMUNICADO</button>
              <button type="button" onClick={() => setMsgType('os')} className={cn("flex-1 h-10 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all", msgType === 'os' ? "bg-white text-amber-600 shadow-sm" : "text-muted-foreground")}>ORDEM SERVIÇO</button>
            </div>
            <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value.toUpperCase())} placeholder="TÍTULO DO ASSUNTO" className="h-12 rounded-xl bg-slate-50 border-none font-bold uppercase" />
            <Textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Conteúdo da mensagem..." className="min-h-[160px] rounded-2xl bg-slate-50 border-none resize-none" required />
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              <Label htmlFor="photo-attach" className="cursor-pointer flex items-center gap-3 text-[10px] font-black uppercase text-primary"><ImageIcon className="h-5 w-5" /> {uploadStatus === 'success' ? "Anexo Pronto" : "Anexar Imagem"}<input id="photo-attach" type="file" className="sr-only" accept="image/*" onChange={handleFileUpload} disabled={uploadStatus === 'uploading'} /></Label>
              {uploadStatus === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            </div>
            <Button type="submit" disabled={!newMessage.trim() || uploadStatus === 'uploading' || isSending} className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 font-black uppercase text-[11px] shadow-xl shadow-primary/20">{isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Publicar no Mural"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CommentsSection({ messageId }: { messageId: string | null }) {
  const { comments, loadingComments, addComment } = useComments(messageId)
  const [newComment, setNewComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (comments.length > 0) commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [comments])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || isSubmitting) return
    setIsSubmitting(true)
    try { await addComment(newComment); setNewComment(""); } finally { setIsSubmitting(false) }
  }

  return (
    <div className="space-y-6 pt-10 border-t border-slate-100">
      <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Feedback ({comments.length})</h3>
      <div className="space-y-4 max-w-2xl">
        {loadingComments ? <Loader2 className="h-5 w-5 animate-spin mx-auto text-primary/20" /> : comments.map(comment => (
          <div key={comment.id} className="flex gap-3"><div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-400"><User className="h-4 w-4" /></div><div className="flex-1 bg-white p-4 rounded-2xl text-[12px] font-medium border border-slate-100 shadow-sm"><div className="flex justify-between items-center mb-1.5"><span className="text-[9px] font-black uppercase text-primary">{comment.senderName}</span><span className="text-[8px] font-bold text-slate-300 uppercase">{comment.createdAt ? format(comment.createdAt, "HH:mm") : "..."}</span></div><p className="text-slate-600">{comment.text}</p></div></div>
        ))}
        <div ref={commentsEndRef} />
      </div>
      <form onSubmit={handleAdd} className="relative mt-6 max-w-2xl"><Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Comentário técnico..." className="h-12 pl-5 pr-14 rounded-2xl bg-slate-50 border-none text-xs" /><Button type="submit" disabled={!newComment.trim() || isSubmitting} size="icon" className="absolute right-1.5 top-1.5 h-9 w-9 rounded-xl shadow-md">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button></form>
    </div>
  )
}
