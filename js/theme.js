"use strict";
/* Manual theme control: System → Light → Dark. The CSS already defines all three
   (bare :root = light, prefers-color-scheme for system dark, [data-theme] to
   override). We only set/clear data-theme on <html> and remember the choice.
   A tiny inline script in each page's <head> applies the saved theme before
   first paint to avoid a flash; this file wires up the toggle button. */
(function () {
  var order = ["system", "light", "dark"];
  var icon = { system: "🖥️", light: "☀️", dark: "🌙" };
  var label = { system: "System theme", light: "Light theme", dark: "Dark theme" };
  function current() { try { return localStorage.getItem("fs-theme") || "system"; } catch (e) { return "system"; } }
  function apply(t) {
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    var b = document.getElementById("themeToggle");
    if (b) { b.textContent = icon[t]; b.title = label[t] + " — click to change"; b.setAttribute("aria-label", label[t] + ", click to change"); }
  }
  function set(t) { try { localStorage.setItem("fs-theme", t); } catch (e) {} apply(t); }
  function cycle() { var c = current(); set(order[(order.indexOf(c) + 1) % order.length]); }
  document.addEventListener("DOMContentLoaded", function () {
    apply(current());
    var b = document.getElementById("themeToggle");
    if (b) b.addEventListener("click", cycle);
  });
})();
