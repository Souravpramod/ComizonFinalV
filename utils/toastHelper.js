export function showToast(msg, type='danger') {
    const id = 'toast_' + Date.now();
    const bg = type === 'success' ? 'bg-success' : type === 'warning' ? 'bg-warning text-dark' : 'bg-danger';
    const el = document.createElement('div');
    el.id = id;
    el.className = `toast align-items-center text-white border-0 ${bg} position-fixed rounded-0`;
    el.style.cssText = 'top:80px;right:20px;z-index:9999;min-width:280px;';
    el.setAttribute('role','alert');
    el.innerHTML = `<div class="d-flex"><div class="toast-body fw-semibold">${msg}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    document.body.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 4000 });
    t.show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
}