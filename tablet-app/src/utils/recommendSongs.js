const normalize = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const splitTags = (value) =>
  String(value || "")
    .split(/[,;/]+/)
    .map(normalize)
    .filter(Boolean);

const artistText = (song) => {
  const credits = Array.isArray(song?.artists)
    ? song.artists.map((artist) => artist?.name || artist).filter(Boolean)
    : [];
  return [song?.artist, song?.artist_name, ...credits].filter(Boolean).join(", ");
};

const songLanguage = (song) => normalize(song?.language);
const songTitle = (song) => normalize(song?.title);
const songFileUrl = (song) => normalize(song?.file_url || song?.fileUrl || song?.s3_key);
const songKey = (song) => {
  const id = song?.id || song?.song_id;
  return id ? `id:${id}` : `song:${songLanguage(song)}:${songTitle(song)}`;
};

const overlapRatio = (left, right) => {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach((value) => {
    if (right.has(value)) overlap += 1;
  });
  return overlap / Math.max(left.size, right.size);
};

function prepareEntry(entry) {
  const fileUrl = entry.fileUrl || entry.file_url || entry.s3_key || "";
  const subGenre = entry.subGenre || entry.sub_genre || "";
  const artist = entry.artist || entry.artist_name || artistText(entry);
  const parsedBpm = Number(entry.bpm);
  return {
    ...entry,
    fileUrl,
    subGenre,
    artist,
    _language: normalize(entry.language),
    _title: normalize(entry.title),
    _fileUrl: normalize(fileUrl),
    _artist: normalize(artist),
    _album: normalize(entry.album),
    _genre: new Set(splitTags(entry.genre)),
    _subGenre: new Set(splitTags(subGenre)),
    _mood: new Set(splitTags(entry.mood)),
    _bpm: Number.isFinite(parsedBpm) && parsedBpm > 0 ? parsedBpm : null,
  };
}

export function createRecommendationCatalog(entries = []) {
  const byTitle = new Map();
  const byFileUrl = new Map();
  const styleDocumentFrequency = new Map();
  const moodDocumentFrequency = new Map();
  const preparedEntries = entries.map(prepareEntry);

  preparedEntries.forEach((entry) => {
    const titleKey = `${entry._language}\u0000${entry._title}`;
    const fileKey = `${entry._language}\u0000${entry._fileUrl}`;
    if (entry._title) {
      const matches = byTitle.get(titleKey) || [];
      matches.push(entry);
      byTitle.set(titleKey, matches);
    }
    if (entry._fileUrl) byFileUrl.set(fileKey, entry);

    new Set([...entry._genre, ...entry._subGenre]).forEach((tag) => {
      styleDocumentFrequency.set(tag, (styleDocumentFrequency.get(tag) || 0) + 1);
    });
    entry._mood.forEach((tag) => {
      moodDocumentFrequency.set(tag, (moodDocumentFrequency.get(tag) || 0) + 1);
    });
  });

  return {
    byTitle,
    byFileUrl,
    totalEntries: preparedEntries.length,
    styleDocumentFrequency,
    moodDocumentFrequency,
  };
}

function findMetadata(song, catalog) {
  const language = songLanguage(song);
  const fileUrl = songFileUrl(song);
  if (fileUrl) {
    const fileMatch = catalog.byFileUrl.get(`${language}\u0000${fileUrl}`);
    if (fileMatch) return fileMatch;
  }

  const matches = catalog.byTitle.get(`${language}\u0000${songTitle(song)}`) || [];
  if (matches.length <= 1) return matches[0] || null;

  const artist = normalize(artistText(song));
  const album = normalize(song?.album);
  return [...matches].sort((left, right) => {
    const score = (entry) =>
      (artist && entry._artist && (artist.includes(entry._artist) || entry._artist.includes(artist)) ? 2 : 0) +
      (album && album === entry._album ? 1 : 0);
    return score(right) - score(left);
  })[0];
}

function contentSimilarity(candidate, seed, candidateSong, seedSong) {
  if (!candidate || !seed) return 0;
  const genre = overlapRatio(candidate._genre, seed._genre) * 40;
  const subGenre = overlapRatio(candidate._subGenre, seed._subGenre) * 35;
  const mood = overlapRatio(candidate._mood, seed._mood) * 25;
  const candidateArtist = normalize(artistText(candidateSong));
  const seedArtist = normalize(artistText(seedSong));
  const sameArtist = candidateArtist && seedArtist && candidateArtist === seedArtist ? 10 : 0;
  const sameLanguage = songLanguage(candidateSong) === songLanguage(seedSong) ? 4 : 0;
  const bpmDifference = candidate._bpm && seed._bpm ? Math.abs(candidate._bpm - seed._bpm) : null;
  const bpm = bpmDifference === null ? 0 : bpmDifference <= 6 ? 12 : bpmDifference <= 12 ? 8 : bpmDifference <= 20 ? 4 : 0;
  return genre + subGenre + mood + sameArtist + sameLanguage + bpm;
}

const sharesTag = (left, right) => overlapRatio(left, right) > 0;
const GENERIC_STYLE_TAGS = new Set(["pop", "dance pop", "contemporary pop"]);
const isLoveSong = (metadata) => {
  if (!metadata) return false;
  return [...metadata._genre, ...metadata._subGenre, ...metadata._mood]
    .some((tag) => /love|romantic|romance|tender/.test(tag));
};

const inverseDocumentFrequency = (total, frequency) =>
  Math.log((Math.max(total, 1) + 1) / (Math.max(frequency, 0) + 1)) + 1;

function finalizeProfile({
  matchedSongs,
  styleOccurrences,
  moodOccurrences,
  languageOccurrences,
  englishArtistOccurrences,
  bpmTotal,
  bpmCount,
}, catalog) {
  const total = catalog?.totalEntries || 1;
  const weighted = (occurrences, frequencies) => new Map(
    [...occurrences].map(([tag, count]) => {
      const rarity = inverseDocumentFrequency(total, frequencies?.get(tag) || 0);
      const boundedRarity = 1 + Math.min(Math.max(rarity - 1, 0), 3) * 0.25;
      return [tag, count * count * boundedRarity];
    }),
  );
  const styleWeights = weighted(styleOccurrences, catalog?.styleDocumentFrequency);
  const moodWeights = weighted(moodOccurrences, catalog?.moodDocumentFrequency);
  const anchors = [...styleWeights]
    .filter(([tag]) => !GENERIC_STYLE_TAGS.has(tag))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 2)
    .map(([tag]) => tag);
  const dominantLanguages = [...languageOccurrences]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([language]) => language);
  const dominantEnglishArtists = [...englishArtistOccurrences]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

  return {
    matchedSongs,
    styleWeights,
    moodWeights,
    anchors,
    dominantLanguages,
    languageOccurrences,
    dominantEnglishArtists,
    averageBpm: bpmCount > 0 ? bpmTotal / bpmCount : null,
  };
}

function emptyProfileAccumulator() {
  return {
    matchedSongs: 0,
    styleOccurrences: new Map(),
    moodOccurrences: new Map(),
    languageOccurrences: new Map(),
    englishArtistOccurrences: new Map(),
    bpmTotal: 0,
    bpmCount: 0,
  };
}

function addSongToProfile(accumulator, song, metadata) {
  accumulator.matchedSongs += 1;
  const styleTags = new Set([...metadata._genre, ...metadata._subGenre]);
  styleTags.forEach((tag) => {
    accumulator.styleOccurrences.set(tag, (accumulator.styleOccurrences.get(tag) || 0) + 1);
  });
  metadata._mood.forEach((tag) => {
    accumulator.moodOccurrences.set(tag, (accumulator.moodOccurrences.get(tag) || 0) + 1);
  });
  if (metadata._bpm) {
    accumulator.bpmTotal += metadata._bpm;
    accumulator.bpmCount += 1;
  }
  const language = songLanguage(song) || metadata._language;
  if (language) {
    accumulator.languageOccurrences.set(language, (accumulator.languageOccurrences.get(language) || 0) + 1);
  }
  if (language === "english" && metadata._artist) {
    accumulator.englishArtistOccurrences.set(
      metadata._artist,
      (accumulator.englishArtistOccurrences.get(metadata._artist) || 0) + 1,
    );
  }
}

export function buildQueueProfile(queue = [], catalog) {
  const overall = emptyProfileAccumulator();
  const byLanguage = new Map();

  queue.forEach((song) => {
    const metadata = findMetadata(song, catalog);
    if (!metadata) return;
    addSongToProfile(overall, song, metadata);
    const language = songLanguage(song) || metadata._language;
    if (!byLanguage.has(language)) byLanguage.set(language, emptyProfileAccumulator());
    addSongToProfile(byLanguage.get(language), song, metadata);
  });

  const profile = finalizeProfile(overall, catalog);
  profile.byLanguage = new Map(
    [...byLanguage].map(([language, accumulator]) => [
      language,
      finalizeProfile(accumulator, catalog),
    ]),
  );
  return profile;
}

function profileMatch(candidate, profile) {
  if (!candidate || !profile?.matchedSongs) {
    return { score: 0, anchorMatches: [], artistMatches: [], styleMatches: 0, moodMatches: 0 };
  }
  const styles = new Set([...candidate._genre, ...candidate._subGenre]);
  const anchorMatches = profile.anchors.filter((tag) => styles.has(tag));
  let styleMatches = 0;
  let moodMatches = 0;
  let score = 0;
  styles.forEach((tag) => {
    const weight = profile.styleWeights.get(tag) || 0;
    if (weight > 0) {
      styleMatches += 1;
      score += weight * 10;
    }
  });
  candidate._mood.forEach((tag) => {
    const weight = profile.moodWeights.get(tag) || 0;
    if (weight > 0) {
      moodMatches += 1;
      score += weight * 6;
    }
  });
  const artistMatches = candidate._language === "english"
    ? profile.dominantEnglishArtists.filter(([artist]) =>
      candidate._artist === artist || candidate._artist.includes(artist) || artist.includes(candidate._artist))
    : [];
  artistMatches.forEach(([, count]) => {
    score += count * 60;
  });
  if (candidate._bpm && profile.averageBpm) {
    const difference = Math.abs(candidate._bpm - profile.averageBpm);
    score += difference <= 6 ? 12 : difference <= 12 ? 8 : difference <= 20 ? 4 : 0;
  }
  return { score, anchorMatches, artistMatches, styleMatches, moodMatches };
}

function selectBalancedRecommendations(ranked, anchors, limit) {
  if (anchors.length < 2) return ranked.slice(0, limit);
  const selected = [];
  const selectedKeys = new Set();

  while (selected.length < limit) {
    let added = false;
    anchors.forEach((anchor) => {
      if (selected.length >= limit) return;
      const match = ranked.find((entry) =>
        !selectedKeys.has(songKey(entry.song)) && entry.anchorMatches.includes(anchor));
      if (match) {
        selected.push(match);
        selectedKeys.add(songKey(match.song));
        added = true;
      }
    });
    if (!added) break;
  }

  ranked.forEach((entry) => {
    if (selected.length < limit && !selectedKeys.has(songKey(entry.song))) {
      selected.push(entry);
      selectedKeys.add(songKey(entry.song));
    }
  });
  return selected.slice(0, limit);
}

function allocateLanguageQuotas(profile, limit) {
  const counts = [...(profile?.languageOccurrences || [])];
  const total = counts.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return new Map();
  const allocations = counts.map(([language, count]) => {
    const exact = count / total * limit;
    return { language, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let assigned = allocations.reduce((sum, allocation) => sum + allocation.count, 0);
  allocations
    .sort((left, right) => right.remainder - left.remainder || right.count - left.count)
    .forEach((allocation) => {
      if (assigned < limit) {
        allocation.count += 1;
        assigned += 1;
      }
    });
  return new Map(allocations.map(({ language, count }) => [language, count]));
}

function selectLanguageBalancedRecommendations(ranked, profile, limit, enforcedLanguage) {
  if (enforcedLanguage) return ranked.slice(0, limit);
  const quotas = allocateLanguageQuotas(profile, limit);
  if (!quotas.size) return selectBalancedRecommendations(ranked, profile.anchors, limit);

  const selected = [];
  const selectedKeys = new Set();
  profile.dominantLanguages.forEach((language) => {
    const quota = quotas.get(language) || 0;
    ranked
      .filter((entry) => songLanguage(entry.song) === language)
      .slice(0, quota)
      .forEach((entry) => {
        selected.push(entry);
        selectedKeys.add(songKey(entry.song));
      });
  });
  ranked.forEach((entry) => {
    if (selected.length < limit && !selectedKeys.has(songKey(entry.song))) {
      selected.push(entry);
      selectedKeys.add(songKey(entry.song));
    }
  });
  return selected.slice(0, limit);
}

const compactSong = (song) => ({
  id: song?.id || song?.song_id || null,
  song_id: song?.song_id || song?.id || null,
  title: song?.title || "",
  artist: song?.artist || song?.artist_name || artistText(song),
  album: song?.album || "",
  language: song?.language || "",
  file_url: song?.file_url || song?.fileUrl || song?.s3_key || "",
});

export function createInitialRecommendationSession() {
  return {
    rotation: 0,
    activeLanguage: "",
    languageOrder: [],
    selections: [],
    selectedKeys: [],
    lastShownAt: {},
  };
}

export function advanceRecommendationSession(current, selectedSong, shownSongs = []) {
  const state = current || createInitialRecommendationSession();
  const nextRotation = Number(state.rotation || 0) + 1;
  const selected = compactSong(selectedSong);
  const selectedLanguage = String(selected.language || "").trim();
  const selectedLanguageKey = normalize(selectedLanguage);
  const languageOrder = [...(state.languageOrder || [])];
  if (selectedLanguageKey && !languageOrder.some((value) => normalize(value) === selectedLanguageKey)) {
    languageOrder.push(selectedLanguage);
  }

  const lastShownAt = { ...(state.lastShownAt || {}) };
  shownSongs.forEach((song) => {
    if (songKey(song) !== songKey(selectedSong)) lastShownAt[songKey(song)] = Number(state.rotation || 0);
  });

  const cutoff = nextRotation - 12;
  Object.entries(lastShownAt).forEach(([key, rotation]) => {
    if (Number(rotation) < cutoff) delete lastShownAt[key];
  });

  return {
    rotation: nextRotation,
    activeLanguage: selectedLanguage || state.activeLanguage || "",
    languageOrder,
    selections: [...(state.selections || []), selected].slice(-24),
    selectedKeys: [...new Set([...(state.selectedKeys || []), songKey(selectedSong)])].slice(-250),
    lastShownAt,
  };
}

function recommendationTier(candidate, seed, candidateSong, preferredLanguage, firstLanguages) {
  const language = songLanguage(candidateSong);
  const currentLanguage = preferredLanguage && language === preferredLanguage;
  const genreMatch = seed ? sharesTag(candidate._genre, seed._genre) : false;
  const subGenreMatch = seed ? sharesTag(candidate._subGenre, seed._subGenre) : false;
  const moodMatch = seed ? sharesTag(candidate._mood, seed._mood) : false;
  const hasTwoLanguageJourney = firstLanguages.length >= 2;

  if (currentLanguage && subGenreMatch && moodMatch) return 0;
  if (currentLanguage && genreMatch && moodMatch) return 1;
  if (currentLanguage && (subGenreMatch || genreMatch)) return 2;
  if (currentLanguage && moodMatch) return 3;
  if (hasTwoLanguageJourney && firstLanguages.includes(language) && isLoveSong(candidate)) return 4;
  if (currentLanguage) return 5;
  if (subGenreMatch && moodMatch) return 6;
  if (genreMatch || moodMatch) return 7;
  return 8;
}

export function recommendSongs({
  songs = [],
  queue = [],
  language = "all",
  catalog,
  session = createInitialRecommendationSession(),
  limit = 4,
}) {
  if (!catalog || !Array.isArray(songs) || songs.length === 0 || limit <= 0) return [];

  const queuedIds = new Set(queue.map((song) => String(song.song_id || song.id || "")));
  const queuedKeys = new Set(queue.map((song) => `${songLanguage(song)}\u0000${songTitle(song)}`));
  const selectedKeys = new Set(session.selectedKeys || []);
  const explicitLanguage = normalize(language === "all" ? "" : language);
  const latestSelection = session.selections?.at(-1) || queue.at(-1) || null;
  const preferredLanguage = explicitLanguage || normalize(session.activeLanguage) || songLanguage(latestSelection);
  const seedMetadata = latestSelection ? findMetadata(latestSelection, catalog) : null;
  const firstLanguages = (session.languageOrder || []).slice(0, 2).map(normalize).filter(Boolean);
  const rotation = Number(session.rotation || 0);
  const profileSongs = queue.length > 0 ? queue : (session.selections || []);
  const queueProfile = buildQueueProfile(profileSongs, catalog);
  const enforcedLanguage = explicitLanguage || (queue.length === 0 ? normalize(session.activeLanguage) : "");
  const candidateSongs = enforcedLanguage
    ? songs.filter((song) => songLanguage(song) === enforcedLanguage)
    : songs;

  const ranked = candidateSongs
    .filter((song) => {
      const id = String(song.id || song.song_id || "");
      const lastShownAt = session.lastShownAt?.[songKey(song)];
      const inCooldown = Number.isFinite(Number(lastShownAt)) && rotation - Number(lastShownAt) <= 5;
      return !queuedIds.has(id) &&
        !queuedKeys.has(`${songLanguage(song)}\u0000${songTitle(song)}`) &&
        !selectedKeys.has(songKey(song)) &&
        !inCooldown;
    })
    .map((song) => {
      const metadata = findMetadata(song, catalog);
      const languageProfile = queueProfile.byLanguage?.get(songLanguage(song)) || queueProfile;
      const profile = profileMatch(metadata, languageProfile);
      const fallbackTier = metadata
        ? recommendationTier(metadata, seedMetadata, song, preferredLanguage, firstLanguages)
        : (preferredLanguage && songLanguage(song) === preferredLanguage ? 5 : 8);
      const tier = queueProfile.matchedSongs
        ? (profile.artistMatches.length > 0 && (profile.styleMatches > 0 || profile.moodMatches > 0) ? -1 : profile.anchorMatches.length > 0 ? 0 : profile.styleMatches > 0 && profile.moodMatches > 0 ? 1 : profile.styleMatches > 0 ? 2 : profile.moodMatches > 0 ? 3 : fallbackTier + 4)
        : fallbackTier;
      const latestSelectionWeight = queueProfile.matchedSongs > 1 ? 0.15 : 1;
      const contentScore = contentSimilarity(metadata, seedMetadata, song, latestSelection) * latestSelectionWeight;
      const metadataScore = metadata ? 2 : 0;
      return {
        song,
        tier,
        anchorMatches: profile.anchorMatches,
        score: profile.score + contentScore + metadataScore,
      };
    })
    .sort((left, right) =>
      left.tier - right.tier ||
      Number(right.song.play_count || 0) - Number(left.song.play_count || 0) ||
      right.score - left.score ||
      String(left.song.title || "").localeCompare(String(right.song.title || ""))
    );

  return selectLanguageBalancedRecommendations(
    ranked,
    queueProfile,
    limit,
    enforcedLanguage,
  ).map(({ song }) => song);
}
