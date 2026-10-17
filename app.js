const sb = supabase.createClient(CFG.URL, CFG.KEY);
const $ = (s, e = document) => e.querySelector(s);
const money = (n) => '$' + Number(n).toFixed(2);

// Everyone signs in with a plain username + password. Supabase needs an email and a 6+ char password,
// so both are mapped invisibly here. (123 / 123 -> admin)
const mail = (u) => u.toLowerCase().replace(/[^a-z0-9]/g, '') + '@inkhaus.app';
const pw = (p) => 'ik_' + p;
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[c])
  );

const S = {
  user: null,
  role: null,
  name: '',
  products: [],
  cart: JSON.parse(localStorage.getItem('cart') || '[]'),
  q: '',
  cat: 'All',
  sort: 'new',
  tab: 'products',
};

const app = $('#app');
const COL = {
  Printers: '#0b0d17',
  Ink: '#ff2e93',
  Toner: '#18c8f0',
  Paper: '#ffe14d',
  Accessories: '#5b6275',
};
const CATS = ['Printers', 'Ink', 'Toner', 'Paper', 'Accessories'];

function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('on');
  setTimeout(() => t.classList.remove('on'), 2600);
}

function modal(h) {
  $('#modal').innerHTML = `<div class="mbox">${h}</div>`;
  $('#modal').classList.add('on');
}

function closeModal() {
  $('#modal').classList.remove('on');
}

$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});

function img(p) {
  if (p.image_url)
    return `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">`;
  const c = COL[p.category] || '#0b0d17';
  return `<svg viewBox="0 0 120 120" aria-hidden="true"><rect x="28" y="16" width="64" height="88" rx="8" fill="${c}"/><rect x="38" y="30" width="44" height="28" rx="3" fill="#eef1f5"/><circle cx="60" cy="82" r="10" fill="#eef1f5"/></svg>`;
}

async function loadProducts() {
  const { data } = await sb
    .from('products')
    .select('*')
    .order('id', { ascending: false });
  S.products = data || [];
}

async function setUser(u) {
  S.user = u || null;
  S.role = null;
  S.name = '';
  if (u) {
    const { data } = await sb
      .from('profiles')
      .select('username,role')
      .eq('id', u.id)
      .single();
    S.role = data?.role || 'customer';
    S.name = data?.username || '';
  }
}

/* ---------- routing ---------- */
addEventListener('hashchange', route);

function route() {
  const [, p, id] = location.hash.split('/');
  const view =
    { shop, product: () => product(id), login, orders, admin }[p] || home;
  nav(p || '');
  view();
  scrollTo(0, 0);
}

function nav(p) {
  const n = S.cart.reduce((a, c) => a + c.qty, 0);
  const a = (h, t, k) =>
    `<a href="#/${h}" class="${p === k ? 'on' : ''}">${t}</a>`;

  $('#nav').innerHTML =
    a('shop', 'Shop', 'shop') +
    (S.user ? a('orders', 'My orders', 'orders') : '') +
    (S.role === 'admin' ? a('admin', 'Back office', 'admin') : '') +
    `<button onclick="openCart()">Cart (${n})</button>` +
    (S.user
      ? `<button onclick="logout()">Sign out (${esc(S.name)})</button>`
      : a('login', 'Sign in', 'login'));
}

/* ---------- storefront ---------- */
function filtered() {
  const q = S.q.toLowerCase().trim();
  const l = S.products.filter(
    (p) =>
      (S.cat === 'All' || p.category === S.cat) &&
      `${p.name} ${p.brand} ${p.compatible} ${p.category}`
        .toLowerCase()
        .includes(q)
  );
  return l.sort(
    {
      new: (a, b) => b.id - a.id,
      low: (a, b) => a.price - b.price,
      high: (a, b) => b.price - a.price,
    }[S.sort]
  );
}

function card(p) {
  return `<a class="card" href="#/product/${p.id}"><div class="ph">${img(p)}${
    p.stock < 1
      ? '<b class="tag">Sold out</b>'
      : p.stock < 5
      ? '<b class="tag">Only ' + p.stock + ' left</b>'
      : ''
  }</div>
  <small>${esc(p.brand)}, ${esc(p.category)}</small><h3>${esc(p.name)}</h3>
  <div class="row"><strong>${money(p.price)}</strong><button class="btn sm" ${
    p.stock < 1 ? 'disabled' : ''
  } onclick="event.preventDefault();add(${p.id})">Add to cart</button></div></a>`;
}

function home() {
  app.innerHTML = `<section class="hero"><h1>Does it fit your printer?</h1>
  <div class="finder"><input id="fq" placeholder="Type your printer model, e.g. L3250" aria-label="Printer model" autocomplete="off" oninput="finder(this.value)" onkeydown="if(event.key==='Enter')goShop($('#fq').value)">
  <button class="btn" onclick="goShop($('#fq').value)">Show matching ink</button></div>
  <div class="bar"><b></b><b></b><b></b><b></b></div><div class="hits" id="hits"></div></section>
  <section class="wrap"><h2 style="font-size:34px;margin:30px 0 20px">New in the shop</h2><div class="grid">${S.products
    .slice(0, 4)
    .map(card)
    .join('')}</div></section>`;
}

function finder(v) {
  const q = v.toLowerCase().trim();
  const m = q
    ? S.products
        .filter((p) => `${p.name} ${p.compatible}`.toLowerCase().includes(q))
        .slice(0, 8)
    : [];
  $('#hits').innerHTML =
    m
      .map((p) => `<a class="chip" href="#/product/${p.id}">${esc(p.name)}</a>`)
      .join('') ||
    (q
      ? '<span class="empty" style="padding:0">No match yet. Try only the model number.</span>'
      : '');
}

function goShop(q) {
  S.q = q;
  S.cat = 'All';
  location.hash = '#/shop';
}

function shop() {
  app.innerHTML = `<div class="wrap"><div class="bar2"><input id="sq" value="${esc(
    S.q
  )}" placeholder="Search name, brand or printer model" oninput="S.q=this.value;paint()">
  <select onchange="S.sort=this.value;paint()"><option value="new">Newest</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></div>
  <div class="bar2" id="cats"></div><div class="grid" id="g"></div></div>`;
  paint();
}

function paint() {
  $('#cats').innerHTML = ['All', ...CATS]
    .map(
      (c) =>
        `<span class="chip ${
          S.cat === c ? 'on' : ''
        }" onclick="S.cat='${c}';paint()">${c}</span>`
    )
    .join('');
  const l = filtered();
  $('#g').innerHTML =
    l.map(card).join('') ||
    '<div class="empty">Nothing found. Clear the search or pick another category.</div>';
}

function product(id) {
  const p = S.products.find((x) => x.id == id);
  if (!p) return (app.innerHTML = '<div class="empty">Product not found.</div>');
  const fits = (p.compatible || '').split(/\s+/).filter(Boolean);
  app.innerHTML = `<div class="wrap pd"><div class="ph">${img(
    p
  )}</div><div><small>${esc(p.brand)}, ${esc(p.category)}</small><h1>${esc(
    p.name
  )}</h1><p>${esc(p.description)}</p>
  ${
    fits.length
      ? `<p><b>Fits:</b></p><div class="hits" style="margin:0 0 10px">${fits
          .map(
            (f) =>
              `<span class="chip" onclick="goShop('${esc(f)}')">${esc(
                f
              )}</span>`
          )
          .join('')}</div>`
      : ''
  }
  <div class="price">${money(p.price)}</div><p>${
    p.stock > 0 ? p.stock + ' in stock' : 'Sold out'
  }</p>
  <button class="btn" ${
    p.stock < 1 ? 'disabled' : ''
  } onclick="add(${p.id})">Add to cart</button></div></div>`;
}

/* ---------- cart & checkout ---------- */
const saveCart = () => {
  localStorage.setItem('cart', JSON.stringify(S.cart));
  nav(location.hash.split('/')[1] || '');
};

function add(id) {
  const p = S.products.find((x) => x.id === id);
  const c = S.cart.find((x) => x.id === id);
  if ((c?.qty || 0) >= p.stock) return toast('No more stock for ' + p.name);
  c ? c.qty++ : S.cart.push({ id, qty: 1 });
  saveCart();
  toast('Added to cart');
  if ($('#drawer').classList.contains('open')) openCart();
}

function chg(id, d) {
  const c = S.cart.find((x) => x.id === id);
  const p = S.products.find((x) => x.id === id);
  c.qty = Math.min(p.stock, c.qty + d);
  if (c.qty < 1) S.cart = S.cart.filter((x) => x.id !== id);
  saveCart();
  openCart();
}

const total = () =>
  S.cart.reduce(
    (a, c) =>
      a + c.qty * (S.products.find((p) => p.id === c.id)?.price || 0),
    0
  );

function openCart() {
  const rows = S.cart
    .map((c) => {
      const p = S.products.find((x) => x.id === c.id);
      return p
        ? `<div class="li"><div class="ph">${img(p)}</div><div><b>${esc(
            p.name
          )}</b><br>${money(p.price)}</div>
  <div class="qty"><button class="btn sm ghost" onclick="chg(${
    p.id
  },-1)">-</button>${c.qty}<button class="btn sm ghost" onclick="chg(${
            p.id
          },1)">+</button></div></div>`
        : '';
    })
    .join('');

  $('#drawer').innerHTML = `<div class="row" style="margin:0 0 10px"><h2>Your cart</h2><button class="btn sm ghost" onclick="$('#drawer').classList.remove('open')">Close</button></div>
  <div class="list">${
    rows ||
    '<div class="empty">Your cart is empty. Find ink for your printer on the home page.</div>'
  }</div>
  <div class="row"><span>Total</span><strong>${money(
    total()
  )}</strong></div><button class="btn" style="margin-top:12px" ${
    S.cart.length ? '' : 'disabled'
  } onclick="checkout()">Check out</button>`;
  $('#drawer').classList.add('open');
}

function checkout() {
  if (!S.user) {
    $('#drawer').classList.remove('open');
    toast('Sign in to place your order');
    return (location.hash = '#/login');
  }
  modal(`<h2>Delivery details</h2><form class="form" style="margin-top:16px" onsubmit="placeOrder(event)"><label>Full name<input name="n" required></label>
  <label>Phone<input name="t" required></label><label>Address<textarea name="a" rows="3" required></textarea></label>
  <p>Total to pay: <b>${money(
    total()
  )}</b> (cash on delivery)</p><button class="btn">Place order</button></form>`);
}

async function placeOrder(e) {
  e.preventDefault();
  const f = e.target;
  const items = S.cart.map((c) => ({
    ...c,
    name: S.products.find((p) => p.id === c.id).name,
  }));
  const { error } = await sb.rpc('place_order', {
    items,
    addr: `${f.n.value}, ${f.t.value}, ${f.a.value}`,
  });
  if (error) return toast(error.message);
  S.cart = [];
  saveCart();
  closeModal();
  $('#drawer').classList.remove('open');
  await loadProducts();
  toast('Order placed');
  location.hash = '#/orders';
}

async function orders() {
  if (!S.user) return (location.hash = '#/login');
  const { data } = await sb
    .from('orders')
    .select('*')
    .eq('user_id', S.user.id)
    .order('id', { ascending: false });

  app.innerHTML = `<div class="wrap"><h1 style="font-size:44px;margin:40px 0 20px">My orders</h1>${
    (data || [])
      .map(
        (o) => `<div class="stat" style="margin-bottom:14px"><div class="row" style="padding:0"><b>Order #${
          o.id
        }</b><span class="status">${esc(o.status)}</span></div>
  <p>${o.items
    .map((i) => `${i.qty} x ${esc(i.name)}`)
    .join('<br>')}</p><b>${money(o.total)}</b> on${new Date(
          o.created_at
        ).toLocaleDateString()}</div>`
      )
      .join('') || '<div class="empty">No orders yet.</div>'
  }</div>`;
}

/* ---------- auth (one form for everyone) ---------- */
let signup = false;

function login() {
  app.innerHTML = `<form class="login form" onsubmit="auth(event)"><h1 style="font-size:36px">${
    signup ? 'Create account' : 'Sign in'
  }</h1>
  <label>Username<input name="u" required autocomplete="username"></label><label>Password<input name="p" type="password" required autocomplete="current-password"></label>
  <button class="btn">${signup ? 'Create account' : 'Sign in'}</button>
  <a href="#" onclick="event.preventDefault();signup=!signup;login()" style="text-decoration:underline">${
    signup ? 'I already have an account' : 'New here? Create an account'
  }</a></form>`;
}

async function auth(e) {
  e.preventDefault();
  const u = e.target.u.value.trim();
  const p = e.target.p.value;
  const cred = { email: mail(u), password: pw(p) };

  let r = signup
    ? await sb.auth.signUp(cred)
    : await sb.auth.signInWithPassword(cred);

  // first ever login as 123 / 123 creates the admin account
  if (r.error && !signup && u === '123' && p === '123') {
    r = await sb.auth.signUp(cred);
    if (!r.error && !r.data.session) r = await sb.auth.signInWithPassword(cred);
  }
  if (!r.error && !r.data.session) r = await sb.auth.signInWithPassword(cred); // sign in right after sign-up

  if (r.error) {
    console.error(r.error);
    return toast(r.error.message);
  }
  if (!r.data.session)
    return toast(
      'Account created but no session. Turn OFF "Confirm email" in Supabase > Authentication > Sign In / Providers > Email, then sign in again.'
    );

  await setUser(r.data.user);
  toast('Welcome, ' + S.name);
  location.hash = S.role === 'admin' ? '#/admin' : '#/shop';
  route();
}

async function logout() {
  await sb.auth.signOut();
  await setUser(null);
  location.hash = '#/';
  route();
}

/* ---------- back office (admin only) ---------- */
async function admin() {
  if (S.role !== 'admin') return (location.hash = '#/login');
  const { data: os } = await sb
    .from('orders')
    .select('*')
    .order('id', { ascending: false });
  const rev = (os || [])
    .filter((o) => o.status !== 'Cancelled')
    .reduce((a, o) => a + +o.total, 0);

  const body =
    S.tab === 'products'
      ? `<div class="row" style="padding:0 0 14px"><h2>Products</h2><button class="btn" onclick="pform()">Add product</button></div><div class="scroll"><table><tr><th>Image</th><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr>
  ${S.products
    .map(
      (p) =>
        `<tr><td>${img(p)}</td><td>${esc(p.name)}</td><td>${esc(
          p.category
        )}</td><td>${money(p.price)}</td><td>${p.stock}</td><td><button class="btn sm ghost" onclick="pform(${
          p.id
        })">Edit</button> <button class="btn sm red" onclick="del(${
          p.id
        })">Delete</button></td></tr>`
    )
    .join('')}</table></div>`
      : `<h2 style="margin-bottom:14px">Orders</h2><div class="scroll"><table><tr><th>#</th><th>Items</th><th>Ship to</th><th>Total</th><th>Status</th></tr>
  ${(os || [])
    .map(
      (o) =>
        `<tr><td>${o.id}</td><td>${o.items
          .map((i) => `${i.qty} x ${esc(i.name)}`)
          .join('<br>')}</td><td>${esc(o.address)}</td><td>${money(
          o.total
        )}</td>
  <td><select onchange="setStatus(${o.id},this.value)">${[
          'Pending',
          'Paid',
          'Shipped',
          'Delivered',
          'Cancelled',
        ]
          .map(
            (s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`
          )
          .join('')}</select></td></tr>`
    )
    .join('')}</table></div>`;

  app.innerHTML = `<div class="wrap"><h1 style="font-size:44px;margin:40px 0 20px">Back office</h1><div class="stats">
  <div class="stat">Revenue<b>${money(rev)}</b></div><div class="stat">Orders<b>${
    (os || []).length
  }</b></div><div class="stat">Products<b>${
    S.products.length
  }</b></div>
  <div class="stat">Low stock<b>${
    S.products.filter((p) => p.stock < 5).length
  }</b></div></div>
  <div class="tabs"><span class="chip ${
    S.tab === 'products' ? 'on' : ''
  }" onclick="S.tab='products';admin()">Products</span><span class="chip ${
    S.tab === 'orders' ? 'on' : ''
  }" onclick="S.tab='orders';admin()">Orders</span></div>${body}</div>`;
}

async function setStatus(id, s) {
  const { error } = await sb.from('orders').update({ status: s }).eq('id', id);
  toast(error ? error.message : 'Order #' + id + ' is now ' + s);
}

async function del(id) {
  if (!confirm('Delete this product?')) return;
  const { error } = await sb.from('products').delete().eq('id', id);
  if (error) return toast(error.message);
  await loadProducts();
  admin();
  toast('Deleted');
}

function pform(id) {
  const p = S.products.find((x) => x.id == id) || { category: 'Ink', stock: 0 };
  modal(`<h2>${id ? 'Edit product' : 'New product'}</h2><form id="pf" class="form" style="margin-top:16px">
  <div class="imgbox" id="prev">${img(p)}</div><label class="drop">Click to choose a product photo (JPG, PNG, WebP)<input type="file" id="pfile" accept="image/*" style="margin-top:8px"></label><label>Or paste an image link<input name="url" placeholder="https://..."></label>
  ${
    p.image_url
      ? '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="rm" style="width:auto"> Remove current image</label>'
      : ''
  }
  <label>Name<input name="name" required value="${esc(p.name)}"></label>
  <div class="two"><label>Brand<input name="brand" value="${esc(
    p.brand
  )}"></label><label>Category<select name="category">${CATS.map(
    (c) => `<option ${c === p.category ? 'selected' : ''}>${c}</option>`
  ).join('')}</select></label></div>
  <div class="two"><label>Price (USD)<input name="price" type="number" step="0.01" min="0" required value="${
    p.price ?? ''
  }"></label><label>Stock<input name="stock" type="number" min="0" required value="${
    p.stock
  }"></label></div>
  <label>Compatible printer models (space separated)<input name="compatible" value="${esc(
    p.compatible
  )}"></label>
  <label>Description<textarea name="description" rows="3">${esc(
    p.description
  )}</textarea></label><button class="btn">Save product</button></form>`);

  $('#pfile').onchange = (e) => {
    const f = e.target.files[0];
    if (f) $('#prev').innerHTML = `<img src="${URL.createObjectURL(f)}">`;
  };

  $('#pf').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target,
      file = $('#pfile').files[0];
    const row = {
      name: f.name.value,
      brand: f.brand.value,
      category: f.category.value,
      price: +f.price.value,
      stock: +f.stock.value,
      compatible: f.compatible.value,
      description: f.description.value,
    };
    if (f.rm?.checked) row.image_url = null;
    if (f.url.value.trim()) row.image_url = f.url.value.trim();
    if (file) {
      const path = `${Date.now()}-${file.name.replace(/[^\w.]/g, '_')}`,
        up = await sb.storage.from('product-images').upload(path, file);
      if (up.error) return toast(up.error.message);
      row.image_url = sb.storage
        .from('product-images')
        .getPublicUrl(path).data.publicUrl;
    }
    const { error } = await (id
      ? sb.from('products').update(row).eq('id', id)
      : sb.from('products').insert(row));
    if (error) return toast(error.message);
    closeModal();
    await loadProducts();
    admin();
    toast('Saved');
  };
}

(async () => {
  const {
    data: { session },
  } = await sb.auth.getSession();
  await setUser(session?.user);
  await loadProducts();
  route();
})();