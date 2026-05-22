window.api = (() => {
    function token() { return localStorage.getItem('token'); }

    async function request(method, url, body) {
        const headers = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const t = token();
        if (t) headers['Authorization'] = 'Bearer ' + t;

        const res = await fetch(url, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (res.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            location.href = '/';
            throw new Error('Не авторизован');
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.error || 'Ошибка запроса');
            err.status = res.status;
            throw err;
        }
        return data;
    }

    return {
        get: (url) => request('GET', url),
        post: (url, body) => request('POST', url, body || {}),
        patch: (url, body) => request('PATCH', url, body || {}),
        del: (url) => request('DELETE', url),
        currentUser: () => {
            try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
        },
        logout: () => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            location.href = '/';
        },
    };
})();
