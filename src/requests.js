export async function fetchData() {
  const res = await fetch("/data");
  const json = await res.json();
  return json;
}

export async function sendOpenFile(file) {
  return await fetch(`/open?name=${encodeURIComponent(file.path)}`);
}

export async function sendToggleWatched(file) {
  let params = new URLSearchParams();
  params.set("name", file.path);
  params.set("setWatched", !file.watched);
  params.set("series", file.series);
  params.set("episode", file.episode);

  return await fetch(`/update?${params.toString()}`);
}

export async function sendGetIcons() {
  return await fetch("/icons");
}
