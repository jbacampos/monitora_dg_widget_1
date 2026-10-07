// ============================================================
// HARNESS DE TESTE (Node) — não faz parte do widget.
// Carrega script.js em sandbox com globais simulados e valida
// o cálculo de "Atualizado há" (menor tempo entre last_alive e
// última publicação).
// ============================================================

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const scriptSrc = fs.readFileSync(
    path.join(__dirname, "script.js"),
    "utf8"
);

const ID = "7e62cc00-c0df-11f1-8ef7-dd61fc2d324e";

function item(name, type, ts, value) {
    return {
        dataKey: { name, type },
        datasource: {
            entityFilter: { singleEntity: { id: ID } }
        },
        data: [[ts, value]]
    };
}

// Constrói o ambiente simulando container/ctx/Date/setInterval.
function createEnv(startNow) {
    const clock = { now: startNow };

    // Estado inicial dos elementos, conforme index.html.
    const elements = {
        lastAlive: { id: "lastAlive", textContent: "desconhecido", className: "info-value" },
        uptime: { id: "uptime", textContent: "—", className: "info-value" },
        ledRede: { id: "ledRede", textContent: null, className: "led off" },
        ledRedeAlim: { id: "ledRedeAlim", textContent: null, className: "led off" },
        ledOffgrid: { id: "ledOffgrid", textContent: null, className: "led off" },
        ledGerador: { id: "ledGerador", textContent: null, className: "led off" }
    };

    const container = {
        querySelector(sel) {
            const id = sel.replace("#", "");
            if (!elements[id]) {
                elements[id] = { id, textContent: null, className: "" };
            }
            return elements[id];
        }
    };

    let onDataUpdated = null;
    let createCount = 0;
    let intervalCallback = null;

    const ctx = {
        subscriptionApi: {
            createSubscription(options) {
                createCount++;
                onDataUpdated = options.callbacks.onDataUpdated;
                return {
                    subscribe(fn) {
                        fn({ id: "test-subscription" });
                        return { unsubscribe() {} };
                    }
                };
            }
        },
        registerDestroyCallback(fn) {
            ctx._destroyCallback = fn;
        }
    };

    const sandbox = {
        container,
        ctx,
        Date: { now: () => clock.now },
        setInterval: fn => {
            intervalCallback = fn;
            return 1;
        },
        clearInterval: () => {},
        console
    };

    vm.createContext(sandbox);
    vm.runInContext(scriptSrc, sandbox, { filename: "script.js" });

    return {
        lastAliveText: () =>
            elements.lastAlive ? elements.lastAlive.textContent : undefined,
        uptimeText: () =>
            elements.uptime ? elements.uptime.textContent : undefined,
        ledClass: id => (elements[id] || {}).className,
        fire: data => onDataUpdated({ data }),
        tick: newNow => {
            clock.now = newNow;
            if (intervalCallback) {
                intervalCallback();
            }
        },
        createCount: () => createCount
    };
}

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
    const ok = actual === expected;
    if (ok) {
        passed++;
        console.log(`PASS  ${label}  =>  "${actual}"`);
    } else {
        failed++;
        console.log(
            `FAIL  ${label}  =>  obtido "${actual}" | esperado "${expected}"`
        );
    }
}

// ---- Base ----
const BASE = 1700000000000; // ms

// Teste 1 — last_alive e última publicação com timestamps iguais.
{
    const now = BASE + 17000;
    const env = createEnv(now);
    env.fire([
        item("rede_disponivel", "timeseries", BASE, "1"),
        item("alimentacao_rede", "timeseries", BASE, "1"),
        item("alimentacao_offgrid", "timeseries", BASE, "0"),
        item("alimentacao_gerador", "timeseries", BASE, "0"),
        item("last_alive", "attribute", BASE, BASE / 1000),
        item("uptime_s", "attribute", BASE, "8345")
    ]);
    check("1) timestamps iguais", env.lastAliveText(), "17s");
}

// Teste 2 — last_alive mais antigo que a última publicação.
{
    const now = BASE + 5000;
    const env = createEnv(now);
    const aliveSec = BASE / 1000 - 100;
    env.fire([
        item("rede_disponivel", "timeseries", BASE, "1"),
        item("alimentacao_rede", "timeseries", BASE, "1"),
        item("alimentacao_offgrid", "timeseries", BASE, "0"),
        item("alimentacao_gerador", "timeseries", BASE, "0"),
        item("last_alive", "attribute", BASE - 100000, aliveSec),
        item("uptime_s", "attribute", BASE, "8345")
    ]);
    check("2) last_alive mais antigo", env.lastAliveText(), "5s");
}

// Teste 3 — última publicação mais antiga que last_alive.
{
    const now = BASE + 3000;
    const env = createEnv(now);
    const oldTs = BASE - 200000;
    env.fire([
        item("rede_disponivel", "timeseries", oldTs, "1"),
        item("alimentacao_rede", "timeseries", oldTs, "1"),
        item("alimentacao_offgrid", "timeseries", oldTs, "0"),
        item("alimentacao_gerador", "timeseries", oldTs, "0"),
        item("last_alive", "attribute", BASE, BASE / 1000),
        item("uptime_s", "attribute", oldTs, "8345")
    ]);
    check("3) publicação mais antiga", env.lastAliveText(), "3s");
}

// Teste 4 — contador avançando segundo a segundo + sem novas consultas.
{
    const now = BASE + 17000;
    const env = createEnv(now);
    env.fire([
        item("rede_disponivel", "timeseries", BASE, "1"),
        item("last_alive", "attribute", BASE, BASE / 1000)
    ]);
    const before = env.lastAliveText();
    env.tick(now + 1000);
    const after1 = env.lastAliveText();
    env.tick(now + 2000);
    const after2 = env.lastAliveText();
    env.tick(now + 3000);
    const after3 = env.lastAliveText();

    check("4) contador t+0", before, "17s");
    check("4) contador t+1", after1, "18s");
    check("4) contador t+2", after2, "19s");
    check("4) contador t+3", after3, "20s");
    check("4) createSubscription chamado 1x", env.createCount(), 1);
}

// Teste 5 — ausência de last_alive => desconhecido.
{
    const now = BASE + 1000;
    const env = createEnv(now);
    env.fire([
        item("rede_disponivel", "timeseries", BASE, "1"),
        item("uptime_s", "attribute", BASE, "8345")
    ]);
    check("5) sem last_alive", env.lastAliveText(), "desconhecido");

    const env2 = createEnv(now);
    env2.fire([
        item("last_alive", "attribute", BASE, ""),
        item("uptime_s", "attribute", BASE, "8345")
    ]);
    check("5) last_alive vazio", env2.lastAliveText(), "desconhecido");
}

// Teste 6 — sem novas consultas ao ThingsBoard por segundo.
{
    const now = BASE + 17000;
    const env = createEnv(now);
    env.fire([item("last_alive", "attribute", BASE, BASE / 1000)]);
    for (let i = 1; i <= 5; i++) {
        env.tick(now + i * 1000);
    }
    check("6) sem novas consultas em 5s", env.createCount(), 1);
}

// Teste 7 — formato com dias: 1d 6h 14m 7s.
{
    const elapsedMs = 108847000; // 1d 6h 14m 7s
    const now = BASE;
    const env = createEnv(now);
    env.fire([
        item("last_alive", "attribute", now - elapsedMs,
            (now - elapsedMs) / 1000),
        item("rede_disponivel", "timeseries", now - 200000000, "1")
    ]);
    check("7) formato 1d 6h 14m 7s", env.lastAliveText(), "1d 6h 14m 7s");
}

// Teste 8 — lastPublicationMs indisponível => usar somente last_alive.
{
    const now = BASE + 42000;
    const env = createEnv(now);
    // timestamp inválido em point[0] (somente last_alive presente).
    env.fire([item("last_alive", "attribute", "x", BASE / 1000)]);
    check("8) sem publication, só last_alive", env.lastAliveText(), "42s");
}

// Teste 9 — LEDs inalterados (sanidade).
{
    const now = BASE;
    const env = createEnv(now);
    env.fire([
        item("rede_disponivel", "timeseries", BASE, "1"),
        item("alimentacao_rede", "timeseries", BASE, "1"),
        item("alimentacao_offgrid", "timeseries", BASE, "0"),
        item("alimentacao_gerador", "timeseries", BASE, "0")
    ]);
    check("9) led rede verde", env.ledClass("ledRede"), "led green");
    check("9) led offgrid off", env.ledClass("ledOffgrid"), "led off");
    check("9) uptime inalterado", env.uptimeText(), "—");
}

console.log("");
console.log(`Resumo: ${passed} passaram, ${failed} falharam.`);
process.exit(failed === 0 ? 0 : 1);
