import unicodedata


def normalize_text(value: str) -> str:
    source = unicodedata.normalize("NFKD", str(value or "")).casefold()
    output = []
    previous_base_is_latin = False
    for char in source:
        if unicodedata.category(char).startswith("M"):
            if not previous_base_is_latin:
                output.append(char)
        elif char.isalnum():
            output.append(char)
            previous_base_is_latin = "LATIN" in unicodedata.name(char, "")
        else:
            output.append(" ")
            previous_base_is_latin = False
    return " ".join("".join(output).split())
