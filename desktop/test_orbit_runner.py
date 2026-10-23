"""Headless regression tests for the desktop game.

Run from the repository root:
    python -m unittest discover -s desktop -p "test_*.py" -v
"""
import json
import os
import sys
import tempfile
import unittest

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pygame  # noqa: E402

import orbit_runner as orr  # noqa: E402


def mission(mid, progress=0, completed=False):
    template = next(m for m in orr.MISSION_POOL if m["id"] == mid)
    return dict(template, progress=progress, completed=completed)


class OrbitRunnerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        pygame.init()
        pygame.font.init()

    @classmethod
    def tearDownClass(cls):
        pygame.quit()

    def setUp(self):
        handle, self.save_path = tempfile.mkstemp(prefix="orbit_test_", suffix=".json")
        os.close(handle)
        orr.SAVE_FILE = self.save_path
        self.game = orr.Game(pygame.Surface((orr.W, orr.H)), orr.MockAdProvider())

    def tearDown(self):
        try:
            os.remove(self.save_path)
        except OSError:
            pass

    def reset_over(self, crystals, bank=0):
        self.game.save = orr.fresh_save()
        self.game.save["bank"] = bank
        self.game.ensure_missions()
        self.game.reset_run()
        self.game.buy_shield = False
        self.game.crystals = crystals
        self.game.state = orr.Game.OVER

    # ---- reward accounting ------------------------------------------------
    def test_death_banks_once(self):
        self.reset_over(5)
        self.game.die()
        self.assertEqual(self.game.save["bank"], 5)

    def test_continue_restart_keeps_crystals(self):
        self.reset_over(5)
        self.game.die()
        self.game.reward_continue()
        self.game.start_run()
        self.assertEqual(self.game.save["bank"], 5)

    def test_double_is_exactly_double(self):
        self.reset_over(5)
        self.game.die()
        self.game.reward_double()
        self.assertEqual(self.game.save["bank"], 10)
        self.assertEqual(self.game.crystals, 10)
        self.game.die()
        self.assertEqual(self.game.save["bank"], 10)

    def test_continue_then_double_is_still_double(self):
        self.reset_over(5)
        self.game.die()
        self.game.reward_continue()
        self.game.reward_double()
        self.game.die()
        self.assertEqual(self.game.save["bank"], 10)

    def test_new_crystals_after_continue_are_banked(self):
        self.reset_over(5)
        self.game.die()
        self.game.reward_continue()
        self.game.crystals += 2
        self.game.die()
        self.assertEqual(self.game.save["bank"], 7)

    def test_save_loader_handles_bad_shapes(self):
        with open(orr.SAVE_FILE, "w") as f:
            f.write("{}")
        loaded = orr.load_save()
        self.assertEqual(loaded["best"], 0)
        self.assertEqual(loaded["bank"], 0)
        self.assertEqual(loaded["ships"], ["scout"])
        self.assertEqual(loaded["stats"]["runs"], 0)

        with open(orr.SAVE_FILE, "w") as f:
            json.dump({"best": "oops", "bank": -3, "muted": True,
                       "ships": ["scout", "nope"], "ship": "nope",
                       "stats": {"runs": 4}}, f)
        loaded = orr.load_save()
        self.assertEqual(loaded["best"], 0)
        self.assertEqual(loaded["bank"], 0)
        self.assertTrue(loaded["muted"])
        self.assertEqual(loaded["ships"], ["scout"])
        self.assertEqual(loaded["ship"], "scout")
        self.assertEqual(loaded["stats"]["runs"], 4)

        with open(orr.SAVE_FILE, "w") as f:
            f.write("not json")
        self.assertEqual(orr.load_save()["best"], 0)

        # pre-v3 save migration
        with open(orr.SAVE_FILE, "w") as f:
            json.dump({"best": 3850, "bank": 70, "muted": False}, f)
        self.assertEqual(orr.load_save()["lifetime"], 385)

    # ---- mechanics --------------------------------------------------------
    def test_combo_decays(self):
        g = self.game
        g.start_run()
        g.combo = 4
        g.combo_t = 0.001
        g.update(0.01)
        self.assertEqual(g.combo, 1)

    def test_flare_dodge_scores(self):
        g = self.game
        g.start_run()
        g.elapsed = 30
        g.ring = 2
        g.ring_vis = float(orr.RINGS[2])
        g.invuln = 0
        g.flare_ring = 0
        g.flare_t = 0.001
        g.update(0.01)
        self.assertEqual(g.state, g.PLAY)
        self.assertEqual(g.flares_dodged, 1)

    def test_flare_on_ring_kills(self):
        g = self.game
        g.start_run()
        g.elapsed = 30
        g.ring = 0
        g.ring_vis = float(orr.RINGS[0])
        g.invuln = 0
        g.shield = False
        g.flare_ring = 0
        g.flare_t = 0.001
        g.update(0.01)
        self.assertEqual(g.state, g.OVER)

    def test_shield_absorbs_flare(self):
        g = self.game
        g.start_run()
        g.elapsed = 30
        g.ring = 0
        g.ring_vis = float(orr.RINGS[0])
        g.invuln = 0
        g.shield = True
        g.flare_ring = 0
        g.flare_t = 0.001
        g.update(0.01)
        self.assertEqual(g.state, g.PLAY)
        self.assertFalse(g.shield)

    def test_powerups_apply(self):
        g = self.game
        g.start_run()
        g.apply_powerup("magnet")
        self.assertEqual(g.magnet_t, orr.MAGNET_TIME)
        g.apply_powerup("slow")
        self.assertEqual(g.slow_t, orr.SLOW_TIME)
        g.shield = False
        g.apply_powerup("shield")
        self.assertTrue(g.shield)

    # ---- meta progression -------------------------------------------------
    def test_missions_complete_and_award_tokens(self):
        g = self.game
        g.save["missions"] = [mission("run_crystals")]
        g.crystal_gain = 15
        g.check_missions()
        self.assertTrue(g.save["missions"][0]["completed"])
        self.assertEqual(g.save["missions_done"], 1)
        self.assertGreaterEqual(g.save["bank"], 30)

        g.save["missions_done"] = 4
        g.save["continue_tokens"] = 0
        g.save["missions"] = [mission("run_level")]
        g.elapsed = 60
        g.check_missions()
        self.assertEqual(g.save["continue_tokens"], 1)

    def test_contract_and_ship_modifiers(self):
        g = self.game
        g.save["contract"] = "void"
        g.save["ships"] = ["scout", "warden", "drifter"]
        g.save["ship"] = "warden"
        g.start_run()
        self.assertEqual(g.crystal_mul, 2)
        self.assertAlmostEqual(g.meteor_mul, 1.25 * g.biome["meteor_speed"])
        self.assertGreater(g.combo_time, 6)
        self.assertTrue(g.shield)

    def test_daily_is_deterministic(self):
        g = self.game
        g.start_run("daily")
        first = (g.seed, g.contract["id"])
        g.start_run("daily")
        self.assertEqual(first, (g.seed, g.contract["id"]))

    def test_continue_token_skips_ad(self):
        g = self.game
        self.reset_over(5)
        g.die()
        g.save["free_continue_used"] = True
        g.save["continue_tokens"] = 1
        g.request_ad("continue")
        self.assertEqual(g.state, g.PLAY)
        self.assertEqual(g.save["continue_tokens"], 0)
        self.assertFalse(g.ads.showing)

    def test_first_continue_is_free(self):
        g = self.game
        self.reset_over(5)
        g.die()
        g.save["free_continue_used"] = False
        g.save["continue_tokens"] = 0
        g.request_ad("continue")
        self.assertEqual(g.state, g.PLAY)
        self.assertTrue(g.save["free_continue_used"])
        self.assertFalse(g.ads.showing)

    def test_ad_cap(self):
        g = self.game
        self.reset_over(5)
        g.die()
        g.save["free_continue_used"] = True
        g.ads_used = 4
        g.request_ad("double")
        self.assertFalse(g.ads.showing)
        self.assertIn("No ads left", g.message)

    def test_boss_clear_awards_and_tracks(self):
        g = self.game
        g.start_run()
        g.start_boss()
        self.assertIsNotNone(g.boss)
        g.boss["cores"] = 3
        g.clear_boss()
        self.assertIsNone(g.boss)
        self.assertEqual(g.save["stats"]["bosses"], 1)
        self.assertGreater(g.score, 0)

    def test_new_best_stores_ghost(self):
        g = self.game
        g.start_run()
        g.ghost_samples = [[0.0, 0.0, 110.0], [0.12, 1.0, 180.0]]
        g.score = 100
        g.die()
        self.assertEqual(g.save["ghost"]["score"], 100)
        self.assertEqual(len(g.save["ghost"]["samples"]), 2)

    def test_completed_missions_rotate(self):
        g = self.game
        g.save["missions"] = [mission("run_crystals", 15, True),
                              mission("run_near", 2), mission("run_level", 1)]
        old_id = g.save["missions"][0]["id"]
        g.start_run()
        self.assertEqual(len(g.save["missions"]), 3)
        self.assertNotEqual(g.save["missions"][0]["id"], old_id)
        self.assertFalse(g.save["missions"][0]["completed"])
        self.assertTrue(any(m["id"] == "run_near" for m in g.save["missions"]))


if __name__ == "__main__":
    unittest.main()
