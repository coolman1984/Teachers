/* Hessa - bubble sheets (review G01, G02): the printed A4 answer sheet and the reader of its photo, in the browser only.
   One geometry in millimetres is shared by both, so what is printed is exactly what is read:
   four black corner squares, the student code as five columns of 0-9, up to 75 questions in three columns of 25.
   Reading: grey levels -> a threshold from the picture itself (Otsu) -> the four corner squares -> a perspective map (homography)
   from the sheet to the photo -> how dark each bubble is. Nothing is sent anywhere; unclear rows are flagged for a person. */
(function () {
  'use strict';
  var HS = window.HS;
  var O = HS.omr = {};

  /* ---------- the geometry (mm on an A4 page, 210 x 297) ---------- */
  var SQ = 8, CORNERS = [[16, 16], [194, 16], [16, 281], [194, 281]];   // centres of the corner squares (8 mm)
  var R = 2.6, CODE_DIGITS = 5, MAX_Q = 75, PER_COL = 25;
  O.MAX_Q = MAX_Q;
  O.LETTERS = { en: ['A', 'B', 'C', 'D', 'E'], ar: ['أ', 'ب', 'ج', 'د', 'هـ'] };
  O.code = function (c, d) { return [30 + c * 9, 74 + d * 7.5]; };                       // code column c, digit d
  O.bubble = function (q, k) { var col = Math.floor(q / PER_COL), row = q % PER_COL, x0 = 86 + col * 36; return [x0 + 9 + k * 6.5, 74 + row * 8]; };
  O.R = R;
  O.CORNERS = CORNERS;

  /* ---------- the printed sheet (SVG in millimetres: prints at the true size) ---------- */
  function t(x, y, s, size, anchor, weight) {
    return '<text x="' + x + '" y="' + y + '" font-size="' + (size || 3.2) + '" text-anchor="' + (anchor || 'middle') + '"' + (weight ? ' font-weight="' + weight + '"' : '') + '>' + HS.esc(s) + '</text>';
  }
  // exam: {id, title, date, questions, choices}; student: {name, code} or null for a blank sheet; marks: test only - {answers:[], code}
  O.sheet = function (exam, student, centre, lang, marks) {
    var n = Math.min(MAX_Q, Math.max(1, Number(exam.questions) || 0)), ch = Math.min(5, Math.max(2, Number(exam.choices) || 4));
    var L = O.LETTERS[lang === 'en' ? 'en' : 'ar'], out = [], code = String((student && student.code) || (marks && marks.code) || '');
    CORNERS.forEach(function (c) { out.push('<rect x="' + (c[0] - SQ / 2) + '" y="' + (c[1] - SQ / 2) + '" width="' + SQ + '" height="' + SQ + '" fill="#000"/>'); });
    out.push(t(105, 30, centre || '', 4.4, 'middle', 700), t(105, 37, exam.title || '', 5, 'middle', 700),
      t(105, 43, (exam.date || '') + (student ? '  ·  ' + student.name : ''), 3.6),
      t(22, 54, HS.t('omr.codeLabel'), 3, 'start', 700), t(86, 54, HS.t('omr.answersLabel'), 3, 'start', 700),
      '<line x1="86" y1="60" x2="190" y2="60" stroke="#000" stroke-width=".2"/>');
    for (var c = 0; c < CODE_DIGITS; c++) {
      var digit = code.length === CODE_DIGITS ? Number(code.charAt(c)) : -1;
      out.push('<rect x="' + (O.code(c, 0)[0] - 3.4) + '" y="61" width="6.8" height="6" fill="none" stroke="#000" stroke-width=".25"/>',
        t(O.code(c, 0)[0], 65.6, digit >= 0 ? String(digit) : '', 3.6, 'middle', 700));
      for (var d = 0; d < 10; d++) {
        var p = O.code(c, d), filled = digit === d;
        out.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + R + '" fill="' + (filled ? '#000' : 'none') + '" stroke="#000" stroke-width=".3"/>');
        if (c === 0) out.push(t(23, p[1] + 1.1, String(d), 3));
      }
    }
    for (var col = 0; col * PER_COL < n; col++) {
      for (var k = 0; k < ch; k++) out.push(t(O.bubble(col * PER_COL, k)[0], 69.5, L[k], 3, 'middle', 700));
    }
    for (var q = 0; q < n; q++) {
      var a = marks && marks.answers ? marks.answers[q] : null;
      out.push(t(O.bubble(q, 0)[0] - 6, O.bubble(q, 0)[1] + 1.1, String(q + 1), 3, 'end'));
      for (k = 0; k < ch; k++) {
        var b = O.bubble(q, k), on = a && (a === L[k] || a === O.LETTERS.en[k] || (Array.isArray(a) && a.indexOf(O.LETTERS.en[k]) >= 0));
        out.push('<circle cx="' + b[0] + '" cy="' + b[1] + '" r="' + R + '" fill="' + (on ? '#000' : 'none') + '" stroke="#000" stroke-width=".3"/>');
      }
    }
    out.push(t(105, 290, HS.t('omr.howTo'), 2.8));
    return '<svg class="omr-sheet" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" width="210mm" height="297mm" font-family="Arial, Tahoma, sans-serif" fill="#000" direction="ltr">' + out.join('') + '</svg>';
  };

  /* ---------- reading a photo ---------- */
  function solve(A, b) {   // Gaussian elimination with partial pivoting, n x n
    var n = b.length, i, j, k;
    for (i = 0; i < n; i++) {
      var p = i; for (j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[p][i])) p = j;
      var tmp = A[i]; A[i] = A[p]; A[p] = tmp; var tb = b[i]; b[i] = b[p]; b[p] = tb;
      for (j = i + 1; j < n; j++) { var f = A[j][i] / A[i][i]; for (k = i; k < n; k++) A[j][k] -= f * A[i][k]; b[j] -= f * b[i]; }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) { var s = b[i]; for (k = i + 1; k < n; k++) s -= A[i][k] * x[k]; x[i] = s / A[i][i]; }
    return x;
  }
  O.homography = function (src, dst) {   // 4 points sheet (mm) -> photo (px)
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var x = src[i][0], y = src[i][1], u = dst[i][0], v = dst[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    var h = solve(A, b);
    return function (p) { var w = h[6] * p[0] + h[7] * p[1] + 1; return [(h[0] * p[0] + h[1] * p[1] + h[2]) / w, (h[3] * p[0] + h[4] * p[1] + h[5]) / w]; };
  };
  function otsu(gray) {
    var hist = new Array(256).fill(0), i, total = gray.length;
    for (i = 0; i < total; i++) hist[gray[i]]++;
    var sum = 0; for (i = 0; i < 256; i++) sum += i * hist[i];
    var sumB = 0, wB = 0, best = 0, th = 128;
    for (i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue; var wF = total - wB; if (!wF) break;
      sumB += i * hist[i]; var mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; th = i; }
    }
    return th;
  }
  // dark connected blobs that look like filled squares; the one nearest each corner of the photo is that corner's square
  function corners(dark, W, H) {
    var seen = new Uint8Array(W * H), stack = new Int32Array(W * H), found = [];
    var minSide = Math.min(W, H) * 0.018, maxSide = Math.min(W, H) * 0.12;
    for (var start = 0; start < W * H; start++) {
      if (!dark[start] || seen[start]) continue;
      var top = 0, area = 0, x0 = W, y0 = H, x1 = 0, y1 = 0, sx = 0, sy = 0;
      stack[top++] = start; seen[start] = 1;
      while (top) {
        var p = stack[--top], x = p % W, y = (p - x) / W;
        area++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && dark[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1; }
        if (x < W - 1 && dark[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1; }
        if (y > 0 && dark[p - W] && !seen[p - W]) { seen[p - W] = 1; stack[top++] = p - W; }
        if (y < H - 1 && dark[p + W] && !seen[p + W]) { seen[p + W] = 1; stack[top++] = p + W; }
      }
      var w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (w < minSide || h < minSide || w > maxSide || h > maxSide) continue;
      if (w / h < 0.6 || w / h > 1.66 || area / (w * h) < 0.55) continue;   // a rotated filled square still fills more than half its box
      found.push({ x: sx / area, y: sy / area, size: Math.sqrt(area) });
    }
    var targets = [[0, 0], [W, 0], [0, H], [W, H]];
    var pick = targets.map(function (c) {
      var best = null, bd = Infinity;
      found.forEach(function (f) { var d = Math.hypot(f.x - c[0], f.y - c[1]); if (d < bd) { bd = d; best = f; } });
      return best;
    });
    if (pick.some(function (p) { return !p; })) return null;
    if (new Set(pick).size < 4) return null;
    return pick;
  }
  O.readPixels = function (rgba, W, H, exam) {
    var gray = new Uint8Array(W * H), i;
    for (i = 0; i < W * H; i++) gray[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
    var th = otsu(gray), dark = new Uint8Array(W * H);
    for (i = 0; i < W * H; i++) dark[i] = gray[i] < th ? 1 : 0;
    var c = corners(dark, W, H);
    if (!c) return { ok: false, reason: 'corners' };
    var map = O.homography(CORNERS, c.map(function (p) { return [p.x, p.y]; }));
    var scale = Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y) / (CORNERS[1][0] - CORNERS[0][0]);   // px per mm along the top
    var rr = Math.max(2, R * scale * 0.62);
    function fill(mm) {
      var p = map(mm), n = 0, on = 0, r2 = rr * rr;
      for (var y = Math.floor(p[1] - rr); y <= p[1] + rr; y++) {
        for (var x = Math.floor(p[0] - rr); x <= p[0] + rr; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          var dx = x - p[0], dy = y - p[1]; if (dx * dx + dy * dy > r2) continue;
          n++; if (dark[y * W + x]) on++;
        }
      }
      return n ? on / n : 0;
    }
    function decide(values) {   // the marked choices of one row (or one code column)
      var top = Math.max.apply(null, values);
      if (top < 0.33) return [];
      return values.map(function (v, k) { return v >= Math.max(0.33, top * 0.6) ? k : -1; }).filter(function (k) { return k >= 0; });
    }
    var digits = [], codeOk = true;
    for (var col = 0; col < CODE_DIGITS; col++) {
      var vs = []; for (var d = 0; d < 10; d++) vs.push(fill(O.code(col, d)));
      var m = decide(vs);
      if (m.length !== 1) codeOk = false;
      digits.push(m.length === 1 ? String(m[0]) : '?');
    }
    var n = Math.min(MAX_Q, Number(exam.questions) || 0), ch = Math.min(5, Math.max(2, Number(exam.choices) || 4));
    var answers = [], blank = [], multi = [];
    for (var q = 0; q < n; q++) {
      var row = []; for (var k = 0; k < ch; k++) row.push(fill(O.bubble(q, k)));
      var got = decide(row);
      if (!got.length) { blank.push(q + 1); answers.push(''); } else if (got.length > 1) { multi.push(q + 1); answers.push(''); } else answers.push(O.LETTERS.en[got[0]]);
    }
    return { ok: true, code: codeOk ? digits.join('') : null, codeRead: digits.join(''), answers: answers, blank: blank, multi: multi };
  };
  // a File / Blob from the phone camera or the gallery -> the reading (downscaled so a 12 MP photo stays fast)
  O.readImage = function (blob, exam) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(blob);
      img.onload = function () {
        var s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), W = Math.round(img.naturalWidth * s), H = Math.round(img.naturalHeight * s);
        var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, W, H);
        URL.revokeObjectURL(url);
        try { resolve(O.readPixels(cx.getImageData(0, 0, W, H).data, W, H, exam)); } catch (e) { reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  };
  /* the same rule as center.grade_answers: correct answers x (full mark / questions) */
  O.grade = function (key, answers, max) {
    key = (key || []).map(function (a) { return String(a || '').toUpperCase(); });
    if (!key.length) return { score: null, right: 0 };
    var right = key.filter(function (k, i) { return k && answers[i] === k; }).length;
    return { score: Math.round(right * (Number(max) || key.length) / key.length * 100) / 100, right: right };
  };
  /* typed keys: "ABCD..." or Arabic letters, spaces and commas ignored */
  O.parseKey = function (text) {
    var ar = O.LETTERS.ar;
    return String(text || '').replace(/[\s,،\-]/g, '').split('').map(function (ch) {
      var u = ch.toUpperCase(), k = O.LETTERS.en.indexOf(u); if (k >= 0) return u;
      k = ar.indexOf(ch); if (ch === 'ه') k = 4;
      return k >= 0 ? O.LETTERS.en[k] : '?';
    });
  };
})();
