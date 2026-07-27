
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
import { cn } from "@/lib/utils"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"
import { storage } from "@/lib/firebase"
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { useAppConfig } from "@/hooks/use-app-config"
import { useAuth } from "@/hooks/use-auth"
import { useInspecoes } from "@/hooks/use-inspecoes"
import { SelecionarAutoridadeParaFormulario } from "@/components/selecionar-autoridade-dialog"
import { SignaturePad } from "@/components/signature-pad"
import type { Autoridade, Inspecao } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"
import { Textarea } from "@/components/ui/textarea"
import { polishObservationsBatch } from "@/ai/flows/polish-observations-batch"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { compressImage, blobToDataUrl } from "@/lib/compress-image"

type Criticality = 'I' | 'N' | 'R'

type PhotoSize = 'P' | 'M' | 'G';

interface PhotoEvidence {
  url: string;
  timestamp: string;
  location: string;
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

const CHECKLISTS: Record<string, ChecklistData> = {
  odontologia: odontologiaChecklist,
  'odontologia-prudentopolis': odontologiaPrudentopolisChecklist,
  alimentacao: alimentacaoChecklist,
  farmacia: farmaciaChecklist,
  'clinica-estetica-prudentopolis': clinicaEsteticaPrudentopolisChecklist,
};

export default function DynamicChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Resolve a Promise para obter o id (usado como roteiroId no rascunho salvo)
  const checklist = CHECKLISTS[id] || odontologiaChecklist;
  const { toast } = useToast()
  const { profile } = useAuth()
  const { config } = useAppConfig()
  const router = useRouter()
  const { saveInspecao, deleteInspecao, inspecoes, loading: loadingInspecoes } = useInspecoes()
  const reportRef = useRef<HTMLDivElement>(null)

  // Roteiro exclusivo de Prudentópolis — mesmo que alguém digite a URL direto,
  // fiscais/gestores de outros municípios são levados de volta pra lista.
  useEffect(() => {
    if (id === 'odontologia-prudentopolis' && profile && profile.municipioId !== 'prudentopolis' && profile.role !== 'root') {
      router.replace('/roteiros');
    }
  }, [id, profile, router]);

  const [idData, setIdData] = useState(() => ({
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
  }))

  const [currentInspecaoId, setCurrentInspecaoId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, 'SIM' | 'NAO' | 'ND'>>({})
  const [observations, setObservations] = useState<Record<string, string>>({})
  const [showObsInput, setShowObsInput] = useState<Record<string, boolean>>({})
  const [itemPhotos, setItemPhotos] = useState<Record<string, PhotoEvidence[]>>({})
  const [customItems, setCustomItems] = useState<CustomItem[]>([])
  const [newCustomText, setNewCustomText] = useState("")
  const [newCustomCrit, setNewCustomCrit] = useState<Criticality>('N')
  // Quando preenchido, o formulário acima passa a editar este item em vez
  // de criar um novo — a criticidade escolhida na hora de adicionar não
  // podia mais ser alterada depois, então isso reaproveita o mesmo
  // formulário pra editar um item já existente.
  const [editingCustomItemId, setEditingCustomItemId] = useState<string | null>(null)
  // Anexo opcional do relatório — texto técnico fixo sobre Central de
  // Material Esterilizado, só entra na versão final se o fiscal marcar.
  const [incluirCME, setIncluirCME] = useState(false)
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
  const [foundCnaes, setFoundCnaes] = useState<string[]>([]);
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [draftToResume, setDraftToResume] = useState<Inspecao | null>(null);
  const [isResumeDialogOpen, setIsResumeDialogOpen] = useState(false);
  const isDirtyRef = useRef(false);
  // Sempre aponta para a versão mais recente de handleSaveDraft — sem isso, o
  // heartbeat abaixo (que só recria o intervalo quando answers/idData mudam)
  // podia acabar chamando uma versão antiga da função, salvando uma cópia
  // desatualizada caso só uma foto/observação tivesse mudado nesse meio-tempo.
  const handleSaveDraftRef = useRef<(showToast?: boolean) => Promise<void>>();

  // Auto-save em tempo real (Heartbeat a cada 15 segundos)
  useEffect(() => {
    if (view === 'report' || !profile) return;
    const timer = setInterval(() => {
        if (isDirtyRef.current && (Object.keys(answers).length > 0 || idData.fantasia)) {
            handleSaveDraftRef.current?.(false);
            setLastAutoSave(new Date());
        }
    }, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Carregar rascunho vinculado ao Login e Roteiro
  useEffect(() => {
    if (!loadingInspecoes && profile && !currentInspecaoId) {
      const draft = inspecoes.find(i => i.status === 'rascunho' && i.checklistData?.roteiroId === id && i.fiscalId === profile.uid);
      if (draft && draft.checklistData) {
        setDraftToResume(draft);
        setIsResumeDialogOpen(true);
      }
    }
  }, [loadingInspecoes, inspecoes, id, profile, currentInspecaoId]);

  // Marca alterações pendentes para o heartbeat/beforeunload saberem que há
  // algo ainda não confirmado como salvo na nuvem.
  const isFirstDirtyCheckRef = useRef(true);
  useEffect(() => {
    if (isFirstDirtyCheckRef.current) { isFirstDirtyCheckRef.current = false; return; }
    isDirtyRef.current = true;
  }, [answers, observations, itemPhotos, idData]);

  const handleResumeDraft = () => {
    if (draftToResume && draftToResume.checklistData) {
        setAnswers(draftToResume.checklistData.answers || {});
        setObservations(draftToResume.checklistData.observations || {});
        setItemPhotos(draftToResume.checklistData.itemPhotos || {});
        setCustomItems(draftToResume.checklistData.customItems || []);
        setIncluirCME((draftToResume.checklistData as any).incluirCME || false);
        setIdData(draftToResume.checklistData.idData || {});
        setCurrentInspecaoId(draftToResume.id);
        toast({ title: "Vistoria Retomada" });
    }
    setIsResumeDialogOpen(false);
  };

  const handleStartFresh = async () => {
    if (draftToResume?.id) {
        try {
          await deleteInspecao(draftToResume.id);
        } catch (e) {
          toast({ variant: "destructive", title: "Erro ao excluir rascunho anterior" });
        }
    }
    setIsResumeDialogOpen(false);
    toast({ title: "Nova Vistoria", description: "Iniciando do zero." });
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
        checklistData: { answers, observations, itemPhotos, customItems, incluirCME, idData, roteiroId: id }
      };
      const res = await saveInspecao(data, currentInspecaoId || undefined);
      if (res?.id) setCurrentInspecaoId(res.id);
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
  }, [profile, idData, answers, observations, itemPhotos, id, saveInspecao, currentInspecaoId, toast]);

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

  const handleDeleteDraft = async () => {
    if (!currentInspecaoId) {
        setAnswers({}); setObservations({}); setItemPhotos({}); setCustomItems([]); setIncluirCME(false); setIdData(prev => ({...prev, fantasia: '', cnpj: '', cnae: ''}));
        return;
    }
    if (!window.confirm("CONFIRMAR EXCLUSÃO DESTE RASCUNHO?")) return;
    setIsDeletingDraft(true);
    try {
        await deleteInspecao(currentInspecaoId);
        toast({ title: "Rascunho Excluído" });
        router.push("/roteiros");
    } catch (e) { toast({ variant: "destructive", title: "Erro ao excluir" }); } finally { setIsDeletingDraft(false); }
  };

  const handleCnpjLookup = async () => {
    const val = idData.cnpj.replace(/\D/g, "");
    if (val.length !== 14) return;
    setIsSearchingCnpj(true);
    try {
      const res = await fetch(`/api/cnpj/${val}`);
      if (res.ok) {
        const data = await res.json();
        const updated = { ...idData, fantasia: data.razao_social, endereco: `${data.logradouro}, ${data.numero}`, bairro: data.bairro, responsavel: data.responsavel_legal, telefone: data.telefone || "", cnae: data.cnae || "" };
        setIdData(updated);
        setFoundCnaes(data.cnaes_list || []);
        toast({ title: "Empresa Localizada" });
        // Trigger save with new data
        setIsSavingDraft(true);
        const resSave = await saveInspecao({
            titulo: data.razao_social,
            status: 'rascunho',
            data: new Date(),
            fiscalId: profile!.uid,
            fiscalNome: profile!.displayName || "Fiscal",
            checklistData: { answers, observations, itemPhotos, customItems, incluirCME, idData: updated, roteiroId: id }
        }, currentInspecaoId || undefined);
        if (resSave?.id) setCurrentInspecaoId(resSave.id);
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
      const newPhoto: PhotoEvidence = { url, timestamp: format(new Date(), "dd/MM/yyyy HH:mm"), location: idData.fantasia || "Local da Inspeção" };
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
  // gerado. Depois de finalizado, some da lista de rascunhos retomáveis
  // (handleResumeDraft só busca status === 'rascunho').
  const handleFinalizarRelatorio = async () => {
    if (!profile) return;
    if (!window.confirm("Finalizar este relatório? O PDF será baixado e a vistoria será encerrada no sistema, sem opção de continuar editando por aqui.")) return;
    setIsFinalizing(true);
    try {
      await downloadPdf();
      const data: Partial<Inspecao> = {
        titulo: idData.fantasia || "INSPEÇÃO EM CURSO",
        status: 'concluido',
        data: new Date(),
        fiscalId: profile.uid,
        fiscalNome: profile.displayName || "Fiscal",
        checklistData: { answers, observations, itemPhotos, customItems, incluirCME, idData, roteiroId: id }
      };
      const res = await saveInspecao(data, currentInspecaoId || undefined);
      if (res?.id) setCurrentInspecaoId(res.id);
      toast({ title: "Relatório Finalizado", description: "O PDF foi baixado e a vistoria foi encerrada." });
      router.push('/roteiros');
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao finalizar relatório" });
    } finally {
      setIsFinalizing(false);
    }
  };

  const nonConformities = useMemo(() => {
    const all = checklist.secoes.flatMap(s => s.itens);
    const filtered = all.filter(i => answers[i.id] === 'NAO');
    // Itens manuais entram ao final do grupo de criticidade escolhido — depois
    // dos itens do roteiro oficial, nunca misturados no meio deles.
    const byCrit = (crit: Criticality) => [
      ...filtered.filter(i => i.crit === crit),
      ...customItems.filter(i => i.crit === crit),
    ];
    return { I: byCrit('I'), N: byCrit('N'), R: byCrit('R') };
  }, [answers, checklist, customItems]);

  // Rótulo da área/serviço a que cada item pertence (nome da seção do
  // roteiro, sem a numeração própria dela) — usado só pra agrupar
  // visualmente as não conformidades no relatório por assunto, sem alterar
  // a separação por criticidade já existente.
  const itemSectionLabel = useMemo(() => {
    const map = new Map<string, string>();
    checklist.secoes.forEach(sec => {
      const label = sec.titulo.replace(/^\d+(\.\d+)*\.\s*/, '').trim();
      sec.itens.forEach(item => map.set(item.id, label));
    });
    return map;
  }, [checklist]);

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
    const ordered = (['I', 'N', 'R'] as Criticality[]).flatMap(crit => nonConformities[crit]);
    const map = new Map<string, number>();
    ordered.forEach((item, idx) => map.set(item.id, idx + 1));
    return map;
  }, [nonConformities]);

  // Sem brasão municipal configurado, mostra um espaço neutro (ícone
  // genérico) em vez de qualquer imagem específica — nunca a marca do
  // sistema (mascote do login) nem qualquer outra logo que não seja a do
  // próprio município.
  const hasLogo = !!config.logoUrl;
  const isDataUrl = hasLogo && config.logoUrl!.startsWith('data:');
  const displayLogoUrl = hasLogo
    ? (isDataUrl ? config.logoUrl! : `/api/proxy-image?url=${encodeURIComponent(config.logoUrl!)}`)
    : undefined;

  if (view === 'report') {
    return (
      <div className="document-container font-serif pb-40">
        <header className="flex flex-wrap items-center justify-between no-print mb-10 gap-4 w-full max-w-[210mm] px-4">
            <Button onClick={() => setView('checklist')} variant="outline" className="rounded-xl h-11 font-black uppercase text-[10px] bg-white shadow-sm"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar à Edição</Button>
            <div className="flex items-center gap-3">
              <Button onClick={handlePolishAllObservations} disabled={isPolishingBatch || !hasUnreviewedObservations} variant="outline" className="rounded-xl h-11 px-6 font-black uppercase text-[10px] bg-violet-50 text-violet-600 border-violet-100 shadow-sm hover:bg-violet-100">{isPolishingBatch ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />} Revisar Observações com IA</Button>
              <Button onClick={downloadPdf} disabled={isGeneratingPdf || isFinalizing} variant="outline" className="rounded-xl h-11 px-6 font-black uppercase text-[10px] bg-white shadow-sm">{isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />} Baixar PDF Oficial</Button>
              <Button onClick={handleFinalizarRelatorio} disabled={isGeneratingPdf || isFinalizing} className="bg-primary text-white rounded-xl h-11 px-8 font-black uppercase text-[10px] shadow-xl">{isFinalizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Finalizar Relatório</Button>
            </div>
        </header>

        <div className="document-paper-wrapper custom-scrollbar">
          <div ref={reportRef} className="document-paper h-auto bg-white">
              <div data-pdf-header className="flex flex-row items-center justify-between gap-6 mb-1 pb-2 border-none">
                  <div className="w-[140px] h-[100px] md:w-[180px] md:h-[100px] flex items-center justify-start overflow-hidden">
                    {hasLogo ? (
                      <img src={displayLogoUrl} className="max-w-full max-h-full object-contain block" alt="Brasão" crossOrigin={isDataUrl ? undefined : "anonymous"} />
                    ) : (
                      <Landmark className="w-2/3 h-2/3 text-zinc-300" strokeWidth={1} />
                    )}
                  </div>
                  <div className="flex-1 text-center">
                    {config.headerRichText ? (<div style={{ fontFamily: "'Times New Roman', Times, serif" }} dangerouslySetInnerHTML={{ __html: config.headerRichText }} />) : (<><p className="text-[10pt] font-black uppercase text-black">PREFEITURA MUNICIPAL DE {config.municipioNome || "PRUDENTÓPOLIS"}</p><h2 className="text-[12pt] font-black uppercase leading-tight">{config.secretaria || "SECRETARIA MUNICIPAL DE SAÚDE"}</h2><h3 className="text-[10pt] font-bold uppercase text-zinc-700">{config.departamento || "VIGILÂNCIA SANITÁRIA"}</h3></>)}
                    <p className="text-[14pt] font-black uppercase text-center tracking-tighter mt-2 border-y border-zinc-200 py-1">RELATÓRIO DE INSPEÇÃO SANITÁRIA</p>
                    {checklist.especialidade && <p className="text-[10pt] font-bold uppercase tracking-widest text-zinc-600 mt-1">{checklist.especialidade}</p>}
                  </div>
              </div>

              <div data-pdf-block className="mb-6">
                  <div className="sub-header-row">1. IDENTIFICAÇÃO DO ESTABELECIMENTO</div>
                  <table className="form-table-clean border-black w-full" style={{ borderCollapse: 'collapse' }}>
                      <tbody>
                          <tr><td colSpan={2} style={{ padding: '6pt 10pt' }}><span className="data-label">RAZÃO SOCIAL / NOME FANTASIA:</span><div className="font-black text-[11pt]">{idData.fantasia || "---"}</div></td></tr>
                          <tr><td style={{ padding: '6pt 10pt' }}><span className="data-label">CNPJ / CPF:</span><div className="font-bold text-[10pt]">{idData.cnpj || "---"}</div></td><td style={{ padding: '6pt 10pt' }}><span className="data-label">TELEFONE:</span><div className="font-bold text-[10pt]">{idData.telefone || "---"}</div></td></tr>
                          <tr><td style={{ padding: '6pt 10pt' }}><span className="data-label">E-MAIL:</span><div className="font-bold text-[10pt]">{idData.email || "---"}</div></td><td style={{ padding: '6pt 10pt' }}><span className="data-label">DATA/HORÁRIO DA INSPEÇÃO:</span><div className="font-bold text-[10pt]">{idData.dataHorario ? format(new Date(idData.dataHorario), "dd/MM/yyyy 'às' HH:mm") : "---"}</div></td></tr>
                          <tr><td colSpan={2} style={{ padding: '6pt 10pt' }}><span className="data-label">ATIVIDADES (CNAE):</span><div className="font-bold text-[9pt] leading-tight text-zinc-800 uppercase">{idData.cnae || "---"}</div></td></tr>
                          <tr><td colSpan={2} style={{ padding: '6pt 10pt' }}><span className="data-label">ENDEREÇO:</span><div className="font-bold text-[10pt]">{idData.endereco} - {idData.bairro}</div></td></tr>
                          <tr><td colSpan={2} style={{ padding: '6pt 10pt' }}><span className="data-label">RESPONSÁVEL TÉCNICO:</span><div className="font-bold text-[10pt]">{idData.responsavelTecnico || "---"}{idData.responsavelTecnicoRegistro ? ` — ${idData.responsavelTecnicoRegistro}` : ""}</div></td></tr>
                          <tr><td colSpan={2} style={{ padding: '6pt 10pt' }}><span className="data-label">EQUIPE DE FISCALIZAÇÃO:</span><div className="font-bold text-[10pt]">{fiscais.length > 0 ? fiscais.map(f => (f as any).nome).join(' e ') : (profile?.displayName || "---")}</div></td></tr>
                      </tbody>
                  </table>
              </div>

              <div data-pdf-block className="mb-6">
                  <div className="sub-header-row">2. CONSIDERAÇÕES GERAIS</div>
                  <div className="border border-[#171717] p-4 bg-zinc-50/50 space-y-3">
                    {id === 'alimentacao' ? (
                      // Bloco próprio e completo (mesma estrutura dedicada usada pro
                      // guia de Prudentópolis) — cita as duas RDCs que embasam este
                      // roteiro (275/2002 e 216/2004), não só uma.
                      <>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">No dia {idData.dataHorario ? format(new Date(idData.dataHorario), "dd/MM/yyyy") : "____/____/____"} a equipe de fiscalização da Vigilância Sanitária Municipal realizou inspeção no estabelecimento {idData.fantasia || "---"}, CNPJ/CPF {idData.cnpj || "---"}, com a finalidade de verificar as condições sanitárias e proceder à renovação da licença sanitária, conforme protocolo.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">O funcionamento do estabelecimento está condicionado à posse de licença sanitária válida, nos termos do Código de Saúde do Estado do Paraná (Lei Estadual nº 13.331/2001), com renovação anual.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">A inspeção observou os critérios estabelecidos pela RDC nº 216/2004 da Anvisa (Boas Práticas para Serviços de Alimentação) e pela RDC nº 275/2002 da Anvisa (Procedimentos Operacionais Padronizados), além das demais normas sanitárias aplicáveis.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Durante a vistoria, foram identificadas inconformidades que necessitam de correção para garantir o cumprimento da legislação e a proteção da saúde de usuários e profissionais.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Para a emissão da licença sanitária, o estabelecimento deverá regularizar integralmente as recomendações apontadas, conforme os itens a seguir.</p>
                      </>
                    ) : id === 'farmacia' ? (
                      <>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">No dia {idData.dataHorario ? format(new Date(idData.dataHorario), "dd/MM/yyyy") : "____/____/____"} a equipe de fiscalização da Vigilância Sanitária Municipal realizou inspeção no estabelecimento {idData.fantasia || "---"}, CNPJ/CPF {idData.cnpj || "---"}, com a finalidade de verificar as condições sanitárias e proceder à renovação da licença sanitária, conforme protocolo.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">O funcionamento de farmácias e drogarias está condicionado à posse de licença sanitária válida, nos termos do Código de Saúde do Estado do Paraná (Lei Estadual nº 13.331/2001) e da Lei Federal nº 5.991/1973, com renovação anual.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">A inspeção foi conduzida com base na RDC nº 44/2009 da Anvisa (Boas Práticas Farmacêuticas) e, quando aplicável ao estabelecimento, na Portaria nº 344/1998 (medicamentos sujeitos a controle especial) e na RDC nº 22/2014, além das demais normas sanitárias aplicáveis ao setor.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Durante a vistoria, foram identificadas inconformidades que necessitam de correção para garantir o cumprimento da legislação e a proteção da saúde de usuários e profissionais.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Para a emissão da licença sanitária, o estabelecimento deverá regularizar integralmente as recomendações apontadas, conforme os itens a seguir.</p>
                      </>
                    ) : id === 'clinica-estetica-prudentopolis' ? (
                      <>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">No dia {idData.dataHorario ? format(new Date(idData.dataHorario), "dd/MM/yyyy") : "____/____/____"} a equipe de fiscalização da Vigilância Sanitária Municipal realizou inspeção no estabelecimento {idData.fantasia || "---"}, CNPJ/CPF {idData.cnpj || "---"}, com a finalidade de verificar as condições sanitárias e proceder à renovação da licença sanitária, conforme protocolo.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Considerando que se trata de clínica de estética que realiza procedimentos invasivos, atividade classificada como de risco sanitário, o funcionamento está condicionado à posse de licença sanitária válida, nos termos do Código de Saúde do Estado do Paraná (Lei Estadual nº 13.331/2001) e do Decreto Estadual nº 5.711/2002, com renovação anual.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">A inspeção foi conduzida com base na RDC nº 63/2011 da Anvisa (Boas Práticas de Funcionamento de Serviços de Saúde), na RDC nº 15/2012 (processamento de produtos para saúde) e na RDC nº 222/2018 (gerenciamento de resíduos de serviços de saúde), além das demais normas de biossegurança aplicáveis a procedimentos invasivos.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Durante a vistoria, foram identificadas inconformidades que necessitam de correção para garantir o cumprimento da legislação e a proteção da saúde de usuários, profissionais e pacientes.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Para a emissão da licença sanitária, o estabelecimento deverá regularizar integralmente as recomendações apontadas, conforme os itens a seguir.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">No dia {idData.dataHorario ? format(new Date(idData.dataHorario), "dd/MM/yyyy") : "____/____/____"} a equipe de fiscalização da Vigilância Sanitária Municipal realizou inspeção no estabelecimento {idData.fantasia || "---"}, CNPJ/CPF {idData.cnpj || "---"}, com a finalidade de verificar as condições sanitárias do estabelecimento e proceder à renovação da licença sanitária, conforme protocolo.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Considerando que se trata de atividade classificada como de alto risco sanitário, nos termos da Resolução SESA nº 1024/2020, o funcionamento está condicionado à posse de licença sanitária válida, cuja renovação deve ser realizada anualmente.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">A inspeção foi conduzida de acordo com os critérios legais e técnicos estabelecidos pela RDC 1002/25 da Anvisa, além das demais normas sanitárias e protocolos de biossegurança aplicáveis aos serviços de saúde.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Durante a vistoria realizada, foram identificadas algumas inconformidades que necessitam de correção, a fim de garantir o cumprimento da legislação vigente e assegurar a proteção da saúde de usuários e profissionais.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Dessa forma, para que seja possível a emissão da licença sanitária, o estabelecimento deverá promover a regularização integral das recomendações e ajustes apontados, conforme os itens descritos a seguir.</p>
                      </>
                    )}
                  </div>
              </div>

              <div className="mb-6">
                  <div data-pdf-block className="sub-header-row">3. NÃO CONFORMIDADES DETECTADAS</div>
                  {Object.keys(nonConformities).some(k => nonConformities[k as Criticality].length > 0) ? (
                      (['I', 'N', 'R'] as Criticality[]).map(crit => (
                          nonConformities[crit].length > 0 && (
                              <div key={crit} className="mt-4 first:mt-0 space-y-2">
                                  {(() => {
                                    let lastSectionLabel: string | null = null;
                                    return nonConformities[crit].map((item, idx) => {
                                      const sectionLabel = itemSectionLabel.get(item.id) || 'ITENS ADICIONAIS DO FISCAL';
                                      const showSectionLabel = sectionLabel !== lastSectionLabel;
                                      lastSectionLabel = sectionLabel;
                                      const badge = (
                                          <div className={cn("px-4 py-1.5 border-l-4 font-black text-[9.5pt] uppercase flex items-center gap-2 mb-2", crit === 'I' ? "bg-red-50 border-red-600 text-red-700" : crit === 'N' ? "bg-amber-50 border-amber-500 text-amber-700" : "bg-blue-50 border-blue-600 text-blue-700")}>CRITICIDADE: {crit === 'I' ? "IMPRESCINDÍVEL" : crit === 'N' ? "NECESSÁRIO" : "RECOMENDÁVEL"}</div>
                                      );
                                      const sectionHeader = showSectionLabel ? (
                                          <p className="text-[9pt] font-black uppercase tracking-wider text-zinc-500 mt-3 mb-1.5 pb-1 border-b border-zinc-200">{sectionLabel}</p>
                                      ) : null;
                                      const itemBody = (
                                          <>
                                              <div className="flex items-start gap-3 mb-2"><span className="font-black text-[8pt] text-zinc-900 bg-zinc-50 h-6 px-2 flex items-center justify-center rounded shrink-0 whitespace-nowrap">ITEM {nonConformityNumber.get(item.id)}</span><p className="text-[9.5pt] leading-relaxed text-zinc-800 font-bold flex-1 uppercase">{item.text}</p></div>
                                              {observations[item.id] && (<div className="ml-8 mb-2 p-3 bg-zinc-50 border-l-2 border-zinc-300 rounded-r-lg"><p className="text-[7pt] font-black uppercase text-zinc-400 mb-0.5">Relato do Fiscal:</p><p className="text-[9.5pt] text-slate-600 leading-relaxed italic whitespace-pre-wrap font-sans">{observations[item.id]}</p></div>)}
                                              {itemPhotos[item.id] && itemPhotos[item.id].length > 0 && (
                                                <div className="ml-8 mb-2 grid grid-cols-2 gap-2">
                                                  {itemPhotos[item.id].map((photo, pIdx) => {
                                                    const photoIsDataUrl = photo.url.startsWith('data:');
                                                    const photoSrc = photoIsDataUrl ? photo.url : `/api/proxy-image?url=${encodeURIComponent(photo.url)}`;
                                                    const size = photo.size || 'M';
                                                    return (
                                                      <div key={pIdx} className={cn("border border-zinc-200 rounded-lg overflow-hidden bg-zinc-50", size === 'G' && "col-span-2")}>
                                                        {/* Sem altura fixa nem object-fit — a imagem sempre mostra na
                                                            proporção natural (w-full h-auto), preenchendo a caixa por
                                                            completo, sem cortar e sem sobrar espaço vazio. O tamanho
                                                            P/M/G agora controla a largura máxima, não mais a altura. */}
                                                        <img
                                                          src={photoSrc}
                                                          alt={`Evidência ${pIdx + 1}`}
                                                          crossOrigin={photoIsDataUrl ? undefined : "anonymous"}
                                                          className={cn("block mx-auto w-full h-auto", PHOTO_SIZE_MAX_WIDTH[size])}
                                                        />
                                                        <p className="text-[6.5pt] text-zinc-400 font-bold uppercase px-2 py-1 border-t border-zinc-200">{photo.timestamp} — {photo.location}</p>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                          </>
                                      );
                                      // O rótulo "CRITICIDADE" (no primeiro item) e o subtítulo de área
                                      // (sempre que muda de assunto) vão junto do item num único bloco —
                                      // assim eles nunca ficam sozinhos no fim de uma página, separados dos
                                      // itens que descrevem, quando a quebra de página cai ali.
                                      return (idx === 0 || showSectionLabel) ? (
                                          <div key={item.id} data-pdf-block>
                                              {idx === 0 && badge}
                                              {sectionHeader}
                                              <div className="pl-4 pb-4 border-b border-zinc-100">{itemBody}</div>
                                          </div>
                                      ) : (
                                          <div key={item.id} data-pdf-block className="pl-4 pb-4 border-b border-zinc-100">
                                              {itemBody}
                                          </div>
                                      );
                                    });
                                  })()}
                              </div>
                          )
                      ))
                  ) : <div data-pdf-block className="py-12 text-center border-2 border-dashed border-zinc-100 rounded-2xl mx-2"><CheckCircle2 className="h-10 w-10 text-emerald-100 mx-auto mb-2" /><p className="font-black text-zinc-300 uppercase text-[10pt] tracking-widest italic">Nenhuma irregularidade detectada.</p></div>}
              </div>

              {incluirCME && (
                <div data-pdf-block className="mb-6">
                    <div className="sub-header-row">RECOMENDAÇÕES GERAIS PARA CENTRAL DE MATERIAL ESTERILIZADO (CME)</div>
                    <div className="border border-[#171717] p-4 bg-zinc-50/50 space-y-3">
                      <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900"><strong className="font-black">Etapas do processamento:</strong> O transporte dos dispositivos médicos (DM) destinados ao processamento (material sujo) deve ser realizado em recipiente exclusivo para este fim, devidamente identificado, de material rígido e liso, com sistema de fechamento estanque que impeça vazamentos, e que seja passível de limpeza e desinfecção (Art. 103 da RDC nº 1.002/2025).</p>
                      <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900"><strong className="font-black">Pré-limpeza (DM):</strong> A pré-limpeza deve ser realizada imediatamente após o atendimento (Art. 59), com remoção mecânica da sujidade visível — sangue, saliva e resíduos orgânicos — das superfícies internas e externas dos instrumentais. O objetivo é evitar que os resíduos sequem e dificultem a limpeza posterior.</p>
                      <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900"><strong className="font-black">Limpeza (DM):</strong> É etapa obrigatória antes da esterilização (Art. 61) e deve ser feita de forma manual (Art. 62). Nos casos de DM complexos, é necessário complementar com cuba ultrassônica ou equipamento indicado pelo fabricante (Art. 62, parágrafo único). Os objetos de limpeza não podem ser abrasivos, devem ser mantidos limpos e secos e substituídos quando desgastados (Art. 65). É indicado o uso de escovas específicas para esterilização, evitando itens inadequados como esponjas de louça, que podem danificar os instrumentais, soltar partículas e comprometer sua integridade após a esterilização.</p>
                      <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900"><strong className="font-black">Secagem (DM):</strong> A etapa de secagem deve ser realizada imediatamente após a limpeza, utilizando métodos seguros e validados, como secadoras específicas, ar comprimido medicinal, gás inerte ou materiais absorventes descartáveis não recicláveis, por exemplo papel toalha não reciclado (Art. 70). Após a secagem, os instrumentais devem ser embalados sem demora, evitando que fiquem expostos sobre a bancada, pois isso pode resultar em acúmulo de sujidades, umidade ou contaminação cruzada.</p>
                      <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900"><strong className="font-black">Monitoramento biológico da esterilização:</strong> O uso de indicador biológico deve ser realizado uma vez por semana, garantindo a verificação da eficácia do processo de esterilização (Art. 89 da RDC nº 1.002/2025 – Anvisa). Esse teste deve ser feito em pacote teste no primeiro ciclo de esterilização do dia, assegurando rastreabilidade e confiabilidade dos resultados (atualizar POP).</p>
                      <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900"><strong className="font-black">Monitoramento químico da esterilização:</strong> Todas as cargas submetidas à esterilização devem conter, obrigatoriamente, um pacote teste com integrador químico tipo 5 ou 6 (Art. 90 da RDC nº 1.002/2025 – Anvisa).</p>
                      <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900"><strong className="font-black">Identificação da embalagem:</strong> Todo pacote submetido à esterilização deve ser identificado por etiqueta (Art. 79), aplicada diretamente sobre a embalagem ou na face plástica do papel grau cirúrgico. Quando utilizada caneta específica para esterilização, a identificação pode ser feita diretamente na embalagem de papel grau cirúrgico, desde que a caneta seja aprovada para esse uso e a identificação ocorra antes do processo de esterilização. A etiqueta deve permanecer legível e afixada até o uso (Art. 80) e conter data da esterilização, nome do responsável pelo preparo e lote da carga para rastreabilidade (Art. 81).</p>
                      <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900"><strong className="font-black">Registros do monitoramento da esterilização:</strong> Conforme o Art. 92 da RDC nº 1.002/2025 – Anvisa, os registros do monitoramento do processo de esterilização dos dispositivos médicos devem ser arquivados por um prazo mínimo de 5 anos, garantindo rastreabilidade e a comprovação da eficácia dos ciclos realizados.</p>
                      <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900"><strong className="font-black">Validade da esterilidade:</strong> O prazo deve ser estabelecido com validação científica (Art. 82). Na ausência de validação, aplica-se 6 meses, desde que a embalagem esteja íntegra e armazenada adequadamente (Art. 82, §1º). O prazo deve ser registrado no POP de processamento e a data limite de uso não pode exceder a validade da embalagem (Art. 82, §1º e §2º).</p>
                      <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900"><strong className="font-black">Transporte:</strong> O transporte de DM processado (material pronto para uso) deve ser feito em recipiente fechado, identificado e em condições que garantam a integridade da embalagem e a manutenção da identificação (Art. 104). O transporte tanto do material sujo quanto do limpo deve ser feito em recipiente fechado e identificado para a finalidade.</p>
                    </div>
                </div>
              )}

              <div data-pdf-block className="mb-8">
                  <div className="sub-header-row">4. CONCLUSÃO E PRAZO LEGAL</div>
                  <div className="border border-[#171717] p-4 bg-zinc-50/50 space-y-3">
                    {id === 'farmacia' ? (
                      <>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">O estabelecimento deverá sanar todas as não conformidades apontadas neste relatório no prazo máximo de {idData.prazoDias || '15'} dias, contados a partir do recebimento do documento{idData.baseLegalPrazo ? `, conforme previsto na ${idData.baseLegalPrazo}` : ''}.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">O fato de determinada exigência não constar neste roteiro não exime o estabelecimento de observar as demais obrigações previstas na legislação sanitária vigente, em especial a Lei Federal nº 5.991/1973 e a RDC nº 44/2009 da Anvisa.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Para a concessão ou renovação da licença sanitária, o estabelecimento deve manter, de forma permanente, condições higiênico-sanitárias e estruturais em conformidade com a legislação vigente, além de toda a documentação pertinente ao desenvolvimento de suas atividades.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Caso o estabelecimento não cumpra o prazo estipulado ou não formalize pedido de prorrogação, será lavrado um Termo de Intimação ou de Infração, fundamentado na legislação vigente, determinando a regularização das situações de não conformidade, podendo, nos casos de maior gravidade, resultar em interdição total ou parcial do estabelecimento e/ou apreensão de produtos.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">A Vigilância Sanitária Municipal acompanhará a implementação das medidas corretivas e permanecerá disponível para prestar orientações técnicas. Em caso de dúvidas, estamos à disposição.</p>
                      </>
                    ) : id === 'clinica-estetica-prudentopolis' ? (
                      <>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">O estabelecimento deverá sanar todas as não conformidades apontadas neste relatório no prazo máximo de {idData.prazoDias || '15'} dias, contados a partir do recebimento do documento{idData.baseLegalPrazo ? `, conforme previsto na ${idData.baseLegalPrazo}` : ''}.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">O fato de determinada exigência não constar neste roteiro não exime o estabelecimento de observar as demais obrigações previstas na legislação sanitária vigente, em especial a RDC nº 63/2011, a RDC nº 15/2012 e a RDC nº 222/2018 da Anvisa.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Para a concessão ou renovação da licença sanitária, o estabelecimento deve manter, de forma permanente, condições de biossegurança, esterilização e infraestrutura compatíveis com os procedimentos invasivos realizados, além de toda a documentação técnica exigida.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Caso o estabelecimento não cumpra o prazo estipulado ou não formalize pedido de prorrogação, será lavrado um Termo de Intimação ou de Infração, fundamentado na legislação vigente, determinando a regularização das situações de não conformidade, podendo, nos casos de risco à saúde do paciente ou do trabalhador, resultar em interdição total ou parcial do estabelecimento.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">A Vigilância Sanitária Municipal acompanhará a implementação das medidas corretivas e permanecerá disponível para prestar orientações técnicas. Em caso de dúvidas, estamos à disposição.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">O estabelecimento deverá sanar todas as não conformidades apontadas neste relatório no prazo máximo de {idData.prazoDias || '15'} dias, contados a partir do recebimento do documento{idData.baseLegalPrazo ? `, conforme previsto na ${idData.baseLegalPrazo}` : ''}.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Caso o estabelecimento não cumpra o prazo estipulado ou não formalize pedido de prorrogação, será lavrado um Termo de Intimação ou de Infração, fundamentado na legislação vigente, determinando a regularização das situações de não conformidade.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">A Vigilância Sanitária Municipal acompanhará a implementação das medidas corretivas e permanecerá disponível para prestar orientações técnicas. Havendo necessidade devidamente justificada, o estabelecimento poderá solicitar prorrogação dos prazos, a qual será analisada e deliberada conforme a legislação aplicável.</p>
                        <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Em caso de dúvidas, estamos à disposição.</p>
                      </>
                    )}
                  </div>
              </div>

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
                {config.footerRichText && <div dangerouslySetInnerHTML={{ __html: config.footerRichText }} />}
                <p data-pdf-pagenum className="mt-1">Página 1 de 1</p>
              </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto w-full p-4 md:p-8 space-y-6 md:space-y-8 pb-40 font-sans">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 md:p-6 rounded-[2rem] border border-slate-200 shadow-xl no-print">
        <div className="flex items-center gap-4">
          <div className="p-4 rounded-2xl bg-opacity-10 bg-emerald-500 text-emerald-600"><ClipboardList className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">{checklist.titulo}</h1>
            <p className="text-[11px] text-zinc-400 font-black uppercase tracking-[0.2em] mt-1">{checklist.subtitulo}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
            {lastAutoSave && (<div className="hidden sm:flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100"><Cloud className="h-3 w-3" /><span className="text-[10px] font-black uppercase">Salvo às {format(lastAutoSave, "HH:mm")}</span></div>)}
            <button onClick={handleDeleteDraft} className="h-12 w-12 rounded-xl text-rose-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-all">{isDeletingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-5 w-5" />}</button>
            <Button onClick={() => handleSaveDraft()} disabled={isSavingDraft} variant="outline" className="h-12 rounded-xl font-black uppercase text-[11px] tracking-widest gap-2 border-zinc-200 shadow-sm">{isSavingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
        </div>
      </header>

      <div className="space-y-8 no-print">
          <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-5">
            <div className="space-y-3">
                <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-zinc-400 flex items-center gap-3"><Building2 className="h-4 w-4 text-primary" /> Estabelecimento</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                   <div className="space-y-1.5 md:col-span-2"><Label className="text-[10px] font-black uppercase text-zinc-500">Razão Social</Label><Textarea value={idData.fantasia} onChange={e => setIdData({...idData, fantasia: e.target.value.toUpperCase()})} className="min-h-[40px] h-10 rounded-xl bg-slate-50 border-none font-bold uppercase resize-none py-2" /></div>
                   <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-zinc-500">Telefone</Label><Input value={idData.telefone} onChange={e => setIdData({...idData, telefone: e.target.value})} placeholder="(00) 00000-0000" className="h-10 rounded-xl bg-slate-50 border-none font-bold" /></div>
                   <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-zinc-500">CNPJ do Estabelecimento</Label><div className="flex gap-2"><Input value={idData.cnpj} onChange={e => setIdData({...idData, cnpj: e.target.value})} placeholder="00.000.000/0000-00" className="h-10 rounded-xl bg-slate-50 border-none font-bold" /><Button onClick={handleCnpjLookup} disabled={isSearchingCnpj} variant="secondary" className="h-10 w-10 rounded-xl shrink-0">{isSearchingCnpj ? <Loader2 className="animate-spin h-4 w-4" /> : <Search className="h-4 w-4" />}</Button></div></div>
                   <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-zinc-500">E-mail</Label><Input type="email" value={idData.email} onChange={e => setIdData({...idData, email: e.target.value})} placeholder="contato@estabelecimento.com" className="h-10 rounded-xl bg-slate-50 border-none font-bold" /></div>
                   <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-zinc-500">Bairro</Label><Input value={idData.bairro} onChange={e => setIdData({...idData, bairro: e.target.value.toUpperCase()})} className="h-10 rounded-xl bg-slate-50 border-none font-bold uppercase" /></div>
                   <div className="space-y-1.5 md:col-span-3"><Label className="text-[10px] font-black uppercase text-zinc-500">Endereço</Label><Input value={idData.endereco} onChange={e => setIdData({...idData, endereco: e.target.value.toUpperCase()})} className="h-10 rounded-xl bg-slate-50 border-none font-bold uppercase" /></div>
                </div>

                {foundCnaes.length > 0 && (
                  <div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl space-y-4">
                    <div className="flex items-center justify-between px-1"><Label className="text-[11px] font-black uppercase text-blue-600 tracking-widest flex items-center gap-2"><ListFilter className="h-3 w-3" /> Selecionar Atividades (CNAE)</Label></div>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                      {foundCnaes.map((c, i) => {
                        // Antes comparava idData.cnae (sempre salvo em MAIÚSCULAS)
                        // com `c` no formato original da API — como as caixas
                        // quase nunca batiam, a seleção nunca "desmarcava" e cada
                        // clique só ia empilhando o mesmo CNAE de novo.
                        const cUpper = c.toUpperCase();
                        const items = (idData.cnae || "").split(';').map((s) => s.trim()).filter(Boolean);
                        const isSelected = items.includes(cUpper);
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              const newItems = isSelected ? items.filter((item) => item !== cUpper) : [...items, cUpper];
                              setIdData({ ...idData, cnae: newItems.join('; ') });
                            }}
                            className={cn("w-full text-left p-4 rounded-2xl text-[11px] font-bold uppercase transition-all border flex items-center gap-4", isSelected ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-blue-100 text-blue-500")}
                          >
                            {isSelected ? <Check className="h-4 w-4" /> : <div className="h-4 w-4 rounded border border-blue-200" />}
                            <span className="flex-1 leading-tight">{c}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>

            <div className="h-px bg-slate-100" />

            <div className="space-y-3">
                <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-zinc-400 flex items-center gap-3"><Building2 className="h-4 w-4 text-primary" /> Responsáveis e Data da Inspeção</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                   <div className="space-y-1.5 md:col-span-2"><Label className="text-[10px] font-black uppercase text-zinc-500">Responsável Legal (acompanhou a inspeção)</Label><Input value={idData.responsavel} onChange={e => setIdData({...idData, responsavel: e.target.value.toUpperCase()})} className="h-10 rounded-xl bg-slate-50 border-none font-bold uppercase" /></div>
                   <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-zinc-500">CPF do Responsável Legal</Label><Input value={idData.responsavelCpf} onChange={e => setIdData({...idData, responsavelCpf: e.target.value})} placeholder="000.000.000-00" className="h-10 rounded-xl bg-slate-50 border-none font-bold" /></div>
                   <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-zinc-500">Responsável Técnico</Label><Input value={idData.responsavelTecnico} onChange={e => setIdData({...idData, responsavelTecnico: e.target.value.toUpperCase()})} placeholder="NOME DO RESPONSÁVEL TÉCNICO" className="h-10 rounded-xl bg-slate-50 border-none font-bold uppercase" /></div>
                   <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-zinc-500">Registro Profissional (ex.: CRO)</Label><Input value={idData.responsavelTecnicoRegistro} onChange={e => setIdData({...idData, responsavelTecnicoRegistro: e.target.value})} placeholder="CRO-PR 00000" className="h-10 rounded-xl bg-slate-50 border-none font-bold" /></div>
                   <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-zinc-500">Data e Horário da Inspeção</Label><Input type="datetime-local" value={idData.dataHorario} onChange={e => setIdData({...idData, dataHorario: e.target.value})} className="h-10 rounded-xl bg-slate-50 border-none font-bold" /></div>
                </div>
            </div>

            <div className="h-px bg-slate-100" />

            <div className="space-y-3">
                <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-zinc-400 flex items-center gap-3"><Clock className="h-4 w-4 text-primary" /> Prazo para Regularização e Anexos</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                   <div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-zinc-500">Prazo (dias)</Label><Input type="number" min="1" value={idData.prazoDias} onChange={e => setIdData({...idData, prazoDias: e.target.value})} className="h-10 rounded-xl bg-slate-50 border-none font-bold" /></div>
                   <div className="space-y-1.5 md:col-span-2"><Label className="text-[10px] font-black uppercase text-zinc-500">Base Legal do Prazo</Label><Input value={idData.baseLegalPrazo} onChange={e => setIdData({...idData, baseLegalPrazo: e.target.value})} placeholder="Ex.: Lei Municipal nº 0000/0000" className="h-10 rounded-xl bg-slate-50 border-none font-bold" /></div>
                </div>
                <label className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 cursor-pointer">
                    <Checkbox checked={incluirCME} onCheckedChange={(v) => setIncluirCME(!!v)} />
                    <span className="text-[11px] font-bold text-zinc-600">Incluir no relatório as recomendações gerais para Central de Material Esterilizado (CME)</span>
                </label>
            </div>

            <div className="h-px bg-slate-100" />

            <div className="space-y-10">
              <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-zinc-400 flex items-center gap-3"><FileSearch className="h-4 w-4 text-primary" /> Avaliação Técnica (SESA)</h2>
              {checklist.secoes.map((secao) => (
                <div key={secao.id} className="space-y-6">
                  <h3 className="text-sm font-black text-slate-900 border-l-4 border-primary pl-4 uppercase">{secao.titulo}</h3>
                  <div className="space-y-4">
                    {secao.itens.map((item) => (
                      item.isHeader ? (
                        <p key={item.id} className="pt-2 text-[11px] font-black uppercase tracking-widest text-zinc-500">{item.text}</p>
                      ) : (
                      <div key={item.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-5">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                          <div className="flex-1 space-y-2"><div className="flex items-center gap-3"><Badge className={cn("text-[10px] font-black uppercase px-2", item.crit === 'I' ? "bg-red-100 text-red-600" : item.crit === 'N' ? "bg-amber-100 text-amber-600" : "bg-sky-100 text-sky-600")}>{item.crit === 'I' ? "IMPRESCINDÍVEL" : item.crit === 'N' ? "NECESSÁRIO" : "RECOMENDÁVEL"}</Badge><span className="text-[11px] font-black text-slate-400">ITEM {item.id}</span></div><p className="text-[15px] font-bold text-slate-800 leading-relaxed uppercase">{item.text}</p></div>
                          <RadioGroup value={answers[item.id]} onValueChange={(v: any) => { setAnswers(prev => ({ ...prev, [item.id]: v })); handleSaveDraft(false); }} className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-slate-200">{['SIM', 'NAO', 'ND'].map(opt => (<label key={opt} className={cn("flex items-center justify-center h-10 px-5 rounded-xl text-[11px] font-black cursor-pointer transition-all", answers[item.id] === opt ? "bg-primary text-white" : "text-slate-400 hover:bg-slate-100")}><RadioGroupItem value={opt} className="sr-only" /> {opt}</label>))}</RadioGroup>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-200/50">
                          <button type="button" onClick={() => setShowObsInput(prev => ({ ...prev, [item.id]: !prev[item.id] }))} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase transition-all", (observations[item.id] || showObsInput[item.id]) ? "bg-primary/10 text-primary" : "text-slate-400")}><MessageSquare className="h-3.5 w-3.5" /> {showObsInput[item.id] ? "Fechar Nota" : observations[item.id] ? "Ver Nota" : "Observação"}</button>
                          <label className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase transition-all cursor-pointer", (itemPhotos[item.id]?.length ?? 0) > 0 ? "bg-primary/10 text-primary" : "text-slate-400 hover:bg-slate-100")}>
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
                              <div key={pIdx} className={cn("relative group/photo rounded-xl overflow-hidden border border-slate-200 bg-white", size === 'G' && "col-span-2")}>
                                <img src={photo.url} alt={`Evidência ${pIdx + 1}`} className={cn("block mx-auto w-full h-auto", PHOTO_SIZE_MAX_WIDTH[size])} />
                                <button type="button" onClick={() => handleRemovePhoto(item.id, pIdx)} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/photo:opacity-100 transition-opacity"><X className="h-3.5 w-3.5" /></button>
                                <div className="absolute bottom-1 left-1 flex gap-0.5 opacity-0 group-hover/photo:opacity-100 transition-opacity">
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
                        {showObsInput[item.id] && (<div className="space-y-3 animate-in fade-in slide-in-from-top-2"><Label className="text-[10px] font-black text-primary uppercase">Relato de Irregularidade</Label><Textarea value={observations[item.id] || ""} onChange={e => { setObservations(prev => ({ ...prev, [item.id]: e.target.value })); }} placeholder="Descreva a situação..." spellCheck autoCorrect="on" autoCapitalize="sentences" className="min-h-[100px] rounded-2xl bg-white border-slate-200 text-sm font-medium" /><Button onClick={() => handleSaveObservation(item.id)} disabled={savingObsItem === item.id} size="sm" className="h-9 px-5 rounded-xl bg-primary text-white font-black text-[10px] uppercase gap-2">{savingObsItem === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar</Button></div>)}
                      </div>
                      )
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="h-px bg-slate-100" />

            <div className="space-y-6">
              <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-zinc-400 flex items-center gap-3"><Plus className="h-4 w-4 text-primary" /> Não Conformidade Adicional</h2>
              <p className="text-xs text-zinc-400 -mt-4">Para fatos constatados que não estão previstos em nenhum item do roteiro oficial — entra no relatório junto com os demais, ao final do grupo de criticidade escolhido.</p>
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                <Textarea
                  value={newCustomText}
                  onChange={e => setNewCustomText(e.target.value)}
                  placeholder="Descreva o fato constatado..."
                  className="min-h-[80px] rounded-2xl bg-white border-slate-200 text-sm font-medium"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <RadioGroup value={newCustomCrit} onValueChange={(v: any) => setNewCustomCrit(v)} className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-slate-200">
                    {(['I', 'N', 'R'] as Criticality[]).map(c => (
                      <label key={c} className={cn("flex items-center justify-center h-10 px-4 rounded-xl text-[10px] font-black cursor-pointer transition-all", newCustomCrit === c ? "bg-primary text-white" : "text-slate-400 hover:bg-slate-100")}>
                        <RadioGroupItem value={c} className="sr-only" /> {c === 'I' ? 'IMPRESCINDÍVEL' : c === 'N' ? 'NECESSÁRIO' : 'RECOMENDÁVEL'}
                      </label>
                    ))}
                  </RadioGroup>
                  <Button type="button" onClick={handleSaveCustomItem} disabled={!newCustomText.trim()} className="h-10 px-6 rounded-xl bg-primary text-white font-black text-[11px] uppercase gap-2">
                    {editingCustomItemId ? <><Pencil className="h-4 w-4" /> Salvar Alteração</> : <><Plus className="h-4 w-4" /> Adicionar</>}
                  </Button>
                  {editingCustomItemId && (
                    <Button type="button" onClick={handleCancelEditCustomItem} variant="ghost" className="h-10 px-4 rounded-xl text-slate-400 font-black text-[11px] uppercase">
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>

              {customItems.length > 0 && (
                <div className="space-y-4">
                  {customItems.map((item) => (
                    <div key={item.id} className={cn("p-6 bg-slate-50 rounded-3xl border space-y-5", editingCustomItemId === item.id ? "border-primary/40 ring-2 ring-primary/20" : "border-slate-100")}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <Badge className={cn("text-[10px] font-black uppercase px-2", item.crit === 'I' ? "bg-red-100 text-red-600" : item.crit === 'N' ? "bg-amber-100 text-amber-600" : "bg-sky-100 text-sky-600")}>{item.crit === 'I' ? "IMPRESCINDÍVEL" : item.crit === 'N' ? "NECESSÁRIO" : "RECOMENDÁVEL"}</Badge>
                          <p className="text-[15px] font-bold text-slate-800 leading-relaxed">{item.text}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button type="button" onClick={() => handleEditCustomItem(item)} variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-400 hover:bg-slate-200"><Pencil className="h-4 w-4" /></Button>
                          <Button type="button" onClick={() => handleRemoveCustomItem(item.id)} variant="ghost" size="icon" className="h-8 w-8 rounded-full text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-200/50">
                        <button type="button" onClick={() => setShowObsInput(prev => ({ ...prev, [item.id]: !prev[item.id] }))} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase transition-all", (observations[item.id] || showObsInput[item.id]) ? "bg-primary/10 text-primary" : "text-slate-400")}><MessageSquare className="h-3.5 w-3.5" /> {showObsInput[item.id] ? "Fechar Nota" : observations[item.id] ? "Ver Nota" : "Observação"}</button>
                        <label className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase transition-all cursor-pointer", (itemPhotos[item.id]?.length ?? 0) > 0 ? "bg-primary/10 text-primary" : "text-slate-400 hover:bg-slate-100")}>
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
                            <div key={pIdx} className={cn("relative group/photo rounded-xl overflow-hidden border border-slate-200 bg-white", size === 'G' && "col-span-2")}>
                              <img src={photo.url} alt={`Evidência ${pIdx + 1}`} className={cn("block mx-auto w-full h-auto", PHOTO_SIZE_MAX_WIDTH[size])} />
                              <button type="button" onClick={() => handleRemovePhoto(item.id, pIdx)} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/photo:opacity-100 transition-opacity"><X className="h-3.5 w-3.5" /></button>
                              <div className="absolute bottom-1 left-1 flex gap-0.5 opacity-0 group-hover/photo:opacity-100 transition-opacity">
                                {(['P', 'M', 'G'] as PhotoSize[]).map(s => (
                                  <button key={s} type="button" onClick={() => handleSetPhotoSize(item.id, pIdx, s)} className={cn("h-6 w-6 rounded-md text-[9px] font-black flex items-center justify-center transition-colors", size === s ? "bg-primary text-white" : "bg-black/60 text-white/80 hover:bg-black/80")}>{s}</button>
                                ))}
                              </div>
                            </div>
                            );
                          })}
                        </div>
                      )}
                      {showObsInput[item.id] && (<div className="space-y-3 animate-in fade-in slide-in-from-top-2"><Label className="text-[10px] font-black text-primary uppercase">Relato de Irregularidade</Label><Textarea value={observations[item.id] || ""} onChange={e => setObservations(prev => ({ ...prev, [item.id]: e.target.value }))} placeholder="Descreva a situação..." spellCheck autoCorrect="on" autoCapitalize="sentences" className="min-h-[100px] rounded-2xl bg-white border-slate-200 text-sm font-medium" /><Button onClick={() => handleSaveObservation(item.id)} disabled={savingObsItem === item.id} size="sm" className="h-9 px-5 rounded-xl bg-primary text-white font-black text-[10px] uppercase gap-2">{savingObsItem === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar</Button></div>)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="h-px bg-slate-100" />

            <div className="space-y-10 pt-4">
                <div className="bg-slate-900 text-white p-8 rounded-[3rem] shadow-2xl space-y-8">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4"><div className="flex items-center gap-3"><div className="p-2.5 rounded-2xl bg-primary/20"><ClipboardList className="h-5 w-5 text-primary" /></div><div><h3 className="text-xl font-black uppercase italic tracking-tighter">Resumo da Vistoria</h3></div></div><Badge className="bg-primary text-white border-none text-[10px] font-black px-4 h-8">{Object.keys(answers).length} ITENS</Badge></div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1"><p className="text-[10px] font-black uppercase text-white/60">Assinaturas</p><SelecionarAutoridadeParaFormulario onSelect={(f) => { setFiscais(prev => [...prev, f]); handleSaveDraft(false); }} /></div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {fiscais.map((f, i) => (<Button key={i} onClick={() => setSigningFiscalIndex(i)} variant="outline" className={cn("h-14 rounded-2xl justify-between px-5 font-bold text-[10px] uppercase border-white/10 bg-white/5 text-white", f.signature && "border-emerald-500/50 bg-emerald-500/10")}><span className="truncate">{(f as any).nome}</span>{f.signature ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <PenTool className="h-4 w-4 text-white/20" />}</Button>))}
                            <Button onClick={() => setSigningResponsavel(true)} variant="outline" className={cn("h-14 rounded-2xl justify-between px-5 font-bold text-[10px] uppercase border-white/10 bg-white/5 text-white", idData.signatureResponsavel && "border-emerald-500/50 bg-emerald-500/10")}><span className="truncate">{idData.responsavel || "ASSINAR RESPONSÁVEL"}</span>{idData.signatureResponsavel ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <PenTool className="h-4 w-4 text-white/20" />}</Button>
                        </div>
                    </div>
                </div>
            </div>
          </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-[100] no-print px-4 pb-8 pt-4 bg-white/90 backdrop-blur-xl border-t border-zinc-200 shadow-[0_-25px_50px_rgba(0,0,0,0.15)]">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-4">
              <Button type="button" onClick={() => handleSaveDraft()} disabled={isSavingDraft} variant="outline" className="w-full sm:w-auto h-16 px-10 rounded-2xl border-zinc-300 text-zinc-600 font-black uppercase text-[11px] tracking-widest gap-3 shadow-md">{isSavingDraft ? <Loader2 className="animate-spin h-5 w-5" /> : <Save className="h-5 w-5" />} Salvar Rascunho</Button>
              <Button type="button" onClick={async () => { await handleSaveDraft(false); setView('report'); window.scrollTo(0,0); }} disabled={Object.keys(answers).length === 0} className="flex-1 w-full h-16 bg-primary hover:bg-primary/90 text-white gap-4 rounded-2xl shadow-2xl transition-all active:scale-95"><FileText className="h-6 w-6" /><div className="flex flex-col items-start leading-none text-left"><span className="text-lg font-black uppercase tracking-tighter italic">VISUALIZAR RELATÓRIO</span><span className="text-[8px] font-bold opacity-70 uppercase tracking-widest mt-0.5">Sincronizar e gerar PDF</span></div></Button>
          </div>
      </div>

      <Dialog open={isResumeDialogOpen} onOpenChange={setIsResumeDialogOpen}>
        <DialogContent className="rounded-[2.5rem] sm:max-w-md border-none shadow-2xl bg-white overflow-hidden p-0">
            <DialogHeader className="p-8 bg-zinc-900 text-white border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-primary/20 text-primary"><History className="h-6 w-6" /></div>
                    <div>
                        <DialogTitle className="text-xl font-black uppercase italic tracking-tighter">Retomar Vistoria?</DialogTitle>
                        <DialogDescription className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mt-1">Existe um roteiro em andamento seu</DialogDescription>
                    </div>
                </div>
            </DialogHeader>
            <div className="p-8 space-y-4">
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                     <p className="text-[9px] font-black uppercase text-zinc-400 tracking-widest">Estabelecimento:</p>
                     <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold text-slate-800 uppercase truncate">{draftToResume?.titulo || "VISTORIA SEM NOME"}</span>
                     </div>
                     <p className="text-[10px] font-medium text-slate-500 italic">Preenchido até às {draftToResume?.updatedAt ? format(new Date(draftToResume.
                      
                     updatedAt), "HH:mm") : "..."}</p>
                </div>
                <p className="text-[11px] font-bold text-slate-500 text-center leading-relaxed">Deseja continuar exatamente de onde parou ou iniciar um novo formulário?</p>
            </div>
            <DialogFooter className="p-8 bg-zinc-50 border-t border-zinc-100 flex gap-3">
                <Button variant="ghost" onClick={handleStartFresh} className="flex-1 h-12 rounded-xl font-black uppercase text-[10px] text-rose-500 hover:bg-rose-50 gap-2"><Eraser className="h-3.5 w-3.5" /> Novo Zero</Button>
                <Button onClick={handleResumeDraft} className="flex-[2] h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-black text-[10px] uppercase tracking-widest shadow-xl">Retomar Agora</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <SignaturePad isOpen={signingFiscalIndex !== null} onOpenChange={(open) => !open && setSigningFiscalIndex(null)} onSave={(sig) => { if (signingFiscalIndex !== null) { const updated = [...fiscais]; updated[signingFiscalIndex] = { ...updated[signingFiscalIndex], signature: sig }; setFiscais(updated); handleSaveDraft(false); } }} title="Assinatura Fiscal" />
      <SignaturePad isOpen={signingResponsavel} onOpenChange={setSigningResponsavel} onSave={(sig) => { setIdData({...idData, signatureResponsavel: sig}); handleSaveDraft(false); }} title="Ciência Inspecionado" />
    </div>
  )
}
