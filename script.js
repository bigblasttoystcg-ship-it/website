// ── Menu toggle (3 lines) ────────────────────────────────
const menuToggle  = document.getElementById('menuToggle');
const navDropdown = document.getElementById('navDropdown');

menuToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  menuToggle.classList.toggle('open');
  navDropdown.classList.toggle('open');
});

// Close dropdown when clicking a link inside it
navDropdown.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    menuToggle.classList.remove('open');
    navDropdown.classList.remove('open');
  });
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-left')) {
    menuToggle.classList.remove('open');
    navDropdown.classList.remove('open');
  }
});

// ── Toast ────────────────────────────────────────────────
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── Cart ─────────────────────────────────────────────────
let cart = [];

const cartBtn     = document.getElementById('cartBtn');
const cartDrawer  = document.getElementById('cartDrawer');
const cartOverlay = document.getElementById('cartOverlay');
const cartClose   = document.getElementById('cartClose');
const cartCount   = document.getElementById('cartCount');
const cartItems   = document.getElementById('cartItems');
const cartFooter  = document.getElementById('cartFooter');
const cartTotal   = document.getElementById('cartTotal');

function openCart()  { cartDrawer.classList.add('open'); cartOverlay.classList.add('open'); }
function closeCart() { cartDrawer.classList.remove('open'); cartOverlay.classList.remove('open'); }

cartBtn.addEventListener('click', openCart);
cartClose.addEventListener('click', closeCart);
cartOverlay.addEventListener('click', closeCart);

function bumpCount() {
  cartCount.classList.remove('bump');
  void cartCount.offsetWidth; // reflow
  cartCount.classList.add('bump');
  setTimeout(() => cartCount.classList.remove('bump'), 300);
}

function renderCart() {
  const total = cart.reduce((sum, item) => sum + parseFloat(item.price.replace('$','')), 0);
  cartCount.textContent = cart.length;
  bumpCount();

  if (!cart.length) {
    cartItems.innerHTML = `
      <div class="cart-empty">
        <div style="font-size:3rem">🛒</div>
        <p>Your cart is empty</p>
        <small>Add some cards to get started</small>
      </div>`;
    cartFooter.style.display = 'none';
    return;
  }

  cartFooter.style.display = 'flex';
  cartTotal.textContent = '$' + total.toFixed(2);

  cartItems.innerHTML = cart.map((item, i) => `
    <div class="cart-item">
      ${item.img ? `<img class="ci-img" src="${item.img}" alt="${item.name}" />` : '<div class="ci-img" style="font-size:2rem;text-align:center">📦</div>'}
      <div class="ci-info">
        <div class="ci-name">${item.name}</div>
        <div class="ci-sub">${item.sub}</div>
      </div>
      <div class="ci-price">${item.price}</div>
      <button class="ci-remove" data-index="${i}" title="Remove">✕</button>
    </div>
  `).join('');

  cartItems.querySelectorAll('.ci-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      const removed = cart.splice(idx, 1)[0];
      renderCart();
      showToast(`${removed.name} removed from cart.`);
    });
  });
}

function addToCart(name, sub, price, img) {
  cart.push({ name, sub, price, img });
  renderCart();
  openCart();
  showToast(`${name} added to cart!`);
}

// ── Add to Cart buttons ──────────────────────────────────
document.querySelectorAll('.btn-sm').forEach(btn => {
  btn.addEventListener('click', function () {
    const card = this.closest('.product-card') || this.closest('.graded-card');
    const name  = card.querySelector('h3').textContent;
    const sub   = card.querySelector('p').textContent;
    const price = card.querySelector('.price').textContent;
    const imgEl = card.querySelector('img');
    const img   = imgEl ? imgEl.src : null;

    addToCart(name, sub, price, img);

    this.textContent = 'Added!';
    this.style.background = '#22a060';
    setTimeout(() => {
      this.textContent = 'Add to Cart';
      this.style.background = '';
    }, 2000);
  });
});

// ── Marquee carousel ─────────────────────────────────────
const marqueeData = [
  // Row 1 — Special Illustration Rares & big hits
  { row: 1, name: 'Charizard ex',   price: '$54.99',  img: 'https://images.pokemontcg.io/sv3/215.png'    },
  { row: 1, name: 'Pikachu ex',     price: '$24.99',  img: 'https://images.pokemontcg.io/sv1/235.png'    },
  { row: 1, name: 'Gardevoir ex',   price: '$44.99',  img: 'https://images.pokemontcg.io/sv2/245.png'    },
  { row: 1, name: 'Mewtwo ex',      price: '$79.99',  img: 'https://images.pokemontcg.io/sv3pt5/205.png' },
  { row: 1, name: 'Miraidon ex',    price: '$34.99',  img: 'https://images.pokemontcg.io/sv1/243.png'    },
  { row: 1, name: 'Arcanine ex',    price: '$29.99',  img: 'https://images.pokemontcg.io/sv1/206.png'    },
  { row: 1, name: 'Charizard ex',   price: '$299.99', img: 'https://images.pokemontcg.io/sv3/228.png'    },
  { row: 1, name: 'Iono',           price: '$39.99',  img: 'https://images.pokemontcg.io/sv2/269.png'    },
  // Row 2 — more hits
  { row: 2, name: 'Charizard ex',   price: '$54.99',  img: 'https://images.pokemontcg.io/sv3/125.png'    },
  { row: 2, name: 'Mew ex',         price: '$49.99',  img: 'https://images.pokemontcg.io/sv3pt5/232.png' },
  { row: 2, name: 'Blastoise ex',   price: '$34.99',  img: 'https://images.pokemontcg.io/sv3pt5/218.png' },
  { row: 2, name: 'Eevee',          price: '$19.99',  img: 'https://images.pokemontcg.io/sv8pt5/161.png' },
  { row: 2, name: 'Koraidon ex',     price: '$89.99',  img: 'https://images.pokemontcg.io/sv1/252.png'    },
  { row: 2, name: 'Iron Valiant ex',price: '$69.99',  img: 'https://images.pokemontcg.io/sv4/237.png'    },
  { row: 2, name: 'Roaring Moon ex',price: '$59.99',  img: 'https://images.pokemontcg.io/sv4/229.png'    },
  { row: 2, name: 'Sylveon ex',     price: '$44.99',  img: 'https://images.pokemontcg.io/sv2/241.png'    },
];

function buildMarqueeCard(card) {
  const el = document.createElement('div');
  el.className = 'mq-card';
  el.innerHTML = `
    <img src="${card.img}" alt="${card.name}"
         onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png'" />
    <div class="mq-card-price">${card.price}</div>
  `;
  el.addEventListener('click', () => {
    addToCart(card.name, 'Featured Card', card.price, card.img);
  });
  return el;
}

function buildMarqueeTrack(trackEl, cards) {
  trackEl.innerHTML = '';
  // Render cards twice for seamless infinite loop
  [...cards, ...cards].forEach(card => {
    trackEl.appendChild(buildMarqueeCard(card));
  });
}

const row1Cards = marqueeData.filter(c => c.row === 1);
const row2Cards = marqueeData.filter(c => c.row === 2);
buildMarqueeTrack(document.getElementById('marqueeTrack1'), row1Cards);
buildMarqueeTrack(document.getElementById('marqueeTrack2'), row2Cards);

// ── Search ───────────────────────────────────────────────
const cardData = [
  { name: 'Pikachu ex',    sub: 'Scarlet & Violet Base Set', price: '$24.99',  img: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',  section: '#featured' },
  { name: 'Mewtwo ex',     sub: '151 — Full Art',            price: '$79.99',  img: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/150.png', section: '#featured' },
  { name: 'Charizard ex',  sub: 'Obsidian Flames',           price: '$54.99',  img: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png',   section: '#featured' },
  { name: 'Bulbasaur',     sub: '151 — ILL Rare',            price: '$12.99',  img: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png',   section: '#featured' },
  { name: 'Gardevoir ex',  sub: 'Scarlet & Violet',          price: '$44.99',  img: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/282.png', section: '#featured' },
  { name: 'Eevee',         sub: 'Prismatic Evolutions',      price: '$19.99',  img: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png', section: '#featured' },
  { name: 'Pikachu ex',    sub: 'PSA 10 — Gem Mint',         price: '$149.99', img: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',  section: '#graded' },
  { name: 'Charizard ex',  sub: 'BGS 9.5 — Gem Mint',        price: '$299.99', img: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png',   section: '#graded' },
  { name: 'Blastoise ex',  sub: 'PSA 9 — Mint',              price: '$189.99', img: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/9.png',   section: '#graded' },
  { name: 'Gardevoir ex',  sub: 'CGC 10 — Pristine',         price: '$224.99', img: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/282.png', section: '#graded' },
  { name: 'Booster Boxes', sub: 'Sealed Product',            price: null,      img: null, section: '#shop' },
  { name: 'Elite Trainer Boxes', sub: 'Sealed Product',      price: null,      img: null, section: '#shop' },
  { name: 'Booster Packs', sub: 'Sealed Product',            price: null,      img: null, section: '#shop' },
];

const searchInput   = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

function runSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) { searchResults.classList.remove('open'); return; }

  const matches = cardData.filter(c =>
    c.name.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q)
  ).slice(0, 7);

  if (!matches.length) {
    searchResults.innerHTML = `<div class="search-no-results">No cards found for "<strong>${query}</strong>"</div>`;
  } else {
    searchResults.innerHTML = matches.map(c => `
      <div class="search-result-item" data-section="${c.section}">
        ${c.img ? `<img class="sri-img" src="${c.img}" alt="${c.name}" />` : '<div class="sri-img" style="font-size:1.5rem;text-align:center">📦</div>'}
        <div class="sri-info">
          <div class="sri-name">${c.name}</div>
          <div class="sri-sub">${c.sub}</div>
        </div>
        ${c.price ? `<div class="sri-price">${c.price}</div>` : ''}
      </div>
    `).join('');
  }
  searchResults.classList.add('open');

  searchResults.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = document.querySelector(item.dataset.section);
      if (target) target.scrollIntoView({ behavior: 'smooth' });
      searchResults.classList.remove('open');
      searchInput.value = '';
    });
  });
}

searchInput.addEventListener('input', () => runSearch(searchInput.value));
searchInput.addEventListener('focus', () => { if (searchInput.value) searchResults.classList.add('open'); });
document.addEventListener('click', e => {
  if (!e.target.closest('.nav-search')) searchResults.classList.remove('open');
});

// ── Mobile search ─────────────────────────────────────────
const mobileSearchBtn     = document.getElementById('mobileSearchBtn');
const mobileSearchOverlay = document.getElementById('mobileSearchOverlay');
const mobileSearchInput   = document.getElementById('mobileSearchInput');
const mobileSearchResults = document.getElementById('mobileSearchResults');

mobileSearchBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  mobileSearchOverlay.classList.toggle('open');
  if (mobileSearchOverlay.classList.contains('open')) {
    mobileSearchInput.focus();
  }
});

mobileSearchInput.addEventListener('input', () => {
  const q = mobileSearchInput.value.trim().toLowerCase();
  if (!q) { mobileSearchResults.classList.remove('open'); return; }
  const matches = cardData.filter(c =>
    c.name.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q)
  ).slice(0, 7);
  if (!matches.length) {
    mobileSearchResults.innerHTML = `<div class="search-no-results">No cards found for "<strong>${mobileSearchInput.value}</strong>"</div>`;
  } else {
    mobileSearchResults.innerHTML = matches.map(c => `
      <div class="search-result-item" data-section="${c.section}">
        ${c.img ? `<img class="sri-img" src="${c.img}" alt="${c.name}" />` : '<div class="sri-img" style="font-size:1.5rem;text-align:center">📦</div>'}
        <div class="sri-info"><div class="sri-name">${c.name}</div><div class="sri-sub">${c.sub}</div></div>
        ${c.price ? `<div class="sri-price">${c.price}</div>` : ''}
      </div>
    `).join('');
    mobileSearchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const target = document.querySelector(item.dataset.section);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
        mobileSearchResults.classList.remove('open');
        mobileSearchOverlay.classList.remove('open');
        mobileSearchInput.value = '';
      });
    });
  }
  mobileSearchResults.classList.add('open');
});

document.addEventListener('click', e => {
  if (!e.target.closest('.mobile-search-overlay') && !e.target.closest('#mobileSearchBtn')) {
    mobileSearchOverlay.classList.remove('open');
    mobileSearchResults.classList.remove('open');
  }
});

// ── Forms ────────────────────────────────────────────────
function handleSignup(e) {
  e.preventDefault();
  showToast("You're on the list! Watch your inbox for deals.");
  e.target.reset();
}
function handleContact(e) {
  e.preventDefault();
  showToast("Message sent! We'll get back to you soon.");
  e.target.reset();
}

// ── Scroll-in animations ─────────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.product-card, .sealed-card, .graded-card, .stat').forEach((el, i) => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = `opacity 0.5s ease ${i * 0.06}s, transform 0.5s ease ${i * 0.06}s`;
  observer.observe(el);
});
