/* InkHaus v2: sign-in/register page + full back office. Loaded after app.js */
const uname = id => S.us?.find(u => u.id === id)?.username || '-';
const tbl = (h, r) => `<table><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr>${r.join('') || `<tr><td colspan="${h.length}" class="empty">Nothing here yet.</td></tr>`}</table>`;
 
function login() {
  app.innerHTML = `<div class="login"><div class="tabs2"><button class="${!signup ? 'on' : ''}" onclick="signup=false;login()">Sign in</button><button class="${signup ? 'on' : ''}" onclick="signup=true;login()">Create account</button></div>
  <form class="form" onsubmit="if(this.c&&this.c.value!==this.p.value){event.preventDefault();return toast('Passwords do not match')}auth(event)">
  <h1 style="font-size:32px">${signup ? 'Join InkHaus' : 'Welcome back'}</h1><p style="margin:0;color:var(--mut)">${signup ? 'Pick a username and password. No email needed.' : 'Use your username and password.'}</p>
  <label>Username<input name="u" required minlength="3" autocomplete="username"></label>
  <label>Password<input name="p" type="password" required autocomplete="${signup ? 'new-password' : 'current-password'}"></label>
  ${signup ? '<label>Confirm password<input name="c" type="password" required></label>' : ''}
  <button class="btn">${signup ? 'Create my account' : 'Sign in'}</button></form></div>`;
}
 
async function admin() {
  if (S.role !== 'admin') return (location.hash = '#/login');
  if (!['dash', 'products', 'orders', 'customers'].includes(S.tab)) S.tab = 'dash';
  const [o, u] = await Promise.all([sb.from('orders').select('*').order('id', { ascending: false }), sb.from('profiles').select('*')]);
  S.os = o.data || []; S.us = u.data || [];
  const T = [['dash', 'Dashboard'], ['products', 'Products'], ['orders', 'Orders'], ['customers', 'Customers']];
  app.innerHTML = `<div class="adm"><aside class="side"><b>Back office</b>${T.map(([k, t]) => `<button class="${S.tab === k ? 'on' : ''}" onclick="S.tab='${k}';admin()">${t}</button>`).join('')}<a href="#/shop">View storefront</a></aside><section id="pane"></section></div>`;
  ({ dash: aDash, products: aProducts, orders: aOrders, customers: aCust }[S.tab])();
}
const addNow = () => { S.tab = 'products'; admin().then(() => pform()); };
 
function aDash() {
  const os = S.os, rev = os.filter(o => o.status !== 'Cancelled').reduce((a, o) => a + +o.total, 0), low = S.products.filter(p => p.stock < 5);
  $('#pane').innerHTML = `<div class="row" style="padding:0 0 18px"><h1>Dashboard</h1><button class="btn" onclick="addNow()">+ Add product</button></div>
  <div class="stats"><div class="stat">Revenue<b>${money(rev)}</b></div><div class="stat">Orders<b>${os.length}</b></div>
  <div class="stat">Waiting to ship<b>${os.filter(o => ['Pending', 'Paid'].includes(o.status)).length}</b></div><div class="stat">Customers<b>${S.us.filter(x => x.role !== 'admin').length}</b></div></div>
  <h2 class="h2">Low or out of stock</h2><div class="scroll">${tbl(['Product', 'Stock', ''], low.map(p => `<tr><td>${esc(p.name)}</td><td>${p.stock}</td><td><button class="btn sm ghost" onclick="pform(${p.id})">Restock</button></td></tr>`))}</div>
  <h2 class="h2">Latest orders</h2><div class="scroll">${tbl(['#', 'Customer', 'Total', 'Status'], os.slice(0, 5).map(o => `<tr><td>${o.id}</td><td>${esc(uname(o.user_id))}</td><td>${money(o.total)}</td><td><span class="status">${esc(o.status)}</span></td></tr>`))}</div>`;
}
 
function aProducts() {
  $('#pane').innerHTML = `<div class="row" style="padding:0 0 14px"><h1>Products</h1><button class="btn" onclick="pform()">+ Add product</button></div>
  <div class="bar2"><input placeholder="Search products" value="${esc(S.pq || '')}" oninput="S.pq=this.value;pTable()"><select onchange="S.pf=this.value;pTable()">
  ${[['all', 'All products'], ['low', 'Low stock'], ['out', 'Out of stock']].map(([v, t]) => `<option value="${v}" ${S.pf === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div id="pt" class="scroll"></div>`; pTable();
}
function pTable() {
  const q = (S.pq || '').toLowerCase(), f = S.pf || 'all';
  const l = S.products.filter(p => `${p.name} ${p.brand}`.toLowerCase().includes(q) && (f === 'all' || (f === 'low' && p.stock > 0 && p.stock < 5) || (f === 'out' && p.stock < 1)));
  $('#pt').innerHTML = tbl(['Image', 'Product', 'Category', 'Price', 'Stock', ''], l.map(p => `<tr><td>${img(p)}</td><td><b>${esc(p.name)}</b><br><small>${esc(p.brand)}</small></td><td>${esc(p.category)}</td><td>${money(p.price)}</td>
  <td><input class="stk" type="number" min="0" value="${p.stock}" onchange="setStock(${p.id},this.value)"></td>
  <td><button class="btn sm ghost" onclick="pform(${p.id})">Edit</button> <button class="btn sm red" onclick="del(${p.id})">Delete</button></td></tr>`));
}
async function setStock(id, v) { const n = Math.max(0, +v || 0), { error } = await sb.from('products').update({ stock: n }).eq('id', id); if (error) return toast(error.message); S.products.find(p => p.id === id).stock = n; toast('Stock updated'); }
 
function aOrders() {
  const f = S.of || 'All', l = S.os.filter(o => f === 'All' || o.status === f), ST = ['Pending', 'Paid', 'Shipped', 'Delivered', 'Cancelled'];
  $('#pane').innerHTML = `<div class="row" style="padding:0 0 14px"><h1>Orders</h1><button class="btn ghost" onclick="csv()">Download CSV</button></div>
  <div class="bar2">${['All', ...ST].map(s => `<span class="chip ${f === s ? 'on' : ''}" onclick="S.of='${s}';aOrders()">${s}</span>`).join('')}</div>
  <div class="scroll">${tbl(['#', 'Date', 'Customer', 'Items', 'Ship to', 'Total', 'Tracking', 'Status'], l.map(o => `<tr><td>${o.id}</td><td>${new Date(o.created_at).toLocaleDateString()}</td><td>${esc(uname(o.user_id))}</td>
  <td>${o.items.map(i => `${i.qty} x ${esc(i.name)}`).join('<br>')}</td><td>${esc(o.address)}</td><td>${money(o.total)}<br><small>${esc(o.payment || '')}</small></td>
  <td><input class="stk" style="width:130px" placeholder="Tracking no." value="${esc(o.tracking || '')}" onchange="setTrack(${o.id},this.value)"></td><td><select onchange="setStatus(${o.id},this.value)">${ST.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`))}</div>`;
}
function aCust() {
  $('#pane').innerHTML = `<h1 style="margin-bottom:14px">Customers</h1><div class="scroll">${tbl(['Username', 'Role', 'Orders', 'Spent'], S.us.map(u => { const m = S.os.filter(o => o.user_id === u.id && o.status !== 'Cancelled'); return `<tr><td>${esc(u.username)}</td><td>${esc(u.role)}</td><td>${m.length}</td><td>${money(m.reduce((a, o) => a + +o.total, 0))}</td></tr>`; }))}</div>`;
}
function csv() {
  const r = [['id', 'date', 'customer', 'items', 'total', 'status', 'address'], ...S.os.map(o => [o.id, o.created_at, uname(o.user_id), o.items.map(i => i.qty + 'x ' + i.name).join('; '), o.total, o.status, o.address])];
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.map(x => x.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',')).join('\n')], { type: 'text/csv' })); a.download = 'orders.csv'; a.click();
}
 
/* ---------- customer side: checkout, payment, order tracking ---------- */
const STEPS = ['Pending', 'Paid', 'Shipped', 'Delivered'];
const tl = o => o.status === 'Cancelled' ? '<span class="status" style="background:var(--mag);color:#fff">Cancelled</span>' : `<div class="tl">${STEPS.map((s, k) => `<span class="${k <= STEPS.indexOf(o.status) ? 'on' : ''}">${s}</span>`).join('')}</div>`;
function checkout() {
  if (!S.user) { $('#drawer').classList.remove('open'); toast('Sign in to place your order'); return (location.hash = '#/login'); }
  const v = JSON.parse(localStorage.getItem('ship') || '{}');
  modal(`<h2>Checkout</h2><form class="form" style="margin-top:16px" onsubmit="placeOrder(event)">
  <label>Full name<input name="n" required value="${esc(v.n)}"></label><label>Phone<input name="t" required value="${esc(v.t)}"></label>
  <label>Delivery address<textarea name="a" rows="3" required>${esc(v.a)}</textarea></label>
  <label>Payment method<select name="pay"><option>Cash on delivery</option><option>Bank transfer</option><option>PromptPay</option></select></label>
  <p style="margin:0;color:var(--mut)">For bank transfer or PromptPay, we call or message you with payment details. Your order turns Paid once we confirm it.</p>
  <div class="row" style="padding:0"><span>Total</span><strong>${money(total())}</strong></div><button class="btn">Place order</button></form>`);
}
async function placeOrder(e) {
  e.preventDefault(); const f = e.target, items = S.cart.map(c => ({ ...c, name: S.products.find(p => p.id === c.id).name }));
  localStorage.setItem('ship', JSON.stringify({ n: f.n.value, t: f.t.value, a: f.a.value }));
  const { error } = await sb.rpc('place_order', { items, addr: `${f.n.value}, ${f.t.value}, ${f.a.value}`, pay: f.pay.value });
  if (error) return toast(error.message);
  S.cart = []; saveCart(); closeModal(); $('#drawer').classList.remove('open'); await loadProducts(); toast('Order placed'); location.hash = '#/orders';
}
async function orders() {
  if (!S.user) return (location.hash = '#/login');
  const { data, error } = await sb.from('orders').select('*').eq('user_id', S.user.id).order('id', { ascending: false }); if (error) toast(error.message);
  app.innerHTML = `<div class="wrap"><h1 style="font-size:44px;margin:40px 0 20px">My orders</h1>${(data || []).map(o => `<div class="stat" style="margin-bottom:14px">
  <div class="row" style="padding:0"><b>Order #${o.id}</b><span>${new Date(o.created_at).toLocaleDateString()}</span></div>${tl(o)}
  <p>${o.items.map(i => `${i.qty} x ${esc(i.name)}`).join('<br>')}</p><p><b>${money(o.total)}</b>, ${esc(o.payment || '')}<br>Ship to: ${esc(o.address)}${o.tracking ? `<br>Tracking number: <b>${esc(o.tracking)}</b>` : ''}</p>
  ${o.status === 'Pending' ? `<button class="btn sm red" onclick="cancelOrder(${o.id})">Cancel order</button>` : ''}</div>`).join('') || '<div class="empty">No orders yet. Find your printer model on the home page.</div>'}</div>`;
}
async function cancelOrder(id) { if (!confirm('Cancel order #' + id + '?')) return; const { error } = await sb.rpc('cancel_order', { oid: id }); if (error) return toast(error.message); await loadProducts(); toast('Order cancelled'); orders(); }
async function setTrack(id, v) { const { error } = await sb.from('orders').update({ tracking: v.trim() }).eq('id', id); toast(error ? error.message : 'Tracking saved'); }
 
/* ---------- v4: illustrated product art + richer home page ---------- */
const TINT = { Printers: '#dfe4ff', Ink: '#ffd9ec', Toner: '#d4f3fb', Paper: '#fff3b8', Accessories: '#e3e6ee' };
function ico(cat, name = '') {
  const K = '#0b0d17', bg = `<rect width="120" height="120" fill="${TINT[cat] || '#e3e6ee'}"/>`;
  const col = /black/i.test(name) ? '#3b3f52' : cat === 'Ink' ? '#ff2e93' : cat === 'Toner' ? '#18c8f0' : '#2338ff';
  const art = {
    Printers: `<rect x="34" y="16" width="52" height="30" rx="3" fill="#fff"/><rect x="14" y="40" width="92" height="46" rx="10" fill="#2338ff"/><rect x="30" y="70" width="60" height="36" rx="3" fill="#fff"/><circle cx="92" cy="54" r="4" fill="#ffe14d"/><circle cx="80" cy="54" r="4" fill="#ff2e93"/><path d="M40 82h40M40 91h26"/>`,
    Ink: `<rect x="40" y="42" width="40" height="64" rx="8" fill="${col}"/><rect x="50" y="24" width="20" height="18" rx="3" fill="#fff"/><rect x="46" y="12" width="28" height="13" rx="3" fill="${K}"/><rect x="46" y="62" width="28" height="28" rx="3" fill="#fff"/><path d="M60 66c-5 7-7 10-7 14a7 7 0 0014 0c0-4-2-7-7-14z" fill="${col}"/>`,
    Toner: `<path d="M40 44V30h40v14" fill="none"/><rect x="12" y="42" width="96" height="48" rx="10" fill="${col}"/><rect x="12" y="42" width="24" height="48" rx="9" fill="${K}"/><rect x="46" y="54" width="48" height="24" rx="3" fill="#fff"/><path d="M52 62h30M52 70h20"/>`,
    Paper: `<rect x="26" y="28" width="68" height="70" rx="3" fill="#fff"/><path d="M26 36h68M26 90h68" /><rect x="26" y="48" width="68" height="30" fill="#ffe14d"/><path d="M42 63h36"/>`,
    Accessories: `<path d="M30 62c22-36 38 36 62 0" fill="none" stroke-width="7"/><rect x="8" y="50" width="24" height="24" rx="4" fill="#fff"/><rect x="88" y="50" width="24" height="24" rx="4" fill="#18c8f0"/><path d="M14 58h12M14 66h12"/>`
  }[cat] || '';
  return `<svg viewBox="0 0 120 120" aria-hidden="true">${bg}<g stroke="${K}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${art}</g></svg>`;
}
function img(p) { return p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">` : ico(p.category, p.name); }
 
function home() {
  const C = [['Printers', 'Print, scan and copy'], ['Ink', 'Bottles and sets'], ['Toner', 'Laser cartridges'], ['Paper', 'Reams for every job'], ['Accessories', 'Cables and more']];
  app.innerHTML = `<section class="hero hero2"><div><h1>Does it fit your printer?</h1><p class="lead">Type your model. We show the ink, toner and paper that work with it.</p>
  <div class="finder"><input id="fq" placeholder="Type your printer model, e.g. L3250" aria-label="Printer model" autocomplete="off" oninput="finder(this.value)" onkeydown="if(event.key==='Enter')goShop($('#fq').value)">
  <button class="btn" onclick="goShop($('#fq').value)">Show matching ink</button></div><div class="bar"><b></b><b></b><b></b><b></b></div><div class="hits" id="hits"></div></div>
  <div class="art">${ico('Printers')}<i style="background:var(--cy)"></i><i style="background:var(--mag)"></i><i style="background:var(--yel)"></i></div></section>
  <section class="wrap"><div class="cats">${C.map(([c, t]) => `<a class="cat" href="#/shop" onclick="S.cat='${c}';S.q=''">${ico(c)}<b>${c}</b><small>${t}</small></a>`).join('')}</div>
  <div class="trust"><span><b>Compatibility checked</b>Every product lists the printer models it fits.</span><span><b>Live order tracking</b>Follow your order from Pending to Delivered.</span><span><b>Pay your way</b>Cash on delivery, bank transfer or PromptPay.</span></div>
  <h2 style="font-size:34px;margin:44px 0 20px">New in the shop</h2><div class="grid">${S.products.slice(0, 4).map(card).join('')}</div></section>`;
}
 