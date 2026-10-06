(function () {
  var KEY = "utiliy.cart.v1";

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }
  }
  function write(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    paint();
  }
  function money(cents) {
    return "$" + (cents / 100).toFixed(2);
  }
  function count(items) {
    return items.reduce(function (n, item) { return n + item.qty; }, 0);
  }
  function total(items) {
    return items.reduce(function (n, item) { return n + item.qty * item.price; }, 0);
  }
  function line(item, controls) {
    var qty = controls
      ? '<div class="stepper"><button type="button" data-dec="' + item.sku + '" aria-label="Decrease">−</button><input value="' + item.qty + '" readonly><button type="button" data-inc="' + item.sku + '" aria-label="Increase">+</button></div>'
      : '<div class="muted">Qty ' + item.qty + "</div>";
    return '<article class="line"><img alt="" src="' + item.image + '"><div><strong>' + item.name +
      '</strong><div class="muted">' + item.label + "</div>" + qty +
      '<button type="button" data-remove="' + item.sku + '">Remove</button></div><div>' +
      money(item.price * item.qty) + "</div></article>";
  }

  function paint() {
    var items = read();
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      el.textContent = String(count(items));
    });
    var lines = document.querySelector("[data-cart-lines]");
    if (lines) lines.innerHTML = items.length ? items.map(function (item) { return line(item, false); }).join("") : '<p class="empty">Your cart is empty.</p>';
    document.querySelectorAll("[data-cart-total]").forEach(function (el) { el.textContent = money(total(items)); });
    var page = document.querySelector("[data-cart-page]");
    if (page) {
      page.innerHTML = items.length
        ? items.map(function (item) { return line(item, true); }).join("")
        : '<p class="empty">Your cart is empty. <a href="/shop/">Continue shopping</a>.</p>';
    }
    var summary = document.querySelector("[data-summary]");
    if (summary) {
      summary.innerHTML = items.length
        ? items.map(function (item) {
          return "<p><strong>" + item.name + "</strong><br><span class=\"muted\">" + item.label + " × " + item.qty + "</span></p>";
        }).join("") + "<p>Shipping <strong>$0.00</strong></p><p class=\"total\">" + money(total(items)) + "</p>"
        : '<p class="empty">Nothing to pay yet.</p>';
    }
  }

  function add(data, qty) {
    var items = read();
    var found = items.find(function (item) { return item.sku === data.sku; });
    if (found) found.qty = Math.min(10, found.qty + qty);
    else items.push({
      sku: data.sku, name: data.name, label: data.label, price: Number(data.price),
      image: data.image, slug: data.slug, qty: qty
    });
    write(items);
  }
  function change(sku, delta) {
    write(read().flatMap(function (item) {
      if (item.sku !== sku) return [item];
      var qty = item.qty + delta;
      return qty > 0 ? [Object.assign({}, item, { qty: Math.min(10, qty) })] : [];
    }));
  }
  function openDrawer() {
    document.querySelector("[data-drawer]")?.classList.add("open");
    document.querySelector("[data-drawer-back]")?.classList.add("open");
  }
  function closeDrawer() {
    document.querySelector("[data-drawer]")?.classList.remove("open");
    document.querySelector("[data-drawer-back]")?.classList.remove("open");
  }
  function selected(form, fallback) {
    var chosen = form ? form.querySelector("input[name=sku]:checked") : null;
    return chosen || fallback;
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest("[data-open-cart]")) { openDrawer(); return; }
    if (event.target.closest("[data-close-cart]")) { closeDrawer(); return; }
    if (event.target.closest("[data-menu]")) {
      document.querySelector(".site-header")?.classList.toggle("nav-open");
      return;
    }
    var remove = event.target.closest("[data-remove]");
    if (remove) { change(remove.getAttribute("data-remove"), -99); return; }
    var inc = event.target.closest("[data-inc]");
    if (inc) { change(inc.getAttribute("data-inc"), 1); return; }
    var dec = event.target.closest("[data-dec]");
    if (dec) { change(dec.getAttribute("data-dec"), -1); return; }
    var qinc = event.target.closest("[data-qty-inc]");
    if (qinc) {
      var up = qinc.parentElement.querySelector("[data-qty]");
      if (up) up.value = String(Math.min(10, Number(up.value) + 1));
      return;
    }
    var qdec = event.target.closest("[data-qty-dec]");
    if (qdec) {
      var down = qdec.parentElement.querySelector("[data-qty]");
      if (down) down.value = String(Math.max(1, Number(down.value) - 1));
      return;
    }

    var addBtn = event.target.closest("[data-add]");
    if (addBtn) {
      var form = addBtn.closest("form");
      var source = selected(form, addBtn);
      var qtyInput = form ? form.querySelector("[data-qty]") : null;
      var qty = Math.max(1, Math.min(10, Number(qtyInput && qtyInput.value) || 1));
      add({
        sku: source.getAttribute("data-sku"),
        name: addBtn.getAttribute("data-name") || source.getAttribute("data-name"),
        label: source.getAttribute("data-label"),
        price: source.getAttribute("data-price"),
        image: addBtn.getAttribute("data-image") || source.getAttribute("data-image"),
        slug: addBtn.getAttribute("data-slug") || source.getAttribute("data-slug")
      }, qty);
      if (!addBtn.hasAttribute("data-quiet")) openDrawer();
      if (addBtn.hasAttribute("data-go-checkout")) location.href = "/checkout/";
    }
    if (event.target.closest("[data-pay-all]")) pay(event.target.closest("[data-pay-all]"));
  });

  document.addEventListener("change", function (event) {
    var input = event.target.closest("input[name=sku]");
    if (!input) return;
    var price = document.querySelector("[data-live-price]");
    if (price) price.textContent = money(Number(input.getAttribute("data-price")));
    var headline = document.querySelector("[data-live-headline]");
    if (headline && input.getAttribute("data-headline")) headline.textContent = input.getAttribute("data-headline");
    var url = new URL(location.href);
    url.searchParams.set("sku", input.getAttribute("data-sku"));
    history.replaceState(null, "", url);
  });

  function filterCards(q) {
    document.querySelectorAll("[data-product-card]").forEach(function (card) {
      card.hidden = q.length > 0 && card.getAttribute("data-product-card").indexOf(q) === -1;
    });
  }
  var search = document.querySelector("[data-search]");
  if (search) search.addEventListener("input", function () { filterCards(search.value.trim().toLowerCase()); });
  var params = new URLSearchParams(location.search);
  if (params.get("q") && search) {
    search.value = params.get("q");
    filterCards(params.get("q").trim().toLowerCase());
  }
  if (params.get("sku")) {
    var preset = document.querySelector('input[data-sku="' + CSS.escape(params.get("sku")) + '"]');
    if (preset) preset.checked = true;
  }

  document.querySelectorAll("[data-thumb]").forEach(function (button) {
    button.addEventListener("click", function () {
      var img = document.querySelector("[data-hero-img]");
      if (img) img.src = button.getAttribute("data-thumb");
      document.querySelectorAll("[data-thumb]").forEach(function (el) { el.removeAttribute("aria-current"); });
      button.setAttribute("aria-current", "true");
    });
  });

  async function pay(button) {
    var items = read();
    var error = document.querySelector("[data-pay-error]");
    if (!items.length) {
      if (error) { error.hidden = false; error.textContent = "Add a product before paying."; }
      return;
    }
    if (!window.UTILIY_CHECKOUT) {
      if (error) { error.hidden = false; error.textContent = "Checkout is not connected yet."; }
      return;
    }
    button.disabled = true;
    button.textContent = "Opening Stripe…";
    try {
      var res = await fetch(window.UTILIY_CHECKOUT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.map(function (item) { return { sku: item.sku, qty: item.qty }; }) })
      });
      var data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Stripe did not start checkout.");
      location.href = data.url;
    } catch (err) {
      button.disabled = false;
      button.textContent = "Pay with Stripe";
      if (error) { error.hidden = false; error.textContent = err.message || "Checkout failed."; }
    }
  }

  if (location.pathname.indexOf("/order/thanks") === 0) localStorage.removeItem(KEY);
  paint();
})();
