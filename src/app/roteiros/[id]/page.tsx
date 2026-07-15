
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
  Eraser
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useToast } from "@/hooks/use-toast"
import { useStorage } from "@/firebase"
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
const OFFICIAL_SYMBOL_URL = "https://firebasestorage.googleapis.com/v0/b/firebasestudio-1937074168.appspot.com/o/user-uploads%2F67b6653d9e6e872d80ef618e%2Flogo_horizontal_preto_transparente.jpg?alt=media";

interface PhotoEvidence {
  url: string;
  timestamp: string;
  location: string;
}

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
  secoes: ChecklistSection[];
}

const odontologiaChecklist: ChecklistData = {
  titulo: 'Roteiro de Inspeção de Odontologia',
  subtitulo: 'Resolução SESA nº 0414/2001',
  categoria: 'SAÚDE',
  lei: 'Resolução SESA nº 0414/2001',
  secoes: [
    {
      id: 'sec3',
      titulo: '3. ESTRUTURA FÍSICA / CONDIÇÕES GERAIS',
      itens: [
        { id: '3.1', crit: 'R', text: 'Cópia do Projeto Arquitetônico original aprovado pela Vigilância Sanitária da SESA ou SMS. Obs.: solicitar o projeto e verificar se foi aprovado, quando for clínica ou instituição de ensino; anotar a data de aprovação.' },
        { id: '3.2', crit: 'N', text: 'Edificação em conformidade com o projeto aprovado, inclusive em caso de reformas ou ampliações.' },
        { id: '3.3', crit: 'N', text: 'No geral as áreas externas (jardim, pátio, corredores externos, casa de máquinas, etc.) e áreas de apoio (recepção, atendimento, lavanderia, corredores internos, depósitos, sanitários públicos, sala de espera) estão em boas condições de higiene, limpeza e conservação.' },
      ]
    },
    {
      id: 'sec4',
      titulo: '4. SAÚDE E SEGURANÇA DO TRABALHADOR (em Instituições de Ensino, o corpo discente está sujeito às mesmas exigências)',
      itens: [
        { id: '4.1', crit: 'N', text: 'Funcionários fazem uso de EPIs (equipamentos de proteção individual).', isHeader: true },
        { id: '4.1.1', crit: 'I', text: 'Luvas — uso único para cada paciente; sobreluva sempre que necessitar tocar, com as mãos contaminadas, superfícies/objetos como receituários, radiografias, telefone, maçanetas, caneta, etc.' },
        { id: '4.1.2', crit: 'I', text: 'Avental — uso exclusivo para o ambiente de trabalho, fechado e de mangas longas; trocar diariamente ou quando apresentar sujidades.' },
        { id: '4.1.3', crit: 'I', text: 'Máscara — trocar sempre que apresentar sujidades ou umidade.' },
        { id: '4.1.4', crit: 'I', text: 'Protetor ocular — deve ser limpo após cada procedimento.' },
        { id: '4.1.5', crit: 'I', text: 'Faz uso de gorro.' },
        { id: '4.2', crit: 'N', text: 'Faz uso de sapatos fechados.' },
        { id: '4.3', crit: 'R', text: 'Submete o paciente a bochecho com solução anti-séptica, antes de iniciar o procedimento odontológico, a fim de reduzir o número de microrganismos na cavidade oral.' },
        { id: '4.4', crit: 'I', text: 'Notifica acidentes de trabalho.' },
        { id: '4.5', crit: 'I', text: 'Encaminha funcionário para os serviços de emergência e investiga quando necessário.' },
        { id: '4.6', crit: 'I', text: 'Existe uma rotina de fluxo do encaminhamento do trabalhador (por escrito), no caso de acidentes com perfurocortantes e contaminação com materiais biológicos.' },
        { id: '4.7', crit: 'N', text: 'Existe um trabalho de educação continuada para os funcionários em relação à Saúde e Segurança no Trabalho, com registro.' },
        { id: '4.8', crit: 'N', text: 'O ambiente de trabalho oferece condições ergonômicas para o trabalhador quanto à iluminação, mobiliário, ritmo de trabalho/pausas.' },
        { id: '4.9', crit: 'N', text: 'Realizam hemogramas com contagem de plaquetas, com frequência mínima anual, para os funcionários que atuam na área de radiologia.' },
        { id: '4.10', crit: 'R', text: 'Imunização para:', isHeader: true },
        { id: '4.10.1', crit: 'R', text: 'Hepatite "B", tétano e rubéola (mulheres em idade fértil).' },
      ]
    },
    {
      id: 'sec5',
      titulo: '5. COMISSÃO E SERVIÇO DE CONTROLE DE INFECÇÃO ODONTOLÓGICA — CCIO/SCIO (só exigível em Instituições de Ensino)',
      itens: [
        { id: '5.1', crit: 'N', text: 'Constituição da CCIO através de nomeação por escrito e conta com os seguintes representantes:', isHeader: true },
        { id: '5.1.1', crit: 'N', text: 'Corpo docente (constituído de no mínimo dois cirurgiões-dentistas).' },
        { id: '5.1.2', crit: 'N', text: 'Corpo discente (constituído de no mínimo dois discentes).' },
        { id: '5.1.3', crit: 'N', text: 'Enfermeiro (constituído de um enfermeiro).' },
        { id: '5.1.4', crit: 'N', text: 'Serviço Administrativo (constituído de no mínimo um servidor).' },
        { id: '5.2', crit: 'N', text: 'Constituída por Regimento Interno (função da CCIO e SCIO). Verificar a documentação e se foi aprovada pela direção do estabelecimento de ensino.' },
        { id: '5.3', crit: 'N', text: 'Realiza reuniões periódicas com frequência mínima bimestral (função da CCIO). Verificar o registro em livro ata dos últimos 12 meses.' },
        { id: '5.4', crit: 'N', text: 'Treinamento no mínimo anual para todos os funcionários (função do SCIO), com registro do tema, data, periodicidade e assinatura dos funcionários.' },
        { id: '5.5', crit: 'N', text: 'Possuem Manual de Normas e/ou Rotinas dos Procedimentos realizados em todos os serviços do estabelecimento de ensino (função do SCIO).' },
      ]
    },
    {
      id: 'sec6',
      titulo: '6. CONDIÇÕES DE SANEAMENTO',
      itens: [
        { id: '6.1', crit: 'N', text: 'Existem reservatórios de água com tampas de material impermeável, não corrosivo, com acesso restrito.' },
        { id: '6.2', crit: 'N', text: 'A limpeza dos reservatórios de água é realizada em intervalos de no máximo 12 meses, com registro.' },
        { id: '6.3', crit: 'N', text: 'Para a fonte de abastecimento de água própria, realiza controle de qualidade da água, desinfecção com cloração e análise bacteriológica semestral e físico-química anual (com registro).' },
        { id: '6.4', crit: 'N', text: 'Servido por rede de esgoto devidamente conectada e/ou mantém sistema de tratamento interno próprio (fossa séptica e sumidouro ou outro sistema).' },
        { id: '6.5', crit: 'N', text: 'Acondicionamento dos resíduos de forma adequada.', isHeader: true },
        { id: '6.5.1', crit: 'I', text: 'Infectantes: em saco branco leitoso identificado.' },
        { id: '6.5.2', crit: 'I', text: 'Perfurocortante: em recipiente rígido e adequado.' },
        { id: '6.5.3', crit: 'N', text: 'Resíduos domiciliares: saco de lixo de cor preta.' },
        { id: '6.5.4', crit: 'R', text: 'Resíduos recicláveis: saco de lixo de cor azul.' },
        { id: '6.6', crit: 'N', text: 'Resíduos de amálgama sem elementos estranhos (gazes, algodão, etc.) são colocados em recipientes inquebráveis, tampados hermeticamente e cobertos com uma lâmina de água.' },
        { id: '6.7', crit: 'N', text: 'Rede elétrica sem fios expostos e suficiente para os equipamentos existentes.' },
        { id: '6.8', crit: 'N', text: 'Instalação hidráulica adequada, sem tubulação aparente e ausência de vazamentos.' },
        { id: '6.9', crit: 'N', text: 'Estabelecimentos com mais de 50 litros de resíduos infectantes:', isHeader: true },
        { id: '6.9.1', crit: 'N', text: 'Sistema de transporte interno de resíduos adequado (da fonte geradora até o abrigo) com frequência de coleta inferior a 24 horas.' },
        { id: '6.9.2', crit: 'N', text: 'Abrigo de resíduos adequado, conforme NBR 12.809 da ABNT.' },
        { id: '6.9.3', crit: 'N', text: 'Rotinas escritas disponíveis aos funcionários para coleta de resíduos, higienização de equipamentos/utensílios e abrigo, e controle de vetores.' },
        { id: '6.9.4', crit: 'N', text: 'Funcionários da coleta de resíduos dispõem de EPIs: uniforme (calça/camisa ou avental longo), luvas ¾ de borracha ou PVC, calçado fechado antiderrapante.' },
        { id: '6.9.5', crit: 'N', text: 'Funcionários da higienização do abrigo e equipamentos dispõem de EPIs: uniforme, avental frontal impermeável, gorro, luvas ¾, botas de borracha/PVC, máscara facial.' },
        { id: '6.9.6', crit: 'N', text: 'Os EPIs são lavados e/ou descontaminados pelo próprio estabelecimento e estão em boas condições.' },
      ]
    },
    {
      id: 'sec7',
      titulo: '7. ÁREA DE RECEPÇÃO / ÁREA DE ATENDIMENTO',
      itens: [
        { id: '7.1', crit: 'R', text: 'Sala de recepção: área mínima de 1,20 m² por pessoa mais área de circulação.' },
        { id: '7.2.1', crit: 'N', text: 'Prontuário do paciente: ficha clínica.' },
        { id: '7.2.2', crit: 'R', text: 'Prontuário do paciente: ficha de anamnese, assinada pelo paciente (duas vias, uma para o paciente e outra para o dentista).' },
        { id: '7.3', crit: 'N', text: 'Área de atendimento (mínimo 6 m² por equipo).' },
        { id: '7.4', crit: 'N', text: 'Piso liso, resistente, impermeável e lavável em perfeitas condições de limpeza (áreas de atendimento, esterilização, sanitários, laboratórios de prótese, cozinha).' },
        { id: '7.5', crit: 'N', text: 'Paredes de cor clara, material liso, resistente, lavável, em perfeitas condições de limpeza.' },
        { id: '7.6', crit: 'N', text: 'Forro/teto liso, livre de trincas, rachaduras e umidade.' },
        { id: '7.7', crit: 'N', text: 'Portas e janelas de superfícies lisas, em condições de uso e de fácil acesso.' },
        { id: '7.8', crit: 'N', text: 'Iluminação natural.' },
        { id: '7.9', crit: 'N', text: 'Iluminação artificial, com luminárias em bom estado de conservação.' },
        { id: '7.10', crit: 'N', text: 'Ventilação natural e/ou artificial (com rotina escrita de limpeza dos filtros, quando houver ventilação artificial).' },
        { id: '7.11', crit: 'N', text: 'Conforto acústico — isola as pessoas da fonte de ruído (compressor e bomba a vácuo).' },
        { id: '7.12', crit: 'N', text: 'Instalações sanitárias de uso exclusivo, providas de vaso sanitário e pia, coletor de lixo com tampa, toalheiro de papel e sabonete líquido em condições perfeitas de higiene.' },
        { id: '7.13', crit: 'N', text: 'Pia com cuba para lavagem das mãos dos profissionais, provida de sabão líquido, anti-séptico, papel-toalha e lixeira (com tampa de acionamento por pedal ou sem tampa — não se permite tampa manual).' },
        { id: '7.14', crit: 'N', text: 'Bancada com cuba profunda para lavagem de artigos (uso exclusivo).' },
        { id: '7.15', crit: 'N', text: 'Mobiliários, equipamentos e estrutura física em bom estado de conservação e boas condições de higiene (sem perda de revestimento, corrosão, sujidades, trincas, infiltrações).' },
        { id: '7.16', crit: 'N', text: 'Cortinas limpas e passíveis de limpeza.' },
        { id: '7.17', crit: 'N', text: 'Limpa as superfícies após cada atendimento com água e detergente antes da desinfecção química; barreiras de PVC (quando usadas) são trocadas após cada paciente.' },
        { id: '7.18', crit: 'N', text: 'Equipo odontológico em perfeito estado de uso e limpeza (a desinfecção/esterilização deve ser sempre precedida de limpeza).', isHeader: true },
        { id: '7.18.1', crit: 'N', text: 'Turbina(s) de alta rotação passível de esterilização física ou desinfecção.' },
        { id: '7.18.2', crit: 'N', text: 'Micromotor (contra-ângulo ou peça de mão reta) passível de esterilização física ou desinfecção.' },
        { id: '7.18.3', crit: 'N', text: 'Seringa tríplice (ar/água) desinfetada ou com ponta descartável.' },
        { id: '7.18.4', crit: 'N', text: 'Despreza o primeiro jato, por alguns segundos, com as peças de mão desconectadas, antes de utilizar em um novo paciente.' },
        { id: '7.18.5', crit: 'R', text: 'Possui reservatório de desinfetante integrado ao equipo, permitindo a desinfecção das mangueiras da turbina e do micromotor.' },
        { id: '7.19', crit: 'N', text: 'Cadeira odontológica em perfeito estado de uso e limpeza.' },
        { id: '7.20', crit: 'N', text: 'Refletor odontológico em perfeito estado de uso e limpeza.' },
        { id: '7.21', crit: 'N', text: 'Cuspideira com água corrente, em perfeito estado de uso e limpeza.' },
        { id: '7.22', crit: 'N', text: 'Sistema de sucção.', isHeader: true },
        { id: '7.22.1', crit: 'N', text: 'Limpeza da luz das mangueiras dos aspiradores por aspiração de solução detergente/detergente-desinfetante, após cada atendimento.' },
        { id: '7.22.2', crit: 'N', text: 'Pontas de sucção de uso único para cada paciente, previamente desinfetadas.' },
        { id: '7.22.3', crit: 'N', text: 'Pontas de sucção esterilizadas para procedimentos cirúrgicos.' },
        { id: '7.23', crit: 'N', text: 'Equipamentos complementares (ultrassom, fotopolimerizador, amalgamador, etc.) em perfeito estado de limpeza e utilização.' },
        { id: '7.24', crit: 'N', text: 'Equipamento de Raio X.', isHeader: true },
        { id: '7.24.1', crit: 'N', text: 'Utiliza barreiras descartáveis impermeáveis à secreção (filme de PVC transparente) no localizador do aparelho.' },
        { id: '7.24.2', crit: 'N', text: 'Utiliza envoltório de PVC transparente nas películas radiográficas intrabucais.' },
        { id: '7.24.3', crit: 'N', text: 'Usa sobreluva nas tomadas radiográficas, ao manipular localizador, braço, disparador e ao revelar a radiografia.' },
        { id: '7.25', crit: 'I', text: 'Medicamentos e correlatos odontológicos com registro no M.S. e dentro do prazo de validade; soluções desinfetantes/antissépticas identificadas e trocadas conforme padronização.' },
        { id: '7.26', crit: 'N', text: 'Compressor.', isHeader: true },
        { id: '7.26.1', crit: 'N', text: 'Instalado fora da área do consultório ou com proteção acústica.' },
        { id: '7.26.2', crit: 'N', text: 'Instalado de forma que a captação do ar ambiente seja limpo, frio e seco, através de tubulação apropriada.' },
        { id: '7.27', crit: 'N', text: 'Amalgamador longe de fonte de calor e colocado em bandeja plástica de abas altas (exceto quando usa cápsulas).' },
        { id: '7.28', crit: 'N', text: 'Desinfecção de superfícies.', isHeader: true },
        { id: '7.28.1', crit: 'N', text: 'Rotina e fluxo de procedimentos por escrito.' },
        { id: '7.28.2', crit: 'N', text: 'Uso de EPIs.' },
        { id: '7.28.3', crit: 'N', text: 'Limpeza das superfícies com água e detergente neutro.' },
        { id: '7.28.4', crit: 'N', text: 'Uso de desinfetantes químicos com registro no M.S. e dentro do prazo de validade.' },
        { id: '7.28.5', crit: 'R', text: 'Uso de barreiras descartáveis nas superfícies, impermeáveis à secreção (coberturas de PVC transparente).' },
        { id: '7.29', crit: 'N', text: 'Processamento de artigos.', isHeader: true },
        { id: '7.29.1', crit: 'N', text: 'Rotina e fluxo de procedimentos por escrito.' },
        { id: '7.29.2', crit: 'I', text: 'Uso obrigatório de EPIs.' },
        { id: '7.29.3', crit: 'N', text: 'Invólucros indicados pelo M.S., íntegros e identificados com tipo de artigo, data da esterilização, prazo de validade, indicador químico e rubrica do responsável.' },
        { id: '7.29.4', crit: 'N', text: 'Realiza a limpeza dos artigos imediatamente após o uso e, na impossibilidade, os imerge em água.' },
        { id: '7.29.5', crit: 'I', text: 'Limpeza dos artigos.', isHeader: true },
        { id: '7.29.5.1', crit: 'I', text: 'Uso obrigatório de EPIs (luvas grossas, máscara, óculos de proteção e avental plástico).' },
        { id: '7.29.5.2', crit: 'I', text: 'Utiliza produtos com registro no M.S. e dentro do prazo de validade.' },
        { id: '7.29.5.3', crit: 'I', text: 'Utiliza produtos e métodos preconizados pelo M.S. para limpeza dos artigos (manual ou mecânico).' },
        { id: '7.29.5.4', crit: 'I', text: 'Realiza enxágue em água corrente dos artigos (manual ou mecânico).' },
        { id: '7.29.5.5', crit: 'I', text: 'Realiza a secagem dos artigos (manual ou mecânica).' },
        { id: '7.29.5.6', crit: 'I', text: 'Realiza inspeção para detecção de resíduos e pontos de corrosão.' },
        { id: '7.29.5.7', crit: 'N', text: 'Realiza a lubrificação nos artigos articulados (produto hidrossolúvel, se for para autoclave).' },
        { id: '7.29.6', crit: 'N', text: 'Desinfecção (apenas para artigos termossensíveis).', isHeader: true },
        { id: '7.29.6.1', crit: 'N', text: 'Desinfecção física, de acordo com método preconizado pelo M.S.' },
        { id: '7.29.6.2', crit: 'N', text: 'Desinfecção química, com produtos e métodos preconizados pelo M.S.' },
        { id: '7.29.7', crit: 'I', text: 'Esterilização por meio físico: autoclave e/ou forno de Pasteur (estufa).', isHeader: true },
        { id: '7.29.7.1.1', crit: 'I', text: 'Calor úmido — Autoclave (vapor d\'água sob pressão).', isHeader: true },
        { id: '7.29.7.1.1.1', crit: 'I', text: 'Utiliza tempo, temperatura e pressão preconizados pelo M.S.' },
        { id: '7.29.7.1.1.2', crit: 'I', text: 'Utiliza o equipamento seguindo as recomendações do fabricante.' },
        { id: '7.29.7.1.1.3', crit: 'N', text: 'Faz manutenção preventiva, com registro.' },
        { id: '7.29.7.1.1.4', crit: 'I', text: 'Faz distribuição adequada dos pacotes em relação à posição e tipo de material.' },
        { id: '7.29.7.1.1.5', crit: 'I', text: 'Faz acondicionamento dos artigos como preconiza o M.S.' },
        { id: '7.29.7.1.1.6', crit: 'N', text: 'Faz monitoramento biológico (mensal, após validação).' },
        { id: '7.29.7.1.1.7', crit: 'N', text: 'Faz monitoramento químico (indicador externo em todos os pacotes; indicador interno a cada ciclo).' },
        { id: '7.29.7.1.1.8', crit: 'N', text: 'Usa Teste de Bowie e Dick, no caso de autoclave pré-vácuo.' },
        { id: '7.29.7.1.1.9', crit: 'N', text: 'Todos os monitoramentos biológicos, químicos e físicos estão registrados.' },
        { id: '7.29.7.1.1.10', crit: 'N', text: 'Realiza monitoramento físico, registrando tempo, temperatura e pressão em cada ciclo.' },
        { id: '7.29.7.1.2', crit: 'I', text: 'Calor seco — Estufa (Forno de Pasteur).', isHeader: true },
        { id: '7.29.7.1.2.1', crit: 'I', text: 'Faz uso de termômetro acessório (200ºC).' },
        { id: '7.29.7.1.2.2', crit: 'I', text: 'Usa temperatura de 160ºC por duas horas ou 170ºC por uma hora.' },
        { id: '7.29.7.1.2.3', crit: 'I', text: 'Faz manutenção preventiva.' },
        { id: '7.29.7.1.2.4', crit: 'I', text: 'Faz distribuição adequada dos pacotes em relação à posição e tipo de material.' },
        { id: '7.29.7.1.2.5', crit: 'I', text: 'Faz acondicionamento dos artigos como preconiza o M.S.' },
        { id: '7.29.7.1.2.6', crit: 'N', text: 'Faz uso de indicador químico externo (fita nos pacotes) e interno (tiras dentro das embalagens), em todos os pacotes.' },
        { id: '7.29.7.1.2.7', crit: 'I', text: 'A porta da estufa é mantida fechada durante todo o ciclo de esterilização.' },
        { id: '7.29.7.2', crit: 'N', text: 'Esterilização por meio químico (só permitida quando não é possível a esterilização física).', isHeader: true },
        { id: '7.29.7.2.1', crit: 'N', text: 'Uso de esterilizante químico preconizado pelo M.S.' },
        { id: '7.29.7.2.2', crit: 'N', text: 'Imersão total do artigo na solução adequada em recipiente plástico.' },
        { id: '7.29.7.2.3', crit: 'N', text: 'Observa e respeita o tempo de exposição indicado pelo fabricante, mantendo o recipiente fechado.' },
        { id: '7.29.7.2.4', crit: 'N', text: 'Enxágua artigos submetidos a esterilização química com água esterilizada e técnica asséptica.' },
        { id: '7.29.7.2.5', crit: 'N', text: 'Faz múltiplos enxágues para eliminar resíduos do produto.' },
        { id: '7.29.7.2.6', crit: 'N', text: 'Usa todo o conteúdo do recipiente de uma só vez ou despreza o que restou.' },
        { id: '7.29.7.2.7', crit: 'N', text: 'Seca os artigos com compressa esterilizada.' },
        { id: '7.29.7.2.8', crit: 'N', text: 'Destina ao uso imediato, sendo proibida a armazenagem de artigos submetidos a esterilização química.' },
        { id: '7.29.8', crit: 'I', text: 'Artigos esterilizados fisicamente estão armazenados em área limpa, livre de poeira, distante de água/janelas abertas/portas/tubulações expostas e drenos, com temperatura entre 18ºC e 22ºC.' },
      ]
    },
    {
      id: 'sec8',
      titulo: '8. CENTRAL DE MATERIAL ESTERILIZADO (CME) — CLÍNICAS ODONTOLÓGICAS',
      itens: [
        { id: '8.1', crit: 'I', text: 'Ambiente limpo, claro e arejado.' },
        { id: '8.2', crit: 'I', text: 'Acesso restrito ao(s) funcionário(s) que atua(m) na área.' },
        { id: '8.3', crit: 'N', text: 'Equipamentos e mobiliários em boas condições de higiene e conservação (sem trincas, perda de revestimento, corrosão, sujidades, infiltrações).' },
        { id: '8.4', crit: 'N', text: 'Existe fluxo sequencial de procedimentos, observando a barreira física e a barreira técnica.' },
        { id: '8.5', crit: 'I', text: 'As portas e guichês são mantidos fechados.' },
        { id: '8.6', crit: 'N', text: 'Área suja (expurgo) separada por barreira física da área limpa (preparo, esterilização e armazenamento).' },
        { id: '8.7', crit: 'N', text: 'Janelas teladas quando comunicam com a área externa, ou sistema de ventilação artificial.' },
        { id: '8.8', crit: 'N', text: 'Rotinas escritas disponíveis aos funcionários para lavagem/anti-sepsia das mãos, limpeza/desinfecção/acondicionamento/esterilização dos artigos e armazenamento.' },
        { id: '8.9', crit: 'N', text: 'Transporte dos artigos contaminados realizado em recipientes fechados até a CME.' },
        { id: '8.10', crit: 'N', text: 'Área de expurgo.', isHeader: true },
        { id: '8.10.1', crit: 'N', text: 'Iluminação e ventilação natural (janelas teladas) ou artificial com ventilação forçada (exaustão).' },
        { id: '8.10.2', crit: 'N', text: 'Pia com bancada, cuba maior e profunda, com água quente e fria.' },
        { id: '8.10.3', crit: 'I', text: 'Uso de EPIs: avental impermeável, óculos, luvas grossas, gorro, máscara e sapatos fechados.' },
        { id: '8.10.4', crit: 'N', text: 'Vestiário exclusivo.' },
        { id: '8.11', crit: 'N', text: 'Área de recepção de artigos limpos.', isHeader: true },
        { id: '8.11.1', crit: 'I', text: 'Pia para lavagem das mãos provida de sabão líquido/anti-séptico, papel toalha, lixeira com tampa de pedal ou sem tampa.' },
        { id: '8.11.2', crit: 'N', text: 'Bancada de trabalho de material liso, impermeável e lavável.' },
        { id: '8.12', crit: 'N', text: 'Área de esterilização.', isHeader: true },
        { id: '8.12.1', crit: 'N', text: 'Presença de estufa (com termômetro acessório e cronômetro) e/ou autoclave.' },
        { id: '8.12.2', crit: 'N', text: 'Comunicação com a área de armazenamento/distribuição através de porta de fechamento automático.' },
        { id: '8.13', crit: 'N', text: 'Armazenamento do material esterilizado em local de uso exclusivo, com prateleiras/armários de material liso, impermeável, isento de umidade, com termômetro de controle (21ºC-25ºC).' },
        { id: '8.14', crit: 'N', text: 'Distribuição dos artigos através de guichê, mantido fechado quando não utilizado.' },
      ]
    },
    {
      id: 'sec9',
      titulo: '9. CENTRO CIRÚRGICO',
      itens: [
        { id: '9.1', crit: 'I', text: 'Vestiário de barreira de acesso ao Centro Cirúrgico, provido de banheiro com vaso sanitário e lavatório.' },
        { id: '9.2', crit: 'I', text: 'Áreas exclusivas para sala cirúrgica, expurgo e guarda de material esterilizado.' },
        { id: '9.3', crit: 'I', text: 'Lavatório dotado de torneiras e dispensador com antisséptico de acionamento sem uso das mãos, com escovinhas secas/esterilizadas/individualizadas para preparação cirúrgica das mãos.' },
        { id: '9.4', crit: 'I', text: 'Sistema de ventilação artificial nas salas de cirurgia.' },
        { id: '9.5', crit: 'N', text: 'Rotinas escritas disponíveis aos funcionários para lavagem/antissepsia das mãos, limpeza/desinfecção de superfícies e do carrinho/material de anestesia, e limpeza dos filtros de ventilação.', isHeader: true },
        { id: '9.6', crit: 'I', text: 'Soluções antissépticas identificadas e trocadas conforme padronização, dentro do prazo de validade.' },
        { id: '9.7', crit: 'I', text: 'Os funcionários dispõem de paramentação e EPIs:', isHeader: true },
        { id: '9.7.1', crit: 'I', text: 'Avental estéril.' },
        { id: '9.7.2', crit: 'I', text: 'Luvas estéreis.' },
        { id: '9.7.3', crit: 'I', text: 'Máscara.' },
        { id: '9.7.4', crit: 'I', text: 'Calça e jaleco.' },
        { id: '9.7.5', crit: 'I', text: 'Óculos.' },
        { id: '9.7.6', crit: 'I', text: 'Gorro.' },
        { id: '9.7.7', crit: 'I', text: 'Sapatilha ou similar (lavável), para uso só em área limpa de centro cirúrgico.' },
        { id: '9.8', crit: 'I', text: 'Carrinho e/ou material de anestesia submetido à limpeza e desinfecção após cirurgia, ou com frequência mínima diária.' },
        { id: '9.9', crit: 'I', text: 'Mobiliários, equipamentos e estrutura física em bom estado de conservação e boas condições de higiene.' },
        { id: '9.10', crit: 'I', text: 'Manutenção preventiva e periódica dos equipamentos, com registro (laudo com data, nome e assinatura do técnico).' },
        { id: '9.11', crit: 'I', text: 'Materiais e artigos estéreis acondicionados em embalagem adequada e íntegra, identificados com data de esterilização, validade e indicador químico.' },
        { id: '9.12', crit: 'I', text: 'Medicamentos e correlatos com registro no M.S., dentro do prazo de validade, acondicionados conforme orientação do fabricante.' },
      ]
    },
    {
      id: 'sec10',
      titulo: '10. PROCESSAMENTO DE ROUPAS — LAVANDERIA (se terceirizado, marcar ND nos demais itens e verificar só 10.1, 10.3.1, 10.3.2 e 10.3.5)',
      itens: [
        { id: '10.1', crit: 'I', text: 'Transporte adequado da roupa suja e da roupa limpa (carrinho fechado, identificado, de uso exclusivo; ou hamper com a roupa pré-acondicionada em sacos plásticos fechados).' },
        { id: '10.2', crit: 'N', text: 'Dispõe de barreira física (e obrigatoriamente barreira técnica) entre área suja e área limpa.' },
        { id: '10.3', crit: 'N', text: 'Rotinas escritas disponíveis aos funcionários para:', isHeader: true },
        { id: '10.3.1', crit: 'N', text: 'Higienização das mãos.' },
        { id: '10.3.2', crit: 'N', text: 'Coleta da roupa suja.' },
        { id: '10.3.3', crit: 'N', text: 'Processo e fluxo para lavagem da roupa.' },
        { id: '10.3.4', crit: 'I', text: 'Desinfecção da roupa (processo térmico a 70ºC ou produtos químicos adequados).' },
        { id: '10.3.5', crit: 'N', text: 'Distribuição da roupa limpa.' },
        { id: '10.4', crit: 'N', text: 'EPIs para coleta da roupa suja: uniforme (calça/camisa ou avental longo), luvas ¾ de borracha/PVC, calçado fechado antiderrapante.', isHeader: true },
        { id: '10.4.1', crit: 'N', text: 'Uniforme composto de calça e camisa ou avental longo.' },
        { id: '10.4.2', crit: 'I', text: 'Luvas ¾ de borracha ou de PVC.' },
        { id: '10.4.3', crit: 'N', text: 'Calçado fechado com solado antiderrapante.' },
        { id: '10.4.4', crit: 'I', text: 'EPIs da área suja da lavanderia: uniforme composto de calça e camisa.' },
        { id: '10.4.5', crit: 'I', text: 'Avental frontal impermeável.' },
        { id: '10.4.6', crit: 'I', text: 'Gorro.' },
        { id: '10.4.7', crit: 'I', text: 'Máscara.' },
        { id: '10.4.8', crit: 'I', text: 'Luvas ¾ de borracha ou de PVC.' },
        { id: '10.4.9', crit: 'I', text: 'Botas de borracha ou de PVC.' },
        { id: '10.4.10', crit: 'N', text: 'EPIs da área limpa da lavanderia: uniforme composto de calça e camisa.' },
        { id: '10.4.11', crit: 'N', text: 'Calçado fechado com solado antiderrapante. Verificar se todos os EPIs estão em boas condições e se são fornecidos/lavados/descontaminados pelo estabelecimento.' },
        { id: '10.5', crit: 'I', text: 'Processo de secagem de roupa adequado (secadora com exaustão, ou área exclusiva com varais e acesso restrito).' },
        { id: '10.6', crit: 'N', text: 'Manutenção preventiva e periódica dos equipamentos, com registro.' },
        { id: '10.7', crit: 'N', text: 'Mobiliários, equipamentos, estrutura física e ambiente em bom estado de conservação e boas condições de higiene.' },
      ]
    },
    {
      id: 'sec11',
      titulo: '11. LIMPEZA E ZELADORIA',
      itens: [
        { id: '11.1', crit: 'I', text: 'Os funcionários de serviços gerais recebem treinamento.' },
        { id: '11.2', crit: 'N', text: 'Existem rotinas escritas disponíveis aos funcionários para o processo de higienização, limpeza e descontaminação de ambientes.' },
        { id: '11.3', crit: 'I', text: 'Os funcionários dispõem de EPIs.' },
      ]
    },
  ]
}

export default function DynamicChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Resolve a Promise para obter o id (usado como roteiroId no rascunho salvo)
  const checklist = odontologiaChecklist;
  const { toast } = useToast()
  const storage = useStorage()
  const { profile } = useAuth()
  const { config } = useAppConfig()
  const router = useRouter()
  const { saveInspecao, deleteInspecao, inspecoes, loading: loadingInspecoes } = useInspecoes()
  const reportRef = useRef<HTMLDivElement>(null)
  
  const [idData, setIdData] = useState({
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
    prazoDias: '15',
    conclusaoTexto: 'Diante das não conformidades apontadas, fica o estabelecimento notificado a proceder as adequações técnicas conforme criticidade identificada.'
  })

  const [currentInspecaoId, setCurrentInspecaoId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, 'SIM' | 'NAO' | 'ND'>>({})
  const [observations, setObservations] = useState<Record<string, string>>({})
  const [showObsInput, setShowObsInput] = useState<Record<string, boolean>>({})
  const [itemPhotos, setItemPhotos] = useState<Record<string, PhotoEvidence[]>>({})
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
        checklistData: { answers, observations, itemPhotos, idData, roteiroId: id }
      };
      const res = await saveInspecao(data, currentInspecaoId || undefined);
      if (res?.id) setCurrentInspecaoId(res.id);
      isDirtyRef.current = false;
      if (showToast) toast({ title: "Sincronizado" });
    } catch (e) {
      if (showToast) toast({ variant: "destructive", title: "Erro na Nuvem" });
    } finally {
      setIsSavingDraft(false);
    }
  }, [profile, idData, answers, observations, itemPhotos, id, saveInspecao, currentInspecaoId, toast]);

  const [polishingItem, setPolishingItem] = useState<string | null>(null)

  const handlePolishText = async (itemId: string) => {
    const currentText = observations[itemId];
    if (!currentText?.trim()) return;
    setPolishingItem(itemId);
    try {
      const result = await polishObservation({ text: currentText, uid: profile?.uid || '' });
      if (result.polishedText) { 
        setObservations(prev => ({ ...prev, [itemId]: result.polishedText.toUpperCase() }));
        handleSaveDraft(false);
      }
    } finally { setPolishingItem(null); }
  }

  const handleDeleteDraft = async () => {
    if (!currentInspecaoId) {
        setAnswers({}); setObservations({}); setItemPhotos({}); setIdData(prev => ({...prev, fantasia: '', cnpj: '', cnae: ''}));
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
            checklistData: { answers, observations, itemPhotos, idData: updated, roteiroId: id }
        }, currentInspecaoId || undefined);
        if (resSave?.id) setCurrentInspecaoId(resSave.id);
        setIsSavingDraft(false);
      }
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
        await uploadBytes(storageRef, compressed);
        url = await getDownloadURL(storageRef);
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

  const downloadPdf = async () => {
    if (!reportRef.current) return;
    setIsGeneratingPdf(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(reportRef.current, { scale: 3.0, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 794 });
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210; const pageHeight = 297; const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight; let position = 0;
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft >= 0) { position = heightLeft - imgHeight; pdf.addPage(); pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight); heightLeft -= pageHeight; }
      pdf.save(`RELATÓRIO - ${idData.fantasia || 'INSPEÇÃO'}.pdf`);
    } finally { setIsGeneratingPdf(false); }
  };

  const nonConformities = useMemo(() => {
    const all = checklist.secoes.flatMap(s => s.itens);
    const filtered = all.filter(i => answers[i.id] === 'NAO');
    return { I: filtered.filter(i => i.crit === 'I'), N: filtered.filter(i => i.crit === 'N'), R: filtered.filter(i => i.crit === 'R') };
  }, [answers, checklist]);

  const logoSource = config.logoUrl || OFFICIAL_SYMBOL_URL;
  const isDataUrl = logoSource.startsWith('data:');
  const displayLogoUrl = isDataUrl ? logoSource : `/api/proxy-image?url=${encodeURIComponent(logoSource)}`;

  if (view === 'report') {
    return (
      <div className="document-container font-serif pb-40">
        <header className="flex flex-wrap items-center justify-between no-print mb-10 gap-4 w-full max-w-[210mm] px-4">
            <Button onClick={() => setView('checklist')} variant="outline" className="rounded-xl h-11 font-black uppercase text-[10px] bg-white shadow-sm"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar à Edição</Button>
            <Button onClick={downloadPdf} disabled={isGeneratingPdf} className="bg-primary text-white rounded-xl h-11 px-8 font-black uppercase text-[10px] shadow-xl">{isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />} Baixar PDF Oficial</Button>
        </header>

        <div className="document-paper-wrapper custom-scrollbar">
          <div ref={reportRef} className="document-paper h-auto bg-white">
              <div className="flex flex-row items-center justify-between gap-6 mb-1 pb-2 border-none">
                  <div className="w-[140px] h-[100px] md:w-[180px] md:h-[100px] flex items-center justify-start overflow-hidden"><img src={displayLogoUrl} className="max-w-full max-h-full object-contain block" alt="Brasão" crossOrigin={isDataUrl ? undefined : "anonymous"} /></div>
                  <div className="flex-1 text-center">
                    {config.headerRichText ? (<div style={{ fontFamily: "'Times New Roman', Times, serif" }} dangerouslySetInnerHTML={{ __html: config.headerRichText }} />) : (<><p className="text-[10pt] font-black uppercase text-black">PREFEITURA MUNICIPAL DE {config.municipioNome || "PRUDENTÓPOLIS"}</p><h2 className="text-[12pt] font-black uppercase leading-tight">{config.secretaria || "SECRETARIA MUNICIPAL DE SAÚDE"}</h2><h3 className="text-[10pt] font-bold uppercase text-zinc-700">{config.departamento || "VIGILÂNCIA SANITÁRIA"}</h3></>)}
                    <p className="text-[14pt] font-black uppercase italic tracking-tighter mt-2 border-y border-zinc-200 py-1">RELATÓRIO DE INSPEÇÃO SANITÁRIA</p>
                  </div>
              </div>

              <div className="mb-6">
                  <div className="sub-header-row">1. IDENTIFICAÇÃO DO ESTABELECIMENTO</div>
                  <table className="form-table-clean border-black">
                      <tbody>
                          <tr><td colSpan={2} style={{ padding: '6pt 10pt' }}><span className="data-label">RAZÃO SOCIAL / NOME FANTASIA:</span><div className="font-black text-[11pt]">{idData.fantasia || "---"}</div></td></tr>
                          <tr><td style={{ padding: '6pt 10pt' }}><span className="data-label">CNPJ / CPF:</span><div className="font-bold text-[10pt]">{idData.cnpj || "---"}</div></td><td style={{ padding: '6pt 10pt' }}><span className="data-label">TELEFONE:</span><div className="font-bold text-[10pt]">{idData.telefone || "---"}</div></td></tr>
                          <tr><td style={{ padding: '6pt 10pt' }}><span className="data-label">E-MAIL:</span><div className="font-bold text-[10pt]">{idData.email || "---"}</div></td><td style={{ padding: '6pt 10pt' }}><span className="data-label">DATA/HORÁRIO DA INSPEÇÃO:</span><div className="font-bold text-[10pt]">{idData.dataHorario ? format(new Date(idData.dataHorario), "dd/MM/yyyy 'às' HH:mm") : "---"}</div></td></tr>
                          <tr><td colSpan={2} style={{ padding: '6pt 10pt' }}><span className="data-label">ATIVIDADES (CNAE):</span><div className="font-bold text-[9pt] leading-tight text-zinc-800 uppercase">{idData.cnae || "---"}</div></td></tr>
                          <tr><td colSpan={2} style={{ padding: '6pt 10pt' }}><span className="data-label">ENDEREÇO:</span><div className="font-bold text-[10pt]">{idData.endereco} - {idData.bairro}</div></td></tr>
                          <tr><td colSpan={2} style={{ padding: '6pt 10pt' }}><span className="data-label">RESPONSÁVEL TÉCNICO:</span><div className="font-bold text-[10pt]">{idData.responsavelTecnico || "---"}{idData.responsavelTecnicoRegistro ? ` — ${idData.responsavelTecnicoRegistro}` : ""}</div></td></tr>
                      </tbody>
                  </table>
              </div>

              <div className="mb-6">
                  <div className="sub-header-row">2. NÃO CONFORMIDADES DETECTADAS</div>
                  {Object.keys(nonConformities).some(k => nonConformities[k as Criticality].length > 0) ? (
                      (['I', 'N', 'R'] as Criticality[]).map(crit => (
                          nonConformities[crit].length > 0 && (
                              <div key={crit} className="mt-4 first:mt-0 space-y-2">
                                  <div className={cn("px-4 py-1.5 border-l-4 font-black text-[9.5pt] uppercase flex items-center gap-2", crit === 'I' ? "bg-red-50 border-red-600 text-red-700" : crit === 'N' ? "bg-amber-50 border-amber-500 text-amber-700" : "bg-blue-50 border-blue-600 text-blue-700")}>CRITICIDADE: {crit === 'I' ? "IMPRESCINDÍVEL" : crit === 'N' ? "NECESSÁRIO" : "RECOMENDÁVEL"}</div>
                                  {nonConformities[crit].map(item => (
                                      <div key={item.id} className="pl-4 pb-4 border-b border-zinc-100 break-inside-avoid">
                                          <div className="flex items-start gap-3 mb-2"><span className="font-black text-[9pt] text-zinc-900 bg-zinc-50 h-6 w-6 flex items-center justify-center rounded">{item.id}</span><p className="text-[9.5pt] leading-relaxed text-zinc-800 font-bold flex-1 uppercase">{item.text}</p></div>
                                          {observations[item.id] && (<div className="ml-8 mb-2 p-3 bg-zinc-50 border-l-2 border-zinc-300 rounded-r-lg"><p className="text-[7pt] font-black uppercase text-zinc-400 mb-0.5">Relato do Fiscal:</p><p className="text-[9.5pt] text-zinc-700 leading-relaxed italic whitespace-pre-wrap uppercase">{observations[item.id]}</p></div>)}
                                          {itemPhotos[item.id] && itemPhotos[item.id].length > 0 && (
                                            <div className={cn("ml-8 mb-2 grid gap-2 break-inside-avoid", itemPhotos[item.id].length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                                              {itemPhotos[item.id].map((photo, pIdx) => {
                                                const photoIsDataUrl = photo.url.startsWith('data:');
                                                const photoSrc = photoIsDataUrl ? photo.url : `/api/proxy-image?url=${encodeURIComponent(photo.url)}`;
                                                return (
                                                  <div key={pIdx} className="border border-zinc-200 rounded-lg overflow-hidden bg-zinc-50">
                                                    <img src={photoSrc} alt={`Evidência ${pIdx + 1}`} crossOrigin={photoIsDataUrl ? undefined : "anonymous"} className="w-full h-[160px] object-cover block" />
                                                    <p className="text-[6.5pt] text-zinc-400 font-bold uppercase px-2 py-1 border-t border-zinc-200">{photo.timestamp} — {photo.location}</p>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                      </div>
                                  ))}
                              </div>
                          )
                      ))
                  ) : <div className="py-12 text-center border-2 border-dashed border-zinc-100 rounded-2xl mx-2"><CheckCircle2 className="h-10 w-10 text-emerald-100 mx-auto mb-2" /><p className="font-black text-zinc-300 uppercase text-[10pt] tracking-widest italic">Nenhuma irregularidade detectada.</p></div>}
              </div>

              <div className="mb-8">
                  <div className="sub-header-row">3. CONCLUSÃO E PRAZO LEGAL</div>
                  <div className="border border-[#171717] p-4 bg-zinc-50/50"><p className="text-[10pt] leading-relaxed text-justify font-medium text-zinc-900">{idData.conclusaoTexto}</p><div className="mt-4 pt-4 border-t border-zinc-200 text-center"><p className="font-black text-[12pt] uppercase underline">PRAZO PARA REGULARIZAÇÃO: {idData.prazoDias} DIAS ÚTEIS.</p></div></div>
              </div>

              <div className="mt-12 grid grid-cols-2 gap-8 text-center">
                  <div className="space-y-10 flex flex-col items-center">
                      {fiscais.map((f, i) => (
                          <div key={i} className="w-full max-w-[220px]"><div className="min-h-[40pt] flex flex-col items-center justify-end">{(f as any).signature && <img src={(f as any).signature} className="h-10 object-contain mb-0" alt="S" />}<div className="signature-block w-full"><p className="signature-name">{(f as any).nome}</p><p className="signature-title">{(f as any).cargo}</p></div></div></div>
                      ))}
                  </div>
                  <div className="space-y-10 flex flex-col items-center">
                      <div className="w-full max-w-[220px]"><div className="min-h-[40pt] flex flex-col items-center justify-end">{idData.signatureResponsavel && <img src={idData.signatureResponsavel} className="h-10 object-contain mb-0" alt="S" />}<div className="signature-block w-full"><p className="signature-name">{idData.responsavel || "INSPECIONADO"}</p><p className="signature-title">CIÊNCIA DO AUTUADO</p></div></div></div>
                  </div>
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
          <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
            <div className="space-y-5">
                <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-zinc-400 flex items-center gap-3"><Building2 className="h-4 w-4 text-primary" /> Estabelecimento</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                   <div className="space-y-2"><Label className="text-[11px] font-black uppercase text-zinc-500">CNPJ do Estabelecimento</Label><div className="flex gap-2"><Input value={idData.cnpj} onChange={e => setIdData({...idData, cnpj: e.target.value})} placeholder="00.000.000/0000-00" className="h-12 rounded-xl bg-slate-50 border-none font-bold" /><Button onClick={handleCnpjLookup} disabled={isSearchingCnpj} variant="secondary" className="h-12 w-12 rounded-xl">{isSearchingCnpj ? <Loader2 className="animate-spin h-4 w-4" /> : <Search className="h-4 w-4" />}</Button></div></div>
                   <div className="space-y-2"><Label className="text-[11px] font-black uppercase text-zinc-500">Razão Social</Label><Textarea value={idData.fantasia} onChange={e => setIdData({...idData, fantasia: e.target.value.toUpperCase()})} className="min-h-[48px] rounded-xl bg-slate-50 border-none font-bold uppercase resize-none" /></div>
                   <div className="space-y-2"><Label className="text-[11px] font-black uppercase text-zinc-500">Telefone</Label><Input value={idData.telefone} onChange={e => setIdData({...idData, telefone: e.target.value})} placeholder="(00) 00000-0000" className="h-12 rounded-xl bg-slate-50 border-none font-bold" /></div>
                   <div className="space-y-2"><Label className="text-[11px] font-black uppercase text-zinc-500">E-mail</Label><Input type="email" value={idData.email} onChange={e => setIdData({...idData, email: e.target.value})} placeholder="contato@estabelecimento.com" className="h-12 rounded-xl bg-slate-50 border-none font-bold" /></div>
                   <div className="space-y-2 md:col-span-2"><Label className="text-[11px] font-black uppercase text-zinc-500">Endereço</Label><Input value={idData.endereco} onChange={e => setIdData({...idData, endereco: e.target.value.toUpperCase()})} className="h-12 rounded-xl bg-slate-50 border-none font-bold uppercase" /></div>
                   <div className="space-y-2"><Label className="text-[11px] font-black uppercase text-zinc-500">Bairro</Label><Input value={idData.bairro} onChange={e => setIdData({...idData, bairro: e.target.value.toUpperCase()})} className="h-12 rounded-xl bg-slate-50 border-none font-bold uppercase" /></div>
                </div>

                {foundCnaes.length > 0 && (<div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl space-y-4"><div className="flex items-center justify-between px-1"><Label className="text-[11px] font-black uppercase text-blue-600 tracking-widest flex items-center gap-2"><ListFilter className="h-3 w-3" /> Selecionar Atividades (CNAE)</Label></div><div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">{foundCnaes.map((c, i) => { const isSelected = (idData.cnae || "").includes(c); return (<button key={i} type="button" onClick={() => { const current = idData.cnae || ""; const items = current.split(';').map(s => s.trim()).filter(Boolean); let newCnae = items.includes(c) ? items.filter(i => i !== c).join('; ') : [...items, c].join('; '); setIdData({...idData, cnae: newCnae.toUpperCase()}); }} className={cn("w-full text-left p-4 rounded-2xl text-[11px] font-bold uppercase transition-all border flex items-center gap-4", isSelected ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-blue-100 text-blue-500")}>{isSelected ? <Check className="h-4 w-4" /> : <div className="h-4 w-4 rounded border border-blue-200" />}<span className="flex-1 leading-tight">{c}</span></button>)})}</div></div>)}
            </div>

            <div className="h-px bg-slate-100" />

            <div className="space-y-5">
                <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-zinc-400 flex items-center gap-3"><Building2 className="h-4 w-4 text-primary" /> Responsáveis e Data da Inspeção</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                   <div className="space-y-2"><Label className="text-[11px] font-black uppercase text-zinc-500">Responsável Legal (acompanhou a inspeção)</Label><Input value={idData.responsavel} onChange={e => setIdData({...idData, responsavel: e.target.value.toUpperCase()})} className="h-12 rounded-xl bg-slate-50 border-none font-bold uppercase" /></div>
                   <div className="space-y-2"><Label className="text-[11px] font-black uppercase text-zinc-500">CPF do Responsável Legal</Label><Input value={idData.responsavelCpf} onChange={e => setIdData({...idData, responsavelCpf: e.target.value})} placeholder="000.000.000-00" className="h-12 rounded-xl bg-slate-50 border-none font-bold" /></div>
                   <div className="space-y-2"><Label className="text-[11px] font-black uppercase text-zinc-500">Responsável Técnico</Label><Input value={idData.responsavelTecnico} onChange={e => setIdData({...idData, responsavelTecnico: e.target.value.toUpperCase()})} placeholder="NOME DO RESPONSÁVEL TÉCNICO" className="h-12 rounded-xl bg-slate-50 border-none font-bold uppercase" /></div>
                   <div className="space-y-2"><Label className="text-[11px] font-black uppercase text-zinc-500">Registro Profissional (ex.: CRO)</Label><Input value={idData.responsavelTecnicoRegistro} onChange={e => setIdData({...idData, responsavelTecnicoRegistro: e.target.value})} placeholder="CRO-PR 00000" className="h-12 rounded-xl bg-slate-50 border-none font-bold" /></div>
                   <div className="space-y-2"><Label className="text-[11px] font-black uppercase text-zinc-500">Data e Horário da Inspeção</Label><Input type="datetime-local" value={idData.dataHorario} onChange={e => setIdData({...idData, dataHorario: e.target.value})} className="h-12 rounded-xl bg-slate-50 border-none font-bold" /></div>
                </div>
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
                          <button type="button" onClick={() => setShowObsInput(prev => ({ ...prev, [item.id]: !prev[item.id] }))} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase transition-all", (observations[item.id] || showObsInput[item.id]) ? "bg-primary/10 text-primary" : "text-slate-400")}><MessageSquare className="h-3.5 w-3.5" /> {observations[item.id] ? "Ver Nota" : "Observação"}</button>
                          <label className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase transition-all cursor-pointer", (itemPhotos[item.id]?.length ?? 0) > 0 ? "bg-primary/10 text-primary" : "text-slate-400 hover:bg-slate-100")}>
                            {uploadingItem === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                            {(itemPhotos[item.id]?.length ?? 0) > 0 ? `Fotos (${itemPhotos[item.id].length})` : "Anexar Foto"}
                            <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploadingItem === item.id} onChange={(e) => handlePhotoUpload(item.id, e)} />
                          </label>
                        </div>
                        {(itemPhotos[item.id]?.length ?? 0) > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {itemPhotos[item.id].map((photo, pIdx) => (
                              <div key={pIdx} className="relative group/photo rounded-xl overflow-hidden border border-slate-200 bg-white">
                                <img src={photo.url} alt={`Evidência ${pIdx + 1}`} className="w-full h-24 object-cover block" />
                                <button type="button" onClick={() => handleRemovePhoto(item.id, pIdx)} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/photo:opacity-100 transition-opacity"><X className="h-3.5 w-3.5" /></button>
                              </div>
                            ))}
                          </div>
                        )}
                        {(showObsInput[item.id] || observations[item.id]) && (<div className="space-y-3 animate-in fade-in slide-in-from-top-2"><div className="flex items-center justify-between"><Label className="text-[10px] font-black text-primary uppercase">Relato de Irregularidade</Label><div className="flex gap-2"><Button onClick={() => handlePolishText(item.id)} disabled={polishingItem === item.id} variant="ghost" size="sm" className="h-7 px-3 bg-violet-50 text-violet-600 rounded-lg font-black text-[10px] uppercase">{polishingItem === item.id ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Sparkles className="h-3 w-3 mr-1.5" />} IA</Button></div></div><Textarea value={observations[item.id] || ""} onChange={e => { setObservations(prev => ({ ...prev, [item.id]: e.target.value.toUpperCase() })); }} onBlur={() => handleSaveDraft(false)} placeholder="Descreva a situação..." className="min-h-[100px] rounded-2xl bg-white border-slate-200 text-sm font-medium uppercase" /></div>)}
                      </div>
                      )
                    ))}
                  </div>
                </div>
              ))}
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
