(() => {
    const form = document.getElementById('login-form');
    const err = document.getElementById('login-error');

    if (localStorage.getItem('token')) {
        location.href = '/app.html';
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.classList.add('hidden');
        const data = Object.fromEntries(new FormData(form).entries());
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const body = await res.json();
            if (!res.ok) {
                err.textContent = body.error || 'Ошибка входа';
                err.classList.remove('hidden');
                return;
            }
            localStorage.setItem('token', body.token);
            localStorage.setItem('user', JSON.stringify(body.user));
            location.href = '/app.html';
        } catch (e2) {
            err.textContent = 'Сервер недоступен';
            err.classList.remove('hidden');
        }
    });
})();
