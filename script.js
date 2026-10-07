// ============================================================
// WIDGET MONITORA_DG — ENERGIA
// ============================================================

const DEVICE_MONITORA_DG =
    "7e62cc00-c0df-11f1-8ef7-dd61fc2d324e";

let lastAliveMs = null;
let lastPublicationMs = null;
let lastAliveTimer = null;

function setLed(id, active, color) {
    const el = container.querySelector("#" + id);

    if (!el) {
        return;
    }

    el.className = "led " + (Number(active) === 1 ? color : "off");
}

function setText(id, value) {
    const el = container.querySelector("#" + id);

    if (el) {
        el.textContent = value;
    }
}

function formatElapsed(ms) {
    if (!Number.isFinite(ms) || ms < 0) {
        ms = 0;
    }

    let totalSeconds = Math.floor(ms / 1000);

    const days = Math.floor(totalSeconds / 86400);
    totalSeconds %= 86400;

    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }

    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
}

function updateLastAliveDisplay() {
    if (lastAliveMs === null) {
        setText("lastAlive", "desconhecido");
        return;
    }

    const now = Date.now();

    let elapsed = now - lastAliveMs;

    // Menor tempo decorrido entre o último contato e a última publicação.
    if (lastPublicationMs !== null) {
        elapsed = Math.min(elapsed, now - lastPublicationMs);
    }

    setText("lastAlive", formatElapsed(elapsed));
}

function updateLastAlive(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        lastAliveMs = null;
        updateLastAliveDisplay();
        return;
    }

    let timestamp = Number(value);

    if (!Number.isFinite(timestamp)) {
        lastAliveMs = null;
        updateLastAliveDisplay();
        return;
    }

    // last_alive é Epoch em segundos.
    // Se vier em milissegundos, também trata.
    if (timestamp < 10000000000) {
        timestamp *= 1000;
    }

    lastAliveMs = timestamp;
    updateLastAliveDisplay();
}

function formatUptime(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "—";
    }

    let seconds = Number(value);

    if (!Number.isFinite(seconds) || seconds < 0) {
        return "—";
    }

    seconds = Math.floor(seconds);

    const days = Math.floor(seconds / 86400);
    seconds %= 86400;

    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;

    const minutes = Math.floor(seconds / 60);

    if (days > 0) {
        return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}min`;
    }

    if (hours > 0) {
        return `${hours}h ${String(minutes).padStart(2, "0")}min`;
    }

    return `${minutes}min`;
}

function updateDisplay(data) {
    function getValue(key, type) {
        const item = data.find(d =>
            d.dataKey &&
            d.dataKey.name === key &&
            d.dataKey.type === type &&
            d.datasource &&
            d.datasource.entityFilter &&
            d.datasource.entityFilter.singleEntity &&
            d.datasource.entityFilter.singleEntity.id === DEVICE_MONITORA_DG
        );

        if (!item || !item.data || !item.data.length) {
            return null;
        }

        const point = item.data[item.data.length - 1];

        return {
            timestamp: Number(point[0]),
            value: point[1]
        };
    }

    const rede = getValue("rede_disponivel", "timeseries");
    const alimentacaoRede = getValue("alimentacao_rede", "timeseries");
    const offgrid = getValue("alimentacao_offgrid", "timeseries");
    const gerador = getValue("alimentacao_gerador", "timeseries");
    const lastAlive = getValue("last_alive", "attribute");
    const uptime = getValue("uptime_s", "attribute");

    // Timestamp de publicação mais recente entre os dados efetivamente
    // recebidos, usando o timestamp do ThingsBoard em point[0].
    const receivedPoints = [
        rede,
        alimentacaoRede,
        offgrid,
        gerador,
        lastAlive,
        uptime
    ];

    let newestPublicationMs = null;

    receivedPoints.forEach(point => {
        if (point && Number.isFinite(point.timestamp)) {
            if (
                newestPublicationMs === null ||
                point.timestamp > newestPublicationMs
            ) {
                newestPublicationMs = point.timestamp;
            }
        }
    });

    if (newestPublicationMs !== null) {
        lastPublicationMs = newestPublicationMs;
    }

    if (rede) {
        setLed("ledRede", rede.value, "green");
    }

    if (alimentacaoRede) {
        setLed("ledRedeAlim", alimentacaoRede.value, "blue");
    }

    if (offgrid) {
        setLed("ledOffgrid", offgrid.value, "yellow");
    }

    if (gerador) {
        setLed("ledGerador", gerador.value, "red");
    }

    if (lastAlive) {
        updateLastAlive(lastAlive.value);
    }

    if (uptime) {
        setText("uptime", formatUptime(uptime.value));
    }
}

// ============================================================
// SUBSCRIPTION
// ============================================================

const subscriptionOptions = {
    type: "latest",

    datasources: [{
        type: "entity",

        entityFilter: {
            type: "singleEntity",
            singleEntity: {
                entityType: "DEVICE",
                id: DEVICE_MONITORA_DG
            }
        },

        dataKeys: [
            "rede_disponivel",
            "alimentacao_rede",
            "alimentacao_offgrid",
            "alimentacao_gerador"
        ].map(name => ({
            type: "timeseries",
            name,
            settings: {}
        })).concat([
            "last_alive",
            "uptime_s"
        ].map(name => ({
            type: "attribute",
            name,
            settings: {}
        })))
    }],

    callbacks: {
        onDataUpdated: subscription => {
            updateDisplay(subscription.data || []);
        }
    }
};

ctx.subscriptionApi
    .createSubscription(subscriptionOptions, true)
    .subscribe(subscription => {
        ctx.defaultSubscription = subscription;
    });

// ============================================================
// CONTADOR VIVO DE ÚLTIMO CONTATO
// ============================================================

lastAliveTimer = setInterval(
    updateLastAliveDisplay,
    1000
);

// ============================================================
// LIMPEZA
// ============================================================

ctx.registerDestroyCallback(() => {
    if (lastAliveTimer !== null) {
        clearInterval(lastAliveTimer);
        lastAliveTimer = null;
    }
});
