(function () {
  function render(node, items) {
    if (!node) return;
    node.innerHTML = "";
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "Tape is quiet. Headlines will appear here when feeds respond.";
      node.appendChild(li);
      return;
    }
    items.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = index === 0 ? "flash-card is-lead" : "flash-card";
      const media = document.createElement("div");
      media.className = item.image ? "flash-media" : "flash-media is-empty";
      if (item.image) {
        const img = document.createElement("img");
        img.src = item.image;
        img.alt = "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => media.classList.add("is-empty"));
        media.appendChild(img);
      }
      const copy = document.createElement("div");
      copy.className = "flash-copy";
      if (item.url) {
        const link = document.createElement("a");
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = item.title;
        copy.appendChild(link);
      } else {
        const title = document.createElement("strong");
        title.textContent = item.title;
        copy.appendChild(title);
      }
      const meta = [item.source, item.published].filter(Boolean).join(" · ");
      if (meta) {
        const line = document.createElement("span");
        line.className = "muted";
        line.textContent = meta;
        copy.appendChild(line);
      }
      li.appendChild(media);
      li.appendChild(copy);
      node.appendChild(li);
    });
  }

  function load() {
    const left = document.getElementById("flash-left-list");
    const right = document.getElementById("flash-right-list");
    if (!left || !right) return;
    fetch("/api/headlines")
      .then((response) => response.json())
      .then((data) => {
        const rows = data.results || [];
        const leftRows = data.tape && data.tape.length ? data.tape : rows.slice(0, Math.ceil(rows.length / 2));
        const rightRows = data.headlines && data.headlines.length ? data.headlines : rows.slice(Math.ceil(rows.length / 2));
        render(left, leftRows);
        render(right, rightRows);
      })
      .catch(() => {
        render(left, []);
        render(right, []);
      });
  }

  load();
})();
