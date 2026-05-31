"""S3 key helpers shared by Lambda workers."""

LANGUAGE_FOLDER_PREFIX = "fixed_"
KNOWN_LANGUAGE_ROOTS = frozenset(
    {"Telugu", "Hindi", "Korean", "Punjabi", "English"}
)


def dest_key_for(source_key: str):
    """
    Map source key to destination key in noraebox-audio-storage-fixed.
    Returns None when the object should be skipped (e.g. updates/).
    """
    if source_key.startswith("updates/"):
        return None

    if "/" not in source_key:
        return source_key

    folder, remainder = source_key.split("/", 1)
    if folder.startswith(LANGUAGE_FOLDER_PREFIX):
        return source_key

    if folder in KNOWN_LANGUAGE_ROOTS:
        return f"{LANGUAGE_FOLDER_PREFIX}{folder}/{remainder}"

    return f"{LANGUAGE_FOLDER_PREFIX}{folder}/{remainder}"
