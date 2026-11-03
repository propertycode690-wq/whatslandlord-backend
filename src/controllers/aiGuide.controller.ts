import { Request, Response } from 'express';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface GuideStep {
  stepNumber: number;
  title: string;
  description: string;
}

export interface PageGuide {
  pageKey: string;
  title: {
    en: string;
    es: string;
  };
  subtitle: {
    en: string;
    es: string;
  };
  steps: {
    en: GuideStep[];
    es: GuideStep[];
  };
}

// Master Guidelines Registry - Strictly verified steps
export const PAGE_GUIDES: Record<string, PageGuide> = {
  'new-property': {
    pageKey: 'new-property',
    title: {
      en: 'How to Add a New Property',
      es: 'Cómo Registrar una Nueva Propiedad',
    },
    subtitle: {
      en: 'Follow these 4 simple steps to register a property asset in your management ledger.',
      es: 'Siga estos 4 sencillos pasos para registrar una propiedad en su sistema de gestión.',
    },
    steps: {
      en: [
        {
          stepNumber: 1,
          title: 'Basic Info & Property Type',
          description: 'Enter the Property Name, select the Type (such as Apartment or Commercial), and set the initial Status to Active.',
        },
        {
          stepNumber: 2,
          title: 'Address & Unit Structure',
          description: 'Fill in the complete street address, city, state, country, and zip code. Then specify total floors and total units in the building.',
        },
        {
          stepNumber: 3,
          title: 'Assign Owner & Ownership %',
          description: 'Select the assigned Property Owner from the dropdown or click "+ Add Owner" to create one. Enter their ownership percentage (usually 100%).',
        },
        {
          stepNumber: 4,
          title: 'Payment Setup & Save',
          description: 'Keep company default payment settings or configure a custom gateway. Optionally expand "Additional Details" for photos, valuation, and documents, then click "Create Property".',
        },
      ],
      es: [
        {
          stepNumber: 1,
          title: 'Información Básica y Tipo',
          description: 'Ingrese el Nombre de la Propiedad, seleccione el Tipo (como Apartamento o Comercial) y configure el estado en Activo.',
        },
        {
          stepNumber: 2,
          title: 'Dirección y Unidades',
          description: 'Complete la dirección, ciudad, estado, país y código postal. Luego defina el total de pisos y unidades del edificio.',
        },
        {
          stepNumber: 3,
          title: 'Asignar Propietario y Porcentaje',
          description: 'Seleccione el Propietario asignado del menú o haga clic en "+ Agregar Propietario". Ingrese el porcentaje de propiedad (generalmente 100%).',
        },
        {
          stepNumber: 4,
          title: 'Configuración de Pagos y Guardar',
          description: 'Mantenga la pasarela de pagos predeterminada o configure una personalizada. Opcionalmente añada fotos y documentos, y haga clic en "Crear Propiedad".',
        },
      ],
    },
  },
  'properties-list': {
    pageKey: 'properties-list',
    title: {
      en: 'How to Manage Properties & Portfolio',
      es: 'Cómo Gestionar Propiedades y Portafolio',
    },
    subtitle: {
      en: 'Learn how to oversee assets, filter properties, and run exports.',
      es: 'Aprenda a supervisar activos, filtrar propiedades y realizar exportaciones.',
    },
    steps: {
      en: [
        {
          stepNumber: 1,
          title: 'Create or Import Properties',
          description: 'Click "+ Add Property" on the top right to add a single property, or use "Import Excel" to upload multiple properties at once.',
        },
        {
          stepNumber: 2,
          title: 'Filter & Search',
          description: 'Quickly find assets by typing in the search bar or filtering by Property Type, Status, or Owner.',
        },
        {
          stepNumber: 3,
          title: 'Review Financials & Actions',
          description: 'View real-time occupancy rates, unit counts, and monthly revenue. Use the action buttons on the right to view, edit, or delete.',
        },
      ],
      es: [
        {
          stepNumber: 1,
          title: 'Crear o Importar Propiedades',
          description: 'Haga clic en "+ Agregar Propiedad" para añadir una propiedad, o use "Importar Excel" para cargar varias a la vez.',
        },
        {
          stepNumber: 2,
          title: 'Filtrar y Buscar',
          description: 'Encuentre activos escribiendo en la barra de búsqueda o filtrando por Tipo, Estado o Propietario.',
        },
        {
          stepNumber: 3,
          title: 'Revisar Finanzas y Acciones',
          description: 'Supervise tasas de ocupación, unidades y rentas mensuales. Use los botones de acción para ver, editar o eliminar.',
        },
      ],
    },
  },
};

export class AiGuideController {
  // 1. Get Guide Content for a Page
  async getGuideContent(req: Request, res: Response): Promise<void> {
    try {
      const pageKey = (req.params.pageKey || req.query.pageKey || '').toString().toLowerCase();
      const guide = PAGE_GUIDES[pageKey] || PAGE_GUIDES['new-property'];

      res.status(200).json({
        success: true,
        data: guide,
      });
    } catch (error: any) {
      logger.error(`[AIGuide] Error fetching guide content: ${error.message}`);
      res.status(500).json({
        success: false,
        error: { message: 'Failed to retrieve page guide content' },
      });
    }
  }

  // 2. Stream Audio Speech via OpenAI TTS
  async streamVoiceSpeech(req: Request, res: Response): Promise<void> {
    try {
      const { text, pageKey, lang = 'en', voice = 'nova' } = req.body || {};
      const language = lang === 'es' ? 'es' : 'en';

      let speechText = (text || '').trim();

      // If text not passed directly, construct speech text from verified guide steps
      if (!speechText && pageKey) {
        const guide = PAGE_GUIDES[pageKey];
        if (guide) {
          const steps = guide.steps[language] || guide.steps.en;
          const intro = `${guide.title[language]}. ${guide.subtitle[language]} `;
          const body = steps
            .map((s) => `Step ${s.stepNumber}: ${s.title}. ${s.description}`)
            .join(' ');
          speechText = `${intro} ${body}`;
        }
      }

      if (!speechText) {
        res.status(400).json({
          success: false,
          error: { message: 'Speech text or valid pageKey is required' },
        });
        return;
      }

      const openAiApiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';

      if (!openAiApiKey || openAiApiKey === 'your_openai_api_key_here' || openAiApiKey.trim().length < 10) {
        res.status(503).json({
          success: false,
          fallbackToBrowserSpeech: true,
          error: { message: 'OpenAI API key is not configured on server' },
        });
        return;
      }

      // Call OpenAI TTS Endpoint
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiApiKey.trim()}`,
      };

      if (env.OPENAI_ORG_ID || process.env.OPENAI_ORG_ID) {
        headers['OpenAI-Organization'] = (env.OPENAI_ORG_ID || process.env.OPENAI_ORG_ID || '').trim();
      }

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'tts-1',
          input: speechText,
          voice: voice || 'nova',
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error(`[AIGuide] OpenAI TTS API error: ${response.status} - ${errText}`);
        res.status(response.status).json({
          success: false,
          fallbackToBrowserSpeech: true,
          error: { message: 'OpenAI TTS service returned an error', details: errText },
        });
        return;
      }

      // Stream MP3 directly to response (In-Memory Streaming, No Cloudinary/Disk storage required!)
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hour client cache

      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (error: any) {
      logger.error(`[AIGuide] Speech streaming failed: ${error.message}`);
      res.status(500).json({
        success: false,
        fallbackToBrowserSpeech: true,
        error: { message: error.message || 'Internal server error while generating audio' },
      });
    }
  }
}

export const aiGuideController = new AiGuideController();

