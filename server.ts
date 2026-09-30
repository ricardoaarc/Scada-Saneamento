import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' }));

// Inicialização do cliente GoogleGenAI no backend
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Endpoint de análise e extração de Laudos Laboratoriais com IA
app.post('/api/gemini/analisar-laudo', async (req, res) => {
  try {
    const { textoLaudo, imagemBase64, mimeType } = req.body;

    if (!textoLaudo && !imagemBase64) {
      return res.status(400).json({ erro: 'Forneça o texto ou a imagem/PDF do laudo para análise.' });
    }

    const systemInstruction = `
Você é um especialista em Química de Águas, Engenharia Sanitária e Eletrodissolução/Eletroadsorção Capacitiva (FTE-CDI).
Sua função é ler laudos analíticos laboratoriais de água bruta, efluentes e água tratada (ex: normas Portaria GM/MS 888/2021, CONAMA 357/430, Standard Methods SMWW).

Extraia com exatidão máxima todos os dados do laudo fornecido no formato JSON com a seguinte estrutura:
{
  "numeroLaudo": "string",
  "laboratorio": "string",
  "solicitante": "string",
  "matriz": "string (ex: Água Bruta, Efluente, Lodo)",
  "localColeta": "string",
  "dataColeta": "string",
  "dataEmissao": "string",
  "responsavelTecnico": "string",
  "conclusaoGeral": "string com resumo executivo",
  "conformidadePortaria888": boolean,
  "parametros": [
    {
      "nome": "string",
      "resultado": "string ou número",
      "unidade": "string (ex: mg/L, µg/L, UFC/100mL, NTU, U pH)",
      "vmp": "string (Valor Máximo Permitido segundo norma)",
      "metodologia": "string (ex: EPA 300.1, SMWW 4500)",
      "emConformidade": boolean,
      "impactoFteCdi": "string explicando o impacto eletroquímico ou operacional no reator CDI"
    }
  ],
  "parametrosChaveFteCdi": {
    "fluoretoMgL": number | null,
    "ph": number | null,
    "condutividadeUsCm": number | null,
    "stdMgL": number | null,
    "cloretosMgL": number | null,
    "sulfatosMgL": number | null,
    "nitratosMgL": number | null,
    "ferroMgL": number | null,
    "durezaMgL": number | null,
    "coliformesUfc100ml": number | null,
    "dboMgL": number | null
  },
  "recomendacoesOperacionais": [
    "string com diretrizes para ajuste de tensão, vazão, retrolavagem e regeneração no reator CDI"
  ]
}
`;

    const parts: any[] = [];
    if (imagemBase64) {
      parts.push({
        inlineData: {
          mimeType: mimeType || 'image/png',
          data: imagemBase64.replace(/^data:image\/[a-z]+;base64,/, '').replace(/^data:application\/pdf;base64,/, '')
        }
      });
    }
    if (textoLaudo) {
      parts.push({ text: `Analise o seguinte laudo de laboratório:\n\n${textoLaudo}` });
    } else {
      parts.push({ text: 'Analise o laudo laboratorial contido na imagem/documento anexado.' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      }
    });

    const resultadoTexto = response.text || '{}';
    let parsedData = {};
    try {
      parsedData = JSON.parse(resultadoTexto);
    } catch {
      parsedData = { textoBruto: resultadoTexto };
    }

    res.json({ sucesso: true, dados: parsedData });
  } catch (error: any) {
    console.error('Erro na análise de laudo com Gemini:', error);
    res.status(500).json({
      sucesso: false,
      erro: error.message || 'Falha ao processar laudo com IA Gemini'
    });
  }
});

// Inicialização com suporte a Vite Middleware em desenvolvimento ou estático em produção
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[SCADA FTE-CDI] Servidor operacional na porta ${PORT}`);
  });
}

startServer();
