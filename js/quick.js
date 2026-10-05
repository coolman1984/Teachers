/* Hessa - the personal-link page (served by the server at /k/<link>): a real browser that opens the link sends the sign-in form
   by itself. A program that only looks at the link (a chat preview, a virus scanner) does not run this, so it signs nobody in. */
(function () {
  'use strict';
  var form = document.getElementById('go');
  if (form && !sessionStorage.getItem('hs.quick.sent')) {
    try { sessionStorage.setItem('hs.quick.sent', '1'); } catch (e) { /* private window: the button still works */ }
    setTimeout(function () { form.submit(); }, 400);
  }
})();
