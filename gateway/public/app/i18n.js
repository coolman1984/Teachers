/* Hessa parent page - texts. Formal Arabic first (the centre's language); the parent can switch to English. */
(function () {
  'use strict';
  var P = window.P = window.P || {};
  var dict = {
    ar: {
      app: 'حصة', lang: 'English', loading: 'جارٍ التحميل…', readOnly: 'للاطلاع فقط',
      updated: 'آخر تحديث من المركز: {t}', saved: 'أنت غير متصل بالإنترنت. هذه آخر نسخة محفوظة على هاتفك ({t}) وقد تكون قديمة.',
      minutes: 'منذ {n} دقيقة', hours: 'منذ {n} ساعة', days: 'منذ {n} يوم', now: 'الآن',
      money: 'المدفوعات والمستحق', owes: 'مستحق', credit: 'رصيد مقدم', clear: 'لا يوجد مستحق', left: 'متبقٍ {n} حصة', wallet: 'رصيد مقدم عام: {a}',
      fee_session: 'بالحصة', fee_month: 'شهريًا', fee_package: 'باقة',
      week: 'مواعيد الأيام السبعة القادمة', noWeek: 'لا توجد حصص في الأيام السبعة القادمة.', today: 'اليوم', tomorrow: 'غدًا',
      att: 'الحضور (آخر {n} حصة)', attRate: 'نسبة الحضور {p}%', noAtt: 'لم تُسجَّل حصص بعد.',
      present: 'حاضر', late: 'متأخر', absent: 'غائب', excused: 'غياب بعذر',
      marks: 'الدرجات', noMarks: 'لا توجد نتائج منشورة بعد.', rank: 'الترتيب {r} من {n}', absentExam: 'غائب عن الامتحان',
      payments: 'آخر المدفوعات', noPay: 'لا توجد مدفوعات بعد.', receipt: 'إيصال {no}', reversed: 'إلغاء إيصال',
      groups: 'المجموعات', teacher: 'المعلم',
      revoked: 'هذا الرابط لم يعد يعمل', revoked_b: 'أوقفه المركز أو استبدله برابط جديد. اطلب الرابط الجديد من المركز. حُذفت النسخة المحفوظة على هذا الهاتف.',
      expired: 'انتهت صلاحية هذا الرابط', expired_b: 'اطلب رابطًا جديدًا من المركز.',
      notyet: 'الرابط قيد التجهيز', notyet_b: 'يرسل المركز البيانات خلال دقائق. أعد فتح الرابط بعد قليل.',
      bad: 'الرابط غير مكتمل', bad_b: 'تأكد من فتح الرابط كاملًا كما وصلك.',
      offline: 'لا يوجد اتصال بالإنترنت', offline_b: 'افتح الرابط مرة أخرى عند عودة الاتصال.',
      busy: 'طلبات كثيرة', busy_b: 'انتظر دقيقة ثم أعد المحاولة.', retry: 'أعد المحاولة', refresh: 'تحديث',
      grade_P1: 'الصف الأول الابتدائي', grade_P2: 'الصف الثاني الابتدائي', grade_P3: 'الصف الثالث الابتدائي', grade_P4: 'الصف الرابع الابتدائي',
      grade_P5: 'الصف الخامس الابتدائي', grade_P6: 'الصف السادس الابتدائي', grade_M1: 'الصف الأول الإعدادي', grade_M2: 'الصف الثاني الإعدادي',
      grade_M3: 'الصف الثالث الإعدادي', grade_S1: 'الصف الأول الثانوي', grade_S2: 'الصف الثاني الثانوي', grade_S3: 'الصف الثالث الثانوي',
      currency: 'ج.م', code: 'الكود'
    },
    en: {
      app: 'Hessa', lang: 'العربية', loading: 'Loading…', readOnly: 'Read only',
      updated: 'Last update from the centre: {t}', saved: 'You are offline. This is the last copy saved on your phone ({t}) and may be old.',
      minutes: '{n} min ago', hours: '{n} h ago', days: '{n} day(s) ago', now: 'just now',
      money: 'Payments and what is due', owes: 'Due', credit: 'Paid in advance', clear: 'Nothing due', left: '{n} session(s) left', wallet: 'Money in advance: {a}',
      fee_session: 'Per session', fee_month: 'Monthly', fee_package: 'Package',
      week: 'Sessions in the next seven days', noWeek: 'No sessions in the next seven days.', today: 'Today', tomorrow: 'Tomorrow',
      att: 'Attendance (last {n} sessions)', attRate: 'Attendance {p}%', noAtt: 'No sessions recorded yet.',
      present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused',
      marks: 'Marks', noMarks: 'No published results yet.', rank: 'Rank {r} of {n}', absentExam: 'Absent from the exam',
      payments: 'Latest payments', noPay: 'No payments yet.', receipt: 'Receipt {no}', reversed: 'Reversed receipt',
      groups: 'Groups', teacher: 'Teacher',
      revoked: 'This link no longer works', revoked_b: 'The centre stopped it or replaced it with a new link. Ask the centre for the new one. The copy saved on this phone was removed.',
      expired: 'This link has expired', expired_b: 'Ask the centre for a new link.',
      notyet: 'The link is being prepared', notyet_b: 'The centre sends the data within minutes. Open the link again shortly.',
      bad: 'The link is incomplete', bad_b: 'Make sure you opened the whole link as you received it.',
      offline: 'No internet connection', offline_b: 'Open the link again when you are back online.',
      busy: 'Too many requests', busy_b: 'Wait a minute and try again.', retry: 'Try again', refresh: 'Refresh',
      grade_P1: 'Primary 1', grade_P2: 'Primary 2', grade_P3: 'Primary 3', grade_P4: 'Primary 4', grade_P5: 'Primary 5', grade_P6: 'Primary 6',
      grade_M1: 'Preparatory 1', grade_M2: 'Preparatory 2', grade_M3: 'Preparatory 3', grade_S1: 'Secondary 1', grade_S2: 'Secondary 2', grade_S3: 'Secondary 3',
      currency: 'EGP', code: 'Code'
    }
  };
  P.lang = 'ar';
  try { var s = localStorage.getItem('hs.parent.lang'); if (s === 'ar' || s === 'en') P.lang = s; } catch (e) { /* private mode */ }
  P.t = function (k, v) {
    var s = (dict[P.lang] || {})[k]; if (s === undefined) s = dict.en[k]; if (s === undefined) return k;
    if (v) s = s.replace(/\{(\w+)\}/g, function (m, n) { return v[n] === undefined ? m : v[n]; });
    return s;
  };
  P.has = function (k) { return dict[P.lang][k] !== undefined; };
  P.setLang = function (l) {
    P.lang = l === 'en' ? 'en' : 'ar';
    try { localStorage.setItem('hs.parent.lang', P.lang); } catch (e) { /* ignore */ }
    document.documentElement.lang = P.lang; document.documentElement.dir = P.lang === 'ar' ? 'rtl' : 'ltr';
    document.title = P.t('app');
  };
  P.setLang(P.lang);
  P.esc = function (s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  P.dict = dict;
})();
