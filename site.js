/* Position and wayfinding. The pages work without it: the contents are plain
   links (a :target sheet on narrow screens), the folds are plain <details>.
   This adds where-you-are tracking, the contents as a sheet, a find box with
   a match mode, previous and next, keys, folds open on wide screens, and
   keeps the page still when a fold opens or closes. Every jump is an anchor
   navigation, so the browser's Back returns to where the reader was. */
(function () {
  var doc = document, root = doc.documentElement;
  var main = doc.querySelector("main");
  var bar = doc.getElementById("pinbar");
  if (!main || !bar) return;
  root.classList.add("js");

  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  var all = function (sel, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(sel)); };
  var wide = window.matchMedia("(min-width: 1100px)");
  var where = bar.querySelector(".pin-where");
  var fill = bar.querySelector(".pin-fill");
  var line = bar.querySelector(".pin-line");
  var nav = doc.getElementById("contents");
  var list = nav && nav.querySelector(".contents-list");
  var opener = bar.querySelector(".pin-contents");
  var openall = doc.getElementById("openall");
  var heads = all("h2, h3", main);
  var tops = [], ticks = [], current = -1, ticking = false, hovering = false;

  function label(h) {
    var c = h.cloneNode(true);
    each(c.querySelectorAll(".prov"), function (p) { p.remove(); });
    return c.textContent.replace(/\s+/g, " ").trim();
  }
  var labels = heads.map(label);

  // the entries, in order, as the contents list names them
  var entries = nav ? all("li.c3 > a", nav).map(function (a) {
    var id = a.getAttribute("href").slice(1);
    return { id: id, el: doc.getElementById(id), row: a.parentNode, link: a,
      num: a.querySelector(".row-num").textContent, title: a.querySelector(".row-title").textContent };
  }) : [];

  // every row of the contents, sections too, in the page's order: what find searches and steps through
  var rows = list ? all('a[href^="#"]', list).map(function (a) {
    var id = a.getAttribute("href").slice(1), num = a.querySelector(".row-num"), title = a.querySelector(".row-title");
    return { id: id, a: a, el: a.parentNode, head: doc.getElementById(id), num: num ? num.textContent : "",
      title: (title || a).textContent.trim(), words: null, marks: [] };
  }).filter(function (r) { return r.head; }) : [];
  rows.sort(function (a, b) { return a.head.compareDocumentPosition(b.head) & 4 ? -1 : 1; });
  var rowById = {};
  rows.forEach(function (r, k) { r.order = k; rowById[r.id] = r; });

  function go(id) {
    if (location.hash === "#" + id) { var t = doc.getElementById(id); if (t) t.scrollIntoView(); }
    else location.hash = id;
  }

  /* ---- the folds: open on wide screens, where the contents column gives the overview ---- */
  var folds = all("details.more");
  var foldsBtn = nav && nav.querySelector(".go-folds");
  function setFolds(open) {
    folds.forEach(function (d) { d.open = open; });
    if (openall) { openall.dataset.open = open ? "1" : "0"; openall.textContent = open ? "Close every entry" : "Open every entry"; }
    if (foldsBtn) foldsBtn.textContent = open ? "Close every entry" : "Open every entry";
  }
  if (folds.length) {
    if (wide.matches) {
      setFolds(true);
      if (location.hash) { var t0 = doc.getElementById(location.hash.slice(1)); if (t0) t0.scrollIntoView(); }
    } else if (foldsBtn) foldsBtn.textContent = "Open every entry";
  }

  /* ---- where the reader is ---- */
  // a heading counts as reached once it is within 80px under the bar (an #link lands it at 16 to 64px)
  function offset() { return bar.getBoundingClientRect().height + 80; }

  function measure() {
    var y = window.scrollY;
    tops = heads.map(function (h) { return h.getBoundingClientRect().top + y; });
    entries.forEach(function (e) { e.top = e.el.getBoundingClientRect().top + y; });
    rows.forEach(function (r) { r.top = r.head.getBoundingClientRect().top + y; });
    var span = Math.max(1, root.scrollHeight - window.innerHeight);
    if (line) {
      ticks.forEach(function (t) { t.remove(); });
      ticks = [];
      heads.forEach(function (h, i) {
        if (h.tagName !== "H2") return;
        var t = doc.createElement("span");
        t.className = "pin-tick";
        t.style.left = Math.min(99.5, Math.max(0.5, 100 * (tops[i] - offset()) / span)) + "%";
        line.appendChild(t);
        ticks.push(t);
      });
    }
    current = -2;
    shown = null;
    update();
  }

  function entryIndex() {
    var y = window.scrollY + offset(), ci = -1;
    for (var k = 0; k < entries.length; k++) { if (entries[k].top <= y + 1) ci = k; else break; }
    return ci;
  }

  /* ---- previous and next: entries, or while find holds a query, its matches ---- */
  var steppers = all(".pin-prev, .pin-next, .go-prev, .go-next");
  var hunt = null; // while the find box holds a query: { hits, terms, cursor, cursorY, opened }
  function setStep(a, e, word) {
    if (e) { a.setAttribute("href", "#" + e.id); a.setAttribute("aria-label", word + ": " + (e.num ? e.num + " " : "") + e.title); a.removeAttribute("aria-disabled"); }
    else { a.removeAttribute("href"); a.setAttribute("aria-label", word + ": none"); a.setAttribute("aria-disabled", "true"); }
  }
  // where the reader is among the matches: the one landed on while the reader is still in it (its heading
  // above the reading line, the next row's not yet reached), else the row whose heading was last reached
  function huntAt() {
    var y = window.scrollY + offset(), c = hunt.cursor >= 0 ? hunt.hits[hunt.cursor] : null;
    if (c) {
      var after = rows[c.order + 1];
      if (Math.abs(window.scrollY - hunt.cursorY) < 24 ||
        (c.top <= window.scrollY + window.innerHeight * 0.4 && (!after || after.top > y))) return { at: hunt.cursor, before: hunt.cursor };
    }
    var cur = null, at = -1, before = -1;
    for (var k = 0; k < rows.length; k++) { if (rows[k].top <= y + 1) cur = rows[k]; else break; }
    if (cur) hunt.hits.forEach(function (r, j) { if (r === cur) at = j; else if (r.order < cur.order) before = j; });
    return { at: at, before: before };
  }
  function steps() {
    if (hunt) {
      var h = huntAt(), n = hunt.hits.length;
      var prevK = h.at >= 0 ? h.at - 1 : h.before, nextK = h.at >= 0 ? h.at + 1 : h.before + 1;
      var pk = prevK >= 0 ? prevK : -1, nk = nextK < n ? nextK : -1;
      steppers.forEach(function (a) {
        var prev = /prev/.test(a.className);
        setStep(a, hunt.hits[prev ? pk : nk] || null, prev ? "Previous match" : "Next match");
        if (/^go-/.test(a.className)) a.textContent = prev ? "← Match" : "Match →";
      });
      return { prev: pk, next: nk, at: h.at };
    }
    if (!entries.length) return;
    var ci = entryIndex();
    var prev = ci > 0 ? entries[ci - 1] : null;
    var next = ci < entries.length - 1 ? entries[ci + 1] : null;
    steppers.forEach(function (a) {
      var isPrev = /prev/.test(a.className);
      setStep(a, isPrev ? prev : next, isPrev ? "Previous entry" : "Next entry");
      if (/^go-/.test(a.className)) a.textContent = isPrev ? "← Previous" : "Next →";
    });
    return { prev: prev, next: next };
  }

  // the bar names where the reader is; when the title will not fit, the number alone, never half a title
  var shown = null;
  function setWhere(text, short) {
    if (!where || text === shown) return;
    shown = text;
    where.textContent = text;
    for (var k = 0; k < short.length && where.scrollWidth > where.clientWidth + 1; k++) where.textContent = short[k];
  }
  function numberOf(text) { var m = /^(\d+(?:\.\d+)*)\.?\s/.exec(text || ""); return m ? m[1] : ""; }

  function update() {
    ticking = false;
    var y = window.scrollY + offset();
    var i = -1;
    for (var k = 0; k < tops.length; k++) { if (tops[k] <= y + 1) i = k; else break; }
    var span = Math.max(1, root.scrollHeight - window.innerHeight);
    // at the very end the last heading on screen is where the reader is, even if it cannot reach the top
    if (window.scrollY >= span - 2) for (k = tops.length - 1; k > i; k--) { if (tops[k] < window.scrollY + window.innerHeight - 80) { i = k; break; } }
    if (fill) fill.style.transform = "scaleX(" + Math.min(1, window.scrollY / span) + ")";
    bar.classList.toggle("is-down", window.scrollY > window.innerHeight * 0.6);
    var s = steps();
    var here = i >= 0 ? labels[i] : (where ? where.getAttribute("data-start") : "");
    if (hunt) {
      var n = hunt.hits.length;
      var tally = !n ? "Nothing found" : s.at >= 0 ? (s.at + 1) + " of " + n : n + " found";
      // under the find box, how many until the reader steps through them; then where they are among them
      if (count) count.textContent = hunt.cursor < 0 && n ? n + " found" : tally;
      var r = s.at >= 0 ? hunt.hits[s.at] : null;
      var name = r ? (r.num ? r.num + " " + r.title : r.title) : here;
      var num = r ? r.num : numberOf(here);
      setWhere(tally + " · " + name, num ? [tally + " · " + num, tally] : [tally]);
    } else setWhere(here, numberOf(here) ? [numberOf(here)] : []);
    if (i === current) return;
    current = i;
    if (nav) mark(i);
  }

  /* ---- the contents: the current row marked, its day open, kept in view without jerking ---- */
  var days = nav ? all("details.day", nav) : [];
  var searching = false;
  function keepInView(a, centre) {
    if (!list || !a || hovering || searching) return;
    var r = a.getBoundingClientRect(), n = list.getBoundingClientRect();
    if (!n.height) return;
    if (centre) { list.scrollTop += r.top - n.top - list.clientHeight / 3; return; }
    if (r.top < n.top + 8) list.scrollTop -= n.top + 8 - r.top;
    else if (r.bottom > n.bottom - 8) list.scrollTop += r.bottom - (n.bottom - 8);
  }
  function openDay(det) {
    if (!det || det.open) return;
    var cur = nav.querySelector('[aria-current="location"]');
    var before = cur ? cur.getBoundingClientRect().top : 0;
    det.open = true; det.dataset.auto = "1";
    days.forEach(function (d) { if (d !== det && d.dataset.auto && !d.dataset.user) { d.open = false; delete d.dataset.auto; } });
    if (cur && list) list.scrollTop += cur.getBoundingClientRect().top - before;
  }
  function mark(i) {
    var id = "";
    for (var j = i; j >= 0; j--) {
      if (heads[j].id && nav.querySelector('a[href="#' + heads[j].id + '"]')) { id = heads[j].id; break; }
    }
    var found = null;
    all('a[href^="#"]', list).forEach(function (a) {
      if (a.getAttribute("href") === "#" + id) { a.setAttribute("aria-current", "location"); found = a; }
      else a.removeAttribute("aria-current");
    });
    if (found && !searching) {
      var det = found.closest("details.day");
      if (det) openDay(det);
      keepInView(found, false);
    }
  }
  if (nav) {
    // without script every day is open; with it, only the reader's day, the others a click away
    days.forEach(function (d, k) { if (k > 0) d.open = false; else d.dataset.auto = "1"; });
    days.forEach(function (d) {
      d.querySelector("summary").addEventListener("click", function () { d.dataset.user = "1"; delete d.dataset.auto; });
    });
    nav.addEventListener("pointerenter", function () { hovering = true; });
    nav.addEventListener("pointerleave", function () { hovering = false; });
  }

  if (where) where.setAttribute("data-start", where.textContent);
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener("resize", measure);
  main.addEventListener("toggle", function () { requestAnimationFrame(measure); }, true);
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(measure);
  window.addEventListener("load", measure);
  measure();

  /* ---- a fold opening or closing never moves what the reader is looking at ---- */
  function steady(anchor, change) {
    var before = anchor ? anchor.getBoundingClientRect().top : 0;
    change();
    requestAnimationFrame(function () {
      if (anchor) { var shift = anchor.getBoundingClientRect().top - before; if (Math.abs(shift) > 0.5) window.scrollBy(0, shift); }
      measure();
    });
  }
  doc.addEventListener("click", function (e) {
    var c = e.target.closest("details.more > summary, #openall");
    if (!c) return;
    var before = c.getBoundingClientRect().top;
    requestAnimationFrame(function () {
      var shift = c.getBoundingClientRect().top - before;
      if (Math.abs(shift) > 0.5) window.scrollBy(0, shift);
      if (foldsBtn && openall) foldsBtn.textContent = openall.textContent;
      measure();
    });
  }, true);
  if (foldsBtn) foldsBtn.addEventListener("click", function () {
    // the heading the reader is in stays where it is on the screen
    var anchor = current >= 0 ? heads[current] : null;
    var open = !(openall ? openall.dataset.open === "1" : folds.length && folds[0].open);
    steady(anchor, function () { setFolds(open); });
  });

  /* ---- the contents as a sheet (narrow) or a slide-in (medium) ---- */
  function isOpen() { return nav && nav.classList.contains("open"); }
  function openSheet() {
    nav.classList.add("open");
    root.classList.add("sheet-open");
    if (opener) opener.setAttribute("aria-expanded", "true");
    var cur = nav.querySelector('[aria-current="location"]');
    if (cur) keepInView(cur, true); else if (list) list.scrollTop = 0;
  }
  function shut(back) {
    nav.classList.remove("open");
    root.classList.remove("sheet-open");
    if (opener) { opener.setAttribute("aria-expanded", "false"); if (back) opener.focus(); }
  }
  if (nav && opener) {
    opener.setAttribute("aria-expanded", "false");
    opener.setAttribute("role", "button");
    opener.addEventListener("click", function (e) {
      if (wide.matches) return;
      e.preventDefault();
      if (isOpen()) shut(true); else { openSheet(); var c = nav.querySelector(".contents-close"); if (c) c.focus(); }
    });
    nav.querySelector(".contents-close").addEventListener("click", function (e) { e.preventDefault(); shut(true); });
    nav.addEventListener("click", function (e) {
      if (e.target.closest('a[href^="#"]:not(.contents-close)') && isOpen()) shut(false);
    });
    doc.addEventListener("click", function (e) {
      if (isOpen() && !nav.contains(e.target) && !opener.contains(e.target)) shut(false);
    });
  }

  /* ---- find: the record's own words, from <main> only ---- */
  // A row's words run from its heading to the next row's heading or the next h2. The page's scripts,
  // the charts' labels and the entries' margins (Previous, Next, Link) are not the record's words.
  function walkText(visit) {
    var row = null;
    (function walk(el) {
      for (var n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) { if (row && n.nodeValue.trim()) visit(n, row); continue; }
        if (n.nodeType !== 1 || n.namespaceURI !== "http://www.w3.org/1999/xhtml") continue;
        if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(n.tagName) || n.matches("aside.meta")) continue;
        if (/^H[23]$/.test(n.tagName)) { var r = n.id && rowById[n.id]; if (r) row = r; else if (n.tagName === "H2") row = null; }
        walk(n);
      }
    })(main);
  }
  var WORD = /[\p{L}\p{N}]+(?:[.,'’\/\-][\p{L}\p{N}]+)*/gu, PART = /[\p{L}\p{N}]+/gu;
  // a plural finds its singular and a verb its stem: "downshifts" finds "downshift", "braking" finds "brake"
  function stem(w) {
    w = w.replace(/['’]s$/, "");
    if (w.length < 4 || /^\d/.test(w)) return w;
    if (/ies$/.test(w)) return w.slice(0, -3) + "y";
    if (/(ss|us|is)$/.test(w)) return w;
    if (/(ch|sh|x|z)es$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w)) return w.slice(0, -1);
    if (/ing$/.test(w) && w.length > 5) return w.slice(0, -3);
    if (/[^e]ed$/.test(w) && w.length > 4) return w.slice(0, -2);
    return w;
  }
  function grams(tok, add) {
    tok = tok.toLowerCase(); add(tok); add(stem(tok));
    var m; PART.lastIndex = 0;
    if (/[.,'’\/\-]/.test(tok)) while ((m = PART.exec(tok))) { add(m[0]); add(stem(m[0])); }
  }
  function index() {
    rows.forEach(function (r) { r.words = Object.create(null); });
    walkText(function (n, r) {
      var m; WORD.lastIndex = 0;
      while ((m = WORD.exec(n.nodeValue))) grams(m[0], function (g) { r.words[g] = 1; });
    });
    rows.forEach(function (r) { r.list = Object.keys(r.words); });
  }
  function hasTerm(r, t) { for (var k = 0; k < r.list.length; k++) if (r.list[k].indexOf(t) === 0) return true; return false; }
  function tokHit(tok, terms) {
    tok = tok.toLowerCase(); var s = stem(tok);
    return terms.some(function (t) { return tok.indexOf(t) === 0 || s.indexOf(t) === 0; });
  }

  function unmark() {
    var parents = [];
    each(main.querySelectorAll("mark.hit"), function (m) {
      var p = m.parentNode; p.replaceChild(doc.createTextNode(m.textContent), m);
      if (parents.indexOf(p) < 0) parents.push(p);
    });
    parents.forEach(function (p) { p.normalize(); });
    rows.forEach(function (r) { r.marks = []; });
  }
  function markHits(hitRows, terms) {
    var on = {}, todo = [];
    hitRows.forEach(function (r) { on[r.id] = 1; });
    walkText(function (n, r) { if (on[r.id]) todo.push([n, r]); });
    todo.forEach(function (x) {
      var n = x[0], r = x[1], text = n.nodeValue, spans = [], m, p;
      WORD.lastIndex = 0;
      while ((m = WORD.exec(text))) {
        if (tokHit(m[0], terms)) { spans.push([m.index, m.index + m[0].length]); continue; }
        PART.lastIndex = 0;
        if (/[.,'’\/\-]/.test(m[0])) while ((p = PART.exec(m[0]))) if (tokHit(p[0], terms)) spans.push([m.index + p.index, m.index + p.index + p[0].length]);
      }
      if (!spans.length) return;
      var frag = doc.createDocumentFragment(), last = 0;
      spans.forEach(function (s) {
        if (s[0] > last) frag.appendChild(doc.createTextNode(text.slice(last, s[0])));
        var mk = doc.createElement("mark"); mk.className = "hit"; mk.textContent = text.slice(s[0], s[1]);
        frag.appendChild(mk); r.marks.push(mk); last = s[1];
      });
      if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
  }

  // the folds that hold a match open, and those find opened close again when the query moves on
  function setHunt(hitRows, terms) {
    var anchor = current >= 0 ? heads[current] : null;
    var opened = hunt ? hunt.opened : [];
    unmark();
    if (terms.length) markHits(hitRows, terms);
    var need = [];
    hitRows.forEach(function (r) { r.marks.forEach(function (mk) {
      var d = mk.closest("details.more"); if (d && need.indexOf(d) < 0) need.push(d);
    }); });
    var keep = [];
    steady(anchor, function () {
      opened.forEach(function (d) { if (need.indexOf(d) < 0) d.open = false; else keep.push(d); });
      need.forEach(function (d) { if (!d.open) { d.open = true; keep.push(d); } });
    });
    hunt = { hits: hitRows, terms: terms, cursor: -1, cursorY: 0, opened: keep };
    shown = null; update();
  }
  function endHunt() {
    if (!hunt) return;
    var anchor = current >= 0 ? heads[current] : null, opened = hunt.opened;
    unmark();
    hunt = null;
    steady(anchor, function () { opened.forEach(function (d) { d.open = false; }); });
    if (count) count.textContent = "";
    shown = null; update();
  }
  function land(k) {
    var r = hunt && hunt.hits[k];
    if (!r) return;
    if (isOpen()) shut(false);
    go(r.id);
    each(main.querySelectorAll("mark.hit-now"), function (m) { m.classList.remove("hit-now"); });
    var mk = r.marks[0];
    if (mk) {
      mk.classList.add("hit-now");
      var b = mk.getBoundingClientRect(), top = bar.getBoundingClientRect().bottom;
      if (b.top < top + 8 || b.bottom > window.innerHeight - 16) window.scrollBy(0, b.top - window.innerHeight * 0.4);
    }
    measure();
    hunt.cursor = k; hunt.cursorY = window.scrollY;
    shown = null; update();
  }

  var find = nav && nav.querySelector("#find");
  var count = nav && nav.querySelector("#find-count");
  if (find && rows.length) {
    index();
    var dayState = null;
    var run = function () {
      var q = find.value.trim().toLowerCase();
      if (!q) {
        searching = false;
        rows.forEach(function (r) { r.el.hidden = false; });
        days.forEach(function (d) { d.hidden = false; });
        if (dayState) { days.forEach(function (d, k) { d.open = dayState[k]; }); dayState = null; }
        nav.classList.remove("is-finding");
        endHunt();
        mark(current);
        return;
      }
      if (!searching) { dayState = days.map(function (d) { return d.open; }); searching = true; }
      nav.classList.add("is-finding");
      var byNumber = /^\d+\.\d*$/.test(q) && rows.some(function (r) { return r.num && r.num.indexOf(q) === 0; });
      var terms = byNumber ? [] : q.split(/\s+/).map(function (t) {
        return stem(t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""));
      }).filter(Boolean);
      var hits = rows.filter(function (r) {
        return byNumber ? (r.num === q || r.num.indexOf(q) === 0)
          : terms.length && terms.every(function (t) { return hasTerm(r, t); });
      });
      rows.forEach(function (r) { r.el.hidden = hits.indexOf(r) < 0; });
      days.forEach(function (d) {
        var any = all("li.c3", d).some(function (li) { return !li.hidden; });
        d.hidden = !any;
        if (any) d.open = true;
      });
      // one letter would mark half the page: it filters, and marks nothing
      setHunt(hits, terms.filter(function (t) { return t.length > 1 || /\d/.test(t); }));
      list.scrollTop = 0;
    };
    find.addEventListener("input", run);
    find.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (hunt && hunt.hits.length) { var s = steps(); find.blur(); land(s.at >= 0 ? s.at : Math.max(0, s.next)); }
      } else if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        if (find.value) { find.value = ""; run(); }
        else { find.blur(); if (isOpen()) shut(true); }
      }
    });
    // while there is a query, a row in the contents lands on its match, the term shown
    list.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a || !hunt) return;
      for (var k = 0; k < hunt.hits.length; k++) if (hunt.hits[k].a === a) { e.preventDefault(); land(k); return; }
    });
  }
  steppers.forEach(function (a) {
    a.addEventListener("click", function (e) {
      if (!hunt) return;
      e.preventDefault();
      var s = steps(), k = /prev/.test(a.className) ? s.prev : s.next;
      if (k >= 0) land(k);
    });
  });

  /* ---- keys: j and k next and previous entry (or match), t the top, / find, Esc closes ---- */
  doc.addEventListener("keydown", function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === "Escape" && isOpen()) { shut(true); return; }
    if (e.key === "/" && find) {
      e.preventDefault();
      if (!wide.matches && !isOpen()) openSheet();
      find.focus(); find.select();
      return;
    }
    if (e.key === "t") { go("top"); return; }
    if ((e.key === "j" || e.key === "k") && (hunt || entries.length)) {
      measure();
      var s = steps();
      if (hunt) { var k = e.key === "j" ? s.next : s.prev; if (k >= 0) land(k); return; }
      var target = e.key === "j" ? s.next : s.prev;
      if (target) go(target.id);
    }
  });

  /* ---- an entry's link copies its address; without a clipboard it is an ordinary link ---- */
  doc.addEventListener("click", function (e) {
    var a = e.target.closest("a.copy");
    if (!a || !navigator.clipboard) return;
    e.preventDefault();
    var url = location.href.split("#")[0] + a.getAttribute("href");
    navigator.clipboard.writeText(url).then(function () {
      var was = a.textContent;
      a.textContent = "Copied";
      setTimeout(function () { a.textContent = was; }, 1600);
    }, function () { location.hash = a.getAttribute("href"); });
  });
  each(doc.querySelectorAll("a.copy"), function (a) {
    if (navigator.clipboard) { a.textContent = "Copy link"; a.setAttribute("aria-label", a.getAttribute("aria-label").replace("Link to", "Copy the link to")); }
  });
})();
