import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { scheduleApiClient } from '../../services/api';
import { useSseStream } from '../../services/realtime';

const DEFAULT_SCHEDULE_ID = import.meta.env['VITE_CURRENT_SCHEDULE_ID'] ?? 'schedule-today';

/**
 * Dispatcher Board — schedule management and order prioritization.
 * Shows the Gantt-style schedule view with drag-and-drop re-ordering.
 */
export default function DispatcherBoard(): React.ReactElement {
  const { data: schedule, refetch } = useQuery({
    queryKey: ['schedule', DEFAULT_SCHEDULE_ID],
    queryFn: () => scheduleApiClient.getSchedule(DEFAULT_SCHEDULE_ID).then((r) => r.data),
    refetchInterval: 120_000,
  });

  const { isConnected } = useSseStream({
    topics: ['scheduling.schedule.replanned', 'production.order.completed'],
    onEvent: () => void refetch(),
  });

  return (
    <div className="dispatcher-board">
      <header>
        <h1>Dispatcher Board</h1>
        <span>{isConnected ? '● LIVE' : '○ Reconnecting'}</span>
      </header>

      {schedule && (
        <section>
          <h2>Schedule: {schedule.name} — {schedule.shiftDate}</h2>
          <div className="schedule-entries">
            {(schedule.entries as Array<Record<string, unknown>>).map((entry) => (
              <div key={entry['entryId'] as string} className="schedule-entry">
                <strong>Order {entry['orderId'] as string}</strong>
                <span>{entry['workCenterId'] as string}</span>
                <span>P{entry['priority'] as number}</span>
                <span>{String(entry['plannedStartAt'])} → {String(entry['plannedEndAt'])}</span>
                <StatusChip status={entry['status'] as string} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }): React.ReactElement {
  return <span className={`status-chip status-${status.toLowerCase()}`}>{status}</span>;
}
