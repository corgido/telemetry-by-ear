/* The page follows the system's light or dark until the reader picks one with
   a theme button; the pick is remembered. The header has a button, and so do
   the pinned bar and the record's contents column, so the switch is in reach
   from anywhere on the page. Each button names what a click does. The CSS does
   the following, so without script the page still matches the system and the
   buttons stay hidden; without storage a pick lasts for the page. */
(function () {
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) {}
  var system = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  if (saved === "dark" || saved === "light") root.setAttribute("data-theme", saved);
  var isDark = function () {
    var t = root.getAttribute("data-theme");
    return t ? t === "dark" : !!(system && system.matches);
  };
  document.addEventListener("DOMContentLoaded", function () {
    var buttons = Array.prototype.slice.call(document.querySelectorAll("#theme, [data-theme-toggle]"));
    if (!buttons.length) return;
    var sync = function () {
      var dark = isDark();
      buttons.forEach(function (b) {
        b.textContent = dark ? "Light" : "Dark";
        b.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      });
    };
    buttons.forEach(function (b) {
      b.hidden = false;
      b.addEventListener("click", function () {
        var dark = !isDark();
        root.setAttribute("data-theme", dark ? "dark" : "light");
        try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
        sync();
      });
    });
    if (system && system.addEventListener) system.addEventListener("change", sync);
    sync();
  });
})();
