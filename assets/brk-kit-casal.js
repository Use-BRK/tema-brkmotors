/* BRK Motors — Kit Casal (sections/brk-kit-casal.liquid)
 * Port do "Monte seu Kit" do Agro (brk-monte-kit.js) para casal.
 *
 * Etapas: 1 camisa dele (+tamanho) → 2 camisa dela (+tamanho) → 3 extras (opcional) → 4 resumo.
 * - Camisas vêm de /collections/<handle>/products.json (paginado, só disponíveis e só camisas).
 * - Na etapa dela, a versão feminina da mesma estampa da camisa dele vem fixada em 1º, com selo
 *   (busca preditiva da Shopify com o nome da camisa dele; só quando o nome bate inteiro).
 * - Gaveta de escolha: um grupo por opção do produto (Cor → Tamanho); a foto troca com a cor.
 * - Extras vêm do JSON da seção.
 * - Preço do kit exibido = dele + dela − desconto do kit. O desconto real é o cupom da seção;
 *   aqui só mostra.
 * - Adiciona tudo num /cart/add.js; as duas camisas levam a property `_kit`, extras `_kit_extra`.
 * - Clarity: eventos `kitcasal_<acao>`.
 */
(() => {
  if (customElements.get("brk-kit-casal")) return;

  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const money = (cents) => BRL.format((cents || 0) / 100);
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const clarity = (name) => {
    try { if (typeof window.clarity === "function") window.clarity("event", "kitcasal_" + name); } catch (_) {}
  };
  const abs = (src) => (src && src.startsWith("//") ? "https:" + src : src);
  const sized = (src, w) => {
    if (!src) return "";
    try {
      const u = new URL(abs(src), window.location.origin);
      u.searchParams.set("width", w);
      return u.toString();
    } catch (_) { return src; }
  };

  // /products.json → mesmo formato do snippet brk-kit-casal-product-json
  const fromStorefront = (p) => ({
    id: p.id,
    handle: p.handle,
    title: p.title,
    type: p.product_type || "",
    url: "/products/" + p.handle,
    image: p.images?.[0]?.src || null,
    image2: p.images?.[1]?.src || null,
    images: (p.images || []).slice(0, 10).map((i) => i.src),
    options: (p.options || []).map((o) => o.name),
    variants: (p.variants || []).map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku || "",
      available: !!v.available,
      options: [v.option1, v.option2, v.option3].filter((x) => x != null),
      image: v.featured_image?.src || null,
      price: Math.round(parseFloat(v.price) * 100),
      compare: v.compare_at_price ? Math.round(parseFloat(v.compare_at_price) * 100) : 0,
    })),
  });
  // /products/<handle>.js → mesmo formato (preços já em centavos)
  const fromAjax = (p) => ({
    id: p.id,
    handle: p.handle,
    title: p.title,
    type: p.type || "",
    url: "/products/" + p.handle,
    image: abs(p.images?.[0]) || null,
    image2: abs(p.images?.[1]) || null,
    images: (p.images || []).slice(0, 10).map(abs),
    options: (p.options || []).map((o) => (typeof o === "string" ? o : o.name)),
    variants: (p.variants || []).map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku || "",
      available: !!v.available,
      options: v.options || [],
      image: abs(v.featured_image?.src) || null,
      price: v.price,
      compare: v.compare_at_price || 0,
    })),
  });
  const minPrice = (p) => {
    const av = p.variants.filter((v) => v.available);
    return Math.min(...(av.length ? av : p.variants).map((v) => v.price));
  };
  const isAvailable = (p) => p.variants.some((v) => v.available);
  const isColor = (name) => /^cor(es)?$/i.test(String(name || "").trim());
  // "Azul / M" → "M" (última opção = tamanho)
  const sizeOf = (v) => (v.options && v.options.length ? v.options[v.options.length - 1] : v.title);
  // "Cor: Azul · Tamanho: M"
  const optText = (p, v) =>
    p.variants.length < 2 ? "" : (p.options || []).length && v.options?.length
      ? p.options.map((n, i) => `${esc(n)}: <b>${esc(v.options[i])}</b>`).join(" · ")
      : `Tamanho: <b>${esc(v.title)}</b>`;

  // ícones de traço (24x24) para a barra
  const ICON_PATH = {
    shirt: '<path d="M8.5 3.5 4 5.8 2.5 10l3 1.4 1-2.1V20.5h11V9.3l1 2.1 3-1.4L20 5.8l-4.5-2.3"/><path d="M8.5 3.5c.6 1.6 1.9 2.5 3.5 2.5s2.9-.9 3.5-2.5"/>',
    glasses: '<path d="M2.5 10.5h19"/><path d="M3 10.5c0 3.2 1.4 5 4 5s3.8-1.8 3.8-5M13.2 10.5c0 3.2 1.4 5 3.8 5s4-1.8 4-5"/><path d="M10.8 11.2c.8-.6 1.6-.6 2.4 0"/>',
    cap: '<path d="M4 15.5c0-5 3.6-9 8-9s8 4 8 9"/><path d="M4 15.5h16.5c.9 0 1.5.7 1.5 1.5H4z"/><path d="M12 6.5v3M9.5 7.2c-.8 2-1.2 4.8-1.2 8.3"/>',
    bandana: '<path d="M6 4h12v16H6z"/><path d="M6 9h12M6 15h12"/>',
    sleeve: '<path d="M8 3h8l-1 18H9z"/><path d="M8.3 7h7.4M9 17h6"/>',
    bag: '<path d="M5 8h14l-1 12.5H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON_PATH[k] || ICON_PATH.bag}</svg>`;
  const iconFor = (title) =>
    /[óo]culos/i.test(title) ? "glasses" : /bon[ée]|chap[ée]u/i.test(title) ? "cap" : /bandana|balaclava/i.test(title) ? "bandana" : /manguito/i.test(title) ? "sleeve" : "bag";

  // coleções amplas (motociclismo, mais vendidos...) trazem acessórios e kits: na etapa da camisa só entra camisa
  const NOT_SHIRT = /kit|bandana|balaclava|manguito|bon[eé]|chap[eé]u|[oó]culos|luva|adesivo|caneca|copo|garrafa|meia|cal[çc]a|bermuda|vale|cart[aã]o|jaqueta|moletom|corta.?vento/i;
  const isShirt = (p) => !NOT_SHIRT.test(p.type) && !NOT_SHIRT.test(p.title);
  // coleções mistas: dele não entra feminina; dela não entra masculina
  const fitsGender = (p, g) => (g === "masculino" ? !/feminin/i.test(p.title) : !/masculin/i.test(p.title));

  // "Camisa de Motociclismo Brk Atacama Chile Azul e Dourado com Proteção Solar UV50+" → "atacama chile azul e dourado"
  const STOP = /\b(camisas?|camisetas?|de|do|da|dos|das|motociclismo|masculin[ao]s?|feminin[ao]s?|brk|motors|com|prote[çc][aã]o|solar|uv50\+?|uv|segunda|pele|manga|longa|curta|envio|imediato|raglan|expedi[çc][aã]o)\b/gi;
  const matchKey = (title) =>
    String(title || "").replace(/[-–|+]/g, " ").replace(STOP, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const words = (s) => new Set(matchKey(s).split(" ").filter((w) => w.length > 1 && w !== "e"));

  const MATCH = "__match";
  // código base do SKU: "ADV116G1" → ADV116 | "ADV116BLG1" → ADV116 + BL (feminina)
  const SKU_CODE = /^([A-Z]+\d+)(BL)?/;
  const GENDER = { 1: "masculino", 2: "feminino" };

  class BrkKitCasal extends HTMLElement {
    connectedCallback() {
      if (this._ready) return;
      this._ready = true;
      this.cfg = JSON.parse(this.querySelector("[data-bmk-config]").textContent);
      this.t = this.cfg.text;
      this.extras = (this.cfg.upsell.extras || []).filter((e) => e.products.length);
      this.hasUpsell = !!(this.cfg.upsell.enabled && this.extras.length);
      this.steps = this.hasUpsell ? [1, 2, 3, 4] : [1, 2, 4];
      if (!this.hasUpsell) {
        this.querySelector('[data-bmk-step-dot="3"]')?.remove();
        this.querySelector('[data-bmk-panel="3"]')?.remove();
        const last = this.querySelector('[data-bmk-step-dot="4"] .bmk__step-num');
        if (last) last.textContent = "3";
      }
      this.state = { step: 1, masc: null, fem: null, upsell: new Map() };
      this.active = { masculino: null, feminino: null }; // chip ativo por etapa
      this.shirtCache = new Map(); // handle -> {items, page, done}
      this.shirtIndex = new Map(); // product id -> product
      this.$ = (sel) => this.querySelector(sel);

      this.addEventListener("click", (e) => this.onClick(e));
      this.addEventListener("keydown", (e) => {
        const v = this.$("[data-bmk-viewer]");
        if (v && !v.hidden) {
          if (e.key === "Escape") return this.closeViewer();
          if (e.key === "ArrowRight") return this.navViewer(1);
          if (e.key === "ArrowLeft") return this.navViewer(-1);
          return;
        }
        if (e.key === "Escape") this.closeSheet();
      });
      this.render();
    }

    /* ---------- navegação ---------- */
    onClick(e) {
      if (e.target.matches("[data-bmk-viewer], .bmk__viewer-box, .bmk__viewer-track, .bmk__viewer-slide")) return this.closeViewer();
      const t = e.target.closest("button, [data-bmk-sheet-close]");
      if (!t || !this.contains(t)) return;
      const d = t.dataset;
      if (d.bmkGoto) return this.goto(+d.bmkGoto);
      if (d.bmkChip !== undefined) return this.selectChip(d.bmkChip);
      if (t.hasAttribute("data-bmk-more")) return this.loadShirts(this.active[this.gender()], true);
      if (d.bmkShirt) return this.openSheet(this.state.step === 2 ? "fem" : "masc", this.shirtIndex.get(+d.bmkShirt));
      if (d.bmkExtra) return this.toggleExtra(d.bmkExtra);
      if (d.bmkRail) {
        const rail = t.parentElement.querySelector(".bmk__carousel");
        if (rail) rail.scrollBy({ left: +d.bmkRail * rail.clientWidth * 0.8, behavior: "smooth" });
        return;
      }
      if (d.bmkUp) return this.openSheet("upsell", this.extras.flatMap((x) => x.products).find((p) => p.id === +d.bmkUp));
      if (d.bmkUpRemove) { this.state.upsell.delete(+d.bmkUpRemove); clarity("extra_remover"); return this.render(); }
      if (d.bmkOpt !== undefined) return this.pickOpt(+d.bmkOpt, d.bmkVal);
      if (t.hasAttribute("data-bmk-zoom")) return this.openViewer(this.sheet?.product);
      if (t.hasAttribute("data-bmk-viewer-close")) return this.closeViewer();
      if (d.bmkViewerNav) return this.navViewer(+d.bmkViewerNav);
      if (t.hasAttribute("data-bmk-sheet-close")) return this.closeSheet();
      if (t.hasAttribute("data-bmk-sheet-confirm")) return this.confirmSheet();
      if (t.hasAttribute("data-bmk-next")) return this.next();
      if (t.hasAttribute("data-bmk-back")) return this.back();
      if (t.hasAttribute("data-bmk-add")) return this.addToCart();
      if (d.bmkEdit) return this.goto(+d.bmkEdit);
    }

    gender() { return GENDER[this.state.step] || null; }
    panel(step) { return this.querySelector(`[data-bmk-panel="${step}"]`); }

    canEnter(step) {
      const s = this.state;
      if (step <= 1) return true;
      if (step === 2) return !!s.masc;
      return !!(s.masc && s.fem); // 3 e 4
    }
    goto(step) {
      if (!this.steps.includes(step) || !this.canEnter(step)) return;
      this.state.step = step;
      clarity("etapa_" + step);
      this.render();
      const top = this.getBoundingClientRect().top + window.scrollY - 90;
      if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
    }
    next() {
      const i = this.steps.indexOf(this.state.step);
      if (i < this.steps.length - 1) this.goto(this.steps[i + 1]);
    }
    back() {
      const i = this.steps.indexOf(this.state.step);
      if (i > 0) this.goto(this.steps[i - 1]);
    }

    /* ---------- preço ---------- */
    totals() {
      const s = this.state;
      let full = 0;
      if (s.masc) full += s.masc.variant.price;
      if (s.fem) full += s.fem.variant.price;
      s.upsell.forEach((u) => { full += u.variant.price; });
      const off = s.masc && s.fem ? this.cfg.discount : 0;
      return { full, pay: Math.max(0, full - off), off };
    }

    /* ---------- render ---------- */
    render() {
      const s = this.state;
      this.dataset.step = s.step;
      this.querySelectorAll("[data-bmk-panel]").forEach((p) => (p.hidden = +p.dataset.bmkPanel !== s.step));
      const idx = this.steps.indexOf(s.step);
      this.$("[data-bmk-fill]").style.width = (idx / (this.steps.length - 1)) * 100 + "%";
      this.querySelectorAll("[data-bmk-step-dot]").forEach((li) => {
        const n = +li.dataset.bmkStepDot;
        const i = this.steps.indexOf(n);
        li.classList.toggle("is-active", n === s.step);
        li.classList.toggle("is-done", i < idx || (n !== s.step && this.isDone(n)));
        li.querySelector("button").disabled = !this.canEnter(n);
      });
      if (s.step === 1 || s.step === 2) this.renderShirtStep();
      if (s.step === 3) this.renderUpsell();
      if (s.step === 4) this.renderSummary();
      this.renderBar();
    }
    isDone(n) {
      const s = this.state;
      return (n === 1 && s.masc) || (n === 2 && s.fem) || (n === 3 && s.fem && s.step === 4);
    }

    renderBar() {
      const s = this.state;
      const bar = this.$("[data-bmk-bar]");
      bar.hidden = s.step === 4;
      if (bar.hidden) return;
      const { full, pay } = this.totals();
      const slot = (ico, label, item, tag = "", extra = false) => {
        const sz = item ? sizeOf(item.variant) : "";
        const size = item && item.product.variants.length > 1 && sz.length <= 3 ? sz : "";
        return `<span class="bmk__slot${item ? " is-on" : ""}${extra ? " is-extra" : ""}" title="${esc(label)}${size ? " " + esc(size) : ""}">
          ${tag ? `<b>${esc(tag)}</b>` : ""}${icon(ico)}${extra ? "" : item && size ? `<i>${esc(size)}</i>` : item ? `<i>✓</i>` : ""}
          <span class="visually-hidden">${esc(label)}</span>
        </span>`;
      };
      let slots = slot("shirt", "Camisa dele", s.masc, this.t.tagMasc) + slot("shirt", "Camisa dela", s.fem, this.t.tagFem);
      let stack = "";
      s.upsell.forEach((u, id) => {
        const cat = this.extras.find((e) => e.products.some((p) => p.id === id));
        stack += slot(iconFor(cat ? cat.title : u.product.title), cat ? cat.title : "Extra", u, "", true);
      });
      if (stack) slots += `<span class="bmk__slot-stack">${stack}</span><span class="bmk__slot-more" title="Extras">+${s.upsell.size}</span>`;
      this.$("[data-bmk-bar-picks]").innerHTML = `
        <span class="bmk__bar-items">${slots}</span>
        <span class="bmk__bar-total">${full !== pay ? `<s>${money(full)}</s>` : ""}<strong>${full ? money(pay) : "R$ 0,00"}</strong>${full !== pay ? `<em>${esc(this.t.withDiscount)}</em>` : ""}</span>`;
      this.$("[data-bmk-bar-price]").innerHTML = "";

      const back = this.$("[data-bmk-back]");
      back.disabled = s.step === 1;
      const next = this.$("[data-bmk-next]");
      const i = this.steps.indexOf(s.step);
      next.disabled = !this.canEnter(this.steps[i + 1]);
      this.nextLabel ??= next.textContent.trim();
      next.textContent = s.step === 3 && !s.upsell.size ? this.t.skip : this.nextLabel;
    }

    /* ---------- etapas 1 e 2: camisas ---------- */
    chipsFor(g) {
      const chips = [];
      this.cfg.filters.filter((f) => f.gender === g).forEach((f) => chips.push({ label: f.label, handle: f.handle }));
      const all = this.cfg.shirtCollections[g];
      if (all) chips.push({ label: this.cfg.allLabel || "Todas", handle: all });
      return chips;
    }
    matchHandle() { return MATCH + ":" + (this.state.masc ? this.state.masc.product.id : ""); }
    renderShirtStep() {
      const g = this.gender();
      const p = this.panel(this.state.step);
      const chips = this.chipsFor(g);
      this.chips = chips;
      if (!this.active[g] || !chips.some((c) => c.handle === this.active[g])) this.active[g] = chips[0]?.handle || null;
      const act = this.active[g];
      p.querySelector("[data-bmk-chips]").innerHTML = chips
        .map(
          (c, i) =>
            `<button type="button" role="tab" class="bmk__chip${c.match ? " bmk__chip--match" : ""}${c.handle === act ? " is-active" : ""}" aria-selected="${c.handle === act}" data-bmk-chip="${i}">${esc(c.label)}</button>`
        )
        .join("");
      if (!act) {
        p.querySelector("[data-bmk-shirts]").innerHTML = `<p class="bmk__empty">${esc(this.t.empty)}</p>`;
        return;
      }
      if (this.shirtCache.get(act)) this.paintShirts();
      else this.loadShirts(act, false);
      if (g === "feminino") this.ensureMatch();
    }
    // Mesma estampa da camisa dele: uma só, fixada em 1º na lista dela (com selo), em qualquer filtro.
    async ensureMatch() {
      const m = this.state.masc;
      const id = m && this.mascCode();
      if (!this.cfg.match.enabled || !m || this.pinFor === id) return;
      this.pinFor = id;
      this.pinned = null;
      try {
        const ex = (await this.fetchMatches()).find((p) => p.exact && isAvailable(p));
        if (ex && this.pinFor === id) { this.pinned = ex; this.shirtIndex.set(ex.id, ex); }
      } catch (e) { console.error("[brk-kit-casal] mesma estampa", e); }
      if (this.pinned && this.pinFor === id && this.state.step === 2 && this.shirtCache.get(this.active.feminino)) this.paintShirts();
    }
    selectChip(i) {
      const c = this.chips?.[+i];
      if (!c) return;
      this.active[this.gender()] = c.handle;
      clarity("filtro_" + (c.match ? "combina" : c.handle));
      this.renderShirtStep();
    }
    async fetchPage(handle, page, per) {
      const r = await fetch(`/collections/${encodeURIComponent(handle)}/products.json?limit=${per}&page=${page}`);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const { products } = await r.json();
      return products;
    }
    // Versão feminina da camisa dele pelo SKU: dele "ADV116G1" → código "ADV116" → dela "ADV116BL…".
    // Usa o SKU da variante escolhida (camisas com várias cores têm um código por cor).
    mascCode() {
      const m = this.state.masc;
      if (!m) return "";
      const skus = [m.variant?.sku, ...(m.product.variants || []).map((v) => v.sku)];
      for (const s of skus) {
        const x = String(s || "").trim().toUpperCase().match(SKU_CODE);
        if (x && !x[2]) return x[1];
      }
      return "";
    }
    async fetchMatches() {
      const code = this.mascCode();
      if (!code) return [];
      const r = await fetch(`/search/suggest.json?q=${encodeURIComponent(code + "BL")}&resources[type]=product&resources[limit]=10&resources[options][fields]=variants.sku&resources[options][unavailable_products]=hide`);
      if (!r.ok) return [];
      const found = ((await r.json()).resources?.results?.products || []).filter((p) => !NOT_SHIRT.test(p.title) && !NOT_SHIRT.test(p.type || ""));
      const full = (await Promise.all(
        found.slice(0, 6).map((p) => fetch(`/products/${encodeURIComponent(p.handle)}.js`).then((x) => (x.ok ? x.json() : null)).catch(() => null))
      )).filter(Boolean).map(fromAjax);
      // só vale se algum SKU dela for exatamente CÓDIGO + BL (ADV13BL não casa com ADV137)
      const same = (p) => p.variants.some((v) => { const x = String(v.sku || "").trim().toUpperCase().match(SKU_CODE); return x && x[1] === code && x[2]; });
      // várias com o mesmo código (ex.: básicas "Envio Imediato"): prefere a do mesmo tipo da dele
      const ei = /envio imediato/i.test(this.state.masc.product.title);
      return full.filter(same)
        .sort((x, y) => (/envio imediato/i.test(y.title) === ei) - (/envio imediato/i.test(x.title) === ei))
        .map((p) => ({ ...p, exact: true }));
    }
    async loadShirts(handle, more) {
      if (!handle) return;
      const g = this.gender();
      let cache = this.shirtCache.get(handle);
      if (!cache) { cache = { items: [], page: 0, done: false, loading: false }; this.shirtCache.set(handle, cache); }
      if (cache.loading || cache.done) return;
      cache.loading = true;
      const p = this.panel(this.state.step);
      const grid = p.querySelector("[data-bmk-shirts]");
      if (!more) grid.innerHTML = Array.from({ length: 8 }, () => `<div class="bmk__card is-skeleton"><div class="bmk__card-media"></div><div class="bmk__card-body"><span></span><span></span></div></div>`).join("");
      const moreBtn = p.querySelector("[data-bmk-more]");
      moreBtn.classList.add("is-loading");
      const push = (prod) => {
        if (!isAvailable(prod) || !isShirt(prod) || !fitsGender(prod, g)) return false;
        if (cache.items.some((x) => x.id === prod.id)) return false;
        cache.items.push(prod);
        this.shirtIndex.set(prod.id, prod);
        return true;
      };
      try {
        if (handle.startsWith(MATCH)) {
          (await this.fetchMatches()).forEach(push);
          cache.done = true;
        } else {
          const per = this.cfg.perPage || 24;
          // a coleção pode ter muitos esgotados/acessórios: busca até juntar uma página de camisas disponíveis
          let added = 0;
          while (added < per && !cache.done) {
            cache.page += 1;
            const products = await this.fetchPage(handle, cache.page, per);
            if (!products.length || products.length < per) cache.done = true;
            products.map(fromStorefront).forEach((x) => { if (push(x)) added++; });
          }
        }
      } catch (err) {
        console.error("[brk-kit-casal] camisas", err);
        cache.page = Math.max(0, cache.page - 1);
        if (handle.startsWith(MATCH)) cache.done = true;
      } finally {
        cache.loading = false;
        moreBtn.classList.remove("is-loading");
      }
      if (this.gender() !== g) return;
      // "Combina com a dele" sem resultado: some e cai no próximo filtro
      if (handle.startsWith(MATCH) && !cache.items.length) {
        if (this.active[g] === handle) this.active[g] = null;
        return this.renderShirtStep();
      }
      if (this.active[g] === handle) this.paintShirts();
    }
    paintShirts() {
      const g = this.gender();
      const p = this.panel(this.state.step);
      const act = this.active[g];
      const cache = this.shirtCache.get(act);
      const grid = p.querySelector("[data-bmk-shirts]");
      if (cache.loading && !cache.items.length) return; // ainda no esqueleto
      let items = cache.items;
      const pin = g === "feminino" ? this.pinned : null;
      if (pin) items = [pin, ...items.filter((x) => x.id !== pin.id)];
      const picked = g === "masculino" ? this.state.masc : this.state.fem;
      const sel = picked?.product.id;
      const masc = this.state.masc;
      const off = this.cfg.discount;
      const offTxt = off ? this.t.offBadge.replace("{valor}", off % 100 ? (off / 100).toFixed(2).replace(".", ",") : String(off / 100)) : "";
      grid.innerHTML = items.length
        ? items
            .map((prod) => {
              const price = minPrice(prod);
              let foot = `<span class="bmk__card-price">${money(price)}</span>`;
              if (g === "feminino" && masc) {
                foot = `<span class="bmk__kit-box"><small>${esc(this.t.kitOut)}</small>${off ? `<s>${money(masc.variant.price + price)}</s>` : ""}<strong>${money(Math.max(0, masc.variant.price + price - off))}</strong></span>`;
              }
              return `<button type="button" class="bmk__card${prod.id === sel ? " is-selected" : ""}" data-bmk-shirt="${prod.id}">
                <span class="bmk__card-media">
                  <img src="${esc(sized(prod.image, 500))}" alt="${esc(prod.title)}" loading="lazy" width="500" height="625">
                  ${prod.image2 ? `<img class="bmk__card-alt" src="${esc(sized(prod.image2, 500))}" alt="" loading="lazy" width="500" height="625">` : ""}
                  ${prod.id === sel ? `<span class="bmk__card-check">✓ ${esc(picked.variant.title)}</span>` : ""}
                  ${pin && prod.id === pin.id ? `<span class="bmk__card-match">${esc(this.t.matchBadge)}</span>` : ""}
                  ${g === "masculino" && off ? `<span class="bmk__card-off">${esc(offTxt)}</span>` : ""}
                </span>
                <span class="bmk__card-body">
                  <span class="bmk__card-title">${esc(prod.title)}</span>
                  ${foot}
                </span>
              </button>`;
            })
            .join("")
        : `<p class="bmk__empty">${esc(this.t.empty)}</p>`;
      p.querySelector("[data-bmk-more]").hidden = cache.done;
    }

    /* ---------- etapa 3: extras ----------
     * Categorias empilhadas (bandanas, manguitos, óculos, bonés). Tocar abre a categoria ali mesmo com um
     * trilho de produtos; tocar no produto abre a gaveta de tamanho. Uma categoria aberta por vez.
     */
    toggleExtra(id) {
      this.openExtra = this.openExtra === id ? null : id;
      clarity("extra_categoria_" + (this.openExtra ? "abrir" : "fechar"));
      this.renderUpsell();
      if (this.openExtra) {
        const el = this.querySelector(`[data-bmk-extra-wrap="${CSS.escape(id)}"]`);
        if (el && el.getBoundingClientRect().top < 80) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    renderUpsell() {
      const list = this.extras;
      if (this.openExtra && !list.some((e) => e.id === this.openExtra)) this.openExtra = null;
      this.$("[data-bmk-upsell]").innerHTML = list
        .map((e) => {
          const open = this.openExtra === e.id;
          const ids = new Set(e.products.map((p) => p.id));
          const chosen = [...this.state.upsell.keys()].filter((id) => ids.has(id)).length;
          const from = Math.min(...e.products.map(minPrice));
          const cover = e.image || e.products[0].scene || e.products[0].image;
          const isPhoto = !!(e.image || e.products[0].scene);
          return `<div class="bmk__extra${open ? " is-open" : ""}${chosen ? " has-pick" : ""}" data-bmk-extra-wrap="${esc(e.id)}">
            <button type="button" class="bmk__extra-head" data-bmk-extra="${esc(e.id)}" aria-expanded="${open}">
              <span class="bmk__extra-info">
                <span class="bmk__extra-title">${esc(e.title)}${chosen ? `<span class="bmk__extra-count">${chosen} no kit</span>` : ""}</span>
                ${e.text ? `<span class="bmk__extra-text">${esc(e.text)}</span>` : ""}
                <span class="bmk__extra-from">a partir de <b>${money(from)}</b></span>
              </span>
              <span class="bmk__extra-media${isPhoto ? " is-photo" : ""} is-focus-${esc(e.focus || "center")}" style="--bmk-zoom:${(e.zoom || 112) / 100}"><img src="${esc(sized(cover, 600))}" alt="" loading="lazy" width="600" height="600"></span>
              <span class="bmk__extra-chev" aria-hidden="true"></span>
            </button>
            ${open ? `<div class="bmk__extra-body">
              <button type="button" class="bmk__rail-nav is-prev" data-bmk-rail="-1" aria-label="Anterior"></button>
              <button type="button" class="bmk__rail-nav is-next" data-bmk-rail="1" aria-label="Próximo"></button>
              <div class="bmk__grid bmk__grid--rail bmk__grid--upsell bmk__carousel">
                ${e.products.map((p) => this.upsellCard(p)).join("")}
              </div>
            </div>` : ""}
          </div>`;
        })
        .join("");
    }
    upsellCard(p) {
      const chosen = this.state.upsell.get(p.id);
      return `<div class="bmk__card bmk__card--static${chosen ? " is-selected" : ""}">
        <button type="button" class="bmk__card-hit" data-bmk-up="${p.id}" aria-label="${esc(p.title)}"></button>
        <span class="bmk__card-media" style="aspect-ratio:${Math.min(1.25, Math.max(0.7, p.ratio || 1))}">
          <img src="${esc(sized(p.image, 500))}" alt="${esc(p.title)}" loading="lazy" width="500" height="500">
          ${chosen ? `<span class="bmk__card-check">✓ ${p.variants.length > 1 ? esc(chosen.variant.title) : "No kit"}</span>` : ""}
        </span>
        <span class="bmk__card-body">
          <span class="bmk__card-title">${esc(p.title)}</span>
          <span class="bmk__card-price">${money(minPrice(p))}</span>
          ${chosen
            ? `<button type="button" class="bmk__link" data-bmk-up-remove="${p.id}">Remover</button>`
            : `<span class="bmk__card-add">+ Adicionar</span>`}
        </span>
      </div>`;
    }

    /* ---------- etapa 4: resumo ---------- */
    renderSummary() {
      const s = this.state;
      if (!s.masc || !s.fem) return;
      const line = (item, label, step, fit = "contain") => `
        <div class="bmk__line">
          <img class="is-${fit}" src="${esc(sized(item.product.image, 240))}" alt="" width="72" height="90">
          <div class="bmk__line-info">
            <small>${esc(label)}</small>
            <strong>${esc(item.product.title)}</strong>
            <span>${optText(item.product, item.variant)}</span>
          </div>
          <div class="bmk__line-end">
            <span>${money(item.variant.price)}</span>
            ${step ? `<button type="button" class="bmk__link" data-bmk-edit="${step}">Trocar</button>` : ""}
          </div>
        </div>`;
      let html = line(s.masc, this.t.lineMasc, 1, "cover") + line(s.fem, this.t.lineFem, 2, "cover");
      s.upsell.forEach((u) => (html += line(u, "Extra", this.hasUpsell ? 3 : 0)));
      const { full, pay, off } = this.totals();
      html += `<div class="bmk__totals">
        <div><span>Valor avulso</span><s>${money(full)}</s></div>
        ${off ? `<div class="is-save"><span>${esc(this.t.saved)}</span><strong>${money(off)}</strong></div>` : ""}
        <div class="is-total"><span>Total</span><strong>${money(pay)}</strong></div>
      </div>`;
      this.$("[data-bmk-summary]").innerHTML = html;
    }

    /* ---------- gaveta de tamanho ---------- */
    openSheet(kind, product) {
      if (!product) return;
      this.sheet = { kind, product, variant: null };
      const sheet = this.$("[data-bmk-sheet]");
      const current = kind === "masc" ? this.state.masc : kind === "fem" ? this.state.fem : this.state.upsell.get(product.id);
      if (current && current.product.id === product.id) this.sheet.variant = current.variant;
      const only = product.variants.length === 1 && product.variants[0].available ? product.variants[0] : null;
      if (only) this.sheet.variant = only;
      this.sheet.sel = this.sheet.variant ? [...(this.sheet.variant.options || [])] : [];
      // opção com valor único já vem marcada; cor começa na 1ª cor disponível
      (product.options || []).forEach((name, i) => {
        if (this.sheet.sel[i] != null) return;
        const vals = [...new Set(product.variants.map((v) => v.options?.[i]))];
        if (vals.length === 1) this.sheet.sel[i] = vals[0];
        else if (isColor(name)) this.sheet.sel[i] = (product.variants.find((v) => v.available) || product.variants[0]).options[i];
      });

      const isShirtSheet = kind === "masc" || kind === "fem";
      this.$("[data-bmk-sheet-media]").classList.toggle("is-contain", !isShirtSheet);
      this.$("[data-bmk-sheet-media]").innerHTML = `<button type="button" class="bmk__sheet-zoom" data-bmk-zoom aria-label="Ver fotos de ${esc(product.title)}">
        <img src="${esc(sized(this.colorImage() || product.image, 700))}" alt="${esc(product.title)}" data-bmk-sheet-img>
        <span class="bmk__sheet-expand" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></span>
      </button>`;
      this.$("[data-bmk-sheet-title]").textContent = product.title;
      this.$("[data-bmk-sheet-label]").textContent = "";
      this.renderOptions();
      this.paintSheet();
      sheet.hidden = false;
      document.documentElement.classList.add("bmk-lock");
      requestAnimationFrame(() => sheet.classList.add("is-open"));
      clarity("abrir_" + kind);
    }
    paintSheet() {
      const { kind, product, variant } = this.sheet;
      const v = variant || product.variants.find((x) => x.available) || product.variants[0];
      let price = `<b>${money(v.price)}</b>`;
      if (kind === "fem" && this.state.masc) {
        const kit = Math.max(0, this.state.masc.variant.price + v.price - this.cfg.discount);
        price = `<span class="bmk__sheet-kit">${esc(this.t.kitPrice)} <b>${money(kit)}</b></span>`;
      }
      this.$("[data-bmk-sheet-price]").innerHTML = price;
      const btn = this.$("[data-bmk-sheet-confirm]");
      btn.disabled = !variant;
      btn.textContent = kind === "masc" ? this.t.confirmMasc : kind === "fem" ? this.t.confirmFem : this.t.confirmUpsell;
    }
    // Um grupo de botões por opção (Cor, Tamanho...). Um valor fica desativado se não tem variante
    // disponível com ele + o que já foi escolhido nas opções anteriores.
    renderOptions() {
      const { product, sel } = this.sheet;
      const names = product.options || [];
      const box = this.$("[data-bmk-sheet-sizes]");
      if (product.variants.length < 2) { box.innerHTML = ""; return; }
      if (!names.length || !product.variants[0].options?.length) {
        // sem dados de opção: lista as variantes
        box.innerHTML = `<div class="bmk__opt"><p class="bmk__opt-label">${esc(this.t.size)}</p><div class="bmk__sizes">${product.variants
          .map((v) => `<button type="button" class="bmk__size${this.sheet.variant?.id === v.id ? " is-active" : ""}" data-bmk-opt="-1" data-bmk-val="${v.id}" ${v.available ? "" : "disabled"}>${esc(v.title)}</button>`)
          .join("")}</div></div>`;
        return;
      }
      box.innerHTML = names
        .map((name, i) => {
          const vals = [...new Set(product.variants.map((v) => v.options[i]))];
          if (vals.length < 2) return "";
          const color = isColor(name);
          const label = color ? `${esc(name)}${sel[i] ? `: <b>${esc(sel[i])}</b>` : ""}` : i === names.length - 1 ? esc(this.t.size) : esc(name);
          const btns = vals
            .map((val) => {
              const ok = product.variants.some((v) => v.available && v.options[i] === val && sel.every((x, j) => j >= i || x == null || v.options[j] === x));
              return `<button type="button" class="bmk__size${sel[i] === val ? " is-active" : ""}" data-bmk-opt="${i}" data-bmk-val="${esc(val)}" ${ok ? "" : `disabled title="${esc(this.t.soldOut)}"`}>${esc(val)}</button>`;
            })
            .join("");
          return `<div class="bmk__opt${color ? " is-color" : ""}"><p class="bmk__opt-label">${label}</p><div class="bmk__sizes${color ? " bmk__sizes--color" : ""}">${btns}</div></div>`;
        })
        .join("");
    }
    pickOpt(i, val) {
      const sh = this.sheet;
      if (!sh) return;
      const { product } = sh;
      if (i === -1) {
        const v = product.variants.find((x) => x.id === +val);
        if (!v || !v.available) return;
        sh.variant = v;
        this.renderOptions();
        return this.paintSheet();
      }
      sh.sel[i] = val;
      const names = product.options;
      // limpa escolhas seguintes que ficaram impossíveis
      for (let j = i + 1; j < names.length; j++) {
        if (sh.sel[j] == null) continue;
        const ok = product.variants.some((v) => v.available && sh.sel.every((x, k) => k > j || x == null || v.options[k] === x));
        if (!ok) sh.sel[j] = undefined;
      }
      sh.variant = product.variants.find((v) => v.available && names.every((_, k) => v.options[k] === sh.sel[k])) || null;
      if (isColor(names[i])) {
        const img = this.$("[data-bmk-sheet-img]");
        const src = this.colorImage();
        if (img && src) img.src = sized(src, 700);
      }
      this.renderOptions();
      this.paintSheet();
    }
    // foto da cor escolhida (imagem da variante), se o produto tiver
    colorImage() {
      const sh = this.sheet;
      if (!sh) return null;
      const ci = (sh.product.options || []).findIndex(isColor);
      if (ci < 0 || sh.sel[ci] == null) return null;
      return sh.product.variants.find((v) => v.options?.[ci] === sh.sel[ci] && v.image)?.image || null;
    }
    closeSheet() {
      this.closeViewer();
      const sheet = this.$("[data-bmk-sheet]");
      if (sheet.hidden) return;
      sheet.classList.remove("is-open");
      document.documentElement.classList.remove("bmk-lock");
      setTimeout(() => (sheet.hidden = true), 200);
      this.sheet = null;
    }
    confirmSheet() {
      const sh = this.sheet;
      if (!sh?.variant) return;
      const item = { product: sh.product, variant: sh.variant };
      if (sh.kind === "masc") {
        const changed = this.state.masc?.product.id !== sh.product.id;
        this.state.masc = item;
        // trocou a camisa dele: o "Combina com a dele" volta a ser o 1º filtro dela
        clarity("dele_ok");
        this.closeSheet();
        return this.goto(this.state.fem ? this.steps[this.steps.length - 1] : 2);
      }
      if (sh.kind === "fem") {
        this.state.fem = item;
        clarity("dela_ok");
        this.closeSheet();
        return this.next();
      }
      this.state.upsell.set(sh.product.id, item);
      clarity("extra_ok");
      this.closeSheet();
      this.render();
    }

    /* ---------- galeria em tela cheia ---------- */
    openViewer(product) {
      if (!product) return;
      const pics = product.images && product.images.length ? product.images : [product.image].filter(Boolean);
      const v = this.$("[data-bmk-viewer]");
      const track = this.$("[data-bmk-viewer-track]");
      track.innerHTML = pics
        .map((src, i) => `<figure class="bmk__viewer-slide"><div class="bmk__viewer-frame">
          <img src="${esc(sized(src, 1400))}" alt="${esc(product.title)} - foto ${i + 1}"${i > 1 ? ' loading="lazy"' : ""}>
          <button type="button" class="bmk__viewer-close" data-bmk-viewer-close aria-label="Fechar">×</button>
          ${i > 0 ? `<button type="button" class="bmk__viewer-arrow is-prev" data-bmk-viewer-nav="-1" aria-label="Foto anterior"></button>` : ""}
          ${i < pics.length - 1 ? `<button type="button" class="bmk__viewer-arrow is-next" data-bmk-viewer-nav="1" aria-label="Próxima foto"></button>` : ""}
        </div></figure>`)
        .join("");
      v.classList.toggle("is-single", pics.length < 2);
      v.hidden = false;
      requestAnimationFrame(() => v.classList.add("is-open"));
      track.scrollLeft = 0;
      clarity("galeria_abrir");
    }
    navViewer(dir) {
      const track = this.$("[data-bmk-viewer-track]");
      track.scrollBy({ left: dir * track.clientWidth, behavior: "smooth" });
    }
    closeViewer() {
      const v = this.$("[data-bmk-viewer]");
      if (!v || v.hidden) return;
      v.classList.remove("is-open");
      setTimeout(() => (v.hidden = true), 200);
    }

    /* ---------- carrinho ---------- */
    async addToCart() {
      const s = this.state;
      if (!s.masc || !s.fem) return;
      const btn = this.$("[data-bmk-add]");
      const err = this.$("[data-bmk-error]");
      err.hidden = true;
      btn.disabled = true;
      btn.classList.add("is-loading");
      const kitId = "C" + Date.now().toString(36).toUpperCase();
      const items = [
        { id: s.masc.variant.id, quantity: 1, properties: { _kit: kitId } },
        { id: s.fem.variant.id, quantity: 1, properties: { _kit: kitId } },
      ];
      s.upsell.forEach((u) => items.push({ id: u.variant.id, quantity: 1, properties: { _kit_extra: kitId } }));
      try {
        const r = await fetch((window.routes?.cart_add_url || "/cart/add") + ".js", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ items }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.description || data.message || "erro");
        clarity("adicionado");
        await this.applyCode(this.cfg.code);
        await this.afterAdd();
      } catch (e) {
        console.error("[brk-kit-casal] add", e);
        err.textContent = (e && e.message && e.message !== "erro" ? e.message + " — " : "") + this.t.error;
        err.hidden = false;
      } finally {
        btn.disabled = false;
        btn.classList.remove("is-loading");
      }
    }
    // Cupom do kit — mantém os cupons que já estavam no carrinho. O app da Intelipost regrava as
    // linhas logo depois do add e, se cair junto com o update do cupom, o cupom some: confere e
    // reaplica (até 3 tentativas). Mesmo mecanismo do Monte seu Kit do Agro.
    async applyCode(code) {
      if (!code) return;
      const has = (cart) => (cart.discount_codes || []).some((d) => (d.code || "").toUpperCase() === code.toUpperCase());
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const cart = await fetch("/cart.js").then((r) => r.json());
          if (has(cart) && attempt > 0) return;
          if (!has(cart)) {
            const codes = (cart.discount_codes || []).map((d) => d.code).filter(Boolean);
            await fetch("/cart/update.js", {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({ discount: [...codes, code].join(",") }),
            });
          }
          await new Promise((r) => setTimeout(r, 1200));
        }
      } catch (e) {
        console.error("[brk-kit-casal] cupom", e);
      }
    }
    // Minicart do Glozin 2.5.0 (mesmo caminho do brk-upsell / custom-name-modal da Motors)
    async afterAdd() {
      const mode = this.cfg.afterAdd;
      if (mode === "checkout") return void (window.location.href = "/checkout");
      if (mode === "cart") return void (window.location.href = window.routes?.cart_url || "/cart");
      const cn = document.querySelector("cart-notification");
      try {
        if (!cn) throw new Error("sem minicart");
        if (typeof cn.brkRefreshMinicart === "function") {
          await cn.brkRefreshMinicart();
        } else {
          const [sections, cart] = await Promise.all([
            fetch(`${window.location.pathname}?sections=minicart-form`).then((r) => r.json()),
            fetch("/cart.js").then((r) => r.json()),
          ]);
          const form = document.getElementById("minicart-form");
          const fresh = new DOMParser().parseFromString(sections["minicart-form"] || "", "text/html").querySelector("#minicart-form");
          if (!form || !fresh) throw new Error("minicart-form não encontrado");
          form.innerHTML = fresh.innerHTML;
          document.querySelectorAll(".cart-count").forEach((el) => {
            el.innerHTML = el.classList.contains("cart-count-drawer") ? `(${cart.item_count})` : cart.item_count > 100 ? "~" : cart.item_count;
          });
          const htp = document.querySelector("header-total-price");
          if (htp && typeof htp.updateTotal === "function") htp.updateTotal(cart);
          if (typeof cn.cartAction === "function") cn.cartAction();
        }
        if (typeof cn.open === "function") cn.open();
        else throw new Error("minicart sem open()");
      } catch (e) {
        window.location.href = window.routes?.cart_url || "/cart";
      }
    }
  }

  customElements.define("brk-kit-casal", BrkKitCasal);
})();
