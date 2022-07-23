import { filterByString, getFiles, groupBySeries } from "./model.js";
import {
  fetchData,
  sendGetIcons,
  sendOpenFile,
  sendToggleWatched,
} from "./requests.js";
import { debounce } from "./utils.js";

export default function startApp() {
  var app = new Vue({
    el: "#app",
    data: {
      loading: true,
      iconsLoading: false,
      data: [],
      files: [],
      recents: [],
      cursor: -1,
      groupBySeries: false,
      filterString: "",
    },
    created() {
      this.fetchData();
      this.handleKeyboardEvents();
    },
    methods: {
      async fetchData() {
        this.loading = true;
        const data = await fetchData();

        this.data = data;
        this.recents = data.filter((r) => !!r.watched).slice(0, 9);

        this.recalculate();
      },
      recalculate() {
        this.loading = false;
        this.files = getFiles(this.data);
        if (this.groupBySeries) {
          this.files = groupBySeries(this.files);
        }
        if (this.filterString !== "") {
          this.files = filterByString(this.files, this.filterString);
        }
      },
      async openFile(file) {
        this.cursor = file.idx;
        sendOpenFile(file);
      },
      onSearchKeydown(e) {
        if (e.key === "Escape") {
          this.unfocusSearchInput();
        }
      },
      onSearchInput(e) {
        if (e.data === "/") {
          e.target.value = this.filterString;
          e.preventDefault();
          this.unfocusSearchInput();
          return;
        }
        this.filterString = e.target.value;
        this.recalculate();
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
            let e = document.querySelector(`div[data-title='${file.idx}']`);
            if (e) {
              e.scrollIntoViewIfNeeded();
            }
          }
        }
      },
      focusSearchInput() {
        let e = document.querySelector(".search-input");
        if (e) {
          e.focus();
        }
      },
      unfocusSearchInput() {
        let e = document.querySelector(".search-input");
        if (e) {
          e.blur();
        }
      },
      handleKeyboardEvents() {
        window.addEventListener(
          "keydown",
          debounce((e) => {
            if (e.target !== document.body) {
              return;
            }
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
            if (e.key === "g") {
              this.groupBySeries = !this.groupBySeries;
              this.recalculate();
            }
            if (e.key === "/") {
              e.preventDefault();
              this.focusSearchInput();
            }
          })
        );
      },
    },
  });

  console.log("app running:", app);

  window.app = app;
}
