// Recordatorios de pago. Lo usan la página y el service worker.
// La página guarda un resumen de los pagos en el teléfono; el service worker
// lo lee cuando llega el aviso diario y arma el mensaje. Nada sale del iPhone.
const REM_CACHE = 'finanzas-data';
const REM_KEY = 'reminders.json';

function remMoney(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Resumen mínimo a partir de los datos de la app.
function remBuild(D) {
  const items = [];
  (D.fixedExpenses || []).forEach(f => {
    if (f.dueDay) items.push({ k: 'fixed:' + f.id, name: f.name, day: f.dueDay, amount: f.amount || 0 });
  });
  (D.debts || []).forEach(d => {
    if (!d.dueDay || !(d.balance > 0)) return;
    const months = {};
    (d.schedule || []).forEach(s => { months[s.month] = s.amount; });
    items.push({
      k: 'debts:' + d.id, name: d.name, day: d.dueDay, amount: d.monthlyTarget || 0,
      months: (d.schedule || []).length ? months : null, debt: true,
    });
  });
  const paid = {};
  Object.keys(D.paidStatus || {}).forEach(m => {
    const ps = D.paidStatus[m] || {};
    const keys = [];
    ['fixed', 'debts'].forEach(t => (ps[t] || []).forEach(r => { if (r && typeof r === 'object') keys.push(t + ':' + r.id); }));
    paid[m] = keys;
  });
  return { items, paid };
}

function remSave(snap) {
  if (typeof caches === 'undefined') return Promise.resolve();
  return caches.open(REM_CACHE)
    .then(c => c.put(REM_KEY, new Response(JSON.stringify(snap), { headers: { 'Content-Type': 'application/json' } })))
    .catch(() => {});
}

function remLoad() {
  if (typeof caches === 'undefined') return Promise.resolve(null);
  return caches.open(REM_CACHE).then(c => c.match(REM_KEY)).then(r => (r ? r.json() : null)).catch(() => null);
}

// Cuánto se debe de un pago en un mes dado. null = ese mes no toca.
function remAmountFor(it, month) {
  if (!it.debt) return it.amount || 0;
  if (it.months) {
    if (month in it.months) return it.months[month];
    const keys = Object.keys(it.months).sort();
    if (month < keys[0] || month > keys[keys.length - 1]) return null;
  }
  return it.amount > 0 ? it.amount : null;
}

// Mensaje del día: { title, body }.
function remBrief(snap, now) {
  if (!snap) return { title: 'Mis Finanzas', body: 'Abre la app para actualizar tus recordatorios.' };
  if (!snap.items || !snap.items.length) return { title: 'Mis Finanzas', body: 'Agrega los días de pago en la app para recibir recordatorios.' };

  const y = now.getFullYear(), mo = now.getMonth(), d = now.getDate();
  const key = (yy, mm) => yy + '-' + String(mm + 1).padStart(2, '0');
  const lastDay = (yy, mm) => new Date(yy, mm + 1, 0).getDate();
  const due = [];
  const collect = (yy, mm, offset) => {
    const m = key(yy, mm), last = lastDay(yy, mm), paid = new Set((snap.paid && snap.paid[m]) || []);
    snap.items.forEach(it => {
      if (paid.has(it.k)) return;
      const amount = remAmountFor(it, m);
      if (amount === null) return;
      const day = Math.min(it.day, last);
      due.push({ name: it.name, amount, day, inDays: offset + day - d });
    });
  };
  collect(y, mo, 0);
  // Los primeros días del mes siguiente también cuentan como "próximos".
  const left = lastDay(y, mo) - d;
  if (left < 3) {
    const before = due.length;
    collect(mo === 11 ? y + 1 : y, (mo + 1) % 12, lastDay(y, mo));
    for (let i = due.length - 1; i >= before; i--) if (due[i].inDays > 3) due.splice(i, 1);
  }
  due.sort((a, b) => a.inDays - b.inDays);

  const label = x => x.name + (x.amount > 0 ? ' ' + remMoney(x.amount) : '');
  const when = x => (x.inDays === 1 ? 'mañana' : 'en ' + x.inDays + ' días');
  const today = due.filter(x => x.inDays === 0);
  const late = due.filter(x => x.inDays < 0);
  const soon = due.filter(x => x.inDays > 0 && x.inDays <= 3);
  const later = due.filter(x => x.inDays > 3);

  if (today.length) {
    return {
      title: today.length === 1 ? 'Hoy vence ' + today[0].name : 'Hoy vencen ' + today.length + ' pagos',
      body: today.map(label).join(', ') + (late.length ? '. Atrasados: ' + late.map(label).join(', ') : '') + '.',
    };
  }
  if (late.length) {
    return {
      title: late.length === 1 ? 'Tienes un pago atrasado' : 'Tienes ' + late.length + ' pagos atrasados',
      body: late.map(x => label(x) + ' (día ' + x.day + ')').join(', ') + '.' +
        (soon.length ? ' Próximos: ' + soon.map(x => label(x) + ', ' + when(x)).join('. ') + '.' : ''),
    };
  }
  if (soon.length) {
    return {
      title: soon.length === 1 ? soon[0].name + ' vence ' + when(soon[0]) : 'Pagos próximos',
      body: soon.length === 1 ? label(soon[0]) + '.' : soon.map(x => label(x) + ', ' + when(x)).join('. ') + '.',
    };
  }
  if (later.length) return { title: 'Sin pagos en los próximos días', body: 'Próximo: ' + label(later[0]) + ', el día ' + later[0].day + '.' };
  return { title: 'Sin pagos pendientes', body: 'Todo lo que tiene día de pago está al día este mes.' };
}
