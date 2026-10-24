"""Unit tests for the score server. No network required."""
import os
import sys
import tempfile
import unittest
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import orbit_server as srv  # noqa: E402


def ranked_run(week="2026-W43", **overrides):
    run = {
        "runId": f"ranked-{week}-123456789",
        "mode": "ranked",
        "week": week,
        "date": srv._today(),
        "seed": srv.seed_for("ranked", week=week),
        "score": 2000,
        "time": 45.0,
        "crystals": 12,
        "level": 4,
        "maxCombo": 5,
        "nearMisses": 6,
        "flaresDodged": 1,
        "bossesCleared": 0,
        "continues": 0,
        "doubles": 0,
        "ship": "scout",
        "contract": "standard",
        "version": "3.1",
    }
    run.update(overrides)
    return run


class ServerTests(unittest.TestCase):
    def setUp(self):
        handle, self.db_path = tempfile.mkstemp(prefix="orbit_scores_", suffix=".db")
        os.close(handle)
        os.remove(self.db_path)
        self.old_db = srv.DB_PATH
        srv.DB_PATH = self.db_path
        srv.init_db()
        srv._RATE.clear()

    def tearDown(self):
        srv.DB_PATH = self.old_db
        for suffix in ("", "-wal", "-shm"):
            try:
                os.remove(self.db_path + suffix)
            except OSError:
                pass

    def store(self, run, user="u1", name="Alice"):
        run = srv.validate_run(run)
        with srv.database() as conn:
            srv.store_score(conn, user, name, "", run)
        return run

    def board(self, user="", limit=20, offset=0):
        with srv.database() as conn:
            return srv.board_response(conn, "ranked:2026-W43", user, limit, offset)

    def test_bearer_token_accepts_valid_header(self):
        handler = object.__new__(srv.Handler)
        handler.headers = {"Authorization": "Bearer facebook-test-token"}
        self.assertEqual(handler._bearer_token(), "facebook-test-token")

    def test_bearer_token_rejects_missing_header(self):
        handler = object.__new__(srv.Handler)
        handler.headers = {}
        with self.assertRaises(srv.ApiError) as context:
            handler._bearer_token()
        self.assertEqual(context.exception.status, 401)

    def test_bearer_token_rejects_malformed_header(self):
        handler = object.__new__(srv.Handler)
        for value in ("Basic abc", "Bearer", "Bearer   "):
            handler.headers = {"Authorization": value}
            with self.subTest(value=value), self.assertRaises(srv.ApiError) as context:
                handler._bearer_token()
            self.assertEqual(context.exception.status, 401)

    def test_legacy_query_token_is_not_used_for_friends_board(self):
        handler = object.__new__(srv.Handler)
        handler.headers = {}
        with self.assertRaises(srv.ApiError) as context:
            handler._leaderboard({"scope": ["friends"], "accessToken": ["legacy-token"]})
        self.assertEqual(context.exception.status, 401)

    def test_seed_matches_client_contract(self):
        self.assertEqual(srv.seed_for("ranked", week="2026-W43"), srv.fnv1a("orbit-ranked-2026-W43"))
        self.assertEqual(srv.seed_for("daily", day="2026-10-23"), srv.fnv1a("orbit-daily-2026-10-23"))
        self.assertEqual(srv.week_key(srv.datetime(2026, 10, 23).date()), "2026-W43")

    def test_valid_ranked_run(self):
        run = srv.validate_run(ranked_run())
        self.assertEqual(run["scopeKey"], "ranked:2026-W43")
        self.assertEqual(run["scope"], "weekly")
        self.assertEqual(run["score"], 2000)

    def test_valid_daily_run(self):
        day = srv._today()
        run = srv.validate_run(ranked_run(mode="daily", week="", date=day,
                                           seed=srv.seed_for("daily", day=day)))
        self.assertEqual(run["scopeKey"], "daily:" + day)
        self.assertEqual(run["scope"], "daily")

    def test_rejects_bad_seed(self):
        with self.assertRaises(srv.ApiError):
            srv.validate_run(ranked_run(seed=123))

    def test_rejects_continue_or_non_fixed_loadout(self):
        with self.assertRaises(srv.ApiError):
            srv.validate_run(ranked_run(continues=1))
        with self.assertRaises(srv.ApiError):
            srv.validate_run(ranked_run(ship="gambler"))

    def test_rejects_implausible_score(self):
        with self.assertRaises(srv.ApiError):
            srv.validate_run(ranked_run(score=90000, time=10))

    def test_rejects_future_daily(self):
        future = (srv.utc_today() + timedelta(days=3)).isoformat()
        with self.assertRaises(srv.ApiError):
            srv.validate_run(ranked_run(mode="daily", week="", date=future,
                                         seed=srv.seed_for("daily", day=future)))

    def test_store_and_rank(self):
        self.store(ranked_run(score=1000, runId="ranked-week-a-123456"), "u1", "Alice")
        self.store(ranked_run(score=3000, runId="ranked-week-b-123456"), "u2", "Bob")
        board = self.board("u1")
        self.assertEqual(board["entries"][0]["name"], "Bob")
        self.assertEqual(board["entries"][1]["name"], "Alice")
        self.assertEqual(board["you"]["rank"], 2)
        self.assertEqual(board["total"], 2)

    def test_keeps_only_best_score_per_user(self):
        self.store(ranked_run(score=1000, runId="ranked-week-a-123456"))
        self.store(ranked_run(score=500, runId="ranked-week-b-123456"))
        board = self.board("u1")
        self.assertEqual(board["entries"][0]["score"], 1000)
        self.assertEqual(board["total"], 1)

    def test_duplicate_run_id_is_rejected(self):
        self.store(ranked_run(runId="ranked-week-dup-123456"))
        with self.assertRaises(srv.ApiError) as context:
            self.store(ranked_run(runId="ranked-week-dup-123456"))
        self.assertEqual(context.exception.status, 409)

    def test_pagination_and_total(self):
        for i, score in enumerate((900, 800, 700)):
            self.store(ranked_run(score=score, runId=f"ranked-week-{i}-123456"),
                       f"u{i}", f"Player {i}")
        board = self.board(limit=1, offset=1)
        self.assertEqual(board["total"], 3)
        self.assertEqual(board["entries"][0]["rank"], 2)
        self.assertEqual(board["entries"][0]["score"], 800)

    def test_delete_user(self):
        self.store(ranked_run())
        with srv.database() as conn:
            srv.delete_user(conn, "u1")
        self.assertEqual(self.board()["total"], 0)

    def test_persistence_round_trip(self):
        self.store(ranked_run())
        board = self.board("u1")
        self.assertEqual(board["entries"][0]["score"], 2000)
        self.assertEqual(board["you"]["rank"], 1)

    def test_rate_limit(self):
        for _ in range(srv.MAX_SUBMISSIONS_PER_MINUTE):
            srv.check_rate("rate-user")
        with self.assertRaises(srv.ApiError):
            srv.check_rate("rate-user")

    def test_run_token_lifecycle(self):
        with srv.database() as conn:
            srv.ensure_user(conn, {"id": "u1", "name": "Alice", "picture": ""})
            token, expires = srv.issue_run_token(conn, "u1", "ranked", "2026-W43", "")
            self.assertGreater(expires, srv.time.time())
            srv.consume_run_token(conn, token, "u1", "ranked:2026-W43")
            with self.assertRaises(srv.ApiError):
                srv.consume_run_token(conn, token, "u1", "ranked:2026-W43")

    def test_run_token_wrong_scope_rejected(self):
        with srv.database() as conn:
            srv.ensure_user(conn, {"id": "u1", "name": "Alice", "picture": ""})
            token, _ = srv.issue_run_token(conn, "u1", "ranked", "2026-W43", "")
            with self.assertRaises(srv.ApiError):
                srv.consume_run_token(conn, token, "u1", "daily:2026-10-23")

    def test_league_assignment_and_board(self):
        for i in range(5):
            run = ranked_run(score=1000 + i * 500, runId=f"ranked-week-l{i}-123456")
            self.store(run, f"user{i}", f"Player {i}")
        with srv.database() as conn:
            for i in range(5):
                srv.ensure_user(conn, {"id": f"user{i}", "name": f"Player {i}", "picture": ""})
                srv._assign_league(conn, f"user{i}", "2026-W43")
            board = srv.league_board(conn, "user0", "2026-W43")
        self.assertEqual(board["total"], 5)
        self.assertEqual(board["entries"][0]["score"], 3000)
        self.assertEqual(board["league"]["name"], "ROOKIE")
        self.assertEqual(board["you"]["rank"], 5)

    def test_league_size_caps_at_thirty(self):
        with srv.database() as conn:
            for i in range(31):
                srv.ensure_user(conn, {"id": f"member{i}", "name": f"M{i}", "picture": ""})
                srv._assign_league(conn, f"member{i}", "2026-W43")
            counts = conn.execute(
                "SELECT league_id, COUNT(*) n FROM league_members WHERE week='2026-W43' GROUP BY league_id"
            ).fetchall()
        self.assertEqual(len(counts), 2)
        self.assertTrue(all(row["n"] <= 30 for row in counts))

    def test_ghost_round_trip(self):
        run = ranked_run(runId="ranked-week-ghost-123456")
        run = srv.validate_run(run)
        samples = [[0.0, 0.0, 180.0], [0.2, 1.0, 180.0]]
        with srv.database() as conn:
            srv.ensure_user(conn, {"id": "u1", "name": "Alice", "picture": ""})
            srv.store_score(conn, "u1", "Alice", "", run, ghost=samples, title="FLARE DODGER")
            ghost = srv.get_ghost(conn, "ranked:2026-W43")
            board = srv.board_response(conn, "ranked:2026-W43", "u1", 10, 0)
        self.assertEqual(ghost["score"], 2000)
        self.assertEqual(len(ghost["samples"]), 2)
        self.assertEqual(board["entries"][0]["title"], "FLARE DODGER")

    def test_events_are_stored(self):
        with srv.database() as conn:
            count = srv.store_events(conn, "u1", [
                {"name": "run_start", "props": {"mode": "ranked"}},
                {"name": "death", "props": {"cause": "flare"}},
            ])
            rows = conn.execute("SELECT name FROM events ORDER BY id").fetchall()
        self.assertEqual(count, 2)
        self.assertEqual([row["name"] for row in rows], ["run_start", "death"])

    def test_facebook_not_configured(self):
        if srv.FACEBOOK_APP_ID and srv.FACEBOOK_APP_SECRET:
            self.skipTest("Facebook credentials are configured in this environment")
        with self.assertRaises(srv.ApiError) as context:
            srv.verify_facebook("token")
        self.assertEqual(context.exception.status, 503)


if __name__ == "__main__":
    unittest.main()
