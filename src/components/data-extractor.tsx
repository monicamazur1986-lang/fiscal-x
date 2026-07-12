
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Inbox, Loader2, FileCheck2, AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { extractDataFromIntimacao } from "@/ai/flows/extract-data-from-intimacao"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"

export function DataExtractor() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [extractedData, setExtractedData] = useState<Record<string, any> | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { toast } = useToast()
  const { profile } = useAuth()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setExtractedData(null)
      setError(null)
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
      }
      reader.readAsDataURL(selectedFile)
    }
  }

  const handleExtract = async () => {
    if (!file) {
      toast({
        variant: "destructive",
        title: "Nenhum arquivo selecionado",
        description: "Por favor, selecione um arquivo de imagem para extrair os dados.",
      })
      return
    }

    setIsLoading(true)
    setError(null)
    setExtractedData(null)

    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = async () => {
      const base64Data = reader.result as string
      try {
        const result = await extractDataFromIntimacao({ intimacaoFormDataUri: base64Data, uid: profile?.uid || '' })
        setExtractedData(result.extractedData)
        // Notificação de sucesso removida para reduzir ruído visual
      } catch (err) {
        console.error(err)
        setError("Falha ao extrair dados do documento. A IA pode não ter conseguido processar a imagem. Tente novamente com uma imagem mais nítida.")
        toast({
          variant: "destructive",
          title: "Erro na Extração",
          description: "Não foi possível extrair dados do documento.",
        })
      } finally {
        setIsLoading(false)
      }
    }
    reader.onerror = (error) => {
        console.error("File reading error:", error);
        setError("Failed to read file.");
        setIsLoading(false);
    }
  }

  const handleCreateIntimacao = () => {
    if (!extractedData) return;
    const queryString = encodeURIComponent(JSON.stringify(extractedData));
    router.push(`/intimacoes/nova?data=${queryString}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Extrair Dados de Documento</CardTitle>
        <CardDescription>
          Faça o upload de uma imagem de uma intimação preenchida e a IA irá
          extrair os dados para um novo registro.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-2 border-dashed border-muted-foreground/50 rounded-lg p-8 flex flex-col items-center justify-center text-center">
          <Inbox className="h-12 w-12 text-muted-foreground/70" />
          <label htmlFor="file-upload" className="mt-4 text-sm font-medium text-primary underline cursor-pointer">
            Clique para fazer upload
            <input id="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" />
          </label>
          <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, GIF até 10MB</p>
        </div>

        {preview && (
          <div className="mt-4">
            <h3 className="font-semibold mb-2">Pré-visualização:</h3>
            <img src={preview} alt="File preview" className="max-w-full h-auto rounded-md border" />
          </div>
        )}

        {error && (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}

        {extractedData && (
          <div className="mt-4 space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-green-600" />
                Dados Extraídos:
            </h3>
            <pre className="bg-muted/50 p-4 rounded-md text-sm overflow-x-auto">
              {JSON.stringify(extractedData, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        {extractedData && (
            <Button onClick={handleCreateIntimacao}>
                Criar Intimação com Dados Extraídos
            </Button>
        )}
        <Button onClick={handleExtract} disabled={!file || isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Extraindo...
            </>
          ) : (
            "Extrair Dados"
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
