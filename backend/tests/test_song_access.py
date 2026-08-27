import unittest

from app.services.song_access_text import normalize_text


class SongAccessTests(unittest.TestCase):
    def test_normalize_text_is_case_accent_and_punctuation_insensitive(self):
        self.assertEqual(normalize_text("  Déjà-Vu! "), "deja vu")

    def test_normalize_text_preserves_non_latin_titles(self):
        self.assertEqual(normalize_text("బుట్ట బొమ్మ!"), "బుట్ట బొమ్మ")


if __name__ == "__main__":
    unittest.main()
