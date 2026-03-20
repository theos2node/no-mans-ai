import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react';

import type { AgentState, SimulationState } from '../shared/types';

async function requestState(path: string, init?: RequestInit): Promise<SimulationState> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Request failed.');
  }

  return (await response.json()) as SimulationState;
}

function formatMemoryType(type: AgentState['memories'][number]['type']): string {
  switch (type) {
    case 'action':
      return 'Action';
    case 'conversation':
      return 'Conversation';
    case 'observation':
      return 'Observation';
    case 'reflection':
      return 'Reflection';
  }
}

export default function App() {
  const [simulation, setSimulation] = useState<SimulationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoRun, setAutoRun] = useState(false);

  const busyRef = useRef(false);

  const loadInitialState = useEffectEvent(async () => {
    try {
      const nextState = await requestState('/api/state');
      startTransition(() => {
        setSimulation(nextState);
      });
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load simulation.');
    }
  });

  const stepSimulation = useEffectEvent(async () => {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);

    try {
      const nextState = await requestState('/api/step', { method: 'POST' });
      startTransition(() => {
        setSimulation(nextState);
      });
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to advance the simulation.');
      setAutoRun(false);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  });

  const resetSimulation = useEffectEvent(async () => {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);

    try {
      const nextState = await requestState('/api/reset', { method: 'POST' });
      startTransition(() => {
        setSimulation(nextState);
      });
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to reset the simulation.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  });

  useEffect(() => {
    void loadInitialState();
  }, [loadInitialState]);

  useEffect(() => {
    if (!autoRun) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void stepSimulation();
    }, 2800);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoRun, stepSimulation]);

  if (!simulation) {
    return (
      <main className="app-shell loading-shell">
        <section className="hero-card">
          <p className="eyebrow">No Man&apos;s AI</p>
          <h1>Loading the town...</h1>
          {error ? <p className="error-banner">{error}</p> : <p>Booting Sam and Jeremy.</p>}
        </section>
      </main>
    );
  }

  const residentsByLocation = new Map(
    simulation.locations.map((location) => [
      location.id,
      simulation.agents.filter((agent) => agent.locationId === location.id),
    ]),
  );

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">No Man&apos;s AI</p>
          <h1>Smallville-style social sandbox for two GPT-5 Nano characters.</h1>
          <p className="hero-text">{simulation.worldPremise}</p>
        </div>

        <div className="status-row">
          <span className="status-pill">{simulation.mode === 'live' ? 'Live OpenAI mode' : 'Mock fallback mode'}</span>
          <span className="status-pill">Tick {simulation.tick}</span>
          <span className="status-pill">Residents {simulation.agents.length}</span>
        </div>

        <div className="control-row">
          <button className="primary-button" disabled={busy} onClick={() => void stepSimulation()}>
            {busy ? 'Thinking...' : 'Advance One Tick'}
          </button>
          <button className="secondary-button" disabled={busy} onClick={() => setAutoRun((value) => !value)}>
            {autoRun ? 'Stop Auto Run' : 'Start Auto Run'}
          </button>
          <button className="ghost-button" disabled={busy} onClick={() => void resetSimulation()}>
            Reset Town
          </button>
        </div>

        {error ? <p className="error-banner">{error}</p> : null}
      </section>

      <section className="panel-grid">
        <div className="panel panel-span-2">
          <div className="panel-header">
            <p className="eyebrow">Map</p>
            <h2>Town State</h2>
          </div>

          <div className="location-grid">
            {simulation.locations.map((location) => (
              <article className="location-card" key={location.id} style={{ '--accent': location.accent } as React.CSSProperties}>
                <div className="location-card-header">
                  <div>
                    <h3>{location.name}</h3>
                    <p>{location.description}</p>
                  </div>
                  <span className="location-count">{residentsByLocation.get(location.id)?.length ?? 0}</span>
                </div>

                <div className="residents-row">
                  {(residentsByLocation.get(location.id) ?? []).map((resident) => (
                    <span className="resident-chip" key={resident.id}>
                      {resident.name}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        {simulation.agents.map((agent) => (
          <section className="panel agent-panel" key={agent.id} style={{ '--agent-color': agent.color } as React.CSSProperties}>
            <div className="panel-header">
              <p className="eyebrow">{agent.model}</p>
              <h2>{agent.name}</h2>
            </div>

            <div className="agent-meta">
              <span>{agent.archetype}</span>
              <span>{simulation.locations.find((location) => location.id === agent.locationId)?.name}</span>
            </div>

            <div className="agent-copy">
              <p><strong>Mood:</strong> {agent.mood}</p>
              <p><strong>Goal:</strong> {agent.goal}</p>
              <p><strong>Last thought:</strong> {agent.lastThought}</p>
              <p><strong>Last action:</strong> {agent.lastAction}</p>
              {agent.lastDialogue ? <p><strong>Last dialogue:</strong> “{agent.lastDialogue}”</p> : null}
            </div>

            <div className="relationship-box">
              <p className="eyebrow">Relationship</p>
              {Object.values(agent.relationships).map((relationship) => (
                <p key={relationship}>{relationship}</p>
              ))}
            </div>

            <div className="memory-list">
              {agent.memories
                .slice()
                .reverse()
                .map((memory) => (
                  <article className="memory-card" key={memory.id}>
                    <div className="memory-meta">
                      <span>{formatMemoryType(memory.type)}</span>
                      <span>Tick {memory.tick}</span>
                    </div>
                    <p>{memory.text}</p>
                  </article>
                ))}
            </div>
          </section>
        ))}

        <section className="panel panel-span-2 timeline-panel">
          <div className="panel-header">
            <p className="eyebrow">Timeline</p>
            <h2>Recent Events</h2>
          </div>

          <div className="timeline-list">
            {simulation.timeline.length === 0 ? (
              <p className="timeline-empty">Advance the simulation to watch the town start moving.</p>
            ) : (
              simulation.timeline
                .slice()
                .reverse()
                .map((event) => (
                  <article className="timeline-entry" key={event.id}>
                    <div className="timeline-topline">
                      <span className="timeline-badge">Tick {event.tick}</span>
                      <span>{event.actorName}</span>
                      <span>{simulation.locations.find((location) => location.id === event.locationId)?.name}</span>
                    </div>
                    <h3>{event.summary}</h3>
                    <p>{event.detail}</p>
                    {event.dialogue ? <p className="timeline-dialogue">“{event.dialogue}”</p> : null}
                  </article>
                ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
