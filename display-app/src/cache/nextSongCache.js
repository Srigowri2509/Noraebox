import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Http } from "@capacitor-community/http";
import { isCacheEnabled } from "../utils/device";
import { fetchSongWithUrl } from "../utils/fetchSongWithUrl";

const MEDIA_ROOT = "norebox-next";
const SONGS_DIR = "norebox-next/songs";
const PROBE_REL_PATH = "norebox-next/probe-test.bin";
const PROBE_TEST_URL = "https://httpbin.org/bytes/256";

/** @type {{ targetSongId: string|null, token: number, status: string, downloadCompleteTimestamp: number|null, songEndedTimestamp: number|null }} */
const state = {
  targetSongId: null,
  token: 0,
  status: "idle",
  downloadCompleteTimestamp: null,
  songEndedTimestamp: null,
};

/** @type {Promise<{ ok: boolean, detail: Record<string, unknown> }>|null} */
let probePromise = null;

function songRelPath(songId) {
  return `${SONGS_DIR}/${songId}.mp4`;
}

function urlHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function parseS3Expiry(url) {
  try {
    const u = new URL(url);
    const amzDate = u.searchParams.get("X-Amz-Date");
    const expiresSec = u.searchParams.get("X-Amz-Expires");
    if (!amzDate || !expiresSec) return null;
    const iso = amzDate.replace(
      /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/,
      "$1-$2-$3T$4:$5:$6Z"
    );
    const signedAtMs = Date.parse(iso);
    if (!Number.isFinite(signedAtMs)) return null;
    const expiryMs = signedAtMs + Number(expiresSec) * 1000;
    return {
      signedAt: iso,
      expiresAt: new Date(expiryMs).toISOString(),
      expiresInSec: Math.round((expiryMs - Date.now()) / 1000),
    };
  } catch {
    return null;
  }
}

function safeJson(value) {
  try {
    return JSON.stringify(value, (_key, v) => {
      if (v instanceof Error) {
        return {
          name: v.name,
          message: v.message,
          stack: v.stack,
          ...(v.code != null ? { code: v.code } : {}),
          ...(v.errorMessage != null ? { errorMessage: v.errorMessage } : {}),
        };
      }
      return v;
    });
  } catch {
    return String(value);
  }
}

function serializeError(err) {
  if (err == null) return { message: "unknown" };
  const base = {
    message: err.message || err.errorMessage || String(err),
    code: err.code ?? err.errorCode ?? err.status ?? null,
    stack: err.stack ?? null,
    name: err.name ?? null,
    raw: safeJson(err),
  };
  if (err.data != null) base.pluginData = err.data;
  if (err.response != null) {
    base.pluginResponse = {
      status: err.response.status ?? err.response.statusCode ?? null,
      data: err.response.data ?? null,
      headers: err.response.headers ?? null,
    };
  }
  if (err.status != null && base.code == null) base.code = err.status;
  if (err.headers != null) base.headers = err.headers;
  return base;
}

function logCache(label, payload) {
  console.log(`[CACHE] ${label} ${safeJson(payload)}`);
}

async function logDestinationPath(relPath) {
  const info = {
    relPath,
    directory: Directory.Data,
    directoryValue: String(Directory.Data),
  };
  try {
    const { uri } = await Filesystem.getUri({
      directory: Directory.Data,
      path: relPath,
    });
    info.uri = uri;
    info.converted = Capacitor.convertFileSrc(uri);
  } catch (err) {
    info.getUriError = serializeError(err);
  }
  try {
    info.stat = await Filesystem.stat({ path: relPath, directory: Directory.Data });
  } catch (err) {
    info.stat = { exists: false, error: serializeError(err) };
  }
  logCache("destination", info);
  return info;
}

async function probeSignedUrl(url) {
  const host = urlHost(url);
  const expiry = parseS3Expiry(url);
  const head = { urlHost: host, expiry };
  try {
    const res = await Http.request({
      url,
      method: "HEAD",
      params: {},
      headers: {},
      connectTimeout: 15000,
      readTimeout: 15000,
    });
    head.status = res?.status ?? null;
    head.contentLength =
      res?.headers?.["content-length"] ??
      res?.headers?.["Content-Length"] ??
      null;
    head.headers = res?.headers ?? null;
  } catch (err) {
    head.headError = serializeError(err);
    try {
      const res = await Http.request({
        url,
        method: "GET",
        params: {},
        headers: { Range: "bytes=0-0" },
        connectTimeout: 15000,
        readTimeout: 15000,
        responseType: "text",
      });
      head.fallbackGetStatus = res?.status ?? null;
      head.contentLength =
        res?.headers?.["content-length"] ??
        res?.headers?.["Content-Length"] ??
        null;
      head.headers = res?.headers ?? null;
    } catch (getErr) {
      head.fallbackGetError = serializeError(getErr);
    }
  }
  logCache("signed_url_probe", head);
  return head;
}

async function runDownloaderProbe() {
  const started = Date.now();
  const detail = {
    testUrl: PROBE_TEST_URL,
    testUrlHost: urlHost(PROBE_TEST_URL),
    filePath: PROBE_REL_PATH,
    fileDirectory: Directory.Data,
    fileDirectoryValue: String(Directory.Data),
  };
  try {
    await deleteFileIfExists(PROBE_REL_PATH);
    await logDestinationPath(PROBE_REL_PATH);
    const result = await Http.downloadFile({
      url: PROBE_TEST_URL,
      filePath: PROBE_REL_PATH,
      fileDirectory: Directory.Data,
      method: "GET",
      params: {},
      headers: {},
    });
    detail.pluginResult = result ?? null;
    const stat = await Filesystem.stat({
      path: PROBE_REL_PATH,
      directory: Directory.Data,
    });
    detail.stat = stat;
    detail.durationMs = Date.now() - started;
    detail.ok = Boolean(stat?.size && stat.size > 0);
    logCache("probe", { ok: detail.ok, ...detail });
    return { ok: detail.ok, detail };
  } catch (err) {
    detail.durationMs = Date.now() - started;
    detail.error = serializeError(err);
    detail.ok = false;
    logCache("probe", detail);
    return { ok: false, detail };
  }
}

function getDownloaderProbe() {
  if (!probePromise) {
    probePromise = runDownloaderProbe();
  }
  return probePromise;
}

async function deleteFileIfExists(relPath) {
  try {
    await Filesystem.deleteFile({ path: relPath, directory: Directory.Data });
  } catch {
    /* ignore */
  }
}

async function wipeAllSongFiles() {
  try {
    const listing = await Filesystem.readdir({ path: SONGS_DIR, directory: Directory.Data });
    for (const f of listing.files || []) {
      if (f.type === "file" && f.name.endsWith(".mp4")) {
        await deleteFileIfExists(`${SONGS_DIR}/${f.name}`);
      }
    }
  } catch {
    /* dir may not exist */
  }
}

export async function initNextSongCache() {
  if (!isCacheEnabled()) return;
  try {
    await Filesystem.mkdir({
      path: MEDIA_ROOT,
      directory: Directory.Data,
      recursive: true,
    });
    await Filesystem.mkdir({
      path: SONGS_DIR,
      directory: Directory.Data,
      recursive: true,
    });
  } catch {
    /* already exists */
  }
  void getDownloaderProbe();
}

export async function ensureNext(songId) {
  if (!isCacheEnabled() || songId == null || songId === "") return;
  const id = String(songId);

  if (state.status === "ready" && state.targetSongId === id) {
    return;
  }
  if (state.status === "downloading" && state.targetSongId === id) return;

  state.targetSongId = id;
  const myToken = ++state.token;
  state.status = "downloading";
  state.downloadCompleteTimestamp = null;
  console.log("[CACHE] download start", id);

  const relPath = songRelPath(id);
  let remote = null;
  let downloadErrorLogged = false;

  try {
    const probe = await getDownloaderProbe();
    logCache("probe_before_download", {
      songId: id,
      probeOk: probe.ok,
      probeDetail: probe.detail,
    });

    remote = await fetchSongWithUrl(id);
    if (!remote?.videoUrl) {
      throw new Error("no video URL");
    }
    if (myToken !== state.token) {
      console.log("[CACHE] stale download ignored", id);
      return;
    }

    const url = remote.videoUrl;
    await logDestinationPath(relPath);
    await probeSignedUrl(url);

    await deleteFileIfExists(relPath);

    let pluginResult = null;
    try {
      pluginResult = await Http.downloadFile({
        url,
        filePath: relPath,
        fileDirectory: Directory.Data,
        method: "GET",
        params: {},
        headers: {},
      });
    } catch (downloadErr) {
      downloadErrorLogged = true;
      logCache("download failed", {
        songId: id,
        message: downloadErr?.message || downloadErr?.errorMessage || String(downloadErr),
        code:
          downloadErr?.code ??
          downloadErr?.errorCode ??
          downloadErr?.status ??
          downloadErr?.response?.status ??
          null,
        stack: downloadErr?.stack ?? null,
        raw: safeJson(downloadErr),
        pluginResponse: downloadErr?.response ?? downloadErr?.data ?? null,
        statusCode:
          downloadErr?.status ??
          downloadErr?.response?.status ??
          downloadErr?.response?.statusCode ??
          null,
        path: relPath,
        directory: Directory.Data,
        urlHost: urlHost(url),
        expiry: parseS3Expiry(url),
        pluginResult,
      });
      throw downloadErr;
    }

    logCache("download plugin ok", {
      songId: id,
      path: relPath,
      urlHost: urlHost(url),
      pluginResult: pluginResult ?? null,
    });

    if (myToken !== state.token) {
      await deleteFileIfExists(relPath);
      console.log("[CACHE] stale download ignored", id, "expected", state.targetSongId);
      return;
    }

    const stat = await Filesystem.stat({ path: relPath, directory: Directory.Data });
    if (!stat?.size || stat.size < 1000) {
      throw new Error(`file too small (${stat?.size ?? 0} bytes)`);
    }

    state.status = "ready";
    state.downloadCompleteTimestamp = Date.now();
    console.log("[CACHE] download complete", id, state.downloadCompleteTimestamp);
  } catch (err) {
    if (myToken !== state.token) {
      console.log("[CACHE] stale download ignored", id);
      return;
    }
    state.status = "idle";
    if (!downloadErrorLogged) {
      logCache("download failed", {
        songId: id,
        message: err?.message || err?.errorMessage || String(err),
        code: err?.code ?? err?.errorCode ?? err?.status ?? null,
        stack: err?.stack ?? null,
        raw: safeJson(err),
        pluginResponse: err?.response ?? err?.data ?? null,
        statusCode: err?.status ?? err?.response?.status ?? null,
        path: relPath,
        directory: Directory.Data,
        urlHost: remote?.videoUrl ? urlHost(remote.videoUrl) : null,
        expiry: remote?.videoUrl ? parseS3Expiry(remote.videoUrl) : null,
      });
    }
  }
}

export async function getLocalUrl(songId) {
  if (!isCacheEnabled() || songId == null || songId === "") return null;
  const id = String(songId);
  console.log("[CACHE] lookup", id);

  if (state.status !== "ready" || state.targetSongId !== id) {
    console.log("[CACHE] local_missing", id, {
      reason: "state_gate",
      status: state.status,
      targetSongId: state.targetSongId,
    });
    return null;
  }

  const relPath = songRelPath(id);
  try {
    const stat = await Filesystem.stat({ path: relPath, directory: Directory.Data });
    if (!stat?.size || stat.size < 1000) {
      console.log("[CACHE] local_missing", id, {
        reason: "file_stat",
        size: stat?.size ?? 0,
      });
      return null;
    }
    const { uri } = await Filesystem.getUri({
      directory: Directory.Data,
      path: relPath,
    });
    const localUrl = Capacitor.convertFileSrc(uri);
    console.log("[CACHE] local_found", id);
    console.log("[CACHE] local_url", id, localUrl);
    return localUrl;
  } catch (err) {
    console.log("[CACHE] local_missing", id, {
      reason: "filesystem_error",
      message: err?.message || String(err),
    });
    return null;
  }
}

export function logReadyBeforeSongEnd(expectedSongId) {
  if (!isCacheEnabled()) return;
  state.songEndedTimestamp = Date.now();
  const expected = expectedSongId != null ? String(expectedSongId) : null;
  const ready =
    expected != null && state.status === "ready" && state.targetSongId === expected;
  const leadMs =
    ready && state.downloadCompleteTimestamp != null
      ? state.songEndedTimestamp - state.downloadCompleteTimestamp
      : null;
  console.log(
    `[CACHE] ready_before_song_end=${ready}`,
    {
      expectedSongId: expected,
      targetSongId: state.targetSongId,
      downloadCompleteTimestamp: state.downloadCompleteTimestamp,
      songEndedTimestamp: state.songEndedTimestamp,
      leadMs,
    }
  );
}

export async function onSongStarted(songId) {
  if (!isCacheEnabled()) return;
  const keepId = songId != null ? String(songId) : null;
  state.token += 1;
  state.targetSongId = null;
  state.status = "idle";
  state.downloadCompleteTimestamp = null;
  // Keep the file for the song now playing — WebView may still read it.
  try {
    const listing = await Filesystem.readdir({ path: SONGS_DIR, directory: Directory.Data });
    for (const f of listing.files || []) {
      if (f.type !== "file" || !f.name.endsWith(".mp4")) continue;
      if (keepId && f.name === `${keepId}.mp4`) continue;
      await deleteFileIfExists(`${SONGS_DIR}/${f.name}`);
    }
  } catch {
    /* ignore */
  }
}

export async function clear(reason = "unknown") {
  if (!isCacheEnabled()) return;
  state.token += 1;
  state.targetSongId = null;
  state.status = "idle";
  state.downloadCompleteTimestamp = null;
  state.songEndedTimestamp = null;
  await wipeAllSongFiles();
  console.log("[CACHE] clear reason=" + reason);
}
