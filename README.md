# No Man's AI

A minimal Smallville-style social simulation with two autonomous residents:

- Sam, powered by `gpt-5-nano`
- Jeremy, powered by `gpt-5-nano`

The app runs a compact town with four locations. Each simulation tick, the characters choose one action, generate or store a memory, and react to each other through movement, observation, reflection, or dialogue.

## Stack

- React + Vite frontend
- Express simulation server
- OpenAI Responses API for live character decisions
- Structured outputs with Zod for reliable action parsing

## Run it

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add environment variables:

   ```bash
   cp .env.example .env
   ```

3. Set `OPENAI_API_KEY` in `.env` if you want live model behavior.

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:5173`.

If no API key is present, the simulation still works in mock mode with deterministic fallback behavior.

## API

- `GET /api/state`
- `POST /api/step`
- `POST /api/reset`

## Notes

- The backend uses the Responses API with `gpt-5-nano`.
- Character turns are requested as structured JSON, then applied to a shared simulation state.
- This is intentionally small and readable so you can extend it into a richer Smallville-style environment next.
