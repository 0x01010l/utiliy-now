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
      ? '<div class="stepper"><button type="button" data-dec="' + item.sku + '" aria-label="Decrease ' + item.name + ' quantity">−</button><input value="' + item.qty + '" aria-label="' + item.name + ' quantity" readonly><button type="button" data-inc="' + item.sku + '" aria-label="Increase ' + item.name + ' quantity">+</button></div>'
      : '<div class="muted">Qty ' + item.qty + "</div>";
    var ship = "";
    if (item.minDays) {
      var days = item.minDays === item.maxDays ? item.minDays + " days" : item.minDays + "–" + item.maxDays + " days";
      ship = '<div class="muted">Estimated delivery: ' + days + " from " + (item.shipsFrom === "US" ? "a US warehouse" : "the supplier") + "</div>";
    }
    var name = item.slug
      ? '<a href="/products/' + item.slug + '/"><strong>' + item.name + "</strong></a>"
      : "<strong>" + item.name + "</strong>";
    return '<article class="line"><img alt="' + item.name + '" src="' + item.image + '"><div>' + name +
      '<div class="muted">' + item.label + "</div>" + ship + qty +
      '<button type="button" data-remove="' + item.sku + '">Remove</button></div><div>' +
      money(item.price * item.qty) + "</div></article>";
  }

  function paint() {
    var items = read();
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      var n = count(items);
      el.textContent = String(n);
      el.hidden = n === 0;
    });
    var lines = document.querySelector("[data-cart-lines]");
    if (lines) lines.innerHTML = items.length ? items.map(function (item) { return line(item, true); }).join("") : '<p class="empty">Your cart is empty.</p>';
    document.querySelectorAll("[data-cart-total]").forEach(function (el) {
      el.textContent = money(total(items));
      el.hidden = !items.length;
    });
    var page = document.querySelector("[data-cart-page]");
    if (page) {
      page.innerHTML = items.length
        ? items.map(function (item) { return line(item, true); }).join("")
        : '<p class="empty">Your cart is empty. <a href="/shop/">Continue shopping</a>.</p>';
    }
    var summary = document.querySelector("[data-summary]");
    if (summary) {
      summary.innerHTML = items.length
        ? '<p class="total">' + money(total(items)) + "</p>"
        : '<p class="empty">Nothing to pay yet. <a href="/shop/">Continue shopping</a>.</p>';
    }
    document.querySelectorAll("[data-cart-go]").forEach(function (el) { el.hidden = !items.length; });
    document.querySelectorAll("[data-cart-empty]").forEach(function (el) { el.hidden = !!items.length; });
    document.querySelectorAll("[data-pay-all]").forEach(function (el) {
      el.hidden = !items.length;
      el.disabled = !items.length;
      el.textContent = items.length ? "Continue with " + money(total(items)) : "Continue to secure checkout";
    });
  }

  function add(data, qty) {
    var items = read();
    var found = items.find(function (item) { return item.sku === data.sku; });
    if (found) found.qty = Math.min(10, found.qty + qty);
    else items.push({
      sku: data.sku, name: data.name, label: data.label, price: Number(data.price),
      image: data.image, slug: data.slug, qty: qty,
      shipsFrom: data.shipsFrom || "", minDays: Number(data.minDays) || 0, maxDays: Number(data.maxDays) || 0
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
        slug: addBtn.getAttribute("data-slug") || source.getAttribute("data-slug"),
        shipsFrom: addBtn.getAttribute("data-ships") || "",
        minDays: addBtn.getAttribute("data-min") || "",
        maxDays: addBtn.getAttribute("data-max") || ""
      }, qty);
      if (addBtn.hasAttribute("data-go-checkout")) {
        closeDrawer();
        pay(addBtn);
      } else if (!addBtn.hasAttribute("data-quiet")) {
        openDrawer();
      }
    }
    if (event.target.closest("[data-pay-all]")) pay(event.target.closest("[data-pay-all]"));
  });

  document.addEventListener("change", function (event) {
    var input = event.target.closest("input[name=sku]");
    if (!input) return;
    var price = document.querySelector("[data-live-price]");
    if (price) price.textContent = money(Number(input.getAttribute("data-price")));
    var chosen = document.querySelector("[data-live-option]");
    if (chosen) chosen.textContent = input.getAttribute("data-label") || "";
    document.querySelectorAll("[data-add]").forEach(function (button) {
      button.setAttribute("data-sku-live", input.getAttribute("data-sku"));
    });
    var url = new URL(location.href);
    url.searchParams.set("sku", input.getAttribute("data-sku"));
    history.replaceState(null, "", url);
  });

  function onCatalog() {
    var path = location.pathname;
    return path === "/" || path === "/shop/" || path.endsWith("/shop/index.html");
  }
  function filterCards(q) {
    if (!onCatalog()) return;
    var shown = 0;
    document.querySelectorAll("[data-product-card]").forEach(function (card) {
      var hide = q.length > 0 && card.getAttribute("data-product-card").indexOf(q) === -1;
      card.hidden = hide;
      if (!hide) shown += 1;
    });
    var empty = document.querySelector("[data-search-empty]");
    if (empty) empty.hidden = q.length === 0 || shown > 0;
  }
  function pinHeader() {
    var header = document.querySelector(".site-header");
    if (header) document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
  }
  var search = document.querySelector("[data-search]");
  if (search && onCatalog()) search.addEventListener("input", function () { filterCards(search.value.trim().toLowerCase()); });
  var params = new URLSearchParams(location.search);
  if (params.get("q") && search && onCatalog()) {
    search.value = params.get("q");
    filterCards(params.get("q").trim().toLowerCase());
  }
  pinHeader();
  window.addEventListener("resize", pinHeader);
  if (params.get("sku")) {
    var preset = document.querySelector('input[data-sku="' + CSS.escape(params.get("sku")) + '"]');
    if (preset) preset.checked = true;
  }

  document.querySelectorAll("[data-thumb]").forEach(function (button) {
    button.addEventListener("click", function () {
      var img = document.querySelector("[data-hero-img]");
      if (img) {
        img.src = button.getAttribute("data-thumb");
        img.alt = button.getAttribute("data-alt") || img.alt;
      }
      document.querySelectorAll("[data-thumb]").forEach(function (el) {
        el.removeAttribute("aria-current");
        el.setAttribute("aria-pressed", "false");
      });
      button.setAttribute("aria-current", "true");
      button.setAttribute("aria-pressed", "true");
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
    button.textContent = "Opening secure checkout…";
    try {
      var res = await fetch(window.UTILIY_CHECKOUT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.map(function (item) { return { sku: item.sku, qty: item.qty }; }) })
      });
      var data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.message || data.error || "Checkout could not be started.");
      location.href = data.url;
    } catch (err) {
      button.disabled = false;
      paint();
      if (error) { error.hidden = false; error.textContent = err.message || "Checkout failed."; }
    }
  }

  async function showOrderStatus() {
    var target = document.querySelector("[data-order-status]");
    if (!target || !window.UTILIY_COMMERCE) return;
    var query = new URLSearchParams(location.search);
    var orderId = query.get("order_id");
    var key = query.get("key");
    if (!orderId || !key) {
      target.innerHTML = '<p class="kicker">Order</p><h1>Order link incomplete.</h1><p>Check your payment receipt or contact support@utiliy.com.</p>';
      return;
    }
    try {
      var response = await fetch(window.UTILIY_COMMERCE + "/orders/" + encodeURIComponent(orderId) + "?key=" + encodeURIComponent(key));
      var order = await response.json();
      if (!response.ok) throw new Error(order.message || "Order status is unavailable.");
      if (["failed", "cancelled"].includes(order.status)) {
        target.innerHTML = '<p class="kicker">Payment not completed</p><h1>This order was ' +
          String(order.status) + '.</h1><p>No second payment will be taken automatically. Return to the cart to try again or contact support@utiliy.com.</p><p><a class="btn" href="/cart/">Return to cart</a></p>';
      } else if (order.status === "refunded") {
        localStorage.removeItem(KEY);
        target.innerHTML = '<p class="kicker">Refunded</p><h1>Your order was refunded.</h1><p>The bank may take several business days to post the refund. Contact support@utiliy.com if you need help.</p>';
      } else if (order.paid) {
        localStorage.removeItem(KEY);
        var tracking = order.trackingUrl
          ? '<p><a class="btn-line" href="' + String(order.trackingUrl) + '" rel="noopener">Track shipment</a></p>'
          : "";
        target.innerHTML = '<p class="kicker">Paid</p><h1>Order received.</h1><p>Your order number is ' +
          String(order.orderId) + '. Your confirmation email has been queued.</p>' + tracking +
          '<p><a class="btn" href="/shop/">Back to the shop</a></p>';
      } else {
        target.innerHTML = '<p class="kicker">Processing</p><h1>Payment is still confirming.</h1><p>Refresh this page shortly. Do not submit a second payment.</p>';
      }
      paint();
    } catch (error) {
      target.innerHTML = '<p class="kicker">Order</p><h1>Status temporarily unavailable.</h1><p>' +
        String(error.message || "Contact support@utiliy.com.") + '</p>';
    }
  }

  showOrderStatus();
  paint();
  var autoCheckout = document.querySelector("[data-auto-checkout]");
  if (autoCheckout && read().length) pay(autoCheckout);
})();
