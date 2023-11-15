(function (m, y) {
  typeof exports == "object" && typeof module < "u"
    ? (module.exports = y())
    : typeof define == "function" && define.amd
    ? define(y)
    : ((m = typeof globalThis < "u" ? globalThis : m || self), (m._df = y()));
})(this, function () {
  "use strict";
  var m =
    (globalThis && globalThis.__awaiter) ||
    function (e, t, i, n) {
      function u(c) {
        return c instanceof i
          ? c
          : new i(function (o) {
              o(c);
            });
      }
      return new (i || (i = Promise))(function (c, o) {
        function f(a) {
          try {
            r(n.next(a));
          } catch (h) {
            o(h);
          }
        }
        function d(a) {
          try {
            r(n.throw(a));
          } catch (h) {
            o(h);
          }
        }
        function r(a) {
          a.done ? c(a.value) : u(a.value).then(f, d);
        }
        r((n = n.apply(e, t || [])).next());
      });
    };
  class y {
    constructor({
      batchSize: t,
      timeout: i,
      executeBatch: n,
      setTimeout: u,
      clearTimeout: c,
    }) {
      (this.queue = []),
        (this.batchSize = t),
        (this.timeout = i),
        (this.timeoutHandle = null),
        (this.executeBatch = n),
        (this.setTimeout = u),
        (this.clearTimeout = c);
    }
    submit(t) {
      this.queue.push(t),
        this.queue.length >= this.batchSize
          ? this.flush()
          : this.queue.length === 1 && this.startTimer();
    }
    startTimer() {
      this.timeoutHandle = this.setTimeout(() => this.flush(), this.timeout);
    }
    clearTimer() {
      this.timeoutHandle &&
        (this.clearTimeout(this.timeoutHandle), (this.timeoutHandle = null));
    }
    flush() {
      return m(this, void 0, void 0, function* () {
        if ((this.clearTimer(), this.queue.length === 0)) return;
        const t = this.queue.slice(0, this.batchSize);
        (this.queue = this.queue.slice(this.batchSize)),
          yield this.executeBatch(t);
      });
    }
  }
  var w =
      (globalThis && globalThis.__awaiter) ||
      function (e, t, i, n) {
        function u(c) {
          return c instanceof i
            ? c
            : new i(function (o) {
                o(c);
              });
        }
        return new (i || (i = Promise))(function (c, o) {
          function f(a) {
            try {
              r(n.next(a));
            } catch (h) {
              o(h);
            }
          }
          function d(a) {
            try {
              r(n.throw(a));
            } catch (h) {
              o(h);
            }
          }
          function r(a) {
            a.done ? c(a.value) : u(a.value).then(f, d);
          }
          r((n = n.apply(e, t || [])).next());
        });
      },
    l;
  (function (e) {
    (e.Identify = "identify"),
      (e.Track = "track"),
      (e.Page = "page"),
      (e.Screen = "screen");
  })(l || (l = {}));
  class k {
    constructor({
      issueRequest: t,
      writeKey: i,
      host: n = "https://dittofeed.com",
      uuid: u,
      setTimeout: c,
      clearTimeout: o,
    }) {
      (this.batchQueue = new y({
        timeout: 500,
        batchSize: 5,
        setTimeout: c,
        clearTimeout: o,
        executeBatch: (f) =>
          w(this, void 0, void 0, function* () {
            yield t({ batch: f }, { writeKey: i, host: n });
          }),
      })),
        (this.uuid = u);
    }
    identify(t) {
      var i;
      const n = Object.assign(
        {
          messageId:
            (i = t.messageId) !== null && i !== void 0 ? i : this.uuid(),
          type: l.Identify,
        },
        t
      );
      this.batchQueue.submit(n);
    }
    track(t) {
      var i;
      const n = Object.assign(
        {
          messageId:
            (i = t.messageId) !== null && i !== void 0 ? i : this.uuid(),
          type: l.Track,
        },
        t
      );
      this.batchQueue.submit(n);
    }
    page(t) {
      var i;
      const n = Object.assign(
        {
          messageId:
            (i = t.messageId) !== null && i !== void 0 ? i : this.uuid(),
          type: l.Page,
        },
        t
      );
      this.batchQueue.submit(n);
    }
    screen(t) {
      var i;
      const n = Object.assign(
        {
          messageId:
            (i = t.messageId) !== null && i !== void 0 ? i : this.uuid(),
          type: l.Screen,
        },
        t
      );
      this.batchQueue.submit(n);
    }
    flush() {
      return w(this, void 0, void 0, function* () {
        yield this.batchQueue.flush();
      });
    }
  }
  let g;
  const v = new Uint8Array(16);
  function I() {
    if (
      !g &&
      ((g =
        typeof crypto < "u" &&
        crypto.getRandomValues &&
        crypto.getRandomValues.bind(crypto)),
      !g)
    )
      throw new Error(
        "crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported"
      );
    return g(v);
  }
  const s = [];
  for (let e = 0; e < 256; ++e) s.push((e + 256).toString(16).slice(1));
  function x(e, t = 0) {
    return (
      s[e[t + 0]] +
      s[e[t + 1]] +
      s[e[t + 2]] +
      s[e[t + 3]] +
      "-" +
      s[e[t + 4]] +
      s[e[t + 5]] +
      "-" +
      s[e[t + 6]] +
      s[e[t + 7]] +
      "-" +
      s[e[t + 8]] +
      s[e[t + 9]] +
      "-" +
      s[e[t + 10]] +
      s[e[t + 11]] +
      s[e[t + 12]] +
      s[e[t + 13]] +
      s[e[t + 14]] +
      s[e[t + 15]]
    ).toLowerCase();
  }
  const T = {
    randomUUID:
      typeof crypto < "u" &&
      crypto.randomUUID &&
      crypto.randomUUID.bind(crypto),
  };
  function _(e, t, i) {
    if (T.randomUUID && !t && !e) return T.randomUUID();
    e = e || {};
    const n = e.random || (e.rng || I)();
    if (((n[6] = (n[6] & 15) | 64), (n[8] = (n[8] & 63) | 128), t)) {
      i = i || 0;
      for (let u = 0; u < 16; ++u) t[i + u] = n[u];
      return t;
    }
    return x(n);
  }
  const S = class b {
    static async init(t) {
      if (!b.instance) {
        const i = new k({
          uuid: () => _(),
          issueRequest: async (
            n,
            { host: u = "https://dittofeed.com", writeKey: c }
          ) => {
            const o = `${u}/api/public/apps/batch`,
              d = await fetch(o, {
                method: "POST",
                headers: {
                  authorization: c,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(n),
              });
            if (!d.ok) throw new Error(`HTTP error! status: ${d.status}`);
          },
          setTimeout: (n, u) => window.setTimeout(n, u),
          clearTimeout: (n) => window.clearTimeout(n),
          ...t,
        });
        b.instance = new b(i);
      }
      return b.instance;
    }
    constructor(t) {
      this.baseSdk = t;
    }
    static identify(t) {
      if (this.instance) return this.instance.baseSdk.identify(t);
    }
    static track(t) {
      if (this.instance) return this.instance.baseSdk.track(t);
    }
    static page(t) {
      if (this.instance) return this.instance.baseSdk.page(t);
    }
    static screen(t) {
      if (this.instance) return this.instance.baseSdk.screen(t);
    }
    static flush() {
      if (this.instance) return this.instance.baseSdk.flush();
    }
  };
  S.instance = null;
  let p = S;
  function U() {
    const e = document.getElementById("df-tracker");
    if (!e) return null;
    const t = e.getAttribute("data-write-key");
    return t
      ? { writeKey: t, host: e.getAttribute("data-host") ?? void 0 }
      : null;
  }
  return (
    (async function () {
      const t = U();
      t &&
        (await p.init(t),
        Array.isArray(window._df) &&
          window._df.forEach((i) => {
            if (Array.isArray(i) && i.length > 0) {
              const n = i[0];
              p[n].apply(p, i.slice(1));
            }
          }),
        (window._df = p));
    })(),
    p
  );
});
