"""Offline unit tests. The equivalence stub intentionally cannot establish live finality."""
import json
from pathlib import Path
import runpy
import sys
from types import SimpleNamespace, ModuleType
import unittest
from unittest.mock import patch


class LexiconTests(unittest.TestCase):
    def setUp(self):
        sdk = ModuleType("genlayer")
        sdk.u256 = int
        sdk.TreeMap = dict
        self.response = None
        self.changed = None
        sdk.gl = SimpleNamespace(
            Contract=object, public=SimpleNamespace(view=lambda f: f, write=lambda f: f),
            UserError=ValueError, message=SimpleNamespace(sender_address="host"),
            nondet=SimpleNamespace(web=SimpleNamespace(get=lambda _: self.response)),
            eq_principle=SimpleNamespace(strict_eq=self.check),
        )
        self.gl = sdk.gl
        with patch.dict(sys.modules, {"genlayer": sdk}):
            self.code = runpy.run_path(str(Path(__file__).parents[1] / "contracts/word_metro.py"))
        self.game = self.code["WordMetro"]()
        self.game.races, self.game.attempts, self.game.used = {}, {}, {}

    def check(self, callback):
        proposed = callback()
        if self.changed is not None:
            self.response = self.changed
        if proposed != callback():
            raise ValueError("Nodes disagree")
        return proposed

    def lexicon(self, *words, missing=()):
        self.response = SimpleNamespace(status=200, body=json.dumps({"query": {"pages": [
            {"ns": 0, "title": word, **({"missing": True} if word in missing else {"pageid": i + 1})}
            for i, word in enumerate(reversed(words))
        ]}}))

    def test_missing_station_then_win(self):
        self.lexicon("cold", "warm")
        self.game.open_race("cold", "warm", 6)
        self.gl.message.sender_address = "player"
        rejected = ["cold", "xold", "xord", "cord", "card", "ward", "warm"]
        self.lexicon(*rejected, missing=("xold", "xord"))
        self.game.submit_route(1, rejected)
        self.assertEqual(json.loads(self.game.get_race(1))["phase"], "OPEN")
        self.assertEqual(json.loads(self.game.get_attempt(1, 1))["result"], "MISSING_STATION")
        with self.assertRaisesRegex(ValueError, "already submitted"):
            self.game.submit_route(1, rejected)
        accepted = ["cold", "cord", "card", "ward", "warm"]
        self.lexicon(*accepted)
        self.game.submit_route(1, accepted)
        self.assertEqual(json.loads(self.game.get_race(1))["winner"], "player")
        with self.assertRaisesRegex(ValueError, "race is over"):
            self.game.submit_route(1, accepted)

    def test_failure_is_not_missing(self):
        self.response = SimpleNamespace(status=503, body="")
        with self.assertRaisesRegex(ValueError, "unavailable"):
            self.game.open_race("cold", "warm", 6)
        self.lexicon("cold")
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            self.game.open_race("cold", "warm", 6)
        self.lexicon("cold", "warm")
        self.changed = self.response
        self.lexicon("cold", "warm", missing=("warm",))
        with self.assertRaisesRegex(ValueError, "disagree"):
            self.game.open_race("cold", "warm", 6)
        self.assertEqual(self.game.race_count(), 0)

    def test_roles_and_close(self):
        self.lexicon("cold", "warm")
        self.game.open_race("cold", "warm", 4)
        with self.assertRaisesRegex(ValueError, "host cannot compete"):
            self.game.submit_route(1, [])
        self.gl.message.sender_address = "player"
        with self.assertRaisesRegex(ValueError, "Only the host"):
            self.game.close_race(1)
        self.gl.message.sender_address = "host"
        self.game.close_race(1)
        self.assertEqual(json.loads(self.game.get_race(1))["phase"], "CLOSED")
