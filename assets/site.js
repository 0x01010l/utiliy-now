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

  function paint() {
    var items = read();
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      el.textContent = String(count(items));
    });
    var lines = document.querySelector("[data-cart-lines]");
    if (lines) {
      if (!items.length) {
        lines.innerHTML = '<p class="empty">The cart is empty.</p>';
      } else {
        lines.innerHTML = items.map(function (item) {
          return '<article class="line"><img alt="" src="' + item.image + '"><div><strong>' +
            item.name + '</strong><div class="muted">' + item.label + '</div><div class="muted">' +
            money(item.price) + ' × ' + item.qty + '</div></div><button type="button" data-remove="' +
            item.sku + '">Remove</button></article>';
        }).join("");
      }
    }
    var sum = document.querySelector("[data-cart-total]");
    if (sum) sum.textContent = money(total(items));
    var page = document.querySelector("[data-cart-page]");
    if (page) {
      page.innerHTML = lines ? lines.innerHTML : "";
      if (!items.length) page.innerHTML = '<p class="empty">The cart is empty. <a href="/shop/">Browse the shop.</a></p>';
    }
    var checkout = document.querySelector("[data-checkout]");
    if (checkout) {
      if (!items.length) {
        checkout.innerHTML = '<p class="empty">Nothing to pay yet. <a href="/shop/">Browse the shop.</a></p>';
      } else {
        checkout.innerHTML = items.map(function (item) {
          var href = item.payUrl
            ? item.payUrl
            : "";
          var pay = href
            ? '<a class="btn" href="' + href + '">Pay ' + money(item.price * item.qty) + ' with Stripe</a>'
            : '<span class="muted">Stripe link for this size is not connected yet.</span>';
          return '<article class="line" style="grid-template-columns:64px 1fr"><img alt="" src="' + item.image +
            '"><div><strong>' + item.name + '</strong><div class="muted">' + item.label + ' · qty ' + item.qty +
            '</div><div style="margin-top:8px">' + pay + '</div></div></article>';
        }).join("") + '<p class="muted">Each size is its own Stripe payment. The Stripe page opens at quantity 1, so change the quantity there if the cart shows more than one. Shipping to the US is included. Stripe collects the address.</p>';
      }
    }
  }

  function add(data, qty) {
    var items = read();
    var found = items.find(function (item) { return item.sku === data.sku; });
    if (found) found.qty += qty;
    else items.push({
      sku: data.sku,
      name: data.name,
      label: data.label,
      price: Number(data.price),
      image: data.image,
      payUrl: data.pay || "",
      slug: data.slug,
      qty: qty
    });
    write(items);
    openDrawer();
  }

  function openDrawer() {
    document.querySelector("[data-drawer]")?.classList.add("open");
    document.querySelector("[data-drawer-back]")?.classList.add("open");
  }
  function closeDrawer() {
    document.querySelector("[data-drawer]")?.classList.remove("open");
    document.querySelector("[data-drawer-back]")?.classList.remove("open");
  }

  document.addEventListener("click", function (event) {
    var open = event.target.closest("[data-open-cart]");
    if (open) { openDrawer(); return; }
    if (event.target.closest("[data-close-cart]")) { closeDrawer(); return; }
    var remove = event.target.closest("[data-remove]");
    if (remove) {
      write(read().filter(function (item) { return item.sku !== remove.getAttribute("data-remove"); }));
      return;
    }
    var buy = event.target.closest("[data-buy]");
    if (buy) {
      var buyForm = buy.closest("form");
      var chosenPay = buyForm ? buyForm.querySelector("input[name=sku]:checked") : null;
      var payUrl = chosenPay && chosenPay.getAttribute("data-pay");
      if (payUrl) location.href = payUrl;
      return;
    }
    var addBtn = event.target.closest("[data-add]");
    if (addBtn) {
      var form = addBtn.closest("form");
      var qtyInput = form ? form.querySelector("[data-qty]") : null;
      var qty = Math.max(1, Number(qtyInput && qtyInput.value) || 1);
      var chosen = form ? form.querySelector("input[name=sku]:checked") : null;
      var source = chosen || addBtn;
      add({
        sku: source.getAttribute("data-sku") || addBtn.getAttribute("data-sku"),
        name: addBtn.getAttribute("data-name"),
        label: source.getAttribute("data-label") || addBtn.getAttribute("data-label"),
        price: source.getAttribute("data-price") || addBtn.getAttribute("data-price"),
        image: addBtn.getAttribute("data-image"),
        pay: source.getAttribute("data-pay") || addBtn.getAttribute("data-pay"),
        slug: addBtn.getAttribute("data-slug")
      }, qty);
    }
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

  var search = document.querySelector("[data-search]");
  if (search) {
    search.addEventListener("input", function () {
      var q = search.value.trim().toLowerCase();
      document.querySelectorAll("[data-product-card]").forEach(function (card) {
        var hay = card.getAttribute("data-product-card");
        card.hidden = q.length > 0 && hay.indexOf(q) === -1;
      });
    });
  }

  document.querySelectorAll("[data-thumb]").forEach(function (button) {
    button.addEventListener("click", function () {
      var img = document.querySelector("[data-hero-img]");
      if (img) {
        img.src = button.getAttribute("data-thumb");
        img.alt = button.getAttribute("data-alt") || img.alt;
      }
      document.querySelectorAll("[data-thumb]").forEach(function (el) { el.removeAttribute("aria-current"); });
      button.setAttribute("aria-current", "true");
    });
  });

  var params = new URLSearchParams(location.search);
  if (params.get("sku")) {
    var preset = document.querySelector('input[data-sku="' + CSS.escape(params.get("sku")) + '"]');
    if (preset) preset.checked = true;
  }

  paint();
})();
