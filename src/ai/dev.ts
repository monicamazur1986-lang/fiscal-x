import { config } from 'dotenv';
config();

import '@/ai/flows/extract-data-from-intimacao.ts';
import '@/ai/flows/generate-intimacao-draft.ts';
import '@/ai/flows/polish-observation.ts';
