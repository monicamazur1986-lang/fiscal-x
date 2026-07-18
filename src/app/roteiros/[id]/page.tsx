
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
  Clock
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
import { polishObservation } from "@/ai/flows/polish-observation"
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

// Roteiro próprio de Prudentópolis, transcrito do "Guia de Inspeção
// Consultórios/Clínicas Odontológicas" fornecido pela usuária — não existe
// classificação de criticidade (I/N/R) na fonte original, então todos os
// itens entram como 'N' (Necessário) por padrão; ajuste item a item depois
// se algum precisar de outra criticidade.
const odontologiaPrudentopolisChecklist: ChecklistData = {
  titulo: 'Guia de Inspeção Consultórios/Clínicas Odontológicas',
  subtitulo: 'Roteiro próprio de Prudentópolis — RDC 063/11 e Resoluções SESA',
  categoria: 'SAÚDE',
  lei: 'RDC nº 063/11 (ANVISA) e Resoluções SESA/PR',
  especialidade: 'ODONTOLOGIA',
  secoes: [
    {
      id: 'pg-doc',
      titulo: '1. DOCUMENTOS/REGISTROS',
      itens: [
        { id: '1', crit: 'N', text: 'Projeto Básico de Arquitetura atualizado, adequado conforme legislação sanitária, aprovado pela Vigilância Sanitária (VISA). Base legal: Art. 23, I – RDC 063/11; Art. 9º, §1º, 2º e 3º – Res. SESA 1034/20.' },
        { id: '2', crit: 'N', text: 'Certificado de controle integrado de pragas atualizado, emitido por empresa legalmente habilitada. Base legal: Art. 23, VIII – RDC 063/11; Art. 320 – Dec. Est. nº 5.711/02.' },
        { id: '3', crit: 'N', text: 'Certificado ou registro de limpeza e desinfecção de reservatório d\'água, emitido por empresa legalmente habilitada. Base legal: Art. 39, §1º – RDC 063/11; Art. 187 e 191 – Dec. Est. nº 5.711/02.' },
        { id: '4', crit: 'N', text: 'Plano de Manutenção, Operação e Controle (PMOC) do sistema de climatização de ar ou registro de manutenção e limpeza do equipamento de climatização. Base legal: Lei Federal nº 13.589/18; Art. 5º e 6º, "a" – Portaria nº 3.523/98.' },
        { id: '5', crit: 'N', text: 'Plano de Gerenciamento de Resíduos de Serviços de Saúde (PGRSS) atualizado e aprovado. Base legal: Art. 226 – Dec. Est. nº 5.711/02.' },
        { id: '6', crit: 'N', text: 'Contrato e/ou certificado de coleta, transporte e destinação de resíduos de serviços de saúde. Base legal: Art. 11 e Art. 23, V – RDC 063/11.' },
        { id: '7', crit: 'N', text: 'Normas, procedimentos e rotinas técnicas escritas e atualizadas de todos os processos de trabalho (POP\'s) em local de fácil acesso a toda a equipe. Base legal: Art. 23, XVIII e Art. 51 – RDC 063/11.' },
        { id: '8', crit: 'N', text: 'Programa de manutenção preventiva periódica dos equipamentos odontológicos e respectivos registros. Base legal: Art. 23, IX – RDC 063/11; Art. 426, § Único – Dec. Est. nº 5.711/02.' },
        { id: '9', crit: 'N', text: '(*) Responsável técnico: Certificado de inscrição no Conselho de Classe (CNPJ) e Certificado de Responsabilidade Técnica (CRT). Base legal: Art. 14 – RDC 063/11; Art. 422 – Dec. Est. nº 5.711/02.' },
      ]
    },
    {
      id: 'pg-trab',
      titulo: '2. CONDIÇÕES DE TRABALHO/SAÚDE DO TRABALHADOR',
      itens: [
        { id: '10', crit: 'N', text: 'Certificados de habilitação profissional compatíveis com as funções desempenhadas pela Equipe de Saúde Bucal (ASB/TSB) e registros no Conselho de Classe. Base legal: Cap. VII, 16 – Res. SESA 496/05.' },
        { id: '11', crit: 'N', text: '(*) PGR, PCMSO e ASO\'s. Base legal: Art. 23, II – RDC 063/11.' },
        { id: '12', crit: 'N', text: 'Registro de entrega de EPI\'s adequado ao risco, em número suficiente e compatível com as atividades desenvolvidas pelos trabalhadores. Base legal: Art. 47 – RDC 063/11; Art. 122 – Dec. Est. nº 5.711/02.' },
        { id: '13', crit: 'N', text: 'Registros e/ou certificados de Programa de Educação Continuada de seus profissionais antes do início das atividades e de forma permanente. Base legal: Art. 32, §Único e Art. 33 – RDC 063/11.' },
        { id: '14', crit: 'N', text: 'Rotina escrita de fluxo de encaminhamento do trabalhador no caso de acidentes com perfurocortantes/materiais biológicos e notificação de acidentes de trabalho. Base legal: Itens 4.4 e 4.6 – Res. SESA 0414/01.' },
        { id: '15', crit: 'N', text: 'Registro de imunização da Equipe de Saúde Bucal para: Hepatite B, Tétano, Difteria, Caxumba, Rubéola (mulheres em idade fértil), Varicela e Sarampo. Base legal: Cap. XVI, 63.2 – Res. SESA 496/05.' },
        { id: '16', crit: 'N', text: 'Fornecida aos trabalhadores água potável e fresca, através de bebedouro de jato inclinado ou outro dispositivo equivalente. Base legal: Art. 136 – Dec. Est. nº 5.711/02.' },
      ]
    },
    {
      id: 'pg-infra',
      titulo: '3. INFRAESTRUTURA E AMBIENTES DE APOIO',
      itens: [
        { id: '17', crit: 'N', text: 'Estrutura física em conformidade com o projeto aprovado, inclusive em caso de reforma. Base legal: Item 3.2 – Res. SESA 0414/01.' },
        { id: '18', crit: 'N', text: 'Ambientes externos e internos em boas condições de limpeza, organização e conservação. Base legal: Item 3.3 – Res. SESA 0414/01.' },
        { id: '19', crit: 'N', text: 'Rede elétrica sem fios expostos e suficiente para os equipamentos existentes. Base legal: Item 6.7 – Res. SESA 0414/01.' },
        { id: '20', crit: 'N', text: 'Instalação hidráulica adequada, sem tubulação aparente e ausência de vazamentos. Base legal: Item 6.8 – Res. SESA 0414/01.' },
        { id: '21', crit: 'N', text: 'Piso e paredes de material liso, resistente, lavável e em perfeitas condições de limpeza. Base legal: Itens 7.4 e 7.5 – Res. SESA 0414/01.' },
        { id: '22', crit: 'N', text: 'Forro/teto liso, livre de trincas, rachaduras e umidade. Base legal: Item 7.6 – Res. SESA 0414/01.' },
        { id: '23', crit: 'N', text: 'Mobiliários e equipamentos em bom estado de conservação e higiene. Base legal: Item 7.15 – Res. SESA 0414/01.' },
        { id: '24-h', crit: 'N', text: 'Área de atendimento.', isHeader: true },
        { id: '24', crit: 'N', text: 'Iluminação e ventilação natural e/ou artificial. Quando houver ventilação artificial manter rotina por escrito da limpeza dos filtros do sistema. Base legal: Itens 7.8, 7.9 e 7.10 – Res. SESA 0414/01.' },
        { id: '25', crit: 'N', text: 'Lavatório exclusivo para higienização das mãos dos profissionais com fechamento sem o contato das mãos, provido de sabão líquido, de anti-séptico, papel-toalha e coletor de lixo com tampa de acionamento por pedal. Base legal: Cap. VIII, 20.1 – Res. SESA 496/05; Item 7.13 – Res. SESA 0414/01; Item 32.10.15 – NR 32.' },
        { id: '26', crit: 'N', text: 'Consultórios isolados: na mesma área, área suja separada por barreira técnica da área limpa. Os lavatórios de lavagem de artigos (cuba profunda) e de mãos devem ter distância mínima de 1 m ou 40 cm de altura entre eles. Base legal: Cap. VIII, 21.2 – Res. SESA 496/05; Itens 7.13, 7.14 e 8.6 – Res. SESA 0414/01.' },
        { id: '27-h', crit: 'N', text: '(*) CME.', isHeader: true },
        { id: '27', crit: 'N', text: 'Simplificada: área suja (lavagem e descontaminação) com guichê de passagem para a área limpa (preparo, esterilização e armazenamento). Salas anexas. Base legal: Cap. VIII, 21.1 – Res. SESA 496/05.' },
        { id: '28', crit: 'N', text: 'Completa: vestiário exclusivo para área suja; lavatório para mãos na área de recepção dos artigos limpos; armazenamento dos materiais com controle de temperatura e umidade; distribuição dos artigos através de guichê. Base legal: Cap. VIII, 22 – Res. SESA 496/05; Itens 8.10.4, 8.11.1 e 8.14 – Res. SESA 0414/01.' },
        { id: '29', crit: 'N', text: 'As portas e guichês são mantidos fechados. Base legal: Item 8.5 – Res. SESA 0414/01.' },
        { id: '30', crit: 'N', text: 'Área suja: Iluminação e ventilação natural com janelas teladas (comunicação direta com área externa) ou possuir sistema de ventilação artificial. Base legal: Itens 8.7 e 8.10.1 – Res. SESA 0414/01.' },
        { id: '31-h', crit: 'N', text: 'Sanitários.', isHeader: true },
        { id: '31', crit: 'N', text: 'Vaso sanitário, lavatório, coletor de lixo com tampa, toalheiro de papel e sabonete líquido em condições perfeitas de higiene, com ventilação natural e/ou artificial. Base legal: Cap. VIII, 27 – Res. SESA 496/05.' },
        { id: '32', crit: 'N', text: 'Separado por sexo quando houver mais de 10 pessoas simultaneamente e sanitário para deficiente físico (após publicação Res. SESA 496/05). Base legal: Cap. VIII, 27.5 – Res. SESA 496/05.' },
        { id: '33', crit: 'N', text: 'Quando houver comunicação com área de trabalho, a porta do sanitário deverá apresentar fechamento automático. Base legal: Cap. VIII, 27.6 – Res. SESA 496/05.' },
        { id: '34', crit: 'N', text: 'Copa: local específico caso os trabalhadores realizem refeições no estabelecimento. Base legal: Art. 137 – Dec. Est. nº 5.711/02.' },
        { id: '35', crit: 'N', text: 'DML: Depósito de Material de Limpeza (DML) com tanque. Base legal: Cap. VIII, 28 – Res. SESA 496/05.' },
        { id: '36', crit: 'N', text: 'Compressor: instalado fora da área do consultório ou com proteção acústica, de forma que a captação do ar ambiente seja limpo, frio e seco através de tubulação apropriada. Base legal: Cap. IX, 37.7 – Res. SESA 496/05.' },
      ]
    },
    {
      id: 'pg-limpeza',
      titulo: '4. ROTINAS DE LIMPEZA/DESINFECÇÃO E PROCESSAMENTO',
      itens: [
        { id: '37', crit: 'N', text: 'EPI\'s: luvas para procedimentos/cirúrgicas, sobre luvas e luvas grossas de borracha para limpeza de superfícies e dos artigos; avental gola padre; avental plástico/impermeável para limpeza dos artigos; máscara; óculos de proteção; gorro; e sapatos fechados. Base legal: Cap. IX, 35 – Res. SESA 496/05; Itens 4.1 e 4.2 – Res. SESA 0414/01.' },
        { id: '38-h', crit: 'N', text: 'Desinfecção de superfícies (POP).', isHeader: true },
        { id: '38', crit: 'N', text: 'Limpeza após cada atendimento e no final do dia, com água e detergente neutro, antes de realizar a desinfecção química. Base legal: Itens 7.17 e 7.28 – Res. SESA 0414/01.' },
        { id: '39', crit: 'N', text: 'Recomendável o uso de barreiras descartáveis tipo filme plástico de PVC transparente e realizar a troca após cada paciente. Base legal: Itens 7.17 e 7.28 – Res. SESA 0414/01.' },
        { id: '40', crit: 'N', text: 'As soluções desinfetantes e antissépticas são identificadas, trocadas periodicamente e estão dentro do prazo de validade. Base legal: Item 7.25 – Res. SESA 0414/01.' },
        { id: '41-h', crit: 'N', text: 'Limpeza dos artigos (POP).', isHeader: true },
        { id: '41', crit: 'N', text: 'O transporte dos artigos contaminados é realizado em recipientes fechados até a área suja. Base legal: Item 8.9 – Res. SESA 0414/01.' },
        { id: '42', crit: 'N', text: 'Imediatamente após seu uso e, na impossibilidade, são imersos em água. Base legal: Item 7.29.4 – Res. SESA 0414/01.' },
        { id: '43', crit: 'N', text: 'Realiza a limpeza, enxágue em água corrente, secagem e inspeção para detecção de resíduos e pontos de corrosão dos artigos. Base legal: Item 7.29.5 – Res. SESA 0414/01.' },
        { id: '44-h', crit: 'N', text: 'Esterilização dos artigos (POP).', isHeader: true },
        { id: '44', crit: 'N', text: 'Realiza monitoramento biológico semanalmente. Base legal: Cap. XI, 50 – Res. SESA 496/05.' },
        { id: '45', crit: 'N', text: 'Realiza monitoramento químico externo, em cada embalagem, e interno em cada ciclo. Base legal: Item 7.29.7.1 – Res. SESA 0414/01.' },
        { id: '46', crit: 'N', text: 'Realiza monitoramento físico (registro do tempo, temperatura e pressão) em cada ciclo. Base legal: Item 7.29.7.1 – Res. SESA 0414/01.' },
        { id: '47', crit: 'N', text: 'Todos os monitoramentos biológicos, químicos e físicos são registrados. Base legal: Cap. XI, 50 – Res. SESA 496/05.' },
        { id: '48-h', crit: 'N', text: 'Acondicionamento dos artigos (POP).', isHeader: true },
        { id: '48', crit: 'N', text: 'Acondicionamento dos artigos esterilizados em área limpa, em local exclusivo, constituído de material liso, impermeável e isento de umidade (distante de fontes de água). Base legal: Cap. X, 42 – Res. SESA 496/05.' },
        { id: '49', crit: 'N', text: 'Os artigos estão acondicionados corretamente em pacotes individuais, com selagem íntegra (fechamento hermético). Base legal: Cap. X, 41.4 – Res. SESA 496/05.' },
        { id: '50', crit: 'N', text: 'As embalagens utilizadas são indicadas pelo MS, estão íntegras e identificadas minimamente com a data da esterilização, prazo de validade e nome do responsável pelo preparo. Base legal: Cap. X, 43 – Res. SESA 496/05.' },
        { id: '51', crit: 'N', text: 'Proibido o reprocessamento de produtos de uso único. Base legal: RDC 156/2006; RE nº 2.605/2006.' },
      ]
    },
    {
      id: 'pg-residuos',
      titulo: '5. GERENCIAMENTO DE RESÍDUOS DE SERVIÇOS DE SAÚDE',
      itens: [
        { id: '52', crit: 'N', text: 'Acondicionamento dos resíduos infectantes de forma adequada: o recipiente (coletor) deve ser identificado "Resíduo Infectante", com simbologia de risco biológico, provido de saco branco leitoso, com tampa provida de sistema de abertura sem contato manual. Base legal: Art. 14 e 17 – RDC 222/18; Item 6.5 – Res. SESA 0414/01.' },
        { id: '53', crit: 'N', text: 'Acondicionamento dos resíduos perfurocortantes em recipiente rígido, identificado e com simbologia de risco biológico. Não ultrapassar a capacidade de 3/4 do recipiente. Base legal: Art. 86 – RDC 222/18; Cap. XVIII, 68 – Res. SESA 496/05.' },
        { id: '54', crit: 'N', text: 'Suporte exclusivo para o recipiente dos perfurocortantes, em altura que permita a visualização da abertura para descarte. Base legal: Item 32.5.3.2.1 – NR 32.' },
        { id: '55', crit: 'N', text: 'Acondicionamento adequado dos resíduos químicos com identificação (símbolo e frase de risco associado à periculosidade). Base legal: Anexo II – RDC 222/18; Cap. XVIII, 69 – Res. SESA 496/05.' },
        { id: '56', crit: 'N', text: 'Acondicionamento de resíduos contendo mercúrio (amálgama) em recipiente rígido, inquebrável, estanque, identificado e vedado; sob selo d\'água. Base legal: Cap. XVIII, 70 – Res. SESA 496/05; Item 6.6 – Res. SESA 0414/01.' },
      ]
    },
    {
      id: 'pg-outras',
      titulo: '6. OUTRAS NÃO CONFORMIDADES',
      itens: [
        { id: '57', crit: 'N', text: 'Medicamentos e correlatos odontológicos dentro do prazo de validade. Base legal: Cap. XV, 60 – Res. SESA 496/05.' },
      ]
    },
  ]
}

const CHECKLISTS: Record<string, ChecklistData> = {
  odontologia: odontologiaChecklist,
  'odontologia-prudentopolis': odontologiaPrudentopolisChecklist,
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
    // fixa no texto; Prudentópolis já vem preenchida por padrão.
    baseLegalPrazo: id === 'odontologia-prudentopolis' ? 'Lei Municipal nº 2.276/2017' : '',
  }))

  const [currentInspecaoId, setCurrentInspecaoId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, 'SIM' | 'NAO' | 'ND'>>({})
  const [observations, setObservations] = useState<Record<string, string>>({})
  const [showObsInput, setShowObsInput] = useState<Record<string, boolean>>({})
  const [itemPhotos, setItemPhotos] = useState<Record<string, PhotoEvidence[]>>({})
  const [customItems, setCustomItems] = useState<CustomItem[]>([])
  const [newCustomText, setNewCustomText] = useState("")
  const [newCustomCrit, setNewCustomCrit] = useState<Criticality>('N')
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
        await deleteInspecao(draftToResume.id);
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

  const [polishingItem, setPolishingItem] = useState<string | null>(null)
  const [savingObsItem, setSavingObsItem] = useState<string | null>(null)

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

  const handlePolishText = async (itemId: string) => {
    const currentText = observations[itemId];
    if (!currentText?.trim()) return;
    setPolishingItem(itemId);
    try {
      const result = await polishObservation({ text: currentText, uid: profile?.uid || '' });
      if (result.error) {
        toast({ variant: "destructive", title: "IA indisponível", description: result.error });
      } else if (result.polishedText) {
        setObservations(prev => ({ ...prev, [itemId]: result.polishedText }));
        handleSaveDraft(false);
      }
    } finally { setPolishingItem(null); }
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

  const handleAddCustomItem = () => {
    const text = newCustomText.trim();
    if (!text) return;
    setCustomItems(prev => [...prev, { id: `manual-${Date.now()}`, text, crit: newCustomCrit }]);
    setNewCustomText("");
    setNewCustomCrit('N');
    handleSaveDraft(false);
  };

  const handleRemoveCustomItem = (itemId: string) => {
    setCustomItems(prev => prev.filter(i => i.id !== itemId));
    setObservations(prev => { const next = { ...prev }; delete next[itemId]; return next; });
    setItemPhotos(prev => { const next = { ...prev }; delete next[itemId]; return next; });
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
            <Button onClick={downloadPdf} disabled={isGeneratingPdf} className="bg-primary text-white rounded-xl h-11 px-8 font-black uppercase text-[10px] shadow-xl">{isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />} Baixar PDF Oficial</Button>
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
                    <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">No dia {idData.dataHorario ? format(new Date(idData.dataHorario), "dd/MM/yyyy") : "____/____/____"} a equipe de fiscalização da Vigilância Sanitária Municipal realizou inspeção no estabelecimento {idData.fantasia || "---"}, CNPJ/CPF {idData.cnpj || "---"}, com a finalidade de verificar as condições sanitárias do estabelecimento e proceder à renovação da licença sanitária, conforme protocolo.</p>
                    <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Considerando que se trata de atividade classificada como de alto risco sanitário, nos termos da Resolução SESA nº 1024/2020, o funcionamento está condicionado à posse de licença sanitária válida, cuja renovação deve ser realizada anualmente.</p>
                    <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">A inspeção foi conduzida de acordo com os critérios legais e técnicos estabelecidos pela RDC 1002/25 da Anvisa, além das demais normas sanitárias e protocolos de biossegurança aplicáveis aos serviços de saúde.</p>
                    <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Durante a vistoria realizada, foram identificadas algumas inconformidades que necessitam de correção, a fim de garantir o cumprimento da legislação vigente e assegurar a proteção da saúde de usuários e profissionais.</p>
                    <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Dessa forma, para que seja possível a emissão da licença sanitária, o estabelecimento deverá promover a regularização integral das recomendações e ajustes apontados, conforme os itens descritos a seguir.</p>
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
                    <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">O estabelecimento deverá sanar todas as não conformidades apontadas neste relatório no prazo máximo de {idData.prazoDias || '15'} dias, contados a partir do recebimento do documento{idData.baseLegalPrazo ? `, conforme previsto na ${idData.baseLegalPrazo}` : ''}.</p>
                    <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Caso o estabelecimento não cumpra o prazo estipulado ou não formalize pedido de prorrogação, será lavrado um Termo de Intimação ou de Infração, fundamentado na legislação vigente, determinando a regularização das situações de não conformidade.</p>
                    <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">A Vigilância Sanitária Municipal acompanhará a implementação das medidas corretivas e permanecerá disponível para prestar orientações técnicas. Havendo necessidade devidamente justificada, o estabelecimento poderá solicitar prorrogação dos prazos, a qual será analisada e deliberada conforme a legislação aplicável.</p>
                    <p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">Em caso de dúvidas, estamos à disposição.</p>
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
              {config.footerRichText && (
                // Rodapé opcional (configurado em Identidade Municipal) — não
                // repete por página no <div>, mas renderReportIntoPdf clona
                // esse bloco em toda página gerada, igual ao [data-pdf-header].
                <div
                  data-pdf-footer
                  className="pt-2 mt-4 border-t border-black/20 text-center text-[8pt] text-black"
                  style={{ fontFamily: "'Times New Roman', Times, serif" }}
                  dangerouslySetInnerHTML={{ __html: config.footerRichText }}
                />
              )}
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

                {foundCnaes.length > 0 && (<div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl space-y-4"><div className="flex items-center justify-between px-1"><Label className="text-[11px] font-black uppercase text-blue-600 tracking-widest flex items-center gap-2"><ListFilter className="h-3 w-3" /> Selecionar Atividades (CNAE)</Label></div><div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">{foundCnaes.map((c, i) => { const isSelected = (idData.cnae || "").includes(c); return (<button key={i} type="button" onClick={() => { const current = idData.cnae || ""; const items = current.split(';').map(s => s.trim()).filter(Boolean); let newCnae = items.includes(c) ? items.filter(i => i !== c).join('; ') : [...items, c].join('; '); setIdData({...idData, cnae: newCnae.toUpperCase()}); }} className={cn("w-full text-left p-4 rounded-2xl text-[11px] font-bold uppercase transition-all border flex items-center gap-4", isSelected ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-blue-100 text-blue-500")}>{isSelected ? <Check className="h-4 w-4" /> : <div className="h-4 w-4 rounded border border-blue-200" />}<span className="flex-1 leading-tight">{c}</span></button>)})}</div></div>)}
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
                        {showObsInput[item.id] && (<div className="space-y-3 animate-in fade-in slide-in-from-top-2"><div className="flex items-center justify-between"><Label className="text-[10px] font-black text-primary uppercase">Relato de Irregularidade</Label><div className="flex gap-2"><Button onClick={() => handlePolishText(item.id)} disabled={polishingItem === item.id} variant="ghost" size="sm" className="h-7 px-3 bg-violet-50 text-violet-600 rounded-lg font-black text-[10px] uppercase">{polishingItem === item.id ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Sparkles className="h-3 w-3 mr-1.5" />} IA</Button></div></div><Textarea value={observations[item.id] || ""} onChange={e => { setObservations(prev => ({ ...prev, [item.id]: e.target.value })); }} placeholder="Descreva a situação..." className="min-h-[100px] rounded-2xl bg-white border-slate-200 text-sm font-medium" /><Button onClick={() => handleSaveObservation(item.id)} disabled={savingObsItem === item.id} size="sm" className="h-9 px-5 rounded-xl bg-primary text-white font-black text-[10px] uppercase gap-2">{savingObsItem === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar</Button></div>)}
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
                  <Button type="button" onClick={handleAddCustomItem} disabled={!newCustomText.trim()} className="h-10 px-6 rounded-xl bg-primary text-white font-black text-[11px] uppercase gap-2">
                    <Plus className="h-4 w-4" /> Adicionar
                  </Button>
                </div>
              </div>

              {customItems.length > 0 && (
                <div className="space-y-4">
                  {customItems.map((item) => (
                    <div key={item.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <Badge className={cn("text-[10px] font-black uppercase px-2", item.crit === 'I' ? "bg-red-100 text-red-600" : item.crit === 'N' ? "bg-amber-100 text-amber-600" : "bg-sky-100 text-sky-600")}>{item.crit === 'I' ? "IMPRESCINDÍVEL" : item.crit === 'N' ? "NECESSÁRIO" : "RECOMENDÁVEL"}</Badge>
                          <p className="text-[15px] font-bold text-slate-800 leading-relaxed">{item.text}</p>
                        </div>
                        <Button type="button" onClick={() => handleRemoveCustomItem(item.id)} variant="ghost" size="icon" className="h-8 w-8 rounded-full text-rose-500 hover:bg-rose-50 shrink-0"><Trash2 className="h-4 w-4" /></Button>
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
                      {showObsInput[item.id] && (<div className="space-y-3 animate-in fade-in slide-in-from-top-2"><div className="flex items-center justify-between"><Label className="text-[10px] font-black text-primary uppercase">Relato de Irregularidade</Label><div className="flex gap-2"><Button onClick={() => handlePolishText(item.id)} disabled={polishingItem === item.id} variant="ghost" size="sm" className="h-7 px-3 bg-violet-50 text-violet-600 rounded-lg font-black text-[10px] uppercase">{polishingItem === item.id ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Sparkles className="h-3 w-3 mr-1.5" />} IA</Button></div></div><Textarea value={observations[item.id] || ""} onChange={e => setObservations(prev => ({ ...prev, [item.id]: e.target.value }))} placeholder="Descreva a situação..." className="min-h-[100px] rounded-2xl bg-white border-slate-200 text-sm font-medium" /><Button onClick={() => handleSaveObservation(item.id)} disabled={savingObsItem === item.id} size="sm" className="h-9 px-5 rounded-xl bg-primary text-white font-black text-[10px] uppercase gap-2">{savingObsItem === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar</Button></div>)}
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
