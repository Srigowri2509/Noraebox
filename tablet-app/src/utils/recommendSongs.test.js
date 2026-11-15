import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceRecommendationSession,
  createInitialRecommendationSession,
  createRecommendationCatalog,
  recommendSongs,
} from "./recommendSongs.js";

const metadata = [
  { title: "Seed", artist: "A", language: "English", fileUrl: "seed", genre: "Pop", subGenre: "Dance Pop", mood: "Happy, Energetic" },
  { title: "Similar", artist: "B", language: "English", fileUrl: "similar", genre: "Pop", subGenre: "Dance Pop", mood: "Happy, Energetic" },
  { title: "Different", artist: "C", language: "English", fileUrl: "different", genre: "Rock", subGenre: "Hard Rock", mood: "Angry" },
  { title: "Hindi Match", artist: "D", language: "Hindi", fileUrl: "hindi", genre: "Pop", subGenre: "Dance Pop", mood: "Happy" },
];

const catalog = createRecommendationCatalog(metadata);

test("uses genre, sub-genre and mood from queued songs", () => {
  const songs = [
    { id: 2, title: "Similar", artist: "B", language: "English", file_url: "similar", play_count: 1 },
    { id: 3, title: "Different", artist: "C", language: "English", file_url: "different", play_count: 1000 },
  ];
  const result = recommendSongs({
    songs,
    queue: [{ song_id: 1, title: "Seed", artist: "A", language: "English", file_url: "seed" }],
    language: "all",
    catalog,
    limit: 2,
  });
  assert.equal(result[0].title, "Similar");
});

test("excludes songs already queued", () => {
  const songs = [
    { id: 1, title: "Seed", artist: "A", language: "English", file_url: "seed" },
    { id: 2, title: "Similar", artist: "B", language: "English", file_url: "similar" },
  ];
  const result = recommendSongs({
    songs,
    queue: [{ song_id: 1, title: "Seed", artist: "A", language: "English", file_url: "seed" }],
    catalog,
  });
  assert.deepEqual(result.map((song) => song.id), [2]);
});

test("honors the tablet language preference", () => {
  const songs = [
    { id: 2, title: "Similar", artist: "B", language: "English", file_url: "similar" },
    { id: 4, title: "Hindi Match", artist: "D", language: "Hindi", file_url: "hindi" },
  ];
  const result = recommendSongs({ songs, queue: [], language: "Hindi", catalog, limit: 2 });
  assert.equal(result[0].title, "Hindi Match");
});

test("falls back to play count when no catalog metadata matches", () => {
  const songs = [
    { id: 5, title: "Unknown Low", language: "English", play_count: 2 },
    { id: 6, title: "Unknown High", language: "English", play_count: 20 },
  ];
  const result = recommendSongs({ songs, queue: [], catalog, limit: 2 });
  assert.equal(result[0].title, "Unknown High");
});

test("prioritizes play count within the best matching recommendation tier", () => {
  const popularityMetadata = [
    { title: "Queue Song", artist: "A", language: "English", fileUrl: "queue-song", genre: "Pop", subGenre: "Dance Pop", mood: "Happy, Energetic" },
    { title: "Popular Match", artist: "B", language: "English", fileUrl: "popular-match", genre: "Pop", subGenre: "Dance Pop", mood: "Happy, Energetic" },
    { title: "Less Played Match", artist: "C", language: "English", fileUrl: "less-played-match", genre: "Pop", subGenre: "Dance Pop", mood: "Happy, Energetic" },
  ];
  const popularityCatalog = createRecommendationCatalog(popularityMetadata);
  const songs = [
    { id: 2, title: "Less Played Match", artist: "C", language: "English", file_url: "less-played-match", play_count: 3 },
    { id: 3, title: "Popular Match", artist: "B", language: "English", file_url: "popular-match", play_count: 26 },
  ];
  const result = recommendSongs({
    songs,
    queue: [{ song_id: 1, title: "Queue Song", artist: "A", language: "English", file_url: "queue-song" }],
    catalog: popularityCatalog,
    limit: 2,
  });
  assert.deepEqual(result.map((song) => song.title), ["Popular Match", "Less Played Match"]);
});

test("uses snake_case recommendation metadata returned by the database API", () => {
  const databaseSongs = [
    { id: 1, title: "Queue Song", artist: "A", language: "English", file_url: "queue-song", genre: "Pop", sub_genre: "Dance Pop", mood: "Happy, Energetic", bpm: 120, play_count: 4 },
    { id: 2, title: "Database Match", artist: "B", language: "English", file_url: "database-match", genre: "Pop", sub_genre: "Dance Pop", mood: "Happy, Energetic", bpm: 124, play_count: 8 },
    { id: 3, title: "Database Mismatch", artist: "C", language: "English", file_url: "database-mismatch", genre: "Rock", sub_genre: "Hard Rock", mood: "Angry", bpm: 180, play_count: 100 },
  ];
  const databaseCatalog = createRecommendationCatalog(databaseSongs);
  const result = recommendSongs({
    songs: databaseSongs,
    queue: [databaseSongs[0]],
    catalog: databaseCatalog,
    limit: 2,
  });
  assert.equal(result[0].title, "Database Match");
});

test("does not let an unrelated popular song outrank a matching tier", () => {
  const songs = [
    { id: 2, title: "Similar", artist: "B", language: "English", file_url: "similar", play_count: 1 },
    { id: 3, title: "Different", artist: "C", language: "English", file_url: "different", play_count: 10000 },
  ];
  const result = recommendSongs({
    songs,
    queue: [{ song_id: 1, title: "Seed", artist: "A", language: "English", file_url: "seed" }],
    catalog,
    limit: 2,
  });
  assert.equal(result[0].title, "Similar");
});

test("holds previously shown songs out for five rotations", () => {
  const shown = [
    { id: 2, title: "Similar", language: "English" },
    { id: 3, title: "Different", language: "English" },
  ];
  let session = advanceRecommendationSession(
    createInitialRecommendationSession(),
    shown[0],
    shown,
  );
  const songs = [shown[1], { id: 7, title: "Fresh", language: "English", play_count: 1 }];
  assert.equal(recommendSongs({ songs, catalog, session, limit: 2 })[0].title, "Fresh");

  for (let index = 0; index < 4; index += 1) {
    session = advanceRecommendationSession(session, { id: 100 + index, title: `Choice ${index}`, language: "English" }, []);
  }
  assert.equal(recommendSongs({ songs, catalog, session, limit: 2 })[0].title, "Fresh");

  session = advanceRecommendationSession(session, { id: 200, title: "Choice 5", language: "English" }, []);
  assert.ok(recommendSongs({ songs, catalog, session, limit: 2 }).some((song) => song.title === "Different"));
});

test("switches the active recommendation language after a selection", () => {
  const session = advanceRecommendationSession(
    createInitialRecommendationSession(),
    { id: 4, title: "Hindi Match", artist: "D", language: "Hindi", file_url: "hindi" },
    [],
  );
  const songs = [
    { id: 2, title: "Similar", artist: "B", language: "English", file_url: "similar" },
    { id: 8, title: "Another Hindi", artist: "E", language: "Hindi", play_count: 0 },
  ];
  const result = recommendSongs({ songs, queue: [], language: "all", catalog, session, limit: 2 });
  assert.equal(result[0].language, "Hindi");
});

test("balances recommendations around the most frequent queue styles", () => {
  const profileMetadata = [
    { title: "Gabriela", language: "English", fileUrl: "gabriela", genre: "K-Pop, Pop", subGenre: "Dance Pop", mood: "Confident, Energetic" },
    { title: "Run BTS", language: "Korean", fileUrl: "run-bts", genre: "K-Pop, Hip-Hop", subGenre: "Pop Rap", mood: "Confident, Energetic" },
    { title: "Diyalo Diyala", language: "Telugu", fileUrl: "diyalo", genre: "Pop", subGenre: "Item, Dance Pop", mood: "Playful, Energetic" },
    { title: "Door Number Okati", language: "Telugu", fileUrl: "door", genre: "Pop", subGenre: "Item, Dance Pop", mood: "Playful, Energetic" },
    { title: "Priya Priya", language: "Telugu", fileUrl: "priya", genre: "Pop", subGenre: "Romantic Ballad", mood: "Romantic, Tender" },
    { title: "K-Pop Pick 1", language: "English", fileUrl: "kp1", genre: "K-Pop, Pop", subGenre: "Dance Pop", mood: "Confident, Energetic" },
    { title: "K-Pop Pick 2", language: "Korean", fileUrl: "kp2", genre: "K-Pop", subGenre: "Pop Rap", mood: "Energetic" },
    { title: "Item Pick 1", language: "Telugu", fileUrl: "it1", genre: "Pop", subGenre: "Item, Dance Pop", mood: "Playful, Energetic" },
    { title: "Item Pick 2", language: "Telugu", fileUrl: "it2", genre: "Pop", subGenre: "Item", mood: "Confident, Energetic" },
    { title: "Love Pick", language: "Telugu", fileUrl: "love", genre: "Pop", subGenre: "Romantic Ballad", mood: "Romantic, Tender" },
  ];
  const profileCatalog = createRecommendationCatalog(profileMetadata);
  const queue = profileMetadata.slice(0, 5).map((entry, index) => ({
    id: index + 1,
    title: entry.title,
    language: entry.language,
    file_url: entry.fileUrl,
  }));
  const songs = profileMetadata.slice(5).map((entry, index) => ({
    id: index + 20,
    title: entry.title,
    language: entry.language,
    file_url: entry.fileUrl,
  }));
  const result = recommendSongs({ songs, queue, catalog: profileCatalog, limit: 4 });
  assert.equal(result.filter((song) => song.title.startsWith("K-Pop")).length, 2);
  assert.equal(result.filter((song) => song.title.startsWith("Item")).length, 2);
  assert.ok(!result.some((song) => song.title === "Love Pick"));
});

test("uses repeated artists only for English recommendations", () => {
  const artistMetadata = [
    { title: "Taylor Queue 1", artist: "Taylor Swift", language: "English", fileUrl: "tq1", genre: "Pop, Rock", subGenre: "Pop Rock", mood: "Energetic, Defiant" },
    { title: "Taylor Queue 2", artist: "Taylor Swift", language: "English", fileUrl: "tq2", genre: "Pop", subGenre: "Synth Pop", mood: "Playful, Confident" },
    { title: "Taylor Queue 3", artist: "Taylor Swift", language: "English", fileUrl: "tq3", genre: "Pop", subGenre: "Folk Pop", mood: "Dramatic, Defiant" },
    { title: "Taylor Match", artist: "Taylor Swift", language: "English", fileUrl: "tm", genre: "Pop", subGenre: "Synth Pop", mood: "Confident, Defiant" },
    { title: "Other Artist Match", artist: "Other Artist", language: "English", fileUrl: "om", genre: "Pop, Rock", subGenre: "Pop Rock", mood: "Energetic, Defiant" },
  ];
  const artistCatalog = createRecommendationCatalog(artistMetadata);
  const queue = artistMetadata.slice(0, 3).map((entry, index) => ({
    id: index + 1,
    title: entry.title,
    artist: entry.artist,
    language: entry.language,
    file_url: entry.fileUrl,
  }));
  const songs = artistMetadata.slice(3).map((entry, index) => ({
    id: index + 20,
    title: entry.title,
    artist: entry.artist,
    language: entry.language,
    file_url: entry.fileUrl,
  }));
  const result = recommendSongs({ songs, queue, catalog: artistCatalog, limit: 2 });
  assert.equal(result[0].title, "Taylor Match");
});

test("allocates recommendation slots in proportion to queue languages", () => {
  const bilingualMetadata = [
    ...Array.from({ length: 4 }, (_, index) => ({ title: `Telugu Queue ${index}`, language: "Telugu", fileUrl: `tq${index}`, genre: "Pop", subGenre: "Dance Pop", mood: "Energetic" })),
    ...Array.from({ length: 3 }, (_, index) => ({ title: `English Queue ${index}`, artist: "Taylor Swift", language: "English", fileUrl: `eq${index}`, genre: "Pop", subGenre: "Synth Pop", mood: "Confident" })),
    ...Array.from({ length: 3 }, (_, index) => ({ title: `Telugu Pick ${index}`, language: "Telugu", fileUrl: `tp${index}`, genre: "Pop", subGenre: "Dance Pop", mood: "Energetic" })),
    ...Array.from({ length: 3 }, (_, index) => ({ title: `English Pick ${index}`, artist: "Taylor Swift", language: "English", fileUrl: `ep${index}`, genre: "Pop", subGenre: "Synth Pop", mood: "Confident" })),
  ];
  const bilingualCatalog = createRecommendationCatalog(bilingualMetadata);
  const queue = bilingualMetadata.slice(0, 7).map((entry, index) => ({ id: index + 1, ...entry, file_url: entry.fileUrl }));
  const songs = bilingualMetadata.slice(7).map((entry, index) => ({ id: index + 20, ...entry, file_url: entry.fileUrl }));
  const result = recommendSongs({ songs, queue, catalog: bilingualCatalog, limit: 4 });
  assert.equal(result.filter((song) => song.language === "Telugu").length, 2);
  assert.equal(result.filter((song) => song.language === "English").length, 2);
});
