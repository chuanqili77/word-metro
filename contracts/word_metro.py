# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json

SOURCE = "https://en.wiktionary.org/w/api.php?action=query&format=json&formatversion=2&titles="


def is_word(word: str) -> bool:
    return len(word) == 4 and all("a" <= c <= "z" for c in word)


def inspect(words: list[str]) -> list[int]:
    response = gl.nondet.web.get(SOURCE + "%7C".join(words))
    if response.status != 200:
        raise gl.UserError("Lexicon unavailable. Retry later.")
    payload = json.loads(response.body)
    found = {}
    for page in payload["query"]["pages"]:
        title = page["title"]
        if page.get("ns") != 0 or title not in words or title in found:
            raise gl.UserError("Unexpected lexicon page.")
        if page.get("missing") is True:
            found[title] = 0
        else:
            page_id = page.get("pageid")
            if type(page_id) is not int or page_id < 1:
                raise gl.UserError("Invalid lexicon record.")
            found[title] = page_id
    if len(found) != len(words):
        raise gl.UserError("Incomplete lexicon response.")
    return [found[word] for word in words]


class WordMetro(gl.Contract):
    count: u256
    races: TreeMap[u256, str]
    attempts: TreeMap[str, str]
    used: TreeMap[str, bool]

    def __init__(self):
        self.count = u256(0)

    @gl.public.view
    def race_count(self) -> u256:
        return self.count

    @gl.public.view
    def get_race(self, race_id: u256) -> str:
        return self.races.get(race_id, "")

    @gl.public.view
    def get_attempt(self, race_id: u256, number: u256) -> str:
        return self.attempts.get(str(race_id) + ":" + str(number), "")

    @gl.public.write
    def open_race(self, start: str, finish: str, steps: u256):
        if not is_word(start) or not is_word(finish) or start == finish:
            raise gl.UserError("Choose two distinct four-letter stations.")
        distance = sum(a != b for a, b in zip(start, finish))
        if steps < distance or steps > 6 or steps < 2:
            raise gl.UserError("Invalid route budget (2 to 6 moves).")
        words = [start, finish]
        def verify_words():
            return inspect(words)

        evidence = gl.eq_principle.strict_eq(verify_words)
        if 0 in evidence:
            raise gl.UserError("Both endpoints must exist in Wiktionary.")
        self.count = self.count + u256(1)
        self.races[self.count] = json.dumps({
            "start": start, "finish": finish, "steps": int(steps),
            "host": str(gl.message.sender_address), "winner": "",
            "phase": "OPEN", "attempts": 0, "endpoint_pages": evidence,
        })

    @gl.public.write
    def close_race(self, race_id: u256):
        race = self._open(race_id)
        if race["host"] != str(gl.message.sender_address):
            raise gl.UserError("Only the host can close this race.")
        race["phase"] = "CLOSED"
        self.races[race_id] = json.dumps(race)

    def _open(self, race_id: u256) -> dict:
        raw = self.races.get(race_id, "")
        if not raw:
            raise gl.UserError("Race does not exist.")
        race = json.loads(raw)
        if race["phase"] != "OPEN":
            raise gl.UserError("This race is over.")
        return race

    @gl.public.write
    def submit_route(self, race_id: u256, words: list[str]):
        race = self._open(race_id)
        player = str(gl.message.sender_address)
        if player == race["host"]:
            raise gl.UserError("The host cannot compete in this race.")
        if len(words) < 2 or len(words) > race["steps"] + 1:
            raise gl.UserError("Route exceeds the move budget.")
        if words[0] != race["start"] or words[-1] != race["finish"]:
            raise gl.UserError("Use the locked endpoints.")
        if any(not is_word(word) for word in words) or len(set(words)) != len(words):
            raise gl.UserError("Use unique four-letter stations.")
        if any(sum(a != b for a, b in zip(left, right)) != 1 for left, right in zip(words, words[1:])):
            raise gl.UserError("Change exactly one letter per move.")
        key = str(race_id) + ":" + player + ":" + ",".join(words)
        if self.used.get(key, False):
            raise gl.UserError("You already submitted this route.")
        def verify_words():
            return inspect(words)

        evidence = gl.eq_principle.strict_eq(verify_words)
        won = 0 not in evidence
        race["attempts"] += 1
        if won:
            race["phase"] = "SOLVED"
            race["winner"] = player
        self.attempts[str(race_id) + ":" + str(race["attempts"])] = json.dumps({
            "player": player, "words": words, "pages": evidence,
            "result": "CERTIFIED" if won else "MISSING_STATION",
        })
        self.used[key] = True
        self.races[race_id] = json.dumps(race)
