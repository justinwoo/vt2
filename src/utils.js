export function debounce(fn) {
  let window = 20;
  let last = 0;
  return function (arg) {
    let now = new Date().getTime();
    if (now - last > window) {
      last = now;
      fn(arg);
    }
  };
}
