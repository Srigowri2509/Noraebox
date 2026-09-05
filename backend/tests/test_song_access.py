import unittest

from app.services.song_access_text import (
    is_confident_typo_match,
    is_generic_route_not_found,
    normalize_text,
    resolve_url_candidates,
)


class SongAccessTests(unittest.TestCase):
    def test_normalize_text_is_case_accent_and_punctuation_insensitive(self):
        self.assertEqual(normalize_text("  Déjà-Vu! "), "deja vu")

    def test_normalize_text_preserves_non_latin_titles(self):
        self.assertEqual(normalize_text("బుట్ట బొమ్మ!"), "బుట్ట బొమ్మ")

    def test_resolve_url_supports_base_without_api_suffix(self):
        self.assertEqual(
            resolve_url_candidates("https://bookings.example.com"),
            [
                "https://bookings.example.com/api/internal/tablet/song-access/resolve",
                "https://bookings.example.com/internal/tablet/song-access/resolve",
            ],
        )

    def test_resolve_url_avoids_double_api_suffix(self):
        self.assertEqual(
            resolve_url_candidates("https://bookings.example.com/api/"),
            [
                "https://bookings.example.com/api/internal/tablet/song-access/resolve",
            ],
        )

    def test_only_generic_404_is_treated_as_missing_route(self):
        self.assertTrue(is_generic_route_not_found(404, "Not Found"))
        self.assertFalse(is_generic_route_not_found(404, "Booking code not found."))
        self.assertFalse(is_generic_route_not_found(410, "This code is not active yet."))

    def test_title_typo_is_accepted_when_artist_matches(self):
        self.assertTrue(is_confident_typo_match(0.71, "Taylor swift", ["Taylor Swift"]))

    def test_title_typo_is_rejected_when_artist_does_not_match(self):
        self.assertFalse(is_confident_typo_match(0.71, "Taylor swift", ["Someone Else"]))

    def test_very_high_title_similarity_can_match_without_artist(self):
        self.assertTrue(is_confident_typo_match(0.92, "", []))


if __name__ == "__main__":
    unittest.main()
