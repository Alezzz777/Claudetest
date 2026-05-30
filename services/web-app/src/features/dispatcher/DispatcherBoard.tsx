import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduleApi2, ScheduleDetailDto, ScheduleEntryDto } from '../../services/api';
import { useSseStream } from '../../services/realtime';

const TODAY = new Date().toISOString().slice(0, 10);
const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 06:00 - 21:00

export default function DispatcherBoard(): React.ReactElement {
  const queryClient = useQueryClient();
  const [showNewSchedule, setShowNewSchedule] = useState(false);
  const [showInsertOrder, setShowInsertOrder] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntryDto | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  const { data: schedulesPage, isLoading } = useQuery({
    queryKey: ['schedules', TODAY],
    queryFn: () => scheduleApi2.listSchedules({ shiftDate: TODAY }),
  });

  const schedules = schedulesPage?.items ?? [];
  const activeScheduleId = selectedScheduleId ?? schedules[0]?.scheduleId ?? null;

  const { data: schedule } = useQuery({
    queryKey: ['schedule', activeScheduleId],
    queryFn: () => scheduleApi2.getSchedule(activeScheduleId!),
    enabled: !!activeScheduleId,
  });

  const { isConnected } = useSseStream({
    topics: ['scheduling.schedule.replanned', 'production.order.completed'],
    onEvent: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedules'] });
      void queryClient.invalidateQueries({ queryKey: ['schedule'] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => scheduleApi2.publishSchedule(activeScheduleId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedule'] }),
  });

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Dispatcher Board</h1>
        <span style={{ background: isConnected ? '#4caf50' : '#f44336', color: '#fff', borderRadius: 4, padding: '2px 10px', fontSize: 12 }}>
          {isConnected ? 'LIVE' : 'RECONNECTING...'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => setShowNewSchedule(true)} style={btnStyle('#1976d2')}>New Schedule</button>
          {activeScheduleId && (
            <>
              <button onClick={() => setShowInsertOrder(true)} style={btnStyle('#388e3c')}>Insert Order</button>
              <button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending} style={btnStyle('#7b1fa2')}>
                {publishMutation.isPending ? 'Publishing...' : 'Publish Schedule'}
              </button>
            </>
          )}
        </div>
      </div>

      {schedules.length > 1 && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          {schedules.map((s) => (
            <button key={s.scheduleId} onClick={() => setSelectedScheduleId(s.scheduleId)}
              style={btnStyle(s.scheduleId === activeScheduleId ? '#1976d2' : '#757575')}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {isLoading && <div>Loading schedules...</div>}

      {schedule ? (
        <GanttView schedule={schedule} onSelectEntry={setSelectedEntry} />
      ) : (
        !isLoading && <div style={{ color: '#666' }}>No schedule for today. Create one to get started.</div>
      )}

      {showNewSchedule && (
        <NewScheduleModal
          onClose={() => setShowNewSchedule(false)}
          onCreated={(id) => { setSelectedScheduleId(id); setShowNewSchedule(false); }}
        />
      )}

      {showInsertOrder && activeScheduleId && (
        <InsertOrderModal
          scheduleId={activeScheduleId}
          onClose={() => setShowInsertOrder(false)}
          onInserted={() => { void queryClient.invalidateQueries({ queryKey: ['schedule'] }); setShowInsertOrder(false); }}
        />
      )}

      {selectedEntry && activeScheduleId && (
        <RescheduleModal
          scheduleId={activeScheduleId}
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onRescheduled={() => { void queryClient.invalidateQueries({ queryKey: ['schedule'] }); setSelectedEntry(null); }}
        />
      )}
    </div>
  );
}

function GanttView({ schedule, onSelectEntry }: { schedule: ScheduleDetailDto; onSelectEntry: (e: ScheduleEntryDto) => void }): React.ReactElement {
  const workCenters = [...new Set(schedule.entries.map((e) => e.workCenterId))];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>{schedule.name} — {schedule.shiftDate}
        <span style={{ marginLeft: 12 }}><StatusBadge status={schedule.status} /></span>
      </h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={thStyle}>Work Center</th>
              {HOURS.map((h) => (
                <th key={h} style={{ ...thStyle, minWidth: 60, fontSize: 11 }}>{h}:00</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workCenters.map((wc) => (
              <tr key={wc}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{wc}</td>
                {HOURS.map((h) => {
                  const entry = schedule.entries.find((e) => {
                    const start = new Date(e.plannedStartAt).getHours();
                    return e.workCenterId === wc && start === h;
                  });
                  return (
                    <td key={h} style={tdStyle}>
                      {entry && (
                        <div
                          onClick={() => onSelectEntry(entry)}
                          style={{
                            background: statusColor(entry.status),
                            color: '#fff',
                            borderRadius: 4,
                            padding: '2px 6px',
                            fontSize: 11,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {entry.orderId.slice(0, 8)} P{entry.priority}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {schedule.entries.length === 0 && (
        <div style={{ color: '#666', padding: '16px 0' }}>No orders scheduled. Click "Insert Order" to add.</div>
      )}
    </div>
  );
}

function NewScheduleModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }): React.ReactElement {
  const [name, setName] = useState('');
  const [shiftDate, setShiftDate] = useState(TODAY);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => scheduleApi2.createSchedule({ name, shiftDate }),
    onSuccess: (data) => onCreated(data.scheduleId),
    onError: (e) => setError(String(e)),
  });

  return (
    <Modal title="New Schedule" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} /></Field>
        <Field label="Shift Date"><input type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} style={inputStyle} /></Field>
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name} style={btnStyle('#1976d2')}>
          {mutation.isPending ? 'Creating...' : 'Create'}
        </button>
      </div>
    </Modal>
  );
}

function InsertOrderModal({ scheduleId, onClose, onInserted }: { scheduleId: string; onClose: () => void; onInserted: () => void }): React.ReactElement {
  const [orderId, setOrderId] = useState('');
  const [workCenterId, setWorkCenterId] = useState('');
  const [priority, setPriority] = useState('1');
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => scheduleApi2.insertOrder(scheduleId, { orderId, workCenterId, priority: Number(priority), plannedStartAt: plannedStart, plannedEndAt: plannedEnd }),
    onSuccess: onInserted,
    onError: (e) => setError(String(e)),
  });

  return (
    <Modal title="Insert Order" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Order ID"><input value={orderId} onChange={(e) => setOrderId(e.target.value)} style={inputStyle} /></Field>
        <Field label="Work Center ID"><input value={workCenterId} onChange={(e) => setWorkCenterId(e.target.value)} style={inputStyle} /></Field>
        <Field label="Priority"><input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle} /></Field>
        <Field label="Planned Start"><input type="datetime-local" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} style={inputStyle} /></Field>
        <Field label="Planned End"><input type="datetime-local" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} style={inputStyle} /></Field>
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending} style={btnStyle('#388e3c')}>
          {mutation.isPending ? 'Inserting...' : 'Insert'}
        </button>
      </div>
    </Modal>
  );
}

function RescheduleModal({ scheduleId, entry, onClose, onRescheduled }: { scheduleId: string; entry: ScheduleEntryDto; onClose: () => void; onRescheduled: () => void }): React.ReactElement {
  const [plannedStart, setPlannedStart] = useState(entry.plannedStartAt.slice(0, 16));
  const [plannedEnd, setPlannedEnd] = useState(entry.plannedEndAt.slice(0, 16));
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => scheduleApi2.rescheduleEntry(scheduleId, entry.entryId, { plannedStartAt: plannedStart, plannedEndAt: plannedEnd }),
    onSuccess: onRescheduled,
    onError: (e) => setError(String(e)),
  });

  return (
    <Modal title={`Reschedule: ${entry.orderId}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="New Start"><input type="datetime-local" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} style={inputStyle} /></Field>
        <Field label="New End"><input type="datetime-local" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} style={inputStyle} /></Field>
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <button onClick={() => mutation.mutate()} disabled={mutation.isPending} style={btnStyle('#1976d2')}>
          {mutation.isPending ? 'Saving...' : 'Reschedule'}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, minWidth: 360, maxWidth: 480, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <label>
      <div style={{ fontSize: 13, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  return (
    <span style={{ background: statusColor(status), color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
      {status}
    </span>
  );
}

function statusColor(status: string): string {
  const map: Record<string, string> = { PLANNED: '#1976d2', IN_PROGRESS: '#388e3c', COMPLETED: '#757575', PUBLISHED: '#7b1fa2', DRAFT: '#f57c00' };
  return map[status] ?? '#9e9e9e';
}

function btnStyle(bg: string): React.CSSProperties {
  return { padding: '8px 16px', background: bg, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' };
}

const thStyle: React.CSSProperties = { padding: '8px 12px', background: '#f5f5f5', border: '1px solid #e0e0e0', textAlign: 'left', fontSize: 13 };
const tdStyle: React.CSSProperties = { padding: '4px 6px', border: '1px solid #e0e0e0', verticalAlign: 'middle', height: 36 };
const inputStyle: React.CSSProperties = { width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc', boxSizing: 'border-box' };
