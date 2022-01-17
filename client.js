const nameEpisodeRegex = /\[.*\] (.*) - (\d+) [\[\(].+[\)\]]+.*\.mkv/;

function parseFilename(filename) {
  let matches = filename.match(nameEpisodeRegex);
  let series = matches && matches.length > 1 ? matches[1] : "n/a";
  let episode = matches && matches.length > 2 ? parseInt(matches[2]) : null;
  return { series, episode };
}

function getFiles(filenames, watched) {
  let latest = {};
  let watchedMap = {};
  watched.map((entry) => {
    watchedMap[entry.name] = entry.date;
    let { series, episode } = parseFilename(entry.name);
    if (episode) {
      if (latest[series] == null) {
        latest[series] = episode;
      } else if (latest[series] < episode) {
        latest[series] = episode;
      }
    }
  });

  const withEpisode = filenames.map((filename, idx) => {
    let { series, episode } = parseFilename(filename);

    let origin = window.location.origin;
    let encoded = encodeURIComponent(series);
    let backgroundImage = `url('${origin}/dist/icons/${encoded}')`;

    return {
      idx,
      title: filename,
      watched: watchedMap[filename],
      series,
      episode,
      style: {
        backgroundImage,
      },
    };
  });

  const withLatest = withEpisode.map((r) => {
    r.latest = latest[r.series];
    return r;
  });

  return withLatest;
}

async function fetchFilenames() {
  const res = await fetch("/files");
  const json = await res.json();
  return json;
}

async function fetchWatched() {
  const res = await fetch("/watched");
  const json = await res.json();
  return json;
}

async function sendOpenFile(file) {
  return await fetch(`/open?name=${encodeURIComponent(file.title)}`);
}

async function sendToggleWatched(file) {
  return await fetch(
    `/update?name=${encodeURIComponent(file.title)}&watched=${!file.watched}`
  );
}

async function sendGetIcons() {
  return await fetch("/icons");
}

function startApp() {
  var app = new Vue({
    el: "#app",
    data: {
      loading: true,
      iconsLoading: false,
      files: [],
      watched: [],
      recents: [],
      cursor: -1,
    },
    created() {
      this.fetchData();
      this.handleKeyboardEvents();
    },
    methods: {
      async fetchData() {
        this.loading = true;
        const [filenames, watched] = await Promise.all([
          fetchFilenames(),
          fetchWatched(),
        ]);
        this.loading = false;
        this.files = getFiles(filenames, watched);
        this.watched = watched;
        this.recents = watched.slice(0, 8);
      },
      async openFile(file) {
        this.cursor = file.idx;
        sendOpenFile(file);
      },
      async toggleWatched(file) {
        this.cursor = file.idx;
        sendToggleWatched(file);
        this.fetchData();
      },
      async sendGetIcons() {
        this.iconsLoading = true;
        await sendGetIcons();
        this.iconsLoading = false;
        window.location = "/";
      },
      updateCursor(fn) {
        this.cursor = fn(this.cursor);
        if (this.cursor < -1) {
          this.cursor = -1;
          window.scroll(0, 0);
        } else {
          let file = this.files[this.cursor];
          if (file) {
            let e = document.querySelector(`div[data-title='${file.title}']`);
            if (e) {
              e.scrollIntoViewIfNeeded();
            }
          }
        }
      },
      handleKeyboardEvents() {
        window.addEventListener("keydown", (e) => {
          if (e.key === "k") {
            this.updateCursor((x) => x - 1);
          }
          if (e.key === "j") {
            this.updateCursor((x) => x + 1);
          }
          if (e.key === "o") {
            let file = this.files[this.cursor];
            if (file) {
              this.openFile(file);
            }
          }
          if (e.key === "M" || e.key === "W") {
            let file = this.files[this.cursor];
            if (file) {
              this.toggleWatched(file);
            }
          }
          if (e.key === "r") {
            this.fetchData();
          }
          if (e.key === "I") {
            this.sendGetIcons();
          }
        });
      },
    },
  });

  console.log("app running:", app);

  window.app = app;
}

startApp();
