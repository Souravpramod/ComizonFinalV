
(function () {
  'use strict';


  const base   = (window.LISTING_BASE || '').replace(/\/$/, ''); // e.g. '/american'
  let state = {
    category : 'all',
    sort     : 'featured',
    search   : '',
    minPrice : 0,
    maxPrice : 1000,
    page     : 1,
  };


  let gridEl, paginationWrapEl, sortSelect, searchForm, searchInput, priceForm, priceRange, priceValueEl;



  function buildQuery(overrides) {
    const q = Object.assign({}, state, overrides);
    const p = new URLSearchParams();
    p.set('category', q.category);
    p.set('sort',     q.sort);
    p.set('search',   q.search);
    p.set('minPrice', q.minPrice);
    p.set('maxPrice', q.maxPrice);
    p.set('page',     q.page);
    return p;
  }

  function setLoading(on) {
    if (!gridEl) return;
    gridEl.style.opacity   = on ? '0.4' : '1';
    gridEl.style.pointerEvents = on ? 'none' : '';
  }


  function starsHtml(rating) {
    const full = Math.floor(rating || 0);
    const half = (rating || 0) % 1 >= 0.25 && (rating || 0) % 1 < 0.75;
    const empty = 5 - full - (half ? 1 : 0);
    let h = '';
    for (let i = 0; i < full;  i++) h += '<i class="fas fa-star"></i>';
    if (half)                        h += '<i class="fas fa-star-half-alt"></i>';
    for (let i = 0; i < empty; i++) h += '<i class="far fa-star"></i>';
    return h;
  }


  function productCardHtml(p) {
    const badgeHtml = p.badge
      ? `<span class="badge ${p.badge === 'PREMIUM' ? 'bg-warning text-dark' : 'bg-danger'} position-absolute top-0 start-0 m-2 rounded-0">${p.badge}</span>`
      : '';

    return `
      <div class="col-md-4">
        <div class="card product-card h-100 bg-transparent border border-secondary rounded-0"
             onclick="location.href='/product/${p._id}'" style="cursor:pointer;">
          <div class="card-img-wrapper position-relative overflow-hidden">
            <img src="${p.image}"
                 onerror="this.src='https://placehold.co/300x450/1a1a1a/E63946?text=No+Image'"
                 class="card-img-top" alt="${p.name}">
            <form action="/wishlist/add/${p._id}" method="POST" onclick="event.stopPropagation()">
              <button type="submit"
                      class="btn btn-light btn-sm position-absolute top-0 end-0 m-2 rounded-circle wishlist-btn"
                      title="Add to Wishlist">
                <i class="far fa-heart text-danger"></i>
              </button>
            </form>
            ${badgeHtml}
          </div>
          <div class="card-body">
            <div class="text-muted small mb-1">${p.category}</div>
            <h5 class="card-title fw-bold text-truncate text-white">${p.name}</h5>
            <div class="d-flex align-items-center mb-2">
              <div class="text-warning small me-2">${starsHtml(p.rating)}</div>
              <span class="text-muted small">(${p.reviews || 0})</span>
            </div>
            <div class="d-flex justify-content-between align-items-center mt-3">
              <h4 class="text-white mb-0">$${Number(p.price).toFixed(2)}</h4>
              <button class="btn btn-outline-danger btn-sm rounded-0 add-to-cart-btn"
                      data-product-id="${p._id}"
                      onclick="event.stopPropagation(); addToCartAjax(this)">
                <i class="fas fa-cart-plus"></i> Add
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }


  function paginationHtml(data) {
    if (data.totalPages <= 1) return '';

    const { currentPage: cp, totalPages: tp } = data;
    const q = (pg) => `${base}?${buildQuery({ page: pg })}`;

    let items = '';


    items += `
      <li class="page-item ${cp === 1 ? 'disabled' : ''}">
        <a class="page-link bg-dark text-white border-secondary ${cp === 1 ? '' : 'hover-danger'}"
           href="${q(cp - 1)}" data-page="${cp - 1}"
           ${cp === 1 ? 'tabindex="-1" aria-disabled="true"' : ''}>Previous</a>
      </li>`;


    for (let i = 1; i <= tp; i++) {
      items += `
        <li class="page-item ${i === cp ? 'active' : ''}">
          <a class="page-link ${i === cp ? 'bg-danger text-white border-danger' : 'bg-dark text-white border-secondary hover-danger'}"
             href="${q(i)}" data-page="${i}">${i}</a>
        </li>`;
    }


    items += `
      <li class="page-item ${cp === tp ? 'disabled' : ''}">
        <a class="page-link bg-dark text-white border-secondary ${cp === tp ? '' : 'hover-danger'}"
           href="${q(cp + 1)}" data-page="${cp + 1}"
           ${cp === tp ? 'tabindex="-1" aria-disabled="true"' : ''}>Next</a>
      </li>`;

    return `<nav class="mt-5 d-flex justify-content-center" id="pagination-wrap">
               <ul class="pagination">${items}</ul>
             </nav>`;
  }


  function fetchAndRender(overrides, pushHistory) {
    const merged = Object.assign({}, state, overrides);
    Object.assign(state, merged);

    const params = buildQuery(state);
    params.set('ajax', '1');

    setLoading(true);

    fetch(`${base}?${params}`)
      .then(function (r) {
        if (!r.ok) throw new Error('Network response was not ok');
        return r.json();
      })
      .then(function (data) {

        if (gridEl) {
          if (data.products.length > 0) {
            gridEl.innerHTML = data.products.map(productCardHtml).join('');
          } else {
            gridEl.innerHTML = `
              <div class="col-12 text-center py-5">
                <p class="text-muted">No products found.</p>
              </div>`;
          }
        }

        if (paginationWrapEl) {
          paginationWrapEl.outerHTML = paginationHtml(data);

          paginationWrapEl = document.getElementById('pagination-wrap');
          if (paginationWrapEl) bindPagination();
        }


        if (sortSelect) sortSelect.value = data.sort;

        const counter = document.getElementById('showing-count');
        if (counter) counter.textContent = `Showing ${data.products.length} of ${data.totalProducts}`;


        syncActiveCategory(data.activeCategory);


        if (pushHistory !== false) {
          const cleanParams = buildQuery(state);
          history.pushState(state, '', `${base}?${cleanParams}`);
        }
      })
      .catch(function (err) {
        console.error('[listing-ajax] fetch error:', err);
      })
      .finally(function () {
        setLoading(false);
      });
  }

  function syncActiveCategory(activeCat) {
    document.querySelectorAll('.category-pill, .category-list a').forEach(function (a) {
      const href = a.getAttribute('href') || '';
      const url  = new URL(href, location.origin);
      const cat  = url.searchParams.get('category') || 'all';
      a.classList.toggle('active', cat === activeCat);
    });
  }


  function bindCategoryPills() {
    document.querySelectorAll('.category-pill').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        const url = new URL(this.href, location.origin);
        fetchAndRender({
          category : url.searchParams.get('category') || 'all',
          page     : 1,
        });
      });
    });
  }

  function bindSidebarCategories() {
    document.querySelectorAll('.category-list a').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        const url = new URL(this.href, location.origin);
        fetchAndRender({
          category : url.searchParams.get('category') || 'all',
          page     : 1,
        });
      });
    });
  }


  function bindSearchForm() {
    searchForm = document.getElementById('search-form');
    searchInput = document.getElementById('search-input');
    if (!searchForm || !searchInput) return;

    searchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      fetchAndRender({ search: searchInput.value.trim(), page: 1 });
    });
  }


  function bindPriceForm() {
    priceForm     = document.getElementById('price-form');
    priceRange    = document.getElementById('price-range');
    priceValueEl  = document.getElementById('priceValue');
    if (!priceForm || !priceRange) return;


    priceRange.addEventListener('input', function () {
      if (priceValueEl) priceValueEl.textContent = this.value;
    });

    priceForm.addEventListener('submit', function (e) {
      e.preventDefault();
      fetchAndRender({ maxPrice: Number(priceRange.value), page: 1 });
    });
  }

  function bindSortSelect() {
    sortSelect = document.getElementById('sort-select');
    if (!sortSelect) return;

    sortSelect.addEventListener('change', function () {
      fetchAndRender({ sort: this.value, page: 1 });
    });
  }


  function bindPagination() {
    paginationWrapEl = document.getElementById('pagination-wrap');
    if (!paginationWrapEl) return;

    paginationWrapEl.addEventListener('click', function (e) {
      const link = e.target.closest('a[data-page]');
      if (!link) return;
      e.preventDefault();
      const pg = parseInt(link.getAttribute('data-page'), 10);
      if (!isNaN(pg)) fetchAndRender({ page: pg });
    });
  }


  window.addEventListener('popstate', function (e) {
    if (e.state) {
      Object.assign(state, e.state);
      fetchAndRender(state, false);
    }
  });


  // ── Add-to-wishlist AJAX ────────────────────────────────────────────────────
  window.addToWishlistAjax = function (form, productId) {
    var btn = form.querySelector('button');
    var icon = btn ? btn.querySelector('i') : null;
    if (btn) btn.disabled = true;

    fetch('/wishlist/add/' + productId, {
      method      : 'POST',
      headers     : { 'X-Requested-With': 'XMLHttpRequest' },
      credentials : 'same-origin',
    })
      .then(function (r) {
        if (r.redirected && r.url.includes('login')) {
          window.location.href = '/login';
          return;
        }
        return r.json();
      })
      .then(function (data) {
        if (!data) return;
        if (!data.ok) {
          showListingToast('danger', data.message || 'Could not update wishlist.');
          if (btn) btn.disabled = false;
          return;
        }

        // Toggle heart icon
        if (icon) {
          icon.classList.toggle('far', !data.wishlisted);
          icon.classList.toggle('fas', data.wishlisted);
        }

        // Update header badge
        var badge = document.getElementById('wishlist-count');
        if (data.count > 0) {
          if (badge) {
            badge.textContent = data.count;
          } else {
            // badge didn't exist (was 0), create it
            var anchor = document.getElementById('wishlist-btn');
            if (anchor) {
              var newBadge = document.createElement('span');
              newBadge.id = 'wishlist-count';
              newBadge.className = 'position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger';
              newBadge.textContent = data.count;
              anchor.appendChild(newBadge);
            }
          }
        } else {
          if (badge) badge.remove();
        }

        showListingToast('success', data.wishlisted ? 'Added to wishlist!' : 'Removed from wishlist.');
        if (btn) btn.disabled = false;
      })
      .catch(function (err) {
        console.error('addToWishlist error', err);
        showListingToast('danger', 'Network error. Please try again.');
        if (btn) btn.disabled = false;
      });
  };


  // ── Add-to-cart AJAX ────────────────────────────────────────────────────────
  window.addToCartAjax = function (btn) {
    const productId = btn.getAttribute('data-product-id');
    if (!productId) return;

    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    fetch('/cart/add/' + productId, {
      method      : 'POST',
      headers     : { 'X-Requested-With': 'XMLHttpRequest' },
      credentials : 'same-origin',
    })
      .then(function (r) {
        // Server redirects (302) — fetch follows them; check final URL
        if (r.redirected && r.url.includes('login')) {
          window.location.href = '/login';
          return;
        }
        return r.json();
      })
      .then(function (data) {
        if (!data) return; // login redirect already handled
        if (!data.ok) {
          // Show error toast / alert under the button
          btn.innerHTML = '<i class="fas fa-times"></i> ' + (data.message || 'Cannot add');
          btn.classList.replace('btn-outline-danger', 'btn-danger');
          setTimeout(function () {
            btn.innerHTML = original;
            btn.classList.replace('btn-danger', 'btn-outline-danger');
            btn.disabled = false;
          }, 2000);
          return;
        }

        // Show quick success feedback
        btn.innerHTML = '<i class="fas fa-check"></i> Added';
        btn.classList.replace('btn-outline-danger', 'btn-success');

        // Update header cart count — only for brand-new cart rows, not quantity bumps
        if (data.isNew) {
          const badge = document.querySelector('.cart-count-badge');
          if (badge) {
            badge.classList.remove('d-none');
            const n = parseInt(badge.textContent || '0', 10);
            badge.textContent = n + 1;
          }
        }

        setTimeout(function () {
          btn.innerHTML = original;
          btn.classList.replace('btn-success', 'btn-outline-danger');
          btn.disabled = false;
        }, 1500);
      })
      .catch(function (err) {
        console.error('addToCart error', err);
        btn.innerHTML = original;
        btn.disabled = false;
      });
  };

  document.addEventListener('DOMContentLoaded', function () {
    gridEl           = document.getElementById('product-grid');
    paginationWrapEl = document.getElementById('pagination-wrap');

    if (window.LISTING_STATE) Object.assign(state, window.LISTING_STATE);

    bindCategoryPills();
    bindSidebarCategories();
    bindSearchForm();
    bindPriceForm();
    bindSortSelect();
    bindPagination();

    // Handle server-rendered add-to-cart forms
    document.addEventListener('submit', function (e) {
      const form = e.target.closest('form[action^="/cart/add/"]');
      if (!form) return;
      e.preventDefault();
      e.stopPropagation();
      const match = form.action.match(/\/cart\/add\/([^?#]+)/);
      if (!match) return;
      const productId = match[1];
      const btn = form.querySelector('button[type="submit"]');
      if (!btn) return;
      btn.setAttribute('data-product-id', productId);
      addToCartAjax(btn);
    }, true);

    // Handle wishlist forms via AJAX
    document.addEventListener('submit', function (e) {
      const form = e.target.closest('form[action^="/wishlist/add/"]');
      if (!form) return;
      e.preventDefault();
      e.stopPropagation();
      const match = form.action.match(/\/wishlist\/add\/([^?#]+)/);
      if (!match) return;
      addToWishlistAjax(form, match[1]);
    }, true);
  });

}());