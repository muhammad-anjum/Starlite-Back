import { animate } from 'https://cdn.jsdelivr.net/npm/motion@latest/+esm';

const root = document.documentElement;
const splash = document.querySelector('.transition-splash');
const colors = { coral: '#f36d75', blue: '#a9dce5', yellow: '#ffd353', green: '#a9d3b3' };
const apiBase = window.STARLITE_CONFIG?.apiBase || '';

document.querySelectorAll('.year').forEach((element) => { element.textContent = new Date().getFullYear(); });

document.querySelectorAll('.site-nav a').forEach((link) => {
  link.addEventListener('click', (event) => {
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
    event.preventDefault();
    root.style.setProperty('--transition-color', colors[link.dataset.color] || colors.coral);
    splash.classList.remove('go');
    void splash.offsetWidth;
    splash.classList.add('go');
    setTimeout(() => { window.location.href = link.href; }, 400);
  });
});

const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('.site-nav');
menu?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open));
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('visible');
    observer.unobserve(entry.target);
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

const inquiryForm = document.querySelector('#inquiry-form');
const status = document.querySelector('.form-status');
inquiryForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = inquiryForm.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(inquiryForm).entries());
  submit.disabled = true;
  submit.innerHTML = 'Sending inquiry <span>…</span>';
  status.textContent = '';
  try {
    const response = await fetch(`${apiBase}/api/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to send inquiry.');
    inquiryForm.reset();
    status.textContent = 'Your inquiry was sent. Thank you — we will be in touch soon.';
    animate(inquiryForm, { scale: [1, 1.015, 1] }, { duration: .45, ease: 'easeOut' });
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.innerHTML = 'Send inquiry <span>↗</span>';
  }
});

