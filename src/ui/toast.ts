let el: HTMLDivElement | null = null;
let timer: number | undefined;

export function toast(message: string) {
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(timer);
  timer = window.setTimeout(() => el?.classList.remove("show"), 2200);
}
