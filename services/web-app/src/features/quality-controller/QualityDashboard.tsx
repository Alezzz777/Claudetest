import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { qualityOrderApi } from '../../services/api';
import { useSseStream } from '../../services/realtime';

/**
 * Quality Controller Dashboard — NCR tracking, inspection results, quality trends.
 */
export default function QualityDashboard(): React.ReactElement {
  const { isConnected } = useSseStream({
    topics: ['quality.ncr.raised', 'quality.measurement.recorded', 'quality.hold.placed'],
    onEvent: (event) => {
      if (event.type === 'quality.ncr.raised') {
        // Could trigger notification/alert
        console.warn('NCR raised:', event.data);
      }
    },
  });

  return (
    <div className="quality-dashboard">
      <header>
        <h1>Quality Dashboard</h1>
        <span>{isConnected ? '● LIVE' : '○ Reconnecting'}</span>
      </header>

      <section className="summary-cards">
        <SummaryCard title="Open NCRs" value="—" color="#F44336" />
        <SummaryCard title="On Hold Lots" value="—" color="#FF9800" />
        <SummaryCard title="Pass Rate Today" value="—" color="#4CAF50" />
        <SummaryCard title="Inspections Today" value="—" color="#2196F3" />
      </section>

      <section>
        <h2>Recent Non-Conformances</h2>
        <p>NCR list loads from quality-service projections</p>
      </section>
    </div>
  );
}

function SummaryCard({ title, value, color }: { title: string; value: string; color: string }): React.ReactElement {
  return (
    <div className="summary-card" style={{ borderLeft: `4px solid ${color}`, padding: '16px', background: '#f5f5f5', borderRadius: 4, minWidth: 150 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{title}</div>
    </div>
  );
}
