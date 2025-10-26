"use client";

import type { JSX } from "react";
import { useEffect, useState } from "react";

type HealthPayload = {
  status: string;
  service: string;
  time: string;
};

type HealthState =
  | { kind: "loading" }
  | { kind: "ready"; data: HealthPayload }
  | { kind: "error"; message: string };

const HEALTH_ENDPOINT =
  `${process.env.NEXT_PUBLIC_API_URL ?? ""}`.replace(/\/$/, "") + "/api/health";

/**
 * Клиентская страница, которая опрашивает бэкенд и отображает состояние сервиса.
 */
export default function HealthPage(): JSX.Element {
  const [state, setState] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    let isMounted = true;

    const fetchHealth = async () => {
      try {
        const response = await fetch(HEALTH_ENDPOINT, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Ошибка запроса: ${response.status}`);
        }
        const data: HealthPayload = await response.json();
        if (isMounted) {
          setState({ kind: "ready", data });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Неизвестная ошибка запроса";
        if (isMounted) {
          setState({ kind: "error", message });
        }
      }
    };

    void fetchHealth();
    return () => {
      isMounted = false;
    };
  }, []);

  const renderContent = () => {
    if (state.kind === "loading") {
      return (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="health-card health-card--loading"
        >
          Загрузка состояния сервиса…
        </div>
      );
    }

    if (state.kind === "error") {
      return (
        <div
          role="status"
          aria-live="polite"
          className="health-card health-card--error"
        >
          <p className="health-card__title">Статус сервиса недоступен</p>
          <p role="alert">Причина: {state.message}</p>
        </div>
      );
    }

    const { data } = state;
    const formattedTime = new Date(data.time).toLocaleString();

    return (
      <div
        role="status"
        aria-live="polite"
        className="health-card health-card--ok"
      >
        <p className="health-card__title">Бэкенд отвечает</p>
        <dl>
          <div className="health-card__row">
            <dt>Статус:</dt>
            <dd>{data.status}</dd>
          </div>
          <div className="health-card__row">
            <dt>Сервис:</dt>
            <dd>{data.service}</dd>
          </div>
          <div className="health-card__row">
            <dt>Время:</dt>
            <dd>{formattedTime}</dd>
          </div>
        </dl>
      </div>
    );
  };

  return (
    <main className="health-page" aria-labelledby="health-page-title">
      <h1 id="health-page-title">Health-check</h1>
      {renderContent()}
      <style jsx>{`
        .health-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          padding: 2rem 1rem;
          max-width: 32rem;
          margin: 0 auto;
        }

        .health-card {
          border-radius: 1rem;
          border: 1px solid rgba(0, 0, 0, 0.1);
          padding: 1.5rem;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(6px);
        }

        .health-card__title {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 1rem;
        }

        .health-card__row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }

        .health-card__row:last-of-type {
          margin-bottom: 0;
        }

        .health-card--loading {
          animation: pulse 1.5s ease-in-out infinite;
        }

        .health-card--error {
          border-color: rgba(255, 99, 71, 0.5);
          background: rgba(255, 240, 240, 0.8);
        }

        .health-card--ok {
          border-color: rgba(46, 204, 113, 0.4);
          background: rgba(236, 253, 245, 0.8);
        }

        @keyframes pulse {
          0% {
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0.6;
          }
        }
      `}</style>
    </main>
  );
}
