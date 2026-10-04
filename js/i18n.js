/* Hessa - translations (English + Arabic), number/date formatting.
   Every visible word comes from js/i18n/en.js and js/i18n/ar.js through HS.t('key'). Missing keys fall back to English. */
(function () {
  'use strict';
  var HS = window.HS;
  HS.lang = document.documentElement.lang === 'en' ? 'en' : 'ar';

  HS.t = function (key, vars) {
    var d = HS.dict[HS.lang] || {};
    var s = d[key];
    if (s === undefined) s = (HS.dict.en || {})[key];
    if (s === undefined) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, n) { var v = vars[n]; return v === undefined ? m : (v && v.html !== undefined ? v.html : HS.esc(v)); });
    return s;
  };
  HS.has = function (key) { return ((HS.dict[HS.lang] || {})[key] !== undefined) || ((HS.dict.en || {})[key] !== undefined); };

  HS.setLang = function (lang) {
    HS.lang = lang === 'en' ? 'en' : 'ar';
    var h = document.documentElement;
    h.lang = HS.lang;
    h.dir = HS.lang === 'ar' ? 'rtl' : 'ltr';
    document.title = HS.t('app.name');
    HS.emit('lang-changed', HS.lang);
  };

  /* Western digits in both languages (km, times and plates read the same everywhere). */
  var nf = new Intl.NumberFormat('en-US');
  HS.fmt = {
    num: function (n) { return nf.format(Number(n) || 0); },
    pad: function (n) { return String(n).padStart(2, '0'); },
    date: function (d) {
      d = d instanceof Date ? d : new Date(d);
      if (isNaN(d)) return '';
      return HS.fmt.pad(d.getDate()) + '/' + HS.fmt.pad(d.getMonth() + 1) + '/' + d.getFullYear();
    },
    time: function (d) {
      d = d instanceof Date ? d : new Date(d);
      if (isNaN(d)) return '';
      return HS.fmt.pad(d.getHours()) + ':' + HS.fmt.pad(d.getMinutes());
    },
    dayName: function (d) {
      return new Intl.DateTimeFormat(HS.lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { weekday: 'long' }).format(d || new Date());
    },
    longDate: function (d) {
      return new Intl.DateTimeFormat(HS.lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d || new Date());
    }
  };
})();
