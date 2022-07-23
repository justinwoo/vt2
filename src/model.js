export function getFiles(data) {
  return data.map((r, idx) => {
    let origin = window.location.origin;
    let encoded = encodeURIComponent(r.series);
    let backgroundImage = `url("${origin}/dist/icons/${encoded}")`;

    return {
      idx,
      path: r.path,
      watched: r.watched,
      series: r.series,
      episode: r.episode,
      latest: r.latest,
      style: {
        backgroundImage,
      },
    };
  });
}

export function groupBySeries(files) {
  let series = {};
  let idx = 0;
  for (let file of files) {
    if (series[file.series]) {
      series[file.series].push(file);
    } else {
      series[file.series] = [file];
    }
  }
  let output = [];
  for (let key in series) {
    let subFiles = series[key];
    subFiles.sort((a, b) => b.episode - a.episode);
    subFiles.map((f) => (f.idx = idx++));
    output = output.concat(subFiles);
  }
  return output;
}

export function filterByString(files, filterString) {
  let filter = filterString.toLowerCase();
  let idx = 0;
  let output = [];
  for (let file of files) {
    let series = file.series.toLowerCase();
    if (series.indexOf(filter) !== -1) {
      file.idx = idx++;
      output.push(file);
    }
  }
  return output;
}
