(() => {
    const summary = document.getElementById('status-summary');
    const summaryText = summary.querySelector('.status-text');
    const apiStatus = document.getElementById('api-status');
    const dbStatus = document.getElementById('db-status');
    const dbLatency = document.getElementById('db-latency');
    const serverTime = document.getElementById('server-time');
    const uptime = document.getElementById('uptime');
    const lastCheck = document.getElementById('last-check');

    function formatUptime(seconds) {
        seconds = Math.floor(seconds || 0);
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        const parts = [];
        if (d) parts.push(d + 'д');
        if (h || d) parts.push(h + 'ч');
        if (m || h || d) parts.push(m + 'м');
        parts.push(s + 'с');
        return parts.join(' ');
    }

    async function check() {
        summary.className = 'status-summary checking';
        summaryText.textContent = 'Проверка…';
        try {
            const res = await fetch('/api/health', { cache: 'no-store' });
            const data = await res.json();
            const ok = res.ok && data.ok && data.db === 'ok';

            summary.className = 'status-summary ' + (ok ? 'ok' : 'err');
            summaryText.textContent = ok ? 'Всё работает' : 'Есть проблемы';

            apiStatus.textContent = data.api === 'ok' ? 'OK' : ('Ошибка: ' + (data.api || 'неизвестно'));
            dbStatus.textContent = data.db === 'ok' ? 'OK' : ('Ошибка: ' + (data.db_error || data.db || 'нет связи'));
            dbLatency.textContent = data.db_latency_ms != null ? data.db_latency_ms + ' мс' : '—';
            serverTime.textContent = data.server_time ? new Date(data.server_time).toLocaleString('ru-RU') : '—';
            uptime.textContent = formatUptime(data.uptime_seconds);
        } catch (err) {
            summary.className = 'status-summary err';
            summaryText.textContent = 'API недоступен';
            apiStatus.textContent = 'недоступен';
            dbStatus.textContent = '—';
            dbLatency.textContent = '—';
            serverTime.textContent = '—';
            uptime.textContent = '—';
        }
        lastCheck.textContent = new Date().toLocaleTimeString('ru-RU');
    }

    document.getElementById('refresh-now').addEventListener('click', check);
    check();
    setInterval(check, 5000);
})();
