const http = require("http");
const path = require("path");
const fs = require("fs").promises;
const cp = require("child_process");

const sqlite3 = require("sqlite3").verbose();

const host = "localhost";
const port = 2345;

function sendJSON(res, obj) {
  res.setHeader("Content-Type", "application/json");
  res.writeHead(200);
  res.end(JSON.stringify(obj, null, 2));
}

async function sendContent(res, contentType, contents) {
  res.setHeader("Content-Type", contentType);
  res.writeHead(200);
  res.end(contents);
}

function getRequestListener({ config, db }) {
  return async function requestListener(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);

      // ----- static files -----
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const file = await fs.readFile(__dirname + "/index.html");
        return sendContent(res, "text/html", file);
      }

      if (url.pathname === "/favicon.ico") {
        const file = await fs.readFile(__dirname + url.pathname);
        return sendContent(res, "", file);
      }

      if (url.pathname.indexOf("/dist") === 0) {
        const file = await fs.readFile(
          __dirname + decodeURIComponent(url.pathname)
        );
        return sendContent(res, "", file);
      }

      // ----- api -----
      if (url.pathname === "/watched") {
        const watched = await getWatched(db);
        return sendJSON(res, watched);
      }

      if (url.pathname === "/files") {
        const files = await getFiles(config);
        return sendJSON(res, files);
      }

      if (url.pathname === "/icons") {
        const files = await getFiles(config);
        const names = files.reduce((acc, file) => {
          let { series } = parseFilename(file);
          if (!!series && series !== "n/a") {
            acc.push(series);
          }
          return acc;
        }, []);
        await getIcons(names);
        return sendJSON(res, {});
      }

      if (url.pathname.indexOf("/open") === 0) {
        const name = url.searchParams.get("name");
        open(config, decodeURIComponent(name));
        return sendJSON(res, {});
      }

      if (url.pathname.indexOf("/update") === 0) {
        const name = url.searchParams.get("name");
        const watched = url.searchParams.get("watched");
        const filename = decodeURIComponent(name);
        if (watched === "true") {
          upsertWatched(db, filename);
        } else {
          deleteWatched(db, filename);
        }
        return sendJSON(res, {});
      } else {
        const obj = "hello";
        return sendJSON(res, obj);
      }

      // errors don't matter
    } catch (e) {
      if (e.code && e.code == "ENOENT") {
        res.writeHead(404);
      } else {
        console.error(e);
        res.writeHead(500);
      }
      return res.end();
    }
  };
}

function open(config, name) {
  cp.spawn(config.exe, [path.join(config.dir, name)]);
}

const nameEpisodeRegex = /\[.*\] (.*) - (\d+) [\[\(].+[\)\]]+.*\.mkv/;
function parseFilename(filename) {
  let matches = filename.match(nameEpisodeRegex);
  let series = matches && matches.length > 1 ? matches[1] : "n/a";
  let episode = matches && matches.length > 2 ? parseInt(matches[2]) : null;
  return { series, episode };
}

async function getIcons(names) {
  return await Promise.all(
    names.map((name) => {
      return new Promise(async (res) => {
        const iconPath = path.join("./dist/icons", name);
        let exists = await fs
          .stat(iconPath)
          .then((_) => true)
          .catch((_) => false);
        if (exists) {
          return;
          res();
        } else {
          for (let name in names) {
            let process = cp.spawn("get-icons", [name, iconPath]);
            process.on("exit", (code) => {
              console.log(`Fetched icon for ${name}`, code);
              res();
            });
            return;
          }
        }
      });
    })
  );
}

async function getFiles(config) {
  const files = await fs.readdir(config.dir);
  const validFiles = files.filter((x) => x.indexOf("mkv") !== -1);
  let stats = await Promise.all(
    validFiles.map(async (filename) => {
      const stat = await fs.stat(path.join(config.dir, filename));
      return { filename, stat };
    })
  );
  stats.sort((x, y) => y.stat.ctimeMs - x.stat.ctimeMs);
  return stats.map((x) => x.filename);
}

async function getWatched(db) {
  return await query(
    db,
    "select path as name, created as date from watched order by created desc",
    {}
  );
}

async function deleteWatched(db, filename) {
  return await query(db, "delete from watched where path = $path", {
    $path: filename,
  });
}

async function upsertWatched(db, filename) {
  return await query(
    db,
    "insert or replace into watched ( path, created ) values ( $path, datetime() )",
    {
      $path: filename,
    }
  );
}

async function main() {
  const dir = process.env.DIR;
  const exe = process.env.EXE;
  const config = { dir, exe };
  if (!dir) {
    console.error("set DIR, e.g. /home/usr/Crap");
    process.exit(1);
  }
  if (!exe) {
    console.error("set EXE, e.g. vlc");
    process.exit(1);
  }

  const db = new sqlite3.Database(path.join(config.dir, "filetracker"));
  console.log("running ensure db");
  db.exec(
    "create table if not exists watched (path text primary key unique, created datetime)"
  );

  const server = http.createServer(getRequestListener({ config, db }));
  server.listen(port, host, () => {
    console.log(`Running ${host}:${port}`);
  });
}

async function query(db, query, params) {
  return await new Promise((res, rej) => {
    db.all(query, params, (err, data) => {
      if (err) {
        rej(err);
      } else {
        res(data);
      }
    });
  });
}

main();
