/* Dependency-free logic tests. SoundCloud is mocked; these do not prove live audio. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
class Element {
  constructor() {
    this.disabled = true;
    this.value = "0";
    this.textContent = "";
    this.attrs = {};
    this.events = {};
    this.classes = new Set();
    this.style = {
      values: {},
      setProperty(name, value) {
        this.values[name] = value;
      },
    };
    this.children = [];
    this.classList = {
      add: (v) => this.classes.add(v),
      remove: (v) => this.classes.delete(v),
      toggle: (v, on) => (on ? this.classes.add(v) : this.classes.delete(v)),
    };
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  addEventListener(k, fn) {
    this.events[k] = fn;
  }
  fire(k) {
    this.events[k]?.();
  }
}
function setup(apiPresent = true) {
  const nodes = {};
  const names = [
    ".player",
    ".play-button",
    ".seek",
    ".volume",
    ".current",
    ".duration",
    ".player-status",
    ".player-source",
    ".player-fallback",
    ".deck-state",
    ".skip-back",
    ".skip-forward",
    ".mute-button",
    ".time-toggle",
  ];
  for (const n of names) nodes[n] = new Element();
  nodes[".volume"].value = "80";
  nodes[".player"].querySelector = (n) => nodes[n];
  const host = { innerHTML: "", querySelector: (n) => nodes[n] };
  const bound = {},
    calls = [],
    timers = [];
  const widget = {
    bind: (e, fn) => (bound[e] = fn),
    getDuration: (cb) => cb(120000),
    setVolume: (v) => calls.push(["volume", v]),
    play: () => calls.push(["play"]),
    pause: () => calls.push(["pause"]),
    seekTo: (v) => calls.push(["seek", v]),
  };
  const SC = { Widget: () => widget };
  SC.Widget.Events = Object.fromEntries(
    ["READY", "PLAY", "PAUSE", "PLAY_PROGRESS", "SEEK", "FINISH", "ERROR"].map(
      (v) => [v, v],
    ),
  );
  const window = { addEventListener() {} };
  if (apiPresent) window.SC = SC;
  const document = {
    createElement: () => ({}),
    head: { appendChild: (s) => s.onerror() },
  };
  vm.runInNewContext(fs.readFileSync("js/player.js", "utf8"), {
    window,
    document,
    URL,
    Set,
    Promise,
    Error,
    setTimeout: (f) => (timers.push(f), timers.length),
    clearTimeout() {},
  });
  return { host, nodes, bound, calls, timers, player: window.SaintPlayer };
}
(async () => {
  let x = setup();
  assert.equal(x.player.format(65000), "1:05");
  assert.equal(x.player.format(-100), "0:00");
  assert.equal(x.player.soundcloudUrl("javascript:alert(1)"), "");
  assert.equal(
    x.player.soundcloudUrl("https://soundcloud.com.evil.test/a"),
    "",
  );
  x.player.mount(x.host, { title: "Example", soundcloudUrl: "" });
  assert.match(x.host.innerHTML, /Audio unavailable/);
  assert.doesNotMatch(x.host.innerHTML, /<iframe/);
  assert.match(x.host.innerHTML, /class="wave-stack" aria-hidden="true"/);
  assert.equal((x.host.innerHTML.match(/<span style="--h:/g) || []).length, 64 * 3);
  assert.match(x.host.innerHTML, /data-state="offline"/);
  x = setup();
  x.player.mount(x.host, {
    title: "Example",
    artist: "Artist",
    soundcloudUrl: "https://soundcloud.com/example/track",
  }, { label: "FRAGMENT / 007" });
  await Promise.resolve();
  assert.match(x.host.innerHTML, /auto_play=false/);
  assert.doesNotMatch(x.host.innerHTML, /<details/);
  assert.match(x.host.innerHTML, /class="player-source"/);
  assert.match(x.host.innerHTML, /class="player-fallback"[^>]*aria-hidden="true"/);
  assert.equal(x.calls.length, 0);
  assert.match(x.host.innerHTML, /FRAGMENT \/ 007/);
  x.bound.READY();
  assert.equal(x.nodes[".play-button"].disabled, false);
  assert.equal(x.nodes[".skip-back"].disabled, false);
  assert.equal(x.nodes[".duration"].textContent, "2:00");
  assert.equal(x.nodes[".player"].attrs["data-state"], "ready");
  assert.deepEqual(x.calls.pop(), ["volume", 80]);
  x.nodes[".play-button"].fire("click");
  assert.deepEqual(x.calls.pop(), ["play"]);
  assert.equal(x.nodes[".deck-state"].textContent, "BUFFERING");
  x.bound.PLAY();
  assert.equal(x.nodes[".play-button"].attrs["aria-pressed"], "true");
  assert.equal(x.nodes[".deck-state"].textContent, "PLAYING");
  x.nodes[".play-button"].fire("click");
  assert.deepEqual(x.calls.pop(), ["pause"]);
  x.bound.PAUSE();
  assert.equal(x.nodes[".play-button"].attrs["aria-pressed"], "false");
  x.bound.PLAY_PROGRESS({ currentPosition: 30000 });
  assert.equal(x.nodes[".seek"].value, "250");
  assert.equal(x.nodes[".current"].textContent, "0:30");
  assert.equal(x.nodes[".player"].style.values["--progress"], "25%");
  assert.equal(x.nodes[".player"].style.values["--pnum"], "25");
  x.nodes[".skip-forward"].fire("click");
  assert.deepEqual(x.calls.pop(), ["seek", 40000]);
  x.nodes[".skip-back"].fire("click");
  assert.deepEqual(x.calls.pop(), ["seek", 30000]);
  x.nodes[".time-toggle"].fire("click");
  assert.equal(x.nodes[".duration"].textContent, "-1:30");
  x.nodes[".time-toggle"].fire("click");
  assert.equal(x.nodes[".duration"].textContent, "2:00");
  x.nodes[".mute-button"].fire("click");
  assert.deepEqual(x.calls.pop(), ["volume", 0]);
  assert.equal(x.nodes[".mute-button"].attrs["aria-pressed"], "true");
  x.nodes[".mute-button"].fire("click");
  assert.deepEqual(x.calls.pop(), ["volume", 80]);
  x.nodes[".seek"].value = "500";
  x.nodes[".seek"].fire("input");
  x.nodes[".seek"].fire("change");
  assert.deepEqual(x.calls.pop(), ["seek", 60000]);
  x.nodes[".volume"].value = "25";
  x.nodes[".volume"].fire("input");
  assert.deepEqual(x.calls.pop(), ["volume", 25]);
  x.bound.FINISH();
  assert.match(x.nodes[".player-status"].textContent, /ended/);
  x.bound.ERROR();
  assert.equal(x.nodes[".play-button"].disabled, false);
  assert.match(x.nodes[".player-fallback"].src, /auto_play=false/);
  assert.match(x.nodes[".player-status"].textContent, /backup ready/);
  x.nodes[".play-button"].fire("click");
  assert.match(x.nodes[".player-fallback"].src, /auto_play=true/);
  x = setup();
  x.player.mount(x.host, {
    title: "Early click",
    soundcloudUrl: "https://soundcloud.com/example/track",
  });
  await Promise.resolve();
  assert.equal(x.nodes[".play-button"].disabled, false);
  x.nodes[".play-button"].fire("click");
  assert.match(x.nodes[".player-status"].textContent, /Starting when connected/);
  x.bound.READY();
  assert.deepEqual(x.calls.filter(([name]) => name === "play"), [["play"]]);
  x.bound.PLAY();
  x = setup();
  x.player.mount(x.host, {
    title: "Retry first play",
    soundcloudUrl: "https://soundcloud.com/example/track",
  });
  await Promise.resolve();
  x.bound.READY();
  x.nodes[".play-button"].fire("click");
  x.timers[1]();
  assert.deepEqual(x.calls.filter(([name]) => name === "play"), [
    ["play"],
    ["play"],
  ]);
  x = setup(false);
  x.player.mount(x.host, {
    title: "Blocked",
    soundcloudUrl: "https://soundcloud.com/example/track",
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.match(x.nodes[".player-fallback"].src, /auto_play=false/);
  x.nodes[".play-button"].fire("click");
  assert.match(x.nodes[".player-fallback"].src, /auto_play=true/);
  x = setup();
  x.player.mount(x.host, {
    title: "Timeout",
    soundcloudUrl: "https://soundcloud.com/example/track",
  });
  x.timers[0]();
  assert.equal(x.nodes[".play-button"].disabled, false);
  assert.match(x.nodes[".player-fallback"].src, /auto_play=false/);
  x = setup();
  x.player.mount(x.host, {
    title: "Blocked remote start",
    soundcloudUrl: "https://soundcloud.com/example/track",
  });
  await Promise.resolve();
  x.bound.READY();
  x.nodes[".play-button"].fire("click");
  x.timers[1]();
  x.timers[2]();
  assert.match(x.nodes[".player-status"].textContent, /SoundCloud panel/);
  assert.equal(x.nodes[".player-source"].attrs["aria-hidden"], "false");
  x.bound.PLAY();
  assert.equal(x.nodes[".player-source"].attrs["aria-hidden"], "true");
  assert.equal(x.nodes[".deck-state"].textContent, "PLAYING");
  console.log(
    "PASS: deck controls (skip, mute, remaining time, state chip), iOS handoff, URL safety, time formatting, missing URL, no autoplay, ready, play, pause, progress, seek, volume, finish, errors, blocked API, timeout. Live SoundCloud not simulated.",
  );
})();
