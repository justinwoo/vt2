const http = require("http");
const path = require("path");
const fs = require("fs").promises;
const cp = require("child_process");
const hash = require("object-hash");

const Database = require("better-sqlite3");

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
          __dirname + decodeURIComponent(url.pathname),
        );
        return sendContent(res, "", file);
      }

      // ----- api -----
      if (url.pathname === "/data") {
        await updateFilesTable({ config, db });
        const data = await getData(db);
        return sendJSON(res, data);
      }

      if (url.pathname === "/icons") {
        const series = await getSeries({ config, db });
        await getIcons(series);
        return sendJSON(res, {});
      }

      if (url.pathname.indexOf("/open") === 0) {
        const name = url.searchParams.get("name");
        open(config, decodeURIComponent(name));
        return sendJSON(res, {});
      }

      if (url.pathname.indexOf("/update") === 0) {
        const name = url.searchParams.get("name");
        const setWatched = url.searchParams.get("setWatched");
        const filename = decodeURIComponent(name);
        const series = decodeURIComponent(url.searchParams.get("series"));
        console.log(`update: ${url.searchParams.toString()}`);
        const episode = Number(
          decodeURIComponent(url.searchParams.get("episode")),
        );
        if (setWatched === "true") {
          upsertEntry(db, filename, series, episode);
        } else {
          deleteEntry(db, filename);
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
  const command = `(${config.exe} '${path.join(config.dir, name)}' &)`;

  console.log("launching with bash:", command);
  const spawned = cp.spawn("bash", ["-c", command]);
  console.log("status:", spawned.status);
  console.log("stdout:", spawned.stdout.toString());
  console.error("stderr:", spawned.stderr.toString());
}

const nameEpisodeRegex =
  /\[.*\] (.*) - (\d+\.*[\.\d]*[\.v]*[\d]*) [\[\(].+[\)\]]+.*\.mkv/;

function parseEpisodeNumber(string) {
  string = string.replace("v", ".");
  return parseFloat(string);
}

function parseFilename(filename) {
  let matches = filename.match(nameEpisodeRegex);
  let series = matches && matches.length > 1 ? matches[1] : "n/a";
  let episode =
    matches && matches.length > 2 ? parseEpisodeNumber(matches[2]) : null;
  return { series, episode };
}

async function getIcons(series) {
  for await (let r of series) {
    const name = r.series;
    const iconPath = path.join("./dist/icons", name);
    let exists = await fs.stat(iconPath).catch((_) => false);
    if (!exists) {
      console.log(`Fetching icon for ${name}`);
      await new Promise((res) => {
        let process = cp.spawn("get-icons", [name, iconPath]);
        process.on("exit", (code) => {
          console.log(`Fetched icon for ${name}`, code);
          res();
        });
      });
    }
  }
}

async function getSeries({ db }) {
  return await db.prepare("select distinct(series) from files").all();
}

async function getData(db) {
  return await db
    .prepare(
      `
        select
          f.path,
          f.series,
          f.episode,
          l.latest as latest,
          e.created as watched
        from files f
        left join entry e on e.path = f.path
        left join latest l on l.series = f.series
        order by ctime desc
      `,
    )
    .all();
}

async function deleteEntry(db, filename) {
  return await db
    .prepare("delete from entry where path = $path")
    .run({ path: filename });
}

async function upsertEntry(db, filename, series, episode) {
  return await db
    .prepare(
      `
        insert or replace into entry
          ( path, series, episode, created )
        values
          ( $path, $series, $episode, datetime() )
      `,
    )
    .run({
      path: filename,
      series,
      episode,
    });
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

  const db = getDB(config);

  await updateFilesTable({ config, db });

  const server = http.createServer(getRequestListener({ config, db }));
  server.listen(port, host, () => {
    console.log(`Running ${host}:${port}`);
  });
}

function getDB(config) {
  const db = new Database(path.join(config.dir, "filetracker"), {
    // verbose: console.log,
  });

  const setup = [
    "pragma journal_mode = WAL",
    "pragma synchronous = normal",
    "create table if not exists watched (path text primary key unique, created datetime)",
    "drop table if exists files",
    "create table if not exists files (path text primary key unique, series text, episode float, ctime datetime)",
    "create table if not exists entry (path text primary key unique, series text, episode float, created datetime)",
    "create view if not exists latest as select series, max(episode) as latest from entry group by series",
  ];

  console.log("-- running db setup");
  setup.forEach((query) => db.prepare(query).run());

  return db;
}

let filesListingHash = null;

async function updateFilesTable({ config, db }) {
  const files = await fs.readdir(config.dir);
  const validFiles = files.filter((x) => x.indexOf("mkv") !== -1);
  const sha = hash(validFiles);

  if (sha === filesListingHash) return;

  filesListingHash = sha;

  console.log("-- updating files table");
  console.time("time");

  const filesData = await Promise.all(
    validFiles.map(async (filename) => {
      const stat = await fs.stat(path.join(config.dir, filename));
      let { series, episode } = parseFilename(filename);

      if (!series || episode == null || series === "n/a") {
        console.error(`Could not parse: ${filename}. ${series}, ${episode})`);
      }

      return {
        path: filename,
        series: series,
        episode: episode,
        ctime: stat.ctime.getTime(),
      };
    }),
  );

  db.prepare("delete from files").run();

  for (let params of filesData) {
    await db
      .prepare(
        `
        insert or replace into files
          ( path, series, episode, ctime )
        values
          ( $path, $series, $episode, $ctime )
        `,
      )
      .run(params);
  }

  console.timeEnd("time");
}

main();
