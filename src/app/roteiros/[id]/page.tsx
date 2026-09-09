
"use client"

import { use, useState, useMemo, useRef, useEffect, useCallback } from "react"
import { 
  ArrowLeft, 
  Building2, 
  FileSearch, 
  Loader2, 
  Camera, 
  Download, 
  PenTool, 
  Check, 
  X, 
  Trash2, 
  Maximize2, 
  Minimize2, 
  FileText, 
  Save, 
  MessageSquare, 
  Plus, 
  ClipboardList, 
  Mic, 
  MicOff, 
  Sparkles, 
  Smartphone, 
  Search, 
  CheckCircle2,
  Scale,
  ListFilter,
  CheckSquare,
  Square,
  Cloud,
  History,
  Eraser,
  Landmark,
  Clock,
  Pencil
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn, normalizeId } from "@/lib/utils"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"
import { storage, auth as firebaseAuth } from "@/lib/firebase"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { useAppConfig } from "@/hooks/use-app-config"
import { useAuth } from "@/hooks/use-auth"
import { useInspecoes } from "@/hooks/use-inspecoes"
import { useMunicipiosAtivos } from "@/hooks/use-municipios-ativos"
import { setChecklistExitGuard } from "@/hooks/use-checklist-exit-guard"
import { SelecionarAutoridadeParaFormulario } from "@/components/selecionar-autoridade-dialog"
import { SignaturePad } from "@/components/signature-pad"
import type { Autoridade, Inspecao } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { useRouter } from "next/navigation"
import { Textarea } from "@/components/ui/textarea"
import { polishObservationsBatch } from "@/ai/flows/polish-observations-batch"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog"
import { compressImage, blobToDataUrl } from "@/lib/compress-image"
import { RichTextEditor } from "@/components/rich-text-editor"
import { getDefaultIntroHtml, getDefaultConclusaoHtml, fillRoteiroTextoTokens, resolverIntroHtml, resolverConclusaoHtml } from "@/lib/roteiro-textos-padrao"
import { sanitizeHtml } from "@/lib/sanitize-html"
import { ROI_RADIOGRAFIA_MEDICA, NOTA_CONFORME, type RoiIndicador } from "@/lib/roteiro-roi-radiologia"
import { useSearchParams } from "next/navigation"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup } from "@/components/ui/command"
import municipiosPR from "@/lib/municipios-pr.json"
import { ChevronsUpDown } from "lucide-react"

type Criticality = 'I' | 'N' | 'R'

/** SIM/NÃO/ND nos roteiros comuns; '0'..'5' nos roteiros ROI da ANVISA. */
type NotaRoi = '0' | '1' | '2' | '3' | '4' | '5'
type RespostaItem = 'SIM' | 'NAO' | 'ND' | NotaRoi

/**
 * Um item é não conformidade quando foi respondido "NÃO" (roteiros comuns) ou
 * recebeu nota abaixo de NOTA_CONFORME (roteiros ROI) — nos dois casos é o que
 * entra no relatório como exigência a regularizar.
 */
function ehNaoConformidade(resposta: RespostaItem | undefined): boolean {
  if (resposta === undefined) return false;
  if (resposta === 'NAO') return true;
  return /^\d$/.test(resposta) && Number(resposta) < NOTA_CONFORME;
}

type PhotoSize = 'P' | 'M' | 'G';

interface PhotoEvidence {
  url: string;
  timestamp: string;
  /** Tamanho de exibição escolhido pelo fiscal — ausente equivale a 'M'. */
  size?: PhotoSize;
}

/**
 * Não conformidade incluída manualmente pelo fiscal — para fatos constatados
 * que não estão previstos em nenhum item do roteiro oficial. Entra na lista
 * de não conformidades do relatório do mesmo jeito que um item do roteiro
 * (observação e fotos incluídas), só que ao final do grupo de criticidade
 * escolhido, em vez de vir de uma pergunta do checklist.
 */
interface CustomItem {
  id: string;
  text: string;
  crit: Criticality;
}

// Controla o tamanho da foto pela largura (não mais por uma altura fixa) —
// a imagem sempre mantém a proporção natural (sem cortar e sem sobrar espaço
// vazio na caixa), P só fica visualmente menor por ocupar menos largura.
const PHOTO_SIZE_MAX_WIDTH: Record<PhotoSize, string> = { P: 'max-w-[55%]', M: 'max-w-full', G: 'max-w-full' };

interface ChecklistItem {
  id: string;
  text: string;
  crit: Criticality;
  /** Linha de agrupamento (ex.: "Sistema de sucção.") sem resposta própria — vem do roteiro oficial para organizar os itens seguintes, sem SIM/NÃO/ND. */
  isHeader?: boolean;
  /**
   * Presente só nos roteiros ROI da ANVISA, que não se respondem com
   * SIM/NÃO/ND e sim com uma nota de 0 a 5, cada uma com a descrição do que
   * caracteriza aquele nível. Quando existe, a tela troca os três botões pela
   * lista de alternativas — ver src/lib/roteiro-roi-radiologia.ts.
   */
  roi?: {
    numero: number;
    indicador: string;
    baseLegal: string;
    alternativas: string[];
  };
}

interface ChecklistSection {
  id: string;
  titulo: string;
  itens: ChecklistItem[];
}

interface ChecklistData {
  titulo: string;
  subtitulo: string;
  categoria: string;
  lei: string;
  /** Especialidade exibida no cabeçalho do relatório (ex.: "ODONTOLOGIA"). */
  especialidade: string;
  /**
   * Roteiro Objetivo de Inspeção da ANVISA: respondido por nota 0–5 e SEM os
   * textos narrativos de "Considerações Gerais"/"Conclusão e Prazo Legal" —
   * o ROI é um instrumento de pontuação por indicador, a redação corrida dos
   * demais roteiros não se aplica a ele.
   */
  roi?: boolean;
  secoes: ChecklistSection[];
}

const odontologiaChecklist: ChecklistData = {
  titulo: 'Roteiro de Inspeção de Odontologia',
  subtitulo: 'Resolução SESA nº 0414/2001',
  categoria: 'SAÚDE',
  lei: 'Resolução SESA nº 0414/2001',
  especialidade: 'ODONTOLOGIA',
  secoes: [
    {
      id: 'sec3',
      titulo: '3. ESTRUTURA FÍSICA / CONDIÇÕES GERAIS',
      itens: [
        { id: '3.1', crit: 'R', text: 'O estabelecimento possui cópia do projeto arquitetônico original, aprovado pela Vigilância Sanitária da SESA ou da Secretaria Municipal de Saúde. Em clínicas e instituições de ensino, verificar se o projeto foi aprovado e anotar a data de aprovação. Base legal: Item 3.1 – Res. SESA 0414/01.' },
        { id: '3.2', crit: 'N', text: 'A edificação está de acordo com o projeto aprovado, inclusive quando já passou por reformas ou ampliações. Base legal: Item 3.2 – Res. SESA 0414/01.' },
        { id: '3.3', crit: 'N', text: 'As áreas externas (jardim, pátio, corredores externos, casa de máquinas etc.) e as áreas de apoio (recepção, atendimento, lavanderia, corredores internos, depósitos, sanitários públicos, sala de espera) estão limpas, organizadas e bem conservadas. Base legal: Item 3.3 – Res. SESA 0414/01.' },
      ]
    },
    {
      id: 'sec4',
      titulo: '4. SAÚDE E SEGURANÇA DO TRABALHADOR (em Instituições de Ensino, o corpo discente está sujeito às mesmas exigências)',
      itens: [
        { id: '4.1', crit: 'N', text: 'Os funcionários usam Equipamentos de Proteção Individual (EPIs):', isHeader: true },
        { id: '4.1.1', crit: 'I', text: 'Luvas de uso único para cada paciente, e sobreluva sempre que precisar tocar, com as mãos contaminadas, em superfícies ou objetos como receituários, radiografias, telefone, maçanetas, caneta etc. Base legal: Item 4.1.1 – Res. SESA 0414/01.' },
        { id: '4.1.2', crit: 'I', text: 'Avental de uso exclusivo no ambiente de trabalho, fechado e de mangas longas, trocado diariamente ou sempre que apresentar sujidade. Base legal: Item 4.1.2 – Res. SESA 0414/01.' },
        { id: '4.1.3', crit: 'I', text: 'Máscara, trocada sempre que apresentar sujidade ou umidade. Base legal: Item 4.1.3 – Res. SESA 0414/01.' },
        { id: '4.1.4', crit: 'I', text: 'Protetor ocular, limpo após cada procedimento. Base legal: Item 4.1.4 – Res. SESA 0414/01.' },
        { id: '4.1.5', crit: 'I', text: 'Gorro. Base legal: Item 4.1.5 – Res. SESA 0414/01.' },
        { id: '4.2', crit: 'N', text: 'Os funcionários usam sapatos fechados. Base legal: Item 4.2 – Res. SESA 0414/01.' },
        { id: '4.3', crit: 'R', text: 'O paciente faz um bochecho com solução antisséptica antes de iniciar o procedimento odontológico, para reduzir o número de microrganismos na cavidade oral. Base legal: Item 4.3 – Res. SESA 0414/01.' },
        { id: '4.4', crit: 'I', text: 'Os acidentes de trabalho são notificados. Base legal: Item 4.4 – Res. SESA 0414/01.' },
        { id: '4.5', crit: 'I', text: 'O funcionário acidentado é encaminhado aos serviços de emergência, com investigação do caso quando necessário. Base legal: Item 4.5 – Res. SESA 0414/01.' },
        { id: '4.6', crit: 'I', text: 'Existe uma rotina por escrito de encaminhamento do trabalhador em caso de acidentes com perfurocortantes ou contaminação por materiais biológicos. Base legal: Item 4.6 – Res. SESA 0414/01.' },
        { id: '4.7', crit: 'N', text: 'Há um trabalho de educação continuada sobre Saúde e Segurança no Trabalho para os funcionários, com registro. Base legal: Item 4.7 – Res. SESA 0414/01.' },
        { id: '4.8', crit: 'N', text: 'O ambiente de trabalho oferece condições ergonômicas adequadas de iluminação, mobiliário e ritmo de trabalho/pausas. Base legal: Item 4.8 – Res. SESA 0414/01.' },
        { id: '4.9', crit: 'N', text: 'Os funcionários que atuam na área de radiologia fazem hemograma com contagem de plaquetas, com frequência mínima anual. Base legal: Item 4.9 – Res. SESA 0414/01.' },
        { id: '4.10', crit: 'R', text: 'Os funcionários têm registro de imunização para:', isHeader: true },
        { id: '4.10.1', crit: 'R', text: 'Hepatite B, tétano e rubéola (mulheres em idade fértil). Base legal: Item 4.10 – Res. SESA 0414/01.' },
      ]
    },
    {
      id: 'sec5',
      titulo: '5. COMISSÃO E SERVIÇO DE CONTROLE DE INFECÇÃO ODONTOLÓGICA — CCIO/SCIO (só exigível em Instituições de Ensino)',
      itens: [
        { id: '5.1', crit: 'N', text: 'A CCIO foi constituída por nomeação por escrito e conta com os seguintes representantes:', isHeader: true },
        { id: '5.1.1', crit: 'N', text: 'Corpo docente, com no mínimo dois cirurgiões-dentistas. Base legal: Item 5.1 – Res. SESA 0414/01.' },
        { id: '5.1.2', crit: 'N', text: 'Corpo discente, com no mínimo dois discentes. Base legal: Item 5.1 – Res. SESA 0414/01.' },
        { id: '5.1.3', crit: 'N', text: 'Um enfermeiro. Base legal: Item 5.1 – Res. SESA 0414/01.' },
        { id: '5.1.4', crit: 'N', text: 'Serviço administrativo, com no mínimo um servidor. Base legal: Item 5.1 – Res. SESA 0414/01.' },
        { id: '5.2', crit: 'N', text: 'A CCIO e o SCIO têm Regimento Interno, aprovado pela direção do estabelecimento de ensino — verificar a documentação. Base legal: Item 5.2 – Res. SESA 0414/01.' },
        { id: '5.3', crit: 'N', text: 'A CCIO realiza reuniões periódicas, com frequência mínima bimestral — verificar o registro em livro ata dos últimos 12 meses. Base legal: Item 5.3 – Res. SESA 0414/01.' },
        { id: '5.4', crit: 'N', text: 'O SCIO promove treinamento no mínimo anual para todos os funcionários, com registro do tema, data, periodicidade e assinatura dos participantes. Base legal: Item 5.4 – Res. SESA 0414/01.' },
        { id: '5.5', crit: 'N', text: 'O SCIO mantém Manual de Normas e/ou Rotinas dos Procedimentos realizados em todos os serviços do estabelecimento de ensino. Base legal: Item 5.5 – Res. SESA 0414/01.' },
      ]
    },
    {
      id: 'sec6',
      titulo: '6. CONDIÇÕES DE SANEAMENTO',
      itens: [
        { id: '6.1', crit: 'N', text: 'Os reservatórios de água têm tampas de material impermeável e não corrosivo, com acesso restrito. Base legal: Item 6.1 – Res. SESA 0414/01.' },
        { id: '6.2', crit: 'N', text: 'A limpeza dos reservatórios de água é feita a cada 12 meses, no máximo, com registro. Base legal: Item 6.2 – Res. SESA 0414/01.' },
        { id: '6.3', crit: 'N', text: 'Quando a água vem de fonte própria, é feito controle de qualidade, desinfecção por cloração e análise bacteriológica semestral e físico-química anual, com registro. Base legal: Item 6.3 – Res. SESA 0414/01.' },
        { id: '6.4', crit: 'N', text: 'O estabelecimento é atendido por rede de esgoto conectada e/ou mantém sistema de tratamento interno próprio (fossa séptica e sumidouro ou similar). Base legal: Item 6.4 – Res. SESA 0414/01.' },
        { id: '6.5', crit: 'N', text: 'Os resíduos são acondicionados corretamente:', isHeader: true },
        { id: '6.5.1', crit: 'I', text: 'Resíduos infectantes em saco branco leitoso, identificado. Base legal: Item 6.5.1 – Res. SESA 0414/01.' },
        { id: '6.5.2', crit: 'I', text: 'Material perfurocortante em recipiente rígido e adequado. Base legal: Item 6.5.2 – Res. SESA 0414/01.' },
        { id: '6.5.3', crit: 'N', text: 'Resíduos domiciliares em saco de lixo preto. Base legal: Item 6.5.3 – Res. SESA 0414/01.' },
        { id: '6.5.4', crit: 'R', text: 'Resíduos recicláveis em saco de lixo azul. Base legal: Item 6.5.4 – Res. SESA 0414/01.' },
        { id: '6.6', crit: 'N', text: 'Os resíduos de amálgama, sem elementos estranhos (gazes, algodão etc.), são colocados em recipientes inquebráveis, tampados hermeticamente e cobertos com uma lâmina de água. Base legal: Item 6.6 – Res. SESA 0414/01.' },
        { id: '6.7', crit: 'N', text: 'A rede elétrica não tem fios expostos e é suficiente para os equipamentos existentes. Base legal: Item 6.7 – Res. SESA 0414/01.' },
        { id: '6.8', crit: 'N', text: 'A instalação hidráulica é adequada, sem tubulação aparente e sem vazamentos. Base legal: Item 6.8 – Res. SESA 0414/01.' },
        { id: '6.9', crit: 'N', text: 'Para estabelecimentos que geram mais de 50 litros de resíduos infectantes:', isHeader: true },
        { id: '6.9.1', crit: 'N', text: 'O transporte interno dos resíduos (da fonte geradora até o abrigo) é adequado, com coleta em intervalo inferior a 24 horas. Base legal: Item 6.9.1 – Res. SESA 0414/01.' },
        { id: '6.9.2', crit: 'N', text: 'O abrigo de resíduos é adequado, conforme a NBR 12.809 da ABNT. Base legal: Item 6.9.2 – Res. SESA 0414/01.' },
        { id: '6.9.3', crit: 'N', text: 'Existem rotinas escritas disponíveis aos funcionários para coleta de resíduos, higienização de equipamentos/utensílios e do abrigo, e controle de vetores. Base legal: Item 6.9.3 – Res. SESA 0414/01.' },
        { id: '6.9.4', crit: 'N', text: 'Os funcionários da coleta de resíduos usam EPIs: uniforme (calça/camisa ou avental longo), luvas ¾ de borracha ou PVC e calçado fechado antiderrapante. Base legal: Item 6.9.4 – Res. SESA 0414/01.' },
        { id: '6.9.5', crit: 'N', text: 'Os funcionários que higienizam o abrigo e os equipamentos usam EPIs: uniforme, avental frontal impermeável, gorro, luvas ¾, botas de borracha/PVC e máscara facial. Base legal: Item 6.9.5 – Res. SESA 0414/01.' },
        { id: '6.9.6', crit: 'N', text: 'Os EPIs são lavados e/ou descontaminados pelo próprio estabelecimento e estão em boas condições. Base legal: Item 6.9.6 – Res. SESA 0414/01.' },
      ]
    },
    {
      id: 'sec7',
      titulo: '7. ÁREA DE RECEPÇÃO / ÁREA DE ATENDIMENTO',
      itens: [
        { id: '7.1', crit: 'R', text: 'A sala de recepção tem área mínima de 1,20 m² por pessoa, além da área de circulação. Base legal: Item 7.1 – Res. SESA 0414/01.' },
        { id: '7.2.1', crit: 'N', text: 'O prontuário do paciente inclui ficha clínica. Base legal: Item 7.2.1 – Res. SESA 0414/01.' },
        { id: '7.2.2', crit: 'R', text: 'O prontuário do paciente inclui ficha de anamnese, assinada pelo paciente, em duas vias (uma para o paciente e outra para o dentista). Base legal: Item 7.2.2 – Res. SESA 0414/01.' },
        { id: '7.3', crit: 'N', text: 'A área de atendimento tem no mínimo 6 m² por equipo. Base legal: Item 7.3 – Res. SESA 0414/01.' },
        { id: '7.4', crit: 'N', text: 'O piso é liso, resistente, impermeável, lavável e está em perfeitas condições de limpeza nas áreas de atendimento, esterilização, sanitários, laboratório de prótese e cozinha. Base legal: Item 7.4 – Res. SESA 0414/01.' },
        { id: '7.5', crit: 'N', text: 'As paredes são de cor clara, material liso, resistente, lavável e estão em perfeitas condições de limpeza. Base legal: Item 7.5 – Res. SESA 0414/01.' },
        { id: '7.6', crit: 'N', text: 'O forro/teto é liso, sem trincas, rachaduras ou umidade. Base legal: Item 7.6 – Res. SESA 0414/01.' },
        { id: '7.7', crit: 'N', text: 'Portas e janelas têm superfícies lisas, estão em condições de uso e de fácil acesso. Base legal: Item 7.7 – Res. SESA 0414/01.' },
        { id: '7.8', crit: 'N', text: 'Há iluminação natural. Base legal: Item 7.8 – Res. SESA 0414/01.' },
        { id: '7.9', crit: 'N', text: 'A iluminação artificial está em bom estado de conservação. Base legal: Item 7.9 – Res. SESA 0414/01.' },
        { id: '7.10', crit: 'N', text: 'Há ventilação natural e/ou artificial — quando artificial, existe rotina escrita de limpeza dos filtros. Base legal: Item 7.10 – Res. SESA 0414/01.' },
        { id: '7.11', crit: 'N', text: 'O ambiente tem conforto acústico, isolando as pessoas da fonte de ruído (compressor e bomba a vácuo). Base legal: Item 7.11 – Res. SESA 0414/01.' },
        { id: '7.12', crit: 'N', text: 'As instalações sanitárias são de uso exclusivo, com vaso sanitário, pia, coletor de lixo com tampa, toalheiro de papel e sabonete líquido, em perfeitas condições de higiene. Base legal: Item 7.12 – Res. SESA 0414/01.' },
        { id: '7.13', crit: 'N', text: 'Há pia com cuba para lavagem das mãos dos profissionais, com sabão líquido, antisséptico, papel-toalha e lixeira (com tampa de acionamento por pedal, ou sem tampa — tampa manual não é permitida). Base legal: Item 7.13 – Res. SESA 0414/01.' },
        { id: '7.14', crit: 'N', text: 'Há bancada com cuba profunda de uso exclusivo para lavagem de artigos. Base legal: Item 7.14 – Res. SESA 0414/01.' },
        { id: '7.15', crit: 'N', text: 'Mobiliários, equipamentos e estrutura física estão em bom estado de conservação e higiene (sem perda de revestimento, corrosão, sujidade, trincas ou infiltrações). Base legal: Item 7.15 – Res. SESA 0414/01.' },
        { id: '7.16', crit: 'N', text: 'As cortinas estão limpas e são passíveis de limpeza. Base legal: Item 7.16 – Res. SESA 0414/01.' },
        { id: '7.17', crit: 'N', text: 'As superfícies são limpas com água e detergente após cada atendimento, antes da desinfecção química; barreiras de PVC, quando usadas, são trocadas a cada paciente. Base legal: Item 7.17 – Res. SESA 0414/01.' },
        { id: '7.18', crit: 'N', text: 'O equipo odontológico está em perfeito estado de uso e limpeza (a desinfecção/esterilização deve ser sempre precedida de limpeza):', isHeader: true },
        { id: '7.18.1', crit: 'N', text: 'A(s) turbina(s) de alta rotação pode(m) ser esterilizada(s) fisicamente ou desinfetada(s). Base legal: Item 7.18.1 – Res. SESA 0414/01.' },
        { id: '7.18.2', crit: 'N', text: 'O micromotor (contra-ângulo ou peça de mão reta) pode ser esterilizado fisicamente ou desinfetado. Base legal: Item 7.18.2 – Res. SESA 0414/01.' },
        { id: '7.18.3', crit: 'N', text: 'A seringa tríplice (ar/água) é desinfetada ou usa ponta descartável. Base legal: Item 7.18.3 – Res. SESA 0414/01.' },
        { id: '7.18.4', crit: 'N', text: 'O primeiro jato é desprezado por alguns segundos, com as peças de mão desconectadas, antes de usar em um novo paciente. Base legal: Item 7.18.4 – Res. SESA 0414/01.' },
        { id: '7.18.5', crit: 'R', text: 'O equipo tem reservatório de desinfetante integrado, que permite desinfetar as mangueiras da turbina e do micromotor. Base legal: Item 7.18.5 – Res. SESA 0414/01.' },
        { id: '7.19', crit: 'N', text: 'A cadeira odontológica está em perfeito estado de uso e limpeza. Base legal: Item 7.19 – Res. SESA 0414/01.' },
        { id: '7.20', crit: 'N', text: 'O refletor odontológico está em perfeito estado de uso e limpeza. Base legal: Item 7.20 – Res. SESA 0414/01.' },
        { id: '7.21', crit: 'N', text: 'A cuspideira tem água corrente e está em perfeito estado de uso e limpeza. Base legal: Item 7.21 – Res. SESA 0414/01.' },
        { id: '7.22', crit: 'N', text: 'Sistema de sucção:', isHeader: true },
        { id: '7.22.1', crit: 'N', text: 'A luz das mangueiras dos aspiradores é limpa por aspiração de solução detergente/detergente-desinfetante, após cada atendimento. Base legal: Item 7.22.1 – Res. SESA 0414/01.' },
        { id: '7.22.2', crit: 'N', text: 'As pontas de sucção são de uso único para cada paciente e previamente desinfetadas. Base legal: Item 7.22.2 – Res. SESA 0414/01.' },
        { id: '7.22.3', crit: 'N', text: 'As pontas de sucção usadas em procedimentos cirúrgicos são esterilizadas. Base legal: Item 7.22.3 – Res. SESA 0414/01.' },
        { id: '7.23', crit: 'N', text: 'Os equipamentos complementares (ultrassom, fotopolimerizador, amalgamador etc.) estão em perfeito estado de limpeza e uso. Base legal: Item 7.23 – Res. SESA 0414/01.' },
        { id: '7.24', crit: 'N', text: 'No equipamento de Raio X:', isHeader: true },
        { id: '7.24.1', crit: 'N', text: 'São usadas barreiras descartáveis impermeáveis à secreção (filme de PVC transparente) no localizador do aparelho. Base legal: Item 7.24.1 – Res. SESA 0414/01.' },
        { id: '7.24.2', crit: 'N', text: 'É usado envoltório de PVC transparente nas películas radiográficas intrabucais. Base legal: Item 7.24.2 – Res. SESA 0414/01.' },
        { id: '7.24.3', crit: 'N', text: 'É usada sobreluva nas tomadas radiográficas, ao manipular o localizador, o braço, o disparador e ao revelar a radiografia. Base legal: Item 7.24.3 – Res. SESA 0414/01.' },
        { id: '7.25', crit: 'I', text: 'Os medicamentos e correlatos odontológicos têm registro no Ministério da Saúde e estão dentro do prazo de validade; as soluções desinfetantes e antissépticas são identificadas e trocadas conforme padronização. Base legal: Item 7.25 – Res. SESA 0414/01.' },
        { id: '7.26', crit: 'N', text: 'Sobre o compressor:', isHeader: true },
        { id: '7.26.1', crit: 'N', text: 'Está instalado fora da área do consultório, ou tem proteção acústica. Base legal: Item 7.26.1 – Res. SESA 0414/01.' },
        { id: '7.26.2', crit: 'N', text: 'Está instalado de forma que a captação do ar ambiente seja limpa, fria e seca, por meio de tubulação apropriada. Base legal: Item 7.26.2 – Res. SESA 0414/01.' },
        { id: '7.27', crit: 'N', text: 'O amalgamador fica longe de fonte de calor e é colocado em bandeja plástica de abas altas, exceto quando usa cápsulas. Base legal: Item 7.27 – Res. SESA 0414/01.' },
        { id: '7.28', crit: 'N', text: 'Na desinfecção de superfícies:', isHeader: true },
        { id: '7.28.1', crit: 'N', text: 'Existe rotina e fluxo de procedimentos por escrito. Base legal: Item 7.28.1 – Res. SESA 0414/01.' },
        { id: '7.28.2', crit: 'N', text: 'São usados EPIs. Base legal: Item 7.28.2 – Res. SESA 0414/01.' },
        { id: '7.28.3', crit: 'N', text: 'As superfícies são limpas com água e detergente neutro. Base legal: Item 7.28.3 – Res. SESA 0414/01.' },
        { id: '7.28.4', crit: 'N', text: 'São usados desinfetantes químicos com registro no Ministério da Saúde e dentro do prazo de validade. Base legal: Item 7.28.4 – Res. SESA 0414/01.' },
        { id: '7.28.5', crit: 'R', text: 'São usadas barreiras descartáveis nas superfícies, impermeáveis à secreção (coberturas de PVC transparente). Base legal: Item 7.28.5 – Res. SESA 0414/01.' },
        { id: '7.29', crit: 'N', text: 'No processamento de artigos:', isHeader: true },
        { id: '7.29.1', crit: 'N', text: 'Existe rotina e fluxo de procedimentos por escrito. Base legal: Item 7.29.1 – Res. SESA 0414/01.' },
        { id: '7.29.2', crit: 'I', text: 'O uso de EPIs é obrigatório. Base legal: Item 7.29.2 – Res. SESA 0414/01.' },
        { id: '7.29.3', crit: 'N', text: 'Os invólucros são os indicados pelo Ministério da Saúde, íntegros e identificados com tipo de artigo, data da esterilização, prazo de validade, indicador químico e rubrica do responsável. Base legal: Item 7.29.3 – Res. SESA 0414/01.' },
        { id: '7.29.4', crit: 'N', text: 'Os artigos são limpos imediatamente após o uso e, quando isso não é possível, são imersos em água. Base legal: Item 7.29.4 – Res. SESA 0414/01.' },
        { id: '7.29.5', crit: 'I', text: 'Na limpeza dos artigos:', isHeader: true },
        { id: '7.29.5.1', crit: 'I', text: 'O uso de EPIs é obrigatório (luvas grossas, máscara, óculos de proteção e avental plástico). Base legal: Item 7.29.5.1 – Res. SESA 0414/01.' },
        { id: '7.29.5.2', crit: 'I', text: 'São usados produtos com registro no Ministério da Saúde e dentro do prazo de validade. Base legal: Item 7.29.5.2 – Res. SESA 0414/01.' },
        { id: '7.29.5.3', crit: 'I', text: 'São usados os produtos e métodos indicados pelo Ministério da Saúde para limpeza dos artigos (manual ou mecânica). Base legal: Item 7.29.5.3 – Res. SESA 0414/01.' },
        { id: '7.29.5.4', crit: 'I', text: 'Os artigos são enxaguados em água corrente (manual ou mecanicamente). Base legal: Item 7.29.5.4 – Res. SESA 0414/01.' },
        { id: '7.29.5.5', crit: 'I', text: 'Os artigos são secos (manual ou mecanicamente). Base legal: Item 7.29.5.5 – Res. SESA 0414/01.' },
        { id: '7.29.5.6', crit: 'I', text: 'É feita inspeção para detectar resíduos e pontos de corrosão. Base legal: Item 7.29.5.6 – Res. SESA 0414/01.' },
        { id: '7.29.5.7', crit: 'N', text: 'Os artigos articulados são lubrificados com produto hidrossolúvel, quando destinados à autoclave. Base legal: Item 7.29.5.7 – Res. SESA 0414/01.' },
        { id: '7.29.6', crit: 'N', text: 'Na desinfecção (só para artigos termossensíveis):', isHeader: true },
        { id: '7.29.6.1', crit: 'N', text: 'A desinfecção física segue o método indicado pelo Ministério da Saúde. Base legal: Item 7.29.6.1 – Res. SESA 0414/01.' },
        { id: '7.29.6.2', crit: 'N', text: 'A desinfecção química usa produtos e métodos indicados pelo Ministério da Saúde. Base legal: Item 7.29.6.2 – Res. SESA 0414/01.' },
        { id: '7.29.7', crit: 'I', text: 'Na esterilização por meio físico (autoclave e/ou forno de Pasteur/estufa):', isHeader: true },
        { id: '7.29.7.1.1', crit: 'I', text: 'Calor úmido — autoclave (vapor d\'água sob pressão):', isHeader: true },
        { id: '7.29.7.1.1.1', crit: 'I', text: 'São usados o tempo, a temperatura e a pressão indicados pelo Ministério da Saúde. Base legal: Item 7.29.7.1.1.1 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.1.2', crit: 'I', text: 'O equipamento é usado seguindo as recomendações do fabricante. Base legal: Item 7.29.7.1.1.2 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.1.3', crit: 'N', text: 'É feita manutenção preventiva, com registro. Base legal: Item 7.29.7.1.1.3 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.1.4', crit: 'I', text: 'Os pacotes são distribuídos adequadamente conforme a posição e o tipo de material. Base legal: Item 7.29.7.1.1.4 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.1.5', crit: 'I', text: 'Os artigos são acondicionados conforme indicado pelo Ministério da Saúde. Base legal: Item 7.29.7.1.1.5 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.1.6', crit: 'N', text: 'É feito monitoramento biológico mensal, após validação. Base legal: Item 7.29.7.1.1.6 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.1.7', crit: 'N', text: 'É feito monitoramento químico, com indicador externo em todos os pacotes e indicador interno a cada ciclo. Base legal: Item 7.29.7.1.1.7 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.1.8', crit: 'N', text: 'É usado o Teste de Bowie e Dick, no caso de autoclave pré-vácuo. Base legal: Item 7.29.7.1.1.8 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.1.9', crit: 'N', text: 'Todos os monitoramentos biológicos, químicos e físicos estão registrados. Base legal: Item 7.29.7.1.1.9 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.1.10', crit: 'N', text: 'É feito monitoramento físico, com registro de tempo, temperatura e pressão em cada ciclo. Base legal: Item 7.29.7.1.1.10 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.2', crit: 'I', text: 'Calor seco — estufa (Forno de Pasteur):', isHeader: true },
        { id: '7.29.7.1.2.1', crit: 'I', text: 'É usado termômetro acessório (200ºC). Base legal: Item 7.29.7.1.2.1 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.2.2', crit: 'I', text: 'É usada temperatura de 160ºC por duas horas ou 170ºC por uma hora. Base legal: Item 7.29.7.1.2.2 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.2.3', crit: 'I', text: 'É feita manutenção preventiva. Base legal: Item 7.29.7.1.2.3 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.2.4', crit: 'I', text: 'Os pacotes são distribuídos adequadamente conforme a posição e o tipo de material. Base legal: Item 7.29.7.1.2.4 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.2.5', crit: 'I', text: 'Os artigos são acondicionados conforme indicado pelo Ministério da Saúde. Base legal: Item 7.29.7.1.2.5 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.2.6', crit: 'N', text: 'É usado indicador químico externo (fita nos pacotes) e interno (tiras dentro das embalagens), em todos os pacotes. Base legal: Item 7.29.7.1.2.6 – Res. SESA 0414/01.' },
        { id: '7.29.7.1.2.7', crit: 'I', text: 'A porta da estufa é mantida fechada durante todo o ciclo de esterilização. Base legal: Item 7.29.7.1.2.7 – Res. SESA 0414/01.' },
        { id: '7.29.7.2', crit: 'N', text: 'Esterilização por meio químico (só permitida quando a esterilização física não é possível):', isHeader: true },
        { id: '7.29.7.2.1', crit: 'N', text: 'É usado esterilizante químico indicado pelo Ministério da Saúde. Base legal: Item 7.29.7.2.1 – Res. SESA 0414/01.' },
        { id: '7.29.7.2.2', crit: 'N', text: 'O artigo é totalmente imerso na solução adequada, em recipiente plástico. Base legal: Item 7.29.7.2.2 – Res. SESA 0414/01.' },
        { id: '7.29.7.2.3', crit: 'N', text: 'É respeitado o tempo de exposição indicado pelo fabricante, com o recipiente mantido fechado. Base legal: Item 7.29.7.2.3 – Res. SESA 0414/01.' },
        { id: '7.29.7.2.4', crit: 'N', text: 'Os artigos submetidos à esterilização química são enxaguados com água esterilizada e técnica asséptica. Base legal: Item 7.29.7.2.4 – Res. SESA 0414/01.' },
        { id: '7.29.7.2.5', crit: 'N', text: 'São feitos múltiplos enxágues para eliminar resíduos do produto. Base legal: Item 7.29.7.2.5 – Res. SESA 0414/01.' },
        { id: '7.29.7.2.6', crit: 'N', text: 'Todo o conteúdo do recipiente é usado de uma só vez, ou o restante é descartado. Base legal: Item 7.29.7.2.6 – Res. SESA 0414/01.' },
        { id: '7.29.7.2.7', crit: 'N', text: 'Os artigos são secos com compressa esterilizada. Base legal: Item 7.29.7.2.7 – Res. SESA 0414/01.' },
        { id: '7.29.7.2.8', crit: 'N', text: 'Os artigos são usados imediatamente após a esterilização química, sendo proibido armazená-los. Base legal: Item 7.29.7.2.8 – Res. SESA 0414/01.' },
        { id: '7.29.8', crit: 'I', text: 'Os artigos esterilizados fisicamente ficam armazenados em área limpa, livre de poeira, longe de água, janelas abertas, portas, tubulações expostas e drenos, com temperatura entre 18ºC e 22ºC. Base legal: Item 7.29.8 – Res. SESA 0414/01.' },
      ]
    },
    {
      id: 'sec8',
      titulo: '8. CENTRAL DE MATERIAL ESTERILIZADO (CME) — CLÍNICAS ODONTOLÓGICAS',
      itens: [
        { id: '8.1', crit: 'I', text: 'O ambiente é limpo, claro e arejado. Base legal: Item 8.1 – Res. SESA 0414/01.' },
        { id: '8.2', crit: 'I', text: 'O acesso é restrito aos funcionários que atuam na área. Base legal: Item 8.2 – Res. SESA 0414/01.' },
        { id: '8.3', crit: 'N', text: 'Equipamentos e mobiliários estão em boas condições de higiene e conservação (sem trincas, perda de revestimento, corrosão, sujidade ou infiltrações). Base legal: Item 8.3 – Res. SESA 0414/01.' },
        { id: '8.4', crit: 'N', text: 'Existe fluxo sequencial de procedimentos, respeitando a barreira física e a barreira técnica. Base legal: Item 8.4 – Res. SESA 0414/01.' },
        { id: '8.5', crit: 'I', text: 'As portas e guichês são mantidos fechados. Base legal: Item 8.5 – Res. SESA 0414/01.' },
        { id: '8.6', crit: 'N', text: 'A área suja (expurgo) é separada por barreira física da área limpa (preparo, esterilização e armazenamento). Base legal: Item 8.6 – Res. SESA 0414/01.' },
        { id: '8.7', crit: 'N', text: 'As janelas que dão para a área externa são teladas, ou há sistema de ventilação artificial. Base legal: Item 8.7 – Res. SESA 0414/01.' },
        { id: '8.8', crit: 'N', text: 'Existem rotinas escritas disponíveis aos funcionários para lavagem/antissepsia das mãos e para limpeza, desinfecção, acondicionamento, esterilização e armazenamento dos artigos. Base legal: Item 8.8 – Res. SESA 0414/01.' },
        { id: '8.9', crit: 'N', text: 'Os artigos contaminados são transportados em recipientes fechados até a CME. Base legal: Item 8.9 – Res. SESA 0414/01.' },
        { id: '8.10', crit: 'N', text: 'Na área de expurgo:', isHeader: true },
        { id: '8.10.1', crit: 'N', text: 'Há iluminação e ventilação natural (janelas teladas) ou artificial com ventilação forçada (exaustão). Base legal: Item 8.10.1 – Res. SESA 0414/01.' },
        { id: '8.10.2', crit: 'N', text: 'Há pia com bancada e cuba maior e profunda, com água quente e fria. Base legal: Item 8.10.2 – Res. SESA 0414/01.' },
        { id: '8.10.3', crit: 'I', text: 'São usados EPIs: avental impermeável, óculos, luvas grossas, gorro, máscara e sapatos fechados. Base legal: Item 8.10.3 – Res. SESA 0414/01.' },
        { id: '8.10.4', crit: 'N', text: 'Há vestiário exclusivo. Base legal: Item 8.10.4 – Res. SESA 0414/01.' },
        { id: '8.11', crit: 'N', text: 'Na área de recepção de artigos limpos:', isHeader: true },
        { id: '8.11.1', crit: 'I', text: 'Há pia para lavagem das mãos, com sabão líquido/antisséptico, papel-toalha e lixeira com tampa de pedal ou sem tampa. Base legal: Item 8.11.1 – Res. SESA 0414/01.' },
        { id: '8.11.2', crit: 'N', text: 'A bancada de trabalho é de material liso, impermeável e lavável. Base legal: Item 8.11.2 – Res. SESA 0414/01.' },
        { id: '8.12', crit: 'N', text: 'Na área de esterilização:', isHeader: true },
        { id: '8.12.1', crit: 'N', text: 'Há estufa (com termômetro acessório e cronômetro) e/ou autoclave. Base legal: Item 8.12.1 – Res. SESA 0414/01.' },
        { id: '8.12.2', crit: 'N', text: 'A comunicação com a área de armazenamento/distribuição é feita por porta de fechamento automático. Base legal: Item 8.12.2 – Res. SESA 0414/01.' },
        { id: '8.13', crit: 'N', text: 'O material esterilizado é armazenado em local de uso exclusivo, com prateleiras/armários de material liso, impermeável, sem umidade, com termômetro de controle (21ºC a 25ºC). Base legal: Item 8.13 – Res. SESA 0414/01.' },
        { id: '8.14', crit: 'N', text: 'Os artigos são distribuídos por guichê, mantido fechado quando não está em uso. Base legal: Item 8.14 – Res. SESA 0414/01.' },
      ]
    },
    {
      id: 'sec9',
      titulo: '9. CENTRO CIRÚRGICO',
      itens: [
        { id: '9.1', crit: 'I', text: 'Há vestiário de barreira no acesso ao Centro Cirúrgico, com banheiro (vaso sanitário e lavatório). Base legal: Item 9.1 – Res. SESA 0414/01.' },
        { id: '9.2', crit: 'I', text: 'Existem áreas exclusivas para sala cirúrgica, expurgo e guarda de material esterilizado. Base legal: Item 9.2 – Res. SESA 0414/01.' },
        { id: '9.3', crit: 'I', text: 'O lavatório tem torneiras e dispensador de antisséptico com acionamento sem uso das mãos, e escovinhas secas/esterilizadas/individualizadas para a preparação cirúrgica das mãos. Base legal: Item 9.3 – Res. SESA 0414/01.' },
        { id: '9.4', crit: 'I', text: 'As salas de cirurgia têm sistema de ventilação artificial. Base legal: Item 9.4 – Res. SESA 0414/01.' },
        { id: '9.5', crit: 'N', text: 'Existem rotinas escritas disponíveis aos funcionários para lavagem/antissepsia das mãos, limpeza/desinfecção de superfícies e do carrinho/material de anestesia, e limpeza dos filtros de ventilação.', isHeader: true },
        { id: '9.6', crit: 'I', text: 'As soluções antissépticas são identificadas, trocadas conforme padronização e estão dentro do prazo de validade. Base legal: Item 9.6 – Res. SESA 0414/01.' },
        { id: '9.7', crit: 'I', text: 'Os funcionários usam paramentação e EPIs:', isHeader: true },
        { id: '9.7.1', crit: 'I', text: 'Avental estéril. Base legal: Item 9.7 – Res. SESA 0414/01.' },
        { id: '9.7.2', crit: 'I', text: 'Luvas estéreis. Base legal: Item 9.7 – Res. SESA 0414/01.' },
        { id: '9.7.3', crit: 'I', text: 'Máscara. Base legal: Item 9.7 – Res. SESA 0414/01.' },
        { id: '9.7.4', crit: 'I', text: 'Calça e jaleco. Base legal: Item 9.7 – Res. SESA 0414/01.' },
        { id: '9.7.5', crit: 'I', text: 'Óculos. Base legal: Item 9.7 – Res. SESA 0414/01.' },
        { id: '9.7.6', crit: 'I', text: 'Gorro. Base legal: Item 9.7 – Res. SESA 0414/01.' },
        { id: '9.7.7', crit: 'I', text: 'Sapatilha ou similar (lavável), usada só na área limpa do centro cirúrgico. Base legal: Item 9.7 – Res. SESA 0414/01.' },
        { id: '9.8', crit: 'I', text: 'O carrinho e/ou material de anestesia é limpo e desinfetado após a cirurgia, ou no mínimo uma vez por dia. Base legal: Item 9.8 – Res. SESA 0414/01.' },
        { id: '9.9', crit: 'I', text: 'Mobiliários, equipamentos e estrutura física estão em bom estado de conservação e higiene. Base legal: Item 9.9 – Res. SESA 0414/01.' },
        { id: '9.10', crit: 'I', text: 'É feita manutenção preventiva e periódica dos equipamentos, com registro (laudo com data, nome e assinatura do técnico). Base legal: Item 9.10 – Res. SESA 0414/01.' },
        { id: '9.11', crit: 'I', text: 'Os materiais e artigos estéreis são acondicionados em embalagem adequada e íntegra, identificados com data de esterilização, validade e indicador químico. Base legal: Item 9.11 – Res. SESA 0414/01.' },
        { id: '9.12', crit: 'I', text: 'Os medicamentos e correlatos têm registro no Ministério da Saúde, estão dentro do prazo de validade e são acondicionados conforme orientação do fabricante. Base legal: Item 9.12 – Res. SESA 0414/01.' },
      ]
    },
    {
      id: 'sec10',
      titulo: '10. PROCESSAMENTO DE ROUPAS — LAVANDERIA (se terceirizado, marcar ND nos demais itens e verificar só 10.1, 10.3.1, 10.3.2 e 10.3.5)',
      itens: [
        { id: '10.1', crit: 'I', text: 'A roupa suja e a roupa limpa são transportadas adequadamente (carrinho fechado, identificado, de uso exclusivo; ou hamper com a roupa pré-acondicionada em sacos plásticos fechados). Base legal: Item 10.1 – Res. SESA 0414/01.' },
        { id: '10.2', crit: 'N', text: 'Há barreira física (e, obrigatoriamente, barreira técnica) entre a área suja e a área limpa. Base legal: Item 10.2 – Res. SESA 0414/01.' },
        { id: '10.3', crit: 'N', text: 'Existem rotinas escritas disponíveis aos funcionários para:', isHeader: true },
        { id: '10.3.1', crit: 'N', text: 'Higienização das mãos. Base legal: Item 10.3.1 – Res. SESA 0414/01.' },
        { id: '10.3.2', crit: 'N', text: 'Coleta da roupa suja. Base legal: Item 10.3.2 – Res. SESA 0414/01.' },
        { id: '10.3.3', crit: 'N', text: 'Processo e fluxo de lavagem da roupa. Base legal: Item 10.3.3 – Res. SESA 0414/01.' },
        { id: '10.3.4', crit: 'I', text: 'Desinfecção da roupa (processo térmico a 70ºC ou produtos químicos adequados). Base legal: Item 10.3.4 – Res. SESA 0414/01.' },
        { id: '10.3.5', crit: 'N', text: 'Distribuição da roupa limpa. Base legal: Item 10.3.5 – Res. SESA 0414/01.' },
        { id: '10.4', crit: 'N', text: 'Para a coleta da roupa suja, os funcionários usam EPIs: uniforme (calça/camisa ou avental longo), luvas ¾ de borracha/PVC e calçado fechado antiderrapante:', isHeader: true },
        { id: '10.4.1', crit: 'N', text: 'Uniforme composto de calça e camisa, ou avental longo. Base legal: Item 10.4.1 – Res. SESA 0414/01.' },
        { id: '10.4.2', crit: 'I', text: 'Luvas ¾ de borracha ou de PVC. Base legal: Item 10.4.2 – Res. SESA 0414/01.' },
        { id: '10.4.3', crit: 'N', text: 'Calçado fechado com solado antiderrapante. Base legal: Item 10.4.3 – Res. SESA 0414/01.' },
        { id: '10.4.4', crit: 'I', text: 'Na área suja da lavanderia, os funcionários usam uniforme composto de calça e camisa. Base legal: Item 10.4.4 – Res. SESA 0414/01.' },
        { id: '10.4.5', crit: 'I', text: 'Avental frontal impermeável. Base legal: Item 10.4.5 – Res. SESA 0414/01.' },
        { id: '10.4.6', crit: 'I', text: 'Gorro. Base legal: Item 10.4.6 – Res. SESA 0414/01.' },
        { id: '10.4.7', crit: 'I', text: 'Máscara. Base legal: Item 10.4.7 – Res. SESA 0414/01.' },
        { id: '10.4.8', crit: 'I', text: 'Luvas ¾ de borracha ou de PVC. Base legal: Item 10.4.8 – Res. SESA 0414/01.' },
        { id: '10.4.9', crit: 'I', text: 'Botas de borracha ou de PVC. Base legal: Item 10.4.9 – Res. SESA 0414/01.' },
        { id: '10.4.10', crit: 'N', text: 'Na área limpa da lavanderia, os funcionários usam uniforme composto de calça e camisa. Base legal: Item 10.4.10 – Res. SESA 0414/01.' },
        { id: '10.4.11', crit: 'N', text: 'Calçado fechado com solado antiderrapante. Verificar se todos os EPIs estão em boas condições e se são fornecidos, lavados e descontaminados pelo próprio estabelecimento. Base legal: Item 10.4.11 – Res. SESA 0414/01.' },
        { id: '10.5', crit: 'I', text: 'O processo de secagem da roupa é adequado (secadora com exaustão, ou área exclusiva com varais e acesso restrito). Base legal: Item 10.5 – Res. SESA 0414/01.' },
        { id: '10.6', crit: 'N', text: 'É feita manutenção preventiva e periódica dos equipamentos, com registro. Base legal: Item 10.6 – Res. SESA 0414/01.' },
        { id: '10.7', crit: 'N', text: 'Mobiliários, equipamentos, estrutura física e ambiente estão em bom estado de conservação e higiene. Base legal: Item 10.7 – Res. SESA 0414/01.' },
      ]
    },
    {
      id: 'sec11',
      titulo: '11. LIMPEZA E ZELADORIA',
      itens: [
        { id: '11.1', crit: 'I', text: 'Os funcionários de serviços gerais recebem treinamento. Base legal: Item 11.1 – Res. SESA 0414/01.' },
        { id: '11.2', crit: 'N', text: 'Existem rotinas escritas disponíveis aos funcionários para higienização, limpeza e descontaminação dos ambientes. Base legal: Item 11.2 – Res. SESA 0414/01.' },
        { id: '11.3', crit: 'I', text: 'Os funcionários dispõem de EPIs. Base legal: Item 11.3 – Res. SESA 0414/01.' },
      ]
    },
  ]
}

// Roteiro próprio de Prudentópolis — versão simplificada ("o que fazer"),
// transcrita do "Roteiro de Inspeção — Consultórios e Clínicas
// Odontológicas" fornecido pela usuária em julho de 2026. A base legal de
// cada item é a mesma da versão anterior (conferida item a item, incluindo
// os artigos que a tabela do PDF cortava por falta de espaço na coluna) —
// só a redação de cada item mudou, pra ficar em linguagem mais direta e
// simples. Não existe classificação de criticidade (I/N/R) na fonte
// original, então todos os itens entram como 'N' (Necessário) por padrão;
// ajuste item a item depois se algum precisar de outra criticidade.
const odontologiaPrudentopolisChecklist: ChecklistData = {
  titulo: 'Roteiro de Inspeção — Consultórios e Clínicas Odontológicas',
  subtitulo: 'Versão detalhada, em linguagem simples — o que apresentar, providenciar ou manter',
  categoria: 'SAÚDE',
  lei: 'RDC nº 063/11 (ANVISA) e Resoluções SESA/PR',
  especialidade: 'ODONTOLOGIA',
  secoes: [
    {
      id: 'pg-doc',
      titulo: '1. DOCUMENTOS E REGISTROS',
      itens: [
        { id: '1', crit: 'N', text: 'Apresentar o PBA (Projeto Básico de Arquitetura) atualizado e aprovado pela Vigilância Sanitária (VISA). Base legal: Art. 23, I – RDC 063/11; Art. 9º, §1º, 2º e 3º – Res. SESA 1034/20.' },
        { id: '2', crit: 'N', text: 'Apresentar o certificado de dedetização (controle de pragas) atualizado, emitido por empresa habilitada. Base legal: Art. 23, VIII – RDC 063/11; Art. 320 – Dec. Est. nº 5.711/02.' },
        { id: '3', crit: 'N', text: 'Apresentar o certificado ou registro de limpeza e desinfecção do reservatório de água. Base legal: Art. 39, §1º – RDC 063/11; Art. 187 e 191 – Dec. Est. nº 5.711/02.' },
        { id: '4', crit: 'N', text: 'Apresentar o PMOC do ar-condicionado, ou o registro de manutenção e limpeza dos equipamentos de climatização. Base legal: Lei Federal nº 13.589/18; Art. 5º e 6º, "a" – Portaria nº 3.523/98.' },
        { id: '5', crit: 'N', text: 'Apresentar o PGRSS (Plano de Gerenciamento de Resíduos de Serviços de Saúde) atualizado e aprovado. Base legal: Art. 226 – Dec. Est. nº 5.711/02.' },
        { id: '6', crit: 'N', text: 'Apresentar o contrato e/ou certificado de coleta, transporte e destinação dos resíduos de saúde. Base legal: Art. 11 e Art. 23, V – RDC 063/11.' },
        { id: '7', crit: 'N', text: 'Manter os POPs (Procedimentos Operacionais Padrão) escritos, atualizados e acessíveis a toda a equipe. Base legal: Art. 23, XVIII e Art. 51 – RDC 063/11.' },
        { id: '8', crit: 'N', text: 'Apresentar o programa de manutenção preventiva dos equipamentos odontológicos e os respectivos registros. Base legal: Art. 23, IX – RDC 063/11; Art. 426, § Único – Dec. Est. nº 5.711/02.' },
        { id: '9', crit: 'N', text: '(*) Apresentar o certificado do responsável técnico no Conselho de Classe e o Certificado de Responsabilidade Técnica (CRT). Base legal: Art. 14 – RDC 063/11; Art. 422 – Dec. Est. nº 5.711/02.' },
      ]
    },
    {
      id: 'pg-trab',
      titulo: '2. CONDIÇÕES DE TRABALHO E SAÚDE DO TRABALHADOR',
      itens: [
        { id: '10', crit: 'N', text: 'Apresentar os certificados de habilitação da Equipe de Saúde Bucal (ASB/TSB) e o registro no Conselho de Classe. Base legal: Cap. VII, 16 – Res. SESA 496/05.' },
        { id: '11', crit: 'N', text: '(*) Apresentar o PGR, o PCMSO e os ASOs (atestados de saúde ocupacional) dos trabalhadores. Base legal: Art. 23, II – RDC 063/11.' },
        { id: '12', crit: 'N', text: 'Apresentar o registro de entrega de EPIs, em quantidade suficiente e compatível com o risco de cada função. Base legal: Art. 47 – RDC 063/11; Art. 122 – Dec. Est. nº 5.711/02.' },
        { id: '13', crit: 'N', text: 'Apresentar os registros ou certificados de Educação Continuada da equipe. Base legal: Art. 32, §Único e Art. 33 – RDC 063/11.' },
        { id: '14', crit: 'N', text: 'Manter, por escrito, a rotina para acidentes com material perfurocortante ou biológico. Base legal: Itens 4.4 e 4.6 – Res. SESA 0414/01.' },
        { id: '15', crit: 'N', text: 'Apresentar o registro de imunização da equipe (Hepatite B, Tétano, Difteria, Caxumba, Rubéola, Varicela e Sarampo). Base legal: Cap. XVI, 63.2 – Res. SESA 496/05.' },
        { id: '16', crit: 'N', text: 'Fornecer água potável e fresca aos trabalhadores, por bebedouro de jato inclinado ou equivalente. Base legal: Art. 136 – Dec. Est. nº 5.711/02.' },
      ]
    },
    {
      id: 'pg-infra',
      titulo: '3. INFRAESTRUTURA E AMBIENTES DE APOIO',
      itens: [
        { id: '17', crit: 'N', text: 'Manter a estrutura física conforme o projeto aprovado, inclusive após reformas. Base legal: Item 3.2 – Res. SESA 0414/01.' },
        { id: '18', crit: 'N', text: 'Manter os ambientes internos e externos limpos, organizados e conservados. Base legal: Item 3.3 – Res. SESA 0414/01.' },
        { id: '19', crit: 'N', text: 'Manter a rede elétrica sem fios expostos e com capacidade suficiente para os equipamentos. Base legal: Item 6.7 – Res. SESA 0414/01.' },
        { id: '20', crit: 'N', text: 'Manter a instalação hidráulica adequada, sem tubulação aparente e sem vazamentos. Base legal: Item 6.8 – Res. SESA 0414/01.' },
        { id: '21', crit: 'N', text: 'Usar piso e paredes de material liso, resistente e lavável. Base legal: Itens 7.4 e 7.5 – Res. SESA 0414/01.' },
        { id: '22', crit: 'N', text: 'Manter o forro/teto liso, sem trincas, rachaduras ou umidade. Base legal: Item 7.6 – Res. SESA 0414/01.' },
        { id: '23', crit: 'N', text: 'Manter mobiliários e equipamentos conservados e higienizados. Base legal: Item 7.15 – Res. SESA 0414/01.' },
        { id: '24-h', crit: 'N', text: 'Área de atendimento', isHeader: true },
        { id: '24', crit: 'N', text: 'Garantir iluminação e ventilação adequadas na área de atendimento e manter, por escrito, a rotina de limpeza dos filtros (ventilação artificial). Base legal: Itens 7.8, 7.9 e 7.10 – Res. SESA 0414/01.' },
        { id: '25', crit: 'N', text: 'Instalar lavatório exclusivo para higienizar as mãos, com fechamento sem contato manual, sabão líquido, anti-séptico, papel-toalha e lixeira com pedal. Base legal: Cap. VIII, 20.1 – Res. SESA 496/05; Item 7.13 – Res. SESA 0414/01; Item 32.10.15 – NR 32.' },
        { id: '26', crit: 'N', text: 'Em consultórios isolados, separar a área suja da área limpa por barreira técnica e manter a distância mínima entre as cubas. Base legal: Cap. VIII, 21.2 – Res. SESA 496/05; Itens 7.13, 7.14 e 8.6 – Res. SESA 0414/01.' },
        { id: '27-h', crit: 'N', text: '(*) CME – Central de Materiais e Esterilização', isHeader: true },
        { id: '27', crit: 'N', text: '(*) Na CME simplificada, separar a área suja da área limpa por guichê de passagem. Base legal: Cap. VIII, 21.1 – Res. SESA 496/05.' },
        { id: '28', crit: 'N', text: '(*) Na CME completa, manter vestiário exclusivo, lavatório na recepção de artigos limpos, controle de temperatura/umidade e distribuição por guichê. Base legal: Cap. VIII, 22 – Res. SESA 496/05; Itens 8.10.4, 8.11.1 e 8.14 – Res. SESA 0414/01.' },
        { id: '29', crit: 'N', text: 'Manter portas e guichês fechados. Base legal: Item 8.5 – Res. SESA 0414/01.' },
        { id: '30', crit: 'N', text: 'Garantir, na área suja, iluminação e ventilação natural ou sistema de ventilação artificial. Base legal: Itens 8.7 e 8.10.1 – Res. SESA 0414/01.' },
        { id: '31-h', crit: 'N', text: 'Sanitários', isHeader: true },
        { id: '31', crit: 'N', text: 'Manter os sanitários equipados (vaso, lavatório, lixeira com tampa, papel-toalha, sabonete líquido) e higienizados. Base legal: Cap. VIII, 27 – Res. SESA 496/05.' },
        { id: '32', crit: 'N', text: 'Separar os sanitários por sexo quando houver mais de 10 pessoas simultâneas e disponibilizar sanitário adaptado para pessoa com deficiência. Base legal: Cap. VIII, 27.5 – Res. SESA 496/05.' },
        { id: '33', crit: 'N', text: 'Instalar fechamento automático na porta do sanitário quando houver comunicação direta com a área de trabalho. Base legal: Cap. VIII, 27.6 – Res. SESA 496/05.' },
        { id: '34', crit: 'N', text: 'Disponibilizar copa própria para refeições, caso os trabalhadores comam no estabelecimento. Base legal: Art. 137 – Dec. Est. nº 5.711/02.' },
        { id: '35', crit: 'N', text: 'Disponibilizar DML (Depósito de Material de Limpeza) com tanque. Base legal: Cap. VIII, 28 – Res. SESA 496/05.' },
        { id: '36', crit: 'N', text: 'Instalar o compressor fora da área do consultório, ou com proteção acústica, garantindo ar limpo, frio e seco. Base legal: Cap. IX, 37.7 – Res. SESA 496/05.' },
      ]
    },
    {
      id: 'pg-limpeza',
      titulo: '4. LIMPEZA, DESINFECÇÃO E PROCESSAMENTO DE ARTIGOS',
      itens: [
        { id: '37', crit: 'N', text: 'Disponibilizar todos os EPIs necessários: luvas, sobreluvas, avental, máscara, óculos de proteção, gorro e sapato fechado. Base legal: Cap. IX, 35 – Res. SESA 496/05; Itens 4.1 e 4.2 – Res. SESA 0414/01.' },
        { id: '38-h', crit: 'N', text: 'Desinfecção de superfícies', isHeader: true },
        { id: '38', crit: 'N', text: 'Limpar as superfícies com água e detergente neutro após cada atendimento e no final do dia, antes da desinfecção química. Base legal: Itens 7.17 e 7.28 – Res. SESA 0414/01.' },
        { id: '39', crit: 'N', text: 'Usar barreiras descartáveis (como filme de PVC) e trocá-las após cada paciente. Base legal: Itens 7.17 e 7.28 – Res. SESA 0414/01.' },
        { id: '40', crit: 'N', text: 'Identificar as soluções desinfetantes e antissépticas e controlar o prazo de validade. Base legal: Item 7.25 – Res. SESA 0414/01.' },
        { id: '41-h', crit: 'N', text: 'Limpeza dos artigos', isHeader: true },
        { id: '41', crit: 'N', text: 'Transportar os artigos contaminados em recipientes fechados até a área suja. Base legal: Item 8.9 – Res. SESA 0414/01.' },
        { id: '42', crit: 'N', text: 'Imergir os artigos em água imediatamente após o uso, quando não for possível processá-los de imediato. Base legal: Item 7.29.4 – Res. SESA 0414/01.' },
        { id: '43', crit: 'N', text: 'Limpar, enxaguar em água corrente, secar e inspecionar os artigos, verificando resíduos e corrosão. Base legal: Item 7.29.5 – Res. SESA 0414/01.' },
        { id: '44-h', crit: 'N', text: 'Esterilização dos artigos', isHeader: true },
        { id: '44', crit: 'N', text: 'Fazer o monitoramento biológico da esterilização semanalmente. Base legal: Cap. XI, 50 – Res. SESA 496/05.' },
        { id: '45', crit: 'N', text: 'Fazer o monitoramento químico externo (por embalagem) e interno (por ciclo). Base legal: Item 7.29.7.1 – Res. SESA 0414/01.' },
        { id: '46', crit: 'N', text: 'Fazer o monitoramento físico (tempo, temperatura e pressão) em cada ciclo. Base legal: Item 7.29.7.1 – Res. SESA 0414/01.' },
        { id: '47', crit: 'N', text: 'Registrar todos os monitoramentos biológicos, químicos e físicos realizados. Base legal: Cap. XI, 50 – Res. SESA 496/05.' },
        { id: '48-h', crit: 'N', text: 'Acondicionamento dos artigos', isHeader: true },
        { id: '48', crit: 'N', text: 'Guardar os artigos esterilizados em área limpa e exclusiva, seca e afastada de fontes de água. Base legal: Cap. X, 42 – Res. SESA 496/05.' },
        { id: '49', crit: 'N', text: 'Acondicionar os artigos esterilizados em pacotes individuais, com selagem íntegra. Base legal: Cap. X, 41.4 – Res. SESA 496/05.' },
        { id: '50', crit: 'N', text: 'Usar embalagens indicadas pelo Ministério da Saúde, identificadas com data, validade e responsável pelo preparo. Base legal: Cap. X, 43 – Res. SESA 496/05.' },
        { id: '51', crit: 'N', text: 'Não reprocessar produtos de uso único. Base legal: RDC 156/2006; RE nº 2.605/2006.' },
      ]
    },
    {
      id: 'pg-residuos',
      titulo: '5. GERENCIAMENTO DE RESÍDUOS DE SERVIÇOS DE SAÚDE',
      itens: [
        { id: '52', crit: 'N', text: 'Acondicionar os resíduos infectantes em recipiente identificado, com simbologia de risco biológico e tampa sem contato manual. Base legal: Art. 14 e 17 – RDC 222/18; Item 6.5 – Res. SESA 0414/01.' },
        { id: '53', crit: 'N', text: 'Acondicionar os perfurocortantes em recipiente rígido e identificado, sem passar de 3/4 da capacidade. Base legal: Art. 86 – RDC 222/18; Cap. XVIII, 68 – Res. SESA 496/05.' },
        { id: '54', crit: 'N', text: 'Instalar suporte exclusivo para o coletor de perfurocortantes, em altura que permita ver a abertura de descarte. Base legal: Item 32.5.3.2.1 – NR 32.' },
        { id: '55', crit: 'N', text: 'Acondicionar os resíduos químicos com identificação de símbolo e frase de risco. Base legal: Anexo II – RDC 222/18; Cap. XVIII, 69 – Res. SESA 496/05.' },
        { id: '56', crit: 'N', text: 'Acondicionar os resíduos com mercúrio (amálgama) em recipiente rígido, vedado e sob selo d\'água. Base legal: Cap. XVIII, 70 – Res. SESA 496/05; Item 6.6 – Res. SESA 0414/01.' },
      ]
    },
    {
      id: 'pg-outras',
      titulo: '6. OUTRAS NÃO CONFORMIDADES',
      itens: [
        { id: '57', crit: 'N', text: 'Manter os medicamentos e materiais odontológicos dentro do prazo de validade. Base legal: Cap. XV, 60 – Res. SESA 496/05.' },
      ]
    },
  ]
}

// Roteiro de nível estadual (sem município vinculado — visível a qualquer
// fiscal), transcrito do Apêndice A ("Lista de Verificação para Serviços de
// Alimentação") fornecido pela usuária, baseado na RDC nº 275/2002 e na RDC
// nº 216/2004 da Anvisa. O Apêndice B do mesmo documento (questionário
// socioeconômico de pesquisa acadêmica) não entrou — não é um item de
// fiscalização. Assim como no roteiro de Prudentópolis, a fonte original não
// classifica os itens por criticidade (I/N/R), então todos entram como 'N'
// por padrão.
const alimentacaoChecklist: ChecklistData = {
  titulo: 'Roteiro de Inspeção de Serviços de Alimentação',
  subtitulo: 'RDC nº 275/2002 e RDC nº 216/2004 (ANVISA)',
  categoria: 'SAÚDE',
  lei: 'RDC nº 275/2002 e RDC nº 216/2004 (ANVISA)',
  especialidade: 'SERVIÇOS DE ALIMENTAÇÃO',
  secoes: [
    {
      id: 'al-instalacoes',
      titulo: '1. INSTALAÇÕES',
      itens: [
        { id: '1', crit: 'N', text: 'Manter as imediações, o local e as dependências anexas limpos e livres de focos de insalubridade (sem objetos em desuso, animais domésticos, insetos ou roedores). Base legal: Item 4.1.7 – RDC 275/2002 (também no item correspondente da RDC 216/2004).' },
        { id: '2', crit: 'N', text: 'Garantir acesso controlado, direto e independente ao estabelecimento, sem uso comum com outras atividades. Base legal: Item 4.1.1 – RDC 275/2002 (também no item correspondente da RDC 216/2004).' },
        { id: '3', crit: 'N', text: 'Manter as edificações e instalações organizadas de forma a garantir um fluxo ordenado, sem cruzamentos, facilitando a manutenção e a limpeza. Base legal: Item 4.1.1 – RDC 275/2002 (também no item correspondente da RDC 216/2004).' },
        { id: '4', crit: 'N', text: 'Separar, por meios físicos ou técnicos, as áreas de preparo de diferentes categorias de alimentos, evitando a contaminação cruzada. Base legal: Item 4.1.2 – RDC 275/2002 (também no item correspondente da RDC 216/2004).' },
        { id: '5-h', crit: 'N', text: 'Piso', isHeader: true },
        { id: '5.1', crit: 'N', text: 'Usar piso com revestimento liso, impermeável e lavável. Base legal: Item 4.1.3 – RDC 275/2002 (também no item correspondente da RDC 216/2004).' },
        { id: '5.2', crit: 'N', text: 'Manter o piso em bom estado de conservação, sem rachaduras, trincas ou outros defeitos que possam contaminar os alimentos. Base legal: Item 4.1.3 – RDC 275/2002 (também no item correspondente da RDC 216/2004).' },
        { id: '5.3', crit: 'N', text: 'Manter o piso limpo e higienizado. Base legal: Item 4.1.3 – RDC 275/2002 (também no item correspondente da RDC 216/2004).' },
        { id: '6-h', crit: 'N', text: 'Parede', isHeader: true },
        { id: '6.1', crit: 'N', text: 'Usar paredes com revestimento liso, impermeável e lavável. Base legal: Item 4.1.3 – RDC 275/2002 (também no item correspondente da RDC 216/2004).' },
        { id: '6.2', crit: 'N', text: 'Manter as paredes em bom estado de conservação, sem rachaduras, trincas ou outros defeitos que possam contaminar os alimentos. Base legal: Item 4.1.3 – RDC 275/2002 (também no item correspondente da RDC 216/2004).' },
        { id: '6.3', crit: 'N', text: 'Manter as paredes limpas e higienizadas. Base legal: Item 4.1.3 – RDC 275/2002.' },
        { id: '7-h', crit: 'N', text: 'Teto', isHeader: true },
        { id: '7.1', crit: 'N', text: 'Usar teto com revestimento liso, impermeável e lavável. Base legal: Item 4.1.3 – RDC 275/2002.' },
        { id: '7.2', crit: 'N', text: 'Manter o teto em bom estado de conservação, sem rachaduras, trincas ou outros defeitos que possam contaminar os alimentos. Base legal: Item 4.1.3 – RDC 275/2002.' },
        { id: '7.3', crit: 'N', text: 'Manter o teto limpo e higienizado. Base legal: Item 4.1.3 – RDC 275/2002.' },
        { id: '8-h', crit: 'N', text: 'Portas', isHeader: true },
        { id: '8.1', crit: 'N', text: 'Manter as portas em bom estado de conservação e bem ajustadas ao batente. Base legal: Item 4.1.4 – RDC 275/2002.' },
        { id: '8.2', crit: 'N', text: 'Instalar fechamento automático nas portas da área de preparação e armazenamento de alimentos. Base legal: Item 4.1.4 – RDC 275/2002.' },
        { id: '9-h', crit: 'N', text: 'Janelas', isHeader: true },
        { id: '9.1', crit: 'N', text: 'Manter as janelas em bom estado de conservação, ajustadas ao batente e com vidros íntegros. Base legal: Item 4.1.4 – RDC 275/2002.' },
        { id: '9.2', crit: 'N', text: 'Instalar telas milimétricas removíveis nas janelas e outras aberturas externas, incluindo o sistema de exaustão, para facilitar a limpeza periódica. Base legal: Item 4.1.4 – RDC 275/2002.' },
        { id: '10-h', crit: 'N', text: 'Iluminação', isHeader: true },
        { id: '10.1', crit: 'N', text: 'Garantir iluminação adequada, sem sombras ou contrastes excessivos. Base legal: Item 4.1.8 – RDC 275/2002.' },
        { id: '10.2', crit: 'N', text: 'Proteger contra explosão ou queda acidental as luminárias localizadas sobre a área de preparação dos alimentos. Base legal: Item 4.1.8 – RDC 275/2002.' },
        { id: '10.3', crit: 'N', text: 'Manter as instalações elétricas embutidas ou protegidas em tubulações externas, íntegras e de fácil higienização. Base legal: Item 4.1.9 – RDC 275/2002.' },
        { id: '11-h', crit: 'N', text: 'Ventilação', isHeader: true },
        { id: '11.1', crit: 'N', text: 'Garantir ventilação natural ou artificial adequada, evitando gases, fumaça, condensação de vapores e o surgimento de fungos ou bolores. Base legal: Item 4.1.10 – RDC 275/2002.' },
        { id: '11.2', crit: 'N', text: 'Evitar que o fluxo de ar incida diretamente sobre os alimentos. Base legal: Item 4.1.10 – RDC 275/2002.' },
        { id: '11.3', crit: 'N', text: 'Manter os equipamentos de ventilação em bom estado de conservação e limpeza. Base legal: Item 4.1.11 – RDC 275/2002.' },
        { id: '11.4', crit: 'N', text: 'Apresentar o registro de manutenção, limpeza e troca dos filtros dos equipamentos de climatização, quando houver. Base legal: Item 4.1.11 – RDC 275/2002.' },
        { id: '12', crit: 'N', text: 'Eliminar adequadamente as águas servidas e esgotos na rede pública, mantendo a caixa de gordura em bom estado de conservação e funcionamento, com ralo sifonado e tampa giratória. Base legal: Item 4.1.6 – RDC 275/2002.' },
        { id: '13-h', crit: 'N', text: 'Água', isHeader: true },
        { id: '13.1', crit: 'N', text: 'Usar água potável, de rede pública tratada, poço raso ou poço profundo tratado. Base legal: Item 4.1.5 – RDC 275/2002.' },
        { id: '13.2', crit: 'N', text: 'Garantir água em volume e pressão adequados. Base legal: Item 4.1.5 – RDC 275/2002.' },
        { id: '13.3', crit: 'N', text: 'Manter a caixa d\'água tampada e limpa. Base legal: Item 4.1.5 – RDC 275/2002.' },
        { id: '14-h', crit: 'N', text: 'Instalações Sanitárias', isHeader: true },
        { id: '14.1', crit: 'N', text: 'Manter as instalações sanitárias e vestiários sem comunicação direta com a área de preparação e armazenamento de alimentos ou refeitórios. Base legal: Item 4.1.12 – RDC 275/2002.' },
        { id: '14.2', crit: 'N', text: 'Manter as instalações sanitárias em bom estado de conservação e organizadas. Base legal: Item 4.1.12 – RDC 275/2002.' },
        { id: '14.3', crit: 'N', text: 'Manter as instalações sanitárias limpas e higienizadas. Base legal: Item 4.1.12 – RDC 275/2002.' },
        { id: '14.4', crit: 'N', text: 'Instalar fechamento automático nas portas externas das instalações sanitárias. Base legal: Item 4.1.12 – RDC 275/2002.' },
        { id: '14.5', crit: 'N', text: 'Instalar lavatório nas instalações sanitárias, com sabonete líquido anti-séptico (ou sabonete líquido e produto anti-séptico) e toalhas de papel não reciclado. Base legal: Item 4.1.13 – RDC 275/2002.' },
        { id: '14.6', crit: 'N', text: 'Instalar lixeira com saco plástico e tampa de acionamento por pedal nas instalações sanitárias. Base legal: Item 4.1.13 – RDC 275/2002.' },
        { id: '15-h', crit: 'N', text: 'Lavatórios Exclusivos para Higienização das Mãos na Área de Manipulação de Alimentos', isHeader: true },
        { id: '15.1', crit: 'N', text: 'Instalar os lavatórios em posição estratégica ao fluxo de preparo dos alimentos, em número suficiente. Base legal: Item 4.1.14 – RDC 275/2002.' },
        { id: '15.2', crit: 'N', text: 'Prover os lavatórios com sabonete líquido anti-séptico (ou sabonete líquido e produto anti-séptico) e toalhas de papel não reciclado. Base legal: Item 4.1.13 – RDC 275/2002.' },
        { id: '15.3', crit: 'N', text: 'Instalar lixeira com saco plástico e tampa de acionamento por pedal junto aos lavatórios. Base legal: Item 4.1.13 – RDC 275/2002.' },
      ]
    },
    {
      id: 'al-equipamentos',
      titulo: '2. EQUIPAMENTOS',
      itens: [
        { id: '16', crit: 'N', text: 'Usar equipamentos, móveis e utensílios de materiais resistentes à corrosão e a repetidas limpezas e desinfecções. Base legal: Item 4.1.15 – RDC 275/2002.' },
        { id: '17', crit: 'N', text: 'Usar equipamentos, móveis e utensílios com superfícies lisas, impermeáveis e laváveis. Base legal: Item 4.1.17 – RDC 275/2002.' },
        { id: '18', crit: 'N', text: 'Manter essas superfícies sem rugosidades, frestas ou outras imperfeições que dificultem a higienização ou contaminem os alimentos. Base legal: Item 4.1.17 – RDC 275/2002.' },
        { id: '19', crit: 'N', text: 'Apresentar o registro de manutenção programada e periódica dos equipamentos e utensílios. Base legal: Item 4.1.16 – RDC 275/2002.' },
        { id: '20', crit: 'N', text: 'Apresentar o registro de calibração dos instrumentos e equipamentos de medição. Base legal: Item 4.1.16 – RDC 275/2002.' },
        { id: '21-h', crit: 'N', text: 'Higienização das Instalações, Equipamentos, Móveis e Utensílios', isHeader: true },
        { id: '21.1', crit: 'N', text: 'Apresentar o registro de limpeza dos equipamentos, móveis e utensílios, quando não realizada rotineiramente. Base legal: Item 4.2.3 – RDC 275/2002.' },
        { id: '21.2', crit: 'N', text: 'Apresentar o registro de limpeza periódica das caixas de gordura. Base legal: Item 4.2.2 – RDC 275/2002.' },
        { id: '21.3', crit: 'N', text: 'Usar produtos saneantes regularizados pelo Ministério da Saúde. Base legal: Item 4.2.5 – RDC 275/2002.' },
        { id: '21.4', crit: 'N', text: 'Manter local adequado e protegido para o depósito de material de limpeza. Base legal: Item 4.2.5 – RDC 275/2002.' },
        { id: '21.5', crit: 'N', text: 'Usar utensílios diferentes para higienizar as instalações e para higienizar as partes dos equipamentos/utensílios que entram em contato com o alimento. Base legal: Item 4.2.6 – RDC 275/2002.' },
      ]
    },
    {
      id: 'al-vetores',
      titulo: '3. CONTROLE INTEGRADO DE VETORES E PRAGAS URBANAS',
      itens: [
        { id: '22', crit: 'N', text: 'Manter a edificação, instalações, equipamentos, móveis e utensílios livres de vetores e pragas urbanas. Base legal: Item 4.3.1 – RDC 275/2002.' },
        { id: '23', crit: 'N', text: 'Adotar medidas preventivas contra a atração, o abrigo, o acesso e a proliferação de vetores e pragas urbanas. Base legal: Item 4.3.1 – RDC 275/2002.' },
        { id: '24', crit: 'N', text: 'Contratar empresa especializada e registrada na Vigilância Sanitária para o controle químico de pragas. Base legal: Item 4.3.2 – RDC 275/2002.' },
      ]
    },
    {
      id: 'al-abastecimento',
      titulo: '4. ABASTECIMENTO DE ÁGUA',
      itens: [
        { id: '25', crit: 'N', text: 'Apresentar laudo laboratorial semestral que ateste a potabilidade da água, quando usada solução alternativa de abastecimento. Base legal: Item 4.4.1 – RDC 275/2002.' },
        { id: '26', crit: 'N', text: 'Fabricar o gelo usado em alimentos a partir de água potável. Base legal: Item 4.4.2 – RDC 275/2002.' },
        { id: '27', crit: 'N', text: 'Produzir a partir de água potável o vapor que entrar em contato direto com alimentos ou com superfícies que os toquem. Base legal: Item 4.4.3 – RDC 275/2002.' },
        { id: '28', crit: 'N', text: 'Apresentar comprovante de limpeza do reservatório de água. Base legal: Item 4.4.4 – RDC 275/2002.' },
        { id: '29', crit: 'N', text: 'Higienizar o reservatório de água a cada seis meses, no máximo. Base legal: Item 4.4.4 – RDC 275/2002.' },
        { id: '30', crit: 'N', text: 'Manter o reservatório de água livre de rachaduras, vazamentos, infiltrações e descascamentos. Base legal: Item 4.4.4 – RDC 275/2002.' },
      ]
    },
    {
      id: 'al-residuos',
      titulo: '5. MANEJO DE RESÍDUOS',
      itens: [
        { id: '31', crit: 'N', text: 'Usar recipientes identificados e íntegros para os resíduos, de fácil higienização e transporte, em número e capacidade suficientes. Base legal: Item 4.5.1 – RDC 275/2002.' },
        { id: '32', crit: 'N', text: 'Usar recipientes com tampa de acionamento sem contato manual. Base legal: Item 4.5.2 – RDC 275/2002.' },
        { id: '33', crit: 'N', text: 'Coletar os resíduos com frequência, evitando acúmulos. Base legal: Item 4.5.3 – RDC 275/2002.' },
        { id: '34', crit: 'N', text: 'Estocar os resíduos em local fechado e isolado da área de preparação e armazenamento de alimentos. Base legal: Item 4.5.3 – RDC 275/2002.' },
      ]
    },
    {
      id: 'al-manipuladores',
      titulo: '6. MANIPULADORES',
      itens: [
        { id: '35', crit: 'N', text: 'Realizar e registrar o controle de saúde dos funcionários, conforme a legislação específica. Base legal: Item 4.6.1 – RDC 275/2002.' },
        { id: '36', crit: 'N', text: 'Afastar da preparação de alimentos qualquer manipulador com lesões ou sintomas de enfermidade que comprometam a qualidade higiênico-sanitária, enquanto durar a condição. Base legal: Item 4.6.2 – RDC 275/2002.' },
        { id: '37', crit: 'N', text: 'Manter boa apresentação e asseio pessoal, usando uniforme de trabalho completo, de cor clara, limpo e em bom estado. Base legal: Item 4.6.3 – RDC 275/2002.' },
        { id: '38', crit: 'N', text: 'Lavar cuidadosamente as mãos antes e depois de manipular alimentos, após interrupções do serviço, depois de usar os sanitários e sempre que necessário. Base legal: Item 4.6.4 – RDC 275/2002.' },
        { id: '39', crit: 'N', text: 'Afixar cartazes de orientação sobre a lavagem e anti-sepsia das mãos e demais hábitos de higiene, em locais de fácil visualização, inclusive nas instalações sanitárias e lavatórios. Base legal: Item 4.6.4 – RDC 275/2002.' },
        { id: '40', crit: 'N', text: 'Não espirrar, tossir, fumar, falar em excesso, cantar, assobiar ou manipular dinheiro durante o preparo dos alimentos, nem praticar outros atos que possam contaminá-los. Base legal: Item 4.6.5 – RDC 275/2002.' },
        { id: '41', crit: 'N', text: 'Manter os cabelos presos e protegidos por redes, toucas ou acessório apropriado; estar sem barba, com unhas curtas e sem esmalte, adornos ou maquiagem. Base legal: Item 4.6.6 – RDC 275/2002.' },
        { id: '42', crit: 'N', text: 'Realizar e registrar capacitações periódicas dos manipuladores em higiene pessoal, manipulação higiênica dos alimentos e doenças transmitidas por alimentos. Base legal: Item 4.6.7 – RDC 275/2002.' },
        { id: '43', crit: 'N', text: 'Exigir dos visitantes os mesmos requisitos de higiene e saúde estabelecidos para os manipuladores. Base legal: Item 4.6.8 – RDC 275/2002.' },
      ]
    },
    {
      id: 'al-materias-primas',
      titulo: '7. MATÉRIAS-PRIMAS, INGREDIENTES E EMBALAGENS',
      itens: [
        { id: '44', crit: 'N', text: 'Definir critérios para avaliação e seleção dos fornecedores de matérias-primas, ingredientes e embalagens. Base legal: Item 4.7.1 – RDC 275/2002.' },
        { id: '45', crit: 'N', text: 'Receber as matérias-primas, ingredientes e embalagens em área protegida e limpa. Base legal: Item 4.7.2 – RDC 275/2002.' },
        { id: '46', crit: 'N', text: 'Registrar a inspeção das matérias-primas e ingredientes no recebimento, verificando a integridade das embalagens e a temperatura dos produtos que precisem de conservação especial. Base legal: Item 4.7.3 – RDC 275/2002.' },
        { id: '47', crit: 'N', text: 'Devolver ao fornecedor as matérias-primas, ingredientes ou embalagens reprovadas na inspeção de recepção ou, se não for possível, identificá-las e armazená-las separadamente. Base legal: Item 4.7.4 – RDC 275/2002.' },
        { id: '48', crit: 'N', text: 'Armazenar as matérias-primas, ingredientes e embalagens em local limpo e organizado, protegidos contra contaminação. Base legal: Item 4.7.5 – RDC 275/2002.' },
        { id: '49', crit: 'N', text: 'Usar as matérias-primas e ingredientes dentro do prazo de validade. Base legal: Item 4.7.5 – RDC 275/2002.' },
        { id: '50', crit: 'N', text: 'Armazenar as matérias-primas, ingredientes e embalagens sobre paletes, estrados ou prateleiras, com no mínimo 30 cm de altura do piso e 40 cm de afastamento das paredes. Base legal: Item 4.7.6 – RDC 275/2002.' },
      ]
    },
    {
      id: 'al-preparacao',
      titulo: '8. PREPARAÇÃO DO ALIMENTO',
      itens: [
        { id: '51', crit: 'N', text: 'Adotar medidas durante o preparo dos alimentos para evitar contato direto ou indireto entre alimentos crus, semi-preparados e prontos para consumo, minimizando a contaminação cruzada. Base legal: Item 4.8.3 – RDC 275/2002.' },
        { id: '52', crit: 'N', text: 'Lavar e higienizar as mãos após manipular alimentos crus e antes de manusear alimentos já preparados. Base legal: Item 4.8.4 – RDC 275/2002.' },
        { id: '53', crit: 'N', text: 'Expor as matérias-primas e ingredientes perecíveis à temperatura ambiente apenas pelo tempo mínimo necessário ao preparo. Base legal: Item 4.8.5 – RDC 275/2002.' },
        { id: '54', crit: 'N', text: 'Acondicionar e identificar as matérias-primas e ingredientes não usados por completo, indicando ao menos o nome do produto, a data de fracionamento e o prazo de validade após aberta a embalagem original. Base legal: Item 4.8.6 – RDC 275/2002.' },
        { id: '55', crit: 'N', text: 'Avaliar a eficácia do tratamento térmico verificando a temperatura e o tempo usados ou, quando aplicável, a mudança de textura e cor na parte central do alimento. Base legal: Item 4.8.9 – RDC 275/2002.' },
        { id: '56', crit: 'N', text: 'Manter o óleo e a gordura usados para fritura em boas condições, sem se tornarem fonte de contaminação química. Base legal: Item 4.8.10 – RDC 275/2002.' },
        { id: '57', crit: 'N', text: 'Substituir o óleo e a gordura quando apresentarem aroma e sabor alterados, ou formação intensa de espuma e fumaça. Base legal: Item 4.8.11 – RDC 275/2002.' },
        { id: '58', crit: 'N', text: 'Não descongelar os alimentos congelados antes do tratamento térmico, exceto quando o fabricante recomendar o tratamento ainda congelado. Base legal: Item 4.8.12 – RDC 275/2002.' },
        { id: '59', crit: 'N', text: 'Descongelar os alimentos sob refrigeração a temperatura inferior a 5ºC, ou em forno de micro-ondas quando forem cozidos em seguida. Base legal: Item 4.8.13 – RDC 275/2002.' },
        { id: '60', crit: 'N', text: 'Não recongelar alimentos já descongelados; manter a parte não usada sob refrigeração a temperatura inferior a 5ºC. Base legal: Item 4.8.14 – RDC 275/2002.' },
        { id: '61', crit: 'N', text: 'Manter os alimentos cozidos e prontos para consumo em temperatura superior a 60ºC por, no máximo, 6 horas. Base legal: Item 4.8.15 – RDC 275/2002.' },
        { id: '62', crit: 'N', text: 'Resfriar os alimentos cozidos, quando necessário, de 60ºC para 10ºC em no máximo 2 horas, armazenando-os em seguida sob refrigeração abaixo de 5ºC ou congelamento abaixo de -18ºC. Base legal: Item 4.8.16 – RDC 275/2002.' },
        { id: '63', crit: 'N', text: 'Utilizar em até 5 dias os alimentos preparados e conservados a temperatura inferior a 4ºC. Base legal: Item 4.8.17 – RDC 275/2002.' },
        { id: '64', crit: 'N', text: 'Identificar os alimentos preparados e conservados sob refrigeração ou congelamento com, no mínimo, nome, data de preparo e prazo de validade. Base legal: Item 4.8.18 – RDC 275/2002.' },
        { id: '65', crit: 'N', text: 'Monitorar e registrar em mapa de controle a temperatura dos equipamentos de frio (geladeiras, freezers etc.). Base legal: Item 4.8.18 – RDC 275/2002.' },
        { id: '66', crit: 'N', text: 'Higienizar os alimentos consumidos crus com produtos registrados no órgão competente do Ministério da Saúde. Base legal: Item 4.8.19 – RDC 275/2002.' },
      ]
    },
    {
      id: 'al-armazenamento',
      titulo: '9. ARMAZENAMENTO E TRANSPORTE DO ALIMENTO PREPARADO',
      itens: [
        { id: '67', crit: 'N', text: 'Proteger contra contaminação e identificar (nome, data de preparo e validade) os alimentos preparados que aguardam armazenamento ou transporte. Base legal: Item 4.9.1 – RDC 275/2002.' },
        { id: '68', crit: 'N', text: 'Respeitar as condições de tempo e temperatura que garantam a qualidade higiênico-sanitária no armazenamento e na distribuição do alimento preparado. Base legal: Item 4.9.2 – RDC 275/2002.' },
        { id: '69', crit: 'N', text: 'Usar meios de transporte higienizados, com cobertura de proteção da carga e de uso exclusivo para alimentos. Base legal: Item 4.9.3 – RDC 275/2002.' },
      ]
    },
    {
      id: 'al-exposicao',
      titulo: '10. EXPOSIÇÃO AO CONSUMO DO ALIMENTO PREPARADO',
      itens: [
        { id: '70', crit: 'N', text: 'Manter organizada e em condições higiênico-sanitárias adequadas a área de exposição do alimento e o refeitório. Base legal: Item 4.10.1 – RDC 275/2002.' },
        { id: '71', crit: 'N', text: 'Fazer anti-sepsia das mãos e usar utensílios ou luvas descartáveis na exposição do alimento. Base legal: Item 4.10.2 – RDC 275/2002.' },
        { id: '72', crit: 'N', text: 'Instalar barreiras de proteção nos equipamentos de exposição do alimento, evitando contaminação por proximidade ou ação do consumidor. Base legal: Item 4.10.4 – RDC 275/2002.' },
        { id: '73', crit: 'N', text: 'Usar utensílios (pratos, copos, talheres) descartáveis ou, se reutilizáveis, higienizá-los e guardá-los em local protegido. Base legal: Item 4.10.5 – RDC 275/2002.' },
        { id: '74', crit: 'N', text: 'Reservar área exclusiva para o recebimento de pagamentos, sem que o funcionário responsável também manipule alimentos. Base legal: Item 4.10.7 – RDC 275/2002.' },
      ]
    },
    {
      id: 'al-documentacao',
      titulo: '11. DOCUMENTAÇÃO E REGISTRO',
      itens: [
        { id: '75', crit: 'N', text: 'Apresentar o manual de boas práticas e os procedimentos operacionais padronizados (POPs), disponíveis aos funcionários e às autoridades sanitárias. Base legal: Item 4.11.1 – RDC 275/2002.' },
        { id: '76', crit: 'N', text: 'Elaborar os POPs com as instruções sequenciais, a frequência de execução e o responsável por cada atividade, aprovados, datados e assinados pelo responsável do estabelecimento. Base legal: Item 4.11.2 – RDC 275/2002.' },
        { id: '77', crit: 'N', text: 'Manter os registros arquivados por no mínimo 30 dias, contados do preparo dos alimentos. Base legal: Item 4.11.3 – RDC 275/2002.' },
        { id: '78', crit: 'N', text: 'Apresentar o POP de higienização de instalações, equipamentos e móveis. Base legal: Item 4.11.4 – RDC 275/2002.' },
        { id: '79', crit: 'N', text: 'Apresentar o POP de controle integrado de vetores e pragas urbanas. Base legal: Item 4.11.4 – RDC 275/2002.' },
        { id: '80', crit: 'N', text: 'Apresentar o POP de higienização do reservatório de água. Base legal: Item 4.11.4 – RDC 275/2002.' },
        { id: '81', crit: 'N', text: 'Apresentar o POP de higiene e saúde dos manipuladores. Base legal: Item 4.11.4 – RDC 275/2002.' },
        { id: '82', crit: 'N', text: 'Comprovar a capacitação do responsável e dos manipuladores em contaminantes alimentares, doenças transmitidas por alimentos, manipulação higiênica e boas práticas. Base legal: Item 4.12.2 – RDC 275/2002.' },
      ]
    },
  ]
}

// Roteiro de nível estadual (sem município vinculado), transcrito do
// "Roteiro de Auto-Inspeção de Farmácias/Drogarias" fornecido pela usuária,
// baseado na Lei Federal nº 5.991/1973 e na RDC nº 44/2009 da Anvisa. Ao
// contrário dos outros roteiros, esta fonte JÁ classifica cada item por
// criticidade (I/N/R) — usei essa classificação original em vez do padrão
// 'N' genérico. Itens marcados como "Inf" (informativo) na fonte não são
// desvios em si, só perguntas de triagem que abrem um ou mais itens reais
// de verificação — viraram cabeçalhos (isHeader) com os itens de
// verificação como filhos, igual ao padrão já usado nos outros roteiros;
// os poucos itens puramente descritivos sem nenhum desdobramento de
// verificação (ex.: "1.12 Outro(s)", "8.1.1 Quais?") não entraram. Alguns
// itens da fonte não têm artigo de lei citado — nesses casos não inventei
// nenhuma citação, só deixei sem "Base legal". Dois itens da fonte vieram
// com o mesmo número "3.14" por engano; o segundo foi renumerado para
// "3.15" pra evitar duplicidade.
const farmaciaChecklist: ChecklistData = {
  titulo: 'Roteiro de Auto-Inspeção de Farmácias e Drogarias',
  subtitulo: 'Lei Federal nº 5.991/1973 e RDC nº 44/2009 (ANVISA)',
  categoria: 'SAÚDE',
  lei: 'Lei Federal nº 5.991/1973 e RDC nº 44/2009 (ANVISA)',
  especialidade: 'FARMÁCIAS E DROGARIAS',
  secoes: [
    {
      id: 'fd-documentos',
      titulo: '1. DOCUMENTOS APRESENTADOS',
      itens: [
        { id: '1.1', crit: 'N', text: 'Apresentar a AFE (Autorização de Funcionamento da Anvisa) atualizada.' },
        { id: '1.2', crit: 'N', text: 'Apresentar o Alvará de Localização e Funcionamento.' },
        { id: '1.3', crit: 'N', text: 'Manter o Alvará Sanitário anterior afixado em lugar visível ao público (em caso de renovação).' },
        { id: '1.4', crit: 'N', text: 'Manter a Certidão de Regularidade Técnica (CRF) afixada em lugar visível ao público.' },
        { id: '1.5', crit: 'N', text: 'Apresentar os Procedimentos Operacionais Padrão (POPs).' },
        { id: '1.6', crit: 'N', text: 'Apresentar o registro dos treinamentos dos POPs.' },
        { id: '1.7', crit: 'N', text: 'Apresentar o Manual de Boas Práticas Farmacêuticas.' },
        { id: '1.8', crit: 'I', text: 'Apresentar o certificado de limpeza da caixa d\'água, dentro da validade.' },
        { id: '1.9', crit: 'N', text: 'Apresentar o habite-se sanitário ou certificado de conclusão de obras (no caso de alvará inicial).' },
        { id: '1.10', crit: 'N', text: 'Apresentar o contrato social e a última alteração contratual.' },
        { id: '1.11', crit: 'I', text: 'Apresentar o Programa de Gerenciamento de Resíduos Sólidos (PGRS), com empresa responsável e validade indicadas. Base legal: Art. 20, Inciso I, c/c Inciso I, alínea g – Lei Federal nº 12.305/2010.' },
      ]
    },
    {
      id: 'fd-rt-rh',
      titulo: '2. RESPONSABILIDADE TÉCNICA E RECURSOS HUMANOS',
      itens: [
        { id: '2.1', crit: 'I', text: 'Manter responsável técnico inscrito no CRF no estabelecimento. Base legal: Art. 15 – Lei Federal nº 5.991/1973, c/c Art. 3º – RDC nº 44/2009 (Anvisa).' },
        { id: '2.2', crit: 'I', text: 'Garantir a presença do farmacêutico desde o início do horário de funcionamento. Base legal: Art. 15, §1º e §2º – Lei Federal nº 5.991/1973, c/c Art. 3º – RDC nº 44/2009.' },
        { id: '2.3', crit: 'I', text: 'Manter o farmacêutico identificado, de forma que o usuário o distinga dos demais funcionários. Base legal: Art. 17 – RDC nº 44/2009.' },
        { id: '2.4', crit: 'I', text: 'Afixar o nome, a função e o horário de assistência de cada farmacêutico, além do horário de funcionamento do estabelecimento. Base legal: Cap. II, Art. 2º, itens I e VI – RDC nº 44/2009.' },
        { id: '2.5', crit: 'R', text: 'Identificar e/ou uniformizar os funcionários. Base legal: Art. 17 – RDC nº 44/2009.' },
        { id: '2.5.1', crit: 'I', text: 'Manter os uniformes limpos e em boas condições. Base legal: Cap. IV, Seção I, Art. 17 – RDC nº 44/2009.' },
        { id: '2.6', crit: 'N', text: 'Manter registros de capacitação periódica dos funcionários. Base legal: Art. 24 a 28 – RDC nº 44/2009.' },
        { id: '2.7', crit: 'I', text: 'Disponibilizar EPIs em quantidade suficiente, com reposição periódica, aos funcionários envolvidos na prestação de serviços farmacêuticos. Base legal: Cap. IV, Seção I, Art. 18 – RDC nº 44/2009.' },
        { id: '2.8', crit: 'N', text: 'Descrever no Manual de Boas Práticas as atribuições e responsabilidades individuais de cada função. Base legal: Cap. IV, Seção II, Art. 19 – RDC nº 44/2009.' },
        { id: '2.9', crit: 'N', text: 'Treinar os funcionários sobre os riscos relacionados às atividades, suas causas e medidas preventivas. Base legal: Cap. IV, Seção III, Art. 27 – RDC nº 44/2009.' },
        { id: '2.10', crit: 'I', text: 'Garantir que os treinamentos abordem, para toda a equipe, os princípios de Boas Práticas Farmacêuticas e os POPs. Base legal: Cap. IV, Seção III, Art. 24 – RDC nº 44/2009.' },
        { id: '2.11', crit: 'I', text: 'Assegurar a todos os funcionários a promoção da saúde e a prevenção de acidentes, conforme as Normas Regulamentadoras de Segurança e Medicina do Trabalho. Base legal: Cap. IV, Seção I, Art. 18 – RDC nº 44/2009.' },
        { id: '2.12', crit: 'I', text: 'Realizar exames médicos admissionais e periódicos dos funcionários e mantê-los disponíveis à autoridade sanitária.' },
      ]
    },
    {
      id: 'fd-edificacao',
      titulo: '3. EDIFICAÇÃO E INSTALAÇÕES FÍSICAS GERAIS',
      itens: [
        { id: '3.1', crit: 'N', text: 'Manter estrutura física compatível com as atividades desenvolvidas. Base legal: Art. 5º – RDC nº 44/2009.' },
        { id: '3.2', crit: 'N', text: 'Garantir acesso independente, sem comunicação com residências ou outros estabelecimentos. Base legal: Art. 23 – Lei Federal nº 5.991/1973, c/c Art. 13 – RDC nº 44/2009.' },
        { id: '3.3', crit: 'N', text: 'Manter ambientes distintos para atividades administrativas, armazenamento, dispensação, banheiro e depósito de material de limpeza (DML). Base legal: Art. 5º – RDC nº 44/2009.' },
        { id: '3.4', crit: 'N', text: 'Manter as instalações internas em boas condições higiênico-sanitárias e protegidas contra a entrada de insetos e roedores. Base legal: Art. 6º – RDC nº 44/2009.' },
        { id: '3.5', crit: 'N', text: 'Usar piso, parede e teto lisos, impermeáveis, sem rachaduras e de fácil higienização. Base legal: Art. 6º – RDC nº 44/2009.' },
        { id: '3.6', crit: 'N', text: 'Garantir ventilação e iluminação compatíveis com as atividades desenvolvidas. Base legal: Art. 6º – RDC nº 44/2009.' },
        { id: '3.7', crit: 'N', text: 'Manter sanitário de fácil acesso, com pia, água corrente, sabão líquido e lixeira, em boas condições de limpeza e higiene. Base legal: Art. 9º – RDC nº 44/2009.' },
        { id: '3.8', crit: 'N', text: 'Disponibilizar toalha de uso individual e descartável, detergente líquido e lixeira identificada com pedal e tampa. Base legal: Cap. III, Seção I, Art. 9º – RDC nº 44/2009.' },
        { id: '3.9', crit: 'R', text: 'Disponibilizar local para guarda de pertences dos funcionários, fora da área de vendas. Base legal: Art. 10 – RDC nº 44/2009.' },
        { id: '3.10', crit: 'N', text: 'Usar materiais de limpeza regularizados na Anvisa e armazená-los em local designado para essa finalidade. Base legal: Art. 8º – RDC nº 44/2009.' },
        { id: '3.11', crit: 'N', text: 'Manter equipamentos de combate a incêndio dentro da validade e em locais de fácil acesso. Base legal: Art. 6º, §4º – RDC nº 44/2009.' },
        { id: '3.12', crit: 'R', text: 'Manter em local visível ao público o Alvará Sanitário, o CRT e o cartaz complementar de identificação. Base legal: Art. 2º, §1º e §2º – RDC nº 44/2009.' },
        { id: '3.13', crit: 'N', text: 'Usar as dependências exclusivamente para as atividades licenciadas. Base legal: Art. 55 – Lei Federal nº 5.991/1973, c/c Art. 90 – RDC nº 44/2009.' },
        { id: '3.14', crit: 'N', text: 'Manter extintores válidos e apropriados para as áreas onde se encontram.' },
        { id: '3.15', crit: 'I', text: 'Apresentar o certificado de controle de pragas e vetores (desratização, desinsetização etc.), dentro da validade. Base legal: Cap. III, Art. 5º, §2º – RDC nº 44/2009.' },
      ]
    },
    {
      id: 'fd-aquisicao',
      titulo: '4. AQUISIÇÃO E RECEBIMENTO',
      itens: [
        { id: '4.1', crit: 'N', text: 'Estabelecer e documentar critérios para qualificação de fornecedores. Base legal: Cap. V, Seção II, Art. 30 – RDC nº 44/2009.' },
        { id: '4.2', crit: 'I', text: 'Adquirir somente produtos industrializados com registro, notificação ou cadastro na Anvisa, ou legalmente dispensados desses requisitos. Base legal: Cap. V, Seção II, Art. 30 – RDC nº 44/2009.' },
        { id: '4.3', crit: 'I', text: 'Apresentar nota fiscal de compra com nome do medicamento, número de lote e fabricante do produto.' },
        { id: '4.4', crit: 'I', text: 'Apresentar o POP de aquisição, recebimento e conferência dos produtos.' },
        { id: '4.5', crit: 'N', text: 'Realizar a aquisição e o recebimento conforme o POP e registrar sua execução.' },
        { id: '4.6', crit: 'I', text: 'Conferir, no recebimento, as notas fiscais de compra quanto ao nome, número do lote e fabricante dos produtos. Base legal: Cap. V, Seção II, Art. 31, §2º – RDC nº 44/2009.' },
        { id: '4.7', crit: 'N', text: 'Designar pessoa comprovadamente treinada para o recebimento de produtos sujeitos às normas de vigilância sanitária. Base legal: Cap. V, Seção II, Art. 32 – RDC nº 44/2009.' },
        { id: '4.8', crit: 'I', text: 'Receber somente produtos sujeitos às normas de vigilância sanitária que atendam aos critérios de aquisição e tenham sido transportados conforme as especificações do fabricante e a legislação sanitária. Base legal: Cap. V, Seção II, Art. 33 – RDC nº 44/2009.' },
        { id: '4.8.1', crit: 'I', text: 'Separar imediatamente os produtos adulterados ou com suspeita de falsificação dos demais, evitando confusões. Base legal: Cap. V, Seção II, Art. 34, §1º – RDC nº 44/2009.' },
        { id: '4.8.2', crit: 'I', text: 'Identificar claramente esses produtos como não destinados ao uso ou comercialização. Base legal: Cap. V, Seção II, Art. 34, §1º – RDC nº 44/2009.' },
        { id: '4.8.3', crit: 'I', text: 'Notificar imediatamente a autoridade sanitária competente, informando os dados de identificação do produto. Base legal: Cap. V, Seção II, Art. 34, §2º – RDC nº 44/2009.' },
        { id: '4.9', crit: 'N', text: 'Apresentar o POP das medidas adotadas nesses casos.' },
        { id: '4.10', crit: 'N', text: 'Adotar as medidas conforme o POP e registrar sua execução.' },
      ]
    },
    {
      id: 'fd-armazenagem',
      titulo: '5. ARMAZENAGEM E EXPOSIÇÃO DOS PRODUTOS',
      itens: [
        { id: '5.1', crit: 'N', text: 'Armazenar os produtos em gavetas, prateleiras ou suporte equivalente, afastados do piso, parede e teto, para permitir fácil limpeza e inspeção. Base legal: Art. 35 e Art. 36 – RDC nº 44/2009.' },
        { id: '5.2', crit: 'I', text: 'Garantir capacidade suficiente no ambiente de armazenamento para manter as diversas categorias de produtos organizadas. Base legal: Cap. V, Seção III, Art. 35, §1º – RDC nº 44/2009.' },
        { id: '5.3', crit: 'I', text: 'Proteger os produtos da ação direta da luz solar, da umidade e do calor. Base legal: Cap. V, Seção III, Art. 35, §2º – RDC nº 44/2009.' },
        { id: '5.4', crit: 'N', text: 'Armazenar com segurança os produtos inflamáveis, explosivos e afins. Base legal: Art. 39 – RDC nº 44/2009.' },
        { id: '5.5', crit: 'N', text: 'Registrar a temperatura e a umidade do ambiente de armazenamento. Base legal: Art. 35, §2º – RDC nº 44/2009.' },
        { id: '5.6-h', crit: 'N', text: 'Medicamentos com Armazenagem entre 2ºC e 8ºC', isHeader: true },
        { id: '5.6.1', crit: 'I', text: 'Manter esses medicamentos em condições adequadas de armazenagem. Base legal: Art. 35, §3º – RDC nº 44/2009.' },
        { id: '5.6.2', crit: 'I', text: 'Manter termômetros calibrados nos refrigeradores de medicamentos. Base legal: Art. 35, §3º – RDC nº 44/2009.' },
        { id: '5.6.3', crit: 'I', text: 'Registrar diariamente a temperatura dos refrigeradores. Base legal: Art. 35, §3º – RDC nº 44/2009.' },
        { id: '5.7', crit: 'I', text: 'Manter os medicamentos sujeitos a prescrição em local de acesso restrito aos funcionários, em armário com chave. Base legal: Art. 40, §1º – RDC nº 44/2009.' },
        { id: '5.8', crit: 'I', text: 'Segregar, em ambiente separado da área de dispensação, os produtos violados, vencidos ou impróprios para uso, identificando sua condição e destino. Base legal: Cap. V, Seção III, Art. 38, §2º – RDC nº 44/2009.' },
        { id: '5.9', crit: 'I', text: 'Descartar esses produtos conforme a legislação de Gerenciamento de Resíduos de Serviços de Saúde. Base legal: Cap. V, Seção III, Art. 38, §2º – RDC nº 44/2009.' },
        { id: '5.10', crit: 'I', text: 'Descrever no Manual de Boas Práticas a política da empresa para produtos próximos ao vencimento, de forma clara a todos os funcionários. Base legal: Cap. V, Seção III, Art. 38, §4º – RDC nº 44/2009.' },
        { id: '5.11-h', crit: 'N', text: 'Medicamentos em Sistema de Autosserviço', isHeader: true },
        { id: '5.11.1', crit: 'N', text: 'Expor em sistema de autosserviço somente os medicamentos permitidos pela RDC nº 41/2012. Base legal: RDC nº 41/2012 (Anvisa).' },
      ]
    },
    {
      id: 'fd-produtos',
      titulo: '6. PRODUTOS',
      itens: [
        { id: '6.1', crit: 'I', text: 'Rotular e acondicionar adequadamente as ervas e plantas medicinais. Base legal: Art. 7º – Lei Federal nº 5.991/1973.' },
        { id: '6.2', crit: 'I', text: 'Manter os medicamentos em suas embalagens originais, com registro no Ministério da Saúde. Base legal: Art. 11 e Art. 12 – Lei Federal nº 6.360/1976, c/c Art. 30 – RDC nº 44/2009.' },
        { id: '6.3', crit: 'I', text: 'Manter rotulagem adequada nos produtos, com lote, validade, data de fabricação, regularidade junto ao órgão competente e nacionalização. Base legal: Art. 11, §2º, e Art. 25 – Lei Federal nº 6.360/1976, c/c Art. 30 e Art. 34 – RDC nº 44/2009.' },
        { id: '6.4', crit: 'I', text: 'Manter na validade todos os produtos expostos para venda. Base legal: Art. 8º – Lei Federal nº 5.991/1973, c/c Art. 38 – RDC nº 44/2009.' },
        { id: '6.5', crit: 'N', text: 'Dar tratamento diferenciado aos produtos pré-vencidos. Base legal: Art. 38 – RDC nº 44/2009.' },
        { id: '6.6-h', crit: 'N', text: 'Fracionamento de Medicamentos', isHeader: true },
        { id: '6.6.1', crit: 'I', text: 'Realizar o fracionamento de medicamentos conforme a legislação específica. Base legal: RDC nº 80/2006 (Anvisa).' },
        { id: '6.7', crit: 'I', text: 'Não vender medicamentos em embalagem hospitalar. Base legal: RDC nº 333/2003 (Anvisa).' },
        { id: '6.8', crit: 'N', text: 'Manter a lista de medicamentos genéricos à disposição dos usuários. Base legal: Art. 42, §1º – RDC nº 44/2009.' },
        { id: '6.9', crit: 'I', text: 'Não captar receitas médicas para fins de manipulação. Base legal: Art. 1º – Lei Federal nº 11.951/2009, c/c Art. 50 – RDC nº 44/2009.' },
        { id: '6.10', crit: 'N', text: 'Expor à venda somente produtos permitidos ao ramo farmacêutico. Base legal: Art. 5º, §1º – Lei Federal nº 5.991/1973, c/c Art. 29 – RDC nº 44/2009, c/c IN nº 09/2009.' },
        { id: '6.11-h', crit: 'N', text: 'Dispensação por Meio Remoto', isHeader: true },
        { id: '6.11.1', crit: 'N', text: 'Cumprir as normas de dispensação de medicamentos por meio remoto. Base legal: Art. 52 a Art. 59 – RDC nº 44/2009.' },
      ]
    },
    {
      id: 'fd-controle-especial',
      titulo: '7. MEDICAMENTOS SUJEITOS A CONTROLE ESPECIAL',
      itens: [
        { id: '7.1-h', crit: 'N', text: 'Medicamentos Sujeitos a Controle Especial', isHeader: true },
        { id: '7.1.1', crit: 'I', text: 'Regularizar o estabelecimento para o comércio de medicamentos sujeitos a controle especial. Base legal: Art. 49 – RDC nº 44/2009, e RDC nº 22/2014, c/c Portaria nº 344/1998.' },
        { id: '7.2', crit: 'I', text: 'Guardar os medicamentos controlados conforme a legislação vigente. Base legal: Art. 67 – Portaria nº 344/1998, c/c Art. 37 – RDC nº 44/2009.' },
        { id: '7.3', crit: 'I', text: 'Manter a escrituração atualizada perante o SNGPC. Base legal: Art. 10 – RDC nº 22/2014, e RDC nº 20/2011.' },
        { id: '7.4', crit: 'I', text: 'Transmitir os dados ao SNGPC nos intervalos estabelecidos em legislação (a cada 7 dias). Base legal: Art. 10, §3º e §4º, Art. 11 e Art. 12, §1º e §2º – RDC nº 22/2014.' },
        { id: '7.5', crit: 'I', text: 'Manter os registros de entrada e saída conferentes com o estoque físico. Base legal: Art. 64 – Portaria nº 344/1998, c/c Art. 15 e Art. 16 – RDC nº 22/2014, e RDC nº 20/2011.' },
        { id: '7.6', crit: 'I', text: 'Dispensar os medicamentos controlados mediante retenção da receita. Base legal: Art. 25, Art. 52 a Art. 55 – Portaria nº 344/1998, e RDC nº 20/2011.' },
        { id: '7.7', crit: 'I', text: 'Cumprir as normas vigentes nas prescrições e notificações de receitas. Base legal: Art. 35, Art. 36, Art. 52, Art. 53 e Art. 55 – Portaria nº 344/1998, c/c RDC nº 58/2007, RDC nº 52/2011 e RDC nº 20/2011.' },
        { id: '7.8', crit: 'I', text: 'Enviar os balanços de medicamentos controlados nos prazos vigentes. Base legal: Art. 69 – Portaria nº 344/1998.' },
        { id: '7.9', crit: 'I', text: 'Não dispensar medicamentos controlados por meio remoto. Base legal: Art. 52, §2º – RDC nº 44/2009.' },
        { id: '7.10', crit: 'I', text: 'Conferir e dispensar as prescrições médicas exclusivamente pelo profissional farmacêutico. Base legal: Art. 37 – Resolução CFF nº 357/2001.' },
      ]
    },
    {
      id: 'fd-servicos',
      titulo: '8. PRESTAÇÃO DE SERVIÇOS FARMACÊUTICOS',
      itens: [
        { id: '8.1-h', crit: 'N', text: 'Serviços Farmacêuticos Além da Dispensação', isHeader: true },
        { id: '8.2', crit: 'I', text: 'Indicar no licenciamento do estabelecimento todos os serviços farmacêuticos prestados. Base legal: Cap. VI, Seção VI, Art. 61, §3º – RDC nº 44/2009.' },
        { id: '8.3', crit: 'N', text: 'Manter local específico para a prestação de serviços farmacêuticos, separado da dispensação e da circulação de pessoas. Base legal: Art. 18, §1º – Lei Federal nº 5.991/1973, c/c Art. 15 – RDC nº 44/2009.' },
        { id: '8.4', crit: 'N', text: 'Manter condições higiênico-sanitárias satisfatórias no local de prestação de serviços farmacêuticos. Base legal: Art. 18 – Lei Federal nº 5.991/1973, c/c Art. 15, §1º, e Art. 16, §1º – RDC nº 44/2009.' },
        { id: '8.5', crit: 'N', text: 'Prover a sala com pia, água corrente, sabonete líquido, toalhas descartáveis, gel bactericida e lixeira com pedal e tampa. Base legal: Art. 15, §2º – RDC nº 44/2009.' },
        { id: '8.6', crit: 'I', text: 'Descartar os perfurocortantes e materiais contaminados em local adequado. Base legal: Art. 73 e Art. 83 – RDC nº 44/2009.' },
        { id: '8.7', crit: 'I', text: 'Realizar a assepsia dos acessórios e equipamentos conforme as normas. Base legal: Art. 80 e Art. 83 – RDC nº 44/2009.' },
        { id: '8.8', crit: 'I', text: 'Manter agulhas, seringas, fitas de autoteste e brincos dentro da validade. Base legal: Art. 38, §1º – RDC nº 44/2009.' },
        { id: '8.9', crit: 'N', text: 'Não utilizar aparelhos de uso médico-ambulatorial.' },
        { id: '8.10', crit: 'N', text: 'Não prestar serviços não permitidos ao estabelecimento, como coleta de materiais biológicos ou xerox.' },
        { id: '8.11', crit: 'N', text: 'Manter profissional habilitado e/ou capacitado para aplicação de injetáveis.' },
        { id: '8.12', crit: 'N', text: 'Manter disponível lista atualizada com a identificação dos estabelecimentos públicos de saúde mais próximos, com endereço e telefone. Base legal: Art. 62 – RDC nº 44/2009.' },
        { id: '8.13', crit: 'I', text: 'Administrar medicamentos sujeitos a prescrição somente mediante apresentação da receita. Base legal: Cap. VI, Subseção II, Art. 75 – RDC nº 44/2009.' },
        { id: '8.14', crit: 'I', text: 'Manter condições adequadas para o descarte de perfurocortantes, conforme a legislação de Gerenciamento de Resíduos de Serviços de Saúde. Base legal: Cap. VI, Subseção II, Art. 73 – RDC nº 44/2009.' },
        { id: '8.15', crit: 'I', text: 'Manter registros das manutenções e calibrações periódicas dos aparelhos. Base legal: Cap. VI, Subseção II, Art. 77 – RDC nº 44/2009.' },
        { id: '8.16-h', crit: 'N', text: 'Perfuração de Lóbulo Auricular', isHeader: true },
        { id: '8.16.1', crit: 'I', text: 'Realizar a perfuração do lóbulo auricular com aparelho específico para esse fim, utilizando o brinco como material perfurante. Base legal: Cap. VI, Seção II, Art. 78 – RDC nº 44/2009.' },
      ]
    },
  ]
}

// Exclusivo de Prudentópolis (municipioId: 'prudentopolis' em roteiros/page.tsx)
// — transcrito do "Roteiro de Orientação e Adequação Sanitária: Clínicas de
// Estética — Procedimentos Invasivos" fornecido pela usuária. As 10 seções e
// 60 itens seguem a ordem e a redação já imperativa do documento original
// (coluna "O que providenciar/apresentar"), só reformatados pra incluir a
// base legal ao final de cada item, no mesmo padrão dos demais roteiros.
const clinicaEsteticaPrudentopolisChecklist: ChecklistData = {
  titulo: 'Guia de Inspeção para Clínica de Estética',
  subtitulo: 'Procedimentos invasivos — versão em linguagem simples, o que apresentar, providenciar ou manter',
  categoria: 'SAÚDE',
  lei: 'RDC nº 63/2011 (ANVISA) e Decreto Estadual nº 5.711/2002',
  especialidade: 'CLÍNICA DE ESTÉTICA',
  secoes: [
    {
      id: 'ce-doc',
      titulo: '1. DOCUMENTOS',
      itens: [
        { id: '1', crit: 'I', text: 'Providenciar o Projeto Arquitetônico adequado à legislação sanitária, devidamente aprovado pela Vigilância Sanitária (VISA). Base legal: Art. 23, I e Art. 34 – RDC nº 63/2011 (Anvisa); Art. 456 – Decreto Estadual nº 5.711/2002.' },
        { id: '2', crit: 'I', text: 'Apresentar o PGR, o PCMSO, os ASOs dos funcionários e o comprovante de vacinação (hepatite B e tétano). Base legal: Art. 116 e 147 – Decreto Estadual nº 5.711/2002; Item 32.2.4.17 – NR 32; Art. 23, II e Art. 44 – RDC nº 63/2011; Nota Técnica nº 001/2018 – SESA.' },
        { id: '3', crit: 'N', text: 'Manter disponíveis os manuais técnicos dos equipamentos em português e o registro de manutenção preventiva e corretiva. Base legal: Art. 454 – Decreto Estadual nº 5.711/2002; Nota Técnica nº 001/2018 – SESA.' },
        { id: '4', crit: 'I', text: 'Apresentar a Certidão de Inclusão de Responsabilidade Técnica e o Certificado de inscrição no conselho de classe do(s) responsável(is) técnico(s). Base legal: Art. 2º, I – Decreto Federal nº 77.052/1976; Art. 14 e Art. 29, Parágrafo único – RDC nº 63/2011; Art. 414 e 422 – Decreto Estadual nº 5.711/2002; Nota Técnica nº 001/2018 – SESA.' },
        { id: '5', crit: 'N', text: 'Providenciar o Certificado de controle integrado de pragas atualizado, emitido por empresa legalmente habilitada. Base legal: Art. 320 – Decreto Estadual nº 5.711/2002; Art. 23, VIII e Art. 63, Parágrafo único – RDC nº 63/2011.' },
        { id: '6', crit: 'I', text: 'Providenciar a limpeza e desinfecção do reservatório de água, com certificado ou registro emitido por empresa legalmente habilitada. Base legal: Art. 188, VII – Decreto Estadual nº 5.711/2002; Art. 39, §1º – RDC nº 63/2011.' },
        { id: '7', crit: 'N', text: 'Apresentar o PMOC (Plano de Manutenção, Operação e Controle) do sistema de climatização, se acima de 60.000 BTU/H, ou o registro de manutenção e limpeza do equipamento, se abaixo desse valor. Base legal: Lei Federal nº 13.589/2018; Art. 5º e Art. 6º, alínea "a" – Portaria nº 3.523/1998.' },
        { id: '8', crit: 'I', text: 'Apresentar o certificado e/ou contrato de coleta, transporte e destinação dos resíduos de serviços de saúde. Base legal: Art. 6º, XI – RDC nº 222/2018; Art. 23, V – RDC nº 63/2011.' },
        { id: '9', crit: 'N', text: 'Elaborar e manter atualizadas as normas, procedimentos e rotinas técnicas escritas (POPs) de todos os processos de trabalho — procedimentos realizados, higienização das mãos e limpeza/desinfecção de superfícies. Base legal: Art. 454 – Decreto Estadual nº 5.711/2002; Nota Técnica nº 001/2018 – SESA.' },
        { id: '10', crit: 'N', text: 'Estabelecer procedimento para registro e notificação de eventos adversos e queixas técnicas associadas a produtos e serviços. Base legal: Art. 23, XIV e XVI – RDC nº 63/2011.' },
        { id: '11', crit: 'R', text: 'Apresentar o contrato de prestação de serviços das atividades terceirizadas. Base legal: Art. 11 e Art. 23, V – RDC nº 63/2011.' },
        { id: '12', crit: 'N', text: 'Comprovar a capacitação dos profissionais, com registro de data, horário, carga horária, conteúdo ministrado, e nome e formação do instrutor e dos trabalhadores envolvidos. Base legal: Art. 454 – Decreto Estadual nº 5.711/2002; Art. 32, Parágrafo único – RDC nº 63/2011; Nota Técnica nº 001/2018 – SESA.' },
        { id: '13', crit: 'I', text: 'Elaborar protocolo de encaminhamento a serviço de maior complexidade em caso de intercorrências. Base legal: Art. 448 e 545 – Decreto Estadual nº 5.711/2002 c/c Nota Técnica nº 001/2018 – SESA.' },
        { id: '14', crit: 'N', text: 'Elaborar protocolo de encaminhamento em caso de acidente de trabalho. Base legal: Art. 448 e 545 – Decreto Estadual nº 5.711/2002 c/c Nota Técnica nº 001/2018 – SESA.' },
      ]
    },
    {
      id: 'ce-trab',
      titulo: '2. CONDIÇÕES DE TRABALHO',
      itens: [
        { id: '15', crit: 'R', text: 'Disponibilizar aos trabalhadores água potável e fresca, por meio de bebedouro de jato inclinado ou dispositivo equivalente. Base legal: Art. 136 – Decreto Estadual nº 5.711/2002.' },
        { id: '16', crit: 'R', text: 'Caso sejam realizadas refeições nas dependências, destinar local específico, com iluminação e ventilação suficientes. Base legal: Art. 137 – Decreto Estadual nº 5.711/2002.' },
        { id: '17', crit: 'R', text: 'Disponibilizar vestiário com armários individuais, separados por sexo. Base legal: Art. 139 – Decreto Estadual nº 5.711/2002.' },
        { id: '18', crit: 'I', text: 'Comprovar a entrega de EPI adequado ao risco e compatível com as atividades desenvolvidas pelos trabalhadores. Base legal: Art. 122 – Decreto Estadual nº 5.711/2002; Art. 47 – RDC nº 63/2011; Item 6.3 e 6.6.1 – NR-06.' },
        { id: '19', crit: 'N', text: 'Instalar guarda-corpo em escadas e rampas. Base legal: Art. 115, II e Art. 133, II – Decreto Estadual nº 5.711/2002; NR 8; Art. 173 – CLT.' },
      ]
    },
    {
      id: 'ce-infra',
      titulo: '3. INFRAESTRUTURA',
      itens: [
        { id: '20', crit: 'N', text: 'Manter a estrutura física conforme o projeto aprovado pela VISA. Base legal: Art. 294 – Decreto Estadual nº 5.711/2002.' },
        { id: '21', crit: 'N', text: 'Adequar a infraestrutura — recursos humanos, equipamentos e materiais — à demanda e à modalidade de assistência prestada. Base legal: Art. 17 – RDC nº 63/2011.' },
        { id: '22', crit: 'N', text: 'Garantir que piso, paredes, teto e mobiliários tenham superfícies íntegras, lisas, laváveis e impermeáveis. Base legal: Art. 36 e 42 – RDC nº 63/2011; RDC nº 50/2002.' },
        { id: '23', crit: 'N', text: 'Garantir iluminação e ventilação compatíveis com as atividades desenvolvidas nos ambientes. Base legal: Art. 38 – RDC nº 63/2011.' },
        { id: '24', crit: 'N', text: 'Utilizar colchonetes, colchões e demais estofados revestidos de material lavável e impermeável, sem furos, rasgos, sulcos ou reentrâncias. Base legal: Art. 56 – RDC nº 63/2011.' },
        { id: '25', crit: 'R', text: 'Manter portas com abertura fácil e corredores/passagens internas livres. Base legal: Art. 132 – Decreto Estadual nº 5.711/2002.' },
        { id: '26', crit: 'N', text: 'Disponibilizar instalações sanitárias independentes para ambos os sexos, com acesso independente e paredes/pisos impermeáveis e laváveis. Base legal: Art. 286 – Decreto Estadual nº 5.711/2002.' },
        { id: '27', crit: 'I', text: 'Disponibilizar lavatório/pia exclusiva para higienização das mãos dos profissionais nas áreas onde o paciente é examinado, manipulado ou medicado, com acionamento automático. Base legal: Decreto Federal nº 77.052/1976, Art. 2º, II e IV; Item B.4 – RDC nº 50/2002; NR 32, Item 32.2.4.3.' },
        { id: '28', crit: 'N', text: 'Abastecer os lavatórios/pias com dispensadores de sabonete líquido, papel toalha e lixeira com tampa acionada sem uso das mãos. Base legal: Decreto Federal nº 77.052/1976, Art. 2º, II e IV; Art. 326 e 327 – Decreto Estadual nº 5.711/2002; Item B.4 – RDC nº 50/2002; NR 32, Item 32.2.4.3.' },
        { id: '29', crit: 'I', text: 'Disponibilizar dispensadores abastecidos com solução alcoólica a 70% para profissionais, pacientes e acompanhantes. Base legal: Art. 59 – RDC nº 63/2011; RDC nº 42/2010.' },
        { id: '30', crit: 'N', text: 'Garantir iluminação e ventilação adequadas nas construções, por aberturas naturais ou sistemas artificiais — banheiros e cozinhas precisam de ventilação com tomada de ar externa. Base legal: Art. 282 – Decreto Estadual nº 5.711/2002.' },
      ]
    },
    {
      id: 'ce-apoio',
      titulo: '4. AMBIENTES DE APOIO',
      itens: [
        { id: '31', crit: 'R', text: 'Manter sala de espera com registro de pacientes/agendamento. Base legal: Art. 447 – Decreto Estadual nº 5.711/2002 c/c RDC nº 50/2002.' },
        { id: '32', crit: 'N', text: 'Disponibilizar sanitário para pacientes. Base legal: Art. 447 – Decreto Estadual nº 5.711/2002 c/c RDC nº 50/2002.' },
        { id: '33', crit: 'N', text: 'Disponibilizar DML (Depósito de Material de Limpeza) com tanque. Base legal: Art. 447 – Decreto Estadual nº 5.711/2002 c/c RDC nº 50/2002.' },
        { id: '34', crit: 'N', text: 'Disponibilizar sala de utilidades/expurgo com pia para lavagem. Base legal: Art. 447 – Decreto Estadual nº 5.711/2002 c/c RDC nº 50/2002.' },
        { id: '35', crit: 'R', text: 'Disponibilizar depósito de materiais e equipamentos/almoxarifado. Base legal: Art. 447 – Decreto Estadual nº 5.711/2002 c/c RDC nº 50/2002.' },
      ]
    },
    {
      id: 'ce-esteril',
      titulo: '5. ESTERILIZAÇÃO',
      itens: [
        { id: '36', crit: 'I', text: 'Organizar o fluxo de processamento de materiais — recepção, limpeza, inspeção, preparo, esterilização, armazenamento e distribuição — com estrutura física adequada. Base legal: Art. 447 – Decreto Estadual nº 5.711/2002 c/c RDC nº 50/2002; RDC nº 15/2012.' },
        { id: '37', crit: 'N', text: 'Utilizar materiais de limpeza e saneantes registrados na Anvisa e adequados à finalidade; na limpeza manual, usar acessórios não abrasivos que não liberem partículas. Base legal: Art. 66 e 89 – RDC nº 15/2012.' },
        { id: '38', crit: 'I', text: 'Identificar as embalagens com rótulos ou etiquetas contendo nome do produto, número do lote, data de esterilização, data limite de uso e nome do responsável pelo processo. Base legal: Art. 83, 84 e 85 – RDC nº 15/2012.' },
        { id: '39', crit: 'N', text: 'Garantir que as embalagens utilizadas estejam regularizadas junto à Anvisa. Base legal: Art. 78 – RDC nº 15/2012.' },
        { id: '40', crit: 'N', text: 'Armazenar os produtos esterilizados em local livre de poeira e sujidade, sem incidência solar, com manipulação mínima. Base legal: Art. 101 – RDC nº 15/2012.' },
        { id: '41', crit: 'I', text: 'Manter registro de monitoramento do processo de esterilização — testes químicos a cada ciclo da autoclave, físicos e biológicos diários. Base legal: Art. 96, 97, 98 e § único, Art. 99 e 100 – RDC nº 15/2012.' },
        { id: '42', crit: 'N', text: 'Autoclavar a ampola teste utilizada no monitoramento biológico antes do descarte. Base legal: Art. 111 – RDC nº 15/2012.' },
      ]
    },
    {
      id: 'ce-residuos',
      titulo: '6. RESÍDUOS',
      itens: [
        { id: '43', crit: 'I', text: 'Implantar o PGRSS (Plano de Gerenciamento de Resíduos de Serviços de Saúde). Base legal: Capítulo II, Art. 5º e § 3º – RDC nº 222/2018; Art. 226, II – Decreto Estadual nº 5.711/2002.' },
        { id: '44', crit: 'N', text: 'Utilizar recipientes/lixeiras resistentes à punctura, ruptura e vazamento, com tampa e sistema de abertura sem contato com as mãos, resistentes a tombamento. Base legal: Capítulo I, Seção III, Art. 3º, III – RDC nº 222/2018.' },
        { id: '45', crit: 'N', text: 'Identificar os recipientes/lixeiras de acordo com o grupo de resíduo a que pertencem. Base legal: Capítulo III, Seção I, Art. 22, §1º, §2º e §3º – RDC nº 222/2018.' },
      ]
    },
    {
      id: 'ce-residuo-infectante',
      titulo: '7. RESÍDUO INFECTANTE',
      itens: [
        { id: '46', crit: 'N', text: 'Acondicionar em saco branco leitoso os resíduos do Grupo A que não precisam ser obrigatoriamente tratados e os que já passaram por tratamento. Base legal: Capítulo III, Seção I, Art. 15 – RDC nº 222/2018.' },
        { id: '47', crit: 'I', text: 'Acondicionar em saco vermelho os resíduos que precisam de tratamento antes do destino final. Base legal: Capítulo IV, Seção V, Art. 55 e Parágrafo único – RDC nº 222/2018.' },
        { id: '48', crit: 'I', text: 'Descartar perfurocortantes em recipientes específicos, com suporte para fixação, em altura que permita visualização, em local protegido de umidade e respingos. Base legal: Capítulo IV, Seção IX, Art. 86, 87, 88 e 89 – RDC nº 222/2018; RDC nº 306/2004.' },
      ]
    },
    {
      id: 'ce-residuo-quimico',
      titulo: '8. RESÍDUO QUÍMICO',
      itens: [
        { id: '49', crit: 'N', text: 'Acondicionar resíduos líquidos em recipientes compatíveis com o material armazenado, com tampa rosqueada e vedante. Base legal: Capítulo III, Seção I, Art. 18 – RDC nº 222/2018.' },
        { id: '50', crit: 'N', text: 'Acondicionar resíduos sólidos em recipientes de material rígido e resistente, compatíveis com as características do produto químico. Base legal: Capítulo III, Seção I, Art. 19 – RDC nº 222/2018.' },
      ]
    },
    {
      id: 'ce-armazenamento-residuos',
      titulo: '9. ARMAZENAMENTO DE RESÍDUOS',
      itens: [
        { id: '51', crit: 'N', text: 'Realizar o armazenamento temporário dos resíduos na sala de utilidades/expurgo. Base legal: Capítulo III, Seção II e III – RDC nº 222/2018.' },
        { id: '52', crit: 'N', text: 'Disponibilizar abrigo externo de resíduos com acesso facilitado à coleta, lavável e com dimensão compatível com o volume gerado. Base legal: Capítulo III, Seção II e III – RDC nº 222/2018.' },
        { id: '53', crit: 'R', text: 'Manter área específica para limpeza e desinfecção dos recipientes coletores (carrinhos) utilizados no manejo de resíduos. Base legal: Capítulo III, Seção II e III – RDC nº 222/2018.' },
      ]
    },
    {
      id: 'ce-controle-especial',
      titulo: '10. AMOSTRAS GRÁTIS E MEDICAMENTOS PSICOTRÓPICOS, ENTORPECENTES OU OUTROS SUJEITOS A CONTROLE ESPECIAL',
      itens: [
        { id: '54', crit: 'N', text: 'Verificar se comercializa ou utiliza medicamentos previstos no Anexo I da Portaria SVS/MS nº 344/1998; em caso positivo, atender às exigências específicas para esses medicamentos. Base legal: Portaria SVS/MS nº 344/1998.' },
        { id: '55', crit: 'N', text: 'Manter os livros de escrituração protocolados junto à Vigilância Sanitária (CVS/FMS). Base legal: Art. 63 – Portaria SVS/MS nº 344/1998.' },
        { id: '56', crit: 'I', text: 'Manter o local de armazenamento dos medicamentos do Anexo I com chave e permanentemente fechado. Base legal: Art. 67 – Portaria SVS/MS nº 344/1998.' },
        { id: '57', crit: 'N', text: 'Realizar o BSPO (Balanço de Substâncias Psicoativas e Outras de Controle Especial) trimestralmente. Base legal: Art. 68 – Portaria SVS/MS nº 344/1998; Art. 1º – Resolução Estadual SESA/PR nº 225/1999.' },
        { id: '58', crit: 'N', text: 'Apresentar o Certificado de Regularidade para Substâncias e Medicamentos Psicotrópicos, carimbado. Base legal: Art. 3º, Parágrafo 2º – Resolução Estadual SESA/PR nº 225/1999.' },
        { id: '59', crit: 'R', text: 'Designar o profissional prescritor como responsável pela conservação das amostras grátis, e verificar condições de conservação, integridade, armazenamento, validade e distribuição. Base legal: Art. 8º, § 2º – RDC/Anvisa nº 60/2009.' },
        { id: '60', crit: 'N', text: 'Garantir que os medicamentos manipulados constem no rótulo com os dados da clínica. Base legal: Item 5.10.3.1 – RDC nº 67/2007.' },
      ]
    },
  ]
}

// Transcrito do Anexo II (Roteiro de Inspeção) da Resolução SESA nº 700/2013,
// que trata de salão de beleza, barbearia e/ou depilação — disponível para
// todos os municípios do Paraná (sem `municipioId`). Itens reescritos na
// redação imperativa já adotada nos demais roteiros (ex.: farmaciaChecklist),
// com a base legal (item do Anexo II) ao final de cada um.
const salaoBelezaChecklist: ChecklistData = {
  titulo: 'Roteiro de Inspeção de Salão de Beleza, Barbearia e Depilação',
  subtitulo: 'Resolução SESA nº 700/2013',
  categoria: 'SAÚDE',
  lei: 'Resolução SESA nº 700/2013',
  especialidade: 'SALÃO DE BELEZA, BARBEARIA E DEPILAÇÃO',
  secoes: [
    {
      id: 'sb-infraestrutura',
      titulo: '1. INFRAESTRUTURA',
      itens: [
        { id: '1.1', crit: 'I', text: 'Disponibilizar iluminação natural e/ou artificial, com luminárias providas de proteção. Base legal: Anexo II, item 1.1 – Res. SESA 700/2013.' },
        { id: '1.2', crit: 'I', text: 'Disponibilizar ventilação natural e/ou artificial que garanta troca efetiva de ar e conforto ambiental. Base legal: Anexo II, item 1.2 – Res. SESA 700/2013.' },
        { id: '1.3', crit: 'I', text: 'Manter acesso independente de residência ou de outro estabelecimento. Base legal: Anexo II, item 1.3 – Res. SESA 700/2013.' },
        { id: '1.4', crit: 'I', text: 'Disponibilizar lavatório de mãos com sabonete líquido, papel-toalha e lixeira sem tampa ou com tampa de acionamento por pedal ou automático na área de atendimento, com a rotina de lavagem das mãos afixada. Base legal: Anexo II, item 1.4 – Res. SESA 700/2013.' },
        { id: '1.5', crit: 'I', text: 'Disponibilizar área exclusiva para limpeza, embalagem e esterilização de materiais, com pia, ponto de água e bancada. Base legal: Anexo II, item 1.5 – Res. SESA 700/2013.' },
        { id: '1.6', crit: 'I', text: 'Disponibilizar tanque com profundidade superior a 35 cm, exclusivo para a lavagem de materiais usados na limpeza e higienização dos ambientes, e local/armário exclusivo e fechado para os produtos de limpeza. Base legal: Anexo II, item 1.6 – Res. SESA 700/2013.' },
        { id: '1.7', crit: 'N', text: 'Disponibilizar área privativa para refeições dos profissionais e/ou funcionários. Base legal: Anexo II, item 1.7 – Res. SESA 700/2013.' },
        { id: '1.8', crit: 'I', text: 'Manter instalação elétrica sem fiação exposta, com tomadas em número suficiente para evitar sobrecarga. Base legal: Anexo II, item 1.8 – Res. SESA 700/2013.' },
        { id: '1.9', crit: 'N', text: 'Depositar os resíduos sólidos, já embalados, em local apropriado, protegido do acesso de roedores e outros animais, fora da área de atendimento, enquanto aguardam o recolhimento. Base legal: Anexo II, item 1.9 – Res. SESA 700/2013.' },
        { id: '1.10', crit: 'I', text: 'Acondicionar os resíduos perfurocortantes em recipientes rígidos e vedados, identificados como material perfurocortante, com destinação final conforme determinação do município. Base legal: Anexo II, item 1.10 – Res. SESA 700/2013.' },
        { id: '1.11', crit: 'I', text: 'Acondicionar as embalagens dos produtos químicos e seus resíduos em recipientes vedados e compatíveis, identificados como material químico, com destinação final conforme determinação do município. Base legal: Anexo II, item 1.11 – Res. SESA 700/2013.' },
        { id: '1.12', crit: 'I', text: 'Realizar a limpeza semestral da caixa d\'água, com registro do procedimento e da data. Base legal: Anexo II, item 1.12 – Res. SESA 700/2013.' },
        { id: '1.13', crit: 'R', text: 'Manter cadastro dos clientes com nome, endereço, telefone e o procedimento realizado. Base legal: Anexo II, item 1.13 – Res. SESA 700/2013.' },
        { id: '1.14', crit: 'I', text: 'Apresentar o registro de limpeza/troca dos filtros do ar-condicionado e da manutenção preventiva, conforme especificação do fabricante. Base legal: Anexo II, item 1.14 – Res. SESA 700/2013.' },
        { id: '1.15', crit: 'I', text: 'Disponibilizar água potável e copos descartáveis. Base legal: Anexo II, item 1.15 – Res. SESA 700/2013.' },
      ]
    },
    {
      id: 'sb-procedimentos',
      titulo: '2. PROCEDIMENTOS',
      itens: [
        { id: '2.1', crit: 'I', text: 'Lavar as mãos com água e sabonete líquido, ou realizar antissepsia com álcool 70%, a cada cliente atendido, com lavagem obrigatória sempre que houver sujidade visível. Base legal: Anexo II, item 2.1 – Res. SESA 700/2013.' },
        { id: '2.2', crit: 'R', text: 'Usar luvas na atividade de manicure/pedicure. Base legal: Anexo II, item 2.2 – Res. SESA 700/2013.' },
        { id: '2.3', crit: 'I', text: 'Trocar as luvas usadas por manicures/pedicures a cada cliente, com prévia higienização das mãos. Base legal: Anexo II, item 2.3 – Res. SESA 700/2013.' },
        { id: '2.4', crit: 'I', text: 'Manter todos os produtos cosméticos e saneantes regularizados junto à ANVISA/Ministério da Saúde e dentro do prazo de validade. Base legal: Anexo II, item 2.4 – Res. SESA 700/2013.' },
        { id: '2.5', crit: 'I', text: 'Manter os utensílios de maquiagem (pincéis, esponjas etc.) em bom estado de conservação e higienizados após cada uso. Base legal: Anexo II, item 2.5 – Res. SESA 700/2013.' },
        { id: '2.6', crit: 'I', text: 'Acondicionar as soluções reenvasadas em recipientes previamente higienizados, identificados com o nome do produto, o lote e o prazo de validade. Base legal: Anexo II, item 2.6 – Res. SESA 700/2013.' },
        { id: '2.7', crit: 'R', text: 'Manter registro das orientações e/ou treinamentos periódicos dados aos profissionais sobre as rotinas de trabalho, com data, assunto, nome e assinatura do profissional. Base legal: Anexo II, item 2.7 – Res. SESA 700/2013.' },
        { id: '2.8', crit: 'R', text: 'Apresentar o certificado de formação dos profissionais na atividade desenvolvida. Base legal: Anexo II, item 2.8 – Res. SESA 700/2013.' },
        { id: '2.9', crit: 'I', text: 'Usar toalhas e lençóis limpos e secos, exclusivos para cada procedimento realizado. Base legal: Anexo II, item 2.9 – Res. SESA 700/2013.' },
        { id: '2.10', crit: 'I', text: 'Descartar imediatamente após o uso as toalhas e lençóis descartáveis, quando utilizados. Base legal: Anexo II, item 2.10 – Res. SESA 700/2013.' },
        { id: '2.11', crit: 'N', text: 'Acondicionar as roupas, toalhas e lençóis usados em recipiente liso, lavável e impermeável, identificado como "roupa suja". Base legal: Anexo II, item 2.11 – Res. SESA 700/2013.' },
        { id: '2.12', crit: 'N', text: 'Armazenar as toalhas limpas e secas em sacos plásticos, recipientes ou armário próprio. Base legal: Anexo II, item 2.12 – Res. SESA 700/2013.' },
        { id: '2.13', crit: 'I', text: 'Disponibilizar toalhas limpas em quantidade suficiente para cada procedimento. Base legal: Anexo II, item 2.13 – Res. SESA 700/2013.' },
        { id: '2.14', crit: 'N', text: 'Disponibilizar local e equipamento exclusivos para a higienização das toalhas, ou apresentar contrato e licença sanitária da empresa terceirizada. Base legal: Anexo II, item 2.14 – Res. SESA 700/2013.' },
      ]
    },
    {
      id: 'sb-esterilizacao',
      titulo: '3. ESTERILIZAÇÃO',
      itens: [
        { id: '3.1', crit: 'N', text: 'Apresentar os POPs (Procedimentos Operacionais Padrão), por escrito, dos processos de limpeza, embalagem e esterilização dos materiais. Base legal: Anexo II, item 3.1 – Res. SESA 700/2013.' },
        { id: '3.2', crit: 'I', text: 'Possuir autoclave para a esterilização dos materiais — proibidos fornos elétricos, estufas, equipamentos à base de radiação ultravioleta e a esterilização química por imersão:', isHeader: true },
        { id: '3.2.1', crit: 'I', text: 'Manter os equipamentos com registro/notificação na ANVISA. Base legal: Anexo II, item 3.2 – Res. SESA 700/2013.' },
        { id: '3.2.2', crit: 'I', text: 'Respeitar a relação tempo de exposição/temperatura conforme especificação do fabricante. Base legal: Anexo II, item 3.2 – Res. SESA 700/2013.' },
        { id: '3.2.3', crit: 'I', text: 'Realizar monitoramento biológico com frequência mínima mensal, anexado ao registro da esterilização. Base legal: Anexo II, item 3.2 – Res. SESA 700/2013.' },
        { id: '3.2.4', crit: 'I', text: 'Realizar monitoramento químico (multiparamétrico, no mínimo classe IV) a cada processo, anexado ao registro da esterilização. Base legal: Anexo II, item 3.2 – Res. SESA 700/2013.' },
        { id: '3.3', crit: 'I', text: 'Registrar a manutenção da autoclave, conforme orientação do fabricante. Base legal: Anexo II, item 3.3 – Res. SESA 700/2013.' },
        { id: '3.4', crit: 'N', text: 'Apresentar, quando utilizar outro processo de esterilização e/ou terceirização, a regularização do processo perante os órgãos sanitários, o contrato de prestação de serviço e a licença sanitária atualizada e válida da empresa contratada. Base legal: Anexo II, item 3.4 – Res. SESA 700/2013.' },
        { id: '3.5', crit: 'I', text: 'Realizar a limpeza prévia dos instrumentos (alicates, espátulas etc.) com água, detergente e escovinha exclusiva, com enxágue, secagem e acondicionamento para a esterilização, conforme rotina escrita. Base legal: Anexo II, item 3.5 – Res. SESA 700/2013.' },
        { id: '3.6', crit: 'I', text: 'Usar embalagem regulamentada pela ANVISA, íntegra, de uso único, com data de esterilização e indicador químico (termofísico) externo — proibidos papel kraft, papel manilha, papel jornal, papel-toalha, lâmina de papel-alumínio e embalagens de plástico transparente. Base legal: Anexo II, item 3.6 – Res. SESA 700/2013.' },
        { id: '3.7', crit: 'N', text: 'Registrar todas as cargas de esterilização, com data, quantidade de kits de instrumentos, horário de início e término, temperatura e assinatura do responsável. Base legal: Anexo II, item 3.7 – Res. SESA 700/2013.' },
      ]
    },
    {
      id: 'sb-manicure-pedicure',
      titulo: '4. MANICURE/PEDICURE',
      itens: [
        { id: '4.1', crit: 'I', text: 'Abrir as embalagens dos materiais esterilizados e do kit descartável (luva, protetor de bacia e cuba, lixa, palito) na frente do cliente. Base legal: Anexo II, item 4.1 – Res. SESA 700/2013.' },
        { id: '4.2', crit: 'I', text: 'Inutilizar e descartar os materiais de uso único (algodão, lixa de unha, lixa de pé, palito de madeira, protetor de bacia e cuba) ou fornecê-los ao cliente. Base legal: Anexo II, item 4.2 – Res. SESA 700/2013.' },
        { id: '4.3', crit: 'N', text: 'Responsabilizar-se pela esterilização e pelo acondicionamento, conforme a rotina do estabelecimento, quando o material do próprio cliente permanecer no local. Base legal: Anexo II, item 4.3 – Res. SESA 700/2013.' },
        { id: '4.4', crit: 'R', text: 'Manter o material de trabalho (algodão, esmaltes, removedor de esmalte etc.) organizado em recipientes, maletas ou gavetas. Base legal: Anexo II, item 4.4 – Res. SESA 700/2013.' },
        { id: '4.5', crit: 'I', text: 'Acondicionar os instrumentos já utilizados em recipiente lavável, exclusivo e sinalizado como "Instrumentos utilizados". Base legal: Anexo II, item 4.5 – Res. SESA 700/2013.' },
        { id: '4.6', crit: 'I', text: 'Acondicionar os instrumentos esterilizados em recipiente lavável, exclusivo e sinalizado como "Instrumentos limpos". Base legal: Anexo II, item 4.6 – Res. SESA 700/2013.' },
        { id: '4.7', crit: 'N', text: 'Lavar as bacias e cubas com água e sabão líquido ou detergente após o atendimento de cada cliente. Base legal: Anexo II, item 4.7 – Res. SESA 700/2013.' },
        { id: '4.8', crit: 'I', text: 'Usar hemostático somente em apresentação spray, quando utilizado. Base legal: Anexo II, item 4.8 – Res. SESA 700/2013.' },
      ]
    },
    {
      id: 'sb-cabeleireiro-barbeiro',
      titulo: '5. CABELEIREIRO/BARBEIRO',
      itens: [
        { id: '5.1', crit: 'I', text: 'Descartar as lâminas/navalhas após cada uso. Base legal: Anexo II, item 5.1 – Res. SESA 700/2013.' },
        { id: '5.2', crit: 'N', text: 'Manter escovas, pentes, bobs e utensílios semelhantes limpos. Base legal: Anexo II, item 5.2 – Res. SESA 700/2013.' },
        { id: '5.3', crit: 'I', text: 'Limpar e desinfetar as lâminas da máquina de aparar cabelo após o uso, com solução alcoólica a 70%. Base legal: Anexo II, item 5.3 – Res. SESA 700/2013.' },
      ]
    },
    {
      id: 'sb-saude-ocupacional',
      titulo: '6. SAÚDE OCUPACIONAL',
      itens: [
        { id: '6.1', crit: 'R', text: 'Apresentar a carteira de vacinação dos profissionais, com o calendário de vacinas em dia (Hepatite B, tétano e outras). Base legal: Anexo II, item 6.1 – Res. SESA 700/2013.' },
        { id: '6.2', crit: 'I', text: 'Usar os EPIs adequados a cada procedimento (máscara descartável, luva descartável, avental e calçado fechado). Base legal: Anexo II, item 6.2 – Res. SESA 700/2013.' },
        { id: '6.3', crit: 'I', text: 'Usar luvas de borracha na limpeza dos instrumentos cortantes. Base legal: Anexo II, item 6.3 – Res. SESA 700/2013.' },
        { id: '6.4', crit: 'N', text: 'Afixar em local visível ao público os cartazes educativos sobre prevenção de Hepatite B e C, proibição do uso de formol, esterilização de materiais e demais orientações fornecidas pela Secretaria Estadual de Saúde. Base legal: Anexo II, item 6.4 – Res. SESA 700/2013.' },
      ]
    },
    {
      id: 'sb-depilacao',
      titulo: '7. DEPILAÇÃO',
      itens: [
        { id: '7.1', crit: 'I', text: 'Disponibilizar local privativo para a depilação. Base legal: Anexo II, item 7.1 – Res. SESA 700/2013.' },
        { id: '7.2', crit: 'I', text: 'Usar maca de material íntegro, lavável e impermeável. Base legal: Anexo II, item 7.2 – Res. SESA 700/2013.' },
        { id: '7.3', crit: 'I', text: 'Disponibilizar lixeira com saco plástico para o descarte da cera usada. Base legal: Anexo II, item 7.3 – Res. SESA 700/2013.' },
        { id: '7.4', crit: 'N', text: 'Usar mesa auxiliar de superfície íntegra, lisa, lavável e resistente ao calor, para acomodar produtos e instrumentos/equipamentos. Base legal: Anexo II, item 7.4 – Res. SESA 700/2013.' },
        { id: '7.5', crit: 'I', text: 'Usar uma espátula exclusiva para preparar a cera e outra para aplicá-la, trocadas a cada cliente. Base legal: Anexo II, item 7.5 – Res. SESA 700/2013.' },
        { id: '7.6', crit: 'I', text: 'Usar espátulas descartáveis, ou passíveis de limpeza e desinfecção. Base legal: Anexo II, item 7.6 – Res. SESA 700/2013.' },
        { id: '7.7', crit: 'I', text: 'Usar cera de depilação identificada no rótulo, dentro do prazo de validade e regularizada conforme a legislação vigente. Base legal: Anexo II, item 7.7 – Res. SESA 700/2013.' },
        { id: '7.8', crit: 'I', text: 'Descartar a cera depilatória após cada uso, sendo proibida a sua reutilização. Base legal: Anexo II, item 7.8 – Res. SESA 700/2013.' },
        { id: '7.9', crit: 'I', text: 'Usar pinça acessória esterilizada ou descartável. Base legal: Anexo II, item 7.9 – Res. SESA 700/2013.' },
        { id: '7.10', crit: 'I', text: 'Usar a cera roll-on de forma única, ou de modo que o aplicador não entre em contato direto com a pele do cliente. Base legal: Anexo II, item 7.10 – Res. SESA 700/2013.' },
        { id: '7.11', crit: 'N', text: 'Manter higienizado o recipiente/equipamento usado para derreter a cera. Base legal: Anexo II, item 7.11 – Res. SESA 700/2013.' },
      ]
    },
    {
      id: 'sb-condicoes-gerais',
      titulo: '8. CONDIÇÕES GERAIS',
      itens: [
        { id: '8.1', crit: 'I', text: 'Manter o estabelecimento e as áreas externas em condições satisfatórias de limpeza e higiene. Base legal: Anexo II, item 8.1 – Res. SESA 700/2013.' },
        { id: '8.2', crit: 'I', text: 'Manter a estrutura física, os móveis e os equipamentos íntegros e em bom estado de conservação e limpeza. Base legal: Anexo II, item 8.2 – Res. SESA 700/2013.' },
        { id: '8.3', crit: 'I', text: 'Manter piso, teto e paredes com revestimento liso e lavável, limpos e conservados. Base legal: Anexo II, item 8.3 – Res. SESA 700/2013.' },
        { id: '8.4', crit: 'R', text: 'Organizar e empilhar caixas, fardos e materiais semelhantes de modo a permitir fácil limpeza e o controle de vetores. Base legal: Anexo II, item 8.4 – Res. SESA 700/2013.' },
      ]
    },
    {
      id: 'sb-servicos-domiciliares',
      titulo: '9. SERVIÇOS DOMICILIARES DE EMBELEZAMENTO (empresas que prestam atendimento domiciliar de manicure/pedicure e demais procedimentos — sujeitas integralmente a esta Resolução)',
      itens: [
        { id: '9.1', crit: 'I', text: 'Apresentar a licença sanitária da empresa prestadora de serviço domiciliar de manicure/pedicure. Base legal: Anexo II, item 9.1 – Res. SESA 700/2013.' },
        { id: '9.2', crit: 'I', text: 'Manter sede com ambiente exclusivo para esterilização dos materiais, com fluxo correto e controle/registro de entrada e saída de materiais, atendendo às exigências do item 3 (Esterilização). Base legal: Anexo II, item 9.2 – Res. SESA 700/2013.' },
        { id: '9.3', crit: 'I', text: 'Usar recipientes exclusivos, com tampa, laváveis e identificados como "material limpo" e "material sujo" para o transporte dos materiais. Base legal: Anexo II, item 9.3 – Res. SESA 700/2013.' },
        { id: '9.4', crit: 'N', text: 'Realizar capacitação prévia dos profissionais sobre higienização das mãos, transporte de materiais limpos e sujos, biossegurança, limpeza, preparo, esterilização e acondicionamento de materiais, e descarte de resíduos. Base legal: Anexo II, item 9.4 – Res. SESA 700/2013.' },
        { id: '9.5', crit: 'I', text: 'Disponibilizar vestiário para funcionários e/ou profissionais autônomos. Base legal: Anexo II, item 9.5 – Res. SESA 700/2013.' },
      ]
    },
  ]
}

// Transcrito do Anexo II (Roteiro de Inspeção) da Resolução SESA nº 126/2007,
// que trata de tatuagem, colocação de piercing e congêneres. O Anexo II só
// traz colunas SIM/NÃO, sem grau de criticidade (I/N/R) — a classificação
// abaixo segue o critério das Proibições/Rotinas do Anexo I: itens ligados a
// esterilização, biossegurança e proibições expressas viram 'I', itens
// documentais/administrativos viram 'N', e o único item marcado
// "(Recomendável)" no próprio formulário vira 'R'.
const tatuagemPiercingChecklist: ChecklistData = {
  titulo: 'Roteiro de Inspeção de Tatuagem, Piercing e Congêneres',
  subtitulo: 'Resolução SESA nº 0126/2007',
  categoria: 'SAÚDE',
  lei: 'Resolução SESA nº 0126/2007',
  especialidade: 'TATUAGEM, PIERCING E CONGÊNERES',
  secoes: [
    {
      id: 'tp-administracao',
      titulo: '1. ADMINISTRAÇÃO',
      itens: [
        { id: '1.1', crit: 'N', text: 'Manter cadastro dos clientes com nome, idade, sexo, endereço, telefone, procedimento (com data e topografia), eventos adversos e observações pertinentes. Base legal: Anexo II, item 1.1 – Res. SESA 126/2007.' },
        { id: '1.2', crit: 'I', text: 'Apresentar autorização por escrito dos pais ou do responsável legal para o atendimento de menores de 18 anos. Base legal: Anexo II, item 1.2 – Res. SESA 126/2007.' },
        { id: '1.3', crit: 'I', text: 'Apresentar o termo de consentimento livre e esclarecido, assinado pelo responsável legal quando o cliente for menor de idade. Base legal: Anexo II, item 1.3 – Res. SESA 126/2007.' },
        { id: '1.4', crit: 'N', text: 'Afixar, em local de fácil visualização e leitura, informativos sobre os riscos do procedimento, dos materiais e/ou substâncias utilizadas e sobre a dificuldade ou impossibilidade de remoção da tatuagem. Base legal: Anexo II, item 1.4 – Res. SESA 126/2007.' },
      ]
    },
    {
      id: 'tp-tatuagem',
      titulo: '2. TATUAGEM',
      itens: [
        { id: '2.1', crit: 'I', text: 'Proteger as bisnagas, frascos de tinta, equipamentos e pontas dos fios conectados à máquina de tatuar nas áreas de contato, trocando a proteção a cada cliente. Base legal: Anexo II, item 2.1 – Res. SESA 126/2007.' },
        { id: '2.2', crit: 'I', text: 'Usar agulhas descartáveis de uso único, embaladas adequadamente e dentro do prazo de validade da esterilização. Base legal: Anexo II, item 2.2 – Res. SESA 126/2007.' },
        { id: '2.3', crit: 'I', text: 'Esterilizar as agulhas soldadas à haste após a solda. Base legal: Anexo II, item 2.3 – Res. SESA 126/2007.' },
        { id: '2.4', crit: 'I', text: 'Lavar, secar, embalar individualmente e esterilizar as ponteiras/biqueiras reprocessadas. Base legal: Anexo II, item 2.4 – Res. SESA 126/2007.' },
        { id: '2.5', crit: 'I', text: 'Conectar as agulhas descartáveis à máquina na presença do cliente. Base legal: Anexo II, item 2.5 – Res. SESA 126/2007.' },
        { id: '2.6', crit: 'I', text: 'Fracionar as tintas para uso exclusivo de cada cliente e desprezá-las após o uso. Base legal: Anexo II, item 2.6 – Res. SESA 126/2007.' },
        { id: '2.7', crit: 'N', text: 'Desprezar os recipientes utilizados no fracionamento das tintas após o uso. Base legal: Anexo II, item 2.7 – Res. SESA 126/2007.' },
        { id: '2.8', crit: 'I', text: 'Usar dispositivos descartáveis de uso único para a retirada de pelos. Base legal: Anexo II, item 2.8 – Res. SESA 126/2007.' },
        { id: '2.9', crit: 'I', text: 'Realizar a antissepsia da pele com produto registrado no Ministério da Saúde. Base legal: Anexo II, item 2.9 – Res. SESA 126/2007.' },
        { id: '2.10', crit: 'N', text: 'Usar produto de uso individual para fixar o desenho na pele. Base legal: Anexo II, item 2.10 – Res. SESA 126/2007.' },
        { id: '2.11', crit: 'N', text: 'Identificar todas as soluções com o nome do produto, o lote e o prazo de validade. Base legal: Anexo II, item 2.11 – Res. SESA 126/2007.' },
        { id: '2.12', crit: 'I', text: 'Limpar e desinfetar a máquina de tatuar a cada uso. Base legal: Anexo II, item 2.12 – Res. SESA 126/2007.' },
        { id: '2.13', crit: 'I', text: 'Higienizar as mãos antes e depois de cada procedimento. Base legal: Anexo II, item 2.13 – Res. SESA 126/2007.' },
      ]
    },
    {
      id: 'tp-adornos',
      titulo: '3. ADORNOS (PIERCING, ALARGADOR E CONGÊNERES)',
      itens: [
        { id: '3.1', crit: 'I', text: 'Higienizar as mãos antes e depois de cada procedimento de colocação de adornos. Base legal: Anexo II, item 3.1 – Res. SESA 126/2007.' },
        { id: '3.2', crit: 'I', text: 'Realizar a antissepsia da pele e da mucosa com produto registrado no Ministério da Saúde. Base legal: Anexo II, item 3.2 – Res. SESA 126/2007.' },
        { id: '3.3', crit: 'I', text: 'Usar cateter estéril de uso único para a perfuração, com registro no Ministério da Saúde e dentro do prazo de validade — proibido usar produto para lubrificação do cateter que possa contaminá-lo. Base legal: Anexo II, item 3.3 – Res. SESA 126/2007.' },
        { id: '3.4', crit: 'I', text: 'Manter os adornos estéreis no momento da perfuração. Base legal: Anexo II, item 3.4 – Res. SESA 126/2007.' },
        { id: '3.5', crit: 'I', text: 'Não realizar procedimentos caracterizados como cirúrgicos (tunelização, bifurcação de língua, implantes, entre outros). Base legal: Anexo II, item 3.5 – Res. SESA 126/2007.' },
      ]
    },
    {
      id: 'tp-residuos',
      titulo: '4. RESÍDUOS',
      itens: [
        { id: '4.1', crit: 'I', text: 'Acondicionar os resíduos infectantes e perfurocortantes em recipientes rígidos, estanques e vedados. Base legal: Anexo II, item 4.1 – Res. SESA 126/2007.' },
        { id: '4.2', crit: 'N', text: 'Apresentar o contrato com empresa autorizada para a coleta de resíduos. Base legal: Anexo II, item 4.2 – Res. SESA 126/2007.' },
        { id: '4.3', crit: 'N', text: 'Disponibilizar lixeira com tampa e pedal para o descarte de luvas, algodão, gaze e materiais semelhantes. Base legal: Anexo II, item 4.3 – Res. SESA 126/2007.' },
      ]
    },
    {
      id: 'tp-estrutura-fisica',
      titulo: '5. ESTRUTURA FÍSICA',
      itens: [
        { id: '5.1', crit: 'N', text: 'Manter o ambiente claro, limpo e ventilado. Base legal: Anexo II, item 5.1 – Res. SESA 126/2007.' },
        { id: '5.2', crit: 'N', text: 'Revestir piso, parede e mobiliários com material liso, íntegro, lavável e impermeável. Base legal: Anexo II, item 5.2 – Res. SESA 126/2007.' },
        { id: '5.3', crit: 'I', text: 'Manter o estabelecimento sem vínculo com residência. Base legal: Anexo II, item 5.3 – Res. SESA 126/2007.' },
        { id: '5.4', crit: 'N', text: 'Manter barreira física entre as áreas de recepção/espera e a sala/área de procedimentos. Base legal: Anexo II, item 5.4 – Res. SESA 126/2007.' },
        { id: '5.5', crit: 'I', text: 'Disponibilizar, na área/sala de procedimento, lavatório com água corrente potável exclusivo para higienização das mãos. Base legal: Anexo II, item 5.5 – Res. SESA 126/2007.' },
        { id: '5.6', crit: 'I', text: 'Disponibilizar sabão líquido, antisséptico, papel-toalha e lixeira sem tampa ou com tampa de acionamento por pedal. Base legal: Anexo II, item 5.6 – Res. SESA 126/2007.' },
        { id: '5.7', crit: 'I', text: 'Disponibilizar, na CME, pia para a limpeza dos materiais em local exclusivo ou na área de procedimentos, desde que estabelecida barreira técnica. Base legal: Anexo II, item 5.7 – Res. SESA 126/2007.' },
        { id: '5.8', crit: 'N', text: 'Disponibilizar, no DML/sanitário, tanque ou ponto de água para a higienização dos panos de limpeza. Base legal: Anexo II, item 5.8 – Res. SESA 126/2007.' },
        { id: '5.9', crit: 'N', text: 'Disponibilizar na instalação sanitária: lavatório, lixeira com tampa e pedal, papel-toalha descartável e sabonete líquido. Base legal: Anexo II, item 5.9 – Res. SESA 126/2007.' },
      ]
    },
    {
      id: 'tp-saude-seguranca',
      titulo: '6. SAÚDE E SEGURANÇA DO TRABALHADOR',
      itens: [
        { id: '6.1', crit: 'R', text: 'Apresentar comprovante de vacinação contra Hepatite B do tatuador ou colocador de adornos. Base legal: Anexo II, item 6.1 – Res. SESA 126/2007.' },
        { id: '6.2', crit: 'N', text: 'Usar luvas de borracha na limpeza do material. Base legal: Anexo II, item 6.2 – Res. SESA 126/2007.' },
        { id: '6.3', crit: 'I', text: 'Usar os EPIs necessários — luvas descartáveis, máscara descartável, avental e sapato fechado — durante o procedimento. Base legal: Anexo II, item 6.3 – Res. SESA 126/2007.' },
      ]
    },
    {
      id: 'tp-esterilizacao',
      titulo: '7. ESTERILIZAÇÃO',
      itens: [
        { id: '7.1', crit: 'I', text: 'Disponibilizar autoclave e/ou estufa. Base legal: Anexo II, item 7.1 – Res. SESA 126/2007.' },
        { id: '7.2', crit: 'N', text: 'Apresentar o registro que comprove a manutenção preventiva e corretiva da autoclave e/ou estufa. Base legal: Anexo II, item 7.2 – Res. SESA 126/2007.' },
        { id: '7.3', crit: 'I', text: 'Usar invólucros indicados pelo Ministério da Saúde, íntegros e identificados com o tipo de produto, a data de esterilização, o prazo de validade e o indicador químico. Base legal: Anexo II, item 7.3 – Res. SESA 126/2007.' },
        { id: '7.4', crit: 'I', text: 'Realizar o controle biológico do processo de esterilização. Base legal: Anexo II, item 7.4 – Res. SESA 126/2007.' },
        { id: '7.5', crit: 'I', text: 'Acondicionar e armazenar os materiais esterilizados de forma a assegurar a manutenção da esterilização. Base legal: Anexo II, item 7.5 – Res. SESA 126/2007.' },
      ]
    },
    {
      id: 'tp-itens-gerais',
      titulo: '8. ITENS GERAIS',
      itens: [
        { id: '8.1', crit: 'I', text: 'Manter os produtos utilizados com registro no Ministério da Saúde, dentro do prazo de validade e acondicionados/armazenados conforme orientação do fabricante. Base legal: Anexo II, item 8.1 – Res. SESA 126/2007.' },
        { id: '8.2', crit: 'N', text: 'Limpar e desinfetar os mobiliários diariamente e entre os procedimentos. Base legal: Anexo II, item 8.2 – Res. SESA 126/2007.' },
        { id: '8.3', crit: 'N', text: 'Fornecer por escrito aos clientes os cuidados especiais e/ou as precauções necessárias após a realização de tatuagens, colocação de adornos e congêneres. Base legal: Anexo II, item 8.3 – Res. SESA 126/2007.' },
        { id: '8.4', crit: 'I', text: 'Não indicar uso de medicamentos — a prescrição é restrita a médico registrado no Conselho Regional de Medicina. Base legal: Anexo II, item 8.4 – Res. SESA 126/2007.' },
      ]
    },
  ]
}

// Transcrito do "Roteiro de Inspeção em Sistema de Abastecimento de Água -
// SAA e Soluções Alternativa Coletiva - SAC, Captação Subterrânea". O
// documento original só traz colunas SIM/NÃO/N.A., sem grau de criticidade —
// a classificação I/N/R abaixo segue o risco de cada exigência (segurança do
// trabalhador, potabilidade e proteção sanitária da captação viram 'I';
// documentação e organização administrativa viram 'N'). A numeração original
// do PDF tem itens duplicados (26 e 27 aparecem duas vezes) e números
// pulados (30, 34, 47, 48) — os itens abaixo foram renumerados de forma
// sequencial e sem lacunas, mantendo o texto e a base normativa de cada um.
const saaSubterraneoChecklist: ChecklistData = {
  titulo: 'Roteiro de Inspeção de SAA Subterrâneo',
  subtitulo: 'Sistema de Abastecimento de Água (SAA) e Solução Alternativa Coletiva (SAC) — captação subterrânea',
  categoria: 'SAÚDE',
  lei: 'Portaria de Consolidação GM/MS nº 5/2017 (alterada pela Portaria GM/MS nº 888/2021), Decreto Estadual nº 5.711/2002 e normas ABNT/NR aplicáveis',
  especialidade: 'SISTEMA DE ABASTECIMENTO DE ÁGUA — CAPTAÇÃO SUBTERRÂNEA',
  secoes: [
    {
      id: 'saa-documentos',
      titulo: '1. DOCUMENTOS',
      itens: [
        { id: '1', crit: 'I', text: 'Apresentar a Licença Ambiental ou a comprovação de dispensa de licença.' },
        { id: '2', crit: 'I', text: 'Apresentar a outorga dos pontos de captação.' },
        { id: '3', crit: 'N', text: 'Apresentar o plano de contingência para a captação.' },
        { id: '4', crit: 'I', text: 'Realizar as análises de controle mensal da água. Base legal: Anexo XX da Portaria de Consolidação GM/MS nº 5/2017, alterada pela Portaria GM/MS nº 888/2021, art. 14, inciso XI.' },
        { id: '5', crit: 'I', text: 'Realizar as análises de controle semestral da água. Base legal: Anexo XX da Portaria de Consolidação GM/MS nº 5/2017, alterada pela Portaria GM/MS nº 888/2021, art. 14, inciso XI.' },
        { id: '6', crit: 'N', text: 'Apresentar comprovante de treinamentos e capacitações dos profissionais que atuam na produção, distribuição, armazenamento e controle da qualidade da água para consumo humano. Base legal: Portaria GM/MS nº 888/2021, art. 14, inciso VI.' },
        { id: '7', crit: 'N', text: 'Apresentar o Plano de Amostragem atualizado e avaliado pela vigilância sanitária/ambiental do município. Base legal: Portaria GM/MS nº 888/2021, art. 14, inciso IV, e art. 44.' },
        { id: '8', crit: 'I', text: 'Apresentar a Anotação de Responsabilidade Técnica (ART). Base legal: Portaria GM/MS nº 888/2021, art. 23.' },
        { id: '9', crit: 'I', text: 'Comprovar que os materiais utilizados na produção, no armazenamento e na distribuição não alteram a qualidade da água nem oferecem risco à saúde. Base legal: Portaria GM/MS nº 888/2021, art. 14, incisos VII e IX.' },
        { id: '10', crit: 'I', text: 'Apresentar o Laudo de Atendimento dos Requisitos de Saúde (LARS) e a Comprovação de Baixo Risco à Saúde (CBRS). Base legal: Portaria GM/MS nº 888/2021, art. 14, incisos VIII e IX.' },
        { id: '11', crit: 'I', text: 'Apresentar o Programa de Controle Médico de Saúde Ocupacional (PCMSO). Base legal: NR-7.' },
        { id: '12', crit: 'N', text: 'Apresentar o Programa de Prevenção de Riscos Ocupacionais (PPRO).' },
        { id: '13', crit: 'I', text: 'Apresentar o Programa de Prevenção de Riscos Ambientais (PPRA). Base legal: NR-9.' },
      ]
    },
    {
      id: 'saa-captacao',
      titulo: '2. CAPTAÇÃO',
      itens: [
        { id: '14', crit: 'I', text: 'Manter a área dos sistemas de poços com proteção sanitária e condições de segurança. Base legal: NBR 12212/1992, item 5.2.' },
        { id: '15', crit: 'I', text: 'Manter o poço com selo sanitário. Base legal: Portaria GM/MS nº 888/2021, art. 14-II; NBR 12212/1992, item 6.10; NBR 12244/1992, item 6.2.3.' },
        { id: '16', crit: 'I', text: 'Manter a laje de proteção do poço envolvendo o tubo de revestimento, com declividade do centro para a borda, espessura mínima de 15 cm e área não inferior a 1,0 m². Base legal: NBR 12244/1992, item 6.2.4.' },
        { id: '17', crit: 'I', text: 'Manter, na área de captação, placas de identificação e mecanismos de segurança que impeçam o acesso de pessoas não autorizadas e de animais. Base legal: Portaria GM/MS nº 888/2021, art. 14-II; NR-10; NBR 12212/1992, item 5.2.' },
        { id: '18', crit: 'N', text: 'Eliminar fontes de poluição que pressionem a microbacia do manancial. Base legal: NBR 12212/1992, item 5.2.' },
        { id: '19', crit: 'I', text: 'Manter os equipamentos de bombeamento em local livre de enchentes. Base legal: NBR 12214/1992, item 5.3.' },
        { id: '20', crit: 'I', text: 'Manter os equipamentos de bombeamento protegidos. Base legal: NR-12.' },
        { id: '21', crit: 'N', text: 'Dispor de equipamento de bombeamento reserva. Base legal: NBR 12214/1992, item 5.3.2.' },
        { id: '22', crit: 'N', text: 'Manter o local de captação de fácil acesso e uso permanente. Base legal: NBR 12214/1992, item 5.3.' },
        { id: '23', crit: 'I', text: 'Manter dispositivos de proteção que previnam ou neutralizem o risco de acidente de trabalho junto à captação. Base legal: NBR 12214/1992, item 5.13; NR-10; NR-12.' },
        { id: '24', crit: 'N', text: 'Manter as estruturas e os equipamentos da captação em condições de conservação satisfatórias. Base legal: NBR 12214/1992, itens 5.12 e 5.13.' },
      ]
    },
    {
      id: 'saa-tratamento',
      titulo: '3. TRATAMENTO',
      itens: [
        { id: '25', crit: 'N', text: 'Identificar a casa de química e as bombas dosadoras de acordo com o produto utilizado. Base legal: NBR 12216, item 5.15.10; NR-1; NR-26.' },
        { id: '26', crit: 'I', text: 'Identificar e proteger os painéis elétricos. Base legal: NR-10; NR-26.' },
        { id: '27', crit: 'I', text: 'Manter, na casa de química, dispositivos de segurança que garantam o acesso somente a pessoas autorizadas.' },
        { id: '28', crit: 'I', text: 'Identificar e armazenar em local adequado os produtos químicos utilizados no processo de tratamento. Base legal: NBR 12216, item 5.19.' },
        { id: '29', crit: 'I', text: 'Dispor, na sala de dosagem, de dispositivo de detecção de vazamento, quando o tratamento for feito com cloro gás. Base legal: NBR 12216, item 5.19.' },
        { id: '30', crit: 'I', text: 'Dispor, na sala de dosagem, de sistema de exaustão forçada, quando o tratamento for feito com cloro gás. Base legal: NBR 12216, item 5.19.6.' },
        { id: '31', crit: 'I', text: 'Dispor de kit de emergência para conter vazamentos, quando o tratamento for feito com cloro gás. Base legal: NBR 13295 (ABNT).' },
        { id: '32', crit: 'I', text: 'Dispor de EPI destinado a conter vazamentos, quando o tratamento for feito com cloro gás. Base legal: NR-6.' },
        { id: '33', crit: 'N', text: 'Manter as estruturas e os equipamentos da ETA/UTA, de forma geral, em condições satisfatórias.' },
      ]
    },
    {
      id: 'saa-laboratorio',
      titulo: '4. LABORATÓRIO',
      itens: [
        { id: '34', crit: 'N', text: 'Manter as instalações do laboratório adequadas às atividades realizadas. Base legal: RDC nº 512/2021, art. 29.' },
        { id: '35', crit: 'N', text: 'Manter a área do laboratório conforme a NBR 12216/1992, item 5.20 — mínimo de 8 m² para estações com capacidade inferior a 10.000 m³/dia dispensadas de ensaios bacteriológicos, 12 m² quando obrigadas a análises bacteriológicas, e 16 m² para estações com capacidade igual ou superior a 10.000 m³/dia.' },
        { id: '36', crit: 'N', text: 'Manter a iluminação e a ventilação do laboratório conforme a NBR 12216/1992, item 5.20.4 — aberturas naturais com área mínima de 25% do piso e proteção contra sol e chuva, ou iluminação artificial com no mínimo 250 lux para trabalhos correntes e 500 lux para análises, com espectro semelhante ao da luz solar.' },
        { id: '37', crit: 'N', text: 'Manter as bancadas e os demais móveis do laboratório conforme a NBR 12216/1992, item 5.20.5 — altura de 0,90 m, profundidade mínima de 0,60 m, comprimento mínimo de 5,0 m ou 10,0 m conforme a capacidade da estação, espaço livre entre bancadas de ao menos 1,40 m e armários modulados sob as bancadas.' },
        { id: '38', crit: 'I', text: 'Manter separação física efetiva entre as áreas que realizam atividades incompatíveis. Base legal: RDC nº 512/2021, art. 29.' },
        { id: '39', crit: 'N', text: 'Identificar as áreas de acordo com sua função. Base legal: RDC nº 512/2021, art. 29.' },
        { id: '40', crit: 'I', text: 'Manter controle de acesso nas áreas restritas. Base legal: RDC nº 512/2021, art. 29.' },
        { id: '41', crit: 'I', text: 'Realizar o descarte, a descontaminação e a lavagem adequados de material. Base legal: RDC nº 512/2021, art. 29.' },
        { id: '42', crit: 'N', text: 'Manter condições para a realização de limpeza e, quando pertinente, de desinfecção das áreas. Base legal: RDC nº 512/2021, art. 29.' },
        { id: '43', crit: 'N', text: 'Manter as instalações em bom estado de organização, conservação, higiene e limpeza. Base legal: RDC nº 512/2021, art. 31.' },
        { id: '44', crit: 'I', text: 'Manter os equipamentos usados nas análises de controle identificados, calibrados e etiquetados, de forma a permitir identificar prontamente a situação de calibração. Base legal: ISO/IEC 17025:2017, item 6.4.8; RDC nº 512/2021, art. 42.' },
        { id: '45', crit: 'N', text: 'Apresentar POP para todas as análises realizadas. Base legal: ISO/IEC 17025:2017, item 7.2.1.2.' },
        { id: '46', crit: 'I', text: 'Aplicar metodologia analítica para determinação dos parâmetros de acordo com a legislação vigente. Base legal: Portaria GM/MS nº 888/2021, art. 22.' },
        { id: '47', crit: 'N', text: 'Manter procedimentos adequados de especificação, aquisição, recebimento, armazenamento, guarda, controle de estoque, controle de validade, distribuição e descarte de reagentes, insumos e materiais de consumo, atendendo às normas de segurança à saúde humana, animal e ao meio ambiente. Base legal: RDC nº 512/2021, art. 36.' },
        { id: '48', crit: 'N', text: 'Rotular inequivocamente os frascos de reagentes e soluções, permitindo a correta identificação, utilização, armazenamento, controle do prazo de validade e descarte. Base legal: RDC nº 512/2021, art. 37.' },
      ]
    },
    {
      id: 'saa-reservacao',
      titulo: '5. RESERVAÇÃO',
      itens: [
        { id: '49', crit: 'I', text: 'Realizar a limpeza e a manutenção dos reservatórios no mínimo a cada seis meses. Base legal: Lei Estadual nº 13.331/2001; Decreto Estadual nº 5.711/2002, art. 188, VII.' },
        { id: '50', crit: 'N', text: 'Apresentar Instrução Normativa para Trabalho em Altura, com procedimentos de segurança e equipamentos disponíveis. Base legal: NR-35 (Ministério do Trabalho).' },
        { id: '51', crit: 'I', text: 'Manter os reservatórios protegidos e vedados. Base legal: Lei Estadual nº 13.331/2001; Decreto Estadual nº 5.711/2002, art. 183, IV, e art. 188, I.' },
        { id: '52', crit: 'I', text: 'Manter, nos reservatórios, dispositivo de segurança que restrinja o acesso de pessoas não autorizadas e de animais. Base legal: Lei Estadual nº 13.331/2001; Decreto Estadual nº 5.711/2002, art. 188, II.' },
      ]
    },
    {
      id: 'saa-condicoes-gerais',
      titulo: '6. CONDIÇÕES GERAIS DO ABASTECIMENTO',
      itens: [
        { id: '53', crit: 'N', text: 'Registrar e justificar a ocorrência de intermitência no abastecimento (desabastecimento superior a 6 horas) ou falta de água em horário de pico (11h–13h e/ou 17h–19h). Base legal: Portaria GM/MS nº 888/2021, art. 25.' },
      ]
    },
  ]
}

// Transcrito do "Guia de Inspeção Clínica Médica com ou sem Procedimento
// Cirúrgico Ambulatorial" (Fundação Municipal de Saúde de Ponta Grossa/PR).
// O documento só traz colunas Sim/Não/N.A. — a redação já imperativa
// (Providenciar/Apresentar/Disponibilizar) e o grau de criticidade (I/N/R)
// seguem o mesmo padrão adotado em clinicaEsteticaPrudentopolisChecklist,
// que compartilha praticamente a mesma base legal (RDC nº 63/2011 e Decreto
// Estadual nº 5.711/2002), por ser do mesmo gênero de guia.
const clinicasDeSaudeChecklist: ChecklistData = {
  titulo: 'Guia de Inspeção para Clínicas de Saúde',
  subtitulo: 'Clínica médica com ou sem procedimento cirúrgico ambulatorial',
  categoria: 'SAÚDE',
  lei: 'RDC nº 63/2011 (ANVISA) e Decreto Estadual nº 5.711/2002',
  especialidade: 'CLÍNICA MÉDICA / CIRÚRGICA AMBULATORIAL',
  secoes: [
    {
      id: 'gs-doc',
      titulo: '1. DOCUMENTOS',
      itens: [
        { id: '1', crit: 'I', text: 'Providenciar o Projeto Arquitetônico adequado à legislação sanitária, devidamente aprovado pela Vigilância Sanitária (VISA). Base legal: Art. 23, I e Art. 34 – RDC nº 63/2011 (Anvisa); Art. 456 – Decreto Estadual nº 5.711/2002.' },
        { id: '2', crit: 'I', text: 'Apresentar o PGR, o PCMSO, os ASOs dos funcionários e o comprovante de vacinação (hepatite B e tétano). Base legal: Art. 116 e 147 – Decreto Estadual nº 5.711/2002; Item 32.2.4.17 – NR 32; Art. 23, II e Art. 44 – RDC nº 63/2011.' },
        { id: '3', crit: 'N', text: 'Manter programa de manutenção preventiva e corretiva dos equipamentos médico-hospitalares, com registro atualizado. Base legal: Art. 426, Parágrafo único – Decreto Estadual nº 5.711/2002; Art. 23, IX – RDC nº 63/2011.' },
        { id: '4', crit: 'I', text: 'Apresentar a Certidão de Inclusão de Responsabilidade Técnica e o Certificado de inscrição no conselho de classe do(s) responsável(is) técnico(s). Base legal: Art. 2º, I – Decreto Federal nº 77.052/1976; Art. 14 e Art. 29, Parágrafo único – RDC nº 63/2011; Art. 414 e 422 – Decreto Estadual nº 5.711/2002.' },
        { id: '5', crit: 'N', text: 'Providenciar o certificado de controle integrado de pragas atualizado, emitido por empresa legalmente habilitada. Base legal: Art. 320 – Decreto Estadual nº 5.711/2002; Art. 23, VIII e Art. 63, Parágrafo único – RDC nº 63/2011.' },
        { id: '6', crit: 'I', text: 'Providenciar a limpeza e desinfecção do reservatório de água, com certificado ou registro emitido por empresa legalmente habilitada. Base legal: Art. 188, VII – Decreto Estadual nº 5.711/2002; Art. 39, §1º – RDC nº 63/2011.' },
        { id: '7', crit: 'N', text: 'Apresentar o PMOC (Plano de Manutenção, Operação e Controle) do sistema de climatização, se acima de 60.000 BTU/H, ou o registro de manutenção e limpeza do equipamento, se abaixo desse valor. Base legal: Lei Federal nº 13.589/2018; Art. 5º e Art. 6º, alínea "a" – Portaria nº 3.523/1998.' },
        { id: '8', crit: 'I', text: 'Apresentar o certificado e/ou contrato de coleta, transporte e destinação dos resíduos de serviços de saúde. Base legal: Art. 6º, XI – RDC nº 222/2018; Art. 23, V – RDC nº 63/2011.' },
        { id: '9', crit: 'N', text: 'Elaborar e manter atualizadas as normas, procedimentos e rotinas técnicas escritas (POPs) de todos os processos de trabalho. Base legal: Art. 23, XVIII e Art. 51 – RDC nº 63/2011.' },
        { id: '10', crit: 'N', text: 'Estabelecer procedimento para registro e notificação de eventos adversos, queixas técnicas associadas a produtos e serviços e doenças de notificação compulsória. Base legal: Art. 23, XIV e XVI – RDC nº 63/2011.' },
        { id: '11', crit: 'R', text: 'Apresentar o contrato de prestação de serviços das atividades terceirizadas. Base legal: Art. 11 e Art. 23, V – RDC nº 63/2011.' },
        { id: '12', crit: 'N', text: 'Comprovar a capacitação dos profissionais antes do início das atividades e de forma permanente, com registro de data, horário, carga horária, conteúdo ministrado, e nome e formação do instrutor e dos trabalhadores envolvidos. Base legal: Art. 32, Parágrafo único – RDC nº 63/2011.' },
      ]
    },
    {
      id: 'gs-trab',
      titulo: '2. CONDIÇÕES DE TRABALHO',
      itens: [
        { id: '13', crit: 'R', text: 'Disponibilizar aos trabalhadores água potável e fresca, por meio de bebedouro de jato inclinado ou dispositivo equivalente. Base legal: Art. 136 – Decreto Estadual nº 5.711/2002.' },
        { id: '14', crit: 'R', text: 'Caso sejam realizadas refeições nas dependências, destinar local específico, com iluminação e ventilação suficientes. Base legal: Art. 137 – Decreto Estadual nº 5.711/2002.' },
        { id: '15', crit: 'R', text: 'Disponibilizar vestiário com armários individuais, separados por sexo. Base legal: Art. 139 – Decreto Estadual nº 5.711/2002.' },
        { id: '16', crit: 'I', text: 'Comprovar a entrega de EPI adequado ao risco, em perfeito estado de conservação e funcionamento, e compatível com as atividades desenvolvidas pelos trabalhadores. Base legal: Art. 122 – Decreto Estadual nº 5.711/2002; Art. 47 – RDC nº 63/2011; Item 6.3 e 6.6.1 – NR-06.' },
        { id: '17', crit: 'N', text: 'Instalar guarda-corpo em escadas e rampas. Base legal: Art. 115, II e Art. 133, II – Decreto Estadual nº 5.711/2002; NR 8; Art. 173 – CLT.' },
      ]
    },
    {
      id: 'gs-infra',
      titulo: '3. INFRAESTRUTURA',
      itens: [
        { id: '18', crit: 'N', text: 'Manter a estrutura física conforme o projeto aprovado pela VISA. Base legal: Art. 294 – Decreto Estadual nº 5.711/2002.' },
        { id: '19', crit: 'N', text: 'Adequar a infraestrutura — recursos humanos, equipamentos e materiais — à demanda e à modalidade de assistência prestada. Base legal: Art. 17 – RDC nº 63/2011.' },
        { id: '20', crit: 'N', text: 'Garantir que piso, paredes, teto e mobiliários tenham superfícies íntegras, lisas, laváveis e impermeáveis. Base legal: Art. 36 e 42 – RDC nº 63/2011; RDC nº 50/2002.' },
        { id: '21', crit: 'N', text: 'Garantir iluminação e ventilação compatíveis com as atividades desenvolvidas nos ambientes. Base legal: Art. 38 – RDC nº 63/2011.' },
        { id: '22', crit: 'N', text: 'Utilizar colchonetes, colchões e demais estofados revestidos de material lavável e impermeável, sem furos, rasgos, sulcos ou reentrâncias. Base legal: Art. 56 – RDC nº 63/2011.' },
        { id: '23', crit: 'R', text: 'Manter portas com abertura fácil e corredores/passagens internas livres. Base legal: Art. 132 – Decreto Estadual nº 5.711/2002.' },
        { id: '24', crit: 'N', text: 'Disponibilizar instalações sanitárias independentes para ambos os sexos, com acesso independente e paredes/pisos impermeáveis e laváveis. Base legal: Art. 286 – Decreto Estadual nº 5.711/2002.' },
        { id: '25', crit: 'I', text: 'Disponibilizar lavatório e/ou pia exclusiva para a higienização das mãos dos profissionais nas áreas onde o paciente é examinado, manipulado ou medicado. Base legal: Decreto Federal nº 77.052/1976, Art. 2º, II e IV; Item B.4 – RDC nº 50/2002; NR 32, Item 32.2.4.3.' },
        { id: '26', crit: 'N', text: 'Abastecer os lavatórios/pias com dispensadores de sabonete líquido, papel-toalha e lixeira com tampa acionada sem uso das mãos. Base legal: Decreto Federal nº 77.052/1976, Art. 2º, II e IV; Art. 326 e 327 – Decreto Estadual nº 5.711/2002; Item B.4 – RDC nº 50/2002; NR 32, Item 32.2.4.3.' },
        { id: '27', crit: 'I', text: 'Disponibilizar dispensadores abastecidos com solução alcoólica a 70% para profissionais, pacientes e acompanhantes. Base legal: Art. 59 – RDC nº 63/2011; RDC nº 42/2010.' },
        { id: '28', crit: 'N', text: 'Garantir iluminação e ventilação adequadas nas construções, por aberturas naturais ou sistemas artificiais — banheiros e cozinhas precisam de ventilação com tomada de ar externa. Base legal: Art. 282 – Decreto Estadual nº 5.711/2002.' },
        { id: '29', crit: 'N', text: 'Disponibilizar sanitário anexo à sala de atendimento nos serviços de Gineco-Obstetrícia, Proctologia e Urologia. Base legal: RDC nº 50/2002 (Tabela Unidade Funcional 1 — Atendimento Ambulatorial).' },
        { id: '30', crit: 'I', text: 'Guardar e preencher o prontuário conforme as normas vigentes de confidencialidade, integridade, local seguro, boas condições de conservação e legibilidade, com carimbo e assinatura. Base legal: Art. 24 a 28 – RDC nº 63/2011.' },
      ]
    },
    {
      id: 'gs-apoio',
      titulo: '4. AMBIENTES DE APOIO',
      itens: [
        { id: '31', crit: 'R', text: 'Manter sala de espera com registro de pacientes/agendamento. Base legal: RDC nº 50/2002.' },
        { id: '32', crit: 'N', text: 'Disponibilizar sanitário para pacientes. Base legal: RDC nº 50/2002.' },
        { id: '33', crit: 'N', text: 'Disponibilizar DML (Depósito de Material de Limpeza) com tanque. Base legal: RDC nº 50/2002.' },
        { id: '34', crit: 'N', text: 'Disponibilizar sala de utilidades/expurgo com pia para lavagem. Base legal: RDC nº 50/2002.' },
        { id: '35', crit: 'R', text: 'Disponibilizar depósito de materiais e equipamentos/almoxarifado. Base legal: RDC nº 50/2002.' },
      ]
    },
    {
      id: 'gs-esteril',
      titulo: '5. ESTERILIZAÇÃO',
      itens: [
        { id: '36', crit: 'I', text: 'Organizar o fluxo de processamento de materiais — recepção, limpeza, inspeção, preparo, esterilização, armazenamento e distribuição — com estrutura física adequada. Base legal: RDC nº 50/2002; RDC nº 15/2012.' },
        { id: '37', crit: 'N', text: 'Utilizar materiais de limpeza e saneantes registrados na Anvisa e adequados à finalidade; na limpeza manual, usar acessórios não abrasivos que não liberem partículas. Base legal: Art. 66 e 89 – RDC nº 15/2012.' },
        { id: '38', crit: 'I', text: 'Identificar as embalagens com rótulos ou etiquetas contendo nome do produto, número do lote, data de esterilização, data limite de uso, método de esterilização e nome do responsável pelo processo. Base legal: Art. 83, 84 e 85 – RDC nº 15/2012.' },
        { id: '39', crit: 'N', text: 'Garantir que as embalagens utilizadas estejam regularizadas junto à Anvisa. Base legal: Art. 78 – RDC nº 15/2012.' },
        { id: '40', crit: 'N', text: 'Armazenar os produtos esterilizados em local livre de poeira e sujidade, sem incidência solar, com manipulação mínima. Base legal: Art. 101 – RDC nº 15/2012.' },
        { id: '41', crit: 'I', text: 'Realizar e manter registro de monitoramento do processo de esterilização, com testes químicos, físicos e biológicos. Base legal: Art. 96, 97, 98 e § único, Art. 99 e 100 – RDC nº 15/2012.' },
      ]
    },
    {
      id: 'gs-residuos',
      titulo: '6. RESÍDUOS',
      itens: [
        { id: '42', crit: 'I', text: 'Implantar o PGRSS (Plano de Gerenciamento de Resíduos de Serviços de Saúde). Base legal: Capítulo II, Art. 5º e § 3º – RDC nº 222/2018; Art. 226, II – Decreto Estadual nº 5.711/2002.' },
        { id: '43', crit: 'N', text: 'Utilizar recipientes/lixeiras resistentes à punctura, ruptura e vazamento, com tampa e sistema de abertura sem contato com as mãos, resistentes a tombamento. Base legal: Capítulo I, Seção III, Art. 3º, III – RDC nº 222/2018.' },
        { id: '44', crit: 'N', text: 'Identificar os recipientes/lixeiras de acordo com o grupo de resíduo a que pertencem. Base legal: Capítulo III, Seção I, Art. 22, §1º, §2º e §3º – RDC nº 222/2018.' },
      ]
    },
    {
      id: 'gs-residuo-infectante',
      titulo: '7. RESÍDUO INFECTANTE',
      itens: [
        { id: '45', crit: 'N', text: 'Acondicionar em saco branco leitoso os resíduos do Grupo A que não precisam ser obrigatoriamente tratados e os que já passaram por tratamento. Base legal: Capítulo III, Seção I, Art. 15 – RDC nº 222/2018.' },
        { id: '46', crit: 'I', text: 'Acondicionar em saco vermelho os resíduos que precisam de tratamento antes do destino final. Base legal: Capítulo IV, Seção V, Art. 55 e Parágrafo único – RDC nº 222/2018.' },
        { id: '47', crit: 'I', text: 'Descartar perfurocortantes em recipientes específicos, com suporte para fixação, em altura que permita visualização, em local protegido de umidade e respingos. Base legal: Capítulo IV, Seção IX, Art. 86, 87, 88 e 89 – RDC nº 222/2018; RDC nº 306/2004.' },
      ]
    },
    {
      id: 'gs-residuo-quimico',
      titulo: '8. RESÍDUO QUÍMICO',
      itens: [
        { id: '48', crit: 'N', text: 'Acondicionar resíduos líquidos em recipientes compatíveis com o material armazenado, com tampa rosqueada e vedante. Base legal: Capítulo III, Seção I, Art. 18 – RDC nº 222/2018.' },
        { id: '49', crit: 'N', text: 'Acondicionar resíduos sólidos em recipientes de material rígido e resistente, compatíveis com as características do produto químico. Base legal: Capítulo III, Seção I, Art. 19 – RDC nº 222/2018.' },
      ]
    },
    {
      id: 'gs-armazenamento-residuos',
      titulo: '9. ARMAZENAMENTO DE RESÍDUOS',
      itens: [
        { id: '50', crit: 'N', text: 'Realizar o armazenamento temporário dos resíduos na sala de utilidades/expurgo. Base legal: Capítulo III, Seção II e III – RDC nº 222/2018.' },
        { id: '51', crit: 'N', text: 'Disponibilizar abrigo externo de resíduos com acesso facilitado à coleta, lavável e com dimensão compatível com o volume gerado. Base legal: Capítulo III, Seção II e III – RDC nº 222/2018.' },
        { id: '52', crit: 'R', text: 'Manter área específica para limpeza e desinfecção dos recipientes coletores (carrinhos) utilizados no manejo de resíduos. Base legal: Capítulo III, Seção II e III – RDC nº 222/2018.' },
      ]
    },
    {
      id: 'gs-controle-especial',
      titulo: '10. AMOSTRAS GRÁTIS E MEDICAMENTOS PSICOTRÓPICOS, ENTORPECENTES OU OUTROS SUJEITOS A CONTROLE ESPECIAL',
      itens: [
        { id: '53', crit: 'N', text: 'Verificar se comercializa ou utiliza medicamentos previstos no Anexo I da Portaria SVS/MS nº 344/1998; em caso positivo, atender às exigências específicas para esses medicamentos. Base legal: Portaria SVS/MS nº 344/1998.' },
        { id: '54', crit: 'N', text: 'Manter os livros de escrituração protocolados junto à Vigilância Sanitária (CVS/FMS). Base legal: Art. 63 – Portaria SVS/MS nº 344/1998.' },
        { id: '55', crit: 'I', text: 'Manter o local de armazenamento dos medicamentos do Anexo I com chave e permanentemente fechado. Base legal: Art. 67 – Portaria SVS/MS nº 344/1998.' },
        { id: '56', crit: 'N', text: 'Realizar o BSPO (Balanço de Substâncias Psicoativas e Outras de Controle Especial) trimestralmente. Base legal: Art. 68 – Portaria SVS/MS nº 344/1998; Art. 1º – Resolução Estadual SESA/PR nº 225/1999.' },
        { id: '57', crit: 'N', text: 'Apresentar o Certificado de Regularidade para Substâncias e Medicamentos Psicotrópicos, carimbado. Base legal: Art. 3º, Parágrafo 2º – Resolução Estadual SESA/PR nº 225/1999.' },
        { id: '58', crit: 'R', text: 'Designar os profissionais prescritores como responsáveis pela adequada conservação das amostras grátis, com verificação das condições de conservação, integridade, armazenamento, validade e distribuição. Base legal: Art. 8º, § 2º – RDC/Anvisa nº 60/2009.' },
      ]
    },
  ]
}

// Transcrito do "Guia de Inspeção em Supermercados" (Fundação Municipal de
// Saúde de Ponta Grossa/PR), baseado na RDC ANVISA nº 216/2004. É um roteiro
// próprio para supermercados (área externa, câmaras frigoríficas, área de
// exposição para venda etc.) — não o mesmo documento do roteiro genérico de
// Serviços de Alimentação (alimentacaoChecklist, RDC 275/2002 e 216/2004).
// O original só traz colunas Sim/Não/N.A.; a redação imperativa e o grau de
// criticidade (I/N/R) seguem o mesmo padrão dos demais roteiros.
const supermercadoChecklist: ChecklistData = {
  titulo: 'Guia de Inspeção para Supermercado',
  subtitulo: 'RDC ANVISA nº 216/2004',
  categoria: 'SAÚDE',
  lei: 'RDC ANVISA nº 216/2004',
  especialidade: 'SUPERMERCADO',
  secoes: [
    {
      id: 'sup-area-externa',
      titulo: '1. ÁREA EXTERNA',
      itens: [
        { id: '1', crit: 'N', text: 'Manter a área externa livre de focos de insalubridade, lixo, objetos em desuso, pragas e animais. Base legal: Item 4.1.7 – RDC nº 216/2004 (Anvisa).' },
      ]
    },
    {
      id: 'sup-agua',
      titulo: '2. ÁGUA',
      itens: [
        { id: '2', crit: 'I', text: 'Usar água de abastecimento público. Base legal: Art. 45 – Lei Federal nº 11.445/2007; Item 4.4.1 – RDC nº 216/2004.' },
        { id: '3', crit: 'I', text: 'Apresentar, quando utilizada solução alternativa de abastecimento, o registro da potabilidade da água, atestada semestralmente por laudo laboratorial. Base legal: Item 4.4.1 – RDC nº 216/2004.' },
        { id: '4', crit: 'I', text: 'Fabricar o gelo destinado a alimentos a partir de água potável. Base legal: Item 4.4.2 – RDC nº 216/2004.' },
        { id: '5', crit: 'N', text: 'Manter o reservatório de água com superfície lisa, sem rachaduras e com tampa íntegra. Base legal: Item 4.4.4 – RDC nº 216/2004.' },
      ]
    },
    {
      id: 'sup-residuos',
      titulo: '3. RESÍDUOS',
      itens: [
        { id: '6', crit: 'N', text: 'Usar recipientes de coleta de resíduos de fácil higienização e transporte, identificados, tampados e limpos. Base legal: Item 4.5.1 – RDC nº 216/2004.' },
        { id: '7', crit: 'N', text: 'Manter os recipientes de coleta de resíduos em número e capacidade adequados ao volume gerado. Base legal: Item 4.5.2 – RDC nº 216/2004.' },
        { id: '8', crit: 'N', text: 'Usar, nas áreas de preparação e armazenamento, lixeiras com tampa acionada sem contato manual. Base legal: Item 4.5.2 – RDC nº 216/2004.' },
      ]
    },
    {
      id: 'sup-pragas',
      titulo: '4. CONTROLE INTEGRADO DE PRAGAS E VETORES',
      itens: [
        { id: '9', crit: 'I', text: 'Instalar telas milimétricas nas aberturas das áreas de armazenamento e manipulação, inclusive no sistema de exaustão. Base legal: Item 4.1.4 – RDC nº 216/2004.' },
        { id: '10', crit: 'N', text: 'Instalar ralos e grelhas sifonados, dotados de dispositivo que permita seu fechamento. Base legal: Item 4.1.5 – RDC nº 216/2004.' },
        { id: '11', crit: 'N', text: 'Manter as portas ajustadas aos batentes e com fechamento automático. Base legal: Item 4.1.4 – RDC nº 216/2004.' },
        { id: '12', crit: 'I', text: 'Manter o estabelecimento livre de vetores e pragas urbanas e de indícios de sua presença. Base legal: Item 4.3.1 – RDC nº 216/2004.' },
        { id: '13', crit: 'N', text: 'Contratar empresa especializada e licenciada para o controle químico de pragas. Base legal: Item 4.3.2 – RDC nº 216/2004.' },
      ]
    },
    {
      id: 'sup-sanit-func',
      titulo: '5. SANITÁRIOS E VESTIÁRIOS DOS FUNCIONÁRIOS',
      itens: [
        { id: '14', crit: 'I', text: 'Manter as instalações sanitárias sem comunicação direta com as áreas de produção, manipulação ou armazenamento de alimentos. Base legal: Item 4.1.12 – RDC nº 216/2004.' },
        { id: '15', crit: 'N', text: 'Manter piso, paredes e teto de material liso, resistente e impermeável, em bom estado de conservação e higiene. Base legal: Item 4.1.3 – RDC nº 216/2004.' },
        { id: '16', crit: 'I', text: 'Disponibilizar pia com sabonete líquido antisséptico (ou sabonete líquido inodoro e produto antisséptico) e toalha de papel não reciclado, ou outro método de secagem que não recontamine as mãos. Base legal: Item 4.1.13 – RDC nº 216/2004.' },
        { id: '17', crit: 'N', text: 'Disponibilizar armários individuais para a guarda de pertences dos funcionários. Base legal: Art. 139 – Decreto Estadual nº 5.711/2002.' },
        { id: '18', crit: 'N', text: 'Disponibilizar lixeiras com tampa acionada sem contato manual. Base legal: Item 4.1.13 – RDC nº 216/2004.' },
      ]
    },
    {
      id: 'sup-sanit-publico',
      titulo: '6. SANITÁRIOS DESTINADOS AO PÚBLICO',
      itens: [
        { id: '19', crit: 'N', text: 'Manter piso, paredes e teto de material liso, resistente e impermeável, em bom estado de conservação e higiene. Base legal: Item 4.1.3 – RDC nº 216/2004.' },
        { id: '20', crit: 'N', text: 'Disponibilizar pia, sabão líquido e toalha de papel ou outro método de secagem das mãos. Base legal: Item 4.1.13 – RDC nº 216/2004.' },
        { id: '21', crit: 'N', text: 'Disponibilizar lixeiras com tampa acionada sem contato manual. Base legal: Item 4.1.13 – RDC nº 216/2004.' },
      ]
    },
    {
      id: 'sup-instalacoes',
      titulo: '7. INSTALAÇÕES E EDIFICAÇÃO (Depósito, Padaria, Área de Fracionamento de Vegetais, Área de Manipulação de Queijos, Lanchonete/Quiosques)',
      itens: [
        { id: '22', crit: 'N', text: 'Manter piso, paredes e teto de material liso, resistente e impermeável, em bom estado de conservação e higiene. Base legal: Item 4.1.3 – RDC nº 216/2004.' },
        { id: '23', crit: 'N', text: 'Manter iluminação suficiente, com luminárias protegidas contra queda e explosão, em adequado estado de conservação e higiene. Base legal: Item 4.1.8 – RDC nº 216/2004.' },
        { id: '24', crit: 'I', text: 'Manter as instalações elétricas embutidas ou protegidas em tubulações externas e íntegras. Base legal: Item 4.1.9 – RDC nº 216/2004.' },
        { id: '25', crit: 'I', text: 'Manter o ambiente livre de fungos, gases, fumaça, pó, partículas em suspensão e condensação de vapores, sem incidência direta do fluxo de ar sobre os alimentos. Base legal: Item 4.1.10 – RDC nº 216/2004.' },
        { id: '26', crit: 'N', text: 'Realizar manutenção programada e periódica dos equipamentos e utensílios, e calibração dos instrumentos de medição, com registro dessas operações. Base legal: Item 4.1.16 – RDC nº 216/2004.' },
      ]
    },
    {
      id: 'sup-recebimento',
      titulo: '8. RECEBIMENTO DE PRODUTOS',
      itens: [
        { id: '27', crit: 'N', text: 'Receber as matérias-primas, ingredientes e embalagens em área protegida e limpa. Base legal: Item 4.7.2 – RDC nº 216/2004.' },
        { id: '28', crit: 'I', text: 'Dispor de termômetro calibrado para o recebimento de produtos. Base legal: Item 4.7.3 – RDC nº 216/2004.' },
      ]
    },
    {
      id: 'sup-deposito',
      titulo: '9. DEPÓSITO DE PRODUTOS',
      itens: [
        { id: '29', crit: 'N', text: 'Manter o depósito organizado, limpo e arejado, com espaço para ventilação e limpeza. Base legal: Art. 369 – Decreto Estadual nº 5.711/2002.' },
        { id: '30', crit: 'I', text: 'Armazenar saneantes, cosméticos e outros produtos separadamente dos alimentos e das embalagens. Base legal: Art. 369, XVIII – Decreto Estadual nº 5.711/2002.' },
        { id: '31', crit: 'N', text: 'Manter íntegras as embalagens primárias dos produtos. Base legal: Item 4.7.3 – RDC nº 216/2004.' },
        { id: '32', crit: 'N', text: 'Armazenar separadamente, em local apropriado e identificado, os produtos destinados à devolução ou ao descarte. Base legal: Item 4.7.4 – RDC nº 216/2004.' },
      ]
    },
    {
      id: 'sup-refrigeracao',
      titulo: '10. REFRIGERADOR/FREEZER/BALCÃO FRIGORÍFICO/CÂMARAS FRIGORÍFICAS (Hortifruti, Laticínios, Frios, Panificados, Aves, Carnes, Sorvetes)',
      itens: [
        { id: '33', crit: 'N', text: 'Manter iluminação suficiente, com luminárias protegidas contra queda acidental e explosão, em adequado estado de conservação e higiene. Base legal: Item 4.1.8 – RDC nº 216/2004.' },
        { id: '34', crit: 'N', text: 'Usar paletes, estrados e prateleiras de material liso, resistente, impermeável e lavável. Base legal: Item 4.7.6 – RDC nº 216/2004.' },
        { id: '35', crit: 'I', text: 'Disponibilizar pia exclusiva para a higienização das mãos na área de manipulação, em posição estratégica em relação ao fluxo. Base legal: Item 4.1.14 – RDC nº 216/2004.' },
        { id: '36', crit: 'I', text: 'Abastecer os lavatórios com sabonete líquido inodoro antisséptico (ou sabonete líquido inodoro e produto antisséptico), toalha de papel não reciclado ou outro sistema seguro de secagem das mãos, e coletor de papel acionado sem contato manual. Base legal: Item 4.1.14 – RDC nº 216/2004.' },
        { id: '37', crit: 'R', text: 'Afixar cartazes orientando a higienização das mãos. Base legal: Item 4.6.4 – RDC nº 216/2004.' },
        { id: '38', crit: 'I', text: 'Manter os manipuladores com asseio pessoal e uniformes compatíveis com a atividade, conservados e limpos. Base legal: Item 4.6.3 – RDC nº 216/2004.' },
        { id: '39', crit: 'N', text: 'Manter lisas, impermeáveis e laváveis as superfícies dos equipamentos, móveis e utensílios usados na distribuição e exposição dos alimentos. Base legal: Item 4.1.17 – RDC nº 216/2004.' },
      ]
    },
    {
      id: 'sup-exposicao',
      titulo: '11. ÁREA DE EXPOSIÇÃO PARA A VENDA',
      itens: [
        { id: '40', crit: 'N', text: 'Manter lisas, impermeáveis e laváveis as superfícies dos equipamentos, móveis e utensílios. Base legal: Item 4.1.17 – RDC nº 216/2004.' },
        { id: '41', crit: 'I', text: 'Apresentar, nos produtos embalados na ausência do consumidor, a lista de ingredientes, o conteúdo líquido, a identificação da origem, o nome/razão social e o endereço do importador (quando importado), a identificação do lote, o prazo de validade e as instruções de preparo e uso, quando necessário. Base legal: Item 5 – RDC nº 259/2002 (Anvisa).' },
      ]
    },
    {
      id: 'sup-funcionarios',
      titulo: '12. FUNCIONÁRIOS/MANIPULADORES',
      itens: [
        { id: '42', crit: 'I', text: 'Manter os manipuladores com asseio pessoal e uniformes compatíveis com a atividade, conservados e limpos. Base legal: Item 4.6.3 – RDC nº 216/2004.' },
        { id: '43', crit: 'I', text: 'Usar os EPIs adequados à função (uniforme, avental, botas, luvas, capas etc.). Base legal: NR-6 (Portaria MTb nº 3.214/1978).' },
        { id: '44', crit: 'I', text: 'Usar vestimentas adequadas para o trabalho em câmaras frias. Base legal: NR-6 (Portaria MTb nº 3.214/1978).' },
      ]
    },
    {
      id: 'sup-documentacao',
      titulo: '13. DOCUMENTAÇÃO E REGISTRO',
      itens: [
        { id: '45', crit: 'N', text: 'Manter o Manual de Boas Práticas e os Procedimentos Operacionais Padronizados acessíveis aos funcionários e disponíveis à autoridade sanitária, quando solicitados. Base legal: Item 4.11.1 – RDC nº 216/2004.' },
        { id: '46', crit: 'N', text: 'Apresentar e cumprir os Procedimentos Operacionais Padronizados (POP) de higienização de instalações, equipamentos e móveis; controle integrado de vetores e pragas urbanas; higienização do reservatório; e higiene e saúde dos manipuladores. Base legal: Item 4.11.4 – RDC nº 216/2004.' },
        { id: '47', crit: 'N', text: 'Comprovar que o responsável pelas atividades de manipulação de alimentos concluiu curso de capacitação sobre contaminantes alimentares, doenças transmitidas por alimentos, manipulação higiênica dos alimentos e Boas Práticas. Base legal: Item 4.12.2 – RDC nº 216/2004.' },
        { id: '48', crit: 'N', text: 'Capacitar periodicamente os manipuladores de alimentos em higiene pessoal, manipulação higiênica dos alimentos e doenças transmitidas por alimentos, com a capacitação comprovada por documentação. Base legal: Item 4.6.7 – RDC nº 216/2004.' },
        { id: '49', crit: 'R', text: 'Apresentar a especificação dos critérios de avaliação e seleção dos fornecedores de matérias-primas, ingredientes e embalagens. Base legal: Item 4.7.1 – RDC nº 216/2004.' },
        { id: '50', crit: 'I', text: 'Apresentar o PPRA, o PCMSO e os ASOs atualizados. Base legal: Art. 116 e 147 – Decreto Estadual nº 5.711/2002.' },
        { id: '51', crit: 'I', text: 'Apresentar o comprovante de higienização do reservatório de água, realizada semestralmente (por POP próprio ou empresa especializada). Base legal: Item 4.4.4 – RDC nº 216/2004.' },
        { id: '52', crit: 'N', text: 'Apresentar o comprovante de execução do serviço de controle de pragas. Base legal: Item 4.3.2 – RDC nº 216/2004.' },
      ]
    },
  ]
}

// Transcrito da Resolução SESA nº 590/2014 (Norma Técnica de Estabelecimentos
// Farmacêuticos do Paraná — Anexo I). Diferente das demais resoluções
// transcritas neste arquivo, este instrumento não traz um Anexo com roteiro
// de inspeção pronto em tabela — é só o texto normativo, organizado em 15
// capítulos. Os itens abaixo foram extraídos das obrigações concretas e
// verificáveis em campo (documentos, estrutura física, dispensação,
// armazenamento, serviços farmacêuticos etc.), na mesma redação imperativa e
// com a base legal (artigo) ao final de cada um; capítulos só definicionais,
// de trâmite de responsabilidade técnica (Cap. VI) ou de encerramento de
// estabelecimento (Cap. VII) não geram item de inspeção de rotina. É um
// instrumento próprio e complementar ao roteiro "farmacia" (Lei 5.991/1973 e
// RDC 44/2009) já existente — não o substitui.
const farmaciaResolucaoSesa5902014Checklist: ChecklistData = {
  titulo: 'Norma Técnica de Farmácias e Drogarias — Resolução SESA nº 590/2014',
  subtitulo: 'Resolução SESA nº 590/2014',
  categoria: 'SAÚDE',
  lei: 'Resolução SESA nº 590/2014',
  especialidade: 'FARMÁCIA E DROGARIA',
  secoes: [
    {
      id: 'fs590-estrutura',
      titulo: '1. ESTRUTURA FÍSICA',
      itens: [
        { id: '1', crit: 'I', text: 'Manter edifício de alvenaria, com ventilação e iluminação que atendam às normas técnicas da ABNT e às Normas Regulamentadoras do Ministério do Trabalho em todas as salas. Base legal: Art. 4º, I – Res. SESA 590/2014.' },
        { id: '2', crit: 'N', text: 'Manter piso, paredes, teto e mobiliários de material liso, resistente, impermeável e de fácil limpeza e desinfecção. Base legal: Art. 4º, II – Res. SESA 590/2014.' },
        { id: '3', crit: 'I', text: 'Manter acesso independente às instalações, sem comunicação com residências ou outro local distinto do estabelecimento farmacêutico, com acessibilidade para pessoas com deficiência. Base legal: Art. 4º, III – Res. SESA 590/2014.' },
        { id: '4', crit: 'N', text: 'Disponibilizar, para o mostruário e a dispensação de produtos e medicamentos industrializados, área física mínima de 30 m². Base legal: Art. 4º, IV – Res. SESA 590/2014.' },
        { id: '5', crit: 'N', text: 'Disponibilizar sanitários, Depósito de Material de Limpeza (DML) com tanque e água corrente, sala/área para guarda de pertences pessoais e sala/área administrativa. Base legal: Art. 4º, V – Res. SESA 590/2014.' },
        { id: '6', crit: 'I', text: 'Disponibilizar, na farmácia com manipulação, laboratório de manipulação de medicamentos com área mínima de 10 m² por atividade (mínimo de 3 m² para salas de hormônios, antibióticos e citostáticos, e 1,5 m² para a antecâmara, quando houver). Base legal: Art. 5º – Res. SESA 590/2014.' },
        { id: '7', crit: 'I', text: 'Não utilizar qualquer dependência da farmácia ou drogaria para consultório médico, odontológico ou outro fim diverso do licenciamento. Base legal: Art. 8º – Res. SESA 590/2014.' },
      ]
    },
    {
      id: 'fs590-assistencia-documentos',
      titulo: '2. ASSISTÊNCIA FARMACÊUTICA E DOCUMENTOS',
      itens: [
        { id: '8', crit: 'I', text: 'Garantir a presença de farmacêutico durante todo o horário de funcionamento do estabelecimento, inclusive plantões. Base legal: Art. 9º e 10 – Res. SESA 590/2014.' },
        { id: '9', crit: 'N', text: 'Descrever as atribuições e responsabilidades individuais no Manual de Boas Práticas Farmacêuticas, de forma compreensível e disponível a todos os funcionários. Base legal: Art. 11 – Res. SESA 590/2014.' },
        { id: '10', crit: 'N', text: 'Manter organograma que demonstre a estrutura organizacional e o pessoal suficiente do estabelecimento. Base legal: Art. 17 – Res. SESA 590/2014.' },
        { id: '11', crit: 'I', text: 'Apresentar a Licença Sanitária atualizada, expedida pela Autoridade Sanitária competente. Base legal: Art. 24, I – Res. SESA 590/2014.' },
        { id: '12', crit: 'I', text: 'Apresentar a Certidão de Regularidade atualizada, expedida pelo Conselho Regional de Farmácia. Base legal: Art. 24, II – Res. SESA 590/2014.' },
        { id: '13', crit: 'I', text: 'Apresentar a Autorização de Funcionamento de Empresa (AFE) atualizada, expedida pela ANVISA. Base legal: Art. 24, III – Res. SESA 590/2014.' },
        { id: '14', crit: 'I', text: 'Apresentar a Autorização Especial de Funcionamento (AE), expedida pela ANVISA, quando o estabelecimento manipular substâncias sujeitas a controle especial. Base legal: Art. 24, IV – Res. SESA 590/2014.' },
        { id: '15', crit: 'N', text: 'Apresentar o Manual de Boas Práticas em Farmácia ou Drogaria e/ou de Manipulação de Medicamentos, de fácil acesso aos técnicos. Base legal: Art. 24, V – Res. SESA 590/2014.' },
        { id: '16', crit: 'N', text: 'Manter procedimentos escritos para todas as atividades desenvolvidas, inclusive limpeza e sanitização de ambientes, mobiliários e equipamentos. Base legal: Art. 24, VI – Res. SESA 590/2014.' },
        { id: '17', crit: 'R', text: 'Afixar em local visível ao público lista com números atualizados de telefone do CRF, dos órgãos de Vigilância Sanitária Estadual e Municipal e de defesa do consumidor. Base legal: Art. 24, VII – Res. SESA 590/2014.' },
        { id: '18', crit: 'I', text: 'Afixar em local visível ao público a Licença Sanitária e a Certidão de Regularidade do CRF-PR. Base legal: Art. 24, VIII – Res. SESA 590/2014.' },
        { id: '19', crit: 'N', text: 'Afixar, dentro da sala de prestação de serviços farmacêuticos, em local visível ao público, o nome e a identidade dos responsáveis pela aplicação de injetáveis. Base legal: Art. 24, IX – Res. SESA 590/2014.' },
        { id: '20', crit: 'N', text: 'Afixar em local visível ao público placa com nome, foto, número e inscrição no CRF-PR do responsável técnico farmacêutico, dos farmacêuticos substitutos e assistentes, e o respectivo horário de trabalho. Base legal: Art. 24, X – Res. SESA 590/2014.' },
      ]
    },
    {
      id: 'fs590-saude-higiene',
      titulo: '3. SAÚDE, HIGIENE E VESTUÁRIO',
      itens: [
        { id: '21', crit: 'I', text: 'Realizar exames médicos admissionais e avaliações médicas periódicas de todos os funcionários, atendendo ao PCMSO. Base legal: Art. 19, §1º – Res. SESA 590/2014.' },
        { id: '22', crit: 'N', text: 'Não permitir comer, beber, manter plantas, alimentos, bebidas, produtos fumígenos, medicamentos e objetos pessoais fora das salas específicas ou previamente definidas para esse fim. Base legal: Art. 19, §3º – Res. SESA 590/2014.' },
        { id: '23', crit: 'I', text: 'Fornecer gratuitamente os EPIs aos trabalhadores, em quantidade suficiente e com reposição periódica, com orientação de uso, manutenção, conservação e descarte. Base legal: Art. 19, §5º – Res. SESA 590/2014.' },
        { id: '24', crit: 'I', text: 'Manter os funcionários envolvidos na prestação de serviços farmacêuticos adequadamente paramentados, com troca do EPI sempre que necessário. Base legal: Art. 19, §6º – Res. SESA 590/2014.' },
        { id: '25', crit: 'N', text: 'Definir por escrito o que é uniforme e o que é EPI no estabelecimento. Base legal: Art. 19, §7º – Res. SESA 590/2014.' },
        { id: '26', crit: 'I', text: 'Realizar a paramentação e a higiene das mãos e antebraços antes do início da prestação de serviços. Base legal: Art. 19, §8º – Res. SESA 590/2014.' },
        { id: '27', crit: 'N', text: 'Disponibilizar, na farmácia com manipulação, sala de vestiário para a guarda dos pertences dos funcionários e a colocação de uniformes. Base legal: Art. 19, §9º – Res. SESA 590/2014.' },
      ]
    },
    {
      id: 'fs590-condicoes-gerais',
      titulo: '4. CONDIÇÕES GERAIS DE FUNCIONAMENTO',
      itens: [
        { id: '28', crit: 'N', text: 'Manter as áreas internas e externas em boas condições físicas e estruturais, sem risco ao usuário e aos funcionários. Base legal: Art. 25, I – Res. SESA 590/2014.' },
        { id: '29', crit: 'N', text: 'Manter as superfícies internas (piso, paredes, teto) lisas, impermeáveis, resistentes a agentes sanitizantes e facilmente laváveis. Base legal: Art. 25, II – Res. SESA 590/2014.' },
        { id: '30', crit: 'N', text: 'Manter os ambientes em boas condições de higiene e limpeza, protegidos contra a entrada de insetos, roedores ou outros animais. Base legal: Art. 25, III – Res. SESA 590/2014.' },
        { id: '31', crit: 'N', text: 'Garantir ventilação e iluminação compatíveis com as atividades desenvolvidas em cada ambiente, conforme normas da ABNT e do Ministério do Trabalho. Base legal: Art. 25, IV – Res. SESA 590/2014.' },
        { id: '32', crit: 'I', text: 'Disponibilizar sanitários com vaso sanitário e/ou mictório, pia com água corrente, toalhas de uso individual descartável, sabonete líquido e lixeira sem tampa ou com acionamento por pedal, sem comunicação direta com salas de serviços farmacêuticos, de manipulação ou de circulação restrita. Base legal: Art. 25, V – Res. SESA 590/2014.' },
        { id: '33', crit: 'N', text: 'Manter os mobiliários revestidos interna e externamente de material liso e impermeável, resistente a agentes sanitizantes e facilmente lavável. Base legal: Art. 25, VI – Res. SESA 590/2014.' },
        { id: '34', crit: 'N', text: 'Identificar todos os funcionários que realizam atendimento ao público, com nome e função. Base legal: Art. 25, VII – Res. SESA 590/2014.' },
        { id: '35', crit: 'I', text: 'Fornecer, para os serviços farmacêuticos, EPI de acordo com a atividade desenvolvida, em quantidade suficiente e com reposição periódica. Base legal: Art. 25, VIII – Res. SESA 590/2014.' },
        { id: '36', crit: 'I', text: 'Manter água potável tratada, com limpeza dos reservatórios e cisternas no mínimo a cada seis meses, comprovada por meio de registros. Base legal: Art. 25, IX – Res. SESA 590/2014.' },
        { id: '37', crit: 'N', text: 'Usar, no processamento de limpeza e desinfecção de artigos e superfícies, produtos devidamente regularizados pela ANVISA para a finalidade a que se destinam. Base legal: Art. 25, X – Res. SESA 590/2014.' },
        { id: '38', crit: 'I', text: 'Não realizar coleta de material biológico nas dependências do estabelecimento, salvo em farmácia que manipule medicamentos homeopáticos autorizados, com sala exclusiva para esse fim. Base legal: Art. 25, XI – Res. SESA 590/2014.' },
        { id: '39', crit: 'N', text: 'Instituir e manter Controle e/ou Manejo Integrado de Vetores e Pragas Urbanas, com os registros da execução mantidos no estabelecimento. Base legal: Art. 25, XII – Res. SESA 590/2014.' },
      ]
    },
    {
      id: 'fs590-condicoes-tecnicas',
      titulo: '5. CONDIÇÕES TÉCNICAS E HIGIÊNICAS ESPECÍFICAS',
      itens: [
        { id: '40', crit: 'N', text: 'Armazenar os materiais de limpeza e germicidas em área ou local identificado e especificamente designado para esse fim. Base legal: Art. 26 – Res. SESA 590/2014.' },
        { id: '41', crit: 'N', text: 'Definir local específico para a guarda dos pertences dos funcionários. Base legal: Art. 27 – Res. SESA 590/2014.' },
        { id: '42', crit: 'N', text: 'Manter as salas de descanso e copa ou refeitório, quando existentes, separadas fisicamente dos demais ambientes, com o consumo de alimentos restrito a esses locais. Base legal: Art. 28 – Res. SESA 590/2014.' },
        { id: '43', crit: 'I', text: 'Manter a caixa d\'água protegida contra a entrada de animais, sujidades ou outros contaminantes, com a limpeza realizada conforme procedimento escrito e registro que comprove sua execução. Base legal: Art. 29 – Res. SESA 590/2014.' },
      ]
    },
    {
      id: 'fs590-aquisicao-armazenamento-dispensacao',
      titulo: '6. AQUISIÇÃO, ARMAZENAMENTO E DISPENSAÇÃO',
      itens: [
        { id: '44', crit: 'I', text: 'Verificar, na aquisição, se o fornecedor possui Licença Sanitária atualizada, expedida pela Autoridade Sanitária local. Base legal: Art. 30, I – Res. SESA 590/2014.' },
        { id: '45', crit: 'N', text: 'Verificar as notas fiscais de aquisição de medicamentos, com o número de lote, quando aplicável. Base legal: Art. 30, II – Res. SESA 590/2014.' },
        { id: '46', crit: 'I', text: 'Verificar, no recebimento, o registro/notificação, o número de lote, a data de validade e a rotulagem dos produtos, mantendo íntegros embalagens, rótulos e bulas. Base legal: Art. 30, III e IV – Res. SESA 590/2014.' },
        { id: '47', crit: 'N', text: 'Manter espaços reservados, prateleiras e/ou estrados em número adequado ao volume de estoque, de material liso, lavável e impermeável. Base legal: Art. 31, I – Res. SESA 590/2014.' },
        { id: '48', crit: 'N', text: 'Manter boas condições sanitárias de conservação, limpeza e higiene no armazenamento dos medicamentos e produtos. Base legal: Art. 31, II – Res. SESA 590/2014.' },
        { id: '49', crit: 'I', text: 'Armazenar os medicamentos e produtos ao abrigo da luz solar direta, em temperatura e umidade conforme especificação do fabricante, sobre prateleiras ou estrados, sem contato direto com as paredes. Base legal: Art. 31, IV – Res. SESA 590/2014.' },
        { id: '50', crit: 'I', text: 'Não colocar etiquetas sobre os prazos de validade e o número de lote, nem dispensar ao público produtos e medicamentos com prazo de validade expirado. Base legal: Art. 31, V – Res. SESA 590/2014.' },
        { id: '51', crit: 'I', text: 'Retirar da área de venda e segregar, em local próprio e identificado, os produtos violados, vencidos, ou com suspeita de falsificação, corrupção ou adulteração. Base legal: Art. 31, VI e VII – Res. SESA 590/2014.' },
        { id: '52', crit: 'N', text: 'Determinar procedimento para os produtos com prazo de validade próximo ao vencimento, inclusive insumos utilizados na manipulação. Base legal: Art. 31, XI – Res. SESA 590/2014.' },
        { id: '53', crit: 'I', text: 'Justificar em Procedimento Operacional Padrão (POP) o armazenamento de produtos corrosivos, inflamáveis ou explosivos, guardados longe de fontes de calor e de materiais que provoquem faíscas. Base legal: Art. 31, XII – Res. SESA 590/2014.' },
        { id: '54', crit: 'I', text: 'Manter os medicamentos em área de circulação restrita aos funcionários, sem exposição direta ao alcance dos usuários do estabelecimento. Base legal: Art. 31, XIV – Res. SESA 590/2014.' },
        { id: '55', crit: 'I', text: 'Não dispensar medicamentos ao público pelo sistema de autoatendimento. Base legal: Art. 32 – Res. SESA 590/2014.' },
        { id: '56', crit: 'I', text: 'Não dispensar ao público medicamentos tarjados e/ou sujeitos a controle especial sem a devida prescrição de profissional habilitado. Base legal: Art. 33, I – Res. SESA 590/2014.' },
        { id: '57', crit: 'I', text: 'Não distribuir sem valor pecuniário nem vender medicamentos amostra grátis, de distribuição gratuita, com a inscrição "PROIBIDA A VENDA NO COMÉRCIO", em embalagem hospitalar (ou fracionados desta) e de uso exclusivo hospitalar. Base legal: Art. 33, II – Res. SESA 590/2014.' },
        { id: '58', crit: 'N', text: 'Manter, nos medicamentos comercializados fora da embalagem secundária (embalagens múltiplas ou fracionáveis), as informações obrigatórias de rotulagem na embalagem primária. Base legal: Art. 33, III – Res. SESA 590/2014.' },
        { id: '59', crit: 'N', text: 'Manter à disposição dos usuários, em local de fácil visualização, lista atualizada dos medicamentos genéricos comercializados no país. Base legal: Art. 34, VI – Res. SESA 590/2014.' },
        { id: '60', crit: 'I', text: 'Não aviar receitas ilegíveis, em código, siglas e/ou números, ou que possam induzir a erro ou troca na dispensação. Base legal: Art. 34, I e II – Res. SESA 590/2014.' },
        { id: '61', crit: 'N', text: 'Verificar se a receita contém o nome do paciente, a denominação do medicamento, o modo de usar, e a identificação, o registro e a assinatura do prescritor, com local e data de emissão. Base legal: Art. 34, III – Res. SESA 590/2014.' },
        { id: '62', crit: 'N', text: 'Identificar com carimbo do farmacêutico, número do CRF-PR, data e assinatura a substituição do medicamento prescrito pelo genérico correspondente. Base legal: Art. 34, IV, "b" – Res. SESA 590/2014.' },
        { id: '63', crit: 'I', text: 'Seguir as normas da Portaria nº 344/1998 na dispensação e guarda de medicamentos sujeitos a controle especial, realizando inspeção visual da identificação, do prazo de validade e da integridade da embalagem no momento da dispensação. Base legal: Art. 36 – Res. SESA 590/2014.' },
        { id: '64', crit: 'N', text: 'Realizar o fracionamento de medicamentos conforme a Resolução RDC nº 80/2006. Base legal: Art. 38 – Res. SESA 590/2014.' },
      ]
    },
    {
      id: 'fs590-termolabeis-mcea',
      titulo: '7. MEDICAMENTOS TERMOLÁBEIS E MCEA',
      itens: [
        { id: '65', crit: 'I', text: 'Usar geladeira apropriada para a guarda dos MCEA, com temperatura entre 2º e 8ºC, sendo vedado o uso de geladeira tipo "duplex", "frost-free" ou frigobar. Base legal: Art. 40, I – Res. SESA 590/2014.' },
        { id: '66', crit: 'I', text: 'Manter os medicamentos termolábeis fora da exposição ao sol ou a temperaturas elevadas, mesmo que liofilizados. Base legal: Art. 40, III – Res. SESA 590/2014.' },
        { id: '67', crit: 'N', text: 'Observar o sistema PVPS (primeiro a vencer, primeiro a sair) no armazenamento do estoque de medicamentos termolábeis e MCEA. Base legal: Art. 40, IV – Res. SESA 590/2014.' },
        { id: '68', crit: 'I', text: 'Não guardar alimentos, bebidas e outros materiais na geladeira destinada a medicamentos. Base legal: Art. 42, I – Res. SESA 590/2014.' },
        { id: '69', crit: 'I', text: 'Realizar e registrar a leitura da temperatura da geladeira no mínimo duas vezes ao dia, por meio de termômetro digital de máxima e mínima. Base legal: Art. 42, II – Res. SESA 590/2014.' },
        { id: '70', crit: 'N', text: 'Manter afixado na porta da geladeira aviso de que esta não deve ser aberta fora do horário de retirada e/ou guarda dos medicamentos. Base legal: Art. 42, III – Res. SESA 590/2014.' },
        { id: '71', crit: 'N', text: 'Usar tomada exclusiva para cada geladeira, instalada a 1,20 m de altura do piso. Base legal: Art. 42, IV – Res. SESA 590/2014.' },
        { id: '72', crit: 'N', text: 'Instalar a geladeira em local arejado, distante de fonte de calor, sem incidência de luz solar direta, nivelada e afastada 20 cm da parede. Base legal: Art. 42, V – Res. SESA 590/2014.' },
        { id: '73', crit: 'I', text: 'Armazenar os diferentes tipos de insulina de modo a evitar troca entre si, assegurando a conservação em temperatura de 2º a 8ºC, sem congelamento. Base legal: Art. 43 – Res. SESA 590/2014.' },
        { id: '74', crit: 'I', text: 'Transferir os MCEA para outra geladeira ou caixa térmica com controle de temperatura antes de realizar a limpeza rotineira da geladeira de guarda. Base legal: Art. 44 – Res. SESA 590/2014.' },
        { id: '75', crit: 'I', text: 'Verificar, no recebimento de medicamentos termolábeis e MCEA, se a temperatura chegou adequada e se há registro de temperatura de saída e chegada do transporte. Base legal: Art. 45 – Res. SESA 590/2014.' },
        { id: '76', crit: 'N', text: 'Orientar o paciente, preferencialmente por escrito, quanto à forma de conservação dos medicamentos termolábeis e/ou MCEA dispensados. Base legal: Art. 46, I – Res. SESA 590/2014.' },
        { id: '77', crit: 'I', text: 'Dispor de sistema de geração de energia de emergência para a comercialização de vacinas. Base legal: Art. 47 – Res. SESA 590/2014.' },
      ]
    },
    {
      id: 'fs590-ervas-chas',
      titulo: '8. ERVAS/PLANTAS MEDICINAIS — CHÁS MEDICINAIS',
      itens: [
        { id: '78', crit: 'N', text: 'Comercializar somente ervas/plantas medicinais (chás medicinais) notificadas junto à ANVISA, conforme a RDC nº 26/2014. Base legal: Art. 48 – Res. SESA 590/2014.' },
        { id: '79', crit: 'N', text: 'Realizar análise de controle de qualidade, própria ou terceirizada, das ervas/plantas medicinais a granel comercializadas. Base legal: Art. 49 – Res. SESA 590/2014.' },
        { id: '80', crit: 'N', text: 'Comercializar ervas/plantas medicinais a granel somente em sala específica, com equipamentos que permitam a pesagem e o armazenamento corretos. Base legal: Art. 49, §2º – Res. SESA 590/2014.' },
        { id: '81', crit: 'I', text: 'Não veicular, na embalagem das ervas/plantas medicinais, indicação terapêutica nem expressões como "inócuo", "não tóxico", "inofensivo" ou "produto natural". Base legal: Art. 49, §5º e §6º – Res. SESA 590/2014.' },
        { id: '82', crit: 'N', text: 'Identificar no rótulo das ervas/plantas medicinais a granel embaladas a razão social, o CNPJ, o endereço, o nome da planta, a classificação farmacopêica e o responsável técnico com o número do CRF. Base legal: Art. 49, §7º – Res. SESA 590/2014.' },
      ]
    },
    {
      id: 'fs590-servicos-farmaceuticos',
      titulo: '9. SERVIÇOS FARMACÊUTICOS',
      itens: [
        { id: '83', crit: 'I', text: 'Realizar a prestação de serviços farmacêuticos (atenção farmacêutica, perfuração de lóbulo auricular) em sala exclusiva, com área mínima de 3 m², cadeira ou poltrona, lavatório para as mãos, toalhas descartáveis e sabão líquido. Base legal: Art. 60, I – Res. SESA 590/2014.' },
        { id: '84', crit: 'N', text: 'Executar em salas separadas, ou com barreira técnica quando em sala única, as atividades de administração de medicamentos, inalação e perfuração do lóbulo auricular. Base legal: Art. 60, II e IV – Res. SESA 590/2014.' },
        { id: '85', crit: 'I', text: 'Disponibilizar maca na sala de prestação de serviços farmacêuticos quando houver aplicação de medicamentos injetáveis por via endovenosa. Base legal: Art. 60, III – Res. SESA 590/2014.' },
        { id: '86', crit: 'I', text: 'Disponibilizar, na sala de serviços farmacêuticos, lixeira sem tampa ou com acionamento por pedal, coletor rígido para perfurocortantes e uso exclusivo de materiais perfurocortantes conforme a NR-32. Base legal: Art. 61, III a V – Res. SESA 590/2014.' },
        { id: '87', crit: 'R', text: 'Afixar, em local de fácil visualização, lista com telefones e endereços de serviços de atendimento médico de emergência. Base legal: Art. 61, VI – Res. SESA 590/2014.' },
        { id: '88', crit: 'N', text: 'Manter procedimentos e registros do monitoramento realizado para garantir a qualidade dos antissépticos/produtos fracionados. Base legal: Art. 61, XII – Res. SESA 590/2014.' },
        { id: '89', crit: 'N', text: 'Elaborar protocolos para as atividades de atenção farmacêutica, com registro sistemático e consentimento expresso do usuário. Base legal: Art. 67 – Res. SESA 590/2014.' },
        { id: '90', crit: 'I', text: 'Verificar a data de validade do medicamento antes de sua administração. Base legal: Art. 78, §4º – Res. SESA 590/2014.' },
        { id: '91', crit: 'I', text: 'Não armazenar ou guardar na farmácia medicamentos de terceiros ou já dispensados. Base legal: Art. 79 – Res. SESA 590/2014.' },
        { id: '92', crit: 'I', text: 'Usar, para cada inalação, conjunto de máscara e cachimbo vaporizador desinfetado, com desinfecção rigorosa após cada uso e troca da solução desinfetante a cada 12 horas. Base legal: Art. 81, I e III-IV – Res. SESA 590/2014.' },
        { id: '93', crit: 'N', text: 'Individualizar as soluções utilizadas para inalação a cada procedimento, sendo vedada a guarda de sobras para inalações consecutivas. Base legal: Art. 81, V – Res. SESA 590/2014.' },
        { id: '94', crit: 'I', text: 'Realizar a aplicação de medicamento por via endovenosa em maca, com o paciente deitado, observando técnica adequada. Base legal: Art. 83, I e II – Res. SESA 590/2014.' },
        { id: '95', crit: 'I', text: 'Realizar a perfuração do lóbulo auricular com aparelho específico que utilize o brinco como material perfurante, sendo vedado o uso de agulhas de injeção, de sutura ou outros objetos. Base legal: Art. 84 – Res. SESA 590/2014.' },
        { id: '96', crit: 'I', text: 'Manter os brincos e a pistola de perfuração regularizados junto à ANVISA, com a embalagem do brinco aberta somente no ambiente de perfuração, sob observação do usuário. Base legal: Art. 85 – Res. SESA 590/2014.' },
        { id: '97', crit: 'I', text: 'Realizar a antissepsia das mãos do profissional antes da execução de qualquer serviço farmacêutico, independentemente do uso de EPI. Base legal: Art. 91 – Res. SESA 590/2014.' },
        { id: '98', crit: 'N', text: 'Entregar ao usuário a Declaração de Serviço Farmacêutico após a prestação do serviço, com nome, endereço, telefone, CNPJ e os dados do serviço prestado. Base legal: Art. 87 e 88 – Res. SESA 590/2014.' },
      ]
    },
    {
      id: 'fs590-equipamentos',
      titulo: '10. EQUIPAMENTOS, INSTRUMENTOS E CALIBRAÇÃO',
      itens: [
        { id: '99', crit: 'I', text: 'Calibrar os instrumentos de medição no mínimo uma vez ao ano, por laboratório acreditado pela CGCRE/INMETRO, com registro das calibrações realizadas. Base legal: Art. 92 – Res. SESA 590/2014.' },
        { id: '100', crit: 'N', text: 'Realizar a verificação metrológica dos equipamentos não passíveis de calibração (ex.: esfigmomanômetros) pelo INMETRO ou órgão delegado. Base legal: Art. 93 – Res. SESA 590/2014.' },
        { id: '101', crit: 'N', text: 'Realizar a verificação/checagem diária dos equipamentos por pessoal do estabelecimento treinado e autorizado, com registro. Base legal: Art. 94 – Res. SESA 590/2014.' },
        { id: '102', crit: 'N', text: 'Manter Programa de Manutenção Periódica e Corretiva dos equipamentos, instrumentos e aparelhos, com os respectivos registros. Base legal: Art. 95 – Res. SESA 590/2014.' },
      ]
    },
    {
      id: 'fs590-procedimentos-documentacao',
      titulo: '11. PROCEDIMENTOS E DOCUMENTAÇÃO',
      itens: [
        { id: '103', crit: 'R', text: 'Regular o horário de funcionamento conforme a legislação municipal, participando do sistema de rodízio de plantão do município. Base legal: Art. 96 – Res. SESA 590/2014.' },
        { id: '104', crit: 'N', text: 'Manter Manual de Boas Práticas Farmacêuticas e/ou de Manipulação em Farmácias, de acordo com as atividades realizadas. Base legal: Art. 97 – Res. SESA 590/2014.' },
        { id: '105', crit: 'N', text: 'Manter Procedimentos Operacionais Padrão (POP) sobre higienização, aquisição/armazenamento/dispensação de produtos, destino de produtos vencidos, serviços farmacêuticos prestados e uso de materiais descartáveis. Base legal: Art. 98 – Res. SESA 590/2014.' },
        { id: '106', crit: 'N', text: 'Manter os POPs aprovados, assinados individualmente e datados pelo profissional farmacêutico, com revisão periódica prevista. Base legal: Art. 99 – Res. SESA 590/2014.' },
        { id: '107', crit: 'N', text: 'Manter registros de treinamento de pessoal, serviço farmacêutico prestado, divulgação dos POPs, execução do controle de pragas e manutenção/calibração de equipamentos. Base legal: Art. 100 – Res. SESA 590/2014.' },
        { id: '108', crit: 'N', text: 'Manter toda a documentação exigida por esta Resolução no estabelecimento por no mínimo 5 anos, à disposição do órgão de Vigilância Sanitária competente. Base legal: Art. 101 – Res. SESA 590/2014.' },
      ]
    },
  ]
}

/**
 * Converte os indicadores do ROI da ANVISA no mesmo ChecklistData dos demais
 * roteiros — assim relatório, PDF, fotos, observações e polimento por IA
 * continuam funcionando sem tratamento especial. O que muda é só a forma de
 * responder (nota 0–5 em vez de SIM/NÃO/ND), carregada no campo `roi`.
 *
 * `text` recebe a redação da nota 3 (o cumprimento da norma) somada à base
 * legal, porque é esse o texto que vira exigência no relatório quando o
 * indicador fica abaixo do corte — mesmo formato dos itens dos outros
 * roteiros, que já trazem "Base legal: ..." embutido.
 *
 * Criticidade: 'C' (crítico) vira 'I' (imprescindível) e 'NC' vira 'N'
 * (necessário), que são os grupos que o relatório já sabe separar.
 */
function checklistDoRoi(
  titulo: string,
  subtitulo: string,
  lei: string,
  especialidade: string,
  indicadores: RoiIndicador[]
): ChecklistData {
  return {
    titulo,
    subtitulo,
    categoria: 'Saúde',
    lei,
    especialidade,
    roi: true,
    secoes: [
      {
        id: 'roi',
        titulo: 'Indicadores do Roteiro Objetivo de Inspeção',
        itens: indicadores.map((ind) => ({
          id: `roi-${ind.numero}`,
          text: `${ind.alternativas[NOTA_CONFORME]} Base legal: ${ind.baseLegal}.`,
          crit: (ind.criticidade === 'C' ? 'I' : 'N') as Criticality,
          roi: {
            numero: ind.numero,
            indicador: ind.indicador,
            baseLegal: ind.baseLegal,
            alternativas: ind.alternativas,
          },
        })),
      },
    ],
  };
}

const CHECKLISTS: Record<string, ChecklistData> = {
  odontologia: odontologiaChecklist,
  'odontologia-prudentopolis': odontologiaPrudentopolisChecklist,
  alimentacao: alimentacaoChecklist,
  farmacia: farmaciaChecklist,
  'clinica-estetica-prudentopolis': clinicaEsteticaPrudentopolisChecklist,
  'guia-clinica-estetica': clinicaEsteticaPrudentopolisChecklist,
  'guia-clinicas-de-saude': clinicasDeSaudeChecklist,
  'guia-supermercado': supermercadoChecklist,
  'resolucao-sesa-126-07': tatuagemPiercingChecklist,
  'roteiro-saa-subterraneo': saaSubterraneoChecklist,
  'salao-beleza-barbearia-depilacao': salaoBelezaChecklist,
  'farmacia-resolucao-sesa-590-2014': farmaciaResolucaoSesa5902014Checklist,
  'roi-radiografia-medica': checklistDoRoi(
    'Roteiro Objetivo de Inspeção — Radiografia Médica',
    'ANVISA — documento 9.1, versão 1.2',
    'RDC nº 611/2022 e RDC nº 63/2011',
    'RADIOGRAFIA MÉDICA',
    ROI_RADIOGRAFIA_MEDICA
  ),
  'roi-mamografia': checklistDoRoi(
    'Roteiro Objetivo de Inspeção — Mamografia',
    'ANVISA — documento anexado ao acervo',
    'Roteiro objetivo de inspeção',
    'MAMOGRAFIA',
    ROI_RADIOGRAFIA_MEDICA
  ),
  'roi-radiologia-intervencionista': checklistDoRoi(
    'Roteiro Objetivo de Inspeção — Radiologia Intervencionista',
    'ANVISA — documento anexado ao acervo',
    'Roteiro objetivo de inspeção',
    'RADIOLOGIA INTERVENCIONISTA',
    ROI_RADIOGRAFIA_MEDICA
  ),
  'roi-endoscopia': checklistDoRoi(
    'Roteiro Objetivo de Inspeção — Endoscopia',
    'ANVISA — documento anexado ao acervo',
    'Roteiro objetivo de inspeção',
    'ENDOSCOPIA',
    ROI_RADIOGRAFIA_MEDICA
  ),
  'roi-urgencia-e-emergencia': checklistDoRoi(
    'Roteiro Objetivo de Inspeção — Urgência e Emergência',
    'ANVISA — documento anexado ao acervo',
    'Roteiro objetivo de inspeção',
    'URGÊNCIA E EMERGÊNCIA',
    ROI_RADIOGRAFIA_MEDICA
  ),
};

export default function DynamicChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Resolve a Promise para obter o id (usado como roteiroId no rascunho salvo)
  const checklist = CHECKLISTS[id] || odontologiaChecklist;
  // ROI da ANVISA: sem "Considerações Gerais"/"Conclusão e Prazo Legal" — nem
  // no formulário, nem no relatório, nem gerados em memória.
  const isRoi = !!checklist.roi;
  const { toast } = useToast()
  const { profile, updateProfileData } = useAuth()
  const isRoot = profile?.role === 'root'

  // A conta root pertence ao município fictício "geral", que não tem
  // identidade visual configurada — por isso o relatório dela saía com o
  // brasão genérico e o cabeçalho padrão do código. Como nas demais telas
  // (Biblioteca, Configurações, lista de Roteiros), o root escolhe de qual
  // município usar a identidade; a escolha fica lembrada pra não ter que
  // repetir a cada roteiro aberto. Os outros papéis seguem pelo próprio
  // município, sem seletor.
  const MUNICIPIO_ROOT_KEY = 'fiscal_x_roteiro_municipio_root';
  const [municipioPickerOpen, setMunicipioPickerOpen] = useState(false);
  const [municipioSearchTerm, setMunicipioSearchTerm] = useState("");
  const [selectedMunicipioForRoot, setSelectedMunicipioForRoot] = useState("");

  useEffect(() => {
    if (!isRoot) return;
    setSelectedMunicipioForRoot(localStorage.getItem(MUNICIPIO_ROOT_KEY) || "");
  }, [isRoot]);

  const escolherMunicipioRoot = (municipio: string) => {
    setSelectedMunicipioForRoot(municipio);
    localStorage.setItem(MUNICIPIO_ROOT_KEY, municipio);
    setMunicipioPickerOpen(false);
    setMunicipioSearchTerm("");
  };

  // Prioriza, no seletor do root, os municípios que já têm cadastro ativo —
  // mesmo tratamento do seletor em roteiros/page.tsx (ver
  // src/hooks/use-municipios-ativos.ts).
  const municipiosAtivos = useMunicipiosAtivos();
  const { ativos: municipiosAtivosLista, inativos: municipiosInativosLista } = useMemo(() => {
    const ativos: string[] = [];
    const inativos: string[] = [];
    municipiosPR.forEach((m) => (municipiosAtivos.has(normalizeId(m)) ? ativos : inativos).push(m));
    return { ativos, inativos };
  }, [municipiosAtivos]);

  const filteredMunicipiosPicker = useMemo(() => {
    const termo = normalizeId(municipioSearchTerm);
    const aplicarFiltro = (lista: string[]) => termo ? lista.filter((m) => normalizeId(m).includes(termo)) : lista;
    return { ativos: aplicarFiltro(municipiosAtivosLista), inativos: aplicarFiltro(municipiosInativosLista) };
  }, [municipioSearchTerm, municipiosAtivosLista, municipiosInativosLista]);

  const { config } = useAppConfig({
    municipioIdOverride: isRoot
      ? (selectedMunicipioForRoot ? normalizeId(selectedMunicipioForRoot) : undefined)
      : profile?.municipioId,
  })
  const router = useRouter()
  const { saveInspecao, deleteInspecao, inspecoes, loading: loadingInspecoes } = useInspecoes()
  const reportRef = useRef<HTMLDivElement>(null)
  const reportWrapperRef = useRef<HTMLDivElement>(null)
  // Encolhe só a APARÊNCIA da folha A4 pra caber na tela do celular — nunca a
  // largura real (offsetWidth), que é a base de todo o cálculo de paginação
  // do PDF em generate-roteiro-pdf.tsx. `transform: scale` não altera
  // offsetWidth/offsetHeight, então o PDF gerado continua idêntico
  // independente do quanto a prévia está reduzida na tela.
  const [reportPreviewScale, setReportPreviewScale] = useState(1)
  const [reportPreviewHeight, setReportPreviewHeight] = useState<number | undefined>(undefined)
  const searchParams = useSearchParams()

  // Roteiro exclusivo de Prudentópolis — mesmo que alguém digite a URL direto,
  // fiscais/gestores de outros municípios são levados de volta pra lista.
  useEffect(() => {
    if (id === 'odontologia-prudentopolis' && profile && profile.municipioId !== 'prudentopolis' && profile.role !== 'root') {
      router.replace('/roteiros');
    }
  }, [id, profile, router]);

  // Estado inicial (inspeção nova, em branco) — extraído numa função porque
  // também é usado por resetToBlank() ("Nova Inspeção"/excluir sem ter salvo
  // ainda), não só no useState de montagem.
  const buildInitialIdData = useCallback(() => ({
    fantasia: '',
    cnpj: '',
    endereco: '',
    bairro: '',
    telefone: '',
    email: '',
    cnae: '',
    responsavel: '',
    responsavelCpf: '',
    responsavelTecnico: '',
    responsavelTecnicoRegistro: '',
    signatureResponsavel: '',
    dataHorario: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    prazoDias: id === 'odontologia-prudentopolis' ? '30' : '15',
    // Base legal citada na Conclusão junto do prazo (ex.: "Lei Municipal nº
    // 2.276/2017") — cada município tem a sua, por isso fica editável e não
    // fixa no texto; Prudentópolis e Alimentação já vêm preenchidos por padrão.
    baseLegalPrazo: id === 'odontologia-prudentopolis'
      ? 'Lei Municipal nº 2.276/2017'
      : id === 'alimentacao'
        ? 'Lei Estadual nº 13.331/2001 (Código de Saúde do Estado do Paraná) e RDC nº 216/2004 da Anvisa'
        : id === 'farmacia'
          ? 'Lei Estadual nº 13.331/2001 (Código de Saúde do Estado do Paraná) e RDC nº 44/2009 da Anvisa'
          : id === 'clinica-estetica-prudentopolis'
            ? 'Decreto Estadual nº 5.711/2002 e RDC nº 63/2011 da Anvisa'
            : '',
  }), [id]);

  const [idData, setIdData] = useState(buildInitialIdData)
  // Responsável Técnico e e-mail são opcionais — somem da tela até o fiscal
  // clicar para adicionar, igual ao padrão do "+ Responsável Técnico" na
  // autuação (documento-oficial-body.tsx). Continuam aparecendo sozinhos se a
  // inspeção já tiver esses dados (ex.: ao reabrir um rascunho). Já o
  // responsável que acompanhou a inspeção é praticamente sempre preenchido,
  // então fica sempre visível (sem toggle).
  const [mostrarResponsavelTecnico, setMostrarResponsavelTecnico] = useState(false)
  const [mostrarEmail, setMostrarEmail] = useState(false)

  const [currentInspecaoId, setCurrentInspecaoId] = useState<string | null>(null);
  // Status da inspeção carregada — null enquanto é uma inspeção nova/em
  // branco, ainda sem nenhum save. Controla, na visualização do relatório, se
  // mostra "Finalizar e Baixar PDF" (rascunho) ou só "Baixar PDF Novamente"
  // (já concluída, reaberta pra conferir/rebaixar).
  const [inspecaoStatus, setInspecaoStatus] = useState<'rascunho' | 'concluido' | null>(null);
  // Nos roteiros ROI a resposta é a nota da escala, guardada como string
  // ('0'..'5') no mesmo mapa — evita um segundo estado só pra isso e faz o
  // rascunho/relatório continuarem lendo de um lugar só.
  const [answers, setAnswers] = useState<Record<string, RespostaItem>>({})
  const [observations, setObservations] = useState<Record<string, string>>({})
  const [showObsInput, setShowObsInput] = useState<Record<string, boolean>>({})
  // Ditado por voz da Observação/Relato de Irregularidade — mesmo padrão já
  // usado no Fiscal AI (gerar-rascunho.tsx/assistente-ia-form-dialog.tsx),
  // adaptado pra várias observações (uma por item do checklist) em vez de um
  // campo só: guarda QUAL item está sendo ditado (não um boolean simples),
  // já que só pode haver um microfone ativo por vez.
  const [recordingItemId, setRecordingItemId] = useState<string | null>(null)
  const recordingItemIdRef = useRef<string | null>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'pt-BR';
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
      }
      const targetId = recordingItemIdRef.current;
      if (finalTranscript && targetId) {
        setObservations(prev => ({ ...prev, [targetId]: (prev[targetId] ? prev[targetId] + ' ' : '') + finalTranscript }));
      }
    };
    recognition.onerror = () => { setRecordingItemId(null); recordingItemIdRef.current = null; };
    recognition.onend = () => { setRecordingItemId(null); recordingItemIdRef.current = null; };
    recognitionRef.current = recognition;
    return () => { recognition.stop(); };
  }, []);

  const toggleRecordingObservacao = (itemId: string) => {
    if (!recognitionRef.current) return;
    if (recordingItemIdRef.current === itemId) {
      recognitionRef.current.stop();
      return;
    }
    // Já ditando outro item: para o anterior antes de começar o novo (o
    // navegador só permite um reconhecimento de voz ativo por vez).
    if (recordingItemIdRef.current) recognitionRef.current.stop();
    recordingItemIdRef.current = itemId;
    setRecordingItemId(itemId);
    recognitionRef.current.start();
  };
  const [itemPhotos, setItemPhotos] = useState<Record<string, PhotoEvidence[]>>({})
  const [customItems, setCustomItems] = useState<CustomItem[]>([])
  const [newCustomText, setNewCustomText] = useState("")
  const [newCustomCrit, setNewCustomCrit] = useState<Criticality>('N')
  // Quando preenchido, o formulário acima passa a editar este item em vez
  // de criar um novo — a criticidade escolhida na hora de adicionar não
  // podia mais ser alterada depois, então isso reaproveita o mesmo
  // formulário pra editar um item já existente.
  const [editingCustomItemId, setEditingCustomItemId] = useState<string | null>(null)
  // Controlado (em vez de descontrolado) só pra poder abrir sozinho quando o
  // fiscal clica em editar um item já existente — senão o formulário some
  // dentro do accordion recolhido sem nenhuma pista de onde foi parar.
  const [nnConformidadeAberto, setNnConformidadeAberto] = useState<string | undefined>(undefined)
  // Textos de "Considerações Gerais" (introdução) e "Conclusão e Prazo Legal"
  // do relatório — editáveis pelo fiscal. Até o fiscal editar manualmente
  // (introTravadaRef/conclusaoTravadaRef), ficam sincronizados automaticamente
  // com o padrão do município (ou o fixo do código, na falta de um) e com os
  // dados já preenchidos (nome do estabelecimento, CNPJ, prazo etc.) — a
  // primeira edição manual "trava" o texto, que passa a ser conteúdo livre.
  const [introducaoHtml, setIntroducaoHtml] = useState("")
  const [conclusaoHtml, setConclusaoHtml] = useState("")
  const introTravadaRef = useRef(false)
  const conclusaoTravadaRef = useRef(false)
  const [uploadingItem, setUploadingItem] = useState<string | null>(null)
  const [view, setView] = useState<'checklist' | 'report'>('checklist')
  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false)
  const [fiscais, setFiscais] = useState<Autoridade[]>([])
  const [signingFiscalIndex, setSigningFiscalIndex] = useState<number | null>(null)
  const [signingResponsavel, setSigningResponsavel] = useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [isDeletingDraft, setIsDeletingDraft] = useState(false)
  // Diálogo de saída (clique em "Início"/logo no cabeçalho com uma vistoria em
  // andamento) — ver registro do guard mais abaixo e src/hooks/use-checklist-exit-guard.ts.
  const [showExitDialog, setShowExitDialog] = useState(false)
  const [pendingExitHref, setPendingExitHref] = useState<string | null>(null)
  const [isExitSaving, setIsExitSaving] = useState(false)
  const [isExitDeleting, setIsExitDeleting] = useState(false)
  // Lista completa vinda da consulta de CNPJ (BrasilAPI), salva junto da
  // inspeção — ver cnaesDisponiveis em src/lib/types.ts.
  const [foundCnaes, setFoundCnaes] = useState<string[]>([]);
  // Quais dessas atividades o fiscal marcou como inspecionadas. A fonte é
  // idData.cnae (string separada por ";"), que é o que vai pro relatório.
  const cnaesSelecionados = useMemo(
    () => (idData.cnae || "").split(';').map((s: string) => s.trim()).filter(Boolean),
    [idData.cnae]
  );
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  // Seletor de inspeções deste roteiro (rascunhos em andamento + já
  // finalizadas) — substitui o antigo popup de "um único rascunho recuperável"
  // (que usava .find() e só enxergava a mais recente).
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const jaAutoAbriuPickerRef = useRef(false);
  const isDirtyRef = useRef(false);
  // Sempre aponta para a versão mais recente de handleSaveDraft — sem isso, o
  // heartbeat abaixo (que só recria o intervalo quando answers/idData mudam)
  // podia acabar chamando uma versão antiga da função, salvando uma cópia
  // desatualizada caso só uma foto/observação tivesse mudado nesse meio-tempo.
  const handleSaveDraftRef = useRef<(showToast?: boolean) => Promise<void>>();

  // Menu retrátil por categoria (seção do roteiro) — a inspeção em campo
  // raramente segue a ordem do formulário, então deixar tudo sempre
  // expandido dificultava achar o item certo em roteiros longos (o de
  // odontologia, por exemplo, tem 183 itens). Começa tudo fechado; o fiscal
  // abre a seção que quiser a qualquer momento, e o sistema também guia
  // sozinho: abre a primeira seção pendente ao entrar (ou ao trocar de
  // inspeção) e, sempre que uma seção aberta é concluída, fecha ela e abre a
  // próxima pendente — vale pra cada seção aberta, mesmo com várias abertas
  // ao mesmo tempo, sem travar a navegação manual.
  const [openSections, setOpenSections] = useState<string[]>([]);
  const expandirTodasSecoes = () => setOpenSections(checklist.secoes.map(s => s.id));
  const recolherTodasSecoes = () => setOpenSections([]);
  // [respondidos, total] — só itens com resposta própria contam (isHeader é
  // só um rótulo de agrupamento, sem SIM/NÃO/ND/nota).
  const progressoSecao = (secao: ChecklistSection): [number, number] => {
    const itensRespondiveis = secao.itens.filter(i => !i.isHeader);
    const respondidos = itensRespondiveis.filter(i => answers[i.id] !== undefined).length;
    return [respondidos, itensRespondiveis.length];
  };

  // Guia o preenchimento por seção: quais seções já foram concluídas e
  // avançadas sozinhas (evita reabrir a próxima toda vez que `answers`
  // muda) — zerado sempre que troca de roteiro ou de inspeção.
  const secoesAvancadasRef = useRef<Set<string>>(new Set());

  // Referência ao card de cada seção, só pra rolar a tela até a próxima
  // assim que ela abre sozinha (ver useEffect abaixo) — sem isso, fechar uma
  // seção grande encolhia a página e a posição de rolagem continuava a
  // mesma em pixels, "pulando" pra qualquer trecho que sobrasse naquele
  // ponto (às vezes o fim do roteiro) em vez de mostrar a próxima pergunta.
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevOpenSectionsRef = useRef<string[]>([]);
  useEffect(() => {
    const secIdRecemAberta = openSections.find(secId => !prevOpenSectionsRef.current.includes(secId));
    prevOpenSectionsRef.current = openSections;
    if (!secIdRecemAberta) return;
    // Espera a animação de recolher/abrir do Accordion terminar antes de
    // rolar — calcular a posição durante a animação rola pro lugar errado.
    const timer = setTimeout(() => {
      sectionRefs.current[secIdRecemAberta]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
    return () => clearTimeout(timer);
  }, [openSections]);

  // Abre a primeira seção pendente ao entrar no roteiro ou ao trocar de
  // inspeção (rascunho carregado, ou "Nova inspeção") — não roda a cada
  // resposta, só nessas trocas, pra não brigar com o fechamento manual do
  // fiscal em seguida.
  useEffect(() => {
    secoesAvancadasRef.current = new Set();
    const primeiraPendente = checklist.secoes.find(s => {
      const [respondidos, total] = progressoSecao(s);
      return total > 0 && respondidos < total;
    });
    setOpenSections(primeiraPendente ? [primeiraPendente.id] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, currentInspecaoId]);

  // Sempre que uma seção aberta é concluída, fecha ela e abre sozinho a
  // próxima seção pendente — é o "sistema guiando" de uma seção pra outra.
  // Roda pra CADA seção aberta (não só quando há uma única aberta) — se o
  // fiscal tiver duas ou mais abertas ao mesmo tempo, cada uma que for
  // concluída avança pra próxima por conta própria, sem esperar as outras.
  useEffect(() => {
    const concluidasAgora = openSections.filter(secId => {
      const secao = checklist.secoes.find(s => s.id === secId);
      if (!secao) return false;
      const [respondidos, total] = progressoSecao(secao);
      return total > 0 && respondidos === total && !secoesAvancadasRef.current.has(secId);
    });
    if (concluidasAgora.length === 0) return;
    concluidasAgora.forEach(secId => secoesAvancadasRef.current.add(secId));

    setOpenSections(prev => {
      const next = prev.filter(secId => !concluidasAgora.includes(secId));
      concluidasAgora.forEach(secId => {
        const idxAtual = checklist.secoes.findIndex(s => s.id === secId);
        const proxima = checklist.secoes.slice(idxAtual + 1).find(s => {
          const [r, t] = progressoSecao(s);
          return t > 0 && r < t;
        });
        if (proxima && !next.includes(proxima.id)) next.push(proxima.id);
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  // Auto-save em tempo real (Heartbeat a cada 8 segundos).
  // Antes a condição extra `(Object.keys(answers).length > 0 || idData.fantasia)`
  // lia `answers`/`idData` direto da closure deste efeito — como o efeito só
  // recria o `setInterval` quando `profile`/`view` mudam (praticamente nunca
  // durante o preenchimento), essa checagem ficava presa no valor do
  // primeiro render (form vazio) e nunca mais virava verdadeira. Resultado:
  // o heartbeat nunca chamava handleSaveDraft, e só os cliques em SIM/NÃO/ND
  // (que salvam direto) escapavam da perda de dados ao dar F5 — identificação
  // do estabelecimento, observações e itens personalizados dependiam só
  // deste heartbeat quebrado. isDirtyRef já é mantido corretamente por ref
  // (ver efeito abaixo, que reage a answers/observations/itemPhotos/idData/
  // introducaoHtml/conclusaoHtml), então basta confiar nele.
  useEffect(() => {
    if (view === 'report' || !profile) return;
    const timer = setInterval(() => {
        if (isDirtyRef.current) {
            handleSaveDraftRef.current?.(false);
            setLastAutoSave(new Date());
        }
    }, 8000);
    return () => clearInterval(timer);
  }, [profile, view]);

  // Avisa antes de fechar/recarregar a aba se houver alteração ainda não
  // salva pelo autosave (foto/observação em andamento, etc.).
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current && view !== 'report') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [view]);

  // Registra o guard de saída (ver src/hooks/use-checklist-exit-guard.ts) —
  // enquanto há uma vistoria em andamento (rascunho salvo ou algo já
  // preenchido), clicar em "Início"/logo no cabeçalho não navega direto: abre
  // o diálogo de salvar rascunho ou excluir. Sem nada preenchido, não há o
  // que perguntar — navega normal.
  useEffect(() => {
    setChecklistExitGuard((targetHref) => {
      const temAlgoParaDecidir = view === 'checklist' && (
        !!currentInspecaoId || isDirtyRef.current || Object.keys(answers).length > 0 || !!idData.fantasia
      );
      if (temAlgoParaDecidir) {
        setPendingExitHref(targetHref);
        setShowExitDialog(true);
      } else {
        router.push(targetHref);
      }
    });
    return () => setChecklistExitGuard(null);
  }, [view, currentInspecaoId, answers, idData.fantasia, router]);

  // Todas as inspeções deste fiscal neste roteiro — em vez de só a mais
  // recente (era o que o antigo .find() enxergava), separadas por status e
  // ordenadas pela última atualização. Base do seletor (item 2 do plano).
  const minhasInspecoesDoRoteiro = useMemo(() => {
    if (!profile) return { emAndamento: [] as Inspecao[], finalizadas: [] as Inspecao[] };
    const minhas = inspecoes.filter(i => i.checklistData?.roteiroId === id && i.fiscalId === profile.uid);
    const porAtualizacao = (a: Inspecao, b: Inspecao) =>
      new Date(b.updatedAt || b.data).getTime() - new Date(a.updatedAt || a.data).getTime();
    return {
      emAndamento: minhas.filter(i => i.status === 'rascunho').sort(porAtualizacao),
      finalizadas: minhas.filter(i => i.status === 'concluido').sort(porAtualizacao),
    };
  }, [inspecoes, id, profile]);

  // Carrega uma inspeção específica (rascunho ou já finalizada) no
  // formulário — usada tanto pelo seletor quanto por ?inspecaoId= na URL.
  const carregarInspecao = useCallback((inspecao: Inspecao) => {
    if (!inspecao.checklistData) return;
    const cd = inspecao.checklistData;
    const carregadaIdData = cd.idData || {};
    setAnswers(cd.answers || {});
    setObservations(cd.observations || {});
    setItemPhotos(cd.itemPhotos || {});
    setCustomItems(cd.customItems || []);
    setFoundCnaes(cd.cnaesDisponiveis || []);
    setIdData(carregadaIdData);
    // "Trava" antes de setar — sem isso, os efeitos de sincronização (que
    // rodam a cada mudança de idData) recalculariam por cima do texto
    // carregado assim que setIdData disparasse o próximo render.
    introTravadaRef.current = true;
    conclusaoTravadaRef.current = true;
    if (isRoi) {
      // ROI não tem esses textos — nem os do padrão municipal, nem os do
      // código. Zera pra não ressuscitar texto de uma inspeção antiga salva
      // antes de o roteiro passar a ser ROI.
      setIntroducaoHtml("");
      setConclusaoHtml("");
    } else {
      setIntroducaoHtml(cd.introducaoHtml || fillRoteiroTextoTokens(resolverIntroHtml(id, profile?.roteiroTextos, config.roteiroTextos), carregadaIdData));
      setConclusaoHtml(cd.conclusaoHtml || fillRoteiroTextoTokens(resolverConclusaoHtml(id, profile?.roteiroTextos, config.roteiroTextos), carregadaIdData));
    }
    setCurrentInspecaoId(inspecao.id);
    setInspecaoStatus(inspecao.status === 'concluido' ? 'concluido' : 'rascunho');
    // Concluída reabre direto na visualização do relatório (é o que dá pra
    // fazer com ela agora — rever/baixar o PDF de novo); rascunho volta pro
    // formulário de preenchimento.
    setView(inspecao.status === 'concluido' ? 'report' : 'checklist');
    isDirtyRef.current = false;
    router.replace(`/roteiros/${id}?inspecaoId=${inspecao.id}`, { scroll: false });
    setIsPickerOpen(false);
  }, [config, id, isRoi, profile?.roteiroTextos, router]);

  // Reseta pra uma inspeção nova em branco — nem toca no que já está salvo
  // (diferente do antigo "Novo Zero", que apagava o rascunho anterior; agora
  // várias inspeções do mesmo roteiro coexistem, então "começar nova" nunca
  // deveria apagar outra).
  const resetToBlank = useCallback(() => {
    setAnswers({}); setObservations({}); setItemPhotos({}); setCustomItems([]); setFoundCnaes([]);
    setIdData(buildInitialIdData());
    introTravadaRef.current = false;
    conclusaoTravadaRef.current = false;
    setCurrentInspecaoId(null);
    setInspecaoStatus(null);
    setView('checklist');
    isDirtyRef.current = false;
    router.replace(`/roteiros/${id}`, { scroll: false });
    setIsPickerOpen(false);
  }, [id, router, buildInitialIdData]);

  // Abre uma inspeção específica vinda da URL (?inspecaoId=) — link direto,
  // recarregar a página, ou voltar depois de sair. Só entra em ação uma vez;
  // depois disso é o usuário quem decide trocar (pelo seletor).
  const jaCarregouPorUrlRef = useRef(false);
  useEffect(() => {
    if (jaCarregouPorUrlRef.current || loadingInspecoes) return;
    const inspecaoId = searchParams.get('inspecaoId');
    if (!inspecaoId) return;
    const inspecao = inspecoes.find(i => i.id === inspecaoId);
    if (inspecao) {
      carregarInspecao(inspecao);
      jaCarregouPorUrlRef.current = true;
    }
  }, [searchParams, inspecoes, loadingInspecoes, carregarInspecao]);

  // Abertura automática do seletor ao entrar na página sem ?inspecaoId= — só
  // uma vez, e só se não veio nada pela URL (evita abrir por cima de uma
  // inspeção que acabou de ser carregada) nem já estiver editando uma.
  useEffect(() => {
    if (jaAutoAbriuPickerRef.current || loadingInspecoes || !profile || currentInspecaoId) return;
    if (searchParams.get('inspecaoId')) return;
    if (minhasInspecoesDoRoteiro.emAndamento.length > 0) {
      setIsPickerOpen(true);
    }
    jaAutoAbriuPickerRef.current = true;
  }, [loadingInspecoes, profile, currentInspecaoId, searchParams, minhasInspecoesDoRoteiro]);

  // Marca alterações pendentes para o heartbeat/beforeunload saberem que há
  // algo ainda não confirmado como salvo na nuvem.
  const isFirstDirtyCheckRef = useRef(true);
  useEffect(() => {
    if (isFirstDirtyCheckRef.current) { isFirstDirtyCheckRef.current = false; return; }
    isDirtyRef.current = true;
  }, [answers, observations, itemPhotos, idData, introducaoHtml, conclusaoHtml]);

  // Sincroniza a introdução/conclusão com o padrão do município (ou o fixo do
  // código) e com os dados já preenchidos, até o fiscal editar manualmente —
  // a partir daí, introTravadaRef/conclusaoTravadaRef "trava" o texto (ver
  // handleIntroducaoChange/handleConclusaoChange) e essa sincronização para.
  useEffect(() => {
    if (isRoi || introTravadaRef.current) return;
    const base = resolverIntroHtml(id, profile?.roteiroTextos, config.roteiroTextos);
    setIntroducaoHtml(fillRoteiroTextoTokens(base, idData));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, id, isRoi, profile?.roteiroTextos, idData.fantasia, idData.cnpj, idData.dataHorario]);

  useEffect(() => {
    if (isRoi || conclusaoTravadaRef.current) return;
    const base = resolverConclusaoHtml(id, profile?.roteiroTextos, config.roteiroTextos);
    setConclusaoHtml(fillRoteiroTextoTokens(base, idData));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, id, isRoi, profile?.roteiroTextos, idData.prazoDias, idData.baseLegalPrazo]);

  const handleIntroducaoChange = (html: string) => {
    introTravadaRef.current = true;
    setIntroducaoHtml(html);
  };

  const handleConclusaoChange = (html: string) => {
    conclusaoTravadaRef.current = true;
    setConclusaoHtml(html);
  };

  // Padrão PESSOAL do fiscal: guarda o texto que ele acabou de escrever no
  // próprio perfil, e a partir daí toda inspeção nova deste roteiro já nasce
  // com ele. Tem precedência sobre o padrão do município — ver
  // resolverIntroHtml em src/lib/roteiro-textos-padrao.ts.
  const [salvandoPadrao, setSalvandoPadrao] = useState<'introducaoHtml' | 'conclusaoHtml' | null>(null);

  const salvarComoMeuPadrao = async (campo: 'introducaoHtml' | 'conclusaoHtml', html: string) => {
    setSalvandoPadrao(campo);
    try {
      await updateProfileData({
        roteiroTextos: {
          ...profile?.roteiroTextos,
          [id]: { ...profile?.roteiroTextos?.[id], [campo]: html },
        },
      });
      toast({
        title: "Salvo como seu padrão",
        description: "Suas próximas inspeções deste roteiro já começam com este texto.",
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao salvar seu padrão", description: e?.message });
    } finally {
      setSalvandoPadrao(null);
    }
  };

  // Volta ao texto padrão vigente (o seu, se houver; senão o do município ou o
  // do código), já com os dados da inspeção preenchidos. Continua "travado",
  // porque é uma escolha explícita do fiscal e não deve ser sobrescrita pela
  // sincronização automática depois.
  const restaurarPadraoIntroducao = () => {
    setIntroducaoHtml(fillRoteiroTextoTokens(resolverIntroHtml(id, profile?.roteiroTextos, config.roteiroTextos), idData));
    introTravadaRef.current = true;
  };

  const restaurarPadraoConclusao = () => {
    setConclusaoHtml(fillRoteiroTextoTokens(resolverConclusaoHtml(id, profile?.roteiroTextos, config.roteiroTextos), idData));
    conclusaoTravadaRef.current = true;
  };

  // Atalho do cabeçalho ("Minhas Inspeções") — reabre o seletor a qualquer
  // momento, não só automaticamente ao entrar na página. Salva antes de abrir
  // pra garantir que nada da edição atual se perca ao trocar de inspeção.
  const handleAbrirSeletor = async () => {
    if (isDirtyRef.current) await handleSaveDraft(false);
    setIsPickerOpen(true);
  };

  const handleSaveDraft = useCallback(async (showToast = true) => {
    if (!profile) return;
    setIsSavingDraft(true);
    try {
      const data: Partial<Inspecao> = {
        titulo: idData.fantasia || "INSPEÇÃO EM CURSO",
        status: 'rascunho',
        data: new Date(),
        fiscalId: profile.uid,
        fiscalNome: profile.displayName || "Fiscal",
        checklistData: { answers, observations, itemPhotos, customItems, idData, cnaesDisponiveis: foundCnaes, roteiroId: id, introducaoHtml, conclusaoHtml }
      };
      const res = await saveInspecao(data, currentInspecaoId || undefined);
      if (res?.id) {
        setCurrentInspecaoId(res.id);
        setInspecaoStatus(prev => prev ?? 'rascunho');
        // Primeiro save de uma inspeção nova (sem ?inspecaoId= ainda) — reflete
        // o id na URL pra sobreviver a um refresh ou ser reaberta pelo link.
        if (!currentInspecaoId) router.replace(`/roteiros/${id}?inspecaoId=${res.id}`, { scroll: false });
      }
      isDirtyRef.current = false;
      // saveInspecao nunca lança erro — se a gravação na nuvem falhou de
      // verdade (ex.: documento grande demais por causa de fotos em base64),
      // ela fica só neste aparelho, tentando de novo pra sempre, sem nunca
      // avisar ninguém. Só avisa nos saves explícitos (botão "Salvar
      // Rascunho"), não a cada heartbeat silencioso — senão vira spam de
      // toast toda vez que o sinal cai por um instante.
      if (showToast) {
        if (res?.synced) toast({ title: "Sincronizado" });
        else toast({ variant: "destructive", title: "Salvo só neste aparelho", description: "Sem conexão com a nuvem — não abra esta vistoria em outro dispositivo até sincronizar." });
      }
    } catch (e) {
      if (showToast) toast({ variant: "destructive", title: "Erro na Nuvem" });
    } finally {
      setIsSavingDraft(false);
    }
  }, [profile, idData, answers, observations, itemPhotos, id, saveInspecao, currentInspecaoId, toast, introducaoHtml, conclusaoHtml, foundCnaes, router]);

  const [savingObsItem, setSavingObsItem] = useState<string | null>(null)
  const [isPolishingBatch, setIsPolishingBatch] = useState(false)
  // Guarda uma "foto" das observações no momento da última revisão por IA —
  // o botão de revisão em lote só fica habilitado se algo mudou desde então
  // (novo texto digitado ou item ainda não revisado), pra não gastar cota
  // reprocessando o que já foi revisado.
  const [lastPolishedObsSnapshot, setLastPolishedObsSnapshot] = useState<string | null>(null)

  // Salva a observação explicitamente e fecha o campo — sem isso, o campo
  // ficava "aberto" pra sempre depois de digitar (a condição de exibição
  // dependia só de ter texto, não do estado do botão), e não havia nenhuma
  // confirmação de que o relato tinha sido salvo.
  const handleSaveObservation = async (itemId: string) => {
    setSavingObsItem(itemId);
    try {
      await handleSaveDraft(false);
      toast({ title: "Observação Salva" });
      setShowObsInput(prev => ({ ...prev, [itemId]: false }));
    } finally {
      setSavingObsItem(null);
    }
  }

  // Revisão em lote — chamada só na tela de revisão final (view === 'report'),
  // depois que o fiscal já preencheu todas as observações. Uma única chamada
  // de IA cobre o relatório inteiro, em vez de uma chamada por item.
  const hasUnreviewedObservations = Object.values(observations).some(v => (v || '').trim())
    && JSON.stringify(observations) !== lastPolishedObsSnapshot;

  const handlePolishAllObservations = async () => {
    const items = Object.entries(observations)
      .filter(([, text]) => (text || '').trim())
      .map(([id, text]) => ({ id, text: text as string }));
    if (items.length === 0) return;
    setIsPolishingBatch(true);
    try {
      const result = await polishObservationsBatch({ items, uid: profile?.uid || '' });
      if (result.error) {
        toast({ variant: "destructive", title: "IA indisponível", description: result.error });
      }
      if (result.items.length > 0) {
        const next = { ...observations };
        result.items.forEach(({ id, polishedText }) => { next[id] = polishedText; });
        setObservations(next);
        setLastPolishedObsSnapshot(JSON.stringify(next));
        handleSaveDraft(false);
        if (!result.error) toast({ title: "Observações revisadas", description: `${result.items.length} observação(ões) ajustada(s) pela IA.` });
      }
    } finally {
      setIsPolishingBatch(false);
    }
  }

  // Confirmação vem de um AlertDialog no botão (ver cabeçalho) — chega aqui só
  // depois de confirmado. Sem inspeção salva ainda, não há o que confirmar:
  // só reseta o formulário em branco.
  const handleDeleteDraft = async () => {
    if (!currentInspecaoId) {
        resetToBlank();
        return;
    }
    setIsDeletingDraft(true);
    try {
        await deleteInspecao(currentInspecaoId);
        toast({ title: "Rascunho Excluído" });
        router.push("/roteiros");
    } catch (e: any) {
      // Mostra o motivo real (ex.: falha de permissão) em vez de um erro
      // genérico — sem isso, uma exclusão que falha silenciosamente no
      // servidor parece ter dado certo (o item some da tela local mesmo
      // assim) e só reaparece depois, num recarregamento.
      console.error("Erro ao excluir rascunho:", e);
      toast({ variant: "destructive", title: "Erro ao excluir", description: e?.message || "Verifique sua conexão e tente novamente." });
    } finally { setIsDeletingDraft(false); }
  };

  // As duas ações do diálogo de saída (ver registro do guard acima e o
  // AlertDialog no fim do componente). "Salvar e Sair" reaproveita
  // handleSaveDraft; "Excluir e Sair" NÃO salva nada antes — corta a edição
  // atual e apaga de vez (se já existia um rascunho salvo na nuvem).
  const handleExitSaveAndLeave = async () => {
    setIsExitSaving(true);
    try {
      await handleSaveDraft(false);
      toast({ title: "Rascunho Salvo" });
      setShowExitDialog(false);
      router.push(pendingExitHref || "/dashboard");
    } finally {
      setIsExitSaving(false);
    }
  };

  const handleExitDeleteAndLeave = async () => {
    setIsExitDeleting(true);
    try {
      if (currentInspecaoId) await deleteInspecao(currentInspecaoId);
      isDirtyRef.current = false;
      toast({ title: "Rascunho Excluído" });
      setShowExitDialog(false);
      router.push(pendingExitHref || "/dashboard");
    } catch (e: any) {
      console.error("Erro ao excluir rascunho:", e);
      toast({ variant: "destructive", title: "Erro ao excluir", description: e?.message || "Verifique sua conexão e tente novamente." });
    } finally {
      setIsExitDeleting(false);
    }
  };

  // Exclusão direto da lista do seletor — sem precisar abrir a inspeção
  // primeiro. Se for a que está carregada no formulário agora, reseta pra
  // não deixar o formulário apontando pra algo que acabou de ser apagado.
  const [deletandoDaListaId, setDeletandoDaListaId] = useState<string | null>(null);
  const handleDeleteInspecaoDaLista = async (inspecao: Inspecao) => {
    setDeletandoDaListaId(inspecao.id);
    try {
      await deleteInspecao(inspecao.id);
      toast({ title: "Excluído Permanentemente" });
      if (inspecao.id === currentInspecaoId) resetToBlank();
    } catch (e: any) {
      console.error("Erro ao excluir inspeção:", e);
      toast({ variant: "destructive", title: "Erro ao excluir", description: e?.message || "Verifique sua conexão e tente novamente." });
    } finally {
      setDeletandoDaListaId(null);
    }
  };

  const handleCnpjLookup = async () => {
    const val = idData.cnpj.replace(/\D/g, "");
    if (val.length !== 14) {
      // Campo aceita "CNPJ / CPF", mas a consulta automática só existe pra
      // CNPJ (a BrasilAPI não tem uma base pública de CPF) — sem este aviso,
      // digitar um CPF (11 dígitos) ou colar um número com caractere sobrando
      // fazia o clique na lupa não fazer nada visível, parecendo travado.
      toast({
        variant: "destructive",
        title: val.length === 11 ? "Busca automática só para CNPJ" : "CNPJ incompleto",
        description: val.length === 11
          ? "Para CPF (autônomo/MEI), preencha os dados do estabelecimento manualmente."
          : "Confira se o CNPJ tem os 14 dígitos.",
      });
      return;
    }
    setIsSearchingCnpj(true);
    try {
      // A rota /api/cnpj exige token (senão qualquer um na internet usaria o
      // endpoint como consulta grátis de CNPJ às nossas custas) — sem este
      // header a consulta voltava 401 e nenhum CNAE chegava à tela. Mesmo
      // padrão já usado em src/components/intimacao-form.tsx.
      const idToken = await firebaseAuth?.currentUser?.getIdToken();
      const res = await fetch(`/api/cnpj/${val}`, {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
      });
      if (res.ok) {
        const data = await res.json();
        const cnaesDaConsulta: string[] = data.cnaes_list || [];
        const updated = { ...idData, fantasia: data.razao_social, endereco: `${data.logradouro}, ${data.numero}`, bairro: data.bairro, responsavel: data.responsavel_legal, telefone: data.telefone || "", cnae: data.cnae || "" };
        setIdData(updated);
        setFoundCnaes(cnaesDaConsulta);
        toast({ title: "Empresa Localizada" });
        // Trigger save with new data
        setIsSavingDraft(true);
        const resSave = await saveInspecao({
            titulo: data.razao_social,
            status: 'rascunho',
            data: new Date(),
            fiscalId: profile!.uid,
            fiscalNome: profile!.displayName || "Fiscal",
            // Usa a lista que ACABOU de chegar, não o estado: setFoundCnaes
            // acima só vale no próximo render, então `foundCnaes` aqui ainda
            // seria o valor anterior (vazio na primeira consulta) e o rascunho
            // era gravado sem nenhum CNAE.
            checklistData: { answers, observations, itemPhotos, customItems, idData: updated, cnaesDisponiveis: cnaesDaConsulta, roteiroId: id, introducaoHtml, conclusaoHtml }
        }, currentInspecaoId || undefined);
        if (resSave?.id) {
          setCurrentInspecaoId(resSave.id);
          setInspecaoStatus(prev => prev ?? 'rascunho');
          if (!currentInspecaoId) router.replace(`/roteiros/${id}?inspecaoId=${resSave.id}`, { scroll: false });
        }
        setIsSavingDraft(false);
      } else {
        const errData = await res.json().catch(() => null);
        toast({ variant: "destructive", title: "CNPJ não localizado", description: errData?.message });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Erro ao consultar CNPJ", description: "Verifique sua conexão e tente novamente." });
    } finally { setIsSearchingCnpj(false); }
  }

  const handlePhotoUpload = async (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !profile) return;
    setUploadingItem(itemId);
    try {
      const compressed = await compressImage(file);
      let url: string;
      try {
        if (!storage) throw new Error('Storage indisponível.');
        const storageRef = ref(storage, `inspecoes/${profile.uid}/${itemId}_${Date.now()}.jpg`);
        // O SDK do Storage tem retry interno que pode levar bem mais de um
        // minuto pra desistir sozinho quando o bucket não responde — sem um
        // prazo nosso, isso parece um travamento (loop de carregamento) em
        // vez de simplesmente cair no fallback abaixo.
        const uploadWithTimeout = (async () => {
          await uploadBytes(storageRef, compressed);
          return getDownloadURL(storageRef);
        })();
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Tempo esgotado ao enviar para o Storage.')), 20000)
        );
        url = await Promise.race([uploadWithTimeout, timeout]);
      } catch (storageErr) {
        // Sem Storage configurado (ex.: plano Blaze ainda não ativado) — guarda a
        // foto comprimida direto no documento, como já é feito com a assinatura.
        url = await blobToDataUrl(compressed);
      }
      const newPhoto: PhotoEvidence = {
        url,
        timestamp: format(new Date(), "dd/MM/yyyy HH:mm"),
      };
      setItemPhotos(prev => ({ ...prev, [itemId]: [...(prev[itemId] || []), newPhoto] }));
      toast({ title: "Foto Anexada" });
      handleSaveDraft(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Erro ao Processar Foto" });
    } finally {
      setUploadingItem(null);
    }
  };

  const handleRemovePhoto = (itemId: string, index: number) => {
    setItemPhotos(prev => ({ ...prev, [itemId]: (prev[itemId] || []).filter((_, i) => i !== index) }));
    handleSaveDraft(false);
  };

  const handleSetPhotoSize = (itemId: string, index: number, size: PhotoSize) => {
    setItemPhotos(prev => ({
      ...prev,
      [itemId]: (prev[itemId] || []).map((p, i) => i === index ? { ...p, size } : p)
    }));
    handleSaveDraft(false);
  };

  const downloadPdf = async () => {
    if (!reportRef.current) return;
    setIsGeneratingPdf(true);
    let stagingEl: HTMLDivElement | null = null;
    try {
      const { jsPDF } = await import("jspdf");
      const { renderReportIntoPdf } = await import("@/lib/generate-roteiro-pdf");

      stagingEl = document.createElement('div');
      stagingEl.style.position = 'fixed';
      stagingEl.style.left = '-99999px';
      stagingEl.style.top = '0';
      document.body.appendChild(stagingEl);

      const pdf = new jsPDF('p', 'mm', 'a4');
      await renderReportIntoPdf(pdf, reportRef.current, stagingEl);
      pdf.save(`RELATÓRIO - ${idData.fantasia || 'INSPEÇÃO'}.pdf`);
    } finally {
      if (stagingEl) document.body.removeChild(stagingEl);
      setIsGeneratingPdf(false);
    }
  };

  // Baixa o PDF oficial (mesma rotina de downloadPdf) e só then encerra a
  // vistoria no sistema (status: 'concluido') — assim nunca existe um
  // relatório marcado como finalizado sem o PDF correspondente já ter sido
  // gerado. Confirmação vem de um AlertDialog no botão (ver visualização do
  // relatório), não mais de window.confirm. Depois de finalizada, a inspeção
  // continua acessível pelo seletor (aba "Finalizadas") ou por
  // ?inspecaoId= — não fica mais órfã.
  const handleFinalizarRelatorio = async () => {
    if (!profile) return;
    setIsFinalizing(true);
    try {
      await downloadPdf();
      const data: Partial<Inspecao> = {
        titulo: idData.fantasia || "INSPEÇÃO EM CURSO",
        status: 'concluido',
        data: new Date(),
        fiscalId: profile.uid,
        fiscalNome: profile.displayName || "Fiscal",
        checklistData: { answers, observations, itemPhotos, customItems, idData, cnaesDisponiveis: foundCnaes, roteiroId: id, introducaoHtml, conclusaoHtml }
      };
      const res = await saveInspecao(data, currentInspecaoId || undefined);
      if (res?.id) setCurrentInspecaoId(res.id);
      setInspecaoStatus('concluido');
      toast({ title: "Relatório Finalizado", description: "O PDF foi baixado e a vistoria foi encerrada." });
      router.push('/roteiros');
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao finalizar relatório" });
    } finally {
      setIsFinalizing(false);
    }
  };

  // Ordem de gravidade usada só pra ordenar itens DENTRO de um mesmo grupo —
  // o agrupamento em si agora é por seção/assunto do roteiro (pedido do
  // usuário: "manicure (lista), esterilização (lista) e por diante"), não
  // mais por criticidade primeiro.
  const CRIT_ORDER: Record<Criticality, number> = { I: 0, N: 1, R: 2 };

  // Uma não conformidade por grupo = uma seção do roteiro (na mesma ordem em
  // que aparecem no checklist oficial). Itens manuais do fiscal formam um
  // grupo à parte, sempre por último.
  const nonConformitiesBySection = useMemo(() => {
    const grupos: { label: string; itens: (ChecklistItem | CustomItem)[] }[] = [];
    checklist.secoes.forEach(sec => {
      const itensNaoConformes = sec.itens.filter(i => ehNaoConformidade(answers[i.id]));
      if (itensNaoConformes.length === 0) return;
      const label = sec.titulo.replace(/^\d+(\.\d+)*\.\s*/, '').trim();
      grupos.push({ label, itens: [...itensNaoConformes].sort((a, b) => CRIT_ORDER[a.crit] - CRIT_ORDER[b.crit]) });
    });
    if (customItems.length > 0) {
      grupos.push({ label: 'ITENS ADICIONAIS DO FISCAL', itens: [...customItems].sort((a, b) => CRIT_ORDER[a.crit] - CRIT_ORDER[b.crit]) });
    }
    return grupos;
  }, [answers, checklist, customItems]);

  const handleSaveCustomItem = () => {
    const text = newCustomText.trim();
    if (!text) return;
    if (editingCustomItemId) {
      setCustomItems(prev => prev.map(i => i.id === editingCustomItemId ? { ...i, text, crit: newCustomCrit } : i));
      setEditingCustomItemId(null);
    } else {
      setCustomItems(prev => [...prev, { id: `manual-${Date.now()}`, text, crit: newCustomCrit }]);
    }
    setNewCustomText("");
    setNewCustomCrit('N');
    handleSaveDraft(false);
  };

  const handleEditCustomItem = (item: CustomItem) => {
    setEditingCustomItemId(item.id);
    setNewCustomText(item.text);
    setNewCustomCrit(item.crit);
    setNnConformidadeAberto('nova-nao-conformidade');
  };

  const handleCancelEditCustomItem = () => {
    setEditingCustomItemId(null);
    setNewCustomText("");
    setNewCustomCrit('N');
  };

  const handleRemoveCustomItem = (itemId: string) => {
    setCustomItems(prev => prev.filter(i => i.id !== itemId));
    setObservations(prev => { const next = { ...prev }; delete next[itemId]; return next; });
    setItemPhotos(prev => { const next = { ...prev }; delete next[itemId]; return next; });
    if (editingCustomItemId === itemId) handleCancelEditCustomItem();
    handleSaveDraft(false);
  };

  // Numeração própria da lista de não conformidades no relatório (1, 2, 3...)
  // — sem vínculo com o número do item no roteiro (que reflete a estrutura
  // interna do checklist, não a ordem em que aparecem como inconformidade).
  const nonConformityNumber = useMemo(() => {
    const map = new Map<string, number>();
    let n = 1;
    nonConformitiesBySection.forEach(grupo => grupo.itens.forEach(item => map.set(item.id, n++)));
    return map;
  }, [nonConformitiesBySection]);

  // Sem brasão municipal configurado, mostra um espaço neutro (ícone
  // genérico) em vez de qualquer imagem específica — nunca a marca do
  // sistema (mascote do login) nem qualquer outra logo que não seja a do
  // próprio município.
  // Campos da identificação do relatório, em ordem. `full` ocupa a linha
  // inteira; os demais são emparelhados de dois em dois, aproveitando as duas
  // colunas da tabela. Campo sem valor é OMITIDO — antes todos apareciam, e um
  // "---" de e-mail ou responsável técnico gastava uma linha inteira do
  // documento sem informar nada.
  const camposIdentificacao: { label: string; valor: string; full?: boolean; classe?: string }[] = [
    { label: 'RAZÃO SOCIAL / NOME FANTASIA', valor: idData.fantasia, full: true, classe: 'font-black text-[11pt]' },
    { label: 'CNPJ / CPF', valor: idData.cnpj },
    { label: 'TELEFONE', valor: idData.telefone },
    { label: 'E-MAIL', valor: idData.email },
    { label: 'DATA/HORÁRIO DA INSPEÇÃO', valor: idData.dataHorario ? format(new Date(idData.dataHorario), "dd/MM/yyyy 'às' HH:mm") : '' },
    { label: 'ATIVIDADES (CNAE)', valor: idData.cnae, full: true, classe: 'font-bold text-[9pt] leading-tight text-zinc-800 uppercase' },
    { label: 'ENDEREÇO', valor: [idData.endereco, idData.bairro].filter(Boolean).join(' - '), full: true },
    { label: 'RESPONSÁVEL TÉCNICO', valor: idData.responsavelTecnico ? `${idData.responsavelTecnico}${idData.responsavelTecnicoRegistro ? ` — ${idData.responsavelTecnicoRegistro}` : ''}` : '' },
    { label: 'RESPONSÁVEL LEGAL', valor: idData.responsavel },
    { label: 'EQUIPE DE FISCALIZAÇÃO', valor: fiscais.length > 0 ? fiscais.map(f => (f as any).nome).join(' e ') : (profile?.displayName || ''), full: true },
  ].filter((campo) => campo.valor && campo.valor.trim());

  // Agrupa em linhas da tabela: um campo `full` ocupa a linha sozinho; os
  // curtos vão de dois em dois (e o último sozinho, com colSpan, se sobrar).
  const linhasIdentificacao: (typeof camposIdentificacao)[] = [];
  for (let i = 0; i < camposIdentificacao.length; i++) {
    const campo = camposIdentificacao[i];
    if (campo.full) { linhasIdentificacao.push([campo]); continue; }
    const proximo = camposIdentificacao[i + 1];
    if (proximo && !proximo.full) { linhasIdentificacao.push([campo, proximo]); i++; }
    else linhasIdentificacao.push([campo]);
  }

  const hasLogo = !!config.logoUrl;
  const isDataUrl = hasLogo && config.logoUrl!.startsWith('data:');
  const displayLogoUrl = hasLogo
    ? (isDataUrl ? config.logoUrl! : `/api/proxy-image?url=${encodeURIComponent(config.logoUrl!)}`)
    : undefined;

  // Recalcula a escala da prévia sempre que a tela do relatório abre, muda de
  // tamanho (rotação do aparelho) ou o conteúdo da folha muda de altura
  // (seções carregando, fotos etc.) — sem isso a folha A4 (210mm ≈ 794px)
  // fica maior que a tela e força rolagem lateral no celular.
  useEffect(() => {
    if (view !== 'report') return;
    const wrapperEl = reportWrapperRef.current;
    const paperEl = reportRef.current;
    if (!wrapperEl || !paperEl) return;

    const recompute = () => {
      const wrapperStyle = window.getComputedStyle(wrapperEl);
      const paddingX = parseFloat(wrapperStyle.paddingLeft || '0') + parseFloat(wrapperStyle.paddingRight || '0');
      const availableWidth = wrapperEl.clientWidth - paddingX;
      const naturalWidth = paperEl.offsetWidth;
      const naturalHeight = paperEl.offsetHeight;
      const scale = naturalWidth > availableWidth ? availableWidth / naturalWidth : 1;
      setReportPreviewScale(scale);
      setReportPreviewHeight(naturalHeight * scale);
    };

    recompute();

    // Só reage a mudança de LARGURA do wrapper (rotação do aparelho, sidebar
    // recolhendo) e a qualquer mudança de conteúdo do paperEl — nunca à
    // mudança de ALTURA do próprio wrapper, que é a própria coisa que este
    // efeito define logo acima (`setReportPreviewHeight`). Sem esse filtro,
    // o ResizeObserver notifica a própria mudança que ele causou, entrando
    // num ciclo observer → setState → nova notificação sem nunca convergir,
    // travando a tela do relatório.
    let lastWrapperWidth = wrapperEl.clientWidth;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === wrapperEl) {
          const width = wrapperEl.clientWidth;
          if (width === lastWrapperWidth) continue;
          lastWrapperWidth = width;
        }
        recompute();
        break;
      }
    });
    ro.observe(wrapperEl);
    ro.observe(paperEl);
    window.addEventListener('resize', recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [view]);

  if (view === 'report') {
    return (
      <div className="document-container font-serif pb-40">
        <header className="flex flex-wrap items-center justify-between no-print mb-10 gap-4 w-full max-w-[210mm] px-4">
            <Button onClick={() => setView('checklist')} variant="outline" className="rounded-xl h-11 font-black uppercase text-[10px] bg-white shadow-sm"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar à Edição</Button>
            <div className="flex items-center gap-3">
              {inspecaoStatus !== 'concluido' && (
                <Button onClick={handlePolishAllObservations} disabled={isPolishingBatch || !hasUnreviewedObservations} variant="outline" className="rounded-xl h-11 px-6 font-black uppercase text-[10px] bg-violet-50 text-violet-600 border-violet-100 shadow-sm hover:bg-violet-100">{isPolishingBatch ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />} Revisar Observações com IA</Button>
              )}
              {inspecaoStatus === 'concluido' ? (
                <Button onClick={downloadPdf} disabled={isGeneratingPdf} className="bg-primary text-white rounded-xl h-11 px-8 font-black uppercase text-[10px] shadow-xl">{isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />} Baixar PDF Novamente</Button>
              ) : (
                <>
                  <Button onClick={downloadPdf} disabled={isGeneratingPdf || isFinalizing} variant="outline" title="Gera o PDF sem encerrar a vistoria" className="rounded-xl h-11 px-6 font-black uppercase text-[10px] bg-white shadow-sm">{isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />} Baixar Prévia</Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button disabled={isGeneratingPdf || isFinalizing} className="bg-primary text-white rounded-xl h-11 px-8 font-black uppercase text-[10px] shadow-xl">{isFinalizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Finalizar e Baixar PDF</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-[2rem]">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-black uppercase tracking-tighter text-xl italic">Finalizar este relatório?</AlertDialogTitle>
                        <AlertDialogDescription>O PDF será baixado e a vistoria será encerrada no sistema — só finalizar de fato conta como concluída. Depois disso ainda dá pra reabrir e baixar o PDF de novo pela lista de inspeções deste roteiro, mas não pra continuar editando.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl font-black uppercase text-[10px] tracking-widest">Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleFinalizarRelatorio} className="rounded-xl font-black uppercase text-[10px] tracking-widest bg-primary hover:bg-primary/90">Finalizar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
        </header>

        <div ref={reportWrapperRef} className="document-paper-wrapper custom-scrollbar" style={{ overflowX: reportPreviewScale < 1 ? 'hidden' : 'auto', height: reportPreviewHeight }}>
          <div ref={reportRef} className="document-paper h-auto bg-white" style={{ transform: `scale(${reportPreviewScale})`, transformOrigin: 'top left' }}>
              <div data-pdf-header className="flex flex-row items-center justify-between gap-6 mb-1 pb-2 border-none">
                  <div className="w-[140px] h-[100px] md:w-[180px] md:h-[100px] flex items-center justify-start overflow-hidden">
                    {hasLogo ? (
                      <img src={displayLogoUrl} className="max-w-full max-h-full object-contain block" alt="Brasão" crossOrigin={isDataUrl ? undefined : "anonymous"} />
                    ) : (
                      <Landmark className="w-2/3 h-2/3 text-zinc-300" strokeWidth={1} />
                    )}
                  </div>
                  <div className="flex-1 text-center">
                    {config.headerRichText ? (<div style={{ fontFamily: "'Times New Roman', Times, serif" }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(config.headerRichText) }} />) : (<><p className="text-[10pt] font-black uppercase text-black">PREFEITURA MUNICIPAL DE {config.municipioNome || "PRUDENTÓPOLIS"}</p><h2 className="text-[12pt] font-black uppercase leading-tight">{config.secretaria || "SECRETARIA MUNICIPAL DE SAÚDE"}</h2><h3 className="text-[10pt] font-bold uppercase text-zinc-700">{config.departamento || "VIGILÂNCIA SANITÁRIA"}</h3></>)}
                    <p className="text-[14pt] font-black uppercase text-center tracking-tighter mt-2 border-y border-zinc-200 py-1">RELATÓRIO DE INSPEÇÃO SANITÁRIA</p>
                    {checklist.especialidade && <p className="text-[10pt] font-bold uppercase tracking-widest text-zinc-600 mt-1">{checklist.especialidade}</p>}
                  </div>
              </div>

              <div data-pdf-block className="mb-4">
                  <div className="sub-header-row">1. IDENTIFICAÇÃO DO ESTABELECIMENTO</div>
                  <table className="w-full border border-slate-300" style={{ borderCollapse: 'collapse' }}>
                      <tbody>
                          {linhasIdentificacao.map((linha, i) => (
                            <tr key={i}>
                              {linha.map((campo) => (
                                <td key={campo.label} colSpan={linha.length === 1 ? 2 : 1} className="border border-slate-200" style={{ padding: '3pt 8pt' }}>
                                  <span className="data-label">{campo.label}:</span>
                                  <div className={campo.classe || "font-bold text-[10pt]"}>{campo.valor}</div>
                                </td>
                              ))}
                            </tr>
                          ))}
                      </tbody>
                  </table>
              </div>

              {!isRoi && (
              <div data-pdf-block className="mb-4">
                  <div className="sub-header-row">2. CONSIDERAÇÕES GERAIS</div>
                  <div
                    className="border border-slate-300 p-4 bg-zinc-50/50"
                    style={{ fontSize: '10pt', lineHeight: 1.6, textAlign: 'justify', fontWeight: 500, color: '#18181b' }}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(introducaoHtml) }}
                  />
              </div>
              )}

              <div className="mb-4">
                  {/* No ROI não existem as seções 2 e 4, então as seguintes
                      sobem de número em vez de deixar buraco na sequência. */}
                  <div data-pdf-block className="sub-header-row">{isRoi ? 2 : 3}. NÃO CONFORMIDADES DETECTADAS</div>
                  {nonConformitiesBySection.length > 0 ? (
                      nonConformitiesBySection.map((grupo) => (
                          <div key={grupo.label} className="mt-4 first:mt-0 space-y-2">
                              {grupo.itens.map((item, idx) => {
                                      const critLabel = item.crit === 'I' ? "IMPRESCINDÍVEL" : item.crit === 'N' ? "NECESSÁRIO" : "RECOMENDÁVEL";
                                      const critClasses = item.crit === 'I' ? "bg-red-50 text-red-700 border-red-200" : item.crit === 'N' ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200";
                                      const sectionHeader = idx === 0 ? (
                                          <p className="text-[9.5pt] font-black uppercase tracking-wider text-zinc-700 mt-3 mb-1.5 pb-1 border-b-2 border-zinc-300">{grupo.label}</p>
                                      ) : null;
                                      const itemBody = (
                                          <>
                                              <div className="flex items-start gap-2 mb-2 flex-wrap">
                                                <span className="font-black text-[8pt] text-zinc-900 bg-zinc-50 h-6 px-2 flex items-center justify-center rounded shrink-0 whitespace-nowrap">ITEM {nonConformityNumber.get(item.id)}</span>
                                                <span className={cn("text-[7.5pt] font-black uppercase px-2 h-6 flex items-center rounded border shrink-0 whitespace-nowrap", critClasses)}>{critLabel}</span>
                                                <p className="text-[9.5pt] leading-relaxed text-zinc-800 font-bold flex-1 uppercase basis-full sm:basis-auto">{item.text}</p>
                                              </div>
                                              {observations[item.id] && (<div className="ml-8 mb-2 p-3 bg-zinc-50 border-l-2 border-zinc-300 rounded-r-lg"><p className="text-[7pt] font-black uppercase text-zinc-400 mb-0.5">Relato do Fiscal:</p><p className="text-[9.5pt] text-slate-600 leading-relaxed italic whitespace-pre-wrap font-sans">{observations[item.id]}</p></div>)}
                                              {itemPhotos[item.id] && itemPhotos[item.id].length > 0 && (
                                                <div className="ml-8 mb-2 grid grid-cols-2 gap-2">
                                                  {itemPhotos[item.id].map((photo, pIdx) => {
                                                    const photoIsDataUrl = photo.url.startsWith('data:');
                                                    const photoSrc = photoIsDataUrl ? photo.url : `/api/proxy-image?url=${encodeURIComponent(photo.url)}`;
                                                    const size = photo.size || 'M';
                                                    return (
                                                      <div key={pIdx} className={cn("border border-zinc-200 rounded-lg bg-zinc-50", size === 'G' && "col-span-2")}>
                                                        {/* Sem altura fixa nem object-fit — a imagem sempre mostra na
                                                            proporção natural (w-full h-auto), preenchendo a caixa por
                                                            completo, sem cortar e sem sobrar espaço vazio. O tamanho
                                                            P/M/G agora controla a largura máxima, não mais a altura.
                                                            Arredondado só no topo (rounded-t-lg), na própria imagem —
                                                            não por overflow-hidden no contêiner, que cortava o texto
                                                            da legenda de cantos quando ela quebrava linha. */}
                                                        <img
                                                          src={photoSrc}
                                                          alt={`Evidência ${pIdx + 1}`}
                                                          crossOrigin={photoIsDataUrl ? undefined : "anonymous"}
                                                          className={cn("block mx-auto w-full h-auto rounded-t-lg", PHOTO_SIZE_MAX_WIDTH[size])}
                                                        />
                                                        <p className="text-[6.5pt] text-zinc-400 font-bold uppercase px-2 py-1 border-t border-zinc-200">
                                                          {photo.timestamp}
                                                        </p>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                          </>
                                      );
                                      // O subtítulo de assunto (só no primeiro item do grupo) vai junto do
                                      // item num único bloco — assim ele nunca fica sozinho no fim de uma
                                      // página, separado dos itens que descreve, quando a quebra cai ali.
                                      return (idx === 0) ? (
                                          <div key={item.id} data-pdf-block>
                                              {sectionHeader}
                                              <div className="pl-4 pb-4 border-b border-zinc-100">{itemBody}</div>
                                          </div>
                                      ) : (
                                          <div key={item.id} data-pdf-block className="pl-4 pb-4 border-b border-zinc-100">
                                              {itemBody}
                                          </div>
                                      );
                              })}
                          </div>
                      ))
                  ) : <div data-pdf-block className="py-12 text-center border-2 border-dashed border-zinc-100 rounded-2xl mx-2"><CheckCircle2 className="h-10 w-10 text-emerald-100 mx-auto mb-2" /><p className="font-black text-zinc-300 uppercase text-[10pt] tracking-widest italic">Nenhuma irregularidade detectada.</p></div>}
              </div>


              {!isRoi && (
              <div data-pdf-block className="mb-6">
                  <div className="sub-header-row">4. CONCLUSÃO E PRAZO LEGAL</div>
                  <div
                    className="border border-slate-300 p-4 bg-zinc-50/50"
                    style={{ fontSize: '10pt', lineHeight: 1.6, textAlign: 'justify', fontWeight: 500, color: '#18181b' }}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(conclusaoHtml) }}
                  />
              </div>
              )}

              <div data-pdf-block className="mt-12 grid grid-cols-2 gap-8 text-center">
                  <div className="space-y-10 flex flex-col items-center">
                      {fiscais.map((f, i) => (
                          <div key={i} className="w-full max-w-[220px]"><div className="min-h-[40pt] flex flex-col items-center justify-end">{(f as any).signature && <img src={(f as any).signature} className="h-10 object-contain mb-0" alt="S" />}<div className="signature-block w-full"><p className="signature-name">{(f as any).nome}</p><p className="signature-title">{(f as any).cargo}</p></div></div></div>
                      ))}
                  </div>
                  <div className="space-y-10 flex flex-col items-center">
                      <div className="w-full max-w-[220px]"><div className="min-h-[40pt] flex flex-col items-center justify-end">{idData.signatureResponsavel && <img src={idData.signatureResponsavel} className="h-10 object-contain mb-0" alt="S" />}<div className="signature-block w-full"><p className="signature-name">{idData.responsavel || "INSPECIONADO"}</p><p className="signature-title">CIÊNCIA DO AUTUADO</p></div></div></div>
                  </div>
              </div>
              {/* Rodapé sempre presente (mesmo sem texto configurado em
                  Identidade Municipal) porque agora também carrega a
                  numeração de página — renderReportIntoPdf clona esse bloco
                  em toda página gerada, igual ao [data-pdf-header], e
                  substitui o texto de [data-pdf-pagenum] em cada cópia
                  pelo número real daquela página. */}
              <div
                data-pdf-footer
                className="pt-2 mt-4 border-t border-black/20 text-center text-[8pt] text-black"
                style={{ fontFamily: "'Times New Roman', Times, serif" }}
              >
                {config.footerRichText && <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(config.footerRichText) }} />}
                <p data-pdf-pagenum className="mt-1">Página 1 de 1</p>
              </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto w-full p-4 md:p-8 space-y-6 md:space-y-8 pb-40 font-sans">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 md:p-6 rounded-lg border border-[#E4DFD1] shadow-sm no-print">
        <div className="flex items-center gap-4">
          <div className="p-4 rounded-xl bg-[#E4EEEC] text-[#0E4A44]"><ClipboardList className="h-6 w-6" /></div>
          <div>
            <h1 className="font-serif text-xl md:text-2xl text-[#262420] leading-none">{checklist.titulo}</h1>
            <p className="text-[11px] text-[#A39D8C] font-black uppercase tracking-[0.2em] mt-1">{checklist.subtitulo}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
            {lastAutoSave && (<div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100"><Cloud className="h-3 w-3" /><span className="text-[10px] font-black uppercase whitespace-nowrap">Salvo às {format(lastAutoSave, "HH:mm")}</span></div>)}
            <button
              type="button"
              onClick={handleAbrirSeletor}
              title="Minhas inspeções deste roteiro"
              className="relative h-12 w-12 rounded-xl text-[#A39D8C] hover:text-primary hover:bg-primary/5 flex items-center justify-center transition-all"
            >
              <History className="h-5 w-5" />
              {minhasInspecoesDoRoteiro.emAndamento.length > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center">{minhasInspecoesDoRoteiro.emAndamento.length}</span>
              )}
            </button>
            {currentInspecaoId ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button type="button" className="h-12 w-12 rounded-xl text-rose-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-all">{isDeletingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-5 w-5" />}</button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-lg">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-serif text-xl text-[#262420]">Excluir este rascunho?</AlertDialogTitle>
                    <AlertDialogDescription>Isso apaga permanentemente esta inspeção — respostas, fotos e observações. Não é possível desfazer.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-xl font-black uppercase text-[10px] tracking-widest">Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteDraft} className="rounded-xl font-black uppercase text-[10px] tracking-widest bg-rose-600 hover:bg-rose-700">Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <button type="button" onClick={handleDeleteDraft} className="h-12 w-12 rounded-xl text-rose-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-all"><Trash2 className="h-5 w-5" /></button>
            )}
        </div>
      </header>

      <div className="space-y-8 no-print">
          {/* Só o root escolhe: a conta dele fica no município fictício
              "geral", que não tem brasão nem cabeçalho configurados. Fiscal e
              gestor usam o próprio município, sem nada a selecionar. */}
          {isRoot && (
            <div className="bg-white px-6 py-4 rounded-lg border border-[#E4DFD1] shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#9C7A3C]">Identidade do documento</p>
                <p className="text-[11px] text-[#6B6659] mt-1">De qual município usar brasão, cabeçalho e rodapé no relatório.</p>
              </div>
              <Popover open={municipioPickerOpen} onOpenChange={setMunicipioPickerOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1.5 text-xs font-medium text-[#6B6659] hover:text-[#0E4A44] transition-colors border border-[#E4DFD1] rounded-xl px-3 h-10">
                    <Building2 className="h-3.5 w-3.5" />
                    {selectedMunicipioForRoot || "Selecionar município"}
                    <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0 bg-white border-[#E4DFD1] rounded-lg shadow-lg">
                  <Command className="bg-transparent" shouldFilter={false}>
                    <CommandInput
                      placeholder="Pesquisar município..."
                      value={municipioSearchTerm}
                      onValueChange={setMunicipioSearchTerm}
                      className="h-10 border-none focus:ring-0 text-sm"
                    />
                    <CommandList className="max-h-[300px] overflow-y-auto">
                      {filteredMunicipiosPicker.ativos.length === 0 && filteredMunicipiosPicker.inativos.length === 0 && (
                        <CommandEmpty className="p-4 text-center text-xs text-[#A39D8C] font-medium">Não encontrado.</CommandEmpty>
                      )}
                      <CommandGroup>
                        {filteredMunicipiosPicker.ativos.length > 0 && (
                          <>
                            <p className="px-4 pt-2.5 pb-1 text-[10px] font-black uppercase tracking-widest text-primary/70">Com cadastro ativo</p>
                            {filteredMunicipiosPicker.ativos.map((m) => (
                              <div
                                key={m}
                                onClick={() => escolherMunicipioRoot(m)}
                                className="hover:bg-[#E4EEEC] cursor-pointer py-2.5 px-4 transition-colors font-medium text-sm border-b border-[#F1EEE4] last:border-b-0"
                              >
                                {m}
                              </div>
                            ))}
                          </>
                        )}
                        {filteredMunicipiosPicker.inativos.length > 0 && (
                          <>
                            <p className="px-4 pt-2.5 pb-1 text-[10px] font-black uppercase tracking-widest text-[#A39D8C]">Demais municípios</p>
                            {filteredMunicipiosPicker.inativos.map((m) => (
                              <div
                                key={m}
                                onClick={() => escolherMunicipioRoot(m)}
                                className="hover:bg-[#E4EEEC] cursor-pointer py-2.5 px-4 transition-colors font-medium text-sm border-b border-[#F1EEE4] last:border-b-0"
                              >
                                {m}
                              </div>
                            ))}
                          </>
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="bg-white p-4 md:p-6 border border-[#E4DFD1] shadow-sm space-y-4">
            <div className="space-y-2">
                <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#9C7A3C] flex items-center gap-3"><Building2 className="h-4 w-4 text-primary" /> Estabelecimento</h2>
                <div className="bg-[#FAF8F3] border border-[#E4DFD1] divide-y divide-[#E4DFD1]">
                   <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 px-4 py-2">
                      <Label className="sm:w-28 shrink-0 text-[10px] font-black uppercase text-[#6B6659]">Razão Social</Label>
                      <Input value={idData.fantasia} onChange={e => setIdData({...idData, fantasia: e.target.value.toUpperCase()})} className="h-8 flex-1 min-w-0 bg-transparent border-none shadow-none px-0 rounded-none font-bold uppercase focus-visible:ring-0 focus-visible:ring-offset-0" />
                   </div>
                   <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 px-4 py-2">
                      <Label className="sm:w-28 shrink-0 text-[10px] font-black uppercase text-[#6B6659]">CNPJ / CPF</Label>
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <Input value={idData.cnpj} onChange={e => setIdData({...idData, cnpj: e.target.value})} placeholder="00.000.000/0000-00" className="h-8 flex-1 min-w-0 bg-transparent border-none shadow-none px-0 rounded-none font-bold focus-visible:ring-0 focus-visible:ring-offset-0" />
                        <Button onClick={handleCnpjLookup} disabled={isSearchingCnpj} variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-primary hover:bg-primary/10">{isSearchingCnpj ? <Loader2 className="animate-spin h-4 w-4" /> : <Search className="h-4 w-4" />}</Button>
                      </div>
                   </div>
                   <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 px-4 py-2">
                      <Label className="sm:w-28 shrink-0 text-[10px] font-black uppercase text-[#6B6659]">Telefone</Label>
                      <Input value={idData.telefone} onChange={e => setIdData({...idData, telefone: e.target.value})} placeholder="(00) 00000-0000" className="h-8 flex-1 min-w-0 bg-transparent border-none shadow-none px-0 rounded-none font-bold focus-visible:ring-0 focus-visible:ring-offset-0" />
                   </div>
                   <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 px-4 py-2">
                      <Label className="sm:w-28 shrink-0 text-[10px] font-black uppercase text-[#6B6659]">Bairro</Label>
                      <Input value={idData.bairro} onChange={e => setIdData({...idData, bairro: e.target.value.toUpperCase()})} className="h-8 flex-1 min-w-0 bg-transparent border-none shadow-none px-0 rounded-none font-bold uppercase focus-visible:ring-0 focus-visible:ring-offset-0" />
                   </div>
                   <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 px-4 py-2">
                      <Label className="sm:w-28 shrink-0 text-[10px] font-black uppercase text-[#6B6659]">Endereço</Label>
                      <Input value={idData.endereco} onChange={e => setIdData({...idData, endereco: e.target.value.toUpperCase()})} className="h-8 flex-1 min-w-0 bg-transparent border-none shadow-none px-0 rounded-none font-bold uppercase focus-visible:ring-0 focus-visible:ring-offset-0" />
                   </div>
                   {(mostrarEmail || idData.email) ? (
                     <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 px-4 py-2">
                        <Label className="sm:w-28 shrink-0 text-[10px] font-black uppercase text-[#6B6659]">E-mail</Label>
                        <Input type="email" value={idData.email} onChange={e => setIdData({...idData, email: e.target.value})} placeholder="contato@estabelecimento.com" className="h-8 flex-1 min-w-0 bg-transparent border-none shadow-none px-0 rounded-none font-bold focus-visible:ring-0 focus-visible:ring-offset-0" />
                        <button type="button" onClick={() => { setIdData({...idData, email: ''}); setMostrarEmail(false); }} className="shrink-0 h-6 w-6 flex items-center justify-center text-[#A39D8C] hover:text-rose-500" title="Remover e-mail"><X className="h-3.5 w-3.5" /></button>
                     </div>
                   ) : (
                     <button type="button" onClick={() => setMostrarEmail(true)} className="w-full flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors">
                        <Plus className="h-3.5 w-3.5" /> Adicionar e-mail
                     </button>
                   )}
                </div>

                {foundCnaes.length > 0 && (
                  <div className="p-4 bg-blue-50 border border-blue-100 space-y-3">
                    {/* Um estabelecimento pode ter dezenas de atividades e
                        raramente todas são objeto da inspeção — daí a seleção
                        manual, com atalho pra marcar/limpar todas de uma vez
                        em vez de clicar uma a uma. */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                      <Label className="text-[11px] font-black uppercase text-blue-600 tracking-widest flex items-center gap-2">
                        <ListFilter className="h-3 w-3" /> Atividades inspecionadas ({cnaesSelecionados.length}/{foundCnaes.length})
                      </Label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setIdData({ ...idData, cnae: foundCnaes.map(c => c.toUpperCase()).join('; ') }); handleSaveDraft(false); }}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-100 transition-colors"
                        >
                          Marcar todas
                        </button>
                        <button
                          type="button"
                          onClick={() => { setIdData({ ...idData, cnae: '' }); handleSaveDraft(false); }}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-[#6B6659] hover:bg-blue-100 transition-colors"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                      {foundCnaes.map((c, i) => {
                        // Antes comparava idData.cnae (sempre salvo em MAIÚSCULAS)
                        // com `c` no formato original da API — como as caixas
                        // quase nunca batiam, a seleção nunca "desmarcava" e cada
                        // clique só ia empilhando o mesmo CNAE de novo.
                        const cUpper = c.toUpperCase();
                        const items = cnaesSelecionados;
                        const isSelected = items.includes(cUpper);
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              const newItems = isSelected ? items.filter((item) => item !== cUpper) : [...items, cUpper];
                              setIdData({ ...idData, cnae: newItems.join('; ') });
                            }}
                            className={cn("w-full text-left p-3 text-[11px] font-bold uppercase transition-all border flex items-center gap-3", isSelected ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-blue-100 text-blue-500")}
                          >
                            {isSelected ? <Check className="h-4 w-4" /> : <div className="h-4 w-4 border border-blue-200" />}
                            <span className="flex-1 leading-tight">{c}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>

            <div className="h-px bg-[#F1EEE4]" />

            <div className="space-y-2">
                <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#9C7A3C] flex items-center gap-3"><Building2 className="h-4 w-4 text-primary" /> Responsáveis e Data da Inspeção</h2>

                {(mostrarResponsavelTecnico || idData.responsavelTecnico || idData.responsavelTecnicoRegistro) ? (
                  <div className="bg-[#FAF8F3] border border-[#E4DFD1] relative">
                     <button type="button" onClick={() => { setIdData({...idData, responsavelTecnico: '', responsavelTecnicoRegistro: ''}); setMostrarResponsavelTecnico(false); }} className="absolute right-2 top-2 h-6 w-6 flex items-center justify-center text-[#A39D8C] hover:text-rose-500 z-10" title="Remover responsável técnico"><X className="h-3.5 w-3.5" /></button>
                     <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#E4DFD1]">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 px-4 py-2">
                           <Label className="sm:w-40 shrink-0 text-[10px] font-black uppercase text-[#6B6659]">Responsável Técnico</Label>
                           <Input value={idData.responsavelTecnico} onChange={e => setIdData({...idData, responsavelTecnico: e.target.value.toUpperCase()})} className="h-8 flex-1 min-w-0 bg-transparent border-none shadow-none px-0 rounded-none font-bold uppercase focus-visible:ring-0 focus-visible:ring-offset-0 pr-6" />
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 px-4 py-2">
                           <Label className="sm:w-40 shrink-0 text-[10px] font-black uppercase text-[#6B6659]">Registro (ex.: CRO)</Label>
                           <Input value={idData.responsavelTecnicoRegistro} onChange={e => setIdData({...idData, responsavelTecnicoRegistro: e.target.value})} placeholder="CRO-PR 00000" className="h-8 flex-1 min-w-0 bg-transparent border-none shadow-none px-0 rounded-none font-bold focus-visible:ring-0 focus-visible:ring-offset-0" />
                        </div>
                     </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setMostrarResponsavelTecnico(true)} className="w-full flex items-center gap-2 px-4 py-2.5 border border-dashed border-primary/30 text-[10px] font-black uppercase tracking-widest text-primary/70 hover:text-primary hover:bg-primary/5 transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Adicionar responsável técnico
                  </button>
                )}

                <div className="bg-[#FAF8F3] border border-[#E4DFD1] divide-y divide-[#E4DFD1]">
                   <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] divide-y sm:divide-y-0 sm:divide-x divide-[#E4DFD1]">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 px-4 py-2">
                         <Label className="sm:w-40 shrink-0 text-[10px] font-black uppercase text-[#6B6659]">Responsável (acompanhou a inspeção)</Label>
                         <Input value={idData.responsavel} onChange={e => setIdData({...idData, responsavel: e.target.value.toUpperCase()})} className="h-8 flex-1 min-w-0 bg-transparent border-none shadow-none px-0 rounded-none font-bold uppercase focus-visible:ring-0 focus-visible:ring-offset-0" />
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 px-4 py-2">
                         <Label className="sm:w-20 shrink-0 text-[10px] font-black uppercase text-[#6B6659]">RG/CPF</Label>
                         <Input value={idData.responsavelCpf} onChange={e => setIdData({...idData, responsavelCpf: e.target.value})} placeholder="000.000.000-00" className="h-8 flex-1 min-w-0 bg-transparent border-none shadow-none px-0 rounded-none font-bold focus-visible:ring-0 focus-visible:ring-offset-0" />
                      </div>
                   </div>
                   <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 px-4 py-2">
                      <Label className="sm:w-40 shrink-0 text-[10px] font-black uppercase text-[#6B6659]">Data e Horário da Inspeção</Label>
                      <Input type="datetime-local" value={idData.dataHorario} onChange={e => setIdData({...idData, dataHorario: e.target.value})} className="h-8 flex-1 min-w-0 bg-transparent border-none shadow-none px-0 rounded-none font-bold focus-visible:ring-0 focus-visible:ring-offset-0" />
                   </div>
                </div>
            </div>

            {/* ROI da ANVISA não usa os textos narrativos — ver checklist.roi. */}
            {!isRoi && (
            <>
            <div className="h-px bg-[#F1EEE4]" />

            <Accordion type="single" collapsible>
              <AccordionItem value="introducao" className="border-none">
                <AccordionTrigger className="py-0 hover:no-underline [&>svg]:text-primary">
                  <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#9C7A3C] flex items-center gap-3"><FileText className="h-4 w-4 text-primary" /> Texto de Abertura do Relatório</h2>
                </AccordionTrigger>
                <AccordionContent className="pt-3 space-y-3">
                <p className="text-[11px] font-medium text-[#6B6659]">Texto que abre o relatório final ("Considerações Gerais") — editável. Pré-preenchido com o padrão do município e os dados acima.</p>
                <div className="p-2 bg-[#FAF8F3] rounded-lg border border-[#E4DFD1] font-serif">
                  <RichTextEditor value={introducaoHtml} onChange={handleIntroducaoChange} fontSize="10.5pt" minHeight="140px" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => salvarComoMeuPadrao('introducaoHtml', introducaoHtml)}
                    disabled={salvandoPadrao === 'introducaoHtml'}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-primary hover:bg-[#E4EEEC] transition-colors disabled:opacity-50"
                  >
                    {salvandoPadrao === 'introducaoHtml' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Salvar como meu padrão
                  </button>
                  <button
                    type="button"
                    onClick={restaurarPadraoIntroducao}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-[#6B6659] hover:bg-[#F1EEE4] transition-colors"
                  >
                    <Eraser className="h-3 w-3" />
                    Restaurar padrão
                  </button>
                </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            </>
            )}

            {/* ROI da ANVISA: formulario de alimentacao da base da ANVISA,
                nao gera exigencia de adequacao — logo, nao tem prazo nem
                base legal de prazo a preencher. */}
            {!isRoi && (
            <>
            <div className="h-px bg-[#F1EEE4]" />

            <Accordion type="single" collapsible>
              <AccordionItem value="prazo" className="border-none">
                <AccordionTrigger className="py-0 hover:no-underline [&>svg]:text-primary">
                  <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#9C7A3C] flex items-center gap-3"><Clock className="h-4 w-4 text-primary" /> Prazo para Regularização e Anexos</h2>
                </AccordionTrigger>
                <AccordionContent className="pt-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                   <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-[#6B6659]">Prazo (dias)</Label><Input type="number" min="1" value={idData.prazoDias} onChange={e => setIdData({...idData, prazoDias: e.target.value})} className="h-10 rounded-xl bg-[#FAF8F3] border-none font-bold" /></div>
                   <div className="space-y-1.5 md:col-span-2"><Label className="text-[10px] font-black uppercase text-[#6B6659]">Base Legal do Prazo</Label><Input value={idData.baseLegalPrazo} onChange={e => setIdData({...idData, baseLegalPrazo: e.target.value})} placeholder="Ex.: Lei Municipal nº 0000/0000" className="h-10 rounded-xl bg-[#FAF8F3] border-none font-bold" /></div>
                </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            </>
            )}

            <div className="h-px bg-[#F1EEE4]" />

            <div className="space-y-10">
              {/* Rótulo sem citar a SESA: este cabeçalho vale pra qualquer
                  roteiro, e nem todos são estaduais (farmácia é lei federal,
                  os ROI são da ANVISA). */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#9C7A3C] flex items-center gap-3"><FileSearch className="h-4 w-4 text-primary" /> Avaliação Técnica</h2>
                <div className="flex items-center gap-2 no-print">
                  <button type="button" onClick={expandirTodasSecoes} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-[#6B6659] hover:bg-[#F1EEE4] transition-colors">Expandir tudo</button>
                  <button type="button" onClick={recolherTodasSecoes} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-[#6B6659] hover:bg-[#F1EEE4] transition-colors">Recolher tudo</button>
                </div>
              </div>
              <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-4">
              {checklist.secoes.map((secao) => {
                const [respondidos, totalItens] = progressoSecao(secao);
                return (
                <AccordionItem key={secao.id} value={secao.id} ref={(el) => { sectionRefs.current[secao.id] = el; }} className="border border-[#E4DFD1] rounded-xl px-5 bg-white">
                  <AccordionTrigger className="hover:no-underline py-4">
                    <div className="flex items-center gap-3 flex-1 text-left">
                      <h3 className="text-sm font-black text-[#262420] border-l-4 border-primary pl-4 uppercase">{secao.titulo}</h3>
                      <Badge className={cn("text-[10px] font-black shrink-0", respondidos === totalItens && totalItens > 0 ? "bg-emerald-100 text-emerald-700" : "bg-[#F1EEE4] text-[#6B6659]")}>
                        {respondidos}/{totalItens}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                  <div className="space-y-4 pt-2">
                    {secao.itens.map((item) => (
                      item.isHeader ? (
                        <p key={item.id} className="pt-2 text-[11px] font-black uppercase tracking-widest text-[#6B6659]">{item.text}</p>
                      ) : (
                      <div key={item.id} className="p-6 bg-[#FAF8F3] rounded-lg border border-[#E4DFD1] space-y-5">
                        {/* No ROI as alternativas são textos longos: empilha
                            sempre, em vez de dividir em duas colunas. */}
                        <div className={cn("flex gap-6", item.roi ? "flex-col" : "flex-col md:flex-row md:items-start justify-between")}>
                          <div className="flex-1 space-y-2"><div className="flex items-center gap-3"><Badge className={cn("text-[10px] font-black uppercase px-2", item.crit === 'I' ? "bg-red-100 text-red-600" : item.crit === 'N' ? "bg-amber-100 text-amber-600" : "bg-sky-100 text-sky-600")}>{item.crit === 'I' ? "IMPRESCINDÍVEL" : item.crit === 'N' ? "NECESSÁRIO" : "RECOMENDÁVEL"}</Badge><span className="text-[11px] font-black text-[#A39D8C]">{item.roi ? `INDICADOR ${item.roi.numero}` : `ITEM ${item.id}`}</span></div><p className="text-[15px] font-bold text-[#262420] leading-relaxed uppercase">{item.roi ? item.roi.indicador : item.text}</p>{item.roi && <p className="text-[11px] font-bold text-[#A39D8C]">{item.roi.baseLegal}</p>}</div>
                          {item.roi ? (
                            // Escala 0–5: cada nota tem a descrição do que a
                            // caracteriza, então vira uma lista de opções
                            // legíveis em vez dos três botões curtos. A faixa
                            // colorida à esquerda separa à distância o que é
                            // não conformidade (abaixo de NOTA_CONFORME) do
                            // que já cumpre a norma.
                            <RadioGroup
                              value={answers[item.id]}
                              onValueChange={(v: any) => { setAnswers(prev => ({ ...prev, [item.id]: v })); handleSaveDraft(false); }}
                              className="flex flex-col gap-2"
                            >
                              {item.roi.alternativas.map((alternativa, nota) => {
                                const valor = String(nota);
                                const selecionada = answers[item.id] === valor;
                                const abaixoDoCorte = nota < NOTA_CONFORME;
                                return (
                                  <label
                                    key={valor}
                                    className={cn(
                                      "flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-all bg-white",
                                      selecionada
                                        ? abaixoDoCorte ? "border-red-300 bg-red-50/60 ring-1 ring-red-200" : "border-primary bg-[#E4EEEC]/50 ring-1 ring-primary/30"
                                        : "border-[#E4DFD1] hover:bg-[#FAF8F3]"
                                    )}
                                  >
                                    <RadioGroupItem value={valor} className="sr-only" />
                                    <span
                                      className={cn(
                                        "flex items-center justify-center shrink-0 h-8 w-8 rounded-lg text-[13px] font-black transition-all",
                                        selecionada
                                          ? abaixoDoCorte ? "bg-red-500 text-white" : "bg-primary text-white"
                                          : abaixoDoCorte ? "bg-red-50 text-red-400" : "bg-[#E4EEEC] text-[#0E4A44]"
                                      )}
                                    >
                                      {nota}
                                    </span>
                                    <span className={cn("text-[13px] leading-relaxed", selecionada ? "text-[#262420] font-medium" : "text-[#6B6659]")}>
                                      {alternativa}
                                    </span>
                                  </label>
                                );
                              })}
                            </RadioGroup>
                          ) : (
                          <RadioGroup value={answers[item.id]} onValueChange={(v: any) => { setAnswers(prev => ({ ...prev, [item.id]: v })); handleSaveDraft(false); }} className="flex items-center gap-2 bg-white p-1 rounded-lg border border-[#E4DFD1]">{['SIM', 'NAO', 'ND'].map(opt => (<label key={opt} className={cn("flex items-center justify-center h-10 px-5 rounded-xl text-[11px] font-black cursor-pointer transition-all", answers[item.id] === opt ? "bg-primary text-white" : "text-[#6B6659] hover:bg-[#F1EEE4]")}><RadioGroupItem value={opt} className="sr-only" /> {opt}</label>))}</RadioGroup>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[#E4DFD1]">
                          <button type="button" onClick={() => setShowObsInput(prev => ({ ...prev, [item.id]: !prev[item.id] }))} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase transition-all", (observations[item.id] || showObsInput[item.id]) ? "bg-primary/10 text-primary" : "text-[#6B6659] hover:bg-[#F1EEE4]")}><MessageSquare className="h-3.5 w-3.5" /> {showObsInput[item.id] ? "Fechar Nota" : observations[item.id] ? "Ver Nota" : "Observação"}</button>
                          <label className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase transition-all cursor-pointer", (itemPhotos[item.id]?.length ?? 0) > 0 ? "bg-primary/10 text-primary" : "text-[#6B6659] hover:bg-[#F1EEE4]")}>
                            {uploadingItem === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                            {(itemPhotos[item.id]?.length ?? 0) > 0 ? `Fotos (${itemPhotos[item.id].length})` : "Anexar Foto"}
                            <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploadingItem === item.id} onChange={(e) => handlePhotoUpload(item.id, e)} />
                          </label>
                        </div>
                        {(itemPhotos[item.id]?.length ?? 0) > 0 && (
                          <div className="grid grid-cols-2 gap-3">
                            {itemPhotos[item.id].map((photo, pIdx) => {
                              const size = photo.size || 'M';
                              return (
                              <div key={pIdx} className={cn("relative group/photo rounded-xl border border-[#E4DFD1] bg-white", size === 'G' && "col-span-2")}>
                                {/* Arredondado na própria imagem, não por overflow-hidden no
                                    contêiner: overflow-hidden cortava o cantinho dos botões de
                                    excluir/tamanho (absolute, encostados no canto) — mesmo
                                    problema do menu de base legal do Fiscal AI, corrigido antes. */}
                                <img src={photo.url} alt={`Evidência ${pIdx + 1}`} className={cn("block mx-auto w-full h-auto rounded-xl", PHOTO_SIZE_MAX_WIDTH[size])} />
                                {/* Sempre visíveis por padrão — em toque (celular/tablet, o uso
                                    predominante em campo) não existe estado de :hover pra revelar
                                    esses controles, então ficavam invisíveis e intocáveis. Some só
                                    em telas md+ (mouse), onde o hover pra revelar faz sentido. */}
                                <button type="button" onClick={() => handleRemovePhoto(item.id, pIdx)} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-100 md:opacity-0 md:group-hover/photo:opacity-100 transition-opacity"><X className="h-3.5 w-3.5" /></button>
                                <div className="absolute bottom-1 left-1 flex gap-0.5 opacity-100 md:opacity-0 md:group-hover/photo:opacity-100 transition-opacity">
                                  {(['P', 'M', 'G'] as PhotoSize[]).map(s => (
                                    <button
                                      key={s}
                                      type="button"
                                      onClick={() => handleSetPhotoSize(item.id, pIdx, s)}
                                      className={cn("h-6 w-6 rounded-md text-[9px] font-black flex items-center justify-center transition-colors", size === s ? "bg-primary text-white" : "bg-black/60 text-white/80 hover:bg-black/80")}
                                    >
                                      {s}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        )}
                        {showObsInput[item.id] && (<div className="space-y-3 animate-in fade-in slide-in-from-top-2"><Label className="text-[10px] font-black text-primary uppercase">Relato de Irregularidade</Label><Textarea value={observations[item.id] || ""} onChange={e => { setObservations(prev => ({ ...prev, [item.id]: e.target.value })); }} placeholder="Descreva a situação..." spellCheck autoCorrect="on" autoCapitalize="sentences" className="min-h-[100px] rounded-lg bg-white border-[#E4DFD1] text-sm font-medium" /><div className="flex items-center gap-2"><Button type="button" onClick={() => toggleRecordingObservacao(item.id)} variant="outline" size="sm" className={cn("h-9 px-4 rounded-xl font-black text-[10px] uppercase gap-2", recordingItemId === item.id ? "bg-red-500 text-white border-red-500 animate-pulse hover:bg-red-500 hover:text-white" : "text-[#6B6659] border-[#E4DFD1]")}>{recordingItemId === item.id ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />} {recordingItemId === item.id ? "Parar" : "Ditar por voz"}</Button><Button onClick={() => handleSaveObservation(item.id)} disabled={savingObsItem === item.id} size="sm" className="h-9 px-5 rounded-xl bg-primary text-white font-black text-[10px] uppercase gap-2">{savingObsItem === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar</Button></div></div>)}
                      </div>
                      )
                    ))}
                  </div>
                  </AccordionContent>
                </AccordionItem>
                );
              })}
              </Accordion>
            </div>

            <div className="h-px bg-[#F1EEE4]" />

            <div className="space-y-6">
              <Accordion type="single" collapsible value={nnConformidadeAberto} onValueChange={setNnConformidadeAberto}>
                <AccordionItem value="nova-nao-conformidade" className="border-none">
                  <AccordionTrigger className="py-0 hover:no-underline [&>svg]:text-primary">
                    <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#9C7A3C] flex items-center gap-3"><Plus className="h-4 w-4 text-primary" /> Adicionar Não Conformidade</h2>
                  </AccordionTrigger>
                  <AccordionContent className="pt-3 space-y-4">
                  <p className="text-xs text-[#6B6659]">Para fatos constatados que não estão previstos em nenhum item do roteiro oficial — entra no relatório junto com os demais, ao final do grupo de criticidade escolhido.</p>
                  <div className="p-6 bg-[#FAF8F3] rounded-lg border border-[#E4DFD1] space-y-4">
                    <Textarea
                      value={newCustomText}
                      onChange={e => setNewCustomText(e.target.value)}
                      placeholder="Descreva o fato constatado..."
                      className="min-h-[80px] rounded-lg bg-white border-[#E4DFD1] text-sm font-medium"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <RadioGroup value={newCustomCrit} onValueChange={(v: any) => setNewCustomCrit(v)} className="flex items-center gap-2 bg-white p-1 rounded-lg border border-[#E4DFD1]">
                        {(['I', 'N', 'R'] as Criticality[]).map(c => (
                          <label key={c} className={cn("flex items-center justify-center h-10 px-4 rounded-xl text-[10px] font-black cursor-pointer transition-all", newCustomCrit === c ? "bg-primary text-white" : "text-[#6B6659] hover:bg-[#F1EEE4]")}>
                            <RadioGroupItem value={c} className="sr-only" /> {c === 'I' ? 'IMPRESCINDÍVEL' : c === 'N' ? 'NECESSÁRIO' : 'RECOMENDÁVEL'}
                          </label>
                        ))}
                      </RadioGroup>
                      <Button type="button" onClick={handleSaveCustomItem} disabled={!newCustomText.trim()} className="h-10 px-6 rounded-xl bg-primary text-white font-black text-[11px] uppercase gap-2">
                        {editingCustomItemId ? <><Pencil className="h-4 w-4" /> Salvar Alteração</> : <><Plus className="h-4 w-4" /> Adicionar</>}
                      </Button>
                      {editingCustomItemId && (
                        <Button type="button" onClick={handleCancelEditCustomItem} variant="ghost" className="h-10 px-4 rounded-xl text-[#A39D8C] font-black text-[11px] uppercase">
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {customItems.length > 0 && (
                <div className="space-y-4">
                  {customItems.map((item) => (
                    <div key={item.id} className={cn("p-6 bg-[#FAF8F3] rounded-lg border space-y-5", editingCustomItemId === item.id ? "border-primary/40 ring-2 ring-primary/20" : "border-[#E4DFD1]")}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <Badge className={cn("text-[10px] font-black uppercase px-2", item.crit === 'I' ? "bg-red-100 text-red-600" : item.crit === 'N' ? "bg-amber-100 text-amber-600" : "bg-sky-100 text-sky-600")}>{item.crit === 'I' ? "IMPRESCINDÍVEL" : item.crit === 'N' ? "NECESSÁRIO" : "RECOMENDÁVEL"}</Badge>
                          <p className="text-[15px] font-bold text-[#262420] leading-relaxed">{item.text}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button type="button" onClick={() => handleEditCustomItem(item)} variant="ghost" size="icon" className="h-8 w-8 rounded-full text-[#A39D8C] hover:bg-[#F1EEE4]"><Pencil className="h-4 w-4" /></Button>
                          <Button type="button" onClick={() => handleRemoveCustomItem(item.id)} variant="ghost" size="icon" className="h-8 w-8 rounded-full text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[#E4DFD1]">
                        <button type="button" onClick={() => setShowObsInput(prev => ({ ...prev, [item.id]: !prev[item.id] }))} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase transition-all", (observations[item.id] || showObsInput[item.id]) ? "bg-primary/10 text-primary" : "text-[#6B6659] hover:bg-[#F1EEE4]")}><MessageSquare className="h-3.5 w-3.5" /> {showObsInput[item.id] ? "Fechar Nota" : observations[item.id] ? "Ver Nota" : "Observação"}</button>
                        <label className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase transition-all cursor-pointer", (itemPhotos[item.id]?.length ?? 0) > 0 ? "bg-primary/10 text-primary" : "text-[#6B6659] hover:bg-[#F1EEE4]")}>
                          {uploadingItem === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                          {(itemPhotos[item.id]?.length ?? 0) > 0 ? `Fotos (${itemPhotos[item.id].length})` : "Anexar Foto"}
                          <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploadingItem === item.id} onChange={(e) => handlePhotoUpload(item.id, e)} />
                        </label>
                      </div>
                      {(itemPhotos[item.id]?.length ?? 0) > 0 && (
                        <div className="grid grid-cols-2 gap-3">
                          {itemPhotos[item.id].map((photo, pIdx) => {
                            const size = photo.size || 'M';
                            return (
                            <div key={pIdx} className={cn("relative group/photo rounded-xl border border-[#E4DFD1] bg-white", size === 'G' && "col-span-2")}>
                              <img src={photo.url} alt={`Evidência ${pIdx + 1}`} className={cn("block mx-auto w-full h-auto rounded-xl", PHOTO_SIZE_MAX_WIDTH[size])} />
                              <button type="button" onClick={() => handleRemovePhoto(item.id, pIdx)} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-100 md:opacity-0 md:group-hover/photo:opacity-100 transition-opacity"><X className="h-3.5 w-3.5" /></button>
                              <div className="absolute bottom-1 left-1 flex gap-0.5 opacity-100 md:opacity-0 md:group-hover/photo:opacity-100 transition-opacity">
                                {(['P', 'M', 'G'] as PhotoSize[]).map(s => (
                                  <button key={s} type="button" onClick={() => handleSetPhotoSize(item.id, pIdx, s)} className={cn("h-6 w-6 rounded-md text-[9px] font-black flex items-center justify-center transition-colors", size === s ? "bg-primary text-white" : "bg-black/60 text-white/80 hover:bg-black/80")}>{s}</button>
                                ))}
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      )}
                      {showObsInput[item.id] && (<div className="space-y-3 animate-in fade-in slide-in-from-top-2"><Label className="text-[10px] font-black text-primary uppercase">Relato de Irregularidade</Label><Textarea value={observations[item.id] || ""} onChange={e => setObservations(prev => ({ ...prev, [item.id]: e.target.value }))} placeholder="Descreva a situação..." spellCheck autoCorrect="on" autoCapitalize="sentences" className="min-h-[100px] rounded-lg bg-white border-[#E4DFD1] text-sm font-medium" /><div className="flex items-center gap-2"><Button type="button" onClick={() => toggleRecordingObservacao(item.id)} variant="outline" size="sm" className={cn("h-9 px-4 rounded-xl font-black text-[10px] uppercase gap-2", recordingItemId === item.id ? "bg-red-500 text-white border-red-500 animate-pulse hover:bg-red-500 hover:text-white" : "text-[#6B6659] border-[#E4DFD1]")}>{recordingItemId === item.id ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />} {recordingItemId === item.id ? "Parar" : "Ditar por voz"}</Button><Button onClick={() => handleSaveObservation(item.id)} disabled={savingObsItem === item.id} size="sm" className="h-9 px-5 rounded-xl bg-primary text-white font-black text-[10px] uppercase gap-2">{savingObsItem === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar</Button></div></div>)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!isRoi && (
            <>
            <div className="h-px bg-[#F1EEE4]" />

            <Accordion type="single" collapsible>
              <AccordionItem value="conclusao" className="border-none">
                <AccordionTrigger className="py-0 hover:no-underline [&>svg]:text-primary">
                  <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#9C7A3C] flex items-center gap-3"><Scale className="h-4 w-4 text-primary" /> Texto de Conclusão do Relatório</h2>
                </AccordionTrigger>
                <AccordionContent className="pt-3 space-y-3">
                <p className="text-[11px] font-medium text-[#6B6659]">Texto que fecha o relatório final ("Conclusão e Prazo Legal") — editável. Pré-preenchido com o padrão do município e o prazo acima.</p>
                <div className="p-2 bg-[#FAF8F3] rounded-lg border border-[#E4DFD1] font-serif">
                  <RichTextEditor value={conclusaoHtml} onChange={handleConclusaoChange} fontSize="10.5pt" minHeight="140px" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => salvarComoMeuPadrao('conclusaoHtml', conclusaoHtml)}
                    disabled={salvandoPadrao === 'conclusaoHtml'}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-primary hover:bg-[#E4EEEC] transition-colors disabled:opacity-50"
                  >
                    {salvandoPadrao === 'conclusaoHtml' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Salvar como meu padrão
                  </button>
                  <button
                    type="button"
                    onClick={restaurarPadraoConclusao}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-[#6B6659] hover:bg-[#F1EEE4] transition-colors"
                  >
                    <Eraser className="h-3 w-3" />
                    Restaurar padrão
                  </button>
                </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            </>
            )}

            <div className="h-px bg-[#F1EEE4]" />

            <div className="space-y-10 pt-4">
                <div className="bg-[#262420] text-white p-8 rounded-lg shadow-2xl space-y-8">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-2xl bg-primary/20"><ClipboardList className="h-5 w-5 text-primary" /></div><div><h3 className="font-serif text-xl">Resumo da Vistoria</h3></div></div><Badge className="bg-primary text-white border-none text-[10px] font-black px-4 h-8">{Object.keys(answers).length} ITENS</Badge></div>
                    <div className="space-y-3">
                        <div>
                          <p className="text-[10px] font-black uppercase text-white/60">1. Equipe de Fiscalização</p>
                          <p className="text-[11px] text-white/40 mt-0.5">Adicione quem esteve na vistoria e toque no nome para assinar.</p>
                        </div>
                        {fiscais.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {fiscais.map((f, i) => (<Button key={i} onClick={() => setSigningFiscalIndex(i)} variant="outline" className={cn("h-14 rounded-2xl justify-between px-5 font-bold text-[10px] uppercase border-white/10 bg-white/5 text-white", f.signature && "border-emerald-500/50 bg-emerald-500/10")}><span className="truncate">{(f as any).nome}</span>{f.signature ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <PenTool className="h-4 w-4 text-white/20" />}</Button>))}
                          </div>
                        )}
                        <SelecionarAutoridadeParaFormulario onSelect={(f) => { setFiscais(prev => [...prev, f]); handleSaveDraft(false); }} />
                    </div>
                    <div className="space-y-3 pt-2 border-t border-white/10">
                        <div>
                          <p className="text-[10px] font-black uppercase text-white/60">2. Ciência do Inspecionado</p>
                          <p className="text-[11px] text-white/40 mt-0.5">O responsável pelo estabelecimento assina para confirmar o recebimento do relatório.</p>
                        </div>
                        <Button onClick={() => setSigningResponsavel(true)} variant="outline" className={cn("w-full sm:w-1/2 h-14 rounded-2xl justify-between px-5 font-bold text-[10px] uppercase border-white/10 bg-white/5 text-white", idData.signatureResponsavel && "border-emerald-500/50 bg-emerald-500/10")}><span className="truncate">{idData.responsavel || "Toque para assinar"}</span>{idData.signatureResponsavel ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <PenTool className="h-4 w-4 text-white/20" />}</Button>
                    </div>
                </div>
            </div>
          </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-[100] no-print px-4 pb-8 pt-4 bg-white/90 backdrop-blur-xl border-t border-[#E4DFD1] shadow-[0_-25px_50px_rgba(0,0,0,0.15)]">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-4">
              <Button type="button" onClick={() => handleSaveDraft()} disabled={isSavingDraft} variant="outline" className="w-full sm:w-auto h-16 px-10 rounded-2xl border-[#E4DFD1] text-[#6B6659] font-black uppercase text-[11px] tracking-widest gap-3 shadow-md">{isSavingDraft ? <Loader2 className="animate-spin h-5 w-5" /> : <Save className="h-5 w-5" />} Salvar Rascunho</Button>
              <Button type="button" onClick={async () => { await handleSaveDraft(false); setView('report'); window.scrollTo(0,0); }} disabled={Object.keys(answers).length === 0} className="flex-1 w-full h-16 bg-primary hover:bg-primary/90 text-white gap-4 rounded-2xl shadow-2xl transition-all active:scale-95"><FileText className="h-6 w-6" /><div className="flex flex-col items-start leading-none text-left"><span className="text-lg font-black uppercase tracking-tighter italic">VISUALIZAR RELATÓRIO</span><span className="text-[8px] font-bold opacity-70 uppercase tracking-widest mt-0.5">Sincronizar e gerar PDF</span></div></Button>
          </div>
      </div>

      <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
        <DialogContent className="rounded-lg sm:max-w-md border-none shadow-2xl bg-white overflow-hidden p-0">
            <DialogHeader className="p-8 bg-[#0E4A44] text-white border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-white/10 text-white"><History className="h-6 w-6" /></div>
                    <div>
                        <DialogTitle className="font-serif text-xl">Minhas Inspeções</DialogTitle>
                        <DialogDescription className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-1">{checklist.titulo}</DialogDescription>
                    </div>
                </div>
            </DialogHeader>
            <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <Button onClick={resetToBlank} variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-[11px] tracking-widest gap-2 border-primary/30 text-primary hover:bg-primary/5">
                  <Eraser className="h-4 w-4" /> Nova Inspeção
                </Button>

                {minhasInspecoesDoRoteiro.emAndamento.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[9px] font-black uppercase text-amber-600 tracking-widest px-1">Em Andamento</p>
                    <div className="space-y-2">
                      {minhasInspecoesDoRoteiro.emAndamento.map((insp) => (
                        <div
                          key={insp.id}
                          className={cn(
                            "rounded-2xl border transition-colors flex items-center gap-1 pr-2",
                            insp.id === currentInspecaoId ? "bg-primary/5 border-primary/30" : "bg-[#FAF8F3] border-[#E4DFD1]"
                          )}
                        >
                          <button type="button" onClick={() => carregarInspecao(insp)} className="flex-1 min-w-0 text-left p-4 rounded-2xl hover:bg-[#F1EEE4]/70 transition-colors flex items-center gap-3">
                            <Building2 className="h-4 w-4 text-amber-600 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-[#262420] uppercase truncate">{insp.titulo || "VISTORIA SEM NOME"}</p>
                              <p className="text-[10px] font-medium text-[#6B6659] italic">Salvo às {insp.updatedAt ? format(new Date(insp.updatedAt), "HH:mm 'de' dd/MM") : "..."}</p>
                            </div>
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button type="button" className="h-9 w-9 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shrink-0 transition-colors">
                                {deletandoDaListaId === insp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-lg">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="font-serif text-xl text-[#262420]">Excluir permanentemente?</AlertDialogTitle>
                                <AlertDialogDescription>Apaga "{insp.titulo || "vistoria sem nome"}" — respostas, fotos e observações. Não é possível desfazer.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl font-black uppercase text-[10px] tracking-widest">Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteInspecaoDaLista(insp)} className="rounded-xl font-black uppercase text-[10px] tracking-widest bg-rose-600 hover:bg-rose-700">Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {minhasInspecoesDoRoteiro.finalizadas.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[9px] font-black uppercase text-emerald-600 tracking-widest px-1">Finalizadas</p>
                    <div className="space-y-2">
                      {minhasInspecoesDoRoteiro.finalizadas.map((insp) => (
                        <div
                          key={insp.id}
                          className={cn(
                            "rounded-2xl border transition-colors flex items-center gap-1 pr-2",
                            insp.id === currentInspecaoId ? "bg-primary/5 border-primary/30" : "bg-[#FAF8F3] border-[#E4DFD1]"
                          )}
                        >
                          <button type="button" onClick={() => carregarInspecao(insp)} className="flex-1 min-w-0 text-left p-4 rounded-2xl hover:bg-[#F1EEE4]/70 transition-colors flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-[#262420] uppercase truncate">{insp.titulo || "VISTORIA SEM NOME"}</p>
                              <p className="text-[10px] font-medium text-[#6B6659] italic">Concluída {insp.updatedAt ? format(new Date(insp.updatedAt), "dd/MM/yyyy") : ""}</p>
                            </div>
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button type="button" className="h-9 w-9 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center shrink-0 transition-colors">
                                {deletandoDaListaId === insp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-lg">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="font-serif text-xl text-[#262420]">Excluir permanentemente?</AlertDialogTitle>
                                <AlertDialogDescription>Apaga "{insp.titulo || "vistoria sem nome"}" — inclusive o histórico do relatório finalizado. Não é possível desfazer.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl font-black uppercase text-[10px] tracking-widest">Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteInspecaoDaLista(insp)} className="rounded-xl font-black uppercase text-[10px] tracking-widest bg-rose-600 hover:bg-rose-700">Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {minhasInspecoesDoRoteiro.emAndamento.length === 0 && minhasInspecoesDoRoteiro.finalizadas.length === 0 && (
                  <p className="text-[11px] font-bold text-[#A39D8C] text-center py-2">Nenhuma outra inspeção deste roteiro ainda.</p>
                )}
            </div>
        </DialogContent>
      </Dialog>

      <SignaturePad isOpen={signingFiscalIndex !== null} onOpenChange={(open) => !open && setSigningFiscalIndex(null)} onSave={(sig) => { if (signingFiscalIndex !== null) { const updated = [...fiscais]; updated[signingFiscalIndex] = { ...updated[signingFiscalIndex], signature: sig }; setFiscais(updated); handleSaveDraft(false); } }} title="Assinatura Fiscal" />
      <SignaturePad isOpen={signingResponsavel} onOpenChange={setSigningResponsavel} onSave={(sig) => { setIdData({...idData, signatureResponsavel: sig}); handleSaveDraft(false); }} title="Ciência Inspecionado" />

      <AlertDialog open={showExitDialog} onOpenChange={(open) => { if (!isExitSaving && !isExitDeleting) setShowExitDialog(open); }}>
        <AlertDialogContent className="rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-xl text-[#262420]">Sair sem finalizar?</AlertDialogTitle>
            <AlertDialogDescription>Esta vistoria ainda não foi finalizada. Salve como rascunho para continuar depois, ou exclua permanentemente se não quer mantê-la.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button type="button" onClick={handleExitSaveAndLeave} disabled={isExitSaving || isExitDeleting} className="w-full h-11 rounded-xl font-black uppercase text-[11px] tracking-widest gap-2 bg-primary hover:bg-primary/90 text-white">
              {isExitSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar Rascunho e Sair
            </Button>
            <Button type="button" onClick={handleExitDeleteAndLeave} disabled={isExitSaving || isExitDeleting} variant="outline" className="w-full h-11 rounded-xl font-black uppercase text-[11px] tracking-widest gap-2 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700">
              {isExitDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Excluir e Sair
            </Button>
            <AlertDialogCancel disabled={isExitSaving || isExitDeleting} className="w-full mt-0 rounded-xl font-black uppercase text-[10px] tracking-widest text-[#6B6659] border-none shadow-none hover:bg-[#F1EEE4]">Continuar Editando</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
