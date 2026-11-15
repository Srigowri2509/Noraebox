import argparse
import csv
import json
import re
from pathlib import Path


DATE_SEPARATOR = re.compile(r"^\d{1,2}[-/]\d{1,2}[-/]\d{4}$")


def clean(value):
    return (value or "").strip()


def read_catalog(path, language, column_map, repair_album_language=False):
    entries = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        next(reader, None)
        for row_number, row in enumerate(reader, start=2):
            if not row:
                continue
            if len(row) <= max(column_map.values()):
                raise ValueError(f"{path.name}:{row_number} has only {len(row)} columns")

            title = clean(row[column_map["title"]])
            if not title or DATE_SEPARATOR.fullmatch(title):
                continue

            album = clean(row[column_map["album"]])
            row_language = clean(row[column_map["language"]])
            if repair_album_language and album.casefold() == language.casefold() and row_language.casefold() != language.casefold():
                album, row_language = row_language, album

            entry = {
                "title": title,
                "artist": clean(row[column_map["artist"]]),
                "album": album,
                "language": row_language or language,
                "fileUrl": clean(row[column_map["file_url"]]),
                "genre": clean(row[column_map["genre"]]),
                "subGenre": clean(row[column_map["sub_genre"]]),
                "mood": clean(row[column_map["mood"]]),
            }
            if not entry["genre"] and not entry["subGenre"] and not entry["mood"]:
                continue
            entries.append(entry)
    return entries


def read_json_catalog(path):
    payload = json.loads(path.read_text(encoding="utf-8"))
    headers = payload.get("headers") or payload.get("fields")
    if not headers or not isinstance(payload.get("rows"), list):
        raise ValueError(f"{path.name} is not a supported recommendation JSON file")
    index = {name.casefold(): position for position, name in enumerate(headers)}

    def column(row, *names):
        for name in names:
            position = index.get(name.casefold())
            if position is not None and position < len(row):
                return clean(row[position])
        return ""

    entries = []
    for row in payload["rows"]:
        title = column(row, "title")
        if not title or DATE_SEPARATOR.fullmatch(title):
            continue
        entry = {
            "title": title,
            "artist": column(row, "artist"),
            "album": column(row, "album"),
            "language": column(row, "language"),
            "fileUrl": column(row, "file_url"),
            "genre": column(row, "genre"),
            "subGenre": column(row, "sub-genre", "sub genre"),
            "mood": column(row, "mood"),
        }
        if entry["genre"] or entry["subGenre"] or entry["mood"]:
            entries.append(entry)
    return entries


def main():
    parser = argparse.ArgumentParser(description="Build the tablet recommendation metadata catalog.")
    parser.add_argument("--english", required=True, type=Path)
    parser.add_argument("--hindi", required=True, type=Path)
    parser.add_argument("--telugu", type=Path)
    parser.add_argument("--kpop", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    english = read_catalog(
        args.english,
        "English",
        {
            "title": 0,
            "artist": 1,
            "language": 3,
            "album": 4,
            "file_url": 5,
            "genre": 6,
            "sub_genre": 7,
            "mood": 8,
        },
        repair_album_language=True,
    )
    # The Hindi source has an intentionally unlabeled collection column at index 6.
    # Its final three values are Genre, Sub Genre, Mood despite the header order.
    hindi = read_catalog(
        args.hindi,
        "Hindi",
        {
            "title": 0,
            "artist": 1,
            "album": 3,
            "language": 4,
            "file_url": 5,
            "genre": 7,
            "sub_genre": 8,
            "mood": 9,
        },
    )

    telugu = read_json_catalog(args.telugu) if args.telugu else []
    kpop = read_json_catalog(args.kpop) if args.kpop else []
    catalog = english + hindi + telugu + kpop
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(json.dumps({
        "english": len(english),
        "hindi": len(hindi),
        "telugu": len(telugu),
        "kpop": len(kpop),
        "total": len(catalog),
    }))


if __name__ == "__main__":
    main()
