import 'dotenv/config';

import cors from 'cors';
import express from 'express';

import { SmallvilleSimulation } from './simulation.js';

const app = express();
const simulation = new SmallvilleSimulation();
const port = Number(process.env.PORT ?? 8787);

app.use(cors());
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/state', (_request, response) => {
  response.json(simulation.getState());
});

app.post('/api/reset', (_request, response) => {
  response.json(simulation.reset());
});

app.post('/api/step', async (_request, response) => {
  try {
    const state = await simulation.step();
    response.json(state);
  } catch (error) {
    console.error('Simulation step failed.', error);
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Unknown simulation error',
    });
  }
});

app.listen(port, () => {
  console.log(`No Man's AI server listening on http://localhost:${port}`);
});
