// Dokumento peržiūra A4 lapais: turinys išdėliojamas į 210x297 mm lapus su paraštėmis ir puslapių numeriais.
// Veikia bet kuriam DAS HTML (ir senoms versijoms). Spausdinant / į PDF - lapai lygiai tokie patys.
// section.page - naujo lapo pradžia (įsakymas, sistema, priedai, supažindinimo lapas).
// .keep - pastraipa keliauja kartu su po jos einančiu bloku (pvz. paskutinis punktas su parašais).

const SCRIPT = String.raw`(function () {
  var css = document.createElement("style");
  css.textContent =
    "html,body{background:#F2F4F7!important;margin:0!important;padding:0!important;max-width:none!important}" +
    ".pg-wrap{padding:24px 0 32px;display:flex;flex-direction:column;align-items:center;gap:20px}" +
    ".pg{width:210mm;height:297mm;background:#fff;box-sizing:border-box;padding:20mm 20mm 20mm 20mm;position:relative;overflow:hidden;" +
    "box-shadow:0 1px 2px rgba(16,24,40,.06),0 6px 20px rgba(16,24,40,.08);border-radius:2px}" +
    ".pg-body{height:100%;overflow:hidden}" +
    ".pg-body>:first-child{margin-top:0}" +
    ".pg-no{position:absolute;left:0;right:0;bottom:9mm;text-align:center;font:9pt 'Times New Roman',serif;color:#667085}" +
    "@media print{@page{size:A4;margin:0}html,body{background:#fff!important;zoom:1!important}" +
    ".pg-wrap{display:block;padding:0}.pg{box-shadow:none;border-radius:0;break-after:page}.pg:last-child{break-after:auto}}";
  document.head.appendChild(css);

  var arr = function (x) { return Array.prototype.slice.call(x); };
  var secs = arr(document.querySelectorAll("section.page"));
  var flows = secs.length ? secs.map(function (s) { return arr(s.childNodes); }) : [arr(document.body.childNodes)];
  var wrap = document.createElement("div");
  wrap.className = "pg-wrap";
  document.body.innerHTML = "";
  document.body.appendChild(wrap);
  var pages = [];
  var page = function () {
    var p = document.createElement("div"); p.className = "pg";
    var b = document.createElement("div"); b.className = "pg-body";
    p.appendChild(b); wrap.appendChild(p); pages.push(p);
    return b;
  };
  var over = function (b) { return b.scrollHeight > b.clientHeight + 1; };
  var isHead = function (n) { return n && /^(H1|H2|H3)$/.test(n.nodeName); };

  // perkelti mazgą į naują lapą; antraštė ar įvadinė eilutė („...:“) keliauja kartu
  var moveToNew = function (b, n) {
    b.removeChild(n);
    var carry = [];
    while (b.lastElementChild && (isHead(b.lastElementChild) || /:\s*$/.test(b.lastElementChild.textContent || "")
           || (b.lastElementChild.classList && b.lastElementChild.classList.contains("keep")))
           && b.childElementCount > 1 && carry.length < 2) {
      carry.unshift(b.removeChild(b.lastElementChild));
    }
    var nb = page();
    carry.forEach(function (c) { nb.appendChild(c); });
    nb.appendChild(n);
    return nb;
  };

  var splitTable = function (b, t) {
    var rows = arr(t.rows);
    var head = rows[0];
    var body = rows.slice(1);
    if (body.length <= 4) {                             // nedidelė lentelė neskaidoma - visa į kitą lapą
      return b.childNodes.length > 1 ? moveToNew(b, t) : b;
    }
    body.forEach(function (r) { r.parentNode.removeChild(r); });
    var tb = head.parentNode;
    var i = 0;
    for (; i < body.length; i++) { tb.appendChild(body[i]); if (over(b)) { tb.removeChild(body[i]); break; } }
    if (i < body.length && body.length - i === 1 && i > 1) { i -= 1; tb.removeChild(body[i]); }   // ne viena eilutė kitame lape
    if (i === 0 && b.childNodes.length > 1) {          // netilpo nė viena eilutė - visa lentelė į kitą lapą
      b = moveToNew(b, t);
      for (; i < body.length; i++) { tb.appendChild(body[i]); if (over(b) && i > 0) { tb.removeChild(body[i]); break; } }
    }
    while (i < body.length) {
      b = page();
      var t2 = t.cloneNode(false);
      var tb2 = document.createElement("tbody");
      tb2.appendChild(head.cloneNode(true));
      t2.appendChild(tb2);
      b.appendChild(t2);
      var start = i;
      for (; i < body.length; i++) {
        tb2.appendChild(body[i]);
        if (over(b) && i > start) { tb2.removeChild(body[i]); break; }
      }
    }
    return b;
  };

  flows.forEach(function (nodes) {
    var b = page();
    nodes.forEach(function (n) {
      if (n.nodeType === 3 && !n.textContent.trim()) return;
      if (n.nodeName === "SCRIPT" || n.nodeName === "STYLE") return;
      b.appendChild(n);
      if (!over(b)) return;
      if (n.nodeName === "TABLE" && n.rows.length > 2) { b = splitTable(b, n); return; }
      if (b.childNodes.length > 1) b = moveToNew(b, n);
    });
  });
  pages.forEach(function (p, i) {
    var no = document.createElement("div"); no.className = "pg-no";
    no.textContent = (i + 1) + " / " + pages.length;
    p.appendChild(no);
  });
  var fit = function () {
    var w = pages[0] ? pages[0].offsetWidth : 794;
    var z = Math.min(1, (window.innerWidth - 32) / w);
    document.body.style.zoom = z < 1 ? String(z) : "";
  };
  fit();
  window.addEventListener("resize", fit);
  window.__pages = pages.length;
})();`;

export function pagedHtml(html) {
  if (!html) return "";
  const tag = `<script>${SCRIPT}</script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tag}</body>`) : `${html}${tag}`;
}
