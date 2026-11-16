import express from 'express';
import serverless from 'serverless-http';
import { getStore } from '@netlify/blobs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const router = express.Router();

app.use(express.json());


function obtenerAlmacenMetricas() {
  return getStore({
    name: 'funnel-metrics',
    consistency: 'strong'
  });
}


router.post('/metrics', async (req, res) => {
  try {
    const { step, source, sessionId, metadata } = req.body;

    
    if (!step || !source) {
      return res.status(400).json({
        status: 'error',
        message: 'Los campos "step" y "source" son obligatorios.'
      });
    }

   
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const eventId = `metric_${Date.now()}_${randomSuffix}`;
    const timestamp = new Date().toISOString();

    const metricRecord = {
      id: eventId,
      step: String(step).toLowerCase().trim(),
      source: String(source).toLowerCase().trim(),
      sessionId: sessionId || 'anon_guest',
      metadata: metadata || {},
      timestamp
    };

   
    const store = obtenerAlmacenMetricas();
    await store.setJSON(eventId, metricRecord);

    return res.status(201).json({
      status: 'success',
      message: 'Métrica persistida correctamente en Netlify Blobs.',
      data: metricRecord
    });
  } catch (error) {
    console.error('Error al registrar métrica:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Fallo interno al persistir la métrica.',
      details: error.message
    });
  }
});


router.get('/metrics', async (req, res) => {
  try {
    const { step, source } = req.query;
    const store = obtenerAlmacenMetricas();
    const { blobs } = await store.list();

    const todosLosEventos = await Promise.all(
      blobs.map(async (blob) => {
        return await store.get(blob.key, { type: 'json' });
      })
    );

    let eventosFiltrados = todosLosEventos.filter(Boolean);

   
    if (step) {
      eventosFiltrados = eventosFiltrados.filter(
        (e) => e.step === String(step).toLowerCase().trim()
      );
    }
    if (source) {
      eventosFiltrados = eventosFiltrados.filter(
        (e) => e.source === String(source).toLowerCase().trim()
      );
    }

    const summary = {
      totalEvents: eventosFiltrados.length,
      byStep: {},
      bySource: {}
    };

    for (const evento of eventosFiltrados) {
      summary.byStep[evento.step] = (summary.byStep[evento.step] || 0) + 1;
      summary.bySource[evento.source] = (summary.bySource[evento.source] || 0) + 1;
    }

    return res.status(200).json({
      status: 'success',
      data: {
        summary,
        recentEvents: eventosFiltrados.slice(0, 50)
      }
    });
  } catch (error) {
    console.error('Error al consultar métricas:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Fallo interno al consultar métricas en Netlify Blobs.',
      details: error.message
    });
  }
});


router.get('/metrics/export', async (req, res) => {
  try {
    const store = obtenerAlmacenMetricas();
    const { blobs } = await store.list();

    const eventos = await Promise.all(
      blobs.map(async (blob) => await store.get(blob.key, { type: 'json' }))
    );

    const eventosValidos = eventos.filter(Boolean);

    const encabezados = 'id,step,source,sessionId,timestamp\n';
    const filas = eventosValidos
      .map((e) => `"${e.id}","${e.step}","${e.source}","${e.sessionId}","${e.timestamp}"`)
      .join('\n');

    const csvFinal = encabezados + filas;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="metricas_funnel.csv"');
    return res.status(200).send(csvFinal);
  } catch (error) {
    console.error('Error al exportar CSV:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error al generar el archivo CSV.',
      details: error.message
    });
  }
});

app.use('/api', router);

export const handler = serverless(app);